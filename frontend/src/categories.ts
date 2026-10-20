import type {EntityLocation,Section} from './types';

export type Selection = string[]|null;
export interface ScheduleFilters {categories:Selection;areas:Selection;floors:Selection;activity:Selection}
export interface FilterOption {value:string;label:string}
export type FilterOptions = Record<keyof ScheduleFilters,FilterOption[]>;
export interface CategoryGroup {key:string;name:string;sections:Section[];active:number}
export const allFilters=():ScheduleFilters=>({categories:null,areas:null,floors:null,activity:null});
export const categoryKey=(section:Section)=>section.category?.trim()?`category:${section.category.trim()}`:'none';

export function categories(sections:Section[]):string[] {
  return [...new Set(sections.map(section=>section.category?.trim()).filter((name):name is string=>!!name))].sort((a,b)=>a.localeCompare(b));
}
export function categoryOptions(sections:Section[]):string[] {
  return [...(sections.some(section=>categoryKey(section)==='none')?['none']:[]),...categories(sections).map(name=>`category:${name}`)];
}
export function normalizeFilter(selection:Selection,options:string[]):Selection {
  if(selection===null)return null;
  const retained=[...new Set(selection)].filter(value=>options.includes(value));
  return retained.length===options.length||selection.length>0&&retained.length===0?null:retained;
}
export function filterOptions(sections:Section[],locations:Record<string,EntityLocation>={}):FilterOptions {
  const locationOptions=(dimension:'area'|'floor'):FilterOption[]=>{
    const found=new Map<string,string>();
    for(const section of sections)for(const member of section.entities){
      const location=locations[member.entity_key],id=location?.[`${dimension}_id`];
      const value=id?`${dimension}:${id}`:'none';
      found.set(value,id?(location[`${dimension}_name`]??id):dimension==='area'?'No Area':'No Floor');
    }
    return [...found].map(([value,label])=>({value,label})).sort((a,b)=>a.value==='none'?-1:b.value==='none'?1:a.label.localeCompare(b.label));
  };
  return {categories:categoryOptions(sections).map(value=>({value,label:value==='none'?'Unassigned':value.slice(9)})),
    areas:locationOptions('area'),floors:locationOptions('floor'),
    activity:[{value:'active',label:'Active now'},{value:'inactive',label:'Inactive now'}]};
}
export function normalizeFilters(filters:ScheduleFilters,options:FilterOptions):ScheduleFilters {
  return Object.fromEntries(Object.entries(options).map(([key,values])=>[key,normalizeFilter(filters[key as keyof ScheduleFilters],values.map(value=>value.value))])) as unknown as ScheduleFilters;
}
export function isFiltered(filters:ScheduleFilters):boolean {return Object.values(filters).some(value=>value!==null);}
export function visibleSchedules(sections:Section[],filters:ScheduleFilters,locations:Record<string,EntityLocation>={},active:Record<string,boolean>={},editingId?:string):Section[] {
  const includes=(selection:Selection,value:string)=>selection===null||selection.includes(value);
  return sections.filter(section=>section.id===editingId||includes(filters.categories,categoryKey(section))&&
    includes(filters.activity,active[section.id]?'active':'inactive')&&
    (filters.areas===null&&filters.floors===null||section.entities.some(member=>{
      const location=locations[member.entity_key];
      return includes(filters.areas,location?.area_id?`area:${location.area_id}`:'none')&&
        includes(filters.floors,location?.floor_id?`floor:${location.floor_id}`:'none');
    })));
}
export function categoryGroups(sections:Section[],active:Record<string,boolean>={}):CategoryGroup[] {
  const groups=new Map<string,CategoryGroup>();
  for(const section of sections){
    const key=categoryKey(section);
    if(!groups.has(key))groups.set(key,{key,name:section.category?.trim()||'Unassigned',sections:[],active:0});
    const group=groups.get(key)!;group.sections.push(section);if(active[section.id])group.active++;
  }
  return [...groups.values()];
}
