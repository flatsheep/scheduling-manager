"""Single-instance, local config flow."""

import voluptuous as vol
from typing import Any
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlowResult
from .const import DOMAIN


class HeatingScheduleFlow(config_entries.ConfigFlow, domain=DOMAIN):  # type: ignore[call-arg]
    """HA's flow metaclass registers the domain keyword at runtime."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Scheduling Manager", data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
