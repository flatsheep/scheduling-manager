"""Read-only location metadata for authorized schedule memberships."""

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr


def entity_locations(hass: HomeAssistant, settings: dict[str, Any]) -> dict[str, dict[str, str | None]]:
    """Apply entity Area overrides, device inheritance and Area-to-Floor links."""
    result: dict[str, dict[str, str | None]] = {}
    registry = er.async_get(hass)
    for key, setting in settings.items():
        entry = registry.async_get(setting["entity_id"])
        area_id = entry.area_id if entry else None
        if entry and not area_id and entry.device_id:
            device = dr.async_get(hass).async_get(entry.device_id)
            area_id = device.area_id if device else None
        area = ar.async_get(hass).async_get_area(area_id) if area_id else None
        floor = fr.async_get(hass).async_get_floor(area.floor_id) if area and area.floor_id else None
        result[key] = {
            "area_id": area.id if area else None,
            "area_name": area.name if area else None,
            "floor_id": floor.floor_id if floor else None,
            "floor_name": floor.name if floor else None,
        }
    return result
