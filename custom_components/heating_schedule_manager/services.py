"""Boolean path actions for HA automations, scripts and authenticated API clients."""

from typing import Any

import voluptuous as vol

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, Unauthorized

from .const import DOMAIN
from .runtime import get_manager
from .validation import Invalid


async def async_register(hass: HomeAssistant) -> None:
    """Register once; handlers resolve the live config-entry manager each call."""

    async def handle(call: ServiceCall) -> dict[str, Any]:
        user = None
        if call.context.user_id:
            user = await hass.auth.async_get_user(call.context.user_id)
            if user is None or (call.service == "set_disabled" and not user.is_admin):
                raise Unauthorized()
        manager = get_manager(hass)
        if manager is None:
            raise HomeAssistantError("Set up Scheduling Manager first")
        try:
            if call.service == "set_disabled":
                await manager.set_disabled(call.data["path"], call.data["disabled"])
            states = manager.control_states()
            if user is not None and not user.is_admin:
                allowed = {
                    section["id"]
                    for section in manager.model["schedules"]
                    if any(
                        user.permissions.check_entity(
                            manager.model["entity_settings"][m["entity_key"]]["entity_id"], POLICY_READ
                        )
                        for m in section["entities"]
                    )
                }
                states = {key: state for key, state in states.items() if state["schedule_id"] in allowed}
            if path := call.data.get("path"):
                state = next((state for state in states.values() if state["path"] == path), None)
                if state is None:
                    raise Invalid(
                        "path", "Unknown or inaccessible control path; discover current paths with get_disabled"
                    )
                return dict(state)
            return {"controls": list(states.values())}
        except Invalid as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="invalid_action",
                translation_placeholders={"error": str(err)},
            ) from err
        except OSError as err:
            raise HomeAssistantError(translation_domain=DOMAIN, translation_key="storage_unavailable") from err

    hass.services.async_register(
        DOMAIN,
        "get_disabled",
        handle,
        schema=vol.Schema({vol.Optional("path"): str}),
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        "set_disabled",
        handle,
        schema=vol.Schema({vol.Required("path"): str, vol.Required("disabled"): bool}),
        supports_response=SupportsResponse.OPTIONAL,
    )
