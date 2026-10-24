"""Band suspension checks with isolated HA and mocked device actions."""
from copy import deepcopy
import asyncio
from datetime import datetime, timedelta, timezone
import unittest

import test_backend
import test_timed_away
from test_backend import CAP, NOW, fixture, uid
from custom_components.scheduling_manager.events import compile_events, section_active
from custom_components.scheduling_manager.validation import Invalid, validate


class BandTests(unittest.IsolatedAsyncioTestCase):
    set_state = test_backend.IntegrationTests.set_state
    save = test_backend.IntegrationTests.save
    at = test_backend.IntegrationTests.at
    restart = test_backend.IntegrationTests.restart
    asyncSetUp = test_timed_away.TimedAwayTests.asyncSetUp
    asyncTearDown = test_timed_away.TimedAwayTests.asyncTearDown

    async def test_permanent_suspension_is_per_band_and_survives_restart(self):
        section, settings = fixture()
        bands = section['sub_schedules'][0]['bands']
        bands[0]['enabled'] = False
        bands.append({'id': uid(), 'start_minute': 1020, 'end_minute': 1080})
        await self.save(section, settings)
        await self.at(12)
        self.assertFalse(self.manager.schedule_activity()[section['id']]['active'])
        await self.at(16)
        await self.restart()
        self.assertEqual(self.calls, [])
        await self.at(17)
        await self.at(18)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])
        self.assertTrue(self.manager.model['schedules'][0]['enabled'])

    async def test_disable_active_band_keeps_settings_and_ignores_its_end(self):
        section, settings = fixture()
        await self.save(section, settings)
        await self.at(12)
        self.calls.clear()
        self.clock = NOW.replace(hour=13)
        section['sub_schedules'][0]['bands'][0]['enabled'] = False
        await self.save(section, settings)
        self.assertEqual(self.calls, [])
        await self.at(16)
        self.assertEqual(self.calls, [])
        section['sub_schedules'][0]['bands'][0].pop('enabled')
        await self.save(section, settings)
        self.assertEqual(self.calls, [])
        await self.at(12, day=7)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_expiry_resumes_active_start_and_future_end_runs(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T13:00')
        await self.save(section, settings)
        self.assertEqual(self.armed[-1], NOW.replace(hour=13))
        await self.at(12)
        await self.restart()
        await self.at(13)
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        await self.manager.tick()
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        self.assertTrue(self.manager.schedule_activity()[section['id']]['active'])
        await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_offline_expiry_ignores_disabled_endpoints_and_coalesces_later_work(self):
        section, settings = fixture()
        section['sub_schedules'][0]['bands'][0].update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        self.clock = NOW.replace(hour=14)
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        self.clock = NOW.replace(hour=17)
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_expiry_exactly_at_start_and_end(self):
        for hour, endpoints in ((11, ['start', 'end']), (12, ['start', 'end']), (13, ['start', 'end']), (16, ['end']), (17, [])):
            section, settings = fixture()
            section['sub_schedules'][0]['bands'][0].update(enabled=False, disabled_until=NOW.replace(hour=hour).isoformat())
            model = {'revision': 0, 'away': False, 'entity_settings': settings, 'schedules': [section]}
            events = compile_events(model, timezone.utc, NOW, NOW.replace(hour=18))
            self.assertEqual([e.endpoint for e in events], endpoints)

    async def test_local_deadline_uses_ha_timezone_and_invalid_save_is_atomic(self):
        self.hass.config.time_zone = 'Europe/London'
        await self.manager._refresh_environment()
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T14:00')
        await self.save(section, settings)
        saved_band = self.manager.model['schedules'][0]['sub_schedules'][0]['bands'][0]
        self.assertEqual(saved_band['disabled_until'], '2026-07-06T13:00:00+00:00')
        before = deepcopy(self.manager.snapshot)
        for value in ('bad', '2026-07-06T09:00Z', '2027-03-28T01:30'):
            band['disabled_until'] = value
            with self.assertRaises(Invalid):
                await self.save(section, settings)
            self.assertEqual(self.manager.snapshot, before)
        # An unchanged, expired saved deadline remains valid on unrelated edits.
        section = deepcopy(self.manager.model['schedules'][0])
        self.clock = NOW.replace(hour=17)
        section['name'] = 'Renamed'
        await self.save(section, settings)

    async def test_legacy_validation_and_solar_suppression(self):
        section, settings = fixture()
        model = {'revision': 0, 'away': False, 'entity_settings': settings, 'schedules': [section]}
        self.assertTrue(section_active(section, timezone.utc, NOW.replace(hour=13)))
        validate(model, {'climate.kitchen': CAP})
        band = section['sub_schedules'][0]['bands'][0]
        for value in (0, 1, None, 'false'):
            band['enabled'] = value
            with self.assertRaises(Invalid):
                validate(model, {'climate.kitchen': CAP})
        band.update(enabled=True, disabled_until=NOW.isoformat())
        with self.assertRaises(Invalid):
            validate(model, {'climate.kitchen': CAP})
        band.update(enabled=False, disabled_until='not-a-time')
        with self.assertRaises(Invalid):
            validate(model, {'climate.kitchen': CAP})
        band.pop('disabled_until')
        band['start_dynamic'] = {'event': 'sunrise', 'offset': 0}
        self.assertEqual(compile_events(model, timezone.utc, NOW-timedelta(days=1), NOW.replace(hour=18), lambda day, event: 720), [])

    async def test_nonclimate_suspension_and_schedule_disable_remain_independent(self):
        calls = []
        async def state(call):
            calls.append(call.service)
        self.hass.services.async_register('switch', 'turn_on', state)
        self.hass.services.async_register('switch', 'turn_off', state)
        self.hass.states.async_set('switch.test', 'off')
        section, _ = fixture()
        key = uid()
        section['entities'] = [{'entity_key': key, 'start_state': 'on', 'end_state': 'off'}]
        settings = {key: {'entity_id': 'switch.test', 'registry_id': None}}
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        await self.at(12)
        await self.at(13)
        self.assertEqual(calls, ['turn_on'])
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        await self.at(16)
        self.assertEqual(calls, ['turn_on'])

    async def test_storage_failure_preserves_existing_band_and_timer(self):
        section, settings = fixture()
        await self.save(section, settings)
        before = deepcopy(self.manager.snapshot)
        section['sub_schedules'][0]['bands'][0]['enabled'] = False
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.save(section, settings)
        self.assertEqual(self.manager.snapshot, before)
        self.store.fail = False
        await self.at(12)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_immediate_enable_resumes_active_band_without_waiting_for_save(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T15:00Z')
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        await self.manager.enable_band(self.manager.model['revision'], section['id'], band['id'])
        saved_band = self.store.data['model']['schedules'][0]['sub_schedules'][0]['bands'][0]
        self.assertNotIn('enabled', saved_band)
        self.assertNotIn('disabled_until', saved_band)
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_immediate_enable_outside_band_waits_for_next_start(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        await self.manager.enable_band(self.manager.model['revision'], section['id'], band['id'])
        self.assertEqual(self.calls, [])
        await self.restart()
        await self.manager.enable_band(self.manager.model['revision'], section['id'], band['id'])
        self.assertEqual(self.calls, [])
        await self.at(12)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_active_enable_journals_state_actions_and_preserves_other_bands(self):
        actions = []
        async def state(call):
            actions.append(call.service)
        self.hass.services.async_register('switch', 'turn_on', state)
        self.hass.services.async_register('switch', 'turn_off', state)
        self.hass.states.async_set('switch.test', 'off')
        section, settings = fixture()
        key = uid()
        settings[key] = {'entity_id': 'switch.test', 'registry_id': None}
        section['entities'].append({'entity_key': key, 'start_state': 'on', 'end_state': 'off'})
        bands = section['sub_schedules'][0]['bands']
        bands[0]['enabled'] = False
        bands.append({'id': uid(), 'start_minute': 1020, 'end_minute': 1080, 'enabled': False})
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        await self.manager.enable_band(self.manager.model['revision'], section['id'], bands[0]['id'])
        self.assertEqual(actions, ['turn_on'])
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        self.assertFalse(self.manager.model['schedules'][0]['sub_schedules'][0]['bands'][1]['enabled'])

    async def test_enable_validation_conflicts_and_schedule_away_gates(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        for sid, bid, revision in ((section['id'], band['id'], 0),
                                    (uid(), band['id'], 1),
                                    (section['id'], uid(), 1),
                                    (section['id'], band['id'], True)):
            with self.assertRaises(Invalid):
                await self.manager.enable_band(revision, sid, bid)
        self.clock = NOW.replace(hour=13)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        self.calls.clear()
        await self.manager.enable_band(self.manager.model['revision'], section['id'], band['id'])
        self.assertEqual(self.calls, [])
        await self.save(section, settings)  # Suspend the band again, keeping the section disabled.
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], True)
        await self.manager.set_away(True)
        self.calls.clear()
        await self.manager.enable_band(self.manager.model['revision'], section['id'], band['id'])
        self.assertEqual(self.calls, [])

    async def test_enable_failure_retains_suspension_without_start_commands(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        revision = self.manager.model['revision']
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.manager.enable_band(revision, section['id'], band['id'])
        self.assertFalse(self.manager.model['schedules'][0]['sub_schedules'][0]['bands'][0]['enabled'])
        self.assertEqual(self.manager.model['revision'], revision)
        self.assertEqual(self.calls, [])
        self.store.fail = False

    async def test_deferred_enable_persists_before_start_delivery(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        gate = asyncio.Event()
        async def slow(call):
            await gate.wait()
            self.calls.append(deepcopy(call.data))
        self.hass.services.async_register('climate', 'set_temperature', slow)
        self.clock = NOW.replace(hour=13)
        result = await self.manager.enable_band(self.manager.model['revision'], section['id'], band['id'], defer_dispatch=True)
        self.assertTrue(result['applying'])
        self.assertNotIn('enabled', self.store.data['model']['schedules'][0]['sub_schedules'][0]['bands'][0])
        self.assertEqual(self.calls, [])
        gate.set()
        await self.hass.async_block_till_done()
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_immediate_enable_at_start_has_no_implicit_duplicate(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        self.clock = NOW.replace(hour=12)
        await self.manager.enable_band(self.manager.model['revision'], section['id'], band['id'])
        await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_enable_checks_this_band_not_another_active_band(self):
        section, settings = fixture()
        bands = section['sub_schedules'][0]['bands']
        bands.append({'id': uid(), 'start_minute': 1020, 'end_minute': 1080, 'enabled': False})
        await self.save(section, settings)
        await self.at(13)
        self.calls.clear()
        await self.manager.enable_band(self.manager.model['revision'], section['id'], bands[1]['id'])
        self.assertEqual(self.calls, [])
        await self.at(17)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_enable_on_unassigned_weekday_sends_no_start(self):
        section, settings = fixture(days=[1])
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        await self.manager.enable_band(self.manager.model['revision'], section['id'], band['id'])
        self.assertEqual(self.calls, [])

    async def test_restart_after_expiry_and_end_coalesces_without_transient_start(self):
        section, settings = fixture()
        section['sub_schedules'][0]['bands'][0].update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        self.clock = NOW.replace(hour=17)
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [13])

    async def test_expiry_persistence_failure_retries_start_once(self):
        section, settings = fixture()
        section['sub_schedules'][0]['bands'][0].update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        await self.at(12)
        before = deepcopy(self.manager.snapshot)
        self.store.fail = True
        with self.assertLogs('custom_components.scheduling_manager.scheduler', level='ERROR'):
            await self.at(13)
        self.assertEqual(self.manager.snapshot, before)
        self.assertEqual(self.calls, [])
        self.store.fail = False
        await self.manager.tick()
        await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_manual_enable_at_expiry_does_not_duplicate_automatic_start(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        await self.manager.enable_band(self.manager.model['revision'], section['id'], band['id'])
        await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_expiry_respects_away_and_resumes_when_away_ends(self):
        section, settings = fixture()
        section['sub_schedules'][0]['bands'][0].update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        await self.manager.set_away(True)
        self.calls.clear()
        await self.at(13)
        self.assertEqual(self.calls, [])
        await self.manager.set_away(False)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_expiry_respects_disabled_schedule(self):
        section, settings = fixture()
        section['sub_schedules'][0]['bands'][0].update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        self.calls.clear()
        await self.at(13)
        self.assertEqual(self.calls, [])
        self.assertFalse(self.manager.schedule_activity()[section['id']]['active'])

    async def test_resume_compilation_handles_solar_collapse_and_dst_fold(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T13:00Z', start_dynamic={'event': 'sunrise', 'offset': 0})
        model = {'revision': 0, 'away': False, 'entity_settings': settings, 'schedules': [section]}
        events = compile_events(model, timezone.utc, NOW, NOW.replace(hour=18), lambda day, event: 720)
        self.assertEqual([(e.instant.hour, e.endpoint) for e in events], [(13, 'start'), (16, 'end')])
        self.assertIn(':resume:', events[0].occurrence)
        events = compile_events(model, timezone.utc, NOW, NOW.replace(hour=18), lambda day, event: 1020)
        self.assertFalse(any(e.endpoint == 'start' for e in events))
        band.pop('start_dynamic')
        band.update(start_minute=60, end_minute=120, disabled_until='2026-10-25T01:30Z')
        section['sub_schedules'][0]['days'] = [6]
        after = datetime(2026, 10, 25, 0, 15, tzinfo=timezone.utc)
        events = compile_events(model, test_backend.LONDON, after, after.replace(hour=3))
        self.assertEqual([(e.instant.hour, e.instant.minute, e.endpoint) for e in events], [(1, 30, 'start'), (2, 0, 'end')])

    async def test_save_enabling_active_band_uses_new_settings_and_runs_once(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        band.pop('enabled')
        section['entities'][0]['target']['value'] = 22.5
        await self.save(section, settings)
        self.assertEqual([c['temperature'] for c in self.calls], [22.5])
        await self.manager.tick()
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [22.5])
        await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls], [22.5, 13])

    async def test_save_enabling_at_start_does_not_duplicate_boundary_event(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        self.clock = NOW.replace(hour=12)
        band['enabled'] = True
        await self.save(section, settings)
        await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_save_enabling_outside_edited_band_waits_for_its_start(self):
        section, settings = fixture()
        bands = section['sub_schedules'][0]['bands']
        bands.append({'id': uid(), 'start_minute': 1020, 'end_minute': 1080, 'enabled': False})
        await self.save(section, settings)
        await self.at(13)
        self.calls.clear()
        bands[1].pop('enabled')
        await self.save(section, settings)
        self.assertEqual(self.calls, [])
        await self.at(17)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_save_enabling_respects_schedule_disable_and_away(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        self.clock = NOW.replace(hour=13)
        self.calls.clear()
        band.pop('enabled')
        await self.save(section, settings)
        self.assertEqual(self.calls, [])
        band['enabled'] = False
        await self.save(section, settings)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], True)
        await self.manager.set_away(True)
        self.calls.clear()
        band.pop('enabled')
        await self.save(section, settings)
        self.assertEqual(self.calls, [])

    async def test_failed_enable_save_is_atomic_and_retries_without_early_start(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        before = deepcopy(self.manager.snapshot)
        self.clock = NOW.replace(hour=13)
        band.pop('enabled')
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.save(section, settings)
        self.assertEqual(self.manager.snapshot, before)
        self.assertEqual(self.calls, [])
        self.store.fail = False
        await self.save(section, settings)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_save_enabling_active_band_runs_state_start(self):
        actions = []
        async def state(call):
            actions.append(call.service)
        self.hass.services.async_register('switch', 'turn_on', state)
        self.hass.services.async_register('switch', 'turn_off', state)
        self.hass.states.async_set('switch.test', 'off')
        section, settings = fixture()
        key = uid()
        settings[key] = {'entity_id': 'switch.test', 'registry_id': None}
        section['entities'].append({'entity_key': key, 'start_state': 'on', 'end_state': 'off'})
        band = section['sub_schedules'][0]['bands'][0]
        band['enabled'] = False
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        band.pop('enabled')
        await self.save(section, settings)
        self.assertEqual(actions, ['turn_on'])
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_save_after_expiry_does_not_duplicate_automatic_start(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        await self.at(13)
        self.calls.clear()
        band.pop('enabled')
        band.pop('disabled_until')
        await self.save(section, settings)
        self.assertEqual(self.calls, [])

    async def test_save_enabling_at_unprocessed_expiry_runs_start_once(self):
        section, settings = fixture()
        band = section['sub_schedules'][0]['bands'][0]
        band.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        band.pop('enabled')
        band.pop('disabled_until')
        await self.save(section, settings)
        await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_name_save_at_expiry_leaves_automatic_resume_to_cursor(self):
        section, settings = fixture()
        section['sub_schedules'][0]['bands'][0].update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        section = deepcopy(self.manager.model['schedules'][0])
        self.clock = NOW.replace(hour=13)
        section['name'] = 'Renamed'
        await self.save(section, settings)
        self.assertEqual(self.calls, [])
        await self.manager.tick()
        await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
