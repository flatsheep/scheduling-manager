"""Device-free lifecycle coverage for durable single-cycle bands."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch

import test_backend
from test_backend import NOW, fixture, uid
from custom_components.scheduling_manager.events import compile_events
from custom_components.scheduling_manager.validation import Invalid, validate


class OneOffTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = test_backend.IntegrationTests.asyncSetUp
    asyncTearDown = test_backend.IntegrationTests.asyncTearDown
    set_state = test_backend.IntegrationTests.set_state
    save = test_backend.IntegrationTests.save
    at = test_backend.IntegrationTests.at
    restart = test_backend.IntegrationTests.restart

    async def create(self, **kwargs):
        section, settings = fixture(**kwargs)
        section['sub_schedules'][0]['bands'][0]['one_off'] = True
        await self.save(section, settings)
        return section, settings

    def band(self):
        return self.manager.model['schedules'][0]['sub_schedules'][0]['bands'][0]

    def assert_removed(self):
        self.assertEqual(self.manager.model['schedules'][0]['sub_schedules'][0]['bands'], [])
        self.assertEqual(self.store.data['model'], self.manager.model)

    async def test_shared_days_single_cycle_empty_container_and_restart(self):
        section, _ = await self.create(days=[0, 2, 4])
        band_id = self.band()['id']
        self.assertNotIn(band_id, self.manager.control_states())
        self.assertEqual(self.manager.public()['one_off_status'][band_id]['status'], 'Waiting')
        await self.at(12)
        self.assertEqual(self.manager.public()['one_off_status'][band_id]['status'], 'Running')
        await self.restart()
        await self.at(16)
        self.assert_removed()
        await self.restart()
        await self.at(16, day=9)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])
        self.assertEqual(self.manager.model['schedules'][0]['id'], section['id'])

    async def test_created_during_interval_starts_immediately_and_exact_start_is_eligible(self):
        self.clock = NOW.replace(hour=13)
        await self.create(days=[0, 2, 4])
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        await self.at(16)
        self.assert_removed()
        await self.at(12, day=2)
        await self.at(16, day=2)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])
        self.clock = NOW.replace(hour=12) + timedelta(days=7)
        await self.create(key=next(iter(self.manager.model['entity_settings'])))
        self.assertEqual(self.calls[-1]['temperature'], 21)

    async def test_legacy_partial_interval_already_elapsed_recovers_only_stop(self):
        section, settings = await self.create(days=[0, 2, 4])
        # Simulate the previous release: an enabled band saved during its
        # interval remained waiting with no run and its cursor beyond Stop.
        saved_band = self.store.data['model']['schedules'][0]['sub_schedules'][0]['bands'][0]
        saved_band['one_off_after'] = NOW.replace(hour=13).isoformat()
        saved_band.pop('one_off_partial', None)
        self.store.data['runtime']['cursor'] = NOW.replace(hour=17).isoformat()
        self.clock = NOW.replace(hour=18)
        await self.restart()
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [13])
        await self.restart()
        self.assertEqual(len(self.calls), 1)

    async def test_partial_creation_under_gate_waits_without_mid_interval_resume(self):
        self.clock = NOW.replace(hour=13)
        section, settings = fixture(days=[0, 2])
        section['sub_schedules'][0]['enabled'] = False
        section['sub_schedules'][0]['bands'][0]['one_off'] = True
        await self.save(section, settings)
        await self.manager.set_disabled(self.manager.control_states()[section['sub_schedules'][0]['id']]['path'], False)
        await self.at(16)
        self.assertEqual(self.calls, [])
        self.assertNotIn('one_off_run', self.band())
        await self.at(12, day=2)
        await self.at(16, day=2)
        self.assert_removed()

    async def test_created_after_stop_still_waits_for_next_selected_day(self):
        self.clock = NOW.replace(hour=17)
        await self.create(days=[0, 2])
        self.assertEqual(self.calls, [])
        await self.at(12, day=2)
        await self.at(16, day=2)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_offline_partial_recovers_start_and_entire_interval_only_stop(self):
        await self.create()
        self.clock = NOW.replace(hour=14)
        await self.restart()
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        self.clock = NOW.replace(hour=17)
        await self.restart()
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_long_downtime_consumes_first_occurrence_without_replay(self):
        await self.create(days=[0, 2, 4])
        self.clock = NOW + timedelta(days=100)
        await self.restart()
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [13])
        await self.restart()
        self.assertEqual(len(self.calls), 1)

    async def test_stop_failure_retained_and_recovery_does_not_restart(self):
        await self.create()
        await self.at(12)
        self.fail_entity = 'climate.kitchen'
        await self.at(16)
        self.assertTrue(self.band()['one_off_run']['end_recorded'])
        self.assertEqual(next(iter(self.manager.public()['one_off_status'].values()))['status'], 'Stop pending')
        await self.at(12, day=7)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])
        self.fail_entity = None
        await self.restart()
        self.assert_removed()
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13, 13])

    async def test_start_failure_expires_at_stop(self):
        await self.create()
        self.fail_entity = 'climate.kitchen'
        await self.at(12)
        self.fail_entity = None
        await self.at(16)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_non_climate_cleanup_survives_parent_disable_and_away(self):
        section, settings = fixture()
        key = next(iter(settings))
        settings[key] = {'entity_id': 'switch.fixture', 'registry_id': None}
        section['entities'] = [{'entity_key': key, 'start_state': 'on', 'end_state': 'off'}]
        section['sub_schedules'][0]['bands'][0]['one_off'] = True
        self.hass.states.async_set('switch.fixture', 'off', {})
        actions = []
        async def action(call):
            actions.append(call.service)
        self.hass.services.async_register('switch', 'turn_on', action)
        self.hass.services.async_register('switch', 'turn_off', action)
        await self.save(section, settings)
        await self.at(12)
        self.clock = NOW.replace(hour=13)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        await self.manager.set_away(True)
        await self.restart()
        await self.at(16)
        self.assert_removed()
        self.assertEqual(actions, ['turn_on', 'turn_off'])

    async def test_away_waiting_skips_start_and_timed_return_does_not_resume(self):
        await self.create(days=[0, 2])
        await self.manager.set_away(True, until='2026-07-06T13:00Z')
        self.calls.clear()
        await self.at(14)
        self.assertEqual(self.calls, [])
        self.assertNotIn('one_off_run', self.band())
        await self.at(12, day=2)
        await self.at(16, day=2)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_boundary_disable_does_not_select_unstarted_occurrence(self):
        section, _ = await self.create(days=[0, 2])
        self.clock = NOW.replace(hour=12)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        self.assertNotIn('one_off_run', self.band())
        self.assertFalse(any(c['temperature'] == 21 for c in self.calls))

    async def test_recurring_cannot_convert_and_client_cannot_forge_lifecycle(self):
        section, settings = fixture()
        await self.save(section, settings)
        section['sub_schedules'][0]['bands'][0]['one_off'] = True
        with self.assertRaises(Invalid):
            await self.save(section, settings)
        await self.manager.save_section(self.manager.model['revision'], 'delete', section['id'])
        band = section['sub_schedules'][0]['bands'][0]
        band['one_off_after'] = '2000-01-01T00:00:00Z'
        band['one_off_run'] = {'end_recorded': True}
        await self.save(section, settings)
        self.assertNotIn('one_off_run', self.band())
        self.assertEqual(self.band()['one_off_after'], NOW.isoformat())
        invalid = deepcopy(self.manager.model['schedules'][0])
        invalid['sub_schedules'][0]['bands'][0]['enabled'] = False
        with self.assertRaises(Invalid):
            await self.save(invalid, settings)

    async def test_successful_entities_not_retried_with_failed_stop(self):
        section, settings = fixture()
        section['sub_schedules'][0]['bands'][0]['one_off'] = True
        key = uid()
        self.set_state('climate.other')
        settings[key] = {'entity_id': 'climate.other', 'setback': {'value': 12, 'unit': '°C'}}
        section['entities'].append({'entity_key': key, 'target': {'value': 20, 'unit': '°C'}})
        await self.save(section, settings)
        await self.at(12)
        self.fail_entity = 'climate.other'
        await self.at(16)
        self.fail_entity = None
        await self.restart()
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls if c['entity_id'] == 'climate.kitchen'], [21, 13])

    async def test_waiting_gates_skip_and_mid_interval_enable_does_not_start(self):
        section, settings = fixture(days=[0, 2])
        sub = section['sub_schedules'][0]
        sub['bands'][0]['one_off'] = True
        sub['enabled'] = False
        await self.save(section, settings)
        await self.at(13)
        await self.manager.set_disabled(self.manager.control_states()[sub['id']]['path'], False)
        await self.at(16)
        self.assertEqual(self.calls, [])
        await self.at(12, day=2)
        await self.at(16, day=2)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_selected_sub_disable_and_enable_never_repeat_start(self):
        section, _ = await self.create()
        await self.at(12)
        path = self.manager.control_states()[section['sub_schedules'][0]['id']]['path']
        self.clock = NOW.replace(hour=13)
        await self.manager.set_disabled(path, True)
        await self.manager.set_disabled(path, False)
        await self.manager.set_disabled(path, True)
        await self.at(16)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_parent_disable_and_away_keep_stop_and_do_not_replay_start(self):
        section, _ = await self.create()
        await self.at(12)
        self.clock = NOW.replace(hour=13)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], True)
        await self.manager.set_away(True)
        await self.manager.set_away(False)
        self.assertEqual(sum(c['temperature'] == 21 for c in self.calls), 1)
        await self.manager.set_away(True)
        await self.at(16)
        self.assert_removed()
        self.assertEqual(self.calls[-1]['temperature'], 13)

    async def test_type_immutable_controls_rejected_and_frozen_actions(self):
        section, settings = await self.create()
        band_id = self.band()['id']
        with self.assertRaises(Invalid):
            await self.manager.enable_band(self.manager.model['revision'], section['id'], band_id)
        with self.assertRaises(Invalid):
            await self.manager.set_disabled(f'schedule_manager.id.{band_id}.disabled', True)
        changed = deepcopy(self.manager.model['schedules'][0])
        changed['sub_schedules'][0]['bands'][0]['one_off'] = False
        with self.assertRaises(Invalid):
            await self.save(changed, settings)
        changed = deepcopy(self.manager.model['schedules'][0])
        changed['sub_schedules'][0]['bands'][0]['start_minute'] = 780
        await self.save(changed, settings)
        await self.at(13)
        frozen = deepcopy(self.manager.model['schedules'][0])
        frozen['entities'][0]['target']['value'] = 25
        settings[next(iter(settings))]['setback']['value'] = 10
        await self.save(frozen, settings)
        await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_running_time_edits_extend_stop_without_repeating_start(self):
        _, settings = await self.create()
        await self.at(12)
        self.clock = NOW.replace(hour=16)
        edited = deepcopy(self.manager.model['schedules'][0])
        edited['sub_schedules'][0]['bands'][0].update(start_minute=780, end_minute=1020)
        await self.save(edited, settings)
        self.assertEqual(self.band()['one_off_run']['minutes'], [780, 1020])
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        await self.restart()
        await self.at(17)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_revised_overdue_stop_applies_immediately_and_removes(self):
        _, settings = await self.create()
        await self.at(12)
        self.clock = NOW.replace(hour=14)
        edited = deepcopy(self.manager.model['schedules'][0])
        edited['sub_schedules'][0]['bands'][0].update(start_minute=660, end_minute=780)
        await self.save(edited, settings)
        self.assert_removed()
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_retime_failed_stop_cancels_obsolete_retry(self):
        _, settings = await self.create()
        await self.at(12)
        self.fail_entity = 'climate.kitchen'
        await self.at(16)
        edited = deepcopy(self.manager.model['schedules'][0])
        edited['sub_schedules'][0]['bands'][0]['end_minute'] = 1020
        self.fail_entity = None
        await self.save(edited, settings)
        self.assertEqual(self.manager.snapshot['runtime']['pending'], {})
        self.assertEqual(self.manager.snapshot['runtime']['errors'], {})
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])
        await self.at(17)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13, 13])

    async def test_running_delete_at_old_stop_cancels_without_commands(self):
        _, settings = await self.create(days=[0, 2, 4])
        await self.at(12)
        self.clock = NOW.replace(hour=16)
        edited = deepcopy(self.manager.model['schedules'][0])
        edited['sub_schedules'][0]['bands'] = []
        await self.save(edited, settings)
        self.assert_removed()
        await self.restart()
        await self.at(17, day=7)
        self.assertEqual([c['temperature'] for c in self.calls], [21])

    async def test_delete_entire_schedule_cancels_failed_stop_and_restart_retry(self):
        section, _ = await self.create()
        await self.at(12)
        self.fail_entity = 'climate.kitchen'
        await self.at(16)
        await self.manager.save_section(self.manager.model['revision'], 'delete', section['id'])
        self.assertEqual(self.manager.snapshot['runtime']['pending'], {})
        self.assertEqual(self.manager.snapshot['runtime']['errors'], {})
        self.assertEqual(self.manager.model['schedules'], [])
        self.fail_entity = None
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_running_delete_failure_keeps_durable_stop_obligation(self):
        _, settings = await self.create()
        await self.at(12)
        edited = deepcopy(self.manager.model['schedules'][0])
        edited['sub_schedules'][0]['bands'] = []
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.save(edited, settings)
        self.store.fail = False
        self.assertIn('one_off_run', self.band())
        await self.at(16)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_delete_sub_schedule_containing_running_one_off(self):
        _, settings = await self.create()
        await self.at(12)
        edited = deepcopy(self.manager.model['schedules'][0])
        edited['sub_schedules'] = [{'id': uid(), 'days': [2], 'bands': []}]
        await self.save(edited, settings)
        await self.restart()
        await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        self.assertEqual(self.manager.model['schedules'][0]['sub_schedules'][0]['days'], [2])

    async def test_retime_at_shared_boundary_does_not_replay_other_schedule(self):
        _, settings = await self.create()
        other, _ = fixture(start=960, end=1080, key=next(iter(settings)), target=19)
        await self.save(other, settings)
        await self.at(12)
        self.clock = NOW.replace(hour=16)
        edited = deepcopy(self.manager.model['schedules'][0])
        edited['sub_schedules'][0]['bands'][0]['end_minute'] = 1020
        await self.save(edited, settings)
        self.assertEqual([c['temperature'] for c in self.calls], [21, 19])
        await self.at(17)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 19, 13])

    async def test_auto_delete_stale_draft_rejected(self):
        section, settings = await self.create()
        revision = self.manager.model['revision']
        await self.at(12)
        await self.at(16)
        with self.assertRaises(Invalid):
            await self.manager.save_section(revision, 'upsert', section['id'], section, settings)
        self.assert_removed()

    async def test_persistence_failure_before_dispatch_and_after_ack(self):
        await self.create()
        self.store.fail = True
        with self.assertLogs('custom_components.scheduling_manager.scheduler', level='ERROR'):
            await self.at(12)
        self.assertEqual(self.calls, [])
        self.store.fail = False
        await self.manager.tick()
        original = self.store.async_save
        async def fail_delete(candidate):
            if not candidate['model']['schedules'][0]['sub_schedules'][0]['bands']:
                raise OSError('deletion write failed')
            await original(candidate)
        with patch.object(self.store, 'async_save', side_effect=fail_delete):
            with self.assertLogs('custom_components.scheduling_manager.scheduler', level='ERROR'):
                await self.at(16)
        self.assertTrue(self.band()['one_off_run']['end_recorded'])
        await self.restart()
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_newer_recurring_transition_supersedes_failed_stop(self):
        section, settings = await self.create()
        other, _ = fixture(start=1020, end=1080, key=next(iter(settings)), target=19)
        await self.save(other, settings)
        await self.at(12)
        self.fail_entity = 'climate.kitchen'
        await self.at(16)
        self.fail_entity = None
        await self.at(17)
        self.assert_removed()
        await self.restart()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13, 19])

    async def test_timeout_stop_remains_pending_across_restart_without_repeating_start(self):
        _, settings = await self.create()
        await self.at(12)
        async def timeout(call):
            raise TimeoutError()
        self.hass.services.async_register('climate', 'set_temperature', timeout)
        await self.at(16)
        key = next(iter(settings))
        self.assertTrue(self.band()['one_off_run']['end_recorded'])
        self.assertEqual(self.manager.snapshot['runtime']['pending'][key]['endpoint'], 'end')
        self.assertEqual(self.manager.snapshot['runtime']['errors'][key]['message'], 'TimeoutError')
        await self.restart()
        self.assertTrue(self.band()['one_off_run']['end_recorded'])
        self.assertEqual([c['temperature'] for c in self.calls], [21])
        async def recover(call):
            self.calls.append(deepcopy(call.data))
        self.hass.services.async_register('climate', 'set_temperature', recover)
        await self.hass.async_block_till_done()
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])

    async def test_midnight_end_and_overnight_rejected(self):
        await self.create(start=1380, end=1440)
        await self.at(23)
        await self.at(0, day=1)
        self.assert_removed()
        section, settings = fixture(start=1380, end=120)
        section['sub_schedules'][0]['bands'][0]['one_off'] = True
        with self.assertRaises(Invalid):
            await self.save(section, settings)

    async def test_dst_fold_once_and_spring_zero_duration_skips(self):
        self.hass.config.time_zone = 'Europe/London'
        self.clock = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
        await self.restart()
        await self.create(start=90, end=105, days=[6])
        self.clock = datetime(2026, 10, 25, 0, 30, tzinfo=timezone.utc)
        await self.manager.tick()
        await self.restart()
        self.clock = datetime(2026, 10, 25, 0, 45, tzinfo=timezone.utc)
        await self.manager.tick()
        self.assert_removed()
        self.clock = datetime(2026, 10, 25, 1, 30, tzinfo=timezone.utc)
        await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])
        model = deepcopy(self.manager.model)
        section, settings = fixture(start=70, end=100, days=[6])
        band = section['sub_schedules'][0]['bands'][0]
        band.update(one_off=True, one_off_after='2026-03-28T00:00:00+00:00')
        model.update(schedules=[section], entity_settings=settings)
        events = compile_events(model, test_backend.LONDON, datetime(2026, 3, 28, tzinfo=timezone.utc), datetime(2026, 3, 30, tzinfo=timezone.utc))
        self.assertEqual(events, [])
        validate(model, {'climate.kitchen': test_backend.CAP})

    async def test_unavailable_solar_skips_and_selected_instants_are_frozen(self):
        section, settings = fixture(days=[0, 2])
        band = section['sub_schedules'][0]['bands'][0]
        band.update(one_off=True, start_dynamic={'event': 'noon', 'offset': 0})
        self.manager.solar = lambda day, event: None
        await self.save(section, settings)
        await self.at(16)
        self.assertEqual(self.calls, [])
        self.manager.solar = lambda day, event: 720
        await self.at(12, day=2)
        self.manager.solar = lambda day, event: 1000
        self.hass.config.time_zone = 'Asia/Kolkata'
        await self.manager._refresh_environment()
        await self.at(16, day=2)
        self.assert_removed()
        self.assertEqual([c['temperature'] for c in self.calls], [21, 13])
