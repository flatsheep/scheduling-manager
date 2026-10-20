import {describe,it,expect} from 'vitest';
import {begin,bandError,clampEndpoint,localClock,parseTime,snap,draftError} from '../src/draft';
import type {Model,Section,Capability} from '../src/types';
const cap:Capability={entity_id:'climate.kitchen',name:'Kitchen',unit:'°C',min:7,max:35,step:.5,supported:true,available:true};
function model():Model {
  return {revision:3,away:false,entity_settings:{k:{entity_id:cap.entity_id,setback:{value:13,unit:'°C'}}},schedules:[{id:'s',name:'Kitchen',entities:[{entity_key:'k',target:{value:21,unit:'°C'}}],sub_schedules:[{id:'sub',days:[0,2,4],bands:[{id:'b',start_minute:720,end_minute:960}]}]}]};
}
describe('draft isolation and meaningful timeline constraints',()=>{
  it('all edits/deletions and shared settings stay isolated until commit',()=>{
    const saved=model();const draft=begin(saved,saved.schedules[0]);
    draft.section.name='Changed';draft.settings.k.setback.value=15;draft.section.entities=[];draft.section.sub_schedules[0].days=[];draft.section.sub_schedules[0].bands=[];draft.deleted=true;
    expect(saved).toEqual(model());expect(begin(saved,saved.schedules[0]).selected).toBe(0);
  });
  it('new section makes no silent day, membership or band choices',()=>{
    const draft=begin(model(),undefined,'New');expect(draft.section.entities).toEqual([]);expect(draft.section.sub_schedules[0].days).toEqual([]);expect(draftError(draft,[cap])).toContain('entity');
  });
  it('rejects empty retained sub-schedules and duplicate weekdays',()=>{
    const saved=model();const draft=begin(saved,saved.schedules[0]);
    draft.section.sub_schedules.push({id:'x',days:[],bands:[]});expect(draftError(draft,[cap])).toContain('day');
    draft.section.sub_schedules[1].days=[0];expect(draftError(draft,[cap])).toContain('weekday');
  });
  it('one-hour proposal only fits complete blank gaps, adjacent is valid',()=>{
    const sub=model().schedules[0].sub_schedules[0];expect(bandError(sub,660,720)).toBe('');expect(bandError(sub,690,750)).toContain('overlap');expect(bandError(sub,960,960)).toContain('start before end');
    expect(snap(722.5)).toBe(725);expect(parseTime('23:59')).toBe(1440);expect(parseTime('24:05')).toBeNaN();
  });
  it('drag clamps paired endpoint and neighbouring bands at five minutes',()=>{
    const sub=model().schedules[0].sub_schedules[0];const band=sub.bands[0];sub.bands.push({id:'next',start_minute:1000,end_minute:1100});
    expect(clampEndpoint(sub,band,'end_minute',1200)).toBe(1000);expect(clampEndpoint(sub,band,'start_minute',959)).toBe(955);expect(clampEndpoint(sub,band,'end_minute',721)).toBe(725);
  });
  it('tenth succeeds and eleventh is rejected per sub-schedule',()=>{
    const sub=model().schedules[0].sub_schedules[0];sub.bands=Array.from({length:9},(_,i)=>({id:String(i),start_minute:i*60,end_minute:i*60+30}));expect(bandError(sub,600,660)).toBe('');sub.bands.push({id:'10',start_minute:600,end_minute:660});expect(bandError(sub,700,760)).toContain('ten');
  });
  it('clock follows HA zone across browser timezone and midnight',()=>{
    expect(localClock('Europe/London',new Date('2026-07-06T23:30:00Z'))).toEqual({weekday:'Tuesday',day:1,minute:30});expect(localClock('Asia/Kolkata',new Date('2026-07-06T10:00:00Z')).minute).toBe(930);
  });
});
