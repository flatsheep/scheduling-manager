"""Serve the bundled card and register it through HA's frontend module API."""

from pathlib import Path

from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL, add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN

CARD_VERSION = "1.11.0"
CARD_PATH = f"/{DOMAIN}/scheduling-manager-card.js"
LOADER_PATH = f"/{DOMAIN}/scheduling-manager-loader.js"
CARD_URL = f"{LOADER_PATH}?v={CARD_VERSION}"


async def async_setup_assets(hass: HomeAssistant) -> None:
    """Register static routes once, independently of config-entry reloads."""
    bundle = str(Path(__file__).parent / "www" / "scheduling-manager-card.js")
    loader = str(Path(__file__).parent / "www" / "scheduling-manager-loader.js")
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(CARD_PATH, bundle, False),
            StaticPathConfig(LOADER_PATH, loader, False),
            StaticPathConfig(f"/{DOMAIN}/heating-schedule-manager-card.js", bundle, False),
        ]
    )


@callback
def register_card(hass: HomeAssistant) -> None:
    """Load the card automatically for storage and YAML dashboards alike."""
    if CARD_URL not in hass.data[DATA_EXTRA_MODULE_URL].urls:
        add_extra_js_url(hass, CARD_URL)


@callback
def unregister_card(hass: HomeAssistant) -> None:
    """Remove only our frontend module, leaving user resources untouched."""
    if CARD_URL in hass.data[DATA_EXTRA_MODULE_URL].urls:
        hass.data[DATA_EXTRA_MODULE_URL].remove(CARD_URL)
