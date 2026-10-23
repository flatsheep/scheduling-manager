"""One-time 1.x handover through HA Store and config/entity/device APIs."""

from copy import deepcopy
from typing import Any
from uuid import uuid4

from homeassistant.config_entries import ConfigEntry, ConfigEntryDisabler, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er, issue_registry as ir
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util
from homeassistant.util.hass_dict import HassKey

from .const import DOMAIN, VERSION
from .storage import inspect_store
from .validation import require, validate

# Old names exist only at the migration boundary, not as runtime aliases.
LEGACY_DOMAIN = "heating_schedule_manager"
LEGACY_AWAY = "switch.heating_schedule_away"
MIGRATION_KEY = "domain_migration"
BOOT_KEY: HassKey[str] = HassKey(f"{DOMAIN}_migration_boot")


def boot_id(hass: HomeAssistant) -> str:
    return hass.data.setdefault(BOOT_KEY, str(uuid4()))


async def load_store(hass: HomeAssistant, store: Store) -> dict[str, Any] | None:
    """Use the same corruption guard as normal startup before Store can recover."""
    await hass.async_add_executor_job(inspect_store, store.path)
    return await store.async_load()


def check_snapshot(snapshot: dict[str, Any]) -> None:
    require(snapshot.get("schema_version") == VERSION, "migration", "Unsupported saved schema")
    validate(snapshot.get("model", {}), snapshot.get("capabilities", {}))
    runtime = snapshot.get("runtime", {})
    require(isinstance(runtime, dict) and dt_util.parse_datetime(runtime.get("cursor", "")) is not None,
            "migration", "Invalid saved progress cursor")
    require(type(runtime.get("sequence")) is int, "migration", "Invalid saved command sequence")
    for field in ("normal", "pre_away", "away_logical", "pending", "errors"):
        require(isinstance(runtime.get(field), dict), "migration", "Invalid saved runtime journal")


def new_unique_id(value: str) -> str:
    return DOMAIN + value[len(LEGACY_DOMAIN):] if value.startswith(LEGACY_DOMAIN + "_") else value


def new_entity_id(value: str) -> str:
    if value == LEGACY_AWAY:
        return "switch.scheduling_manager_away"
    return value.replace(".heating_schedule_manager_", ".scheduling_manager_").replace(
        ".heating_schedule_", ".scheduling_manager_")


def legacy_devices(hass: HomeAssistant, entry_id: str) -> list:
    registry = dr.async_get(hass)
    parents = dr.async_entries_for_config_entry(registry, entry_id)
    children = getattr(dr, "async_entries_for_parent_device", None)
    return parents + ([child for parent in parents for child in children(registry, parent.id)] if children else [])


async def async_prepare(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Durably hand over a stopped source before the new manager starts timers."""
    sources = hass.config_entries.async_entries(LEGACY_DOMAIN)
    require(len(sources) <= 1, "migration", "Multiple old managers need manual resolution")
    source_id = entry.data.get("legacy_entry_id") or (sources[0].entry_id if sources else None)
    source = hass.config_entries.async_get_entry(source_id) if source_id else None
    legacy = Store(hass, VERSION, LEGACY_DOMAIN)
    source_data = await load_store(hass, legacy)
    target = Store(hass, VERSION, DOMAIN)
    saved = await load_store(hass, target)
    is_new_handover = saved is None
    marker = saved.get(MIGRATION_KEY) if saved is not None else None
    require(marker is None or isinstance(marker, dict), "migration", "Invalid migration receipt")
    if source is None and source_data is None and (marker is None or marker.get("state") == "complete"):
        if entry.data.get("legacy_entry_id") or entry.data.get("migration_pending"):
            data = dict(entry.data)
            data.pop("legacy_entry_id", None)
            data.pop("migration_pending", None)
            hass.config_entries.async_update_entry(entry, data=data)
        return False
    require(source is None or source.domain == LEGACY_DOMAIN, "migration", "Unexpected source integration")
    require(saved is None or (isinstance(marker, dict) and marker.get("owner") == entry.entry_id),
            "migration", "Both old and new schedules exist; refusing to overwrite either")
    if isinstance(marker, dict) and marker.get("state") == "complete":
        if source is not None:
            await hass.config_entries.async_set_disabled_by(source.entry_id, ConfigEntryDisabler.USER)
            require(source.state is not ConfigEntryState.LOADED, "migration", "Old scheduler could not be stopped")
        return True

    data = {**entry.data, "migration_pending": True}
    if source_id:
        data["legacy_entry_id"] = source_id
    hass.config_entries.async_update_entry(entry, data=data)
    if source is not None:
        # Persistently stop old ownership, including across an interrupted upgrade.
        await hass.config_entries.async_set_disabled_by(source.entry_id, ConfigEntryDisabler.USER)
        require(source.state is not ConfigEntryState.LOADED, "migration", "Old scheduler could not be stopped")
        source_data = await load_store(hass, legacy)
        if saved is None:
            hass.config_entries.async_update_entry(
                entry, options=dict(source.options), pref_disable_new_entities=source.pref_disable_new_entities,
                pref_disable_polling=source.pref_disable_polling,
            )

    if saved is None:
        require(isinstance(source_data, dict), "migration", "Old schedule data is missing; no empty replacement created")
        assert isinstance(source_data, dict)
        check_snapshot(source_data)
        saved = deepcopy(source_data)
        saved[MIGRATION_KEY] = {"owner": entry.entry_id, "source_entry": source_id,
                                "state": "prepared", "boot": boot_id(hass)}
        await target.async_save(saved)
    else:
        check_snapshot(saved)
        assert isinstance(marker, dict)
        source_id = marker["source_entry"]

    registry = er.async_get(hass)
    entities = er.async_entries_for_config_entry(registry, source_id) if source_id else []
    # Reject collisions before changing any registry identities.
    for entity in entities:
        domain = entity.entity_id.split(".", 1)[0]
        occupied = registry.async_get_entity_id(domain, DOMAIN, new_unique_id(entity.unique_id))
        require(occupied is None, "migration", "New entity identity already exists")
        destination = new_entity_id(entity.entity_id)
        require(destination == entity.entity_id or registry.async_get(destination) is None,
                "migration", "New entity ID already exists")

    devices = dr.async_get(hass)
    device_ids: dict[str, str] = {}
    if entities and saved[MIGRATION_KEY].get("boot") != boot_id(hass):
        saved[MIGRATION_KEY].update(boot=boot_id(hass), state="prepared")
        await target.async_save(saved)
    source_devices = legacy_devices(hass, source_id) if source_id and (is_new_handover or entities) else []
    for device in source_devices:
        identifiers = {(DOMAIN if domain == LEGACY_DOMAIN else domain, value) for domain, value in device.identifiers}
        parent_id = getattr(device, "parent_device_id", None)
        update: Any
        if parent_id:
            create_child = getattr(devices, "async_get_or_create_child")
            destination = create_child(
                config_entry_id=entry.entry_id, identifiers=identifiers, name=device.name,
                parent_device_id=device_ids[parent_id],
            )
            update = getattr(devices, "async_update_child_device")
        else:
            destination = devices.async_get_or_create(
                config_entry_id=entry.entry_id, identifiers=identifiers, name=device.name,
                entry_type=dr.DeviceEntryType.SERVICE,
            )
            update = devices.async_update_device
        device_ids[device.id] = destination.id
        update(destination.id, name_by_user=device.name_by_user, area_id=device.area_id, labels=set(device.labels),
               disabled_by=None if device.disabled_by == dr.DeviceEntryDisabler.CONFIG_ENTRY else device.disabled_by)
    for entity in entities:
        registry.async_update_entity_platform(
            entity.entity_id, DOMAIN, new_config_entry_id=entry.entry_id,
            new_unique_id=new_unique_id(entity.unique_id),
            new_device_id=device_ids.get(entity.device_id, entity.device_id),
        )
    # Complete partially migrated entries too if interrupted between registry writes.
    for migrated in er.async_entries_for_config_entry(registry, entry.entry_id):
        registry.async_update_entity(
            migrated.entity_id, new_entity_id=new_entity_id(migrated.entity_id),
            disabled_by=None if migrated.disabled_by == er.RegistryEntryDisabler.CONFIG_ENTRY else migrated.disabled_by,
        )
    return True


async def async_finish(hass: HomeAssistant, entry: ConfigEntry, manager) -> None:
    """Retire the source after a restart has committed HA's delayed registries."""
    async with manager.lock:
        marker = manager.snapshot.get(MIGRATION_KEY)
        if marker is None:
            return
        if marker.get("state") != "complete" and marker.get("boot") == boot_id(hass):
            candidate = deepcopy(manager.snapshot)
            candidate[MIGRATION_KEY]["state"] = "awaiting_restart"
            await manager._persist(candidate)
            ir.async_create_issue(hass, DOMAIN, "migration_restart", is_fixable=False,
                                  is_persistent=True, severity=ir.IssueSeverity.WARNING,
                                  translation_key="migration_restart")
            return
        # Keep a small completion receipt. If cleanup is interrupted, it proves
        # the canonical data already owns progress and must never be overwritten.
        if marker.get("state") != "complete":
            candidate = deepcopy(manager.snapshot)
            candidate[MIGRATION_KEY].update(state="complete")
            candidate[MIGRATION_KEY].pop("boot", None)
            await manager._persist(candidate)
        source_id = marker["source_entry"]
        if source_id and hass.config_entries.async_get_entry(source_id):
            await hass.config_entries.async_remove(source_id)
        await Store(hass, VERSION, LEGACY_DOMAIN).async_remove()
        data = dict(entry.data)
        data.pop("legacy_entry_id", None)
        data.pop("migration_pending", None)
        hass.config_entries.async_update_entry(entry, data=data)
        ir.async_delete_issue(hass, LEGACY_DOMAIN, "invalid_storage")
        ir.async_delete_issue(hass, DOMAIN, "migration_restart")
        for service in tuple(hass.services.async_services().get(LEGACY_DOMAIN, {})):
            hass.services.async_remove(LEGACY_DOMAIN, service)
