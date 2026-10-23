"""Read-only Home Assistant entities for saved schedule sections."""

from copy import deepcopy
from typing import Any

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL
from .runtime import ScheduleConfigEntry
from .scheduler import Manager, away_for, climate

DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def section_attributes(manager: Manager, section: dict[str, Any], activity: dict[str, Any]) -> dict[str, Any]:
    """Return the documented, read-only representation of a schedule section."""
    settings = manager.model["entity_settings"]
    members = []
    for member in section["entities"]:
        setting = settings[member["entity_key"]]
        entry: dict[str, Any] = {"entity_id": setting["entity_id"]}
        if climate(manager.model, member["entity_key"]):
            entry["start"] = {"temperature": deepcopy(member["target"])}
            entry["end"] = {"temperature": deepcopy(setting["setback"])}
        else:
            entry["start"] = {"state": member["start_state"]}
            entry["end"] = {"state": member["end_state"]}
            if "start_unit" in member:
                entry["start"]["unit"] = member["start_unit"]
            if "end_unit" in member:
                entry["end"]["unit"] = member["end_unit"]
        members.append(entry)
    return {
        "schedule_id": section["id"],
        "name": section["name"],
        "category": section.get("category"),
        "enabled": section.get("enabled", True),
        "away_enabled": section.get("away_enabled", True),
        "suspended_by_away": away_for(manager.model, section),
        "members": members,
        "sub_schedules": [
            {
                "id": sub["id"],
                "name": sub.get("name"),
                "days": [DAYS[day] for day in sub["days"]],
                "bands": [
                    {
                        "id": band["id"],
                        "start_minute": band["start_minute"],
                        "end_minute": band["end_minute"],
                        "start_dynamic": deepcopy(band.get("start_dynamic")),
                        "end_dynamic": deepcopy(band.get("end_dynamic")),
                        "enabled": band.get("enabled", True),
                        "disabled_until": band.get("disabled_until"),
                    }
                    for band in sub["bands"]
                ],
            }
            for sub in section["sub_schedules"]
        ],
        "next_transition": activity["next_transition"],
    }


class ScheduleBinarySensor(BinarySensorEntity):
    """Expose a schedule's effective active state without controlling it."""

    _attr_should_poll = False
    _attr_icon = "mdi:calendar-clock"

    def __init__(self, manager: Manager, section_id: str, activity: dict[str, Any]) -> None:
        self.manager = manager
        self.section_id = section_id
        self._activity = activity
        section = self._section
        self._attr_unique_id = f"{DOMAIN}_{section_id}"
        self._attr_name = f"Schedule {section['name']}"

    @property
    def _section(self) -> dict[str, Any]:
        return next(section for section in self.manager.model["schedules"] if section["id"] == self.section_id)

    @property
    def available(self) -> bool:
        return not self.manager.closed and self.manager.storage_error is None

    @property
    def is_on(self) -> bool:
        return self._activity["active"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return section_attributes(self.manager, self._section, self._activity)

    @callback
    def update_activity(self, activity: dict[str, Any]) -> None:
        """Push a shared manager refresh into this entity."""
        self._activity = activity
        self.async_write_ha_state()


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ScheduleConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create and reconcile entities as schedule sections are saved or deleted."""
    manager = entry.runtime_data
    entities: dict[str, ScheduleBinarySensor] = {}

    @callback
    def sync() -> None:
        activity = manager.schedule_activity()
        section_ids = set(activity)
        existing_ids = set(entities)
        for section_id in existing_ids & section_ids:
            entities[section_id].update_activity(activity[section_id])
        for section_id in existing_ids - section_ids:
            sensor = entities.pop(section_id)
            hass.async_create_task(sensor.async_remove(force_remove=True))
        new_entities = []
        for section_id in section_ids - existing_ids:
            sensor = ScheduleBinarySensor(manager, section_id, activity[section_id])
            entities[section_id] = sensor
            new_entities.append(sensor)
        if new_entities:
            async_add_entities(new_entities)

    activity = manager.schedule_activity()
    for section_id, state in activity.items():
        entities[section_id] = ScheduleBinarySensor(manager, section_id, state)
    if entities:
        async_add_entities(entities.values())
    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL, sync))
