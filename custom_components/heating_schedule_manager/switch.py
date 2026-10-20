"""Persisted global Away, shared with every card."""

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL
from .runtime import ScheduleConfigEntry
from .scheduler import Manager
from .validation import Invalid

PARALLEL_UPDATES = 1


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ScheduleConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Expose the existing Away identity using config-entry runtime data."""
    async_add_entities([AwaySwitch(entry.runtime_data)])


class AwaySwitch(SwitchEntity):
    """Translated, push-updated control for the manager's Away flag."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_translation_key = "away"
    _attr_unique_id = f"{DOMAIN}_away"

    def __init__(self, manager: Manager) -> None:
        self.manager = manager
        # Preserve the established default ID and registry unique ID on upgrades.
        self.entity_id = "switch.heating_schedule_away"

    @property
    def is_on(self) -> bool:
        return bool(self.manager.model["away"])

    @property
    def available(self) -> bool:
        return not self.manager.closed and self.manager.storage_error is None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"away_until": self.manager.model["away_until"]} if self.manager.model.get("away_until") else {}

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL, self.async_write_ha_state))

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._set(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._set(False)

    async def _set(self, enabled: bool) -> None:
        if self._context and self._context.user_id:
            user = await self.hass.auth.async_get_user(self._context.user_id)
            if not user or not user.is_admin:
                raise Unauthorized()
        try:
            await self.manager.set_away(enabled)
        except Invalid as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="invalid_action",
                translation_placeholders={"error": str(err)},
            ) from err
        except OSError as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="storage_unavailable",
            ) from err
        # A completed service action must expose the committed state immediately;
        # the coalesced dispatcher notification may run on the following loop turn.
        self.async_write_ha_state()
