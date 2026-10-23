"""Real config flow, config-entry setup/unload, switch and Store API tests."""
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from homeassistant import loader
from homeassistant.core import HomeAssistant
from homeassistant.core import Context
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.config_entries import ConfigEntry, ConfigEntries, ConfigEntryState, SOURCE_USER
from homeassistant.auth import auth_manager_from_config
from homeassistant.setup import async_setup_component

from custom_components.heating_schedule_manager.const import DOMAIN
from custom_components.heating_schedule_manager.scheduler import Manager
from custom_components.heating_schedule_manager.config_flow import HeatingScheduleFlow


class LifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_off_never_registers_native_disabled_switch(self):
        from test_backend import NOW, fixture

        self.assertTrue(await async_setup_component(self.hass, 'climate', {}))
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow', return_value=NOW):
            entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                                unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
            await self.hass.config_entries.async_add(entry)
            self.hass.states.async_set('climate.kitchen', 'heat', {
                'supported_features': 1, 'min_temp': 7, 'max_temp': 35, 'target_temp_step': .5,
            })
            section, settings = fixture()
            band = section['sub_schedules'][0]['bands'][0]
            band['one_off'] = True
            await entry.runtime_data.save_section(0, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            registry = er.async_get(self.hass)
            self.assertIsNone(registry.async_get_entity_id('switch', DOMAIN, f'{DOMAIN}_disabled_{band["id"]}'))
            self.assertIsNotNone(registry.async_get_entity_id('switch', DOMAIN, f'{DOMAIN}_disabled_{section["id"]}'))
            await self.hass.config_entries.async_reload(entry.entry_id)
            await self.hass.async_block_till_done()
            self.assertIsNone(registry.async_get_entity_id('switch', DOMAIN, f'{DOMAIN}_disabled_{band["id"]}'))

    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.hass=HomeAssistant(self.tmp.name)
        self.hass.config.time_zone='UTC'
        root=Path(__file__).resolve().parents[1]
        shutil.copytree(root/'custom_components',Path(self.tmp.name)/'custom_components',ignore=shutil.ignore_patterns('__pycache__'))
        loader.async_setup(self.hass)
        self.hass.config_entries=ConfigEntries(self.hass,{})
        await self.hass.config_entries.async_initialize()
        dr.async_setup(self.hass)
        await dr.async_load(self.hass)
        await er.async_get(self.hass).async_load()
        self.hass.auth=await auth_manager_from_config(self.hass,[{'type':'homeassistant'}],[])

    async def asyncTearDown(self):
        for entry in self.hass.config_entries.async_entries(DOMAIN):
            await self.hass.config_entries.async_remove(entry.entry_id)
        await self.hass.async_stop(force=True)
        for state in self.hass.states.async_all():
            self.hass.states.async_remove(state.entity_id)
        self.hass.data.clear()
        self.tmp.cleanup()
        del self.hass

    async def test_config_entry_setup_switch_api_and_unload(self):
        self.assertTrue(await async_setup_component(self.hass,'climate',{}))
        self.assertTrue(await async_setup_component(self.hass,'websocket_api',{'http':{'server_host':'127.0.0.1','server_port':8123}}))
        entry=ConfigEntry(domain=DOMAIN,title='Heating Schedule Manager',data={},options={},source=SOURCE_USER,unique_id=DOMAIN,version=1,minor_version=1,discovery_keys={},subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        self.assertEqual(entry.state,ConfigEntryState.LOADED)
        duplicate=await self.hass.config_entries.flow.async_init(DOMAIN,context={'source':SOURCE_USER})
        self.assertEqual(duplicate['type'],'abort');self.assertIn(duplicate['reason'],('already_configured','single_instance_allowed'))
        await self.hass.async_block_till_done()
        switch=self.hass.states.get('switch.heating_schedule_away')
        self.assertIsNotNone(switch);self.assertEqual(switch.state,'off')
        self.assertNotIn(DOMAIN,self.hass.data)
        self.assertNotIn(switch.entity_id,entry.runtime_data.capabilities())
        await self.hass.services.async_call('switch','turn_on',{'entity_id':switch.entity_id},blocking=True)
        self.assertTrue(entry.runtime_data.model['away'])
        self.assertEqual(self.hass.states.get(switch.entity_id).state,'on')
        await self.hass.auth.async_create_user('Owner',group_ids=['system-admin'])
        viewer=await self.hass.auth.async_create_user('Read-only viewer',group_ids=['system-users'])
        self.assertFalse(viewer.is_admin)
        from homeassistant.exceptions import Unauthorized
        with self.assertRaises(Unauthorized):
            await self.hass.services.async_call('switch','turn_off',{'entity_id':switch.entity_id},blocking=True,context=Context(user_id=viewer.id))
        self.assertTrue(entry.runtime_data.model['away'])
        from homeassistant.components.websocket_api.const import DOMAIN as WS
        self.assertIn(f'{DOMAIN}/save_section',self.hass.data[WS])
        self.assertIn(f'{DOMAIN}/set_section_enabled',self.hass.data[WS])
        self.assertIn(f'{DOMAIN}/enable_band',self.hass.data[WS])
        self.assertTrue(await self.hass.config_entries.async_unload(entry.entry_id))
        self.assertNotIn(DOMAIN,self.hass.data)
        self.assertFalse(hasattr(entry,'runtime_data'))

    async def test_schedule_binary_sensor_tracks_saved_sections(self):
        from homeassistant.components.climate.const import ClimateEntityFeature
        from test_backend import NOW, fixture

        self.assertTrue(await async_setup_component(self.hass, 'climate', {}))
        entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                            unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        self.hass.states.async_set('climate.kitchen', 'heat', {
            'supported_features': int(ClimateEntityFeature.TARGET_TEMPERATURE),
            'min_temp': 7, 'max_temp': 35, 'target_temp_step': .5,
        })
        section, settings = fixture()
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow', return_value=NOW.replace(hour=13)):
            await entry.runtime_data.save_section(0, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            sensor = self.hass.states.get('binary_sensor.schedule_downstairs')
            self.assertIsNotNone(sensor)
            self.assertEqual(sensor.state, 'on')
            self.assertEqual(sensor.attributes['schedule_id'], section['id'])
            self.assertEqual(sensor.attributes['members'][0]['entity_id'], 'climate.kitchen')
            self.assertEqual(sensor.attributes['sub_schedules'][0]['days'], ['monday'])
            self.assertEqual(sensor.attributes['next_transition']['endpoint'], 'end')
            section['category'] = 'Ground floor'
            await entry.runtime_data.save_section(1, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            self.assertEqual(self.hass.states.get(sensor.entity_id).attributes['category'], 'Ground floor')
            await entry.runtime_data.save_section(2, 'delete', section['id'], None, {})
            await self.hass.async_block_till_done()
        self.assertIsNone(self.hass.states.get('binary_sensor.schedule_downstairs'))

    async def test_disabled_switches_and_actions_follow_parent_and_band_states(self):
        from test_backend import NOW, fixture

        await async_setup_component(self.hass, 'climate', {})
        entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                            unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        calls = []
        async def climate(call):
            calls.append(call.data['temperature'])
        self.hass.services.async_register('climate', 'set_temperature', climate)
        self.hass.states.async_set('climate.kitchen', 'heat', {'supported_features': 1, 'min_temp': 7, 'max_temp': 35, 'target_temp_step': .5, 'temperature': 20})
        section, settings = fixture()
        section['name'] = 'Schedule1'
        section['sub_schedules'][0]['name'] = 'Weekdays'
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T15:00Z')
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow', return_value=NOW.replace(hour=13)):
            await entry.runtime_data.save_section(0, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            controls = [s for s in self.hass.states.async_all('switch') if s.attributes.get('path')]
            self.assertEqual(len(controls), 3)
            parent = next(s for s in controls if s.attributes['kind'] == 'schedule')
            child = next(s for s in controls if s.attributes['kind'] == 'band')
            self.assertEqual(parent.state, 'off')
            self.assertEqual(child.state, 'on')
            self.assertNotIn(parent.entity_id, entry.runtime_data.capabilities())
            self.assertNotIn(child.entity_id, entry.runtime_data.capabilities())
            await self.hass.services.async_call('switch', 'turn_on', {'entity_id': parent.entity_id}, blocking=True)
            await self.hass.async_block_till_done()
            calls.clear()
            await self.hass.services.async_call('switch', 'turn_off', {'entity_id': child.entity_id}, blocking=True)
            await self.hass.async_block_till_done()
            self.assertEqual(calls, [])
            state = self.hass.states.get(child.entity_id)
            self.assertEqual(state.state, 'on')
            self.assertFalse(state.attributes['own_disabled'])
            self.assertTrue(state.attributes['parent_disabled'])
            self.assertIsNone(state.attributes['disabled_until'])
            response = await self.hass.services.async_call(DOMAIN, 'get_disabled', {'path': state.attributes['path']}, blocking=True, return_response=True)
            self.assertIs(response['disabled'], True)
            await self.hass.services.async_call(DOMAIN, 'set_disabled', {'path': parent.attributes['path'], 'disabled': False}, blocking=True)
            await self.hass.async_block_till_done()
            self.assertEqual(self.hass.states.get(child.entity_id).state, 'off')
            self.assertEqual(calls, [21])
            sub_control = next(s for s in controls if s.attributes['kind'] == 'sub_schedule')
            calls.clear()
            await self.hass.services.async_call('switch', 'turn_on', {'entity_id': sub_control.entity_id}, blocking=True)
            await self.hass.async_block_till_done()
            self.assertEqual(calls, [])
            self.assertEqual(self.hass.states.get(sub_control.entity_id).state, 'on')
            self.assertEqual(self.hass.states.get(child.entity_id).state, 'on')
            self.assertFalse(self.hass.states.get(child.entity_id).attributes['own_disabled'])
            await self.hass.services.async_call('switch', 'turn_off', {'entity_id': sub_control.entity_id}, blocking=True)
            await self.hass.async_block_till_done()
            self.assertEqual(calls, [21])
            self.assertEqual(self.hass.states.get(child.entity_id).state, 'off')

    async def test_control_paths_rename_without_entity_identity_changes_and_delete_cleanly(self):
        from copy import deepcopy
        from test_backend import NOW, fixture

        await async_setup_component(self.hass, 'climate', {})
        entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                            unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        self.hass.states.async_set('climate.kitchen', 'heat', {'supported_features': 1, 'min_temp': 7, 'max_temp': 35, 'target_temp_step': .5, 'temperature': 20})
        section, settings = fixture()
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow', return_value=NOW):
            await entry.runtime_data.save_section(0, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            registry = er.async_get(self.hass)
            before = {s.attributes['path']: s.entity_id for s in self.hass.states.async_all('switch') if s.attributes.get('path')}
            unique = {eid: registry.async_get(eid).unique_id for eid in before.values()}
            section = deepcopy(entry.runtime_data.model['schedules'][0])
            section['name'] = 'Renamed Kitchen'
            section['sub_schedules'][0]['name'] = 'Morning'
            section['sub_schedules'][0]['bands'][0]['start_minute'] = 660
            await entry.runtime_data.save_section(1, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            after = {s.attributes['path']: s.entity_id for s in self.hass.states.async_all('switch') if s.attributes.get('path')}
            self.assertEqual(set(before.values()), set(after.values()))
            self.assertTrue(all('renamed_kitchen' in path for path in after))
            self.assertEqual({eid: registry.async_get(eid).unique_id for eid in after.values()}, unique)
            response = await self.hass.services.async_call(DOMAIN, 'get_disabled', {}, blocking=True, return_response=True)
            self.assertEqual({c['path'] for c in response['controls']}, set(after))
            await entry.runtime_data.save_section(2, 'delete', section['id'])
            await self.hass.async_block_till_done()
            for eid in after.values():
                self.assertIsNone(self.hass.states.get(eid))
                self.assertIsNone(registry.async_get(eid))

    async def test_flat_device_upgrade_preserves_devices_and_entity_customisations(self):
        from test_backend import NOW, fixture
        from custom_components.heating_schedule_manager.switch import entry_devices

        await async_setup_component(self.hass, 'climate', {})
        entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                            unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        self.hass.states.async_set('climate.kitchen', 'heat', {'supported_features': 1, 'min_temp': 7, 'max_temp': 35, 'target_temp_step': .5})
        section, settings = fixture()
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow', return_value=NOW):
            # Model a previously supported flat-device installation using only
            # registry APIs. Unload clears HA's per-setup main registrations.
            with patch.object(dr.DeviceRegistry, 'async_get_or_create_child', None, create=True):
                await entry.runtime_data.save_section(0, 'upsert', section['id'], section, settings)
                await self.hass.async_block_till_done()
            devices = dr.async_get(self.hass)
            registry = er.async_get(self.hass)
            before = {e.unique_id: (e.entity_id, e.device_id) for e in er.async_entries_for_config_entry(registry, entry.entry_id)}
            device_ids = {d.id for d in entry_devices(devices, entry.entry_id)}
            self.assertEqual(len(device_ids), 2)
            sub_switch = next(s for s in self.hass.states.async_all('switch') if s.attributes.get('kind') == 'sub_schedule')
            registry.async_update_entity(sub_switch.entity_id, name='Keep this name')
            self.assertTrue(await self.hass.config_entries.async_reload(entry.entry_id))
            await self.hass.async_block_till_done()
            after = {e.unique_id: (e.entity_id, e.device_id) for e in er.async_entries_for_config_entry(registry, entry.entry_id)}
            self.assertEqual(after, before)
            self.assertEqual({d.id for d in entry_devices(devices, entry.entry_id)}, device_ids)
            self.assertEqual(registry.async_get(sub_switch.entity_id).name, 'Keep this name')
            sub_device = devices.async_get(registry.async_get(sub_switch.entity_id).device_id)
            if hasattr(devices, 'async_get_or_create_child'):
                self.assertIsNotNone(sub_device.parent_device_id)

    async def test_existing_registry_migration_hierarchy_and_sub_deletion(self):
        from copy import deepcopy
        from test_backend import NOW, fixture, uid
        from custom_components.heating_schedule_manager.switch import entry_devices

        await async_setup_component(self.hass, 'climate', {})
        entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                            unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        self.hass.states.async_set('climate.kitchen', 'heat', {'supported_features': 1, 'min_temp': 7, 'max_temp': 35, 'target_temp_step': .5})
        section, settings = fixture()
        sub = section['sub_schedules'][0]
        band = sub['bands'][0]
        other = deepcopy(sub)
        other.update(id=uid(), days=[1], name='Tuesday')
        other['bands'][0]['id'] = uid()
        section['sub_schedules'].append(other)
        registry = er.async_get(self.hass)
        legacy = registry.async_get_or_create('switch', DOMAIN, f"{DOMAIN}_disabled_{band['id']}",
            config_entry=entry, suggested_object_id='my_legacy_band_on_1200_off_1600', original_name='Old default')
        registry.async_update_entity(legacy.entity_id, name='My custom name', icon='mdi:star')
        orphan_id = uid()
        orphan_device = dr.async_get(self.hass).async_get_or_create(config_entry_id=entry.entry_id,
            identifiers={(DOMAIN, 'sub_schedule_' + orphan_id)}, name='Deleted while unloaded',
            entry_type=dr.DeviceEntryType.SERVICE)
        orphan = registry.async_get_or_create('switch', DOMAIN, f'{DOMAIN}_disabled_{orphan_id}',
            config_entry=entry, suggested_object_id='orphan_disabled', device_id=orphan_device.id)
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow', return_value=NOW):
            await entry.runtime_data.save_section(0, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            controls = {s.attributes['id']: s for s in self.hass.states.async_all('switch') if s.attributes.get('path')}
            self.assertEqual(len(controls), 5)
            self.assertIsNone(registry.async_get(orphan.entity_id))
            self.assertIsNone(dr.async_get(self.hass).async_get(orphan_device.id))
            migrated = registry.async_get(legacy.entity_id)
            self.assertEqual(migrated.unique_id, legacy.unique_id)
            self.assertEqual(migrated.name, 'My custom name')
            self.assertEqual(migrated.icon, 'mdi:star')
            self.assertEqual(controls[band['id']].entity_id, legacy.entity_id)
            self.assertEqual(controls[band['id']].attributes['friendly_name'], 'My custom name')
            devices = dr.async_get(self.hass)
            parent_id = registry.async_get(controls[section['id']].entity_id).device_id
            sub_id = registry.async_get(controls[sub['id']].entity_id).device_id
            self.assertEqual(migrated.device_id, sub_id)
            self.assertEqual(len(entry_devices(devices, entry.entry_id)), 3)
            if hasattr(devices, 'async_get_or_create_child'):
                self.assertEqual(devices.async_get(sub_id).parent_device_id, parent_id)
            else:
                self.assertIsNone(getattr(devices.async_get(sub_id), 'parent_device_id', None))
            original_devices = {d.id for d in entry_devices(devices, entry.entry_id)}
            await self.hass.config_entries.async_reload(entry.entry_id)
            await self.hass.async_block_till_done()
            self.assertEqual({d.id for d in entry_devices(devices, entry.entry_id)}, original_devices)
            self.assertEqual(registry.async_get(legacy.entity_id).name, 'My custom name')
            section['name'] = 'Renamed schedule'
            sub['name'] = 'Renamed sub'
            band['end_minute'] = 1020
            await entry.runtime_data.save_section(1, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            self.assertEqual(devices.async_get(parent_id).name, 'Renamed schedule')
            self.assertEqual(devices.async_get(sub_id).name,
                'Renamed sub' if hasattr(devices, 'async_get_or_create_child') else 'Renamed schedule Renamed sub')
            self.assertEqual(registry.async_get(legacy.entity_id).name, 'My custom name')
            section['sub_schedules'].remove(sub)
            await entry.runtime_data.save_section(2, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            self.assertIsNone(registry.async_get(legacy.entity_id))
            self.assertIsNone(devices.async_get(sub_id))
            self.assertIsNotNone(devices.async_get(parent_id))
            await entry.runtime_data.save_section(3, 'delete', section['id'])
            await self.hass.async_block_till_done()
            self.assertEqual(entry_devices(devices, entry.entry_id), [])

    async def test_control_writes_require_admin_but_internal_automations_are_supported(self):
        from homeassistant.exceptions import Unauthorized
        from test_backend import NOW, fixture

        await async_setup_component(self.hass, 'climate', {})
        entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                            unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        self.hass.states.async_set('climate.kitchen', 'heat', {'supported_features': 1, 'min_temp': 7, 'max_temp': 35, 'target_temp_step': .5})
        section, settings = fixture()
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow', return_value=NOW):
            await entry.runtime_data.save_section(0, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            control = next(s for s in self.hass.states.async_all('switch') if s.attributes.get('kind') == 'schedule')
            await self.hass.auth.async_create_user('Owner', group_ids=['system-admin'])
            viewer = await self.hass.auth.async_create_user('Viewer', group_ids=['system-users'])
            self.assertFalse(viewer.is_admin)
            context = Context(user_id=viewer.id)
            for native in [s for s in self.hass.states.async_all('switch') if s.attributes.get('path')]:
                with self.assertRaises(Unauthorized):
                    await self.hass.services.async_call('switch', 'turn_on', {'entity_id': native.entity_id}, blocking=True, context=context)
                with self.assertRaises(Unauthorized):
                    await self.hass.services.async_call(DOMAIN, 'set_disabled', {'path': native.attributes['immutable_path'], 'disabled': True}, blocking=True, context=context)
            result = await self.hass.services.async_call(DOMAIN, 'get_disabled', {'path': control.attributes['path']}, blocking=True, return_response=True, context=context)
            self.assertIs(result['disabled'], False)
            await self.hass.services.async_call(DOMAIN, 'set_disabled', {'path': control.attributes['path'], 'disabled': True}, blocking=True)
            await self.hass.async_block_till_done()
            self.assertTrue(entry.runtime_data.control_states()[section['id']]['disabled'])

    async def test_path_reads_respect_entity_access_and_handlers_survive_reload(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        from homeassistant.exceptions import HomeAssistantError
        from test_backend import NOW, fixture

        await async_setup_component(self.hass, 'climate', {})
        entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                            unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        self.hass.states.async_set('climate.kitchen', 'heat', {'supported_features': 1, 'min_temp': 7, 'max_temp': 35, 'target_temp_step': .5})
        section, settings = fixture()
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow', return_value=NOW):
            await entry.runtime_data.save_section(0, 'upsert', section['id'], section, settings)
            await self.hass.async_block_till_done()
            path = entry.runtime_data.control_states()[section['id']]['path']
            restricted = SimpleNamespace(is_admin=False, permissions=SimpleNamespace(check_entity=lambda eid, permission: False))
            with patch.object(self.hass.auth, 'async_get_user', AsyncMock(return_value=restricted)):
                result = await self.hass.services.async_call(DOMAIN, 'get_disabled', {}, blocking=True, return_response=True, context=Context(user_id='restricted'))
                self.assertEqual(result, {'controls': []})
                for state in entry.runtime_data.control_states().values():
                    for inaccessible in [state['path'], state['immutable_path'], *state.get('legacy_paths', [])]:
                        with self.assertRaises(HomeAssistantError):
                            await self.hass.services.async_call(DOMAIN, 'get_disabled', {'path': inaccessible}, blocking=True, return_response=True, context=Context(user_id='restricted'))
            before = {s.entity_id for s in self.hass.states.async_all('switch') if s.attributes.get('path')}
            self.assertTrue(await self.hass.config_entries.async_unload(entry.entry_id))
            with self.assertRaises(HomeAssistantError):
                await self.hass.services.async_call(DOMAIN, 'get_disabled', {}, blocking=True, return_response=True)
            await self.hass.config_entries.async_setup(entry.entry_id)
            await self.hass.async_block_till_done()
            self.assertEqual({s.entity_id for s in self.hass.states.async_all('switch') if s.attributes.get('path')}, before)
            result = await self.hass.services.async_call(DOMAIN, 'get_disabled', {'path': path}, blocking=True, return_response=True)
            self.assertIs(result['disabled'], False)

    async def test_hacs_only_install_serves_card_and_preserves_module_ownership(self):
        """Only custom_components is installed: no /config/www or manual resources."""
        from aiohttp.test_utils import TestClient, TestServer
        from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL, add_extra_js_url
        from custom_components.heating_schedule_manager.frontend import CARD_PATH, CARD_URL

        entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                            unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        self.assertEqual(entry.state, ConfigEntryState.LOADED)
        self.assertFalse(Path(self.tmp.name, 'www').exists())
        modules = self.hass.data[DATA_EXTRA_MODULE_URL]
        self.assertIn(CARD_URL, modules.urls)
        add_extra_js_url(self.hass, '/unrelated-card.js')
        await entry.runtime_data.set_away(True)

        async with TestClient(TestServer(self.hass.http.app)) as client:
            response = await client.get(CARD_URL)
            self.assertEqual(response.status, 200)
            loader = await response.read()
            self.assertIn(b"whenDefined('home-assistant')", loader)
            self.assertIn('javascript', response.headers['Content-Type'])
            response = await client.get(CARD_PATH)
            bundle = await response.read()
            self.assertIn(b'scheduling-manager-card', bundle)
            alias = await client.get(f'/{DOMAIN}/heating-schedule-manager-card.js')
            self.assertEqual(await alias.read(), bundle)

            self.assertTrue(await self.hass.config_entries.async_unload(entry.entry_id))
            self.assertNotIn(CARD_URL, modules.urls)
            self.assertIn('/unrelated-card.js', modules.urls)
            self.assertTrue(await self.hass.config_entries.async_setup(entry.entry_id))
            self.assertIn(CARD_URL, modules.urls)
            self.assertTrue(entry.runtime_data.model['away'])
            response = await client.get(CARD_PATH)
            self.assertEqual(await response.read(), bundle)
            await self.hass.config_entries.async_remove(entry.entry_id)
            self.assertNotIn(CARD_URL, modules.urls)
            self.assertIn('/unrelated-card.js', modules.urls)

    async def test_store_restart_and_corruption_original_preserved(self):
        manager=Manager(self.hass)
        await manager.start();await manager.set_away(True);await manager.stop()
        restored=Manager(self.hass);await restored.start();self.assertTrue(restored.model['away']);await restored.stop()
        path=Path(restored.store.path)
        path.write_text('{broken JSON',encoding='utf-8')
        broken=Manager(self.hass)
        with self.assertRaises(ValueError):await broken.start()
        self.assertEqual(path.read_text(),'{broken JSON')
        self.assertEqual(list(path.parent.glob(f'{DOMAIN}.corrupt*')),[])
        path.write_text('{}',encoding='utf-8')
        with self.assertRaises(ValueError):await Manager(self.hass).start()
        self.assertEqual(path.read_text(),'{}')

    async def test_yaml_dashboard_resources_remain_unchanged(self):
        from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL
        from homeassistant.components.lovelace import LOVELACE_DATA
        from custom_components.heating_schedule_manager.frontend import CARD_URL

        resources = [{'url': '/other-yaml-card.js', 'type': 'module'}]
        self.assertTrue(await async_setup_component(self.hass, 'lovelace', {
            'lovelace': {'resource_mode': 'yaml', 'resources': resources},
        }))
        collection = self.hass.data[LOVELACE_DATA].resources
        before = list(collection.async_items())
        entry = ConfigEntry(domain=DOMAIN, title='Scheduling Manager', data={}, options={}, source=SOURCE_USER,
                            unique_id=DOMAIN, version=1, minor_version=1, discovery_keys={}, subentries_data=[])
        await self.hass.config_entries.async_add(entry)
        self.assertEqual(entry.state, ConfigEntryState.LOADED)
        self.assertIn(CARD_URL, self.hass.data[DATA_EXTRA_MODULE_URL].urls)
        self.assertEqual(collection.async_items(), before)
        await self.hass.config_entries.async_remove(entry.entry_id)
        self.assertEqual(collection.async_items(), before)

    async def test_actual_climate_entity_temperature_api(self):
        from homeassistant.components.climate import ClimateEntity, DATA_COMPONENT
        from homeassistant.components.climate.const import ClimateEntityFeature, HVACMode
        from homeassistant.const import UnitOfTemperature
        from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
        from unittest.mock import patch
        from test_backend import fixture, NOW
        class MockClimate(ClimateEntity):
            _attr_name='Kitchen'
            _attr_unique_id='mock-kitchen'
            _attr_temperature_unit=UnitOfTemperature.CELSIUS
            _attr_min_temp=7
            _attr_max_temp=35
            _attr_hvac_mode=HVACMode.HEAT
            _attr_hvac_modes=[HVACMode.HEAT]
            _attr_target_temperature=20
            _attr_target_temperature_step=.5
            _attr_supported_features=ClimateEntityFeature.TARGET_TEMPERATURE
            def __init__(self):self.calls=[]
            async def async_set_temperature(self,**kwargs):
                self.calls.append(kwargs)
                self._attr_target_temperature=kwargs['temperature']
                self.async_write_ha_state()
        self.assertTrue(await async_setup_component(self.hass,'climate',{}))
        mock=MockClimate();await self.hass.data[DATA_COMPONENT].async_add_entities([mock])
        clock=NOW
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow',side_effect=lambda:clock):
            manager=Manager(self.hass);await manager.start()
            section,settings=fixture(target=20)
            next(iter(settings.values()))['setback']['value']=10
            await manager.save_section(0,'upsert',section['id'],section,settings)
            clock=NOW.replace(hour=12);await manager.tick()
            self.assertEqual(mock.calls,[{'entity_id':[mock.entity_id],'temperature':20}])
            self.hass.config.units=US_CUSTOMARY_SYSTEM
            mock.async_write_ha_state()
            clock=NOW.replace(hour=16);await manager.tick()
            self.assertEqual(mock.calls[-1],{'entity_id':[mock.entity_id],'temperature':10})  # service converts 50°F back to 10°C
            await manager.stop()

    async def test_config_flow_single_instance(self):
        flow=HeatingScheduleFlow();flow.hass=self.hass
        flow.context={'source':SOURCE_USER};flow.flow_id='test'
        result=await flow.async_step_user()
        self.assertEqual(result['type'],'form')
        result=await flow.async_step_user({})
        self.assertEqual(result['type'],'create_entry')

    async def test_real_light_select_number_service_helpers(self):
        from homeassistant.components.light import LightEntity, ColorMode, DATA_COMPONENT as LIGHT
        from homeassistant.components.select import SelectEntity, DATA_COMPONENT as SELECT
        from homeassistant.components.number import NumberEntity, DATA_COMPONENT as NUMBER
        from unittest.mock import patch
        from test_backend import fixture, NOW, uid
        class Light(LightEntity):
            _attr_name='Fixture'
            _attr_unique_id='test-light'
            _attr_is_on=False
            _attr_supported_color_modes={ColorMode.ONOFF}
            def __init__(self):self.calls=[]
            async def async_turn_on(self,**kwargs):self.calls.append('on');self._attr_is_on=True;self.async_write_ha_state()
            async def async_turn_off(self,**kwargs):self.calls.append('off');self._attr_is_on=False;self.async_write_ha_state()
        class Select(SelectEntity):
            _attr_name='Fixture'
            _attr_unique_id='test-select'
            _attr_options=['Relax','Focus']
            _attr_current_option='Relax'
            def __init__(self):self.calls=[]
            async def async_select_option(self,option):self.calls.append(option);self._attr_current_option=option;self.async_write_ha_state()
        class Number(NumberEntity):
            _attr_name='Fixture'
            _attr_unique_id='test-number'
            _attr_native_min_value=0
            _attr_native_max_value=100
            _attr_native_step=.5
            _attr_native_value=20
            def __init__(self):self.calls=[]
            async def async_set_native_value(self,value):self.calls.append(value);self._attr_native_value=value;self.async_write_ha_state()
        for domain in ('light','select','number'):self.assertTrue(await async_setup_component(self.hass,domain,{}))
        light,select,number=Light(),Select(),Number()
        await self.hass.data[LIGHT].async_add_entities([light]);await self.hass.data[SELECT].async_add_entities([select]);await self.hass.data[NUMBER].async_add_entities([number])
        clock=NOW
        with patch('custom_components.heating_schedule_manager.scheduler.dt_util.utcnow',side_effect=lambda:clock):
            manager=Manager(self.hass);await manager.start();section,_=fixture();section['entities']=[];settings={}
            for entity,start,end in ((light,'on','off'),(select,'Focus','Relax'),(number,30.5,10)):
                key=uid();settings[key]={'entity_id':entity.entity_id,'registry_id':None};section['entities'].append({'entity_key':key,'start_state':start,'end_state':end})
            await manager.save_section(0,'upsert',section['id'],section,settings)
            clock=NOW.replace(hour=12);await manager.tick();clock=NOW.replace(hour=16);await manager.tick()
            self.assertEqual(light.calls,['on','off']);self.assertEqual(select.calls,['Focus','Relax']);self.assertEqual(number.calls,[30.5,10])
            self.assertFalse(manager.snapshot['runtime']['errors']);await manager.stop()

    async def test_official_state_action_service_schemas(self):
        from custom_components.heating_schedule_manager.actions import state_action
        domains={'date':('2026-10-06',{}),'time':('08:30:00',{}),'datetime':('2026-10-06T08:30:00',{}),
                 'input_datetime':('2026-10-06 08:30:00',{'has_date':True,'has_time':True}),
                 'input_select':('Focus',{'options':['Relax','Focus']}),'input_number':(10,{'min':0,'max':100,'step':1}),
                 'input_text':('Morning scene',{'min':0,'max':255}), 'valve':('open',{'supported_features':1}),
                 'fan':('on',{'supported_features':32}), 'water_heater':('eco',{'supported_features':2,'operation_list':['eco']}),
                 'timer':('active',{})}
        for domain,(value,attrs) in domains.items():
            self.assertTrue(await async_setup_component(self.hass,domain,{}))
            self.hass.states.async_set(domain+'.test','off',attrs)
        manager=Manager(self.hass);await manager.start()
        services=self.hass.services.async_services()
        for domain,(value,_) in domains.items():
            cap=manager.capabilities()[domain+'.test'];service,data=state_action(value,cap)
            schema=services[domain][service].schema
            if schema:schema({'entity_id':domain+'.test',**data})
        await manager.stop()
