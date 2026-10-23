"""Push-updated Away and per-schedule/band Disabled controls."""

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, Unauthorized
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import device_registry as dr
from homeassistant.util import slugify

from .const import DOMAIN, SIGNAL
from .runtime import ScheduleConfigEntry
from .scheduler import Manager
from .validation import Invalid

PARALLEL_UPDATES = 1


def entry_devices(registry, entry_id):
    """HA's config-entry lookup returns main devices only, even on child-aware Core."""
    parents = dr.async_entries_for_config_entry(registry, entry_id)
    children = getattr(dr, "async_entries_for_parent_device", None)
    return parents + ([child for parent in parents for child in children(registry, parent.id)] if children else [])


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
        devices = dr.async_get(hass)
        device_ids: dict[str, str] = {}
        # Register parents first. Services are valid registry devices; no false
        # gateway/via_device relationship is used for these logical controls.
        for target in targets.values():
            if target["kind"] == "schedule":
                parent = devices.async_get_or_create(
                    config_entry_id=entry.entry_id,
                    identifiers={(DOMAIN, "schedule_" + target["schedule_id"])},
                    name=target["schedule_name"],
                    entry_type=dr.DeviceEntryType.SERVICE,
                )
                device_ids[target["id"]] = parent.id
        for target in targets.values():
            if target["kind"] == "sub_schedule":
                info = {
                    "config_entry_id": entry.entry_id,
                    "identifiers": {(DOMAIN, "sub_schedule_" + target["sub_schedule_id"])},
                    "name": target["sub_schedule_name"],
                }
                create_child = getattr(devices, "async_get_or_create_child", None)
                if create_child is not None:
                    device = create_child(**info, parent_device_id=device_ids[target["schedule_id"]])
                else:
                    info["name"] = f"{target['schedule_name']} {target['sub_schedule_name']}"
                    device = devices.async_get_or_create(**info, entry_type=dr.DeviceEntryType.SERVICE)
                device_ids[target["id"]] = device.id
        for key, target in targets.items():
            target["device_id"] = device_ids[target.get("sub_schedule_id", target["schedule_id"])]
        # Reconcile persisted entries too, including deletions while unloaded.
        for registered in er.async_entries_for_config_entry(registry, entry.entry_id):
            if registered.unique_id.startswith(f"{DOMAIN}_disabled_"):
                key = registered.unique_id.removeprefix(f"{DOMAIN}_disabled_")
                if key not in targets:
                    registry.async_remove(registered.entity_id)
                elif registered.device_id != targets[key]["device_id"]:
                    registry.async_update_entity(registered.entity_id, device_id=targets[key]["device_id"])
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
        live_devices = set(device_ids.values())
        for device in reversed(entry_devices(devices, entry.entry_id)):
            if device.id not in live_devices and any(
                domain == DOMAIN and identifier.startswith(("schedule_", "sub_schedule_"))
                for domain, identifier in device.identifiers
            ):
                devices.async_remove_device(device.id)

    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL, sync))
    sync()


class DisabledSwitch(SwitchEntity):
    """On means effectively disabled; turning off clears only this object's flag."""

    _attr_should_poll = False
    _attr_icon = "mdi:calendar-remove"
    _attr_has_entity_name = True

    def __init__(self, manager: Manager, key: str, target: dict[str, Any]) -> None:
        self.manager = manager
        self.key = key
        self.target = target
        self._attr_unique_id = f"{DOMAIN}_disabled_{key}"
        self.entity_id = "switch." + slugify(target["path"])

    @property
    def name(self) -> str:
        if self.target["kind"] != "band":
            return "Disabled"

        def display(value: str) -> str:
            return value[:2] + ":" + value[2:] if value.isdecimal() else value.replace("-", " ")

        return f"Start {display(self.target['start'])} Stop {display(self.target['stop'])} disabled"

    async def async_added_to_hass(self) -> None:
        """Attach without replacing the registry identity or user customisations."""
        if device_id := self.target.get("device_id"):
            er.async_get(self.hass).async_update_entity(self.entity_id, device_id=device_id)

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
