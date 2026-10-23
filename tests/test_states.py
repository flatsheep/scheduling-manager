"""Mixed writable entities, explicit action payloads and per-section Away policy."""
from copy import deepcopy
from datetime import timedelta
import unittest
import test_backend as base

from custom_components.scheduling_manager.actions import state_value
from custom_components.scheduling_manager.validation import Invalid


class StateTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUpBase = base.IntegrationTests.asyncSetUp
    asyncTearDown = base.IntegrationTests.asyncTearDown
    save = base.IntegrationTests.save
    at = base.IntegrationTests.at
    restart = base.IntegrationTests.restart
    toggle = base.IntegrationTests.toggle
    set_state = base.IntegrationTests.set_state

    async def asyncSetUp(self):
        await self.asyncSetUpBase()
        self.actions=[]
        self.fail_state=None
        async def action(call):
            self.actions.append((call.domain,call.service,deepcopy(call.data)))
            if call.data['entity_id']==self.fail_state:raise RuntimeError('mock state action failure')
        services={
            'light':['turn_on','turn_off'], 'switch':['turn_on','turn_off'], 'input_boolean':['turn_on','turn_off'],
            'automation':['turn_on','turn_off'], 'script':['turn_on','turn_off'], 'remote':['turn_on','turn_off'],
            'humidifier':['turn_on','turn_off'], 'fan':['turn_on','turn_off'], 'siren':['turn_on','turn_off'],
            'cover':['open_cover','close_cover'], 'valve':['open_valve','close_valve'], 'lock':['lock','unlock'],
            'select':['select_option'], 'input_select':['select_option'], 'number':['set_value'], 'input_number':['set_value'],
            'text':['set_value'], 'input_text':['set_value'], 'date':['set_value'], 'time':['set_value'], 'datetime':['set_value'],
            'input_datetime':['set_datetime'], 'water_heater':['set_operation_mode'],
            'media_player':['media_play','media_pause','media_stop','turn_off'],
            'vacuum':['start','return_to_base','pause','stop'], 'lawn_mower':['start_mowing','dock','pause'],
            'alarm_control_panel':['alarm_arm_home','alarm_arm_away','alarm_arm_night','alarm_arm_vacation','alarm_arm_custom_bypass','alarm_disarm'],
            'timer':['start','pause','cancel'], 'homeassistant':['turn_on','turn_off'],
        }
        for domain, names in services.items():
            for name in names:self.hass.services.async_register(domain,name,action)
            self.hass.states.async_set(domain+'.fixture','off',{'friendly_name':domain,'supported_features':2**20-1,
                'options':['Relax','Focus','Off'],'operation_list':['eco','electric'],'min':0,'max':100,'step':.5,
                'has_date':True,'has_time':True,'code_arm_required':False})
        self.hass.states.async_set('sensor.readonly','22',{'friendly_name':'Read-only temperature'})

    def state_section(self,domain='light',start='on',end='off',key=None):
        section,_=base.fixture(key=key)
        key=section['entities'][0]['entity_key']
        section['entities']=[{'entity_key':key,'start_state':start,'end_state':end}]
        settings={key:{'entity_id':domain+'.fixture','registry_id':None}}
        return section,settings

    async def test_mixed_section_temperature_and_state_payloads(self):
        section,settings=base.fixture();light,light_settings=self.state_section()
        section['entities']+=light['entities'];settings.update(light_settings)
        await self.save(section,settings);self.assertEqual(self.actions,[]);self.assertEqual(self.calls,[])
        await self.at(12);await self.at(16)
        self.assertEqual([c['temperature'] for c in self.calls],[21,13])
        self.assertEqual(self.actions,[('light','turn_on',{'entity_id':'light.fixture'}),('light','turn_off',{'entity_id':'light.fixture'})])

    async def test_inverted_endpoints_and_states_independent_between_sections(self):
        a,settings=self.state_section(start='off',end='on');key=next(iter(settings))
        b,_=self.state_section(start='on',end='off',key=key);b['sub_schedules'][0]['bands'][0].update(start_minute=750,end_minute=1020)
        await self.save(a,settings);await self.save(b,settings)
        await self.at(12);await self.at(12,30);await self.at(16);await self.at(17)
        self.assertEqual([c[1] for c in self.actions],['turn_off','turn_on','turn_on','turn_off'])
        self.assertNotIn('setback',self.manager.model['entity_settings'][key])

    async def test_binary_and_feature_domains_use_real_actions(self):
        cases=[('switch','on','off','turn_on','turn_off'),('input_boolean','on','off','turn_on','turn_off'),
               ('automation','on','off','turn_on','turn_off'),('script','on','off','turn_on','turn_off'),
               ('remote','on','off','turn_on','turn_off'),('humidifier','on','off','turn_on','turn_off'),
               ('fan','on','off','turn_on','turn_off'),('siren','on','off','turn_on','turn_off'),
               ('cover','open','closed','open_cover','close_cover'),('valve','open','closed','open_valve','close_valve'),
               ('lock','locked','unlocked','lock','unlock'),('vacuum','cleaning','docked','start','return_to_base'),
               ('lawn_mower','mowing','docked','start_mowing','dock'),('media_player','playing','paused','media_play','media_pause')]
        for domain,start,end,_,_ in cases:
            section,settings=self.state_section(domain,start,end);await self.save(section,settings)
        await self.at(12);await self.at(16)
        self.assertEqual([(d,s) for d,s,_ in self.actions],[(d,s) for d,_,_,s,_ in cases]+[(d,s) for d,_,_,_,s in cases])
        self.assertTrue(all(set(data)=={'entity_id'} for _,_,data in self.actions))

    async def test_select_number_text_and_datetime_action_fields(self):
        cases=[('select','Focus','Relax','select_option','option'),('input_select','Focus','Off','select_option','option'),
               ('number',20.5,10,'set_value','value'),('input_number',30,5,'set_value','value'),
               ('text','Morning scene','Evening scene','set_value','value'),('input_text','alpha','beta','set_value','value'),
               ('date','2026-10-06','2026-10-07','set_value','date'),('time','08:00:00','18:00:00','set_value','time'),
               ('datetime','2026-10-06T08:00:00','2026-10-06T18:00:00','set_value','datetime'),
               ('input_datetime','2026-10-06 08:00:00','2026-10-06 18:00:00','set_datetime','datetime'),
               ('water_heater','eco','electric','set_operation_mode','operation_mode')]
        for domain,start,end,_,_ in cases:
            section,settings=self.state_section(domain,start,end);await self.save(section,settings)
        await self.at(12);await self.at(16)
        self.assertEqual(self.actions,[(d,s,{'entity_id':d+'.fixture',field:value}) for endpoint in (1,2) for d,start,end,s,field in cases for value in ([start] if endpoint==1 else [end])])

    async def test_readonly_invalid_options_and_feature_filtered_choices(self):
        self.assertNotIn('sensor.readonly',self.manager.capabilities())
        self.hass.states.async_set('cover.fixture','closed',{'supported_features':1})
        self.assertEqual(self.manager.capabilities()['cover.fixture']['options'],['open'])
        section,settings=self.state_section('select','not an option','Relax')
        with self.assertRaises(Invalid):await self.save(section,settings)
        section,settings=self.state_section('number',20.1,10)
        with self.assertRaises(Invalid):await self.save(section,settings)
        section,settings=self.state_section();section['entities'][0]['start_state']={'service':'turn_off'}
        with self.assertRaises(Invalid):await self.save(section,settings)
        self.assertEqual(self.actions,[])

    async def test_nonclimate_disable_and_inactive_enable_leave_state_unchanged(self):
        section,settings=self.state_section();await self.save(section,settings);await self.toggle(section,False)
        self.assertEqual(self.actions,[]);await self.toggle(section,True);self.assertEqual(self.actions,[])
        await self.at(12);self.actions.clear();await self.toggle(section,False);await self.at(16)
        self.assertEqual(self.actions,[]);await self.toggle(section,True);self.assertEqual(self.actions,[])
        await self.toggle(section,False);self.clock=base.NOW.replace(hour=13)+timedelta(days=1);await self.toggle(section,True)
        self.assertEqual(self.actions,[])

    async def test_active_enable_and_away_exit_apply_only_start_state(self):
        section,settings=self.state_section();await self.save(section,settings);await self.toggle(section,False)
        self.clock=base.NOW.replace(hour=13);await self.toggle(section,True)
        self.assertEqual([a[1] for a in self.actions],['turn_on'])
        await self.manager.set_away(True);await self.at(14);self.assertEqual(len(self.actions),1)
        await self.restart();await self.manager.set_away(False)
        self.assertEqual([a[1] for a in self.actions],['turn_on','turn_on'])
        await self.manager.set_away(True);await self.at(17);self.actions.clear();await self.manager.set_away(False)
        self.assertEqual(self.actions,[])

    async def test_away_opt_in_mixed_section_climate_setback_state_suspended(self):
        section,settings=base.fixture();light,extra=self.state_section();section['entities']+=light['entities'];settings.update(extra)
        await self.save(section,settings);await self.manager.set_away(True)
        self.assertEqual([c['temperature'] for c in self.calls],[13]);self.assertEqual(self.actions,[])
        await self.at(12);await self.at(16);self.assertEqual([c['temperature'] for c in self.calls],[13]);self.assertEqual(self.actions,[])

    async def test_away_disabled_section_continues_state_and_temperature_transitions(self):
        section,settings=base.fixture();light,extra=self.state_section();section['entities']+=light['entities'];settings.update(extra);section['away_enabled']=False
        await self.save(section,settings);await self.manager.set_away(True);self.assertEqual(self.actions,[]);self.assertEqual(self.calls,[])
        await self.at(12);await self.at(16);self.assertEqual([c['temperature'] for c in self.calls],[21,13]);self.assertEqual([a[1] for a in self.actions],['turn_on','turn_off'])
        await self.manager.set_away(False);self.assertEqual(len(self.calls),2);self.assertEqual(len(self.actions),2)

    async def test_away_participation_save_atomicity_and_new_members_during_away(self):
        section,settings=self.state_section();await self.save(section,settings);await self.manager.set_away(True)
        section['away_enabled']=False;self.store.fail=True
        with self.assertRaises(OSError):await self.save(section,settings)
        self.assertTrue(self.manager.model['schedules'][0]['away_enabled']);self.store.fail=False
        await self.save(section,settings);await self.at(12);self.assertEqual([a[1] for a in self.actions],['turn_on'])
        other,extra=self.state_section('switch');await self.save(other,extra);self.assertEqual(len(self.actions),1)

    async def test_unavailable_latest_state_catchup_and_manual_failure_cancellation(self):
        section,settings=self.state_section();await self.save(section,settings)
        self.hass.states.async_set('light.fixture','unavailable');await self.hass.async_block_till_done()
        await self.at(12);await self.at(16);self.assertEqual(self.actions,[])
        self.hass.states.async_set('light.fixture','on');await self.hass.async_block_till_done();self.assertEqual([a[1] for a in self.actions],['turn_off'])
        self.actions.clear();self.clock=base.NOW.replace(hour=17)+timedelta(days=7);await self.restart();self.assertEqual([a[1] for a in self.actions],['turn_off'])
        self.fail_state='light.fixture';self.clock=base.NOW.replace(hour=12)+timedelta(days=14);await self.manager.tick()
        self.assertTrue(self.manager.snapshot['runtime']['pending']);self.hass.states.async_set('light.fixture','off');await self.hass.async_block_till_done()
        self.assertFalse(self.manager.snapshot['runtime']['pending'])

    async def test_disabled_pending_cancel_and_away_cancel_but_unaffected_work_kept(self):
        section,settings=self.state_section();await self.save(section,settings);self.fail_state='light.fixture';await self.at(12)
        await self.toggle(section,False);self.assertFalse(self.manager.snapshot['runtime']['pending'])
        await self.toggle(section,True);self.assertTrue(self.manager.snapshot['runtime']['pending'])
        await self.manager.set_away(True);self.assertFalse(self.manager.snapshot['runtime']['pending'])

    async def test_state_end_before_adjacent_start_and_no_synthetic_midnight(self):
        section,settings=self.state_section();section['sub_schedules'][0]['bands'][0]['end_minute']=780
        section['sub_schedules'][0]['bands'].append({'id':base.uid(),'start_minute':780,'end_minute':840})
        await self.save(section,settings);await self.at(12);await self.at(13)
        self.assertEqual([a[1] for a in self.actions],['turn_on','turn_off','turn_on'])
        await self.at(14);self.actions.clear();await self.at(0,day=1);self.assertEqual(self.actions,[])

    async def test_options_change_recovers_pending_valid_new_state(self):
        section,settings=self.state_section('select','Focus','Relax');await self.save(section,settings)
        self.hass.states.async_set('select.fixture','Relax',{'options':['Relax']});await self.hass.async_block_till_done();await self.at(12)
        self.assertEqual(self.actions,[]);self.assertTrue(self.manager.snapshot['runtime']['pending'])
        self.hass.states.async_set('select.fixture','Relax',{'options':['Relax','Focus']});await self.hass.async_block_till_done()
        self.assertEqual(self.actions[-1],('select','select_option',{'entity_id':'select.fixture','option':'Focus'}))

    async def test_alarm_choices_do_not_invent_missing_codes(self):
        self.hass.states.async_set('alarm_control_panel.fixture','disarmed',{'supported_features':2,'code_arm_required':True,'code_format':'number'})
        self.assertFalse(self.manager.capabilities()['alarm_control_panel.fixture']['supported'])
        self.hass.states.async_set('alarm_control_panel.fixture','disarmed',{'supported_features':2,'code_arm_required':False,'code_format':'number'})
        cap=self.manager.capabilities()['alarm_control_panel.fixture'];self.assertEqual(cap['options'],['armed_away'])
        with self.assertRaises(Invalid):state_value('disarmed',cap)

    async def test_group_and_timer_actions_and_readonly_group_filter(self):
        self.hass.states.async_set('group.fixture','off',{'entity_id':['light.fixture','switch.fixture']})
        group,settings=self.state_section('group');await self.save(group,settings)
        timer,extra=self.state_section('timer','active','idle');await self.save(timer,extra)
        await self.at(12);await self.at(16)
        self.assertEqual(self.actions,[('homeassistant','turn_on',{'entity_id':'group.fixture'}),('timer','start',{'entity_id':'timer.fixture'}),('homeassistant','turn_off',{'entity_id':'group.fixture'}),('timer','cancel',{'entity_id':'timer.fixture'})])
        self.hass.states.async_set('group.readonly','off',{'entity_id':['sensor.readonly']})
        self.assertFalse(self.manager.capabilities()['group.readonly']['supported'])

    async def test_away_does_not_cancel_unaffected_failed_work(self):
        section,settings=self.state_section();section['away_enabled']=False
        await self.save(section,settings);self.fail_state='light.fixture';await self.at(12)
        await self.manager.set_away(True)
        self.assertTrue(self.manager.snapshot['runtime']['pending'])
        self.fail_state=None;self.hass.states.async_set('light.fixture','unavailable');await self.hass.async_block_till_done()
        self.hass.states.async_set('light.fixture','off');await self.hass.async_block_till_done()
        self.assertEqual(self.actions[-1],('light','turn_on',{'entity_id':'light.fixture'}))

    async def test_late_service_registration_recovers_pending_once(self):
        section,settings=self.state_section();await self.save(section,settings)
        self.hass.services.async_remove('light','turn_on')
        await self.at(12);self.assertEqual(self.actions,[])
        async def restored(call):self.actions.append((call.domain,call.service,deepcopy(call.data)))
        self.hass.services.async_register('light','turn_on',restored)
        await self.hass.async_block_till_done()
        self.assertEqual(self.actions,[('light','turn_on',{'entity_id':'light.fixture'})])

    async def test_away_exclusion_cancels_old_override_pending(self):
        section,settings=base.fixture();await self.save(section,settings)
        self.set_state('climate.kitchen','unavailable');await self.hass.async_block_till_done()
        await self.manager.set_away(True);self.assertTrue(self.manager.snapshot['runtime']['pending'])
        section['away_enabled']=False;await self.save(section,settings)
        self.assertFalse(self.manager.snapshot['runtime']['pending'])
        self.set_state('climate.kitchen');await self.hass.async_block_till_done();self.assertEqual(self.calls,[])

    async def test_nonfinite_number_current_does_not_poison_capability_cache(self):
        self.hass.states.async_set('number.fixture','nan',{'min':0,'max':100,'step':.5})
        cap=self.manager.capabilities()['number.fixture'];self.assertIsNone(cap['current']);self.assertTrue(cap['supported'])
        section,settings=self.state_section('number',10,20);await self.save(section,settings);await self.at(12)
        self.assertEqual(self.actions[-1],('number','set_value',{'entity_id':'number.fixture','value':10}))

    async def test_number_unit_change_never_reinterprets_saved_values(self):
        self.hass.states.async_set('number.fixture','21',{'min':-10,'max':50,'step':1,'unit_of_measurement':'°C'})
        section,settings=self.state_section('number',21,10);await self.save(section,settings)
        self.hass.states.async_set('number.fixture','68',{'min':14,'max':122,'step':1,'unit_of_measurement':'°F'})
        await self.at(12);self.assertEqual(self.actions,[]);self.assertTrue(self.manager.snapshot['runtime']['errors'])
        with self.assertRaises(Invalid):await self.save(section,settings)
        section['entities'][0].update(start_state=70,end_state=50,start_unit='°F',end_unit='°F')
        await self.save(section,settings);await self.at(16)
        self.assertEqual(self.actions[-1],('number','set_value',{'entity_id':'number.fixture','value':50}))

    async def test_mixed_away_suppression_keeps_climate_pending_recovery(self):
        section,settings=base.fixture();light,extra=self.state_section();section['entities']+=light['entities'];settings.update(extra)
        await self.save(section,settings);self.set_state('climate.kitchen','unavailable');await self.hass.async_block_till_done()
        await self.manager.set_away(True);await self.at(12)
        self.assertTrue(self.manager.snapshot['runtime']['pending']);self.assertEqual(self.actions,[])
        self.set_state('climate.kitchen');await self.hass.async_block_till_done()
        self.assertEqual(self.calls[-1],{'entity_id':'climate.kitchen','temperature':13})

    async def test_late_disable_and_away_preserve_nonclimate_current_state(self):
        section,settings=self.state_section();await self.save(section,settings)
        self.clock=base.NOW.replace(hour=13);await self.toggle(section,False)
        self.assertEqual(self.actions,[])
        await self.toggle(section,True);self.assertEqual([a[1] for a in self.actions],['turn_on'])
        await self.manager.stop();self.manager.store.data['model']['away']=False
        # Recreate a cursor before a missed endpoint; explicit Away suspension
        # must not physically replay that non-climate endpoint on entry.
        self.store.data['runtime']['cursor']=base.NOW.isoformat()
        self.manager=base.Manager(self.hass);self.manager.store=self.store
        self.manager.snapshot=deepcopy(self.store.data)
        self.actions.clear();await self.manager.set_away(True)
        self.assertEqual(self.actions,[])

    async def test_bad_unmanaged_capabilities_do_not_block_healthy_dispatch(self):
        self.hass.states.async_set('fan.bad','off',{'supported_features':'invalid'})
        self.hass.states.async_set('climate.bad','heat',{'supported_features':1,'min_temp':None,'max_temp':35})
        self.hass.states.async_set('select.bad','off',{'options':None})
        caps=self.manager.capabilities()
        for eid in ('fan.bad','climate.bad','select.bad'):self.assertFalse(caps[eid]['supported'])
        section,settings=self.state_section();await self.save(section,settings);await self.at(12)
        self.assertEqual(self.actions[-1],('light','turn_on',{'entity_id':'light.fixture'}))
