import type {Band, Capability, Draft, EntityState, Model, Section, SolarMinutes, Sub} from './types';
import {resolvedBand,validDynamic} from './dynamic';
export function uuid():string {
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  // getRandomValues is available on HTTP origins where randomUUID is restricted.
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const clone = <T>(value: T): T => structuredClone(value);
export const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const snap = (minute: number) => Math.floor(minute / 5 + .5) * 5; // ties later
export const time = (minute: number) => minute === 1440 ? '23:59' : `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
export function parseTime(value: string): number {
  if (value === '23:59') return 1440;
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour <= 23 && minute < 60 ? hour * 60 + minute : NaN;
}
export function newSub(): Sub { return {id: uuid(), days: [], bands: []}; }
export function begin(model: Model, section?: Section, name = ''): Draft {
  return {section: section ? clone(section) : {id: uuid(), name, enabled: true, away_enabled: true, entities: [], sub_schedules: [newSub()]},
    settings: clone(model.entity_settings), revision: model.revision, selected: 0, deleted: false, isNew: !section};
}
export function bandError(sub: Sub, start: number, end: number, except?: string, definition?:Band): string {
  const dynamic=!!(definition?.start_dynamic||definition?.end_dynamic);
  if(!validDynamic(definition?.start_dynamic)||!validDynamic(definition?.end_dynamic))return 'Choose a solar event and an offset from -300 to 300 minutes.';
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start>1440 || end<0 || end > 1440 || (!dynamic&&start >= end) || start % 5 || end % 5) return 'Use five-minute times, with start before end. 23:59 means midnight.';
  if (!except && sub.bands.length >= 10) return 'Maximum ten time bands per sub-schedule.';
  if (!dynamic&&sub.bands.some(b => b.id !== except && !b.start_dynamic&&!b.end_dynamic&&start < b.end_minute && end > b.start_minute)) return 'Time bands cannot overlap.';
  return '';
}
export function clampEndpoint(sub: Sub, band: Band, endpoint: 'start_minute' | 'end_minute', minute: number, solar?:SolarMinutes): number {
  // Keep ordinary fixed-band constraints independent of solar placeholders.
  const fixed=sub.bands.filter(b=>!b.start_dynamic&&!b.end_dynamic).sort((a,b)=>a.start_minute-b.start_minute),index=fixed.findIndex(b=>b.id===band.id);
  const own=resolvedBand(band,solar);
  let low=endpoint==='start_minute'?(index<0?0:(fixed[index-1]?.end_minute??0)):(band.start_dynamic?Math.ceil((own?.[0]??0)/5)*5:band.start_minute+5);
  let high=endpoint==='end_minute'?(index<0?1440:(fixed[index+1]?.start_minute??1440)):(band.end_dynamic?Math.floor((own?.[1]??1440)/5)*5:band.end_minute-5);
  // Solar bands are barriers at their resolved boundaries, not ordering entries.
  for(const other of sub.bands)if(other!==band&&(other.start_dynamic||other.end_dynamic)){const resolved=resolvedBand(other,solar);if(resolved){if(resolved[1]<=band.start_minute)low=Math.max(low,Math.ceil(resolved[1]/5)*5);if(resolved[0]>=band.end_minute)high=Math.min(high,Math.floor(resolved[0]/5)*5);}}
  if(low>high)return band[endpoint];
  return Math.max(low, Math.min(high, snap(minute)));
}
export function validTemperature(value: number, cap: Capability): boolean {
  if(cap.min===undefined||cap.max===undefined||cap.step===undefined||cap.step<=0)return false;
  const grid = (value - cap.min) / cap.step;
  return Number.isFinite(value) && value >= cap.min && value <= cap.max && Math.abs(grid - Math.round(grid)) < 1e-7;
}
export function validState(value:EntityState|undefined,cap:Capability):boolean {
  if(cap.kind==='number')return typeof value==='number'&&validTemperature(value,cap);
  if(typeof value!=='string')return false;
  if(cap.kind==='text'){
    try{return value.length>=(cap.min_length??0)&&value.length<=(cap.max_length??255)&&(!cap.pattern||new RegExp(`^(?:${cap.pattern})$`).test(value));}catch{return false;}
  }
  if(['date','time','datetime'].includes(cap.kind??''))return value.length>0;
  return (cap.options??[]).includes(value);
}
export function draftError(draft: Draft, caps: Capability[]): string {
  if (draft.deleted) return '';
  const section = draft.section;
  if (!section.name.trim()) return 'Enter a section name.';
  if (!section.entities.length) return 'Add at least one writable entity.';
  const seen = new Set<number>();
  for (const sub of section.sub_schedules) {
    if (!sub.days.length) return 'Select at least one day in every sub-schedule.';
    if (sub.days.some(d => seen.has(d))) return 'A weekday can belong to only one sub-schedule.';
    sub.days.forEach(d => seen.add(d));
    if (!sub.bands.length) return 'Add at least one time band in every sub-schedule.';
    for (const b of sub.bands) { const error = bandError(sub, b.start_minute, b.end_minute, b.id,b); if (error) return error; }
  }
  for (const member of section.entities) {
    const setting = draft.settings[member.entity_key];
    const cap = caps.find(c => c.entity_id === setting.entity_id);
    if (!cap?.supported) return `Unsupported device: ${setting.entity_id}`;
    if(!setting.entity_id.startsWith('climate.')){
      if(!validState(member.start_state,cap)||!validState(member.end_state,cap))return `Choose valid start and end states for ${cap.name}.`;
      if(cap.kind==='number'&&[member.start_unit,member.end_unit].some(unit=>unit!==undefined&&unit!==(cap.unit??'')))return `Unit changed; choose both values again for ${cap.name}.`;
      continue;
    }
    for (const value of [setting.setback, member.target]) {
      if(!value)return `Choose temperatures for ${cap.name}.`;
      // Unit conversions are validated authoritatively by HA; untouched values
      // remain explicitly labelled in their stored unit in the card.
      if (value.unit === cap.unit && !validTemperature(value.value, cap)) return `Correct temperature for ${cap.name}.`;
    }
  }
  return '';
}
export function localClock(zone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: zone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const weekday = part('weekday');
  return {weekday, day: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].indexOf(weekday), minute: Number(part('hour')) * 60 + Number(part('minute'))};
}
