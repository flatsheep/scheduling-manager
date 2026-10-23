"""Bundled frontend versioning and idempotent, narrowly owned registration."""

import json
from pathlib import Path
import tempfile
import unittest

from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL, UrlManager
from homeassistant.core import HomeAssistant

from custom_components.scheduling_manager.frontend import CARD_URL, CARD_VERSION, register_card, unregister_card


class FrontendTests(unittest.IsolatedAsyncioTestCase):
    async def test_registration_is_idempotent_and_never_removes_other_modules(self):
        with tempfile.TemporaryDirectory() as temporary:
            hass = HomeAssistant(temporary)
            changes = []
            modules = UrlManager(lambda change, url: changes.append((change, url)), ['/other-card.js'])
            hass.data[DATA_EXTRA_MODULE_URL] = modules
            try:
                register_card(hass)
                register_card(hass)
                self.assertEqual(changes, [('added', CARD_URL)])
                unregister_card(hass)
                unregister_card(hass)
                self.assertEqual(changes, [('added', CARD_URL), ('removed', CARD_URL)])
                self.assertEqual(modules.urls, frozenset(['/other-card.js']))
            finally:
                await hass.async_stop(force=True)

    def test_hacs_payload_matches_built_card_and_license_notices(self):
        root = Path(__file__).resolve().parents[1]
        component = root / 'custom_components/scheduling_manager'
        self.assertEqual(CARD_VERSION, json.loads((root / 'frontend/package.json').read_text())['version'])
        self.assertEqual((component / 'www/scheduling-manager-card.js').read_bytes(),
                         (root / 'dist/scheduling-manager-card.js').read_bytes())
        for name in ('LICENSE', 'THIRD_PARTY_NOTICES.md'):
            self.assertEqual((root / name).read_bytes(), (component / name).read_bytes())
