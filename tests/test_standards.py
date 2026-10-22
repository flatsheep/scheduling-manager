"""HA lifecycle, typed ownership, API failures and diagnostic privacy regressions."""

from copy import deepcopy
import asyncio
import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from homeassistant import loader
from homeassistant.auth import auth_manager_from_config
from homeassistant.config_entries import ConfigEntry, ConfigEntries, SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError, ConfigEntryNotReady, HomeAssistantError
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.setup import async_setup_component

from test_backend import fixture
from custom_components.heating_schedule_manager import async_setup_entry, async_unload_entry
from custom_components.heating_schedule_manager import websocket_api as api
from custom_components.heating_schedule_manager.const import DOMAIN
from custom_components.heating_schedule_manager.diagnostics import async_get_config_entry_diagnostics
from custom_components.heating_schedule_manager.runtime import get_manager
from custom_components.heating_schedule_manager.scheduler import Manager
from custom_components.heating_schedule_manager.switch import AwaySwitch
from custom_components.heating_schedule_manager.validation import Invalid


def entry():
    return ConfigEntry(domain=DOMAIN, title="Scheduling Manager", data={}, options={}, source=SOURCE_USER,
                       unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])


class StandardsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self.tmp.name)
        self.hass.config.time_zone = 'UTC'
        root = Path(__file__).resolve().parents[1]
        shutil.copytree(root / 'custom_components', Path(self.tmp.name) / 'custom_components', ignore=shutil.ignore_patterns('__pycache__'))
        loader.async_setup(self.hass)
        self.hass.config_entries = ConfigEntries(self.hass, {})
        await self.hass.config_entries.async_initialize()
        dr.async_setup(self.hass)
        await dr.async_load(self.hass)
        await er.async_get(self.hass).async_load()
        self.hass.auth = await auth_manager_from_config(self.hass, [{'type': 'homeassistant'}], [])
        self.connections = []

    async def asyncTearDown(self):
        for connection in self.connections:
            for unsubscribe in connection.subscriptions.values():
                unsubscribe()
        for config_entry in self.hass.config_entries.async_entries(DOMAIN):
            await self.hass.config_entries.async_remove(config_entry.entry_id)
        await self.hass.async_stop(force=True)
        for state in self.hass.states.async_all():
            self.hass.states.async_remove(state.entity_id)
        self.hass.data.clear()
        self.tmp.cleanup()
        del self.hass

    async def connection(self):
        user = await self.hass.auth.async_create_user("Owner", group_ids=["system-admin"])
        connection = SimpleNamespace(user=user, subscriptions={}, send_result=Mock(), send_error=Mock(), send_event=Mock())
        self.connections.append(connection)
        return connection

    async def load(self):
        await async_setup_component(self.hass, "climate", {})
        await async_setup_component(self.hass, "websocket_api", {"http": {"server_host": "127.0.0.1", "server_port": 8123}})
        config_entry = entry()
        await self.hass.config_entries.async_add(config_entry)
        await self.hass.async_block_till_done()
        self.assertIsInstance(config_entry.runtime_data, Manager)
        return config_entry

    async def test_runtime_identity_translated_entity_and_no_polling(self):
        config_entry = await self.load()
        self.assertIs(get_manager(self.hass), config_entry.runtime_data)
        self.assertNotIn(DOMAIN, self.hass.data)
        state = self.hass.states.get("switch.heating_schedule_away")
        self.assertEqual(state.attributes["friendly_name"], "Scheduling Manager Away")
        switch = AwaySwitch(config_entry.runtime_data)
        self.assertTrue(switch.has_entity_name)
        self.assertFalse(switch.should_poll)
        self.assertEqual(switch.unique_id, f"{DOMAIN}_away")
        self.assertTrue(switch.available)
        config_entry.runtime_data.storage_error = "disk unavailable"
        self.assertFalse(switch.available)
        await config_entry.runtime_data.stop()
        self.assertIsNone(get_manager(self.hass))

    async def test_corrupt_store_is_permanent_repair_and_original_preserved(self):
        config_entry = entry()
        path = Path(Manager(self.hass).store.path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{broken schedule JSON", encoding="utf-8")
        with self.assertRaises(ConfigEntryError) as raised:
            await async_setup_entry(self.hass, config_entry)
        self.assertNotIsInstance(raised.exception, ConfigEntryNotReady)
        self.assertEqual(raised.exception.translation_key, "invalid_storage")
        self.assertEqual(path.read_text(), "{broken schedule JSON")
        self.assertFalse(hasattr(config_entry, "runtime_data"))
        self.assertIsNotNone(ir.async_get(self.hass).async_get_issue(DOMAIN, "invalid_storage"))
        path.unlink()
        await self.load()
        self.assertIsNone(ir.async_get(self.hass).async_get_issue(DOMAIN, "invalid_storage"))

    async def test_setup_errors_clean_runtime_and_distinguish_transient_failures(self):
        for error, expected in ((OSError("disk busy"), ConfigEntryNotReady), (RuntimeError("unexpected"), RuntimeError), (asyncio.CancelledError(), asyncio.CancelledError)):
            manager = SimpleNamespace(start=AsyncMock(side_effect=error), stop=AsyncMock(), storage_error=None)
            with patch("custom_components.heating_schedule_manager.Manager", return_value=manager):
                with self.assertRaises(expected):
                    await async_setup_entry(self.hass, entry())
            manager.stop.assert_awaited_once()
        manager = SimpleNamespace(start=AsyncMock(), stop=AsyncMock(), storage_error="disk full")
        with patch("custom_components.heating_schedule_manager.Manager", return_value=manager):
            with self.assertRaises(ConfigEntryNotReady):
                await async_setup_entry(self.hass, entry())
        manager.stop.assert_awaited_once()
        with patch("custom_components.heating_schedule_manager.__version__", "2026.6.0"):
            with self.assertRaises(ConfigEntryError) as raised:
                await async_setup_entry(self.hass, entry())
        self.assertEqual(raised.exception.translation_key, "unsupported_version")

    async def test_platform_failure_and_unload_refusal_preserve_lifecycle_contract(self):
        config_entry = entry()
        for error in (RuntimeError("platform failed"), asyncio.CancelledError()):
            with patch.object(self.hass.config_entries, "async_forward_entry_setups", AsyncMock(side_effect=error)):
                with self.assertRaises(type(error)):
                    await async_setup_entry(self.hass, config_entry)
            self.assertFalse(hasattr(config_entry, "runtime_data"))
        config_entry = await self.load()
        with patch.object(self.hass.config_entries, "async_unload_platforms", AsyncMock(return_value=False)):
            self.assertFalse(await async_unload_entry(self.hass, config_entry))
        self.assertFalse(config_entry.runtime_data.closed)

    async def test_diagnostics_redact_all_nested_user_data_without_mutation(self):
        config_entry = await self.load()
        manager = config_entry.runtime_data
        section, settings = fixture()
        secret = "PRIVATE_DIAGNOSTIC_PAYLOAD"
        section["name"] = section["category"] = secret
        section["sub_schedules"][0]["name"] = secret
        section["entities"][0].update(start_state=secret, end_state=secret)
        for setting in settings.values():
            setting.update(entity_id=secret, registry_id=secret, setback=secret)
        manager.snapshot["model"].update(schedules=[section], entity_settings=settings)
        manager.snapshot["capabilities"] = {secret: {"name": secret}}
        for field in ("normal", "pre_away", "away_logical", "pending"):
            manager.snapshot["runtime"][field] = {"key": {"state": secret, "temperature": secret}}
        manager.snapshot["runtime"]["errors"] = {"key": {"entity_id": secret, "message": secret}}
        manager.storage_error = secret
        before = deepcopy(manager.snapshot)
        data = await async_get_config_entry_diagnostics(self.hass, config_entry)
        self.assertNotIn(secret, json.dumps(data))
        self.assertEqual(data["capabilities"], {"cached_entities": 1})
        self.assertEqual(manager.snapshot, before)

    async def test_websocket_unloaded_and_authorized_reads(self):
        connection = await self.connection()
        await api.get.__wrapped__(self.hass, connection, {"id": 1})
        await api.capabilities.__wrapped__(self.hass, connection, {"id": 2})
        await api.mutation(self.hass, connection, {"id": 3}, AsyncMock())
        self.assertEqual(connection.send_error.call_count, 3)
        self.assertEqual(connection.send_error.call_args.args[1], "not_loaded")
        config_entry = await self.load()
        await api.get.__wrapped__(self.hass, connection, {"id": 4})
        self.assertTrue(connection.send_result.call_args.args[1]["editable"])
        with patch.object(config_entry.runtime_data, "capabilities", return_value={"climate.test": {"entity_id": "climate.test"}}):
            await api.capabilities.__wrapped__(self.hass, connection, {"id": 5})
        self.assertEqual(connection.send_result.call_args.args[1], [{"entity_id": "climate.test"}])

    async def test_websocket_mutation_errors_and_handlers(self):
        config_entry = await self.load()
        connection = await self.connection()
        for error, code in ((Invalid("revision", "stale"), "conflict"), (Invalid("days", "bad"), "validation"), (OSError("disk full"), "operation_failed")):
            await api.mutation(self.hass, connection, {"id": 1}, AsyncMock(side_effect=error))
            self.assertEqual(connection.send_error.call_args.args[1], code)
        for handler, method, message, expected in (
            (api.save, "save_section", {"expected_revision": 0, "operation": "delete", "section_id": "id", "settings": {}}, (0, "delete", "id", None, {})),
            (api.away, "set_away", {"expected_revision": 0, "away": True}, (True, 0)),
            (api.section_enabled, "set_section_enabled", {"expected_revision": 0, "section_id": "id", "enabled": False}, (0, "id", False)),
            (api.enable_band, "enable_band", {"expected_revision": 0, "section_id": "id", "band_id": "band"}, (0, "id", "band")),
        ):
            with patch.object(config_entry.runtime_data, method, AsyncMock()) as action:
                await handler.__wrapped__(self.hass, connection, {"id": 2, **message})
                action.assert_awaited_once_with(*expected, **({'defer_dispatch': True} if method in ('set_away', 'set_section_enabled', 'enable_band') else {}))
            self.assertTrue(connection.send_result.call_args.args[1]["editable"])

    async def test_subscription_survives_unload_reload_and_registration_is_global(self):
        connection = await self.connection()
        api.subscribe(self.hass, connection, {"id": 1})
        self.assertEqual(connection.send_event.call_count, 0)
        config_entry = await self.load()
        self.assertGreater(connection.send_event.call_count, 0)
        from homeassistant.components.websocket_api.const import DOMAIN as WS
        handlers = dict(self.hass.data[WS])
        await self.hass.config_entries.async_unload(config_entry.entry_id)
        self.assertIsNone(get_manager(self.hass))
        count = connection.send_event.call_count
        await self.hass.config_entries.async_setup(config_entry.entry_id)
        await self.hass.async_block_till_done()
        self.assertGreater(connection.send_event.call_count, count)
        self.assertEqual(dict(self.hass.data[WS]), handlers)

    async def test_switch_failures_are_translatable(self):
        config_entry = await self.load()
        switch = AwaySwitch(config_entry.runtime_data)
        switch.hass = self.hass
        for error, key in ((OSError("disk full"), "storage_unavailable"), (Invalid("away", "invalid"), "invalid_action")):
            with patch.object(config_entry.runtime_data, "set_away", AsyncMock(side_effect=error)):
                with self.assertRaises(HomeAssistantError) as raised:
                    await switch.async_turn_on()
            self.assertEqual(raised.exception.translation_key, key)

    async def test_location_inheritance_overrides_missing_links_and_permission_filtering(self):
        config_entry = await self.load()
        from custom_components.heating_schedule_manager.presentation import entity_locations
        settings = {'inherited': {'entity_id': 'climate.inherited'}, 'override': {'entity_id': 'climate.override'}, 'missing': {'entity_id': 'climate.missing'}}
        entities = {'climate.inherited': SimpleNamespace(area_id=None, device_id='device'), 'climate.override': SimpleNamespace(area_id='office', device_id='device')}
        devices = {'device': SimpleNamespace(area_id='kitchen')}
        areas = {'kitchen': SimpleNamespace(id='kitchen', name='Kitchen', floor_id='ground'), 'office': SimpleNamespace(id='office', name='Office', floor_id=None)}
        floors = {'ground': SimpleNamespace(floor_id='ground', name='Ground floor')}
        # Read-only metadata tests use registry records; they do not exercise
        # unrelated native JSON fragment serialization of registry Store files.
        with patch('custom_components.heating_schedule_manager.presentation.er.async_get', return_value=SimpleNamespace(async_get=entities.get)), \
             patch('custom_components.heating_schedule_manager.presentation.dr.async_get', return_value=SimpleNamespace(async_get=devices.get)), \
             patch('custom_components.heating_schedule_manager.presentation.ar.async_get', return_value=SimpleNamespace(async_get_area=areas.get)), \
             patch('custom_components.heating_schedule_manager.presentation.fr.async_get', return_value=SimpleNamespace(async_get_floor=floors.get)):
            locations = entity_locations(self.hass, settings)
            self.assertEqual(locations['inherited']['area_name'], 'Kitchen')
            self.assertEqual(locations['inherited']['floor_name'], 'Ground floor')
            self.assertEqual(locations['override']['area_name'], 'Office')
            self.assertIsNone(locations['override']['floor_id'])
            self.assertIsNone(locations['missing']['area_id'])
            floors.clear()
            self.assertIsNone(entity_locations(self.hass, settings)['inherited']['floor_id'])
            floors['ground'] = SimpleNamespace(floor_id='ground', name='Ground floor')
            manager = config_entry.runtime_data
            section, _ = fixture()
            section['entities'] = [{'entity_key': 'inherited'}, {'entity_key': 'override'}]
            manager.snapshot['model'].update(entity_settings=settings, schedules=[section])
            user = SimpleNamespace(is_admin=False, permissions=SimpleNamespace(check_entity=lambda eid, policy: eid == 'climate.inherited'))
            visible = api.visible(manager, user)
            self.assertEqual(set(visible['locations']), {'inherited'})
            self.assertEqual(set(visible['model']['entity_settings']), {'inherited'})
            self.assertEqual(set(visible['active_schedules']), {section['id']})
            areas.pop('kitchen')
            self.assertIsNone(entity_locations(self.hass, settings)['inherited']['area_id'])
            devices.clear()
            self.assertIsNone(entity_locations(self.hass, settings)['inherited']['area_id'])

    async def test_location_changes_notify_without_model_revision_or_runtime_mutation(self):
        config_entry = await self.load()
        manager = config_entry.runtime_data
        before = deepcopy(manager.snapshot)
        with patch('custom_components.heating_schedule_manager.scheduler.async_dispatcher_send') as notify:
            self.hass.bus.async_fire('area_registry_updated', {'action': 'update', 'area_id': 'test'})
            self.hass.bus.async_fire('floor_registry_updated', {'action': 'update', 'floor_id': 'test'})
            await self.hass.async_block_till_done()
            self.assertGreater(notify.call_count, 0)
        self.assertEqual(manager.snapshot, before)
