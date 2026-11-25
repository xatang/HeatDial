"""Register the page opened from the HeatDial integration screen."""

from dataclasses import asdict
from pathlib import Path
from typing import TYPE_CHECKING

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.loader import async_get_integration

from .const import CONF_DIAL, CONF_OUTDOOR, CONF_WEATHER, DOMAIN
from .engine import TUNING_LIMITS

if TYPE_CHECKING:
    from . import HeatDialEntry

PANEL_PATH = "heatdial"
_ASSET_PATH = "/heatdial-assets"
_FILES = ("panel.js", "panel-style.js", "panel-text.js")


async def async_register_assets(hass: HomeAssistant) -> None:
    """Expose only the bundled client assets, with no CDN dependencies."""
    directory = Path(__file__).parent
    await hass.http.async_register_static_paths([
        StaticPathConfig(f"{_ASSET_PATH}/{name}", str(directory / name), False)
        for name in _FILES
    ])


async def async_register_heatdial_panel(hass: HomeAssistant, entry: "HeatDialEntry") -> None:
    """Attach the page to the integration's configuration screen."""
    coordinator = entry.runtime_data
    registry = er.async_get(hass)
    integration = await async_get_integration(hass, DOMAIN)
    config = {
        "entry_id": entry.entry_id,
        "settings": asdict(coordinator.settings),
        "tuning": asdict(coordinator.tuning),
        "tuning_limits": TUNING_LIMITS,
        "dial_scale": list(coordinator.scale),
        "shadow_mode": coordinator.shadow,
        "dial": coordinator.config[CONF_DIAL],
        "outdoor": coordinator.config[CONF_OUTDOOR],
        "weather": coordinator.config.get(CONF_WEATHER),
        "primary_rooms": list(coordinator.primary),
        "secondary_rooms": list(coordinator.secondary),
        "room_weights": coordinator.weights,
        "entities": {
            key: registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_{key}")
            for key in ("recommendation", "reason", "recommended_dial")
        },
    }
    await async_register_panel(
        hass,
        frontend_url_path=PANEL_PATH,
        webcomponent_name="heatdial-panel",
        sidebar_title="HeatDial",
        sidebar_icon="mdi:knob",
        module_url=f"{_ASSET_PATH}/panel.js?v={integration.version}",
        config=config,
        require_admin=True,
        config_panel_domain=DOMAIN,
    )
