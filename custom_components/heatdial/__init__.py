"""HeatDial is an advisory integration for manually operated boilers."""

from homeassistant.components.frontend import async_remove_panel
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from .const import CONF_DIAL, DOMAIN
from .coordinator import HeatDialCoordinator
from .panel import PANEL_PATH, async_register_assets, async_register_heatdial_panel

type HeatDialEntry = ConfigEntry[HeatDialCoordinator]

PLATFORMS = (Platform.SENSOR, Platform.EVENT)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the integration's frontend assets once per HA process."""
    await async_register_assets(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: HeatDialEntry) -> bool:
    """Set up the advisor and its entities."""
    coordinator = HeatDialCoordinator(hass, entry)
    entry.runtime_data = coordinator
    await coordinator.async_config_entry_first_refresh()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await async_register_heatdial_panel(hass, entry)

    @callback
    def dial_changed(event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        if new is None or old is None or new.state != old.state:
            entry.async_create_task(hass, coordinator.async_refresh(), "Observe boiler dial")

    entry.async_on_unload(
        async_track_state_change_event(hass, coordinator.config[CONF_DIAL], dial_changed)
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: HeatDialEntry) -> bool:
    """Stop updates and persist the final observation on unload."""
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    async_remove_panel(hass, PANEL_PATH)
    await entry.runtime_data.async_save()
    return True


async def async_remove_entry(hass: HomeAssistant, entry: HeatDialEntry) -> None:
    """Remove stored readings and confirmation timestamps for this advisor."""
    await Store(hass, 1, f"{DOMAIN}.{entry.entry_id}").async_remove()
