import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.clock.install({time:new Date('2026-07-06T10:00:00Z')});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Scheduling Manager',exact:true})).toBeVisible();
});

test('preview bands follow their own parent gate rather than the current group',async({page})=>{
  await page.evaluate(()=>{
    const m=(window as any).mock,s=m.saved.model.schedules[0];
    s.sub_schedules[0].days=[0];s.sub_schedules[0].enabled=false;
    s.sub_schedules.push({id:crypto.randomUUID(),days:[1],enabled:false,bands:[
      {id:crypto.randomUUID(),start_minute:480,end_minute:600},
      {id:crypto.randomUUID(),start_minute:660,end_minute:720,one_off:true}
    ]});
    m.notify();
  });
  const row=page.locator('section[aria-label="Schedule 1"]'),timeline=row.locator('hsm-timeline');
  await row.getByRole('button',{name:'Preview TUE sub-schedule, disabled',exact:true}).click();
  await expect(timeline.locator('.ghost-preview .disabled-preview')).toHaveCount(2);
  await expect(timeline.locator('.ghost-connector').first()).toHaveCSS('stroke','rgb(85, 85, 85)');
  await expect(timeline.locator('.ghost-marker').first()).toHaveCSS('stroke','rgb(85, 85, 85)');
  await expect(timeline.locator('.one-off-preview .ghost-marker').first()).toHaveCSS('fill','rgb(85, 85, 85)');
  await page.evaluate(()=>{const m=(window as any).mock;delete m.saved.model.schedules[0].sub_schedules[1].enabled;m.notify();});
  await expect(timeline.locator('.ghost-preview .disabled-preview')).toHaveCount(0);
  await expect(timeline.locator('.ghost-marker.start').first()).toHaveCSS('stroke','rgb(255, 134, 31)');
  await expect(timeline.locator('.ghost-marker.end').first()).toHaveCSS('stroke','rgb(0, 158, 220)');
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('disabled groups grey one-off and unavailable solar bands without changing their preferences',async({page})=>{
  await page.evaluate(()=>{
    const m=(window as any).mock,sub=m.saved.model.schedules[0].sub_schedules[0];
    sub.enabled=false;sub.bands[0].one_off=true;
    sub.bands[1].start_dynamic={event:'sunrise',offset:0};
    m.saved.solar_times['2026-07-06'].sunrise=null;
    m.notify();
  });
  const row=page.locator('section[aria-label="Schedule 1"]'),timeline=row.locator('hsm-timeline');
  await expect(timeline.locator('.marker.one-off.disabled')).toHaveCount(2);
  await expect(timeline.locator('.marker.one-off path').first()).toHaveCSS('fill','rgb(85, 85, 85)');
  await expect(timeline.locator('.marker.one-off path').first()).toHaveCSS('stroke','rgb(229, 57, 53)');
  const badge=await timeline.locator('.one-off-badge').boundingBox();
  const disabledLabel=await timeline.locator('.disabled-band .disabled-label').boundingBox();
  expect(disabledLabel!.y).toBeGreaterThan(badge!.y+badge!.height);
  await expect(timeline.locator('.unavailable-band')).toHaveText('Disabled · Solar event unavailable *');
  await expect(timeline.locator('.unavailable-band')).toHaveCSS('fill','rgb(85, 85, 85)');
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  await page.getByRole('button',{name:'Enable sub-schedule',exact:true}).click();
  await expect(timeline.locator('.marker.disabled')).toHaveCount(0);
  await expect(timeline.locator('.unavailable-band')).toHaveText('Solar event unavailable *');
  expect(await timeline.evaluate((el:any)=>el.sub.bands.every((band:any)=>band.enabled===undefined&&band.disabled_until===undefined))).toBe(true);
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});
