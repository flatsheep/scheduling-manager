import {test,expect,type Locator,type Page} from '@playwright/test';
async function setTime(page:Page,endpoint:'Start'|'End',value:string){
  const [hour,minute]=value.split(':');
  await page.getByRole('combobox',{name:`${endpoint} hour`,exact:true}).selectOption(hour);
  const select=page.getByRole('combobox',{name:`${endpoint} minute`,exact:true});
  const choice=await select.locator(`option[value="${minute}"]`).count()?minute:String(Math.floor(Number(minute)/5)*5).padStart(2,'0');
  await select.selectOption(choice);
}
async function expectTime(page:Page,endpoint:'Start'|'End',value:string){
  await expect.poll(async()=>`${await page.getByRole('combobox',{name:`${endpoint} hour`,exact:true}).inputValue()}:${await page.getByRole('combobox',{name:`${endpoint} minute`,exact:true}).inputValue()}`).toBe(value);
}
async function enableAway(page:Page){await page.getByRole('button',{name:'Away',exact:true}).click();await page.getByRole('button',{name:'Enable Away',exact:true}).click();}
async function pointAt(timeline:Locator,minute:number,y=70) {
  return timeline.locator('svg').evaluate((svg:SVGSVGElement,point)=>{const axis=svg.querySelector<SVGLineElement>('.axis')!;const screen=new DOMPoint(axis.x1.baseVal.value+point.minute/1440*(axis.x2.baseVal.value-axis.x1.baseVal.value),point.y).matrixTransform(svg.getScreenCTM()!);return{x:screen.x,y:screen.y};},{minute,y});
}
test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-07-06T10:00:00Z')});await page.goto('/');await expect(page.getByRole('heading',{name:'Heating Schedule',exact:true})).toBeVisible();});
test('new draft validates, edits, saves and Cancel does no write',async({page})=>{
  await page.getByRole('button',{name:'＋ Schedule',exact:true}).click();await page.getByRole('textbox',{name:'Schedule name'}).fill('Office heating');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(page.getByRole('button',{name:'Save',exact:true})).toBeDisabled();expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await page.getByRole('button',{name:'＋ Entity',exact:true}).click();await page.getByRole('textbox',{name:'Search entities'}).fill('Office');await page.getByRole('button',{name:/Office climate.office/}).click();await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'MON',exact:true}).click();await page.getByRole('button',{name:'＋ Add time band'}).click();await setTime(page,'Start','12:00');await setTime(page,'End','13:00');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('button',{name:'Edit Office heating'})).toBeVisible();
  await page.getByRole('button',{name:'Edit Office heating'}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(1);
});
test('shared setback isolated by draft; failure and conflict retain editor',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.getByRole('button',{name:'Shared setback for Kitchen',exact:true}).first().click();await page.getByRole('spinbutton',{name:'Shared setback'}).fill('15');await page.getByRole('button',{name:'Apply',exact:true}).click();
  expect(await page.evaluate(()=>Object.values((window as any).mock.saved.model.entity_settings)[0])).toHaveProperty('setback.value',13);
  await page.evaluate(()=>{(window as any).mock.fail=true;});await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Mock storage failure');await expect(page.getByRole('button',{name:'Save',exact:true})).toBeVisible();
  await page.evaluate(()=>{(window as any).mock.fail=false;(window as any).mock.saved.model.revision++;(window as any).mock.notify();});await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('alert').first()).toContainText('Conflict');
});
test('pending deletion Cancel restores; save deletes only that section',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 3',exact:true}).click();await page.getByRole('button',{name:'Delete section',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();await expect(page.getByText('Section pending deletion.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();await expect(page.getByRole('button',{name:'Edit Schedule 3',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Edit Schedule 3',exact:true}).click();await page.getByRole('button',{name:'Delete section',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByRole('button',{name:'Edit Schedule 3',exact:true})).toHaveCount(0);
});
test('hold creates one hour; movement cancels; double tap confirms paired deletion',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');
  const {x,y}=await pointAt(timeline,400);
  await page.mouse.move(x,y);await page.mouse.down();await page.clock.runFor(610);await page.mouse.up();
  let bands=await timeline.evaluate((el:any)=>el.sub.bands);expect(bands).toHaveLength(3);expect(bands.find((b:any)=>b.start_minute===400).end_minute).toBe(460);
  await page.mouse.move(x+100,y);await page.mouse.down();await page.mouse.move(x+125,y);await page.clock.runFor(650);await page.mouse.up();expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(3);
  const marker=timeline.getByRole('button',{name:/Target start 06:40/});await marker.dblclick();await page.getByRole('button',{name:'No',exact:true}).click();expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(3);
  await marker.dblclick();await page.getByRole('button',{name:'Yes',exact:true}).click();expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(2);
});
test('keyboard endpoint editing clamps; exact end-of-day stored as 1440',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');const marker=timeline.getByRole('button',{name:/Target start 12:00/});await marker.focus();await page.keyboard.press('ArrowRight');expect(await timeline.evaluate((el:any)=>el.sub.bands[1].start_minute)).toBe(725);
  await page.keyboard.press('Enter');await setTime(page,'End','23:59');await page.getByRole('button',{name:'Apply',exact:true}).click();expect(await timeline.evaluate((el:any)=>el.sub.bands[1].end_minute)).toBe(1440);
});
test('short hold gap requests explicit shorter duration; drag cannot cross pair',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');const rect=(await timeline.locator('svg').boundingBox())!;
  const {x,y}=await pointAt(timeline,690);
  await page.mouse.move(x,y);await page.mouse.down();await page.clock.runFor(610);await page.mouse.up();
  await expect(page.getByText('A full one-hour band does not fit here.',{exact:false})).toBeVisible();expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(2);
  await setTime(page,'End','12:00');await page.getByRole('button',{name:'Apply',exact:true}).click();expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(3);
  const marker=timeline.getByRole('button',{name:/Target start 02:00/});const box=(await marker.boundingBox())!;await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.7,box.y+10);await page.mouse.up();
  expect(await timeline.evaluate((el:any)=>el.sub.bands[0].start_minute)).toBe(315);
});
test('sub-schedule popup selection, owned weekdays and draft deletion release',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 3',exact:true}).click();await expect(page.getByRole('button',{name:'Delete sub-schedule'})).toBeDisabled();
  await page.getByRole('button',{name:'Add sub-schedule'}).click();await expect(page.getByRole('button',{name:'TUE',exact:true})).toBeDisabled();await page.getByRole('button',{name:'MON',exact:true}).click();
  await page.getByRole('combobox',{name:'Choose sub-schedule'}).selectOption('0');await expect(page.getByRole('button',{name:'MON',exact:true})).toBeDisabled();
  await page.getByRole('combobox',{name:'Choose sub-schedule'}).selectOption('1');await page.getByRole('button',{name:'Delete sub-schedule'}).click();await expect(page.getByRole('alertdialog')).not.toContainText(/draft/i);await page.getByRole('button',{name:'Yes',exact:true}).click();await expect(page.getByRole('button',{name:'MON',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});
test('touch scrolling cancels hold and does not create or drag a band',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const phone=await context.newPage();await phone.clock.install({time:new Date('2026-07-06T10:00:00Z')});await phone.goto('/');await phone.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  const timeline=phone.locator('.editing hsm-timeline');await timeline.scrollIntoViewIfNeeded();const rect=(await timeline.boundingBox())!;const x=rect.x+200,y=rect.y+100;const session=await context.newCDPSession(phone);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-100,y:y-10}]});await phone.clock.runFor(650);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(2);await expect(phone.getByRole('dialog')).toHaveCount(0);await context.close();
});
test('Away changes global state without cancelling draft, read-only controls disabled',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await enableAway(page);await expect(page.getByText('Away active — normal transitions are suspended.')).toBeVisible();await expect(page.getByRole('button',{name:'Save',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();await expect(page.locator('.empty').filter({hasText:'Away'})).toHaveCount(3);
  await page.evaluate(()=>{(window as any).mock.saved.editable=false;(window as any).mock.notify();});await expect(page.getByRole('button',{name:'＋ Schedule',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Away',exact:true})).toBeDisabled();
});
test('header stays pinned while schedules scroll on desktop and phone',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock,source=m.saved.model.schedules[0];m.saved.model.schedules=Array.from({length:12},(_,i)=>({...structuredClone(source),id:`scroll-${i}`,name:`Scroll ${i}`}));m.notify();});
  const header=page.locator('heating-schedule-manager-card header'),row=page.locator('section').first();
  for(const width of [1500,390]){
    await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo(0,0));
    const before=(await row.boundingBox())!.y;
    await page.evaluate(()=>window.scrollTo(0,300));
    await expect.poll(async()=>Math.round((await header.boundingBox())!.y)).toBe(0);
    expect((await row.boundingBox())!.y).toBeLessThan(before-200);
    await page.getByRole('button',{name:'Filter schedules',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});
test('desktop and phone screenshots; phone has no page-wide overflow',async({page})=>{
  await page.setViewportSize({width:1600,height:1050});await page.screenshot({path:'../artifacts/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'../artifacts/phone.png',fullPage:true});
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.screenshot({path:'../artifacts/phone-edit.png',fullPage:true});
});
test('Disable and Enable are immediate per-section operations shared across clients',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].category='Heating';m.notify();});const row=page.locator('section[aria-label="Schedule 1"]'),before=(await row.boundingBox())!;
  const disable=page.getByRole('button',{name:'Disable Schedule 1',exact:true});await expect(disable).toBeVisible();
  await expect(disable).toHaveCSS('background-color','rgb(119, 119, 119)');
  await page.setViewportSize({width:390,height:844});const phoneBefore=await row.boundingBox();await disable.click();await expect(page.getByRole('button',{name:'Enable Schedule 1',exact:true})).toBeVisible();await expect(page.locator('section[aria-label="Schedule 1"] .disabled-label')).toHaveText('Disabled');await expect.poll(()=>row.evaluate(n=>{const panel=n.querySelector('.schedule-panel')!.getBoundingClientRect(),label=n.querySelector('.disabled-label')!.getBoundingClientRect();return label.top-(panel.bottom);})).toBeGreaterThanOrEqual(0);
  expect((await row.boundingBox())!.x).toBeCloseTo(phoneBefore!.x,1);expect((await row.boundingBox())!.width).toBeCloseTo(phoneBefore!.width,1);
  await expect(page.getByRole('button',{name:'Enable Schedule 1',exact:true})).toHaveCSS('background-color','rgb(35, 173, 75)');
  expect(await page.evaluate(()=>(window as any).mock.writes[0])).toMatchObject({type:'heating_schedule_manager/set_section_enabled',enabled:false,expected_revision:1});
  await page.getByRole('button',{name:'Enable Schedule 1',exact:true}).click();await expect(disable).toBeVisible();
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await expect(page.getByRole('button',{name:'Disable Schedule 1',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Disable Schedule 2',exact:true}).click();await expect(page.getByRole('alert')).toContainText('unsaved changes');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();await expect(page.getByRole('button',{name:'Enable Schedule 2',exact:true})).toBeVisible();
  await page.evaluate(()=>{(window as any).mock.saved.editable=false;(window as any).mock.notify();});await expect(disable).toBeDisabled();await expect(page.getByRole('button',{name:'Enable Schedule 2',exact:true})).toBeDisabled();
});
test('HA theme colours, simplified labels and vertical marker time labels',async({page})=>{
  await page.evaluate(()=>{const card=document.querySelector('heating-schedule-manager-card') as HTMLElement;card.style.setProperty('--app-header-background-color','#55294e');card.style.setProperty('--app-header-text-color','#ffe0f0');});
  await expect(page.locator('heating-schedule-manager-card header')).toHaveCSS('background-color','rgb(85, 41, 78)');await expect(page.locator('.day-box')).toHaveCSS('text-align','center');
  await expect(page.getByText(/Europe\/London/)).toHaveCount(0);await expect(page.getByText(/Saved schedules run/)).toHaveCount(0);await expect(page.getByRole('button',{name:'Edit Schedule 1',exact:true}).locator('ha-icon')).toHaveAttribute('icon','mdi:cog');
  const timeline=page.locator('hsm-timeline').first();await expect(page.locator('.shared-time-label')).toHaveText('11:00');await expect(page.locator('.shared-time-label')).toHaveCSS('border-radius','8px');
  await expect(page.locator('.shared-time-label')).toHaveCSS('font-size','16px');await expect(page.locator('.shared-time-line')).toHaveCSS('width','3.5px');
  expect(await timeline.locator('.marker text').first().getAttribute('transform')).toContain('rotate(-90');
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await expect(page.getByText(/Hold a blank gap/)).toHaveCount(0);
  const text=await page.locator('heating-schedule-manager-card').evaluate((card:any)=>card.shadowRoot.textContent);expect(text).not.toMatch(/\bdraft\b/i);expect(text).not.toMatch(/\bnow\b/i);
  await page.evaluate(()=>{const card=document.querySelector('heating-schedule-manager-card') as HTMLElement;for(const [key,value] of Object.entries({'--primary-text-color':'#e6e6e6','--secondary-text-color':'#b8b8b8','--card-background-color':'#20242a','--secondary-background-color':'#2e3440','--primary-color':'#b478c4'}))card.style.setProperty(key,value);});
  await page.screenshot({path:'../artifacts/desktop-dark-edit.png',fullPage:true});
  await page.getByRole('button',{name:'＋ Add time band'}).click();await expect(page.getByRole('button',{name:'Apply',exact:true})).toBeVisible();
});
test('timeline labels and markers keep constant proportions across window resizing',async({page})=>{
  const timeline=page.locator('hsm-timeline').first();
  const sizes=[];
  for(const width of [1100,1600,2400,390,900]) {
    await page.setViewportSize({width,height:1050});
    await expect.poll(()=>timeline.locator('svg').evaluate((svg:SVGSVGElement)=>{
      const matrix=svg.getScreenCTM()!;return Math.max(Math.abs(matrix.a-1),Math.abs(matrix.d-1));
    })).toBeLessThan(.001);
    await expect(page.locator('.shared-time-label')).toBeVisible();
    sizes.push(await timeline.evaluate((el:any)=>{
      const card=document.querySelector('heating-schedule-manager-card') as any;
      const rect=card.shadowRoot.querySelector('.shared-time-label').getBoundingClientRect();
      const marker=el.shadowRoot.querySelector('.marker path').getBoundingClientRect();
      return {boxWidth:rect.width,boxHeight:rect.height,markerWidth:marker.width,markerHeight:marker.height};
    }));
  }
  for(const size of sizes)for(const key of Object.keys(size) as (keyof typeof size)[])expect(size[key]).toBeCloseTo(sizes[0][key],2);
  expect(sizes[0].boxWidth).toBeCloseTo(64,2);expect(sizes[0].boxHeight).toBeCloseTo(30,2);
  await expect(page.locator('.day-box')).toHaveCSS('border-radius','6px');await expect(page.locator('.entities .entity span').first()).toHaveCSS('font-size','12px');
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  const buttons=page.locator('.editing .edit-bottom .tools').getByRole('button');await expect(buttons).toHaveText(['','Cancel','Save']);await expect(buttons.first()).toHaveAccessibleName('Delete section');
  await page.setViewportSize({width:2400,height:1050});
  const edited=page.locator('.editing hsm-timeline');const {x,y}=await pointAt(edited,400);
  await page.mouse.move(x,y);await page.mouse.down();await page.clock.runFor(610);await page.mouse.up();
  expect(await edited.evaluate((el:any)=>el.sub.bands.some((b:any)=>b.start_minute===400&&b.end_minute===460))).toBe(true);
  await page.screenshot({path:'../artifacts/desktop-wide-edit.png',fullPage:true});
});
test('view title is used and an untitled view has no fallback heading',async({page})=>{
  await expect(page.getByRole('heading',{name:'Ignored card title',exact:true})).toHaveCount(0);
  await page.evaluate(()=>{const view=document.getElementById('fixture-view') as any;view.lovelace.rawConfig.views[0].title='Lights and Heating';const card=document.querySelector('heating-schedule-manager-card') as any;card.hass=card.hass;});
  await expect(page.getByRole('heading',{name:'Lights and Heating',exact:true})).toBeVisible();
  await page.evaluate(()=>{const view=document.getElementById('fixture-view') as any;delete view.lovelace.rawConfig.views[0].title;const card=document.querySelector('heating-schedule-manager-card') as any;card.hass=card.hass;});
  await expect(page.locator('heating-schedule-manager-card header h2')).toHaveCount(0);await expect(page.getByRole('button',{name:'＋ Schedule',exact:true})).toBeVisible();
});
test('writable entities use independently editable start/end state choices',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.getByRole('button',{name:'＋ Entity',exact:true}).click();
  await page.getByRole('textbox',{name:'Search entities'}).fill('sensor');await expect(page.locator('.choices button')).toHaveCount(0);
  await page.getByRole('textbox',{name:'Search entities'}).fill('Hall Light');await page.getByRole('button',{name:/Hall Light light.hall/}).click();
  await expect(page.getByRole('combobox',{name:'Start state',exact:true})).toHaveValue('off');await expect(page.getByRole('combobox',{name:'End state',exact:true})).toHaveValue('off');
  await page.getByRole('combobox',{name:'Start state',exact:true}).selectOption('off');await page.getByRole('combobox',{name:'End state',exact:true}).selectOption('on');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(page.getByRole('button',{name:'Start state for Hall Light',exact:true})).toHaveText('OFF');await expect(page.getByRole('button',{name:'End state for Hall Light',exact:true})).toHaveText('ON');
  await page.getByRole('button',{name:'Start state for Hall Light',exact:true}).click();await page.getByRole('combobox',{name:'Start state',exact:true}).selectOption('on');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();const saved=await page.evaluate(()=>(window as any).mock.saved.model);const key=Object.keys(saved.entity_settings).find(k=>saved.entity_settings[k].entity_id==='light.hall')!;
  expect(saved.schedules[0].entities.find((m:any)=>m.entity_key===key)).toMatchObject({start_state:'on',end_state:'on'});expect(saved.entity_settings[key]).not.toHaveProperty('setback');
  await page.getByRole('button',{name:'Edit Schedule 2',exact:true}).click();await page.getByRole('button',{name:'＋ Entity',exact:true}).click();await page.getByRole('textbox',{name:'Search entities'}).fill('Hall Light');await page.getByRole('button',{name:/Hall Light light.hall/}).click();await page.getByRole('combobox',{name:'Start state',exact:true}).selectOption('off');await page.getByRole('combobox',{name:'End state',exact:true}).selectOption('off');await page.getByRole('button',{name:'Apply',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();
  const state=await page.evaluate(()=>(window as any).mock.saved.model);expect(state.schedules[0].entities.find((m:any)=>m.entity_key===key).end_state).toBe('on');expect(state.schedules[1].entities.find((m:any)=>m.entity_key===key).end_state).toBe('off');
});
test('multi-state selectors and Away participation follow Save/Cancel semantics',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.getByRole('button',{name:'Schedule Away participation',exact:true}).click();await expect(page.getByRole('button',{name:'Schedule Away participation',exact:true})).toHaveText('Away excluded');
  await page.getByRole('button',{name:'＋ Entity',exact:true}).click();await page.getByRole('textbox',{name:'Search entities'}).fill('Scene selector');await page.getByRole('button',{name:/Scene selector select.scene/}).click();await page.getByRole('combobox',{name:'Start state',exact:true}).selectOption('Focus');await page.getByRole('combobox',{name:'End state',exact:true}).selectOption('Relax');await page.getByRole('button',{name:'Apply',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);await page.getByRole('button',{name:'Save',exact:true}).click();
  await enableAway(page);await expect(page.locator('section[aria-label="Schedule 1"] hsm-timeline')).toBeVisible();await expect(page.locator('section[aria-label="Schedule 2"] .empty')).toHaveText('Away');
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.getByRole('button',{name:'Schedule Away participation',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();expect(await page.evaluate(()=>(window as any).mock.saved.model.schedules[0].away_enabled)).toBe(false);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'../artifacts/phone-mixed-entities.png',fullPage:true});
});
test('numeric, text and date/time values use entity-specific editors',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  await page.getByRole('button',{name:'＋ Entity',exact:true}).click();await page.getByRole('textbox',{name:'Search entities'}).fill('Level');await page.getByRole('button',{name:/Level number.level/}).click();await page.getByRole('spinbutton',{name:'Start state',exact:true}).fill('35');await page.getByRole('spinbutton',{name:'End state',exact:true}).fill('10');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'＋ Entity',exact:true}).click();await page.getByRole('textbox',{name:'Search entities'}).fill('Message');await page.getByRole('button',{name:/Message text.message/}).click();await expect(page.getByRole('textbox',{name:'Start state',exact:true})).toHaveValue('Morning scene');await page.getByRole('textbox',{name:'End state',exact:true}).fill('');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'＋ Entity',exact:true}).click();await page.getByRole('textbox',{name:'Search entities'}).fill('Reminder');await page.getByRole('button',{name:/Reminder datetime.reminder/}).click();await expect(page.getByLabel('Start state',{exact:true})).toHaveValue('2026-07-06T11:00:30');await expect(page.getByLabel('Start state',{exact:true})).toHaveAttribute('step','1');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();const saved=await page.evaluate(()=>(window as any).mock.saved.model);const lookup=(eid:string)=>{const key=Object.keys(saved.entity_settings).find(k=>saved.entity_settings[k].entity_id===eid);return saved.schedules[0].entities.find((m:any)=>m.entity_key===key);};
  expect(lookup('number.level')).toMatchObject({start_state:35,end_state:10});expect(lookup('text.message')).toMatchObject({start_state:'Morning scene',end_state:''});expect(lookup('datetime.reminder').start_state).toBe('2026-07-06T10:00:30+00:00');
});
test('overlapping arrows alternate foreground without opening or deleting a band',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.getByRole('button',{name:'＋ Add time band'}).click();await setTime(page,'Start','06:00');await setTime(page,'End','06:05');await page.getByRole('button',{name:'Apply',exact:true}).click();
  const timeline=page.locator('.editing hsm-timeline');
  const point=await timeline.evaluate((el:any)=>{
    const nodes=[...el.shadowRoot.querySelectorAll('g.marker')];const start=nodes.find((n:any)=>n.getAttribute('aria-label').startsWith('Target start 06:00'));const end=nodes.find((n:any)=>n.getAttribute('aria-label').startsWith('Setback end 06:05'));
    const a=start.querySelector('.hit-area').getBoundingClientRect(),b=end.querySelector('.hit-area').getBoundingClientRect();
    return {x:(Math.max(a.left,b.left)+Math.min(a.right,b.right))/2,y:(Math.max(a.top,b.top)+Math.min(a.bottom,b.bottom))/2};
  });
  await page.mouse.click(point.x,point.y);await expect(timeline.locator('.marker.selected')).toHaveAttribute('aria-label',/^Setback end 06:05/);
  await page.mouse.click(point.x,point.y);await expect(timeline.locator('.marker.selected')).toHaveAttribute('aria-label',/^Target start 06:00/);
  await page.mouse.click(point.x,point.y);await expect(timeline.locator('.marker.selected')).toHaveAttribute('aria-label',/^Setback end 06:05/);
  await page.clock.runFor(400);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await timeline.evaluate((el:any)=>el.shadowRoot.querySelectorAll('g.marker')[el.shadowRoot.querySelectorAll('g.marker').length-1].classList.contains('selected'))).toBe(true);
  expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(3);
  await timeline.getByRole('button',{name:'Edit times',exact:true}).click();await expectTime(page,'Start','06:00');await setTime(page,'End','06:10');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await timeline.getByRole('button',{name:'Delete band…',exact:true}).click();await page.getByRole('button',{name:'No',exact:true}).click();expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(3);
  await page.screenshot({path:'../artifacts/overlap-marker-selection.png',fullPage:true});
});
test('view-mode overlapping markers can be selected without altering saved values',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock;const sub=m.saved.model.schedules[0].sub_schedules[0];sub.bands=[{id:crypto.randomUUID(),start_minute:360,end_minute:365}];m.notify();});
  const timeline=page.locator('hsm-timeline').first();const point=await timeline.evaluate((el:any)=>{const rects=[...el.shadowRoot.querySelectorAll('.hit-area')].map((n:any)=>n.getBoundingClientRect());return{x:(Math.max(rects[0].left,rects[1].left)+Math.min(rects[0].right,rects[1].right))/2,y:85+el.shadowRoot.querySelector('svg').getBoundingClientRect().top};});
  await page.mouse.click(point.x,point.y);const first=await timeline.locator('.marker.selected').getAttribute('data-marker');await page.mouse.click(point.x,point.y);expect(await timeline.locator('.marker.selected').getAttribute('data-marker')).not.toBe(first);
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('entity rows present orange start/target first and blue end/setback last',async({page})=>{
  const row=page.locator('section[aria-label="Schedule 1"] .entity').first();await expect(row.locator('button').first()).toHaveClass('target');await expect(row.locator('button').nth(1)).toHaveClass('setback');
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.getByRole('button',{name:'＋ Entity',exact:true}).click();await page.getByRole('textbox',{name:'Search entities'}).fill('Hall Light');await page.getByRole('button',{name:/Hall Light light.hall/}).click();await page.getByRole('combobox',{name:'Start state',exact:true}).selectOption('on');await page.getByRole('combobox',{name:'End state',exact:true}).selectOption('off');await page.getByRole('button',{name:'Apply',exact:true}).click();
  const stateRow=page.locator('.editing .entity').last();await expect(stateRow.locator('button').first()).toHaveText('ON');await expect(stateRow.locator('button').first()).toHaveClass('target');await expect(stateRow.locator('button').nth(1)).toHaveText('OFF');await expect(stateRow.locator('button').nth(1)).toHaveClass('setback');
});
test('category creation and assignment commit on Save and unused categories disappear',async({page})=>{
  async function setCategory(schedule:string,choice:string,name?:string){await page.getByRole('button',{name:`Edit ${schedule}`,exact:true}).click();await page.getByRole('button',{name:'Assign category',exact:true}).click();await page.getByRole('combobox',{name:'Category',exact:true}).selectOption(choice);if(name)await page.getByRole('textbox',{name:'New category',exact:true}).fill(name);await page.getByRole('button',{name:'Apply',exact:true}).click();}
  await setCategory('Schedule 1','new',' Heating ');await expect(page.locator('.editing .category-watermark')).toHaveText('Heating');expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();await page.getByRole('button',{name:'Filter schedules'}).click();await expect(page.locator('[data-filter="categories"]').getByRole('checkbox')).toHaveCount(2);await expect(page.getByRole('checkbox',{name:'Unassigned',exact:true})).toBeChecked();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await setCategory('Schedule 1','new','Heating');await page.getByRole('button',{name:'Save',exact:true}).click();await setCategory('Schedule 2','category:Heating');await page.getByRole('button',{name:'Save',exact:true}).click();
  await setCategory('Schedule 1','none');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Filter schedules'}).click();await expect(page.locator('[data-filter="categories"]').getByRole('checkbox')).toHaveCount(3);await expect(page.getByRole('checkbox',{name:'Heating',exact:true})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await setCategory('Schedule 2','none');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Filter schedules'}).click();await expect(page.locator('[data-filter="categories"]').getByRole('checkbox')).toHaveCount(2);await expect(page.getByRole('checkbox',{name:'Heating',exact:true})).toHaveCount(0);
});
test('category filtering and grouped order are local, watermark stays behind the timeline',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].category='Heating';m.saved.model.schedules[1].category='Lighting';m.saved.model.schedules[2].category='Heating';m.notify();});
  const headerButtons=page.locator('heating-schedule-manager-card header button');await expect(headerButtons).toHaveText(['Hide all','☷ Filter','＋ Schedule','Away']);
  await expect(page.locator('.category-watermark').first()).toHaveCSS('pointer-events','none');await expect(page.locator('.category-watermark').first()).toHaveCSS('z-index','0');await expect(page.locator('.timeline-region').first()).toHaveCSS('z-index','2');
  await page.getByRole('button',{name:'Filter schedules'}).click();await page.getByRole('checkbox',{name:'Lighting',exact:true}).uncheck();await page.getByRole('button',{name:'Apply',exact:true}).click();expect(await page.locator('section').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))).toEqual(['Schedule 1','Schedule 3']);
  await page.getByRole('button',{name:'Filter schedules'}).click();await page.getByRole('checkbox',{name:'Select all categories',exact:true}).check();await expect(page.getByRole('combobox',{name:'Sort schedules'})).toHaveCount(0);await page.getByRole('button',{name:'Apply',exact:true}).click();expect(await page.locator('section').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))).toEqual(['Schedule 1','Schedule 3','Schedule 2']);
  expect(await page.evaluate(()=>(window as any).mock.saved.model.schedules.map((s:any)=>s.name))).toEqual(['Schedule 1','Schedule 2','Schedule 3']);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await page.screenshot({path:'../artifacts/category-schedules-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'../artifacts/category-schedules-phone.png',fullPage:true});
});
test.describe('touch overlap selection',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}});
  test('taps alternate overlapping markers without modifying a saved band',async({page})=>{
    await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].sub_schedules[0].bands=[{id:crypto.randomUUID(),start_minute:720,end_minute:725}];m.notify();});
    const timeline=page.locator('hsm-timeline').first();await timeline.scrollIntoViewIfNeeded();
    const point=await timeline.evaluate((el:any)=>{const rects=[...el.shadowRoot.querySelectorAll('.hit-area')].map((n:any)=>n.getBoundingClientRect());return{x:(Math.max(rects[0].left,rects[1].left)+Math.min(rects[0].right,rects[1].right))/2,y:(Math.max(rects[0].top,rects[1].top)+Math.min(rects[0].bottom,rects[1].bottom))/2};});
    await page.touchscreen.tap(point.x,point.y);const first=await timeline.locator('.marker.selected').getAttribute('data-marker');await page.touchscreen.tap(point.x,point.y);expect(await timeline.locator('.marker.selected').getAttribute('data-marker')).not.toBe(first);
    expect(await timeline.evaluate((el:any)=>el.sub.bands[0])).toMatchObject({start_minute:720,end_minute:725});expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  });
});
test('checkbox filters multi-select, cancel, clear/select all and turn the header green',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].category='Heating';m.saved.model.schedules[1].category='Lighting';m.saved.model.schedules[2].category=null;m.notify();});
  const button=page.getByRole('button',{name:'Filter schedules'});await button.click();
  await page.getByRole('checkbox',{name:'Lighting',exact:true}).uncheck();expect(await page.getByRole('checkbox',{name:'Select all categories',exact:true}).evaluate((el:HTMLInputElement)=>el.indeterminate)).toBe(true);
  await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(button).toHaveClass('selected');await expect(button).toHaveCSS('background-color','rgb(35, 173, 75)');
  expect(await page.locator('section').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))).toEqual(['Schedule 1','Schedule 3']);
  await button.click();await page.getByRole('checkbox',{name:'Select all categories',exact:true}).check();await page.getByRole('checkbox',{name:'Select all categories',exact:true}).uncheck();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.locator('section').count()).toBe(2);
  await button.click();await page.getByRole('checkbox',{name:'Select all categories',exact:true}).check();await page.getByRole('checkbox',{name:'Select all categories',exact:true}).uncheck();await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.getByText('No schedules match this filter.',{exact:true})).toBeVisible();await expect(button).toHaveClass('selected');
  await button.click();await page.getByRole('checkbox',{name:'Select all categories',exact:true}).check();await expect(page.getByRole('combobox',{name:'Sort schedules'})).toHaveCount(0);await page.getByRole('button',{name:'Apply',exact:true}).click();expect(await page.locator('section').count()).toBe(3);await expect(button).not.toHaveClass('selected');
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await button.click();await page.screenshot({path:'../artifacts/category-checkbox-filter.png',fullPage:true});
});
test('edit footer actions remain in one row at desktop and narrow phone widths',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  for(const width of [1600,390,320]){
    await page.setViewportSize({width,height:1050});
    const boxes=await page.locator('.editing .edit-actions button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right};}));
    expect(boxes).toHaveLength(2);expect(boxes.every(b=>Math.abs(b.y-boxes[0].y)<1)).toBe(true);expect(boxes[1].right).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await expect(page.locator('.editing .entity span').first()).toHaveCSS('font-size','11px');await page.screenshot({path:'../artifacts/compact-phone-edit.png',fullPage:true});
});
test('view weekdays show current groups light green and future groups grey',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock;const s=m.saved.model.schedules[0];s.sub_schedules[0].days=[0,2,4];s.sub_schedules.push({id:crypto.randomUUID(),days:[1],bands:[{id:crypto.randomUUID(),start_minute:720,end_minute:960}]});m.notify();});
  const section=page.locator('section[aria-label="Schedule 1"]');await expect(section.locator('.view-day')).toHaveText(['MON','TUE','WED','THU','FRI','SAT','SUN']);await expect(section.locator('.view-day.active')).toHaveText(['MON','WED','FRI']);await expect(section.locator('.view-day.inactive')).toHaveText(['TUE']);await expect(section.locator('.view-day.inactive')).toHaveCSS('background-color','rgb(119, 119, 119)');await expect(section.locator('.view-day.unscheduled')).toHaveText(['THU','SAT','SUN']);await expect(section.locator('.view-days button.view-day')).toHaveCount(4);
  await section.locator('.view-day').first().click();expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.clock.setSystemTime(new Date('2026-07-07T10:00:00Z'));await page.clock.runFor(30000);await expect(section.locator('.view-day.active')).toHaveText(['TUE']);await expect(section.locator('.view-day.inactive')).toHaveText(['MON','WED','FRI']);
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await expect(section.locator('.view-days')).toHaveCount(0);await expect(section.getByRole('button',{name:'MON',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('quick-clear X appears beside a green filter button and clears all filter dimensions',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].category='Heating';m.saved.model.schedules[1].category='Lighting';m.notify();});
  const clear=page.getByRole('button',{name:'Clear schedule filters',exact:true});await expect(clear).toHaveCount(0);
  await page.getByRole('button',{name:'Filter schedules'}).click();await page.getByRole('checkbox',{name:'Lighting',exact:true}).uncheck();await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(clear).toHaveClass(/remove/);await expect(page.locator('.filter-controls button').first()).toHaveAccessibleName('Clear schedule filters');await clear.click();
  await expect(clear).toHaveCount(0);await expect(page.getByRole('button',{name:'Filter schedules'})).not.toHaveClass('selected');expect(await page.locator('section').count()).toBe(3);
  await page.getByRole('button',{name:'Filter schedules'}).click();await expect(page.getByRole('checkbox',{name:'Select all categories',exact:true})).toBeChecked();expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});
test('one shared time indicator spans all strips and follows synchronised scrolling',async({page})=>{
  await page.setViewportSize({width:1920,height:1100});await expect(page.locator('.shared-time-label')).toHaveCount(1);await expect(page.locator('.shared-time-line')).toHaveCount(1);await expect(page.locator('hsm-timeline .current-label')).toHaveCount(0);
  const line=(await page.locator('.shared-time-line').boundingBox())!,sections=await page.locator('section').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{top:r.top,bottom:r.bottom};}));
  const firstAxis=(await page.locator('hsm-timeline .axis').first().boundingBox())!;expect(line.y).toBeLessThan(firstAxis.y);expect(line.y+line.height).toBeGreaterThanOrEqual(sections.at(-1)!.bottom-10);
  for(const timeline of await page.locator('hsm-timeline').all()){
    const x=await timeline.locator('svg').evaluate((svg:SVGSVGElement)=>new DOMPoint(40+660/1440*(svg.viewBox.baseVal.width-80),0).matrixTransform(svg.getScreenCTM()!).x);
    expect(Math.abs(x-(line.x+line.width/2))).toBeLessThan(2);
  }
  await page.setViewportSize({width:390,height:1000});await page.locator('hsm-timeline').first().evaluate((node:HTMLElement)=>{node.scrollLeft=200;});
  await expect.poll(()=>page.locator('hsm-timeline').evaluateAll(nodes=>nodes.map(node=>node.scrollLeft))).toEqual([200,200]);await expect(page.locator('.shared-time-label')).toHaveCount(1);
  await page.screenshot({path:'../artifacts/shared-current-time-phone.png',fullPage:true});
});
test('reference layout has a lighter theme panel, paired entity grid and inline title/day',async({page})=>{
  await page.setViewportSize({width:1280,height:900});
  await page.evaluate(()=>{
    const card=document.querySelector('heating-schedule-manager-card') as any,m=(window as any).mock;
    card.style.setProperty('--app-header-background-color','#fa6e5e');card.style.setProperty('--primary-color','#fa6e5e');card.style.setProperty('--card-background-color','#ffffff');
    const model=m.saved.model,s=model.schedules[0],keys=Object.keys(model.entity_settings);
    s.entities=keys.map(entity_key=>({entity_key,target:{value:18,unit:'°C'}}));
    const office=crypto.randomUUID(),light=crypto.randomUUID();model.entity_settings[office]={entity_id:'climate.office',registry_id:null,setback:{value:13,unit:'°C'}};model.entity_settings[light]={entity_id:'light.hall',registry_id:null};
    s.entities.push({entity_key:office,target:{value:18,unit:'°C'}},{entity_key:light,start_state:'on',end_state:'off'});s.category='Heating';
    for(const [index,member] of s.entities.entries())card.hass.states[model.entity_settings[member.entity_key].entity_id].attributes.friendly_name=`Entity ${index+1}`;
    m.saved.model.schedules=[s];m.notify();card.hass=card.hass;
  });
  const panel=page.locator('.schedule-panel').first(),timeline=page.locator('.timeline-region').first();
  const colours=await panel.evaluate(node=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;canvas.width=canvas.height=1;ctx.fillStyle=getComputedStyle(node).backgroundColor;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];});
  expect(colours[0]).toBeGreaterThan(250);expect(colours[1]).toBeGreaterThan(110);expect(colours[2]).toBeGreaterThan(94);expect(colours[3]).toBe(255);
  const p=(await panel.boundingBox())!,t=(await timeline.boundingBox())!;expect(p.width).toBeCloseTo(354,0);expect(t.x).toBeGreaterThanOrEqual(p.x+p.width-1);
  const rows=await page.locator('.entity').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y};}));expect(rows).toHaveLength(6);expect(Math.abs(rows[0].y-rows[1].y)).toBeLessThan(1);expect(rows[1].x).toBeGreaterThan(rows[0].x);expect(Math.abs(rows[2].y-rows[3].y)).toBeLessThan(1);
  const title=(await page.locator('header h2').boundingBox())!,day=(await page.locator('header .day-box').boundingBox())!;expect(day.x).toBeGreaterThan(title.x);expect(Math.abs(title.y+title.height/2-day.y-day.height/2)).toBeLessThan(2);
  await page.screenshot({path:'../artifacts/reference-layout-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'../artifacts/reference-layout-phone.png',fullPage:true});
});
test('Scheduling Manager branding and new card tag retain the legacy card alias',async({page})=>{
  expect(await page.evaluate(()=>(window as any).customCards.find((card:any)=>card.type==='scheduling-manager-card')?.name)).toBe('Scheduling Manager');
  expect(await page.evaluate(()=>!!customElements.get('scheduling-manager-card')&&!!customElements.get('heating-schedule-manager-card'))).toBe(true);
});
test.describe('monitor touchscreen dragging',()=>{
  test.use({hasTouch:true,viewport:{width:1920,height:1100}});
  test('held touch dragging prevents native context menus and keeps five-minute snapping',async({page})=>{
    await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');const marker=timeline.getByRole('button',{name:/Target start 12:00/});
    const box=(await marker.boundingBox())!,axis=(await timeline.locator('.axis').boundingBox())!;
    const x=box.x+box.width/2,y=box.y+16,session=await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.clock.runFor(700);
    const prevented=await marker.evaluate(node=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2});node.dispatchEvent(event);return event.defaultPrevented;});expect(prevented).toBe(true);
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+axis.width*30/1440,y}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    expect(await timeline.evaluate((node:any)=>node.sub.bands[1].start_minute)).toBe(750);await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  });
});
test('reference edit layout keeps trash left of Cancel, paired memberships and bottom action rows',async({page})=>{
  await page.setViewportSize({width:1600,height:1000});
  await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[0];s.entities=Object.keys(m.saved.model.entity_settings).map(entity_key=>({entity_key,target:{value:18,unit:'°C'}}));s.category='Heating';m.notify();});
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const panel=page.locator('.editing .schedule-panel');
  await expect(panel.locator('.section-meta .trash-icon')).toHaveCount(0);await expect(panel.locator('.edit-bottom .section-trash .trash-icon')).toHaveCount(1);await expect(panel.locator('.entity .trash-icon')).toHaveCount(4);
  const boxes=await panel.locator('.entity').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,bottom:r.bottom};}));expect(Math.abs(boxes[0].y-boxes[1].y)).toBeLessThan(1);expect(boxes[1].x).toBeGreaterThan(boxes[0].x);expect(Math.abs(boxes[2].y-boxes[3].y)).toBeLessThan(1);
  const header=(await panel.locator('.section-meta').boundingBox())!,footer=(await panel.locator('.edit-footer').boundingBox())!;expect(header.y+header.height).toBeLessThanOrEqual(boxes[0].y+1);expect(footer.y).toBeGreaterThanOrEqual(Math.max(...boxes.map(b=>b.bottom)));
  await expect(panel.locator('.edit-actions button')).toHaveText(['＋ Entity','Away included']);await expect(panel.locator('.edit-bottom .tools button')).toHaveText(['','Cancel','Save']);
  await page.screenshot({path:'../artifacts/reference-edit-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Remove climate.kitchen',exact:true}).click();await page.getByRole('button',{name:'No',exact:true}).click();await expect(panel.locator('.entity')).toHaveCount(4);
  await page.getByRole('button',{name:'Remove climate.kitchen',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();await expect(panel.locator('.entity')).toHaveCount(3);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await expect(page.locator('.editing .entity')).toHaveCount(4);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'../artifacts/reference-edit-phone.png',fullPage:true});
});
test('blank timeline double-click creates one hour without a popup and respects gaps/limits',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');
  const {x,y}=await pointAt(timeline,400,135);await page.mouse.dblclick(x,y);await expect(page.getByRole('dialog')).toHaveCount(0);expect(await timeline.evaluate((el:any)=>el.sub.bands.find((b:any)=>b.start_minute===400)?.end_minute)).toBe(460);
  const tight=await pointAt(timeline,690,135);await page.mouse.dblclick(tight.x,tight.y);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('alert')).toContainText('one-hour band does not fit');expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(3);
  const inside=await pointAt(timeline,780,135);await page.mouse.dblclick(inside.x,inside.y);expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(3);
  const late=await pointAt(timeline,1410,135);await page.mouse.dblclick(late.x,late.y);await expect(page.getByRole('dialog')).toHaveCount(0);expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(3);
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});
test('time-band editor is compact with lower-right trash and keeps editing after No',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');await timeline.getByRole('button',{name:/Target start 12:00/}).focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog'),trash=page.getByRole('button',{name:'Delete time band',exact:true});await expect(trash.locator('svg')).toHaveCount(1);await expect(dialog.getByRole('button',{name:'Delete band…',exact:true})).toHaveCount(0);
  const d=(await dialog.boundingBox())!,bin=(await trash.boundingBox())!,end=(await page.getByLabel('End time',{exact:true}).boundingBox())!;expect(d.width).toBeLessThanOrEqual(300);expect(bin.x+bin.width).toBeGreaterThan(d.x+d.width-25);expect(bin.y).toBeGreaterThan(end.y+end.height+20);
  await page.screenshot({path:'../artifacts/compact-time-band-popup.png',fullPage:true});await trash.click();await page.getByRole('button',{name:'No',exact:true}).click();await expect(dialog).toBeVisible();expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(2);
  await trash.click();await page.getByRole('button',{name:'Yes',exact:true}).click();await expect(dialog).toHaveCount(0);expect(await timeline.evaluate((el:any)=>el.sub.bands.length)).toBe(1);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  const add=(await page.getByRole('button',{name:'＋ Add time band'}).boundingBox())!,strip=(await page.locator('section.editing').boundingBox())!;expect(strip.y+strip.height-add.y-add.height).toBeGreaterThanOrEqual(8);
});
test('inactive day ghost overlay is read-only, blue-bordered and dismisses outside or after 10s',async({page})=>{
  await page.clock.pauseAt(new Date('2026-07-06T10:01:00Z'));
  const before=await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[0];s.sub_schedules[0].days=[0,2,4];s.sub_schedules.push({id:crypto.randomUUID(),days:[1,3],bands:[{id:crypto.randomUUID(),start_minute:480,end_minute:600}]});m.notify();return structuredClone(m.saved.model);});
  const section=page.locator('section[aria-label="Schedule 1"]'),button=section.getByRole('button',{name:'Preview TUE sub-schedule',exact:true});await button.click();
  await expect(button).toHaveAttribute('aria-pressed','true');await expect(button).toHaveCSS('background-color','rgb(119, 119, 119)');await expect(button).toHaveCSS('border-color','rgb(0, 158, 220)');
  const timeline=section.locator('hsm-timeline');await expect(timeline.locator('.ghost-preview')).toHaveCount(1);await expect(timeline.locator('.ghost-endpoint text')).toHaveText(['08:00','10:00']);expect(await timeline.evaluate((el:any)=>el.sub.bands[0].start_minute)).toBe(120);await expect(timeline.locator('.ghost-preview button')).toHaveCount(0);
  await expect(timeline.locator('.ghost-preview')).toHaveCSS('opacity','1');await expect(timeline.locator('.active-schedule')).toHaveCSS('opacity','0.25');await expect(timeline.locator('.ghost-connector')).toHaveCSS('stroke-dasharray','7px, 5px');
  expect(await timeline.evaluate((el:any)=>Boolean(el.shadowRoot.querySelector('.active-schedule').compareDocumentPosition(el.shadowRoot.querySelector('.ghost-preview'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.screenshot({path:'../artifacts/ghost-sub-schedule-preview.png',fullPage:true});
  await page.clock.runFor(9900);await expect(timeline.locator('.ghost-preview')).toHaveCount(1);await page.clock.runFor(101);await expect(timeline.locator('.ghost-preview')).toHaveCount(0);await expect(button).toHaveAttribute('aria-pressed','false');
  await expect(timeline.locator('.active-schedule')).toHaveCSS('opacity','1');
  await button.click();await page.locator('header h2').click();await expect(timeline.locator('.ghost-preview')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).mock.saved.model)).toEqual(before);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});
test('selecting a preview day resets timeout; pointer movement does not and edit mode dismisses it',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[0];s.sub_schedules[0].days=[0];s.sub_schedules.push({id:crypto.randomUUID(),days:[1,3],bands:[{id:crypto.randomUUID(),start_minute:480,end_minute:600}]},{id:crypto.randomUUID(),days:[4],bands:[{id:crypto.randomUUID(),start_minute:1020,end_minute:1080}]});m.notify();});
  const section=page.locator('section[aria-label="Schedule 1"]'),timeline=section.locator('hsm-timeline');await section.getByRole('button',{name:'Preview TUE sub-schedule'}).click();await page.clock.runFor(9000);
  const box=(await timeline.boundingBox())!;await page.mouse.move(box.x+100,box.y+20);await section.getByRole('button',{name:'Preview THU sub-schedule'}).click();await page.clock.runFor(9000);await expect(timeline.locator('.ghost-preview')).toHaveCount(1);
  await section.getByRole('button',{name:'Preview FRI sub-schedule'}).click();await expect(timeline.locator('.ghost-endpoint text')).toHaveText(['17:00','18:00']);await expect(section.getByRole('button',{name:'Preview TUE sub-schedule'})).toHaveAttribute('aria-pressed','false');
  await section.getByRole('button',{name:'Preview FRI sub-schedule'}).click();await expect(timeline.locator('.ghost-preview')).toHaveCount(0);await section.getByRole('button',{name:'Preview FRI sub-schedule'}).click();await page.keyboard.press('Escape');await expect(timeline.locator('.ghost-preview')).toHaveCount(0);
  await section.getByRole('button',{name:'Preview TUE sub-schedule'}).click();await section.getByRole('button',{name:'Edit Schedule 1'}).click();await expect(section.locator('.ghost-preview')).toHaveCount(0);await expect(section.getByRole('combobox',{name:'Choose sub-schedule'})).toHaveValue('0');expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});
test.describe('touch inactive previews',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}});
  test('No Schedule day can be peeked by touch without activation',async({page})=>{
    await page.locator('section[aria-label="Schedule 3"]').scrollIntoViewIfNeeded();
    const status=page.locator('section[aria-label="Schedule 3"] .empty'),before=await status.boundingBox(),font=await status.evaluate(el=>getComputedStyle(el).fontSize);
    const section=page.locator('section[aria-label="Schedule 3"]');await section.getByRole('button',{name:'Preview TUE sub-schedule'}).tap();await expect(section.locator('.ghost-preview')).toHaveCount(1);await expect(section.locator('.peek-status')).toHaveText('No Schedule');await expect(section.locator('hsm-timeline')).toBeVisible();
    await expect(section.locator('.peek-status')).toHaveCSS('color','rgb(221, 221, 221)');await expect(section.locator('.ghost-preview')).toHaveCSS('opacity','1');await page.screenshot({path:'../artifacts/no-schedule-preview-phone.png',fullPage:true});
    expect(await section.locator('.peek-status').boundingBox()).toEqual(before);await expect(section.locator('.peek-status')).toHaveCSS('font-size',font);
    expect(await section.locator('hsm-timeline').evaluate((el:any)=>el.sub.bands.length)).toBe(0);await page.locator('header h2').tap();await expect(section.locator('.ghost-preview')).toHaveCount(0);await expect(section.locator('.empty')).toHaveText('No Schedule');expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  });
});

test('five-minute time selectors and solar endpoint popup preserve transactions and show dynamic stars',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.getByRole('button',{name:'＋ Add time band'}).click();
  await expect(page.getByRole('combobox',{name:'Start minute',exact:true}).locator('option')).toHaveText(['00','05','10','15','20','25','30','35','40','45','50','55']);await expectTime(page,'End','13:00');
  await page.getByRole('checkbox',{name:'Start solar event',exact:true}).check();await expect(page.getByLabel('Start time',{exact:true})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Start solar event'}).locator('option')).toHaveCount(6);await expect(page.getByLabel('Start offset minutes')).toHaveValue('0');
  await page.getByRole('combobox',{name:'Start solar event'}).selectOption('sunrise');await page.getByLabel('Start offset minutes').fill('-17');
  await page.getByRole('checkbox',{name:'End solar event',exact:true}).check();await page.getByRole('combobox',{name:'End solar event'}).selectOption('sunset');await page.getByLabel('End offset minutes').fill('30');
  await page.screenshot({path:'../artifacts/dynamic-time-band-popup.png',fullPage:true});await page.getByRole('button',{name:'Apply',exact:true}).click();
  const timeline=page.locator('.editing hsm-timeline');await expect(timeline.locator('.marker text')).toContainText(['02:00','05:20','12:00','16:00','04:43 *','21:30 *']);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await timeline.getByRole('button',{name:/Target start 04:43/}).click();await expect(page.getByRole('checkbox',{name:'Start solar event'})).toBeChecked();await page.getByLabel('Start offset minutes').fill('100');await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await timeline.evaluate((el:any)=>el.sub.bands.find((b:any)=>b.start_dynamic).start_dynamic.offset)).toBe(-17);
  await page.getByRole('button',{name:'Save',exact:true}).click();expect(await page.evaluate(()=>(window as any).mock.saved.model.schedules[0].sub_schedules[0].bands.find((b:any)=>b.start_dynamic).end_dynamic)).toEqual({event:'sunset',offset:30});
});

test('dynamic endpoints clamp to paired times and popup changes can restore fixed times',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');await timeline.getByRole('button',{name:/Target start 12:00/}).focus();await page.keyboard.press('Enter');
  await page.getByRole('checkbox',{name:'Start solar event'}).check();await page.getByRole('combobox',{name:'Start solar event'}).selectOption('sunset');await page.getByLabel('Start offset minutes').fill('300');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(timeline.locator('.marker.start text')).toContainText(['23:59 *']);await expect(timeline.locator('.marker.end text')).toContainText(['23:59']);await timeline.getByRole('button',{name:/Target start 23:59/}).focus();await page.keyboard.press('ArrowLeft');
  expect(await timeline.evaluate((el:any)=>el.sub.bands[1].start_dynamic.offset)).toBe(300);await page.keyboard.press('Enter');await page.getByRole('checkbox',{name:'Start solar event'}).uncheck();await setTime(page,'Start','12:00');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(timeline.locator('.marker.start text')).toHaveText(['02:00','12:00']);await expect(timeline.locator('.marker.end text')).toHaveText(['05:20','16:00']);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test.describe('touch dynamic time editor',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}});
  test('touch band opens five-minute selectors and dynamic controls without page overflow',async({page})=>{
    await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).tap();const timeline=page.locator('.editing hsm-timeline');await timeline.scrollIntoViewIfNeeded();
    await timeline.locator('.band-hit').first().tap();await page.clock.runFor(400);await expect(page.getByRole('combobox',{name:'Start minute',exact:true})).toBeVisible();
    await page.getByRole('checkbox',{name:'End solar event'}).check();await page.getByRole('combobox',{name:'End solar event'}).selectOption('dawn');await page.getByLabel('End offset minutes').fill('300');
    await page.screenshot({path:'../artifacts/dynamic-time-band-phone.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Apply',exact:true}).tap();await expect(timeline.locator('.marker text')).toContainText(['09:20 *']);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  });
});

test('dynamic previews use the tapped weekday and missing solar events remain editable',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[0];s.sub_schedules[0].days=[0];s.sub_schedules.push({id:crypto.randomUUID(),days:[1],bands:[{id:crypto.randomUUID(),start_minute:300,end_minute:600,start_dynamic:{event:'sunrise',offset:0}}]});m.notify();});
  const section=page.locator('section[aria-label="Schedule 1"]');await section.getByRole('button',{name:'Preview TUE sub-schedule'}).click();await expect(section.locator('.ghost-endpoint text')).toHaveText(['05:01 *','10:00']);
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.solar_times['2026-07-07'].sunrise=null;m.notify();});await section.getByRole('button',{name:'Edit Schedule 1'}).click();await section.getByRole('combobox',{name:'Choose sub-schedule'}).selectOption({value:'1'});await expect(section.getByRole('combobox',{name:'Choose sub-schedule'})).toHaveValue('1');
  await section.getByRole('button',{name:'Edit unavailable dynamic time band'}).click();await expect(page.getByRole('checkbox',{name:'Start solar event'})).toBeChecked();await page.getByRole('checkbox',{name:'Start solar event'}).uncheck();await setTime(page,'Start','05:00');await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(section.locator('.marker text')).toHaveText(['05:00','10:00']);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('double-click created band opens the popup for dynamic configuration on the next click',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline'),point=await pointAt(timeline,400,135);await page.mouse.dblclick(point.x,point.y);await expect(page.getByRole('dialog')).toHaveCount(0);
  await timeline.getByRole('button',{name:/Target start 06:40/}).click();await page.clock.runFor(400);await page.getByRole('checkbox',{name:'Start solar event'}).check();await expect(page.getByRole('combobox',{name:'Start solar event'})).toBeVisible();expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('solar event replaces the fixed picker and popup previews update with offsets and crossing clamps',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.getByRole('button',{name:'＋ Add time band'}).click();
  const dialog=page.getByRole('dialog'),input=(await page.getByLabel('Start time',{exact:true}).boundingBox())!,before=(await dialog.boundingBox())!;
  await page.getByRole('checkbox',{name:'Start solar event'}).check();const event=(await page.getByRole('combobox',{name:'Start solar event'}).boundingBox())!,after=(await dialog.boundingBox())!;
  expect(event.x-after.x).toBeCloseTo(input.x-before.x,1);expect(event.y-after.y).toBeCloseTo(input.y-before.y,1);expect(event.width).toBeCloseTo(input.width,1);
  await expect(page.getByLabel('Start resolved time')).toHaveText('05:00 *');await page.getByLabel('Start offset minutes').fill('-17');await expect(page.getByLabel('Start resolved time')).toHaveText('04:43 *');
  await page.getByRole('checkbox',{name:'End solar event'}).check();await expect(page.getByLabel('End resolved time')).toHaveText('21:00 *');await page.getByLabel('End offset minutes').fill('30');await expect(page.getByLabel('End resolved time')).toHaveText('21:30 *');
  await page.getByRole('combobox',{name:'Start solar event'}).selectOption('sunset');await expect(page.getByLabel('Start resolved time')).toHaveText('20:43 *');await page.getByLabel('Start offset minutes').fill('300');await expect(page.getByLabel('Start resolved time')).toHaveText('02:00 * (next day)');await expect(page.getByLabel('Start band time')).toHaveText('Band time: 23:59 *');await expect(page.getByLabel('End band time')).toHaveText('Band time: 23:59 *');
  await page.getByRole('checkbox',{name:'End solar event'}).uncheck();await page.getByRole('combobox',{name:'End hour',exact:true}).selectOption('14');await expect(page.getByLabel('Start resolved time')).toHaveText('02:00 * (next day)');await expectTime(page,'End','23:59');await expect(page.getByLabel('End band time')).toHaveText('Band time: 23:59');await expect(dialog.locator('.band-preview-date')).toHaveText('Times for 2026-07-06');
  await page.getByLabel('Start offset minutes').fill('0');await expect(page.getByLabel('Start resolved time')).toHaveText('21:00 *');await page.getByLabel('Start offset minutes').fill('15');await expect(page.getByLabel('Start resolved time')).toHaveText('21:15 *');await expect(page.getByLabel('Start band time')).toHaveCount(0);await expect(page.getByLabel('End band time')).toHaveText('Band time: 21:15');await expect(dialog.getByText('End matches start',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Start solar event'}).selectOption('midnight');await page.getByLabel('Start offset minutes').fill('-300');await expect(page.getByLabel('Start resolved time')).toHaveText('20:00 * (previous day)');await expect(page.getByLabel('Start band time')).toHaveText('Band time: 00:00 *');
  await page.getByRole('combobox',{name:'Start solar event'}).selectOption('sunset');await page.getByLabel('Start offset minutes').fill('15');
  await page.screenshot({path:'../artifacts/dynamic-time-band-preview-popup.png',fullPage:true});expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.locator('.editing hsm-timeline .marker.start text')).toContainText(['21:15 *']);await expect(page.locator('.editing hsm-timeline .marker.end text')).toContainText(['21:15']);
});

test('only the solar endpoint is locked and fixed End clamps to resolved solar Start',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');await timeline.getByRole('button',{name:/Target start 12:00/}).focus();await page.keyboard.press('Enter');await page.getByRole('checkbox',{name:'Start solar event'}).check();await page.getByRole('combobox',{name:'Start solar event'}).selectOption('noon');await page.getByRole('button',{name:'Apply',exact:true}).click();
  const before=await timeline.evaluate((el:any)=>structuredClone(el.sub));
  const solar=timeline.getByRole('button',{name:/Target start 13:00/}),box=(await solar.locator('.hit-area').boundingBox())!,path=await solar.locator('path').getAttribute('d');await page.mouse.move(box.x+box.width/2,box.y+20);await page.mouse.down();await page.mouse.move(box.x+box.width/2+100,box.y+20,{steps:8});await page.mouse.up();await expect(solar.locator('path')).toHaveAttribute('d',path!);
  const fixed=timeline.getByRole('button',{name:/Setback end 16:00/}),end=(await fixed.locator('.hit-area').boundingBox())!,target=await pointAt(timeline,400,70);await page.mouse.move(end.x+end.width/2,end.y+20);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});await page.mouse.up();
  expect(await timeline.evaluate((el:any)=>el.sub.bands[1].end_minute)).toBe(780);expect(await timeline.evaluate((el:any)=>el.sub.bands[1].start_dynamic)).toEqual(before.bands[1].start_dynamic);await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('popup End selectors follow Start and immediately clamp earlier selections',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();await page.getByRole('button',{name:'＋ Add time band'}).click();await page.getByRole('checkbox',{name:'Start solar event'}).check();await page.getByRole('combobox',{name:'Start solar event'}).selectOption('sunset');
  await expectTime(page,'End','21:00');await setTime(page,'End','12:00');await expectTime(page,'End','21:00');
  await page.getByLabel('Start offset minutes').fill('15');await expectTime(page,'End','21:15');await setTime(page,'End','21:00');await expectTime(page,'End','21:15');
  await setTime(page,'End','22:00');await expectTime(page,'End','22:00');await page.getByLabel('Start offset minutes').fill('90');await expectTime(page,'End','22:30');
  await page.getByRole('combobox',{name:'Start solar event'}).selectOption('sunrise');await page.getByLabel('Start offset minutes').fill('1');await setTime(page,'End','05:01');await expectTime(page,'End','05:01');await expect(page.getByRole('combobox',{name:'End minute',exact:true}).locator('option[value="01"]')).toHaveCount(1);
  await page.screenshot({path:'../artifacts/popup-end-time-limited.png',fullPage:true});await page.getByRole('button',{name:'Apply',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');await expect(timeline.locator('.marker.start text')).toContainText(['05:01 *']);await expect(timeline.locator('.marker.end text')).toContainText(['05:01']);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('fixed-only popup End selectors preserve minimum five-minute duration on Apply',async({page})=>{
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');await timeline.getByRole('button',{name:/Target start 02:00/}).focus();await page.keyboard.press('Enter');await setTime(page,'Start','06:00');await expectTime(page,'End','06:05');await setTime(page,'End','03:00');await expectTime(page,'End','06:05');await expect(page.getByRole('combobox',{name:'End minute',exact:true}).locator('option[value="02"]')).toHaveCount(0);await setTime(page,'End','06:00');await expectTime(page,'End','06:05');await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(timeline.locator('.marker.start text')).toContainText(['06:00']);await expect(timeline.locator('.marker.end text')).toContainText(['06:05']);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('fixed bands cannot drag across resolved solar neighbours',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock,sub=m.saved.model.schedules[0].sub_schedules[0];sub.bands[0].end_minute=240;sub.bands.push({id:crypto.randomUUID(),start_minute:1200,end_minute:1260,start_dynamic:{event:'sunrise',offset:1},end_dynamic:{event:'sunrise',offset:61}});m.notify();});
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline');
  for(const [name,target] of [[/Setback end 04:00/,600],[/Target start 12:00/,120]] as const){const marker=timeline.getByRole('button',{name}),box=(await marker.locator('.hit-area').boundingBox())!,point=await pointAt(timeline,target,70);await page.mouse.move(box.x+box.width/2,box.y+20);await page.mouse.down();await page.mouse.move(point.x,point.y,{steps:8});await page.mouse.up();}
  expect(await timeline.evaluate((el:any)=>el.sub.bands.slice(0,2).map((b:any)=>[b.start_minute,b.end_minute]))).toEqual([[120,300],[365,960]]);await expect(timeline.locator('.marker text')).toContainText(['05:01 *','06:01 *']);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('optional sub-schedule names save, cancel and clear without losing numbered references',async({page})=>{
  const section=page.locator('section[aria-label="Schedule 1"]');
  await section.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  await page.getByRole('textbox',{name:'Sub-schedule name',exact:true}).fill('  Weekdays  ');
  await expect(section.getByRole('combobox',{name:'Choose sub-schedule'})).toContainText('1 · Weekdays');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(section.locator('.view-sub-number')).toHaveText('1 · Weekdays');
  await expect(section.locator('.view-sub-number')).toHaveClass(/named/);
  expect(await page.evaluate(()=>(window as any).mock.saved.model.schedules[0].sub_schedules[0].name)).toBe('Weekdays');
  await section.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  await page.getByRole('textbox',{name:'Sub-schedule name',exact:true}).fill('Cancelled');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Yes',exact:true}).click();
  await expect(section.locator('.view-sub-number')).toHaveText('1 · Weekdays');
  await section.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();
  await page.getByRole('textbox',{name:'Sub-schedule name',exact:true}).fill('   ');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(section.locator('.view-sub-number')).toHaveText('1');
  await expect(section.locator('.view-sub-number')).not.toHaveClass(/named/);
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(2);
});

test('named chooser overlays without reflow, pauses timeout and restores current selection',async({page})=>{
  await page.clock.pauseAt(new Date('2026-07-06T10:01:00Z'));
  await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[0];s.sub_schedules[0].name='Weekdays';s.sub_schedules[0].days=[0];s.sub_schedules.push({id:crypto.randomUUID(),name:'Weekend',days:[1,3],bands:[{id:crypto.randomUUID(),start_minute:480,end_minute:600}]},{id:crypto.randomUUID(),name:'Late shift',days:[4],bands:[{id:crypto.randomUUID(),start_minute:1020,end_minute:1080}]});m.notify();});
  const section=page.locator('section[aria-label="Schedule 1"]'),badge=section.locator('.view-sub-number'),timeline=section.locator('hsm-timeline');
  const before=await timeline.boundingBox();await badge.click();
  await expect(section.locator('.preview-options')).toBeVisible();expect(await timeline.boundingBox()).toEqual(before);await expect(page.getByRole('dialog')).toHaveCount(0);
  await section.locator('.preview-options button').filter({hasText:'Weekend'}).click();
  await expect(badge).toHaveText('2 · Weekend');await expect(section.locator('.view-day.previewed')).toHaveText(['TUE','THU']);
  await badge.click();await page.clock.runFor(15000);await expect(timeline.locator('.ghost-preview')).toHaveCount(1);
  await section.locator('.preview-options button').filter({hasText:'Weekdays'}).click();await expect(badge).toHaveText('1 · Weekdays');await expect(timeline.locator('.ghost-preview')).toHaveCount(0);
  await badge.click();await section.locator('.preview-options button').filter({hasText:'Late shift'}).click();await expect(badge).toHaveText('3 · Late shift');
  await page.clock.runFor(10001);await expect(badge).toHaveText('1 · Weekdays');
  await section.getByRole('button',{name:'Preview TUE sub-schedule'}).click();await section.getByRole('button',{name:'Show current MON sub-schedule'}).click();await expect(timeline.locator('.ghost-preview')).toHaveCount(0);
  await section.getByRole('button',{name:'Preview TUE sub-schedule'}).click();await section.locator('.view-day.unscheduled').first().click();await expect(timeline.locator('.ghost-preview')).toHaveCount(1);
  await timeline.click({position:{x:20,y:115}});await expect(timeline.locator('.ghost-preview')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('long-name preview dropdown stays within card and viewport after wrap, scroll and resize',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[2];s.sub_schedules=Array.from({length:7},(_,day)=>({id:crypto.randomUUID(),name:day===0?'Day 1':`Weekend Heating ${day+1} with a long reference`,days:[day],bands:[{id:crypto.randomUUID(),start_minute:480,end_minute:600}]}));m.notify();});
  const section=page.locator('section[aria-label="Schedule 3"]');
  for(const width of [390,320,1600]){
    await page.setViewportSize({width,height:844});await section.scrollIntoViewIfNeeded();
    const before=await section.locator('hsm-timeline').boundingBox();await section.locator('.view-sub-number').click();
    const menu=section.locator('.preview-options');await expect(menu).toBeVisible();expect(await section.locator('hsm-timeline').boundingBox()).toEqual(before);
    await expect.poll(()=>menu.evaluate(node=>{const r=node.getBoundingClientRect(),card=node.getRootNode() as ShadowRoot,c=card.querySelector('ha-card')!.getBoundingClientRect();return r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
    await expect(menu.locator('button')).toHaveCount(6);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await section.locator('.view-sub-number').click();await expect(menu).toHaveCount(0);
  }
  await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();await section.locator('.view-sub-number').click();
  await section.locator('.preview-options button').last().click();await expect(section.locator('.view-sub-number')).toContainText('7 · Weekend Heating 7');expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('named No Schedule previews keep status geometry stable and malformed names cannot break rendering',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[2];s.sub_schedules[0].name='Weekend Heating with a longer name';m.saved.model.schedules[0].sub_schedules[0].name=123;m.notify();});
  await expect(page.locator('section[aria-label="Schedule 1"] .view-sub-number')).toHaveText('1');
  const section=page.locator('section[aria-label="Schedule 3"]');await section.scrollIntoViewIfNeeded();const before=await section.locator('.empty').boundingBox();
  await section.getByRole('button',{name:'Preview TUE sub-schedule'}).click();await expect(section.locator('.view-sub-number')).toHaveText('1 · Weekend Heating with a longer name');expect(await section.locator('.empty').boundingBox()).toEqual(before);
});

test('unrelated hass updates do not render the card but names and availability still update',async({page})=>{
  await page.clock.pauseAt(new Date('2026-07-06T10:01:00Z'));
  await page.evaluate(async()=>{const card=document.querySelector('heating-schedule-manager-card') as any;card.hass=card.hass;await card.updateComplete;const render=card.render.bind(card);card.auditRenders=0;card.render=()=>{card.auditRenders++;return render();};for(let i=0;i<5;i++)card.hass={...card.hass,states:{...card.hass.states,'sensor.unrelated':{state:String(i),attributes:{friendly_name:'Unrelated'}}}};await card.updateComplete;});
  expect(await page.locator('heating-schedule-manager-card').evaluate((card:any)=>card.auditRenders)).toBe(0);
  await page.evaluate(()=>{const card=document.querySelector('heating-schedule-manager-card') as any;card.hass.states['climate.kitchen'].attributes.friendly_name='Renamed Kitchen';card.hass=card.hass;});await expect(page.locator('.entity span').first()).toContainText('Renamed Kitchen');
  await page.evaluate(()=>{const card=document.querySelector('heating-schedule-manager-card') as any;card.hass.states['climate.kitchen'].state='unavailable';card.hass=card.hass;});await expect(page.locator('.entity span').first()).toContainText('Unavailable');
  await page.evaluate(()=>{const card=document.querySelector('heating-schedule-manager-card') as any;card.hass.states['climate.kitchen'].state='heat';card.hass=card.hass;});await expect(page.locator('.entity span').first()).not.toContainText('Unavailable');
});

test('fixed Start of a mixed band clamps to solar End for pointer and arrow keys',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].sub_schedules[0].bands[1].end_dynamic={event:'noon',offset:0};m.notify();});
  await page.getByRole('button',{name:'Edit Schedule 1',exact:true}).click();const timeline=page.locator('.editing hsm-timeline'),marker=timeline.getByRole('button',{name:/Target start 12:00/});
  const box=(await marker.locator('.hit-area').boundingBox())!,target=await pointAt(timeline,1000,70);await page.mouse.move(box.x+box.width/2,box.y+20);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:8});await page.mouse.up();
  expect(await timeline.evaluate((el:any)=>el.sub.bands[1].start_minute)).toBe(780);
  await timeline.getByRole('button',{name:/Target start 13:00/}).focus();await page.keyboard.press('ArrowRight');expect(await timeline.evaluate((el:any)=>el.sub.bands[1].start_minute)).toBe(780);await page.keyboard.press('ArrowLeft');expect(await timeline.evaluate((el:any)=>el.sub.bands[1].start_minute)).toBe(775);expect(await timeline.evaluate((el:any)=>el.sub.bands[1].end_dynamic)).toEqual({event:'noon',offset:0});
});

test('category accordions count running schedules, collapse by header and keep shared-time layout consistent',async({page})=>{
  await page.clock.setSystemTime(new Date('2026-07-06T12:00:00Z'));
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].category='Heating';m.saved.model.schedules[1].category='Heating';m.saved.model.schedules[2].category='Bedrooms';m.notify();});
  const heating=page.locator('.category-group[data-category="category:Heating"]'),bedrooms=page.locator('.category-group[data-category="category:Bedrooms"]');
  await expect(heating.locator('.category-activity')).toHaveText('2 active schedules');await expect(heating.locator('.category-heading')).toHaveClass(/running/);await expect(bedrooms.locator('.category-activity')).toHaveText('');await expect(bedrooms.locator('.category-heading')).not.toHaveClass(/running/);
  await expect(heating.locator('.category-title')).toHaveCSS('text-align','right');await expect(heating.locator('.category-activity')).toHaveCSS('text-align','left');
  const original=await page.evaluate(()=>(window as any).mock.saved.model.schedules.map((s:any)=>s.id));
  await heating.locator('.category-heading').click();await expect(heating.locator('section')).toHaveCount(0);await expect(heating.locator('.category-heading')).toHaveAttribute('aria-expanded','false');await expect(heating.locator('.category-arrow svg')).not.toHaveClass('expanded');
  await heating.locator('.category-heading').focus();await page.keyboard.press('Enter');await expect(heating.locator('section')).toHaveCount(2);
  await page.getByRole('button',{name:'Hide all categories'}).click();await expect(page.locator('section')).toHaveCount(0);await expect(page.locator('.category-heading')).toHaveCount(2);await expect(page.locator('.shared-time')).toHaveCount(0);
  await expect(page.locator('.category-controls button')).toHaveText(['Show all']);await heating.locator('.category-heading').click();await expect(page.locator('.category-controls button')).toHaveText(['Hide all']);await page.getByRole('button',{name:'Hide all categories'}).click();
  await page.getByRole('button',{name:'Show all categories'}).click();await expect(page.locator('section')).toHaveCount(3);await expect(page.locator('.shared-time-label')).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).mock.saved.model.schedules.map((s:any)=>s.id))).toEqual(original);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await page.getByRole('button',{name:'Disable Schedule 1',exact:true}).click();await expect(heating.locator('.category-activity')).toHaveText('1 active schedule');
  await enableAway(page);await expect(heating.locator('.category-activity')).toHaveText('');
});

test('Area, Floor and running filters combine, hide empty categories and cancel or clear locally',async({page})=>{
  await page.clock.setSystemTime(new Date('2026-07-06T12:00:00Z'));
  await page.evaluate(()=>{const m=(window as any).mock;m.saved.model.schedules[0].category='Heating';m.saved.model.schedules[1].category='Heating';m.saved.model.schedules[2].category='Bedrooms';m.notify();});
  const filter=page.getByRole('button',{name:'Filter schedules'});
  await filter.click();await expect(page.getByRole('combobox',{name:'Sort schedules'})).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Select all areas'}).uncheck();await page.getByRole('checkbox',{name:'Lounge',exact:true}).check();await page.getByRole('checkbox',{name:'Inactive now',exact:true}).uncheck();await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(page.locator('section')).toHaveCount(1);await expect(page.locator('section')).toHaveAttribute('aria-label','Schedule 1');await expect(page.locator('.category-title')).toHaveText(['Heating']);
  await filter.click();await page.getByRole('checkbox',{name:'Select all floors'}).uncheck();await page.getByRole('checkbox',{name:'Upper floor',exact:true}).check();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('section')).toHaveCount(1);
  await filter.click();await page.getByRole('checkbox',{name:'Select all floors'}).uncheck();await page.getByRole('checkbox',{name:'Upper floor',exact:true}).check();await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.locator('.category-group')).toHaveCount(0);await expect(page.getByText('No schedules match this filter.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear schedule filters'}).click();await expect(page.locator('section')).toHaveCount(3);
  await filter.click();await page.getByRole('checkbox',{name:'Active now',exact:true}).uncheck();await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.locator('section')).toHaveCount(1);await expect(page.locator('.category-title')).toHaveText(['Bedrooms']);
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('preview never changes running counts and editing survives category collapse or excluded filters',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[0];s.category='Heating';s.sub_schedules[0].days=[0];s.sub_schedules.push({id:crypto.randomUUID(),name:'Tuesday',days:[1],bands:[{id:crypto.randomUUID(),start_minute:480,end_minute:600}]});m.notify();});
  const group=page.locator('.category-group[data-category="category:Heating"]');await expect(group.locator('.category-activity')).toHaveText('');
  await group.getByRole('button',{name:'Preview TUE sub-schedule'}).click();await expect(group.locator('.ghost-preview')).toHaveCount(1);await expect(group.locator('.category-activity')).toHaveText('');
  await group.getByRole('button',{name:'Edit Schedule 1'}).click();await page.getByRole('textbox',{name:'Sub-schedule name',exact:true}).fill('Retained draft');
  await group.locator('.category-heading').click();await expect(group.locator('section')).toHaveCount(0);await group.locator('.category-heading').click();await expect(page.getByRole('textbox',{name:'Sub-schedule name',exact:true})).toHaveValue('Retained draft');
  await page.getByRole('button',{name:'Filter schedules'}).click();await page.getByRole('checkbox',{name:'Select all categories'}).uncheck();await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.getByRole('button',{name:'Save',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('large entity lists show six entries and scroll by controls and keyboard on desktop and phone',async({page})=>{
  await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[0],card=document.querySelector('heating-schedule-manager-card') as any;for(let i=0;i<10;i++){const key=crypto.randomUUID(),entity_id=`climate.office_${i}`;m.saved.model.entity_settings[key]={entity_id,registry_id:null,setback:{value:13,unit:'°C'}};card.hass.states[entity_id]={state:'heat',attributes:{friendly_name:`Office ${i+1}`}};s.entities.push({entity_key:key,target:{value:21,unit:'°C'}});}m.notify();});
  const section=page.locator('section[aria-label="Schedule 1"]'),list=section.locator('.entity-list');
  for(const width of [1600,390]){
    await page.setViewportSize({width,height:1000});await section.scrollIntoViewIfNeeded();await expect(list).toHaveClass(/overflowing/);
    await expect.poll(()=>list.evaluate((node:HTMLElement)=>{const rows=Array.from(node.querySelectorAll('.entity')),rect=node.getBoundingClientRect();return rows.filter(row=>{const r=row.getBoundingClientRect();return r.top>=rect.top-1&&r.bottom<=rect.bottom+1;}).length;})).toBe(6);
    const before=(await section.boundingBox())!;
    await section.getByRole('button',{name:'Scroll Schedule 1 entities down'}).click();await expect.poll(()=>list.evaluate(node=>node.scrollTop)).toBeGreaterThan(20);
    expect((await section.boundingBox())!.height).toBeCloseTo(before.height,0);
    await section.getByRole('button',{name:'Scroll Schedule 1 entities up'}).click();await expect.poll(()=>list.evaluate(node=>node.scrollTop)).toBeLessThan(1);
    await list.focus();
    // Wait for native keyboard scrolling to finish before resetting/resizing.
    // Observing an intermediate offset does not mean the animation has ended.
    await list.evaluate(node=>{node.dataset.keyboardScrollFinished='false';node.addEventListener('scrollend',()=>{node.dataset.keyboardScrollFinished='true';},{once:true});});
    await page.keyboard.press('PageDown');await expect.poll(()=>list.evaluate(node=>node.scrollTop)).toBeGreaterThan(20);
    await expect(list).toHaveAttribute('data-keyboard-scroll-finished','true');
    await list.evaluate(node=>{node.scrollTo({top:0,behavior:'instant'});});
    await expect.poll(()=>list.evaluate(node=>node.scrollTop)).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test.describe('phone entity scrolling',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}});
  test('touch scrolls the bounded entity list without moving the timeline or writing data',async({page})=>{
    await page.evaluate(()=>{const m=(window as any).mock,s=m.saved.model.schedules[0],card=document.querySelector('heating-schedule-manager-card') as any;for(let i=0;i<10;i++){const key=crypto.randomUUID(),entity_id=`climate.touch_${i}`;m.saved.model.entity_settings[key]={entity_id,registry_id:null,setback:{value:13,unit:'°C'}};card.hass.states[entity_id]={state:'heat',attributes:{friendly_name:`Touch entity ${i+1}`}};s.entities.push({entity_key:key,target:{value:21,unit:'°C'}});}m.notify();});
    const section=page.locator('section[aria-label="Schedule 1"]'),list=section.locator('.entity-list');await list.scrollIntoViewIfNeeded();
    const box=(await list.boundingBox())!,before=await section.locator('hsm-timeline').boundingBox(),session=await page.context().newCDPSession(page);
    const x=box.x+box.width/2,y=box.y+box.height-15;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=5;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*15}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>list.evaluate(node=>node.scrollTop)).toBeGreaterThan(20);
    expect(await section.locator('hsm-timeline').boundingBox()).toEqual(before);expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  });
});

test('new schedule creation works without native randomUUID and opens collapsed filtered categories',async({page})=>{
  await page.getByRole('button',{name:'Hide all categories'}).click();
  await page.getByRole('button',{name:'Filter schedules'}).click();await page.getByRole('checkbox',{name:'Select all statuses'}).uncheck();await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.evaluate(()=>{Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});});
  await page.getByRole('button',{name:'＋ Schedule',exact:true}).click();await page.getByRole('textbox',{name:'Schedule name'}).fill('Phone schedule');await page.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(page.locator('section.editing')).toBeVisible();await expect(page.getByRole('button',{name:'＋ Entity',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
  const ids=await page.locator('heating-schedule-manager-card').evaluate((card:any)=>[card.draft.section.id,card.draft.section.sub_schedules[0].id]);
  expect(ids[0]).not.toBe(ids[1]);for(const id of ids)expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('time-band markers stagger only below a 15-minute duration on desktop and tablet',async({page})=>{
  for(const width of [1600,1024,768]){
    await page.setViewportSize({width,height:900});
    for(const duration of [30,20,15,10]){
      await page.evaluate(duration=>{const m=(window as any).mock;m.saved.model.schedules[0].sub_schedules[0].bands=[{id:'threshold-band',start_minute:720,end_minute:720+duration}];m.notify();},duration);
      const tops=await page.locator('section[aria-label="Schedule 1"] hsm-timeline').evaluate((timeline:any)=>['.marker.start .hit-area','.marker.end .hit-area'].map(selector=>Number(timeline.shadowRoot.querySelector(selector).getAttribute('y'))));
      expect(tops[1]>tops[0]).toBe(duration<15);
    }
  }
  expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
});

test('Away popup cancels without writes, enables indefinitely and allows immediate return',async({page})=>{
  const away=page.getByRole('button',{name:'Away',exact:true});
  await away.click();await expect(page.getByRole('radio',{name:'Away now',exact:true})).toBeChecked();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.evaluate(()=>(window as any).mock.writes.length)).toBe(0);
  await enableAway(page);await expect(away).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>(window as any).mock.writes.at(-1))).toMatchObject({away:true,until:null});
  await away.click();await page.getByRole('button',{name:'Turn Away off',exact:true}).click();await expect(away).toHaveAttribute('aria-pressed','false');await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Away until sends HA-local date/time, displays the saved return and preserves it on reload',async({browser})=>{
  const context=await browser.newContext({timezoneId:'America/New_York',viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();
  await page.clock.install({time:new Date('2026-07-06T10:00:00Z')});await page.goto('/');await page.getByRole('button',{name:'Away',exact:true}).click();await page.getByRole('radio',{name:'Away until',exact:true}).check();
  await expect(page.getByText('Times use Europe/London.',{exact:true})).toBeVisible();await page.getByLabel('Away return date and time').fill('2026-07-07T12:30');await page.getByRole('button',{name:'Enable Away',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).mock.writes.at(-1))).toMatchObject({away:true,until:'2026-07-07T12:30'});await expect(page.locator('.away-return')).toContainText('12:30');
  await page.getByRole('button',{name:'Away',exact:true}).click();await expect(page.getByRole('radio',{name:'Away until',exact:true})).toBeChecked();await expect(page.getByLabel('Away return date and time')).toHaveValue('2026-07-07T12:30');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.evaluate(async()=>{const card=document.querySelector('heating-schedule-manager-card') as any;await card.load();});await expect(page.locator('.away-return')).toContainText('12:30');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await context.close();
});

test('Away shows progress while saving and closes after commit while device updates continue',async({page})=>{
  await page.evaluate(()=>{const card=document.querySelector('heating-schedule-manager-card') as any,original=card.hass.callWS;card.hass={...card.hass,callWS:async(message:any)=>{if(message.type.endsWith('/set_away')){await new Promise<void>(resolve=>{(window as any).releaseAway=resolve;});(window as any).mock.saved.applying=true;}return original(message);}};});
  await page.getByRole('button',{name:'Away',exact:true}).click();await page.getByRole('button',{name:'Enable Away',exact:true}).click();await expect(page.getByText('Setting Away…',{exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).releaseAway());await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('Updating devices…',{exact:true})).toBeVisible();
  await page.evaluate(()=>{(window as any).mock.saved.applying=false;(window as any).mock.notify();});await expect(page.getByText('Updating devices…',{exact:true})).toHaveCount(0);
});

test('loading the card through two resource URLs keeps existing tags and one card-picker entry',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const result=await page.evaluate(async()=>{
    const card=customElements.get('scheduling-manager-card'),timeline=customElements.get('hsm-timeline');
    const secondUrl='/card.js?second-resource';await import(secondUrl);
    return {sameCard:card===customElements.get('scheduling-manager-card'),sameTimeline:timeline===customElements.get('hsm-timeline'),entries:(window as any).customCards.filter((item:any)=>item.type==='scheduling-manager-card').length,legacy:!!customElements.get('heating-schedule-manager-card')};
  });
  expect(result).toEqual({sameCard:true,sameTimeline:true,entries:1,legacy:true});expect(errors).toEqual([]);
  await expect(page.getByRole('button',{name:'＋ Schedule',exact:true})).toBeVisible();
});
