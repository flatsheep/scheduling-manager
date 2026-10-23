"""Sub-schedule gates share the durable band event stream and UUID controls."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest

import test_backend
import test_timed_away
from test_backend import CAP, NOW, fixture
from custom_components.scheduling_manager.events import compile_events, section_active
from custom_components.scheduling_manager.validation import Invalid, validate


class SubScheduleTests(unittest.IsolatedAsyncioTestCase):
    set_state = test_backend.IntegrationTests.set_state
    save = test_backend.IntegrationTests.save
    at = test_backend.IntegrationTests.at
    restart = test_backend.IntegrationTests.restart
    asyncSetUp = test_timed_away.TimedAwayTests.asyncSetUp
    asyncTearDown = test_timed_away.TimedAwayTests.asyncTearDown

    async def test_disable_active_keeps_devices_and_manual_enable_runs_once(self):
        section, settings = fixture()
        await self.save(section, settings)
        await self.at(12)
        self.calls.clear()
        sub = section['sub_schedules'][0]
        path = self.manager.control_states()[sub['id']]['immutable_path']
        self.clock = NOW.replace(hour=13)
        await self.manager.set_disabled(path, True)
        self.assertEqual(self.calls, [])
        await self.restart()
        self.assertFalse(self.manager.schedule_activity()[section['id']]['active'])
        await self.manager.set_disabled(path, False)
        await self.manager.set_disabled(path, False)
        await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_permanent_gate_suppresses_end_and_enable_outside_band_is_quiet(self):
        section, settings = fixture()
        sub = section['sub_schedules'][0]
        sub['enabled'] = False
        await self.save(section, settings)
        await self.at(12)
        await self.at(16)
        await self.manager.set_disabled(self.manager.control_states()[sub['id']]['path'], False)
        self.assertEqual(self.calls, [])
        await self.at(12, day=7)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_expiry_recovers_offline_and_never_repeats(self):
        section, settings = fixture()
        sub = section['sub_schedules'][0]
        sub.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        self.assertEqual(self.armed[-1], NOW.replace(hour=13))
        await self.at(12)
        self.assertEqual(self.calls, [])
        self.clock = NOW.replace(hour=14)
        await self.restart()
        await self.manager.tick()
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        self.assertFalse(self.manager.control_states()[sub['id']]['own_disabled'])
        await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_child_preferences_parent_and_away_gates_are_independent(self):
        section, settings = fixture()
        sub = section['sub_schedules'][0]
        band = sub['bands'][0]
        band['enabled'] = False
        sub['enabled'] = False
        await self.save(section, settings)
        path = self.manager.control_states()[sub['id']]['immutable_path']
        self.clock = NOW.replace(hour=13)
        await self.manager.set_disabled(path, False)
        self.assertEqual(self.calls, [])
        self.assertTrue(self.manager.control_states()[band['id']]['own_disabled'])
        await self.manager.set_disabled(self.manager.control_states()[section['id']]['path'], True)
        await self.hass.async_block_till_done()
        self.calls.clear()
        await self.manager.set_disabled(self.manager.control_states()[band['id']]['immutable_path'], False)
        await self.hass.async_block_till_done()
        self.assertEqual(self.calls, [])
        self.assertTrue(self.manager.control_states()[band['id']]['parent_disabled'])
        await self.manager.set_disabled(path, True)
        await self.manager.set_disabled(path, False)
        self.assertEqual(self.calls, [])
        await self.manager.set_away(True)
        self.calls.clear()
        await self.manager.set_disabled(path, True)
        await self.manager.set_disabled(self.manager.control_states()[section['id']]['path'], False)
        await self.hass.async_block_till_done()
        self.calls.clear()
        await self.manager.set_disabled(path, False)
        self.assertEqual(self.calls, [])
        self.assertTrue(self.manager.control_states()[sub['id']]['suspended_by_away'])
        await self.manager.set_away(False)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_away_excluded_sub_schedule_resumes(self):
        section, settings = fixture()
        section['away_enabled'] = False
        sub = section['sub_schedules'][0]
        sub.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        await self.manager.set_away(True)
        await self.at(13)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_local_deadline_validation_is_atomic_and_unchanged_expiry_can_be_saved(self):
        self.hass.config.time_zone = 'Europe/London'
        section, settings = fixture()
        sub = section['sub_schedules'][0]
        sub.update(enabled=False, disabled_until='2026-07-06T14:00')
        await self.save(section, settings)
        self.assertEqual(self.manager.model['schedules'][0]['sub_schedules'][0]['disabled_until'], '2026-07-06T13:00:00+00:00')
        before = deepcopy(self.manager.snapshot)
        for deadline in ('bad', '2026-07-06T09:00Z', '2027-03-28T01:30'):
            sub['disabled_until'] = deadline
            with self.assertRaises(Invalid):
                await self.save(section, settings)
            self.assertEqual(self.manager.snapshot, before)
        section = deepcopy(self.manager.model['schedules'][0])
        self.clock = NOW.replace(hour=17)
        section['name'] = 'Renamed'
        await self.save(section, settings)

    async def test_old_new_and_immutable_paths_survive_renames_and_time_edits(self):
        section, settings = fixture()
        await self.save(section, settings)
        sub = section['sub_schedules'][0]
        band = sub['bands'][0]
        control = self.manager.control_states()[band['id']]
        for path in (control['legacy_paths'][0], control['path'], control['immutable_path']):
            await self.manager.set_disabled(path, True)
            await self.manager.set_disabled(path, False)
        identities = {k: c['immutable_path'] for k, c in self.manager.control_states().items()}
        section['name'] = 'Renamed'
        sub['name'] = 'Also renamed'
        band['start_minute'] = 660
        await self.save(section, settings)
        self.assertEqual({k: c['immutable_path'] for k, c in self.manager.control_states().items()}, identities)
        for path in identities.values():
            await self.manager.set_disabled(path, True)

    async def test_save_at_expiry_boundary_does_not_duplicate_resume(self):
        section, settings = fixture()
        sub = section['sub_schedules'][0]
        sub.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        self.clock = NOW.replace(hour=13)
        section = deepcopy(self.manager.model['schedules'][0])
        section['sub_schedules'][0]['bands'][0]['end_minute'] = 1020
        await self.save(section, settings)
        await self.manager.tick()
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_metadata_edit_does_not_synthesize_or_duplicate_overdue_expiry(self):
        section, settings = fixture()
        section['sub_schedules'][0].update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        self.clock = NOW.replace(hour=14)
        section['sub_schedules'][0]['name'] = 'Renamed only'
        before = deepcopy(self.manager.snapshot['runtime'])
        await self.save(section, settings)
        self.assertEqual(self.manager.snapshot['runtime'], before)
        await self.manager.tick()
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_storage_conflict_and_stale_expiry_callbacks_preserve_state(self):
        section, settings = fixture()
        sub = section['sub_schedules'][0]
        sub.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        await self.save(section, settings)
        token = self.manager.generation
        path = self.manager.control_states()[sub['id']]['immutable_path']
        before = deepcopy(self.manager.snapshot)
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.manager.set_disabled(path, True)
        self.assertEqual(self.manager.snapshot, before)
        self.store.fail = False
        await self.manager.set_disabled(path, True)
        self.clock = NOW.replace(hour=13)
        await self.manager.tick(token)
        await self.manager.tick()
        self.assertEqual(self.calls, [])
        self.assertTrue(self.manager.control_states()[sub['id']]['own_disabled'])
        with self.assertRaises(Invalid):
            await self.manager.save_section(before['model']['revision'], 'upsert', section['id'], section, settings)

    async def test_overlapping_schedule_keeps_its_independent_transition_order(self):
        section, settings = fixture()
        section['sub_schedules'][0].update(enabled=False, disabled_until='2026-07-06T13:00Z')
        key = next(iter(settings))
        other, _ = fixture(start=750, end=1020, key=key, target=19)
        await self.save(section, settings)
        await self.save(other, settings)
        await self.at(12, 30)
        await self.at(13)
        await self.at(16)
        await self.at(17)
        self.assertEqual([c['temperature'] for c in self.calls], [19, 21, 13, 13])


class SubEventTests(unittest.TestCase):
    def test_expiry_before_inside_and_after_band_including_exact_boundaries(self):
        for hour, endpoints in ((11, ['start', 'end']), (12, ['start', 'end']),
                                (13, ['start', 'end']), (16, ['end']), (17, [])):
            section, settings = fixture()
            section['sub_schedules'][0].update(enabled=False, disabled_until=NOW.replace(hour=hour).isoformat())
            model = {'revision': 1, 'away': False, 'entity_settings': settings, 'schedules': [section]}
            events = compile_events(model, 'UTC', NOW, NOW.replace(hour=18))
            self.assertEqual([e.endpoint for e in events], endpoints)

    def test_overlapping_solar_bands_resume_sub_schedule_once(self):
        from test_backend import uid
        section, settings = fixture()
        sub = section['sub_schedules'][0]
        sub.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        first = sub['bands'][0]
        first['start_dynamic'] = {'event': 'sunrise', 'offset': 0}
        second = {**deepcopy(first), 'id': uid(), 'start_minute': 1020}
        sub['bands'].append(second)
        model = {'revision': 1, 'away': False, 'entity_settings': settings, 'schedules': [section]}
        events = compile_events(model, 'UTC', NOW, NOW.replace(hour=14), lambda day, event: 720)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].endpoint, 'start')
        # A real Start at the same instant takes precedence over synthetic resume.
        second['start_dynamic']['offset'] = 60
        events = compile_events(model, 'UTC', NOW, NOW.replace(hour=14), lambda day, event: 720)
        self.assertEqual(len(events), 1)
        self.assertIn(':start:', events[0].occurrence)

    def test_gate_combinations_and_coincident_expiry_have_one_resume(self):
        for parent in (True, False):
            for child_deadline in (None, '2026-07-06T13:00Z', '2026-07-06T14:00Z'):
                section, settings = fixture()
                section['enabled'] = parent
                sub = section['sub_schedules'][0]
                sub.update(enabled=False, disabled_until='2026-07-06T13:00Z')
                sub['bands'][0].update(enabled=False, disabled_until=child_deadline)
                model = {'revision': 1, 'away': False, 'entity_settings': settings, 'schedules': [section]}
                events = compile_events(model, 'UTC', NOW, NOW.replace(hour=17))
                self.assertEqual([e.endpoint for e in events], ['start', 'end'] if parent and child_deadline else [])
                if events:
                    self.assertEqual(events[0].instant.hour, 14 if child_deadline.endswith('14:00Z') else 13)

    def test_midnight_solar_and_dst_expiry_share_absolute_instant_policy(self):
        for start, deadline in (
            (datetime(2026, 3, 29, tzinfo=timezone.utc), '2026-03-29T01:00Z'),
            (datetime(2026, 10, 25, tzinfo=timezone.utc), '2026-10-25T01:30Z'),
        ):
            section, settings = fixture()
            sub = section['sub_schedules'][0]
            sub['days'] = [6]
            sub.update(enabled=False, disabled_until=deadline)
            sub['bands'][0].update(start_minute=0, end_minute=1440)
            model = {'revision': 1, 'away': False, 'entity_settings': settings, 'schedules': [section]}
            events = compile_events(model, 'Europe/London', start, start + timedelta(days=1, hours=2))
            self.assertEqual([e.endpoint for e in events], ['start', 'end'])
            self.assertEqual(events[0].instant, datetime.fromisoformat(deadline))
            self.assertTrue(section_active(section, 'Europe/London', events[0].instant))
            self.assertFalse(section_active(section, 'Europe/London', events[-1].instant))
        section, settings = fixture()
        sub = section['sub_schedules'][0]
        sub.update(enabled=False, disabled_until='2026-07-06T13:00Z')
        sub['bands'][0]['start_dynamic'] = {'event': 'sunrise', 'offset': 0}
        model = {'revision': 1, 'away': False, 'entity_settings': settings, 'schedules': [section]}
        self.assertEqual(compile_events(model, 'UTC', NOW, NOW.replace(hour=17), lambda day, event: None), [])

    def test_legacy_default_and_invalid_state(self):
        section, settings = fixture()
        model = {'revision': 1, 'away': False, 'entity_settings': settings, 'schedules': [section]}
        sub = section['sub_schedules'][0]
        validate(model, {'climate.kitchen': CAP})
        for value in (None, 0, 1, 'false'):
            sub['enabled'] = value
            with self.assertRaises(Invalid):
                validate(model, {'climate.kitchen': CAP})
