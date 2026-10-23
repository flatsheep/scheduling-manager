"""Real HA Store/config/entity/device handover, including interrupted upgrades."""
from copy import deepcopy
import json
import importlib
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
from uuid import uuid4

from homeassistant import loader
from homeassistant.config_entries import ConfigEntry, ConfigEntryState, SOURCE_USER
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.storage import Store
from homeassistant.setup import async_setup_component

import test_lifecycle
from test_backend import CAP, NOW, fixture
from custom_components.scheduling_manager.const import DOMAIN, VERSION
from custom_components.scheduling_manager.migration import LEGACY_DOMAIN, LEGACY_AWAY, MIGRATION_KEY, BOOT_KEY
from custom_components.scheduling_manager.scheduler import initial
from custom_components.scheduling_manager.switch import entry_devices
from custom_components.scheduling_manager.validation import validate


class DomainMigrationTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = test_lifecycle.LifecycleTests.asyncSetUp

    async def asyncTearDown(self):
        self.clock_patch.stop()
        for entry in self.hass.config_entries.async_entries(LEGACY_DOMAIN):
            await self.hass.config_entries.async_remove(entry.entry_id)
        sys.path.remove(self.tmp.name)
        await test_lifecycle.LifecycleTests.asyncTearDown(self)

    async def setup_source(self, *, child=False, pending=False):
        self.clock = NOW.replace(hour=13)
        self.clock_patch = patch('custom_components.scheduling_manager.scheduler.dt_util.utcnow', side_effect=lambda: self.clock)
        self.clock_patch.start()
        folder = Path(self.tmp.name) / 'custom_components' / LEGACY_DOMAIN
        folder.mkdir()
        (folder / 'manifest.json').write_text(json.dumps({
            'domain': LEGACY_DOMAIN, 'name': 'Scheduling Manager 1.x fixture', 'version': '1.12.0',
            'requirements': [], 'codeowners': ['@flatsheep'], 'iot_class': 'calculated', 'config_flow': True,
        }))
        (folder / '__init__.py').write_text(
            'from types import SimpleNamespace\n'
            'async def async_setup_entry(hass, entry):\n'
            '    entry.runtime_data = SimpleNamespace(closed=False)\n'
            '    return True\n'
            'async def async_unload_entry(hass, entry):\n'
            '    entry.runtime_data.closed = True\n'
            '    del entry.runtime_data\n'
            '    return True\n'
        )
        (folder / 'config_flow.py').write_text(
            'from homeassistant.config_entries import ConfigFlow\n'
            f'class LegacyFlow(ConfigFlow, domain={LEGACY_DOMAIN!r}):\n'
            '    VERSION = 1\n'
        )
        importlib.invalidate_caches()
        sys.path.insert(0, self.tmp.name)
        self.hass.data.pop(loader.DATA_CUSTOM_COMPONENTS, None)
        self.source = ConfigEntry(domain=LEGACY_DOMAIN, title='Scheduling Manager', data={}, options={},
                                  source=SOURCE_USER, unique_id=LEGACY_DOMAIN, version=1, minor_version=1,
                                  discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(self.source)
        self.assertEqual(self.source.state, ConfigEntryState.LOADED)
        self.old_runtime = self.source.runtime_data
        self.assertTrue(await async_setup_component(self.hass, 'climate', {}))
        self.calls = []
        async def climate(call):
            self.calls.append(call.data['temperature'])
        self.hass.services.async_register('climate', 'set_temperature', climate)
        self.hass.states.async_set('climate.kitchen', 'unavailable' if pending else 'heat', {
            'supported_features': 1, 'min_temp': 7, 'max_temp': 35, 'target_temp_step': .5,
            'temperature': 21,
        })
        section, settings = fixture(days=[0, 2, 4])
        band = section['sub_schedules'][0]['bands'][0]
        band.update(one_off=True, one_off_after=NOW.isoformat(), one_off_partial=True,
                    one_off_run={'start': NOW.replace(hour=12).isoformat(), 'end': NOW.replace(hour=16).isoformat(),
                                 'day': '2026-07-06', 'minutes': [720, 960], 'start_recorded': True,
                                 'entities': deepcopy(section['entities']), 'settings': deepcopy(settings)})
        snapshot = initial(self.clock, 'UTC')
        snapshot['model'] = validate({'revision': 27, 'away': False, 'entity_settings': settings,
                                      'schedules': [section]}, {'climate.kitchen': CAP})
        snapshot['capabilities'] = {'climate.kitchen': CAP}
        key = next(iter(settings))
        snapshot['runtime']['sequence'] = 9
        snapshot['runtime']['normal'][key] = {'temperature': {'value': 21, 'unit': '°C'},
                                              'sequence': 9, 'source': section['id']}
        if pending:
            snapshot['runtime']['pending'][key] = {'temperature': {'value': 21, 'unit': '°C'},
                                                   'sequence': 9, 'source': section['id'],
                                                   'one_off_id': band['id'], 'endpoint': 'start'}
            snapshot['runtime']['errors'][key] = {'entity_id': 'climate.kitchen', 'message': 'Unavailable', 'sequence': 9}
        self.original = deepcopy(snapshot)
        self.legacy_store = Store(self.hass, VERSION, LEGACY_DOMAIN)
        await self.legacy_store.async_save(snapshot)
        devices = dr.async_get(self.hass)
        parent = devices.async_get_or_create(config_entry_id=self.source.entry_id,
                     identifiers={(LEGACY_DOMAIN, 'schedule_' + section['id'])}, name='Downstairs',
                     entry_type=dr.DeviceEntryType.SERVICE)
        self.parent_id = parent.id
        devices.async_update_device(parent.id, name_by_user='My schedule', labels={'schedule-label'})
        device_id = parent.id
        self.child_id = None
        if child and hasattr(devices, 'async_get_or_create_child'):
            sub = section['sub_schedules'][0]
            created = devices.async_get_or_create_child(config_entry_id=self.source.entry_id,
                         parent_device_id=parent.id, identifiers={(LEGACY_DOMAIN, 'sub_schedule_' + sub['id'])}, name='Weekdays')
            devices.async_update_child_device(created.id, name_by_user='My weekdays', labels={'child-label'})
            device_id = self.child_id = created.id
        registry = er.async_get(self.hass)
        self.away = registry.async_get_or_create('switch', LEGACY_DOMAIN, LEGACY_DOMAIN + '_away',
                          config_entry=self.source, suggested_object_id='heating_schedule_away')
        control = registry.async_get_or_create('switch', LEGACY_DOMAIN, LEGACY_DOMAIN + '_disabled_' + section['sub_schedules'][0]['id'],
                          config_entry=self.source, device_id=device_id, suggested_object_id='schedule_manager_band_disabled')
        registry.async_update_entity(control.entity_id, name='My band', icon='mdi:timer', labels={'entity-label'})
        self.control = registry.async_get(control.entity_id)
        self.target = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={'legacy_entry_id': self.source.entry_id},
                                  options={}, source=SOURCE_USER, unique_id=DOMAIN, version=1, minor_version=1,
                                  discovery_keys={}, subentries_data=[])

    async def migrate(self):
        await self.hass.config_entries.async_add(self.target)
        await self.hass.async_block_till_done()

    async def complete_handover(self):
        """Model a new HA boot after the first setup has transferred ownership."""
        if self.target.state is ConfigEntryState.LOADED and self.target.runtime_data.snapshot.get(MIGRATION_KEY, {}).get('state') == 'awaiting_restart':
            self.assertIsNotNone(await self.legacy_store.async_load())
            await self.hass.config_entries.async_unload(self.target.entry_id)
            self.hass.data[BOOT_KEY] = str(uuid4())
            await self.hass.config_entries.async_setup(self.target.entry_id)
            await self.hass.async_block_till_done()

    async def assert_success(self):
        await self.complete_handover()
        self.assertEqual(self.target.state, ConfigEntryState.LOADED)
        self.assertTrue(self.old_runtime.closed)
        self.assertIsNone(self.hass.config_entries.async_get_entry(self.source.entry_id))
        self.assertIsNone(await self.legacy_store.async_load())
        self.assertEqual(self.target.runtime_data.snapshot[MIGRATION_KEY]['state'], 'complete')
        self.assertEqual(self.target.data, {})
        self.assertEqual(self.target.runtime_data.model, self.original['model'])
        registry = er.async_get(self.hass)
        away = registry.async_get('switch.scheduling_manager_away')
        self.assertIsNotNone(away)
        self.assertEqual(away.id, self.away.id)
        self.assertEqual(away.platform, DOMAIN)
        self.assertIsNone(registry.async_get(LEGACY_AWAY))
        control = registry.async_get(self.control.entity_id)
        self.assertEqual(control.id, self.control.id)
        self.assertEqual(control.name, 'My band')
        self.assertEqual(control.icon, 'mdi:timer')
        self.assertEqual(control.labels, {'entity-label'})
        self.assertEqual(control.config_entry_id, self.target.entry_id)
        self.assertIsNone(control.disabled_by)
        self.assertNotEqual(control.device_id, self.control.device_id)
        self.assertEqual(self.calls, [])

    async def test_live_handover_preserves_journal_identity_and_one_off(self):
        await self.setup_source()
        await self.migrate()
        await self.assert_success()
        self.assertEqual(self.target.runtime_data.snapshot['runtime'], self.original['runtime'])
        await self.hass.config_entries.async_reload(self.target.entry_id)
        self.assertEqual(self.calls, [])
        self.clock = NOW.replace(hour=16)
        await self.target.runtime_data.tick()
        self.assertEqual(self.calls, [13])
        self.assertEqual(self.target.runtime_data.model['schedules'][0]['sub_schedules'][0]['bands'], [])

    async def test_native_child_hierarchy_and_customisations_transfer(self):
        await self.setup_source(child=True)
        await self.migrate()
        await self.assert_success()
        devices = dr.async_get(self.hass)
        self.assertIsNone(devices.async_get(self.parent_id))
        section = self.original['model']['schedules'][0]
        parent = next(device for device in entry_devices(devices, self.target.entry_id)
                      if (DOMAIN, 'schedule_' + section['id']) in device.identifiers)
        self.assertEqual(parent.name_by_user, 'My schedule')
        self.assertEqual(parent.labels, {'schedule-label'})
        if self.child_id:
            child = devices.async_get(er.async_get(self.hass).async_get(self.control.entity_id).device_id)
            self.assertEqual(child.parent_device_id, parent.id)
            self.assertEqual(child.name_by_user, 'My weekdays')
            self.assertEqual(child.labels, {'child-label'})

    async def test_unavailable_pending_command_is_not_lost_or_dispatched(self):
        await self.setup_source(pending=True)
        await self.migrate()
        await self.assert_success()
        self.assertEqual(self.target.runtime_data.snapshot['runtime'], self.original['runtime'])

    async def test_new_store_collision_preserves_both_stores_and_old_owner(self):
        await self.setup_source()
        other = initial(self.clock, 'UTC')
        await Store(self.hass, VERSION, DOMAIN).async_save(other)
        await self.migrate()
        self.assertEqual(self.target.state, ConfigEntryState.SETUP_ERROR)
        self.assertEqual(await self.legacy_store.async_load(), self.original)
        self.assertEqual(await Store(self.hass, VERSION, DOMAIN).async_load(), other)
        self.assertFalse(self.old_runtime.closed)

    async def test_invalid_source_is_not_replaced_with_empty_schedules(self):
        await self.setup_source()
        invalid = deepcopy(self.original)
        invalid['runtime']['cursor'] = 'invalid'
        await self.legacy_store.async_save(invalid)
        await self.migrate()
        self.assertEqual(self.target.state, ConfigEntryState.SETUP_ERROR)
        self.assertEqual(await self.legacy_store.async_load(), invalid)
        self.assertIsNone(await Store(self.hass, VERSION, DOMAIN).async_load())

    async def test_failed_handover_save_is_retryable(self):
        await self.setup_source()
        original_save = Store.async_save
        async def fail_target(store, data):
            if store.key == DOMAIN:
                raise OSError('Target store unavailable')
            await original_save(store, data)
        with patch.object(Store, 'async_save', new=fail_target):
            await self.migrate()
        self.assertEqual(self.target.state, ConfigEntryState.SETUP_RETRY)
        self.assertEqual(await self.legacy_store.async_load(), self.original)
        await self.hass.config_entries.async_reload(self.target.entry_id)
        await self.assert_success()

    async def test_interruption_after_entity_move_resumes_without_duplicates(self):
        await self.setup_source(child=True)
        registry = er.async_get(self.hass)
        original_move = registry.async_update_entity_platform
        first = True
        def interrupted(*args, **kwargs):
            nonlocal first
            result = original_move(*args, **kwargs)
            if first:
                first = False
                raise OSError('Interrupted after registry write')
            return result
        with patch.object(registry, 'async_update_entity_platform', side_effect=interrupted):
            await self.migrate()
        self.assertEqual(self.target.state, ConfigEntryState.SETUP_RETRY)
        self.assertIn(MIGRATION_KEY, await Store(self.hass, VERSION, DOMAIN).async_load())
        await self.hass.config_entries.async_reload(self.target.entry_id)
        await self.assert_success()

    async def test_entity_id_collision_can_be_resolved_then_retried(self):
        await self.setup_source()
        registry = er.async_get(self.hass)
        occupied = registry.async_get_or_create('switch', 'test', 'occupied',
                     suggested_object_id='scheduling_manager_away')
        await self.migrate()
        self.assertEqual(self.target.state, ConfigEntryState.SETUP_ERROR)
        self.assertIsNotNone(registry.async_get(LEGACY_AWAY))
        registry.async_remove(occupied.entity_id)
        await self.hass.config_entries.async_reload(self.target.entry_id)
        await self.assert_success()

    async def test_flow_detects_source_and_prevents_second_new_manager(self):
        await self.setup_source()
        result = await self.hass.config_entries.flow.async_init(DOMAIN, context={'source': SOURCE_USER})
        self.assertEqual(result['type'], 'form')
        result = await self.hass.config_entries.flow.async_configure(result['flow_id'], {})
        self.assertEqual(result['type'], 'create_entry')
        self.target = self.hass.config_entries.async_entries(DOMAIN)[0]
        await self.hass.async_block_till_done()
        await self.assert_success()
        duplicate = await self.hass.config_entries.flow.async_init(DOMAIN, context={'source': SOURCE_USER})
        self.assertEqual(duplicate['type'], 'abort')

    async def test_cleanup_failure_after_old_entry_removal_is_resumable(self):
        await self.setup_source(child=True)
        original_remove = Store.async_remove
        async def fail_cleanup(store):
            if store.key == LEGACY_DOMAIN:
                raise OSError('Cleanup interrupted')
            await original_remove(store)
        with patch.object(Store, 'async_remove', new=fail_cleanup):
            await self.migrate()
            await self.complete_handover()
        self.assertEqual(self.target.state, ConfigEntryState.SETUP_ERROR)
        self.assertIsNone(self.hass.config_entries.async_get_entry(self.source.entry_id))
        self.assertIn(MIGRATION_KEY, await Store(self.hass, VERSION, DOMAIN).async_load())
        await self.hass.config_entries.async_reload(self.target.entry_id)
        await self.assert_success()

    async def test_orphaned_source_store_is_recovered_without_an_old_entry(self):
        await self.setup_source()
        await self.hass.config_entries.async_remove(self.source.entry_id)
        await self.migrate()
        await self.complete_handover()
        self.assertEqual(self.target.state, ConfigEntryState.LOADED)
        self.assertEqual(self.target.runtime_data.model, self.original['model'])
        self.assertEqual(self.target.data, {})
        self.assertIsNone(await self.legacy_store.async_load())
        self.assertEqual(self.calls, [])

    async def test_finished_store_with_stale_entry_marker_does_not_restart_migration(self):
        await self.setup_source()
        await self.hass.config_entries.async_remove(self.source.entry_id)
        await Store(self.hass, VERSION, DOMAIN).async_save(self.original)
        await self.legacy_store.async_remove()
        await self.migrate()
        self.assertEqual(self.target.state, ConfigEntryState.LOADED)
        self.assertEqual(self.target.data, {})
        self.assertEqual(self.target.runtime_data.model, self.original['model'])
        self.assertEqual(self.calls, [])

    async def test_verification_restart_precedes_source_retirement(self):
        await self.setup_source(child=True)
        await self.migrate()
        self.assertEqual(self.target.state, ConfigEntryState.LOADED)
        self.assertTrue(self.old_runtime.closed)
        self.assertIsNotNone(self.source.disabled_by)
        self.assertIsNotNone(self.hass.config_entries.async_get_entry(self.source.entry_id))
        self.assertEqual(await self.legacy_store.async_load(), self.original)
        self.assertEqual(self.target.runtime_data.snapshot[MIGRATION_KEY]['state'], 'awaiting_restart')
        await self.hass.config_entries.async_reload(self.target.entry_id)
        self.assertEqual(self.target.runtime_data.snapshot[MIGRATION_KEY]['state'], 'awaiting_restart')
        await self.assert_success()

    async def test_user_disabled_entity_preference_transfers(self):
        await self.setup_source()
        registry = er.async_get(self.hass)
        registry.async_update_entity(self.control.entity_id, disabled_by=er.RegistryEntryDisabler.USER)
        await self.migrate()
        await self.complete_handover()
        self.assertEqual(self.target.state, ConfigEntryState.LOADED)
        control = registry.async_get(self.control.entity_id)
        self.assertEqual(control.disabled_by, er.RegistryEntryDisabler.USER)
        self.assertEqual(control.id, self.control.id)
        self.assertEqual(self.calls, [])

    async def test_upgrade_recovers_when_old_component_package_is_unavailable(self):
        await self.setup_source(child=True)
        await self.hass.config_entries.async_unload(self.source.entry_id)
        original_get = loader.async_get_integration
        async def without_old(hass, domain):
            if domain == LEGACY_DOMAIN:
                raise loader.IntegrationNotFound(domain)
            return await original_get(hass, domain)
        with patch.object(loader, 'async_get_integration', new=without_old):
            await self.migrate()
            await self.assert_success()

    async def test_new_device_customisations_survive_verification_restart(self):
        await self.setup_source(child=True)
        await self.migrate()
        devices = dr.async_get(self.hass)
        parent = next(device for device in entry_devices(devices, self.target.entry_id)
                      if (DOMAIN, 'schedule_' + self.original['model']['schedules'][0]['id']) in device.identifiers)
        devices.async_update_device(parent.id, name_by_user='Updated after handover', labels={'updated-label'})
        await self.complete_handover()
        self.assertEqual(self.target.state, ConfigEntryState.LOADED)
        self.assertEqual(devices.async_get(parent.id).name_by_user, 'Updated after handover')
        self.assertEqual(devices.async_get(parent.id).labels, {'updated-label'})
