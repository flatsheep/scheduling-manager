"""Programmatic paths and controls, using isolated HA and mocked devices."""
from copy import deepcopy
import unittest
from unittest.mock import patch

import test_backend
from test_backend import NOW, fixture, uid
from custom_components.scheduling_manager.controls import control_states
from custom_components.scheduling_manager.services import async_register
from custom_components.scheduling_manager.validation import Invalid


def named_fixture():
    section, settings = fixture()
    section['name'] = 'Schedule1'
    section['sub_schedules'][0]['name'] = 'Weekdays'
    return section, settings


class PathTests(unittest.TestCase):
    def model(self):
        section, settings = named_fixture()
        return {'revision': 0, 'away': False, 'schedules': [section], 'entity_settings': settings}

    def test_paths_follow_names_and_configured_times(self):
        model = self.model()
        section = model['schedules'][0]
        band = section['sub_schedules'][0]['bands'][0]
        band.update(start_minute=420, end_minute=600)
        controls = control_states(model, NOW)
        self.assertEqual(controls[section['id']]['path'], 'schedule_manager.schedule1.disabled')
        self.assertEqual(controls[band['id']]['path'], 'schedule_manager.schedule1.weekdays.band-start-0700-stop-1000.disabled')
        self.assertEqual(controls[band['id']]['legacy_paths'], ['schedule_manager.schedule1.weekdays.band-on-0700-off-1000.disabled'])
        section['name'] = 'Kitchen Heating'
        band['end_minute'] = 1440
        renamed = control_states(model, NOW)
        self.assertEqual(set(renamed), set(controls))
        self.assertEqual(renamed[band['id']]['path'], 'schedule_manager.kitchen_heating.weekdays.band-start-0700-stop-2359.disabled')
        self.assertEqual(renamed[band['id']]['immutable_path'], controls[band['id']]['immutable_path'])
        self.assertEqual(len(renamed), 3)

    def test_names_collide_without_target_ambiguity(self):
        model = self.model()
        other, settings = named_fixture()
        other['name'] = 'SCHEDULE1'
        model['schedules'].append(other)
        model['entity_settings'].update(settings)
        controls = control_states(model, NOW)
        self.assertEqual(len({c['path'] for c in controls.values()}), len(controls))
        paths = {key: c['path'] for key, c in controls.items()}
        model['schedules'].reverse()
        self.assertEqual({key: c['path'] for key, c in control_states(model, NOW).items()}, paths)
        self.assertTrue(all('__id_' in c['path'] for c in controls.values()))

    def test_sub_names_and_solar_band_collisions_are_disambiguated(self):
        model = self.model()
        section = model['schedules'][0]
        sub = section['sub_schedules'][0]
        sub.pop('name')
        band = sub['bands'][0]
        band.update(start_dynamic={'event': 'sunrise', 'offset': 30})
        band['end_minute'] = 600
        twin = deepcopy(band)
        twin['id'] = uid()
        sub['bands'].append(twin)
        other = deepcopy(sub)
        other.update(id=uid(), name='sub schedule 1')
        other['bands'] = [{**deepcopy(band), 'id': uid(), 'start_dynamic': {'event': 'sunset', 'offset': -15}}]
        section['sub_schedules'].append(other)
        controls = control_states(model, NOW)
        self.assertEqual(len({c['path'] for c in controls.values()}), len(controls))
        self.assertIn('sub_schedule_1__id_', controls[band['id']]['path'])
        self.assertIn('band-start-sunrise-plus-30-stop-1000__id_', controls[band['id']]['path'])
        self.assertIn('sunset-minus-15', controls[other['bands'][0]['id']]['path'])

    def test_effective_parent_flags_do_not_change_band_preferences(self):
        model = self.model()
        section = model['schedules'][0]
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T11:00Z')
        section['enabled'] = False
        before = deepcopy(model)
        controls = control_states(model, NOW.replace(hour=12))
        self.assertEqual(model, before)
        self.assertTrue(controls[band['id']]['disabled'])
        self.assertFalse(controls[band['id']]['own_disabled'])
        self.assertTrue(controls[band['id']]['parent_disabled'])
        self.assertIsNone(controls[band['id']]['disabled_until'])
        section['enabled'] = True
        model['away'] = True
        target = control_states(model, NOW.replace(hour=12))[band['id']]
        self.assertFalse(target['disabled'])
        self.assertTrue(target['suspended_by_away'])


class ControlTests(unittest.IsolatedAsyncioTestCase):
    set_state = test_backend.IntegrationTests.set_state
    save = test_backend.IntegrationTests.save
    at = test_backend.IntegrationTests.at
    restart = test_backend.IntegrationTests.restart
    asyncSetUp = test_backend.IntegrationTests.asyncSetUp
    asyncTearDown = test_backend.IntegrationTests.asyncTearDown

    def path(self, key):
        return self.manager.control_states()[key]['path']

    async def test_parent_toggle_preserves_individually_disabled_bands(self):
        section, settings = named_fixture()
        sub = section['sub_schedules'][0]
        sub['bands'].append({'id': uid(), 'start_minute': 1020, 'end_minute': 1080, 'enabled': False})
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        before = deepcopy(self.manager.model['schedules'][0]['sub_schedules'])
        await self.manager.set_disabled(self.path(section['id']), True)
        await self.hass.async_block_till_done()
        controls = self.manager.control_states()
        self.assertTrue(all(c['disabled'] for c in controls.values()))
        self.assertFalse(controls[sub['bands'][0]['id']]['own_disabled'])
        self.assertTrue(controls[sub['bands'][1]['id']]['own_disabled'])
        await self.manager.set_disabled(self.path(section['id']), False)
        await self.hass.async_block_till_done()
        self.assertEqual(self.manager.model['schedules'][0]['sub_schedules'], before)
        self.assertFalse(self.manager.control_states()[sub['bands'][0]['id']]['disabled'])
        self.assertTrue(self.manager.control_states()[sub['bands'][1]['id']]['disabled'])
        self.assertEqual([c['temperature'] for c in self.calls], [13, 21])

    async def test_band_disable_sends_no_end_and_enable_cancels_until(self):
        section, settings = named_fixture()
        band = section['sub_schedules'][0]['bands'][0]
        await self.save(section, settings)
        await self.at(12)
        self.calls.clear()
        await self.manager.set_disabled(self.path(band['id']), True)
        self.assertEqual(self.calls, [])
        self.assertTrue(self.manager.control_states()[band['id']]['own_disabled'])
        await self.at(16)
        self.assertEqual(self.calls, [])
        self.clock = NOW.replace(hour=13)
        section = deepcopy(self.manager.model['schedules'][0])
        section['sub_schedules'][0]['bands'][0]['disabled_until'] = '2026-07-06T15:00Z'
        await self.save(section, settings)
        await self.manager.set_disabled(self.path(band['id']), False)
        await self.hass.async_block_till_done()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        saved = self.manager.model['schedules'][0]['sub_schedules'][0]['bands'][0]
        self.assertNotIn('disabled_until', saved)
        self.assertFalse(self.manager.control_states()[band['id']]['disabled'])

    async def test_child_enable_does_not_enable_parent_and_survives_restart(self):
        section, settings = named_fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T15:00Z')
        await self.save(section, settings)
        await self.manager.set_disabled(self.path(section['id']), True)
        await self.hass.async_block_till_done()
        self.calls.clear()
        self.clock = NOW.replace(hour=13)
        await self.manager.set_disabled(self.path(band['id']), False)
        await self.hass.async_block_till_done()
        self.assertEqual(self.calls, [])
        self.assertTrue(self.manager.control_states()[band['id']]['disabled'])
        self.assertFalse(self.manager.control_states()[band['id']]['own_disabled'])
        await self.restart()
        await self.manager.set_disabled(self.path(section['id']), False)
        await self.hass.async_block_till_done()
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_setting_true_replaces_deadline_and_is_idempotent(self):
        section, settings = named_fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T15:00Z')
        await self.save(section, settings)
        await self.manager.set_disabled(self.path(band['id']), True)
        revision = self.manager.model['revision']
        await self.manager.set_disabled(self.path(band['id']), True)
        self.assertEqual(self.manager.model['revision'], revision)
        self.assertIsNone(self.manager.control_states()[band['id']]['disabled_until'])
        await self.manager.set_disabled(self.path(band['id']), False)
        await self.manager.set_disabled(self.path(band['id']), False)
        self.assertEqual(self.calls, [])  # Outside the band's hours.

    async def test_invalid_paths_and_values_are_rejected(self):
        section, settings = named_fixture()
        await self.save(section, settings)
        before = deepcopy(self.manager.snapshot)
        for path, value in (('schedule_manager.schedule1.missing.disabled', True),
                            ('schedule_manager.missing.disabled', False), (None, True),
                            (self.path(section['id']), 'true'), (self.path(section['id']), 1)):
            with self.assertRaises(Invalid):
                await self.manager.set_disabled(path, value)
            self.assertEqual(self.manager.snapshot, before)

    async def test_old_path_after_rename_cannot_target_another_schedule(self):
        section, settings = named_fixture()
        await self.save(section, settings)
        old_path = self.path(section['id'])
        section['name'] = 'Renamed schedule'
        await self.save(section, settings)
        with self.assertRaises(Invalid):
            await self.manager.set_disabled(old_path, True)
        await self.manager.set_disabled(self.path(section['id']), True)
        self.assertTrue(self.manager.control_states()[section['id']]['disabled'])

    async def test_storage_failure_keeps_previous_control_state(self):
        section, settings = named_fixture()
        await self.save(section, settings)
        before = deepcopy(self.manager.snapshot)
        self.store.fail = True
        for key in (section['id'], section['sub_schedules'][0]['bands'][0]['id']):
            with self.assertRaises(OSError):
                await self.manager.set_disabled(self.path(key), True)
            self.assertEqual(self.manager.snapshot, before)
        self.store.fail = False

    async def test_actions_get_and_set_real_booleans_and_discover_paths(self):
        section, settings = named_fixture()
        await self.save(section, settings)
        await async_register(self.hass)
        with patch('custom_components.scheduling_manager.services.get_manager', return_value=self.manager):
            result = await self.hass.services.async_call('scheduling_manager', 'get_disabled', {},
                                                         blocking=True, return_response=True)
            self.assertEqual(len(result['controls']), 3)
            path = self.path(section['id'])
            result = await self.hass.services.async_call('scheduling_manager', 'set_disabled',
                                                         {'path': path, 'disabled': True}, blocking=True, return_response=True)
            self.assertIs(result['disabled'], True)
            band = section['sub_schedules'][0]['bands'][0]
            state = self.manager.control_states()[band['id']]
            for alias in (state['path'], state['immutable_path'], state['legacy_paths'][0]):
                result = await self.hass.services.async_call('scheduling_manager', 'get_disabled',
                    {'path': alias}, blocking=True, return_response=True)
                self.assertEqual(result['id'], band['id'])
                self.assertTrue(result['parent_disabled'])
            result = await self.hass.services.async_call('scheduling_manager', 'get_disabled',
                                                         {'path': path}, blocking=True, return_response=True)
            self.assertIs(result['disabled'], True)
