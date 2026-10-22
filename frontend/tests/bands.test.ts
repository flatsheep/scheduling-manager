import {describe,expect,it} from 'vitest';
import {bandDisabled} from '../src/bands';
import type {Band} from '../src/types';

const band:Band={id:'band',start_minute:720,end_minute:960};
describe('band suspension state',()=>{
  it('keeps legacy bands enabled and permanent suspensions disabled',()=>{
    expect(bandDisabled(band)).toBe(false);
    expect(bandDisabled({...band,enabled:true})).toBe(false);
    expect(bandDisabled({...band,enabled:false})).toBe(true);
  });
  it('expires exactly at the saved UTC deadline',()=>{
    const timed={...band,enabled:false,disabled_until:'2026-07-06T13:00:00+00:00'};
    expect(bandDisabled(timed,Date.parse('2026-07-06T12:59:59Z'))).toBe(true);
    expect(bandDisabled(timed,Date.parse('2026-07-06T13:00:00Z'))).toBe(false);
    expect(bandDisabled(timed,Date.parse('2026-07-06T14:00:00Z'))).toBe(false);
  });
  it('keeps HA-local draft deadlines suspended pending authoritative save',()=>{
    expect(bandDisabled({...band,enabled:false,disabled_until:'2026-07-06T14:00'})).toBe(true);
  });
});
