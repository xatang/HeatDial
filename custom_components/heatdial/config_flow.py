"""Configure HeatDial using the HA UI."""

from collections.abc import Mapping
from dataclasses import asdict
from typing import Any

import probatio

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import CONF_DIAL, CONF_OUTDOOR, CONF_PRIMARY, CONF_SECONDARY, CONF_SHADOW, CONF_WEATHER, DOMAIN
from .engine import Settings, number

_DEFAULTS = {**asdict(Settings()), CONF_SECONDARY: [], CONF_SHADOW: True}
_TEMP = {"domain": "sensor", "device_class": "temperature"}


def _schema(current: Mapping[str, Any]) -> probatio.Schema:
    schema = {}
    for key, select, required in (
        (CONF_DIAL, selector.EntitySelector({"domain": ["input_number", "number", "sensor"]}), True),
        (CONF_OUTDOOR, selector.EntitySelector({"filter": [_TEMP]}), True),
        (CONF_WEATHER, selector.EntitySelector({"domain": "weather"}), False),
        (CONF_PRIMARY, selector.EntitySelector({"filter": [_TEMP], "multiple": True}), True),
        (CONF_SECONDARY, selector.EntitySelector({"filter": [_TEMP], "multiple": True}), False),
        (CONF_SHADOW, selector.BooleanSelector(), True),
    ):
        marker = probatio.Required if required else probatio.Optional
        options = {"description": {"suggested_value": current[key]}} if current.get(key) is not None else {}
        schema[marker(key, **options)] = select

    for key, default in asdict(Settings()).items():
        if key == "max_dial":
            minimum, maximum, step = 1, 12, 1
        elif key in ("day_min", "day_max", "night_min"):
            minimum, maximum, step = 10, 35, 0.5
        else:
            minimum, maximum, step = 0, 24, 1
        schema[probatio.Required(key, default=current.get(key, default))] = selector.NumberSelector(
            {"min": minimum, "max": maximum, "step": step, "mode": "box"}
        )
    return probatio.Schema(schema)


def _normalize(data: dict[str, Any]) -> tuple[dict, str | None]:
    normalized = {CONF_WEATHER: None, CONF_SECONDARY: [], **data}
    defaults = asdict(Settings())
    for key, default in defaults.items():
        value = number(data[key])
        if value is None or (isinstance(default, int) and not value.is_integer()):
            return normalized, "invalid_number"
        normalized[key] = type(default)(value)
    settings = Settings(**{key: normalized[key] for key in defaults})
    if not (
        0 <= settings.day_start <= settings.lower_from < settings.lower_until
        <= settings.evening_from < settings.evening_until <= 24
        and settings.lower_until <= settings.day_end <= 24
    ):
        return normalized, "invalid_schedule"
    if settings.night_min > settings.day_min or settings.day_max - settings.day_min < 1:
        return normalized, "invalid_range"
    inputs = [
        normalized[CONF_DIAL], normalized[CONF_OUTDOOR],
        *normalized[CONF_PRIMARY], *normalized[CONF_SECONDARY],
    ]
    if not normalized[CONF_PRIMARY] or len(set(inputs)) != len(inputs):
        return normalized, "duplicate_sensor"
    return normalized, None


class HeatDialConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create a HeatDial advisor."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        self._async_abort_entries_match({})
        current = {**_DEFAULTS, **(user_input or {})}
        errors = {}
        if user_input is not None:
            data, error = _normalize(user_input)
            if not error:
                return self.async_create_entry(title="HeatDial", data=data)
            errors["base"] = error
        return self.async_show_form(step_id="user", data_schema=_schema(current), errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return HeatDialOptionsFlow()


class HeatDialOptionsFlow(config_entries.OptionsFlowWithReload):
    """Edit sources and operating hours."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        current = {**_DEFAULTS, **self.config_entry.data, **self.config_entry.options}
        errors = {}
        if user_input is not None:
            data, error = _normalize(user_input)
            if not error:
                return self.async_create_entry(data=data)
            current = data
            errors["base"] = error
        return self.async_show_form(step_id="init", data_schema=_schema(current), errors=errors)
