"""Read HA entities and manage observation history and notification deduplication."""

import asyncio
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from functools import partial
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import (
    CONF_DIAL, CONF_DIAL_SCALE, CONF_OUTDOOR, CONF_PRIMARY, CONF_SECONDARY, CONF_SHADOW, CONF_WEATHER,
    DOMAIN, FORECAST_INTERVAL, FORECAST_MAX_AGE, SENSOR_MAX_AGE, UPDATE_INTERVAL,
)
from .engine import (
    HOUR, MINUTE, HISTORY_SECONDS, MAX_GAP, Advice, Point, Reading, Settings, Weather,
    confirm_advice, continuous, decide, dial_position, forecast_horizon, number,
    recorded_readings, resolve_scale, weather_signal,
)

_LOGGER = logging.getLogger(__name__)


def celsius(value: object, unit: str | None) -> float | None:
    """Normalize temperatures from HA temperature sensors or the weather action."""
    temp = number(value)
    if temp is None:
        return None
    if unit == "°F":
        return (temp - 32) * 5 / 9
    if unit == "K":
        return temp - 273.15
    if unit in (None, "°C"):
        return temp
    return None


@dataclass(frozen=True)
class Snapshot:
    advice: Advice
    weather: Weather
    rooms: dict[str, float | None]
    shadow: bool
    notice: float | None


class HeatDialCoordinator(DataUpdateCoordinator[Snapshot]):
    """Run the advisory policy on local observations and hourly weather."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=UPDATE_INTERVAL
        )
        self.config = {**entry.data, **entry.options}
        helper = hass.states.get(self.config[CONF_DIAL])
        self.scale = resolve_scale(
            self.config.get(CONF_DIAL_SCALE, ""), helper.attributes.get("max") if helper else None
        )
        self.settings = Settings(**{
            key: self.config[key]
            for key in Settings.__dataclass_fields__ if key in self.config and key != "max_dial"
        }, max_dial=len(self.scale))
        self.primary = tuple(self.config[CONF_PRIMARY])
        self.secondary = tuple(self.config.get(CONF_SECONDARY, ()))
        self.shadow = self.config.get(CONF_SHADOW, True)
        self._store = Store(hass, 1, f"{DOMAIN}.{entry.entry_id}")
        self._history: list[Reading] = []
        self._history_seeded = False
        self._last_dial: int | None = None
        self._last_dial_change: float | None = None
        self._notified: dict[str, float] = {}
        self._last_notice: float | None = None
        self._pending: tuple[int, float] | None = None
        self._forecast: list[Point] = []
        self._forecast_attempt: datetime | None = None
        self._forecast_time: datetime | None = None
        self._update_lock = asyncio.Lock()

    async def _async_setup(self) -> None:
        data = await self._store.async_load() or {}
        if data.get("sources") == self._sources():
            self._history = [Reading(**item) for item in data.get("history", [])]
            self._last_dial = data.get("last_dial")
            self._last_dial_change = data.get("last_dial_change")
            self._notified = data.get("notified", {})
            self._last_notice = data.get("last_notice")

    async def _async_seed_history(self) -> None:
        """Fill the initial trend window from the existing HA recorder."""
        if "recorder" not in self.hass.config.components:
            return
        from homeassistant.components.recorder import get_instance, history

        now = dt_util.utcnow()
        start = now - timedelta(seconds=HISTORY_SECONDS) - SENSOR_MAX_AGE
        dial_id = self.config[CONF_DIAL]
        outdoor_id = self.config[CONF_OUTDOOR]
        room_ids = (*self.primary, *self.secondary)
        archive = partial(
            history.get_significant_states, self.hass, start, now,
            [dial_id, outdoor_id, *room_ids], significant_changes_only=False,
        )
        try:
            async with asyncio.timeout(10):
                states = await get_instance(self.hass).async_add_executor_job(archive)
        except Exception as err:
            _LOGGER.debug("Recorder history unavailable during HeatDial setup: %s", err)
            return

        series = {}
        for key, rows in states.items():
            series[key] = []
            for state in rows:
                timestamp = state.last_updated.timestamp()
                if key == dial_id:
                    value = number(state.state)
                elif timestamp <= start.timestamp():
                    continue  # Recorder's start boundary is not a fresh temperature report.
                else:
                    value = celsius(state.state, state.attributes.get("unit_of_measurement"))
                series[key].append((timestamp, value))
        seeded, archived_dial = recorded_readings(
            now.timestamp(), int(UPDATE_INTERVAL.total_seconds()), SENSOR_MAX_AGE.total_seconds(),
            dial_id, outdoor_id, room_ids, series, self.settings.max_dial,
        )
        saved = continuous([
            item for item in self._history if all(key in item.rooms for key in self.primary)
        ])
        if not saved or now.timestamp() - saved[-1].time > MAX_GAP:
            saved = []
        cutoff = saved[0].time if saved else now.timestamp()
        self._history = [
            item for item in seeded if item.time < cutoff and all(key in item.rooms for key in self.primary)
        ] + saved
        if archived_dial is not None and (
            self._last_dial_change is None or archived_dial[1] > self._last_dial_change
        ):
            self._last_dial, self._last_dial_change = archived_dial

    def _sources(self) -> list:
        return [self.config[CONF_DIAL], self.config[CONF_OUTDOOR], list(self.primary), list(self.secondary)]

    def _stored_data(self) -> dict:
        return {
            "sources": self._sources(),
            "history": [asdict(item) for item in self._history],
            "last_dial": self._last_dial,
            "last_dial_change": self._last_dial_change,
            "notified": self._notified,
            "last_notice": self._last_notice,
        }

    async def async_save(self) -> None:
        """Flush learned observations on an explicit reload."""
        await self._store.async_save(self._stored_data())

    def _temperature(self, entity_id: str, now: datetime) -> float | None:
        state = self.hass.states.get(entity_id)
        if state is None or now - state.last_reported > SENSOR_MAX_AGE:
            return None
        return celsius(state.state, state.attributes.get("unit_of_measurement"))

    async def _async_forecast(self, now: datetime) -> tuple[list[Point], float | None]:
        entity_id = self.config.get(CONF_WEATHER)
        if not entity_id or (state := self.hass.states.get(entity_id)) is None:
            return [], None
        unit = state.attributes.get("temperature_unit")
        provider_now = celsius(state.attributes.get("temperature"), unit)
        if self._forecast_attempt is None or now - self._forecast_attempt >= FORECAST_INTERVAL:
            self._forecast_attempt = now
            try:
                async with asyncio.timeout(10):
                    response = await self.hass.services.async_call(
                        "weather", "get_forecasts", {"type": "hourly", "entity_id": entity_id},
                        blocking=True, return_response=True,
                    )
            except (HomeAssistantError, TimeoutError, ValueError) as err:
                _LOGGER.debug("Hourly forecast unavailable for %s: %s", entity_id, err)
            else:
                points = {}
                for item in (response or {}).get(entity_id, {}).get("forecast") or []:
                    when = dt_util.parse_datetime(str(item.get("datetime", "")))
                    temp = celsius(item.get("temperature"), unit)
                    if when is not None and when.tzinfo is not None and temp is not None:
                        points[when.timestamp()] = temp
                if points:
                    self._forecast = [Point(t, points[t]) for t in sorted(points)]
                    self._forecast_time = now
        if self._forecast_time is None or now - self._forecast_time > FORECAST_MAX_AGE:
            return [], None
        return self._forecast, provider_now

    def _notice(self, advice: Advice, now: datetime) -> float | None:
        if advice.action not in {"raise", "lower"} or not (
            self.settings.day_start <= now.hour < self.settings.evening_until
        ):
            return None
        key = f"{advice.dial}:{advice.recommended}"
        current = now.timestamp()
        if self.shadow or self.data is None:
            return None
        if current - self._notified.get(key, 0) < 8 * HOUR:
            return None
        if self._last_notice is not None and current - self._last_notice < 3 * HOUR:
            return None
        self._notified[key] = current
        self._last_notice = current
        return current

    async def _async_update_data(self) -> Snapshot:
        async with self._update_lock:
            return await self._async_read()

    async def _async_read(self) -> Snapshot:
        utc = dt_util.utcnow()
        rooms = {key: self._temperature(key, utc) for key in (*self.primary, *self.secondary)}
        has_primary = all(rooms[key] is not None for key in self.primary)
        if has_primary and not self._history_seeded:
            self._history_seeded = True
            await self._async_seed_history()
            utc = dt_util.utcnow()
        now = dt_util.as_local(utc)
        timestamp = now.timestamp()
        dial_state = self.hass.states.get(self.config[CONF_DIAL])
        dial = dial_position(dial_state.state if dial_state else None, self.settings.max_dial)
        if dial is not None and dial != self._last_dial:
            observed_change = min(timestamp, dial_state.last_changed.timestamp())
            if self._last_dial is not None:
                if self._history:
                    observed_change = max(observed_change, self._history[-1].time)
                self._notified.clear()
                self._pending = None
            self._last_dial = dial
            self._last_dial_change = observed_change

        outdoor = self._temperature(self.config[CONF_OUTDOOR], utc)
        current = Reading(timestamp, dial, outdoor, {key: val for key, val in rooms.items() if val is not None})
        self._history = [
            item for item in self._history if timestamp - HISTORY_SECONDS <= item.time < timestamp
        ]
        if has_primary:
            if self._history and timestamp - self._history[-1].time < MINUTE:
                self._history[-1] = current
            else:
                self._history.append(current)
            history = continuous(self._history)
        else:
            history = continuous([*self._history, current])
            self._pending = None
        if len(history) == 1:
            self._pending = None
        forecast, provider_now = await self._async_forecast(utc)
        weather = weather_signal(history, forecast, provider_now, forecast_horizon(now, self.settings))
        advice = decide(self.settings, now, history, self.primary, self.secondary, weather, self._last_dial_change)
        advice, self._pending = confirm_advice(advice, self._pending, timestamp)
        notice = self._notice(advice, now)
        self._store.async_delay_save(self._stored_data, 10)
        return Snapshot(advice, weather, rooms, self.shadow, notice)
