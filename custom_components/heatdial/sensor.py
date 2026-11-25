"""Publish HeatDial recommendations and reasons as Home Assistant sensors."""

from collections.abc import Mapping
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import HeatDialEntry
from .coordinator import HeatDialCoordinator

_REASONS = [
    "dial_unavailable", "room_unavailable", "collecting", "settling", "airing",
    "dial_limit", "room_conflict", "room_cold", "secondary_cold", "overnight_cold",
    "room_hot", "warming_outside", "within_range", "monitoring", "confirming",
]


async def async_setup_entry(
    hass: HomeAssistant, entry: HeatDialEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    """Load the recommendation, dial and reason."""
    async_add_entities(
        HeatDialSensor(entry, key) for key in ("recommendation", "recommended_dial", "reason")
    )


class HeatDialSensor(CoordinatorEntity[HeatDialCoordinator], SensorEntity):
    """Expose one part of the current recommendation."""

    _attr_has_entity_name = True

    def __init__(self, entry: HeatDialEntry, key: str) -> None:
        super().__init__(entry.runtime_data)
        self.entity_id = f"sensor.heatdial_{key}"
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_translation_key = self._key = key
        if key != "recommended_dial":
            self._attr_device_class = SensorDeviceClass.ENUM
            self._attr_options = {
                "recommendation": ["hold", "raise", "lower", "wait"],
                "reason": _REASONS,
            }[key]

    @property
    def native_value(self) -> str | int | None:
        """Return the field for this entity."""
        advice = self.coordinator.data.advice
        return {
            "recommendation": advice.action,
            "recommended_dial": advice.recommended,
            "reason": advice.reason,
        }[self._key]

    @property
    def extra_state_attributes(self) -> Mapping[str, Any] | None:
        """Expose the evidence for the recommendation."""
        if self._key != "recommendation":
            return None
        snapshot = self.coordinator.data
        advice, weather = snapshot.advice, snapshot.weather
        result = {
            "current_dial": advice.dial,
            "recommended_dial": advice.recommended,
            "reason": advice.reason,
            "shadow_mode": snapshot.shadow,
            "room_temperatures_c": {
                key: round(value, 2) if value is not None else None
                for key, value in snapshot.rooms.items()
            },
        }
        for key, value in (
            ("outdoor_temperature_c", weather.outdoor),
            ("outdoor_change_4h_c", weather.recent_change),
            ("forecast_sustained_low_c", weather.low),
            ("forecast_end_c", weather.end),
        ):
            if value is not None:
                result[key] = round(value, 2)
        if advice.room is not None:
            result["reason_room"] = advice.room.entity_id
            result["reason_room_temperature_c"] = round(advice.room.temperature, 2)
            if advice.room.delta is not None:
                result[f"reason_room_change_{advice.room.trend_hours}h_c"] = round(advice.room.delta, 2)
        return result
