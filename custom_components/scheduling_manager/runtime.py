"""Typed config-entry ownership and lookup for the single local manager."""

from typing import cast

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .scheduler import Manager

type ScheduleConfigEntry = ConfigEntry[Manager]


def get_manager(hass: HomeAssistant) -> Manager | None:
    """Return only a live, initialized config-entry runtime."""
    for entry in hass.config_entries.async_entries(DOMAIN):
        manager = getattr(cast(ScheduleConfigEntry, entry), "runtime_data", None)
        if isinstance(manager, Manager) and not manager.closed:
            return manager
    return None
