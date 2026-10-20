"""Diagnostic counts and timing without user names, identities or state values."""

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.components.diagnostics import async_redact_data

from .runtime import ScheduleConfigEntry

TO_REDACT = {
    "entity_id",
    "registry_id",
    "name",
    "category",
    "message",
    "storage_error",
    "away_until",
    "start_state",
    "end_state",
    "state",
    "temperature",
    "target",
    "setback",
}


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ScheduleConfigEntry) -> dict[str, Any]:
    """Recursively redact all configuration and journal copies of user data."""
    manager = entry.runtime_data
    snapshot = async_redact_data(manager.snapshot, TO_REDACT)
    snapshot["capabilities"] = {"cached_entities": len(manager.snapshot["capabilities"])}
    snapshot["storage_error"] = "**REDACTED**" if manager.storage_error else None
    return snapshot
