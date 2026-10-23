import {expect,it} from 'vitest';
import {begin,clampEndpoint,draftError} from '../src/draft';
import type {Band,Model} from '../src/types';
import {resolvedBand} from '../src/dynamic';

it('selected occurrence allows clamped time edits and retains frozen solar previews until edited',()=>{
  const band:Band={id:'once',start_minute:720,end_minute:960,one_off:true,one_off_run:{day:'2026-07-06',start:'2026-07-06T12:00Z',end:'2026-07-06T16:00Z',entities:[],settings:{}}};
  const sub={id:'sub',days:[0,2,4],bands:[band]};
  expect(clampEndpoint(sub,band,'start_minute',800)).toBe(800);
  expect(clampEndpoint(sub,band,'end_minute',1000)).toBe(1000);
  band.start_dynamic={event:'noon',offset:0};
  band.one_off_run!.minutes=[720,960];
  expect(resolvedBand(band,{noon:900})).toEqual([720,960]);
  expect(resolvedBand(band,{noon:null})).toEqual([720,960]);
  delete band.one_off_run;
  expect(clampEndpoint(sub,band,'start_minute',800)).toBe(800);
});

it('empty retained sub-schedules remain editable and one-off journals are draft-isolated',()=>{
  const model:Model={revision:3,away:false,entity_settings:{key:{entity_id:'switch.test'}},schedules:[{id:'section',name:'Temporary',entities:[{entity_key:'key',start_state:'on',end_state:'off'}],sub_schedules:[{id:'sub',days:[0],bands:[]}]}]};
  const draft=begin(model,model.schedules[0]);
  expect(draftError(draft,[{entity_id:'switch.test',name:'Test',supported:true,available:true,kind:'state',options:['on','off']}])).toBe('');
  draft.section.sub_schedules[0].bands.push({id:'new',one_off:true,start_minute:720,end_minute:960});
  expect(model.schedules[0].sub_schedules[0].bands).toEqual([]);
});
