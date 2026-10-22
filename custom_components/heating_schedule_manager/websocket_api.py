"""Authenticated API. Administrators mutate, entity-authorized users view."""

from collections.abc import Awaitable, Callable
from copy import deepcopy
from typing import Any

import voluptuous as vol

from homeassistant.auth.models import User
from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.components.websocket_api.connection import ActiveConnection
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN, SIGNAL
from .presentation import entity_locations
from .runtime import get_manager
from .scheduler import Manager
from .validation import Invalid


def visible(manager: Manager, user: User) -> dict[str, Any]:
    """Return an independent payload filtered by the authenticated user's access."""
    result = manager.public()
    model = result["model"]
    allowed = {
        key
        for key, setting in model["entity_settings"].items()
        if user.permissions.check_entity(setting["entity_id"], POLICY_READ)
    }
    model["entity_settings"] = {key: value for key, value in model["entity_settings"].items() if key in allowed}
    for section in model["schedules"]:
        section["entities"] = [member for member in section["entities"] if member["entity_key"] in allowed]
    model["schedules"] = [section for section in model["schedules"] if section["entities"]]
    visible_ids = {section["id"] for section in model["schedules"]}
    result["active_schedules"] = {key: value for key, value in result["active_schedules"].items() if key in visible_ids}
    result["locations"] = entity_locations(manager.hass, model["entity_settings"])
    result["status"] = {key: value for key, value in result["status"].items() if key in allowed}
    result["applying"] = any(
        key in allowed and key not in manager.snapshot["runtime"]["errors"]
        for key in manager.snapshot["runtime"]["pending"]
    )
    result["editable"] = user.is_admin
    return result


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get"})
@websocket_api.async_response
async def get(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    """Read the loaded config-entry manager."""
    manager = get_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_loaded", "Set up Scheduling Manager first")
        return
    connection.send_result(msg["id"], visible(manager, connection.user))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/capabilities"})
@websocket_api.async_response
async def capabilities(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    """Discover only capabilities visible to the requesting user."""
    manager = get_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_loaded", "Set up Scheduling Manager first")
        return
    connection.send_result(
        msg["id"],
        [
            deepcopy(cap)
            for eid, cap in manager.capabilities().items()
            if connection.user.permissions.check_entity(eid, POLICY_READ)
        ],
    )


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def subscribe(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    """Keep subscriptions valid across entry unload/reload without owning runtime."""

    @callback
    def updated() -> None:
        if manager := get_manager(hass):
            connection.send_event(msg["id"], visible(manager, connection.user))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL, updated)
    connection.send_result(msg["id"])
    updated()


async def mutation(
    hass: HomeAssistant,
    connection: ActiveConnection,
    msg: dict[str, Any],
    action: Callable[[Manager], Awaitable[Any]],
) -> None:
    """Authorize, validate and report a single atomic model operation."""
    if not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "Administrator required")
        return
    manager = get_manager(hass)
    if manager is None:
        connection.send_error(msg["id"], "not_loaded", "Set up Scheduling Manager first")
        return
    try:
        await action(manager)
    except Invalid as err:
        code = "conflict" if err.path == "revision" else "validation"
        connection.send_error(msg["id"], code, str(err))
    except Exception as err:
        connection.send_error(msg["id"], "operation_failed", str(err))
    else:
        connection.send_result(msg["id"], visible(manager, connection.user))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/save_section",
        vol.Required("expected_revision"): vol.All(int, vol.Range(min=0)),
        vol.Required("operation"): vol.In(["upsert", "delete"]),
        vol.Required("section_id"): str,
        vol.Optional("section"): dict,
        vol.Optional("settings", default={}): dict,
    }
)
@websocket_api.async_response
async def save(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    """Apply the explicit section edit; never replace unrelated sections."""
    await mutation(
        hass,
        connection,
        msg,
        lambda manager: manager.save_section(
            msg["expected_revision"], msg["operation"], msg["section_id"], msg.get("section"), msg["settings"]
        ),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_away",
        vol.Required("away"): bool,
        vol.Required("expected_revision"): vol.All(int, vol.Range(min=0)),
        vol.Optional("until"): vol.Any(None, str),
    }
)
@websocket_api.async_response
async def away(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    """Change Away through the same manager operation as the switch."""
    options = {"until": msg["until"]} if "until" in msg else {}
    await mutation(
        hass,
        connection,
        msg,
        lambda manager: manager.set_away(msg["away"], msg["expected_revision"], defer_dispatch=True, **options),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_section_enabled",
        vol.Required("expected_revision"): vol.All(int, vol.Range(min=0)),
        vol.Required("section_id"): str,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def section_enabled(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    """Use explicit immediate Enable/Disable semantics."""
    await mutation(
        hass,
        connection,
        msg,
        lambda manager: manager.set_section_enabled(
            msg["expected_revision"], msg["section_id"], msg["enabled"], defer_dispatch=True
        ),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/enable_band",
        vol.Required("expected_revision"): vol.All(int, vol.Range(min=0)),
        vol.Required("section_id"): str,
        vol.Required("band_id"): str,
    }
)
@websocket_api.async_response
async def enable_band(hass: HomeAssistant, connection: ActiveConnection, msg: dict[str, Any]) -> None:
    """Enable a saved band immediately, resuming its start settings if active."""
    await mutation(
        hass,
        connection,
        msg,
        lambda manager: manager.enable_band(
            msg["expected_revision"], msg["section_id"], msg["band_id"], defer_dispatch=True
        ),
    )


def register(hass: HomeAssistant) -> None:
    """Register domain handlers once in async_setup, before any entry runtime."""
    for handler in (get, capabilities, subscribe, save, away, section_enabled, enable_band):
        websocket_api.async_register_command(hass, handler)
