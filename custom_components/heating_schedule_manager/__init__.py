"""Scheduling Manager config-entry lifecycle."""

from json import JSONDecodeError

from homeassistant.const import Platform, __version__
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError, ConfigEntryNotReady
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .frontend import async_setup_assets, register_card, unregister_card
from .runtime import ScheduleConfigEntry
from .scheduler import Manager
from .validation import Invalid
from .websocket_api import register

PLATFORMS = [Platform.SWITCH, Platform.BINARY_SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register domain APIs and bundled card routes once across entry reloads."""
    register(hass)
    await async_setup_assets(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ScheduleConfigEntry) -> bool:
    """Initialize and validate the manager before exposing its runtime."""
    if tuple(int(part) for part in __version__.split(".")[:2]) < (2026, 7):
        raise ConfigEntryError(
            translation_domain=DOMAIN,
            translation_key="unsupported_version",
        )
    manager = Manager(hass)
    try:
        await manager.start()
        if manager.storage_error:
            raise OSError(manager.storage_error)
    except (Invalid, JSONDecodeError, UnicodeDecodeError, KeyError, TypeError) as err:
        await manager.stop()
        ir.async_create_issue(
            hass,
            DOMAIN,
            "invalid_storage",
            is_fixable=False,
            is_persistent=True,
            severity=ir.IssueSeverity.ERROR,
            translation_key="invalid_storage",
            translation_placeholders={"error": str(err)},
        )
        raise ConfigEntryError(
            translation_domain=DOMAIN,
            translation_key="invalid_storage",
            translation_placeholders={"error": str(err)},
        ) from err
    except OSError as err:
        await manager.stop()
        raise ConfigEntryNotReady(
            translation_domain=DOMAIN,
            translation_key="storage_unavailable",
        ) from err
    except BaseException:
        await manager.stop()
        raise
    entry.runtime_data = manager
    try:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
        register_card(hass)
    except BaseException:
        await manager.stop()
        del entry.runtime_data
        raise
    ir.async_delete_issue(hass, DOMAIN, "invalid_storage")
    manager._notify()
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ScheduleConfigEntry) -> bool:
    """Unload entity platforms before stopping and releasing the runtime."""
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    await entry.runtime_data.stop()
    unregister_card(hass)
    del entry.runtime_data
    return True
