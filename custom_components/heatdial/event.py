"""Publish confirmed advice for user-configured notification automations."""

from homeassistant.components.event import EventEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import HeatDialEntry
from .coordinator import HeatDialCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: HeatDialEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    """Load the notification event entity."""
    async_add_entities([HeatDialAdjustment(entry)])


class HeatDialAdjustment(CoordinatorEntity[HeatDialCoordinator], EventEntity):
    """Fire when an adjustment has been confirmed and passes the cooldown."""

    _attr_has_entity_name = True
    _attr_translation_key = "adjustment"
    _attr_event_types = ["raise", "lower"]
    entity_id = "event.heatdial_adjustment"

    def __init__(self, entry: HeatDialEntry) -> None:
        super().__init__(entry.runtime_data)
        self._attr_unique_id = f"{entry.entry_id}_adjustment"
        self._seen: float | None = None

    @callback
    def _handle_coordinator_update(self) -> None:
        snapshot = self.coordinator.data
        if snapshot is not None and snapshot.notice is not None and snapshot.notice != self._seen:
            self._seen = snapshot.notice
            advice = snapshot.advice
            self._trigger_event(advice.action, {
                "from_dial": advice.dial,
                "to_dial": advice.recommended,
                "reason": advice.reason,
                "room": advice.room.entity_id if advice.room else None,
            })
        super()._handle_coordinator_update()
