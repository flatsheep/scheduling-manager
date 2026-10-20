import {describe,it,expect} from 'vitest';
import {allFilters,categories,categoryGroups,categoryOptions,filterOptions,normalizeFilter,normalizeFilters,visibleSchedules} from '../src/categories';
import type {EntityLocation,Section} from '../src/types';
const section=(id:string,name:string,category?:string|null):Section=>({id,name,category,entities:[{entity_key:id}],sub_schedules:[]});
const locations:Record<string,EntityLocation>={
  a:{area_id:'kitchen',area_name:'Kitchen',floor_id:'ground',floor_name:'Ground floor'},
  b:{area_id:'bedroom',area_name:'Bedroom',floor_id:'upper',floor_name:'Upper floor'},
  c:{area_id:null,area_name:null,floor_id:null,floor_name:null},
};
describe('schedule filtering and grouping',()=>{
  it('derives only assigned categories and drops the last unused name',()=>{
    const sections=[section('a','First',' Upstairs '),section('b','Second','Upstairs'),section('c','Third',null)];
    expect(categories(sections)).toEqual(['Upstairs']);sections[0].category=null;sections[1].category=null;expect(categories(sections)).toEqual([]);
  });
  it('groups filtered schedules in first-seen category order and keeps stored order inside each group',()=>{
    const sections=[section('a','Zulu','Heating'),section('b','Alpha','Lighting'),section('c','Beta','Heating')];
    const groups=categoryGroups(sections,{a:true,b:false,c:true});
    expect(groups.map(group=>[group.name,group.sections.map(s=>s.id),group.active])).toEqual([['Heating',['a','c'],2],['Lighting',['b'],0]]);
    expect(visibleSchedules(sections,{...allFilters(),categories:['category:Heating']}).map(s=>s.id)).toEqual(['a','c']);
    expect(sections.map(s=>s.id)).toEqual(['a','b','c']);
  });
  it('matches any linked entity but requires Area and Floor to match the same entity',()=>{
    const sections=[section('a','A','Heating'),section('b','B','Lighting'),section('c','C')];
    const mixed={...section('mixed','Mixed','Heating'),entities:[{entity_key:'a'},{entity_key:'b'}]};
    expect(visibleSchedules([...sections,mixed],{...allFilters(),areas:['area:kitchen']},locations).map(s=>s.id)).toEqual(['a','mixed']);
    expect(visibleSchedules([mixed],{...allFilters(),areas:['area:kitchen'],floors:['floor:upper']},locations)).toEqual([]);
    expect(visibleSchedules(sections,{...allFilters(),floors:['none']},locations).map(s=>s.id)).toEqual(['c']);
  });
  it('combines category, location and authoritative running status',()=>{
    const sections=[section('a','A','Heating'),section('b','B','Lighting'),section('c','C')],active={a:true,b:false,c:false};
    expect(visibleSchedules(sections,{...allFilters(),activity:['active']},locations,active).map(s=>s.id)).toEqual(['a']);
    expect(visibleSchedules(sections,{...allFilters(),categories:['category:Heating'],activity:['inactive']},locations,active)).toEqual([]);
    expect(categoryGroups(visibleSchedules(sections,{...allFilters(),activity:['active']},locations,active),active).map(g=>g.name)).toEqual(['Heating']);
  });
  it('retains the open editor when filters exclude it and hides empty categories',()=>{
    const sections=[section('a','A','Heating'),section('b','B','Lighting')];
    expect(visibleSchedules(sections,{...allFilters(),categories:[]},locations,{},'b').map(s=>s.id)).toEqual(['b']);
    expect(categoryGroups(visibleSchedules(sections,{...allFilters(),categories:[]}))).toEqual([]);
  });
  it('derives stable ID-based options and normalizes all/none/orphan selections independently',()=>{
    const sections=[section('a','A','Heating'),section('b','B','Lighting'),section('c','C',null)],options=filterOptions(sections,locations);
    expect(categoryOptions(sections)).toEqual(['none','category:Heating','category:Lighting']);
    expect(options.areas.map(option=>option.label)).toEqual(['No Area','Bedroom','Kitchen']);
    expect(options.floors.map(option=>option.value)).toEqual(['none','floor:ground','floor:upper']);
    expect(normalizeFilter([],['active','inactive'])).toEqual([]);
    expect(normalizeFilters({...allFilters(),areas:['area:deleted'],activity:['active']},options)).toEqual({...allFilters(),activity:['active']});
    expect(normalizeFilters({...allFilters(),categories:categoryOptions(sections),activity:['active','inactive']},options)).toEqual(allFilters());
  });
});
