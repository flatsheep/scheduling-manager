import {describe,it,expect} from 'vitest';
import {predictedMinute,resolvedBand,solarDate,validDynamic} from '../src/dynamic';
import {bandError,clampEndpoint} from '../src/draft';
const band={id:'band',start_minute:720,end_minute:960};
describe('dynamic endpoints',()=>{
  it('limits fixed dragging to resolved solar neighbours, snapping inward',()=>{
    const fixed={id:'fixed',start_minute:360,end_minute:420};
    const next={id:'next',start_minute:1200,end_minute:1260,start_dynamic:{event:'sunrise',offset:1}};
    expect(clampEndpoint({id:'sub',days:[0],bands:[fixed,next]},fixed,'end_minute',1000,{sunrise:480})).toBe(480);
    const previous={id:'previous',start_minute:1200,end_minute:1260,start_dynamic:{event:'sunrise',offset:0},end_dynamic:{event:'noon',offset:1}};
    expect(clampEndpoint({id:'sub',days:[0],bands:[fixed,previous]},fixed,'start_minute',0,{sunrise:120,noon:300})).toBe(305);
  });
  it('predicts event plus offset independently of paired-endpoint and day clamping',()=>{
    expect(predictedMinute({event:'sunset',offset:15},{sunset:1260})).toBe(1275);
    expect(predictedMinute({event:'sunset',offset:300},{sunset:1260})).toBe(1560);
    expect(predictedMinute({event:'midnight',offset:-300},{midnight:60})).toBe(-240);
    expect(predictedMinute({event:'sunrise',offset:0},{sunrise:null})).toBeUndefined();
    expect(predictedMinute({event:'sunrise',offset:301},{sunrise:300})).toBeUndefined();
  });
  it('resolves unrounded solar minutes and signed offsets',()=>{
    expect(resolvedBand({...band,start_dynamic:{event:'sunrise',offset:-17},end_dynamic:{event:'sunset',offset:30}},{sunrise:301,sunset:1263})).toEqual([284,1293]);
  });
  it('clamps crossing endpoints without swapping and clips to the local day',()=>{
    expect(resolvedBand({...band,start_dynamic:{event:'sunset',offset:300}},{sunset:1200})).toEqual([1440,1440]);
    expect(resolvedBand({...band,end_dynamic:{event:'sunrise',offset:-300}},{sunrise:360})).toEqual([720,720]);
    expect(resolvedBand({...band,start_dynamic:{event:'sunset',offset:0},end_dynamic:{event:'sunrise',offset:0}},{sunrise:360,sunset:1200})).toEqual([1200,1200]);
    expect(resolvedBand({...band,start_dynamic:{event:'sunrise',offset:-300},end_dynamic:{event:'sunset',offset:300}},{sunrise:100,sunset:1400})).toEqual([0,1440]);
  });
  it('keeps missing solar events unresolved without using nominal times',()=>{
    expect(resolvedBand({...band,start_dynamic:{event:'sunrise',offset:0}},{sunrise:null})).toBeUndefined();
    expect(resolvedBand({...band,start_dynamic:{event:'sunrise',offset:0}})).toBeUndefined();
  });
  it('accepts dynamic collapsed bands and rejects invalid definitions',()=>{
    const collapsed={...band,start_minute:960,start_dynamic:{event:'sunrise',offset:0}};
    expect(bandError({id:'sub',days:[0],bands:[collapsed]},960,960,collapsed.id,collapsed)).toBe('');
    for(const value of [{event:'unknown',offset:0},{event:'sunrise',offset:301},{event:'sunrise',offset:.5}])expect(validDynamic(value)).toBe(false);
  });
  it('uses HA calendar dates and the next requested weekday across month boundaries',()=>{
    const now=new Date('2026-07-31T23:30:00Z');
    expect(solarDate('Europe/London',undefined,now)).toBe('2026-08-01');
    expect(solarDate('Europe/London',0,now)).toBe('2026-08-03');
    expect(solarDate('America/New_York',undefined,now)).toBe('2026-07-31');
  });
});
