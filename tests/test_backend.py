"""Runs inside real HA release containers, with only mocked climate actions."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone, date
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import device_registry as dr
from homeassistant.const import __version__

from custom_components.scheduling_manager.events import compile_events, wall_instant, section_active
from custom_components.scheduling_manager.scheduler import Manager
from custom_components.scheduling_manager.validation import Invalid, validate, temperature
from custom_components.scheduling_manager.websocket_api import visible, mutation

UTC = timezone.utc
NOW = datetime(2026, 7, 6, 10, tzinfo=UTC)  # Monday


def uid():
    return str(uuid4())


def fixture(start=720, end=960, days=None, key=None, target=21):
    key = key or uid()
    settings = {key: {"entity_id": "climate.kitchen", "registry_id": None, "setback": {"value": 13, "unit": "°C"}}}
    section = {"id": uid(), "name": "Downstairs", "entities": [{"entity_key": key, "target": {"value": target, "unit": "°C"}}],
               "sub_schedules": [{"id": uid(), "days": days or [0], "bands": [{"id": uid(), "start_minute": start, "end_minute": end}]}]}
    return section, settings


CAP = {"entity_id": "climate.kitchen", "supported": True, "available": True, "min": 7, "max": 35, "step": 0.5, "unit": "°C"}


class ValidationTests(unittest.TestCase):
    def model(self):
        section, settings = fixture()
        return {"revision": 0, "away": False, "entity_settings": settings, "schedules": [section]}

    def test_temperature_decimal_steps_and_conversion(self):
        for step, value in ((.1, 21.1), (.5, 21.5), (1, 21)):
            self.assertEqual(temperature({"value": value, "unit": "°C"}, {**CAP, "step": step}), value)
        self.assertEqual(temperature({"value": 68, "unit": "°F"}, CAP), 20)
        for value in (float('nan'), float('inf'), 36, 21.2):
            with self.assertRaises(Invalid): temperature({"value": value, "unit": "°C"}, CAP)
        with self.assertRaises(Invalid): temperature({"value": 21, "unit": "K"}, CAP)
        with self.assertRaises(Invalid): temperature({"value": 21, "unit": "°C"}, {**CAP, "supported": False})
        with self.assertRaises(Invalid): temperature({"value": 70, "unit": "°F"}, CAP)

    def test_validation_boundaries(self):
        model = self.model()
        validate(model, {"climate.kitchen": CAP})
        for change in (
            lambda s: s.update(name='  '), lambda s: s.update(entities=[]),
            lambda s: s['sub_schedules'][0].update(days=[]),
            lambda s: s['sub_schedules'][0]['bands'][0].update(end_minute=720),
            lambda s: s['sub_schedules'][0]['bands'][0].update(start_minute=721),
        ):
            candidate = deepcopy(model); change(candidate['schedules'][0])
            with self.assertRaises(Invalid): validate(candidate, {'climate.kitchen': CAP})

    def test_grouped_days_adjacent_bands_and_limits(self):
        model = self.model(); section = model['schedules'][0]; sub = section['sub_schedules'][0]
        sub['days'] = [0, 2, 4]
        sub['bands'] = [{'id': uid(), 'start_minute': i*60, 'end_minute': (i+1)*60} for i in range(10)]
        validate(model, {'climate.kitchen': CAP})
        sub['bands'].append({'id': uid(), 'start_minute': 600, 'end_minute': 660})
        with self.assertRaises(Invalid): validate(model, {'climate.kitchen': CAP})
        sub['bands'].pop()
        section['sub_schedules'].append({'id': uid(), 'days': [2], 'bands': [{'id': uid(), 'start_minute': 0, 'end_minute': 60}]})
        with self.assertRaises(Invalid): validate(model, {'climate.kitchen': CAP})
        section['sub_schedules'].pop()
        other = deepcopy(section); other['id']=uid()
        for s in other['sub_schedules']:
            s['id']=uid()
            for b in s['bands']: b['id']=uid()
        model['schedules'].append(other)  # duplicate names and cross-section overlap legal
        validate(model, {'climate.kitchen': CAP})

    def test_seven_subs_and_no_target_order_rule(self):
        model=self.model(); section=model['schedules'][0]
        section['entities'][0]['target']['value']=10
        section['sub_schedules']=[{'id':uid(),'days':[d],'bands':[{'id':uid(),'start_minute':0,'end_minute':1440}]} for d in range(7)]
        validate(model, {'climate.kitchen': CAP})

    def test_legacy_enable_default_and_boolean_validation(self):
        model=self.model()
        self.assertTrue(validate(model,{'climate.kitchen':CAP})['schedules'][0]['enabled'])
        for value in (0,1,'false',None):
            model['schedules'][0]['enabled']=value
            with self.assertRaises(Invalid):validate(model,{'climate.kitchen':CAP})

    def test_optional_sub_names_are_validated_trimmed_and_blank_removed(self):
        model = self.model()
        sub = model['schedules'][0]['sub_schedules'][0]
        for value in (None, True, 123, [], {}):
            sub['name'] = value
            with self.assertRaises(Invalid):
                validate(model, {'climate.kitchen': CAP})
        sub['name'] = '  Weekdays  '
        self.assertEqual(validate(model, {'climate.kitchen': CAP})['schedules'][0]['sub_schedules'][0]['name'], 'Weekdays')
        sub['name'] = '   '
        self.assertNotIn('name', validate(model, {'climate.kitchen': CAP})['schedules'][0]['sub_schedules'][0])


class EventTests(unittest.TestCase):
    def test_dst_gap_fold_and_no_dst(self):
        london=ZoneInfo('Europe/London')
        self.assertEqual(wall_instant(date(2026,3,29),90,london),datetime(2026,3,29,1,tzinfo=UTC))
        self.assertEqual(wall_instant(date(2026,10,25),90,london),datetime(2026,10,25,0,30,tzinfo=UTC))
        self.assertEqual(wall_instant(date(2026,3,29),90,ZoneInfo('Asia/Kolkata')),datetime(2026,3,28,20,tzinfo=UTC))

    def test_adjacent_and_midnight_order(self):
        section, settings=fixture(start=0,end=60,days=[0,1]); sub=section['sub_schedules'][0]
        sub['bands'].append({'id':uid(),'start_minute':60,'end_minute':1440})
        model={'revision':0,'schedules':[section],'entity_settings':settings,'away':False}
        events=compile_events(model,'UTC',NOW.replace(hour=0)-timedelta(seconds=1),NOW+timedelta(days=1))
        at_hour=[e.endpoint for e in events if e.instant==NOW.replace(hour=1)]
        self.assertEqual(at_hour,['end','start'])
        at_midnight=[e.endpoint for e in events if e.instant==NOW.replace(hour=0)+timedelta(days=1)]
        self.assertEqual(at_midnight,['end','start'])
        end=next(e for e in events if e.instant==NOW.replace(hour=0)+timedelta(days=1))
        self.assertTrue(end.occurrence.endswith('2026-07-06'))

    def test_gap_preserves_logical_order_and_long_downtime_bounded(self):
        section,settings=fixture(start=70,end=100,days=[6]);model={'revision':0,'schedules':[section]}
        events=compile_events(model,'Europe/London',datetime(2026,3,28,tzinfo=UTC),datetime(2026,3,30,tzinfo=UTC))
        self.assertEqual([e.endpoint for e in events],['start','end'])
        self.assertEqual(events[0].instant,events[1].instant)
        recent=compile_events(model,'UTC',datetime(2000,1,1,tzinfo=UTC),NOW)
        self.assertLessEqual(len(recent),4)

    def test_disabled_compilation_and_active_band_dst_boundaries(self):
        section,settings=fixture(start=720,end=960)
        self.assertFalse(section_active(section,'UTC',NOW))
        self.assertTrue(section_active(section,'UTC',NOW.replace(hour=12)))
        self.assertFalse(section_active(section,'UTC',NOW.replace(hour=16)))
        section['enabled']=False
        self.assertFalse(section_active(section,'UTC',NOW.replace(hour=13)))
        self.assertEqual(compile_events({'revision':0,'schedules':[section]},'UTC',NOW,NOW.replace(hour=17)),[])
        section,settings=fixture(start=70,end=100,days=[6])
        self.assertFalse(section_active(section,'Europe/London',datetime(2026,3,29,1,tzinfo=UTC)))
        section['sub_schedules'][0]['bands'][0].update(start_minute=90,end_minute=105)
        self.assertTrue(section_active(section,'Europe/London',datetime(2026,10,25,0,35,tzinfo=UTC)))
        self.assertFalse(section_active(section,'Europe/London',datetime(2026,10,25,1,35,tzinfo=UTC)))


class MemoryStore:
    def __init__(self): self.data=None;self.fail=False
    async def async_load(self): return deepcopy(self.data)
    async def async_save(self,value):
        if self.fail: raise OSError('mock disk full')
        self.data=deepcopy(value)


class IntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.hass=HomeAssistant(self.tmp.name)
        self.hass.config.time_zone='UTC'
        dr.async_setup(self.hass)
        await dr.async_load(self.hass, load_empty=True)
        await er.async_get(self.hass).async_load()
        self.clock=NOW
        self.patcher=patch('custom_components.scheduling_manager.scheduler.dt_util.utcnow',side_effect=lambda:self.clock)
        self.patcher.start()
        self.calls=[];self.fail_entity=None
        async def climate(call):
            self.calls.append(deepcopy(call.data))
            if call.data['entity_id']==self.fail_entity:raise RuntimeError('mock service failure')
        self.hass.services.async_register('climate','set_temperature',climate)
        self.set_state('climate.kitchen')
        self.manager=Manager(self.hass);self.store=MemoryStore();self.manager.store=self.store
        await self.manager.start()

    def set_state(self,eid,state='heat',temperature_value=20,features=1,step=.5,context=None):
        attrs={'min_temp':7,'max_temp':35,'target_temp_step':step,'supported_features':features,'temperature':temperature_value,'friendly_name':eid}
        if step is None:attrs.pop('target_temp_step')
        self.hass.states.async_set(eid,state,attrs,context=context)

    async def asyncTearDown(self):
        await self.manager.stop()
        await self.hass.async_block_till_done()
        self.patcher.stop();self.tmp.cleanup()

    async def save(self,section,settings):
        return await self.manager.save_section(self.manager.model['revision'],'upsert',section['id'],section,settings)

    async def at(self,hour,minute=0,day=0):
        self.clock=NOW.replace(hour=hour,minute=minute)+timedelta(days=day)
        await self.manager.tick()

    async def test_transition_last_wins_manual_and_temperature_only(self):
        a,settings=fixture();key=next(iter(settings));b,_=fixture(start=750,end=1020,key=key,target=19)
        await self.save(a,settings);await self.save(b,settings)
        self.assertEqual(self.calls,[])
        await self.at(12);await self.at(12,30)
        self.set_state('climate.kitchen',temperature_value=22);await self.hass.async_block_till_done()
        self.assertEqual([c['temperature'] for c in self.calls],[21,19])
        await self.at(16)
        self.assertEqual(self.calls[-1],{'entity_id':'climate.kitchen','temperature':13})
        await self.at(17)
        self.assertEqual([c['temperature'] for c in self.calls],[21,19,13,13])
        await self.at(0,day=1)
        self.assertEqual([c['temperature'] for c in self.calls],[21,19,13,13])

    async def test_dynamic_runtime_save_restart_enable_and_collapsed_end(self):
        section,settings=fixture(start=720,end=960,days=[0,1]);band=section['sub_schedules'][0]['bands'][0]
        band['start_dynamic']={'event':'noon','offset':0}
        band['end_dynamic']={'event':'sunset','offset':-300}
        solar=lambda day,event: 720 if event=='noon' else 1320
        self.manager.solar=solar
        await self.save(section,settings)
        self.assertEqual(self.calls,[])
        await self.at(12);self.assertEqual(self.calls[-1]['temperature'],21)
        await self.manager.stop()
        self.manager=Manager(self.hass);self.manager.store=self.store;self.manager.solar=solar
        await self.manager.start();self.assertEqual(len(self.calls),1)
        await self.manager.set_section_enabled(self.manager.model['revision'],section['id'],False)
        await self.manager.set_section_enabled(self.manager.model['revision'],section['id'],True)
        self.assertEqual([c['temperature'] for c in self.calls],[21,13,21])
        await self.at(17);self.assertEqual(self.calls[-1]['temperature'],13)
        band['start_dynamic']={'event':'sunset','offset':0}
        band['end_dynamic']={'event':'noon','offset':0}
        await self.save(section,settings)
        self.calls.clear();await self.at(22)
        self.assertEqual([c['temperature'] for c in self.calls],[13])
        self.calls.clear();await self.at(12,day=1);self.assertEqual(self.calls,[]);await self.at(22,day=1)
        self.assertEqual([c['temperature'] for c in self.calls],[13])

    async def test_no_suppression_same_value_and_adjacent(self):
        section,settings=fixture(start=720,end=780)
        section['sub_schedules'][0]['bands'].append({'id':uid(),'start_minute':780,'end_minute':840})
        await self.save(section,settings);await self.at(12)
        self.set_state('climate.kitchen',temperature_value=22);await self.hass.async_block_till_done()
        await self.at(13)
        self.assertEqual([c['temperature'] for c in self.calls],[21,13,21])

    async def test_atomic_failure_conflict_and_stale_callback(self):
        section,settings=fixture();await self.save(section,settings);old=deepcopy(self.manager.snapshot);token=self.manager.generation
        self.store.fail=True;section['name']='changed'
        with self.assertRaises(OSError):await self.save(section,settings)
        self.assertEqual(self.manager.snapshot,old)
        self.store.fail=False
        with self.assertRaises(Invalid):await self.manager.save_section(0,'delete',section['id'])
        await self.manager.save_section(self.manager.model['revision'],'delete',section['id'])
        self.clock=NOW.replace(hour=12);await self.manager.tick(token)
        self.assertEqual(self.calls,[]);self.assertEqual(self.manager.model['entity_settings'],{})

    async def test_save_during_band_no_retroactive_command(self):
        section,settings=fixture();await self.save(section,settings);await self.at(12)
        self.calls.clear();self.clock=NOW.replace(hour=13)
        section['entities'][0]['target']['value']=23
        section['sub_schedules'][0]['bands'][0]['start_minute']=660
        await self.save(section,settings)
        self.assertEqual(self.calls,[])
        await self.at(16);self.assertEqual(self.calls[-1]['temperature'],13)

    async def test_exact_commit_boundary_runs_only_unprocessed_endpoint(self):
        section,settings=fixture();await self.save(section,settings)
        self.clock=NOW.replace(hour=12)
        section['entities'][0]['target']['value']=23
        await self.save(section,settings)
        self.assertEqual([c['temperature'] for c in self.calls],[23])
        section['name']='Rename after processed endpoint'
        await self.save(section,settings);await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls],[23])

    async def test_dispatch_delay_rearms_overdue_endpoint_without_losing_it(self):
        section,settings=fixture(start=720,end=725);await self.save(section,settings)
        async def delayed(call):
            self.calls.append(deepcopy(call.data))
            if call.data['temperature']==21:self.clock=NOW.replace(hour=12,minute=6)
        self.hass.services.async_register('climate','set_temperature',delayed)
        captured=[]
        def timer(hass,action,when):
            captured.append(when)
            return lambda:None
        with patch('custom_components.scheduling_manager.scheduler.async_track_point_in_utc_time',side_effect=timer):
            await self.at(12)
            self.assertEqual(captured[-1],NOW.replace(hour=12,minute=6))
            await self.manager.tick()
        self.assertEqual([c['temperature'] for c in self.calls],[21,13])

    async def test_away_logical_restart_idempotence_and_new_members(self):
        section,settings=fixture();await self.save(section,settings)
        await self.manager.set_away(True);await self.manager.set_away(True)
        self.assertEqual([c['temperature'] for c in self.calls],[13])
        await self.at(12);self.assertEqual(self.calls[-1]['temperature'],13)
        await self.restart();await self.manager.set_away(False)
        self.assertEqual([c['temperature'] for c in self.calls],[13,21])
        await self.manager.set_away(True)
        self.set_state('climate.lounge');key=uid()
        settings[key]={'entity_id':'climate.lounge','registry_id':None,'setback':{'value':14,'unit':'°C'}}
        section['entities'].append({'entity_key':key,'target':{'value':22,'unit':'°C'}})
        await self.save(section,settings)
        self.assertEqual(self.calls[-1],{'entity_id':'climate.lounge','temperature':14})

    async def restart(self):
        await self.manager.stop();self.manager=Manager(self.hass);self.manager.store=self.store;await self.manager.start()

    async def test_restart_manual_preserved_missed_coalesced_and_pending_journal(self):
        section,settings=fixture();await self.save(section,settings);await self.at(12)
        self.set_state('climate.kitchen',temperature_value=22);await self.hass.async_block_till_done();self.calls.clear()
        self.clock=NOW.replace(hour=13);await self.restart();self.assertEqual(self.calls,[])
        self.clock=NOW.replace(hour=17);await self.restart();self.assertEqual([c['temperature'] for c in self.calls],[13])
        self.calls.clear();self.clock=NOW+timedelta(days=800);await self.restart();self.assertLessEqual(len(self.calls),1)

    async def test_unavailable_newest_pending_and_healthy_entity(self):
        section,settings=fixture();key=uid();self.set_state('climate.lounge')
        settings[key]={'entity_id':'climate.lounge','registry_id':None,'setback':{'value':14,'unit':'°C'}}
        section['entities'].append({'entity_key':key,'target':{'value':22,'unit':'°C'}})
        await self.save(section,settings)
        self.set_state('climate.kitchen','unavailable');await self.hass.async_block_till_done()
        await self.at(12);await self.at(16)
        self.assertEqual([c['entity_id'] for c in self.calls],['climate.lounge','climate.lounge'])
        self.set_state('climate.kitchen');await self.hass.async_block_till_done()
        self.assertEqual(self.calls[-1],{'entity_id':'climate.kitchen','temperature':13})
        self.assertFalse(self.manager.snapshot['runtime']['pending'])

    async def test_manual_change_cancels_failed_pending_and_removal(self):
        section,settings=fixture();await self.save(section,settings);self.fail_entity='climate.kitchen';await self.at(12)
        self.assertTrue(self.manager.snapshot['runtime']['pending'])
        self.set_state('climate.kitchen',temperature_value=23);await self.hass.async_block_till_done()
        self.assertFalse(self.manager.snapshot['runtime']['pending'])
        await self.at(16);await self.manager.save_section(self.manager.model['revision'],'delete',section['id'])
        self.assertFalse(self.manager.snapshot['runtime']['pending'])

    async def test_midnight_real_end_without_synthetic_event(self):
        section,settings=fixture(start=1380,end=1440);await self.save(section,settings)
        await self.at(23);await self.at(0,day=1)
        self.assertEqual([c['temperature'] for c in self.calls],[21,13])
        await self.at(0,day=2);self.assertEqual(len(self.calls),2)

    async def test_timezone_cutover_and_rename(self):
        self.hass.states.async_remove('climate.kitchen')
        entry=er.async_get(self.hass).async_get_or_create('climate','mock','kitchen',suggested_object_id='kitchen')
        self.set_state('climate.kitchen')
        section,settings=fixture();next(iter(settings.values()))['registry_id']=entry.id
        await self.save(section,settings)
        er.async_get(self.hass).async_update_entity(entry.entity_id,new_entity_id='climate.renamed')
        await self.manager._refresh_environment()
        self.assertEqual(next(iter(self.manager.model['entity_settings'].values()))['entity_id'],'climate.renamed')
        self.hass.config.time_zone='Europe/London';self.clock=NOW.replace(hour=13)
        await self.manager._refresh_environment();self.assertEqual(self.calls,[])
        self.assertEqual(self.manager.snapshot['runtime']['zone'],'Europe/London')

    async def test_fallback_steps_range_only_cached_and_unit_conversion(self):
        self.set_state('climate.kitchen',step=None)
        self.assertEqual(self.manager.capabilities()['climate.kitchen']['step'],.1)
        self.set_state('climate.range',features=2)
        self.assertFalse(self.manager.capabilities()['climate.range']['supported'])
        section,settings=fixture();await self.save(section,settings)
        self.set_state('climate.kitchen','unavailable');await self.hass.async_block_till_done()
        self.assertEqual(self.manager.capabilities()['climate.kitchen']['step'],.1)

    async def test_changed_mode_does_not_break_restart_or_block_deletion(self):
        section,settings=fixture();await self.save(section,settings)
        self.set_state('climate.kitchen',features=2)
        await self.at(12)
        self.assertFalse(self.calls);self.assertTrue(self.manager.snapshot['runtime']['errors'])
        await self.restart();await self.restart()
        await self.manager.save_section(self.manager.model['revision'],'delete',section['id'])
        self.assertFalse(self.manager.model['entity_settings'])

    async def test_configured_unit_change_converts_and_revalidates_dispatch(self):
        from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
        section,settings=fixture(target=20);next(iter(settings.values()))['setback']['value']=10
        await self.save(section,settings)
        self.hass.config.units=US_CUSTOMARY_SYSTEM
        self.hass.states.async_set('climate.kitchen','heat',{'supported_features':1,'min_temp':45,'max_temp':95,'target_temp_step':1,'temperature':68})
        await self.at(12);await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls],[68,50])

    async def test_read_permissions_and_admin_mutation(self):
        section,settings=fixture();await self.save(section,settings)
        class Permissions:
            def check_entity(self,eid,policy):return False
        class User:
            is_admin=False;permissions=Permissions()
        self.assertEqual(visible(self.manager,User())['model']['entity_settings'],{})
        self.assertEqual(visible(self.manager,User())['model']['schedules'],[])
        class Connection:
            user=User()
            def send_error(self,*args):self.error=args
        connection=Connection()
        await mutation(self.hass,connection,{'id':1},lambda manager:manager.set_away(True))
        self.assertEqual(connection.error[1],'unauthorized');self.assertFalse(self.manager.model['away'])

    async def toggle(self,section,enabled):
        return await self.manager.set_section_enabled(self.manager.model['revision'],section['id'],enabled)

    async def test_disable_setback_immediate_suspend_and_idempotent(self):
        section,settings=fixture();await self.save(section,settings);token=self.manager.generation
        await self.toggle(section,False)
        self.assertEqual(self.calls,[{'entity_id':'climate.kitchen','temperature':13}])
        self.assertFalse(self.manager.model['schedules'][0]['enabled'])
        await self.toggle(section,False)
        self.set_state('climate.kitchen',temperature_value=22);await self.hass.async_block_till_done()
        self.clock=NOW.replace(hour=12);await self.manager.tick(token);await self.manager.tick()
        await self.at(16)
        self.assertEqual(len(self.calls),1)

    async def test_enable_active_targets_per_entity_and_future_end(self):
        section,settings=fixture();key=uid();self.set_state('climate.lounge')
        settings[key]={'entity_id':'climate.lounge','registry_id':None,'setback':{'value':14,'unit':'°C'}}
        section['entities'].append({'entity_key':key,'target':{'value':22,'unit':'°C'}})
        await self.save(section,settings);await self.toggle(section,False)
        self.calls.clear();self.clock=NOW.replace(hour=13)
        await self.toggle(section,True)
        self.assertEqual(self.calls,[{'entity_id':'climate.kitchen','temperature':21},{'entity_id':'climate.lounge','temperature':22}])
        await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls],[21,22,13,14])

    async def test_enable_outside_band_and_no_schedule_day_setback(self):
        section,settings=fixture();await self.save(section,settings)
        await self.toggle(section,False);self.calls.clear();await self.toggle(section,True)
        self.assertEqual([c['temperature'] for c in self.calls],[13])
        await self.toggle(section,False);self.calls.clear();self.clock=NOW.replace(hour=13)+timedelta(days=1)
        await self.toggle(section,True)
        self.assertEqual([c['temperature'] for c in self.calls],[13])

    async def test_toggle_last_command_wins_without_cross_section_enforcement(self):
        a,settings=fixture();key=next(iter(settings));b,_=fixture(key=key,target=24)
        await self.save(a,settings);await self.save(b,settings);await self.at(12)
        self.assertEqual([c['temperature'] for c in self.calls],[21,24])
        await self.toggle(a,False);self.assertEqual(self.calls[-1]['temperature'],13)
        await self.toggle(a,True);self.assertEqual(self.calls[-1]['temperature'],21)
        self.assertTrue(self.manager.model['schedules'][1]['enabled'])

    async def test_disabled_restart_has_no_missed_transitions(self):
        section,settings=fixture();await self.save(section,settings);await self.toggle(section,False)
        self.calls.clear();self.clock=NOW.replace(hour=17);await self.restart()
        self.assertFalse(self.manager.model['schedules'][0]['enabled']);self.assertEqual(self.calls,[])

    async def test_toggle_pending_recovery_only_newest_value(self):
        section,settings=fixture();await self.save(section,settings)
        self.set_state('climate.kitchen','unavailable');await self.hass.async_block_till_done()
        await self.toggle(section,False);await self.at(12)
        self.assertEqual(self.calls,[])
        self.clock=NOW.replace(hour=13);await self.toggle(section,True)
        self.set_state('climate.kitchen');await self.hass.async_block_till_done()
        self.assertEqual([c['temperature'] for c in self.calls],[21])

    async def test_disable_while_away_prevents_old_target_restore(self):
        section,settings=fixture();await self.save(section,settings);await self.at(12)
        await self.manager.set_away(True);await self.toggle(section,False);self.calls.clear()
        await self.restart();await self.manager.set_away(False)
        self.assertEqual(self.calls,[])

    async def test_enable_during_away_defers_target_to_away_exit(self):
        section,settings=fixture();await self.save(section,settings);await self.toggle(section,False)
        await self.manager.set_away(True);self.clock=NOW.replace(hour=13);self.calls.clear()
        await self.toggle(section,True);self.assertEqual([c['temperature'] for c in self.calls],[13])
        await self.restart();await self.manager.set_away(False)
        self.assertEqual([c['temperature'] for c in self.calls],[13,21])

    async def test_toggle_storage_failure_conflict_and_save_cannot_bypass(self):
        section,settings=fixture();await self.save(section,settings);before=deepcopy(self.manager.snapshot)
        self.store.fail=True
        with self.assertRaises(OSError):await self.toggle(section,False)
        self.assertEqual(self.manager.snapshot,before);self.assertEqual(self.calls,[])
        self.store.fail=False
        with self.assertRaises(Invalid):await self.manager.set_section_enabled(0,section['id'],False)
        section['enabled']=False
        with self.assertRaises(Invalid):await self.save(section,settings)
        self.assertEqual(self.calls,[])
        section.pop('enabled');await self.toggle(section,False);self.calls.clear()
        await self.save(section,settings)
        self.assertFalse(self.manager.model['schedules'][0]['enabled']);self.assertEqual(self.calls,[])

    async def test_category_commit_persists_and_removing_last_assignment_cleans_catalog(self):
        section,settings=fixture();section['category']='  Upstairs  ';await self.save(section,settings)
        self.assertEqual(self.manager.model['schedules'][0]['category'],'Upstairs');self.assertEqual(self.calls,[])
        await self.restart();self.assertEqual(self.manager.model['schedules'][0]['category'],'Upstairs')
        section['category']=None;await self.save(section,settings)
        self.assertFalse(any(s.get('category') for s in self.manager.model['schedules']));self.assertEqual(self.calls,[])

    async def test_category_only_save_keeps_away_history_and_pending_plan(self):
        section,settings=fixture();await self.save(section,settings);await self.at(12);await self.manager.set_away(True)
        before=deepcopy(self.manager.snapshot['runtime']);self.clock=NOW.replace(hour=13);self.calls.clear()
        section['category']='Heating';await self.save(section,settings)
        self.assertEqual(self.manager.snapshot['runtime'],before);self.assertEqual(self.calls,[])
        await self.manager.set_away(False);self.assertEqual([c['temperature'] for c in self.calls],[21])

    async def test_category_validation_storage_failure_and_conflict(self):
        section,settings=fixture();await self.save(section,settings);before=deepcopy(self.manager.snapshot)
        for value in (True,42,{},[]):
            section['category']=value
            with self.assertRaises(Invalid):await self.save(section,settings)
        section['category']='Lighting';self.store.fail=True
        with self.assertRaises(OSError):await self.save(section,settings)
        self.assertEqual(self.manager.snapshot,before);self.store.fail=False
        with self.assertRaises(Invalid):await self.manager.save_section(0,'upsert',section['id'],section,settings)
        self.assertEqual(self.calls,[])

    async def test_sub_name_only_save_preserves_away_history_and_pending(self):
        section, settings = fixture()
        await self.save(section, settings)
        await self.at(12)
        await self.manager.set_away(True)
        before = deepcopy(self.manager.snapshot['runtime'])
        self.clock = NOW.replace(hour=13)
        section['sub_schedules'][0]['name'] = '  Weekdays  '
        await self.save(section, settings)
        self.assertEqual(self.manager.snapshot['runtime'], before)
        await self.manager.set_away(False)
        self.assertEqual(self.calls[-1]['temperature'], 21)
        self.fail_entity = 'climate.kitchen'
        await self.at(16)
        before = deepcopy(self.manager.snapshot['runtime'])
        section['sub_schedules'][0]['name'] = ''
        await self.save(section, settings)
        self.assertEqual(self.manager.snapshot['runtime'], before)
        self.assertNotIn('name', self.manager.model['schedules'][0]['sub_schedules'][0])
        self.fail_entity = None
        self.set_state('climate.kitchen', 'unavailable')
        self.set_state('climate.kitchen')
        await self.hass.async_block_till_done()
        self.assertEqual(self.calls[-1]['temperature'], 13)
        self.assertFalse(self.manager.snapshot['runtime']['pending'])

    async def test_save_cutover_preserves_unrelated_overdue_and_is_atomic(self):
        a, sa = fixture(start=780)
        b, sb = fixture(target=19)
        sb[next(iter(sb))]['entity_id'] = 'climate.office'
        self.set_state('climate.office')
        await self.hass.async_block_till_done()
        await self.save(a, sa)
        await self.save(b, sb)
        self.clock = NOW.replace(hour=12, minute=1)
        a['sub_schedules'][0]['bands'][0]['end_minute'] = 1020
        before = deepcopy(self.manager.snapshot)
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.save(a, sa)
        self.assertEqual(self.manager.snapshot, before)
        self.assertEqual(self.calls, [])
        self.store.fail = False
        await self.save(a, sa)
        await self.manager.tick()
        self.assertEqual(self.calls, [{'entity_id': 'climate.office', 'temperature': 19}])

    async def test_delete_cutover_retains_shared_entity_unrelated_progress(self):
        a, settings = fixture(start=780)
        b, _ = fixture(key=next(iter(settings)), target=19)
        await self.save(a, settings)
        await self.save(b, settings)
        self.clock = NOW.replace(hour=12, minute=1)
        await self.manager.save_section(self.manager.model['revision'], 'delete', a['id'])
        self.assertEqual([call['temperature'] for call in self.calls], [19])
        await self.manager.set_away(True)
        await self.manager.set_away(False)
        self.assertEqual(self.calls[-1]['temperature'], 19)

    async def test_cutover_shared_entity_exact_boundary_order_not_replayed(self):
        a, settings = fixture(start=720)
        b, _ = fixture(start=715, key=next(iter(settings)), target=19)
        await self.save(a, settings)
        await self.save(b, settings)
        self.clock = NOW.replace(hour=12)
        a['entities'][0]['target']['value'] = 23
        await self.save(a, settings)
        self.assertEqual([call['temperature'] for call in self.calls], [23])
        await self.manager.tick()
        self.assertEqual([call['temperature'] for call in self.calls], [23])
        self.assertEqual(next(iter(self.manager.snapshot['runtime']['normal'].values()))['source'], a['id'])

    async def test_dispatch_direct_capability_reads_and_cache_pruning(self):
        self.set_state('climate.unscheduled')
        await self.hass.async_block_till_done()
        section, settings = fixture()
        await self.save(section, settings)
        self.assertEqual(set(self.manager.snapshot['capabilities']), {'climate.kitchen'})
        with patch.object(type(self.hass.states), 'async_all', side_effect=AssertionError('Full scan during dispatch')):
            await self.at(12)
        self.assertEqual(self.calls[-1]['temperature'], 21)
        self.set_state('climate.kitchen', 'unavailable')
        await self.hass.async_block_till_done()
        self.assertIn('climate.kitchen', self.manager.snapshot['capabilities'])
        await self.manager.save_section(self.manager.model['revision'], 'delete', section['id'])
        self.assertEqual(self.manager.snapshot['capabilities'], {})

    async def test_notifications_coalesce_and_ignore_unrelated_current_updates(self):
        section, settings = fixture()
        await self.save(section, settings)
        await self.hass.async_block_till_done()
        with patch('custom_components.scheduling_manager.scheduler.async_dispatcher_send') as send:
            self.manager._notify()
            self.manager._notify()
            self.manager._notify()
            await self.hass.async_block_till_done()
            self.assertEqual(send.call_count, 1)
            send.reset_mock()
            self.set_state('climate.kitchen', temperature_value=22)
            self.hass.states.async_set('sensor.unrelated', '123')
            await self.hass.async_block_till_done()
            self.assertEqual(send.call_count, 0)

    async def test_unavailability_with_missing_attributes_keeps_failed_pending(self):
        section, settings = fixture()
        await self.save(section, settings)
        self.fail_entity = 'climate.kitchen'
        await self.at(12)
        key = next(iter(settings))
        self.hass.states.async_set('climate.kitchen', 'unavailable', {})
        await self.hass.async_block_till_done()
        self.assertIn(key, self.manager.snapshot['runtime']['pending'])
        self.fail_entity = None
        self.set_state('climate.kitchen')
        await self.hass.async_block_till_done()
        self.assertEqual(self.calls[-1]['temperature'], 21)
        self.assertNotIn(key, self.manager.snapshot['runtime']['pending'])

    async def test_registry_event_refreshes_entity_index_and_prunes_old_identity(self):
        entry = er.async_get(self.hass).async_get_or_create('climate', 'mock', 'indexed-kitchen', suggested_object_id='kitchen')
        self.set_state(entry.entity_id)
        section, settings = fixture()
        setting = next(iter(settings.values()))
        setting['entity_id'] = entry.entity_id
        setting['registry_id'] = entry.id
        await self.save(section, settings)
        old_id = entry.entity_id
        er.async_get(self.hass).async_update_entity(old_id, new_entity_id='climate.indexed_renamed')
        await self.hass.async_block_till_done()
        self.assertIn('climate.indexed_renamed', self.manager.entity_keys)
        self.assertNotIn(old_id, self.manager.entity_keys)
        self.assertNotIn(old_id, self.manager.snapshot['capabilities'])
        self.assertIn('climate.indexed_renamed', self.manager.snapshot['capabilities'])

    async def test_invalid_climate_metadata_isolated_and_missing_direct_lookup_empty(self):
        self.hass.states.async_set('climate.invalid', 'heat', {'min_temp': float('inf'), 'max_temp': 35, 'supported_features': 1})
        caps = self.manager.capabilities({'climate.invalid', 'climate.kitchen', 'climate.missing'})
        self.assertFalse(caps['climate.invalid']['supported'])
        self.assertTrue(caps['climate.kitchen']['supported'])
        self.assertNotIn('climate.missing', caps)

    async def test_post_commit_acknowledgement_failure_keeps_configuration_and_pending(self):
        section, settings = fixture()
        await self.save(section, settings)
        self.clock = NOW.replace(hour=11)
        original = self.store.async_save
        writes = 0
        async def fail_acknowledgement(candidate):
            nonlocal writes
            writes += 1
            # _advance and the configuration commit succeed; its acknowledgement fails.
            if writes > 2:
                raise OSError('acknowledgement failed')
            await original(candidate)
        self.store.async_save = fail_acknowledgement
        self.calls.clear()
        with patch.object(self.manager, '_arm'), self.assertLogs('custom_components.scheduling_manager.scheduler', level='ERROR'):
            result = await self.manager.set_section_enabled(self.manager.model['revision'], section['id'], False)
        self.assertFalse(result['model']['schedules'][0]['enabled'])
        self.assertTrue(self.manager.snapshot['runtime']['pending'])
        self.assertEqual(self.calls[-1]['temperature'], 13)
        self.assertEqual(self.manager.storage_error, 'acknowledgement failed')

    async def test_tick_storage_failure_backs_off_without_actions_then_recovers(self):
        section, settings = fixture()
        await self.save(section, settings)
        before = deepcopy(self.manager.snapshot)
        self.clock = NOW.replace(hour=12)
        self.store.fail = True
        armed = []
        def timer(hass, action, when):
            armed.append(when)
            return lambda: None
        with patch('custom_components.scheduling_manager.scheduler.async_track_point_in_utc_time', side_effect=timer):
            with self.assertLogs('custom_components.scheduling_manager.scheduler', level='ERROR'):
                await self.manager.tick()
            self.assertEqual(self.manager.snapshot, before)
            self.assertEqual(self.calls, [])
            self.assertEqual(armed[-1], self.clock + timedelta(seconds=60))
            self.store.fail = False
            self.clock += timedelta(seconds=60)
            await self.manager.tick()
        self.assertEqual([call['temperature'] for call in self.calls], [21])
        self.assertIsNone(self.manager.storage_error)
        self.assertFalse(self.manager.snapshot['runtime']['pending'])

    async def test_public_activity_uses_running_band_not_enable_away_or_preview(self):
        section, settings = fixture(days=[0, 1])
        await self.save(section, settings)
        self.assertFalse(self.manager.public()['active_schedules'][section['id']])
        await self.at(12)
        self.assertTrue(self.manager.public()['active_schedules'][section['id']])
        await self.manager.set_away(True)
        self.assertFalse(self.manager.public()['active_schedules'][section['id']])
        section['away_enabled'] = False
        await self.save(section, settings)
        self.assertTrue(self.manager.public()['active_schedules'][section['id']])
        await self.toggle(section, False)
        self.assertFalse(self.manager.public()['active_schedules'][section['id']])

    async def test_public_activity_respects_fold_and_collapsed_dynamic_bands(self):
        section, settings = fixture(start=70, end=105, days=[6])
        self.hass.config.time_zone = 'Europe/London'
        self.clock = datetime(2026, 10, 25, 0, 0, tzinfo=UTC)
        await self.save(section, settings)
        self.clock = datetime(2026, 10, 25, 0, 20, tzinfo=UTC)
        self.assertTrue(self.manager.public()['active_schedules'][section['id']])
        self.clock = datetime(2026, 10, 25, 1, 20, tzinfo=UTC)
        self.assertFalse(self.manager.public()['active_schedules'][section['id']])
        band = section['sub_schedules'][0]['bands'][0]
        band['start_dynamic'] = {'event': 'sunset', 'offset': 0}
        self.manager.solar = lambda day, event: 100
        await self.save(section, settings)
        self.clock = datetime(2026, 10, 25, 0, 40, tzinfo=UTC)
        self.assertTrue(self.manager.public()['active_schedules'][section['id']])
        band['end_minute'] = 90
        await self.save(section, settings)
        self.assertFalse(self.manager.public()['active_schedules'][section['id']])


if __name__=='__main__':
    print(f'Running against Home Assistant {__version__}',flush=True)
    unittest.main(verbosity=2)
