import type {Band,DynamicTime,SolarMinutes} from './types';
export const solarEvents=[['sunrise','Sunrise'],['sunset','Sunset'],['dawn','Dawn'],['dusk','Dusk'],['noon','Solar noon'],['midnight','Solar midnight']] as const;
export function validDynamic(value:DynamicTime|undefined):boolean {
  return !value||solarEvents.some(([event])=>event===value.event)&&Number.isInteger(value.offset)&&Math.abs(value.offset)<=300;
}
export function predictedMinute(dynamic:DynamicTime|undefined,solar:SolarMinutes={}):number|undefined {
  if(!dynamic||!validDynamic(dynamic))return;
  const minute=solar[dynamic.event];return minute===undefined||minute===null?undefined:minute+dynamic.offset;
}
export function resolvedBand(band:Band,solar:SolarMinutes={}):[number,number]|undefined {
  if(band.one_off_run?.minutes)return [...band.one_off_run.minutes];
  const values=(['start','end'] as const).map(endpoint=>{
    const dynamic=band[`${endpoint}_dynamic`];if(!dynamic)return band[`${endpoint}_minute`];
    const minute=predictedMinute(dynamic,solar);return minute===undefined?undefined:Math.max(0,Math.min(1440,minute));
  });
  let [start,end]=values;if(start===undefined||end===undefined)return;
  if(start>end)end=start;
  return [start,end];
}
export function solarDate(zone:string,weekday?:number,date=new Date()):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  const local=new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  if(weekday!==undefined)local.setUTCDate(local.getUTCDate()+(weekday-(local.getUTCDay()+6)%7+7)%7);
  return local.toISOString().slice(0,10);
}
