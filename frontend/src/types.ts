export interface Temperature { value: number; unit: string }
export type EntityState = string | number;
export interface Setting {entity_id: string; registry_id?: string | null; setback?: Temperature}
export interface Membership {entity_key: string; target?: Temperature; start_state?: EntityState; end_state?: EntityState; start_unit?: string; end_unit?: string}
export interface DynamicTime {event: string; offset: number}
export type SolarMinutes = Record<string, number|null>;
export interface Band {id: string; start_minute: number; end_minute: number; start_dynamic?:DynamicTime;end_dynamic?:DynamicTime}
export interface Sub {id: string; name?: string; days: number[]; bands: Band[]}
export interface Section {id: string; name: string; category?: string|null; enabled?: boolean; away_enabled?: boolean; entities: Membership[]; sub_schedules: Sub[]}
export interface Model {revision: number; away: boolean; away_until?:string; entity_settings: Record<string, Setting>; schedules: Section[]}
export interface EntityLocation {area_id:string|null;area_name:string|null;floor_id:string|null;floor_name:string|null}
export interface Saved {model: Model; timezone: string; solar_times?:Record<string,SolarMinutes>; active_schedules?:Record<string,boolean>;locations?:Record<string,EntityLocation>; applying?:boolean; editable: boolean; status: Record<string, {entity_id: string; message: string}>; storage_error?: string}
export interface Capability {entity_id: string; registry_id?: string | null; name: string; kind?: string; unit?: string; min?: number; max?: number; step?: number; current?: EntityState; options?: string[]; min_length?: number; max_length?: number; pattern?: string; supported: boolean; available: boolean; reason?: string}
export interface Hass {
  states: Record<string, {state?:string;attributes: Record<string, any>}>;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
  connection: {subscribeMessage<T>(callback: (data: T) => void, message: Record<string, unknown>): Promise<() => void>};
}
export interface Draft {section: Section; settings: Record<string, Setting>; revision: number; selected: number; deleted: boolean; isNew: boolean}
