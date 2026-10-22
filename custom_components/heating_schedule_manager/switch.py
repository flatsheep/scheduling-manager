"""Push-updated Away and per-schedule/band Disabled controls."""

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import slugify

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
    """Keep Away's identity and reconcile UUID-backed controls after each Save."""
    async_add_entities([AwaySwitch(entry.runtime_data)])
    entities: dict[str, DisabledSwitch] = {}

    @callback
    def sync() -> None:
        targets = entry.runtime_data.control_states()
        registry = er.async_get(hass)
        for key in entities.keys() - targets.keys():
            entity = entities.pop(key)
            if registry.async_get(entity.entity_id):
                registry.async_remove(entity.entity_id)
            else:
                hass.async_create_task(entity.async_remove(force_remove=True))
        new = []
        for key, target in targets.items():
            if key in entities:
                entities[key].update_target(target)
            else:
                entities[key] = DisabledSwitch(entry.runtime_data, key, target)
                new.append(entities[key])
        if new:
            async_add_entities(new)

    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL, sync))
    sync()


class DisabledSwitch(SwitchEntity):
    """On means effectively disabled; turning off clears only this object's flag."""

    _attr_should_poll = False
    _attr_icon = "mdi:calendar-remove"

    def __init__(self, manager: Manager, key: str, target: dict[str, Any]) -> None:
        self.manager = manager
        self.key = key
        self.target = target
        self._attr_unique_id = f"{DOMAIN}_disabled_{key}"
        self.entity_id = "switch." + slugify(target["path"])

    @property
    def name(self) -> str:
        label = self.target["schedule_name"]
        if self.target["kind"] == "band":
            label += f" {self.target['sub_schedule_name']} {self.target['path'].split('.')[-2]}"
        return label + " disabled"

    @property
    def is_on(self) -> bool:
        return bool(self.target["disabled"])

    @property
    def available(self) -> bool:
        return not self.manager.closed and self.manager.storage_error is None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return dict(self.target)

    @callback
    def update_target(self, target: dict[str, Any]) -> None:
        self.target = target
        if self.hass:
            self.async_write_ha_state()

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self._set(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self._set(False)

    async def _set(self, disabled: bool) -> None:
        if self._context and self._context.user_id:
            user = await self.hass.auth.async_get_user(self._context.user_id)
            if not user or not user.is_admin:
                raise Unauthorized()
        try:
            target = self.manager.control_states().get(self.key)
            if target is None:
                raise Invalid("path", "Control no longer exists")
            await self.manager.set_disabled(target["path"], disabled)
        except Invalid as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="invalid_action",
                translation_placeholders={"error": str(err)},
            ) from err
        except OSError as err:
            raise HomeAssistantError(translation_domain=DOMAIN, translation_key="storage_unavailable") from err
        self.update_target(self.manager.control_states()[self.key])


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
