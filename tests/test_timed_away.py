"""Focused persistence/cutover checks using only temporary HA and mock devices."""
from copy import deepcopy
import asyncio
from datetime import datetime, timezone
import unittest
from unittest.mock import patch

import test_backend
from test_backend import fixture, NOW, uid
from custom_components.heating_schedule_manager.switch import AwaySwitch
from custom_components.heating_schedule_manager.validation import Invalid, away_time, validate


class TimedAwayTests(unittest.IsolatedAsyncioTestCase):
    set_state = test_backend.IntegrationTests.set_state
    save = test_backend.IntegrationTests.save
    at = test_backend.IntegrationTests.at
    restart = test_backend.IntegrationTests.restart

    async def asyncSetUp(self):
        self.armed = []
        def timer(hass, action, when):
            self.armed.append(when)
            return lambda: None
        self.timer_patch = patch('custom_components.heating_schedule_manager.scheduler.async_track_point_in_utc_time', side_effect=timer)
        self.timer_patch.start()
        await test_backend.IntegrationTests.asyncSetUp(self)

    async def asyncTearDown(self):
        await test_backend.IntegrationTests.asyncTearDown(self)
        self.timer_patch.stop()

    async def test_deadline_survives_restart_and_updates_without_actions_or_history_reset(self):
        section, settings = fixture()
        await self.save(section, settings)
        await self.manager.set_away(True, until='2026-07-06T13:00')
        self.assertEqual(self.armed[-1], NOW.replace(hour=12))  # next band precedes expiry
        await self.at(12)
        self.assertEqual(self.armed[-1], NOW.replace(hour=13))
        before = deepcopy(self.manager.snapshot['runtime'])
        calls = len(self.calls)
        self.clock = NOW.replace(hour=12, minute=30)
        await self.restart()
        self.assertTrue(self.manager.model['away'])
        self.assertEqual(self.manager.model['away_until'], '2026-07-06T13:00:00+00:00')
        self.assertEqual(len(self.calls), calls)
        before = deepcopy(self.manager.snapshot['runtime'])
        old_token = self.manager.generation
        await self.manager.set_away(True, until='2026-07-06T15:00')
        self.assertEqual(self.manager.snapshot['runtime'], before)
        self.assertEqual(len(self.calls), calls)
        self.clock = NOW.replace(hour=14)
        await self.manager.tick(old_token)
        self.assertTrue(self.manager.model['away'])
        await self.manager.set_away(True)  # external switch on is idempotent
        self.assertIn('away_until', self.manager.model)
        await self.manager.set_away(True, until=None)
        self.assertNotIn('away_until', self.manager.model)
        self.assertEqual(len(self.calls), calls)
        await self.manager.set_away(False)
        self.assertEqual(self.calls[-1]['temperature'], 21)

    async def test_exact_expiry_restores_active_target_and_clears_switch_attribute(self):
        section, settings = fixture()
        await self.save(section, settings)
        await self.manager.set_away(True, until='2026-07-06T13:00Z')
        self.assertIn('away_until', AwaySwitch(self.manager).extra_state_attributes)
        await self.at(12)
        self.calls.clear()
        await self.at(13)
        self.assertFalse(self.manager.model['away'])
        self.assertNotIn('away_until', self.manager.model)
        self.assertEqual(AwaySwitch(self.manager).extra_state_attributes, {})
        self.assertEqual([call['temperature'] for call in self.calls], [21])

    async def test_expired_restart_coalesces_climate_and_state_progress_after_return(self):
        states = []
        async def state(call):
            states.append(call.service)
        self.hass.services.async_register('switch', 'turn_on', state)
        self.hass.services.async_register('switch', 'turn_off', state)
        self.hass.states.async_set('switch.test', 'off')
        section, settings = fixture()
        key = uid()
        settings[key] = {'entity_id': 'switch.test', 'registry_id': None}
        section['entities'].append({'entity_key': key, 'start_state': 'on', 'end_state': 'off'})
        await self.save(section, settings)
        await self.manager.set_away(True, until='2026-07-06T13:00')
        await self.at(12)
        self.assertEqual(states, [])
        self.set_state('climate.kitchen', temperature_value=13)
        await self.hass.async_block_till_done()
        self.calls.clear()
        self.clock = NOW.replace(hour=17)
        await self.restart()
        self.assertFalse(self.manager.model['away'])
        self.assertEqual(self.calls, [])
        self.assertEqual(states, ['turn_off'])
        self.assertFalse(self.manager.snapshot['runtime']['pending'])

    async def test_expiry_storage_failure_is_atomic_and_retries_without_premature_actions(self):
        section, settings = fixture()
        await self.save(section, settings)
        await self.manager.set_away(True, until='2026-07-06T11:00')
        before = deepcopy(self.manager.snapshot)
        calls = len(self.calls)
        self.store.fail = True
        self.clock = NOW.replace(hour=11)
        with self.assertLogs('custom_components.heating_schedule_manager.scheduler', level='ERROR'):
            await self.manager.tick()
        self.assertEqual(self.manager.snapshot, before)
        self.assertEqual(len(self.calls), calls)
        self.assertEqual(self.armed[-1], NOW.replace(hour=11, minute=1))
        self.store.fail = False
        await self.manager.tick()
        self.assertFalse(self.manager.model['away'])
        self.assertNotIn('away_until', self.manager.model)

    async def test_time_validation_timezone_dst_and_revision_conflicts(self):
        from custom_components.heating_schedule_manager.websocket_api import away
        message = away._ws_schema({'id': 1, 'type': 'heating_schedule_manager/set_away', 'away': True, 'expected_revision': 0, 'until': '2026-07-06T12:00'})
        self.assertEqual(message['until'], '2026-07-06T12:00')
        for value in (False, 123, 'invalid', '2026-02-30T12:00', '2026-07-06T09:00Z'):
            with self.assertRaises(Invalid):
                away_time(value, 'UTC', NOW)
        with self.assertRaises(Invalid):
            away_time('2026-07-06T12:00')
        with self.assertRaises(Invalid):
            away_time('2026-03-29T01:30', 'Europe/London')
        folded = away_time('2026-10-25T01:30', 'Europe/London', datetime(2026, 10, 25, 0, 50, tzinfo=timezone.utc))
        self.assertEqual(folded, datetime(2026, 10, 25, 1, 30, tzinfo=timezone.utc))
        self.assertEqual(away_time('2026-07-06T21:00', 'Asia/Tokyo', NOW), NOW.replace(hour=12))
        await self.manager.set_away(True, until='2026-07-06T11:00')
        model = deepcopy(self.manager.model)
        model['away'] = False
        with self.assertRaises(Invalid):
            validate(model, {})
        with self.assertRaises(Invalid):
            await self.manager.set_away(True, 0, until='2026-07-06T12:00')
        with self.assertRaises(Invalid):
            await self.manager.set_away(False, until='2026-07-06T12:00')

    async def test_away_does_not_resend_setback_and_resumes_only_current_active_targets(self):
        section, settings = fixture()
        self.set_state('climate.kitchen', temperature_value=13)
        await self.save(section, settings)
        await self.manager.set_away(True)
        self.assertEqual(self.calls, [])
        await self.at(12)
        await self.at(16)
        self.assertEqual(self.calls, [])
        await self.manager.set_away(False)
        self.assertEqual(self.calls, [])  # inactive schedules leave devices at setback
        self.clock = NOW.replace(hour=13)
        await self.manager.set_away(True)
        self.calls.clear()
        await self.manager.set_away(False)
        self.assertEqual([call['temperature'] for call in self.calls], [21])

    async def test_deferred_away_acknowledges_persistence_before_slow_device_delivery(self):
        section, settings = fixture()
        await self.save(section, settings)
        gate = asyncio.Event()
        async def slow(call):
            await gate.wait()
            self.calls.append(deepcopy(call.data))
        self.hass.services.async_register('climate', 'set_temperature', slow)
        response = await self.manager.set_away(True, defer_dispatch=True)
        self.assertTrue(response['model']['away'])
        self.assertTrue(self.store.data['model']['away'])
        self.assertTrue(response['applying'])
        self.assertEqual(self.calls, [])
        gate.set()
        await self.hass.async_block_till_done()
        self.assertEqual([call['temperature'] for call in self.calls], [13])
        self.assertFalse(self.manager.public()['applying'])

    async def test_enable_disable_skip_correct_targets_but_update_changed_active_target(self):
        section, settings = fixture()
        await self.save(section, settings)
        self.set_state('climate.kitchen', temperature_value=13)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], True)
        self.assertEqual(self.calls, [])  # outside band: already at setback
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        self.clock = NOW.replace(hour=13)
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], True)
        self.assertEqual([call['temperature'] for call in self.calls], [21])
        self.set_state('climate.kitchen', temperature_value=21)
        self.calls.clear()
        await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        self.assertEqual([call['temperature'] for call in self.calls], [13])

    async def test_deferred_disable_is_saved_before_slow_delivery_and_survives_restart(self):
        section, settings = fixture()
        await self.save(section, settings)
        gate = asyncio.Event()
        async def slow(call):
            await gate.wait()
            self.calls.append(deepcopy(call.data))
        self.hass.services.async_register('climate', 'set_temperature', slow)
        response = await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False, defer_dispatch=True)
        self.assertFalse(response['model']['schedules'][0]['enabled'])
        self.assertFalse(self.store.data['model']['schedules'][0]['enabled'])
        self.assertTrue(response['applying'])
        self.assertEqual(self.calls, [])
        gate.set()
        await self.hass.async_block_till_done()
        await self.restart()
        self.assertFalse(self.manager.model['schedules'][0]['enabled'])
        self.assertEqual([call['temperature'] for call in self.calls], [13])
