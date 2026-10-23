import {test,expect,type Page} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.clock.install({time:new Date('2026-07-06T10:00:00Z')});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Heating Schedule',exact:true})).toBeVisible();
});

async function openBand(page:Page,index=0){
  await page.locator('.editing hsm-timeline').evaluate((el:any,i)=>el.dispatchEvent(new CustomEvent('band-edit',{detail:el.sub.bands[i],bubbles:true,composed:true})),index);
}

test('one-off creation defaults unchecked and Apply remains draft-only',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  await page.getByRole('button',{name:'＋ Add time band',exact:true}).click();
  const checkbox=page.getByRole('checkbox',{name:'One-off',exact:true});
  await expect(checkbox).not.toBeChecked();
  await expect(page.locator('#one-off-help')).toHaveText('Will be removed once complete');
  await checkbox.check();
  await expect(page.getByRole('combobox',{name:'Band status',exact:true})).toHaveCount(0);
  await page.getByRole('combobox',{name:'Start hour',exact:true}).selectOption('17');
  await page.getByRole('combobox',{name:'Stop hour',exact:true}).selectOption('18');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await expect(page.locator('.editing .one-off-badge')).toBeVisible();
  await expect(page.locator('.editing .one-off-badge ha-icon')).toHaveAttribute('icon','mdi:calendar-clock');
  await expect(page.locator('.editing .one-off-badge circle')).toHaveCSS('stroke','rgb(229, 57, 53)');
  await expect(page.locator('.editing .one-off-outline')).toHaveCount(0);
  await expect(page.locator('.editing .marker.one-off path').first()).toHaveCSS('stroke','rgb(229, 57, 53)');
  await expect(page.locator('.editing .one-off-label')).toHaveCount(0);
  await expect(page.locator('section.editing > .one-off-details')).toHaveCount(0);
  await openBand(page,2);
  await expect(checkbox).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:'Band status',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).mock.saved.model.schedules[0].sub_schedules[0].bands[2].one_off)).toBe(true);
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  await openBand(page);
  await expect(checkbox).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:'Band status',exact:true})).toBeVisible();
});

test('selected one-off allows time edits and deletion without raw action details',async({page})=>{
  await page.evaluate(()=>{
    const mock=(window as any).mock,s=mock.saved.model.schedules[0],b=s.sub_schedules[0].bands[0];
    b.one_off=true;b.one_off_run={start:'2026-07-06T01:00:00Z',end:'2026-07-06T04:20:00Z',day:'2026-07-06',start_recorded:true,end_recorded:true,entities:structuredClone(s.entities),settings:structuredClone(mock.saved.model.entity_settings)};
    mock.notify();
  });
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  const marker=page.locator('.editing hsm-timeline .marker').first();
  await marker.focus();await page.keyboard.press('ArrowRight');
  expect(await page.locator('.editing hsm-timeline').evaluate((el:any)=>el.sub.bands[0].start_minute)).toBe(125);
  await openBand(page);
  await expect(page.getByRole('dialog').locator('.one-off-details')).toHaveText('One-off');
  await expect(page.getByRole('dialog').locator('.one-off-details ha-icon')).toHaveAttribute('icon','mdi:calendar-clock');
  await expect(page.getByRole('dialog')).not.toContainText('Stop pending');
  await expect(page.getByRole('combobox',{name:'Start hour',exact:true})).toBeEnabled();
  await expect(page.getByRole('combobox',{name:'Stop hour',exact:true})).toBeEnabled();
  await expect(page.getByRole('dialog')).not.toContainText('climate.kitchen');
  await page.getByRole('combobox',{name:'Stop hour',exact:true}).selectOption('06');
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  expect(await page.locator('.editing hsm-timeline').evaluate((el:any)=>el.sub.bands[0].end_minute)).toBe(380);
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await openBand(page);
  await page.getByRole('button',{name:'Delete time band',exact:true}).click();
  await page.getByRole('button',{name:'Yes',exact:true}).click();
  await expect(page.locator('.editing .one-off-badge')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await page.getByRole('button',{name:'Save',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).mock.saved.model.schedules[0].sub_schedules[0].bands.some((b:any)=>b.one_off))).toBe(false);
});

test('automatic deletion updates all shared days and cannot resurrect through a draft',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].sub_schedules[0].bands[0].one_off=true;m.notify();});
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].sub_schedules[0].bands.shift();m.saved.model.revision++;m.notify();});
  await expect(page.locator('.editing .one-off-badge')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your unsaved changes are retained');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('section.editing')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).mock.saved.model.schedules[0].sub_schedules[0].bands.some((b:any)=>b.one_off))).toBe(false);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Yes',exact:true}).click();
  await expect(page.locator('.one-off-badge')).toHaveCount(0);
});

test('one-off failed Save retains the draft and Cancel writes no band',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].sub_schedules[0].bands=[];m.notify();});
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  await page.getByRole('button',{name:'＋ Add time band',exact:true}).click();
  await page.getByRole('checkbox',{name:'One-off',exact:true}).check();
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.evaluate(()=>{(window as any).mock.fail=true;});
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('.editing .one-off-badge')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Mock storage failure');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Yes',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).mock.saved.model.schedules[0].sub_schedules[0].bands)).toEqual([]);
});

test('one-off preview uses red outlines without visible one-off text',async({page})=>{
  // HA renders its icon content at a native 24px; an empty unknown custom
  // element would conceal clipping inside the SVG foreignObject.
  await page.evaluate(()=>{
    if(!customElements.get('ha-icon'))customElements.define('ha-icon',class extends HTMLElement {
      constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" fill="currentColor"/></svg>';}
    });
  });
  const timeline=page.locator('section[aria-label="Schedule 1"] hsm-timeline');
  await timeline.evaluate((el:any)=>{
    el.previewSub={id:'preview',days:[1],bands:[{id:'temporary',one_off:true,start_minute:600,end_minute:660}]};
    el.previewDay='TUE';
  });
  await expect(timeline.locator('.one-off-preview .one-off-badge')).toBeVisible();
  await expect(timeline.locator('.one-off-preview .one-off-badge ha-icon')).toHaveAttribute('icon','mdi:calendar-clock');
  const geometry=await timeline.evaluate((el:any)=>{
    const badge=el.shadowRoot.querySelector('.one-off-badge').getBoundingClientRect();
    const markers=[...el.shadowRoot.querySelectorAll('.one-off-preview .ghost-marker')].map((node:any)=>node.getBoundingClientRect());
    return {center:badge.x+badge.width/2,midpoint:(markers[0].x+markers[0].width/2+markers[1].x+markers[1].width/2)/2,bottom:badge.bottom,top:Math.min(...markers.map((r:any)=>r.top))};
  });
  expect(Math.abs(geometry.center-geometry.midpoint)).toBeLessThan(1);
  expect(geometry.bottom).toBeLessThan(geometry.top);
  const fit=await timeline.locator('.one-off-badge').evaluate(badge=>{
    const circle=badge.querySelector('circle')!.getBoundingClientRect();
    const icon=badge.querySelector('ha-icon')!.shadowRoot!.querySelector('svg')!.getBoundingClientRect();
    return {paddingX:(circle.width-icon.width)/2,paddingY:(circle.height-icon.height)/2,
      offsetX:Math.abs(icon.x+icon.width/2-circle.x-circle.width/2),offsetY:Math.abs(icon.y+icon.height/2-circle.y-circle.height/2)};
  });
  expect(fit.paddingX).toBeGreaterThan(2);
  expect(fit.paddingY).toBeGreaterThan(2);
  expect(fit.offsetX).toBeLessThan(.5);
  expect(fit.offsetY).toBeLessThan(.5);
  await expect(timeline.locator('.one-off-preview .ghost-marker').first()).toHaveCSS('stroke','rgb(229, 57, 53)');
  await expect(timeline.locator('text').filter({hasText:'One-off'})).toHaveCount(0);
});
