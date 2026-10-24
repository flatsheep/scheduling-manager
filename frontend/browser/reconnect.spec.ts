import {test,expect} from '@playwright/test';

test('initial startup waits without a raw command error and recovers automatically',async({page})=>{
  await page.goto('/?starting');
  const card=page.locator('scheduling-manager-card');
  await expect(card).toContainText('Loading Scheduling Manager');
  await expect(card.getByRole('status')).toContainText('Retrying automatically');
  await expect(card).not.toContainText('Unknown command');
  await page.evaluate(()=>{(window as any).mock.unavailable=false;});
  await expect(card).toContainText('Schedule 1');
  await expect(card).not.toContainText('Retrying automatically');
  await expect.poll(()=>page.evaluate(()=>(window as any).mock?.subscriptions.length??0)).toBe(1);
});

test('both retired manual resource URLs and automatic loader share the current card',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  // The real HA frontend defines this element before its extra modules run.
  await page.addInitScript(()=>{customElements.define('home-assistant',class extends HTMLElement{});});
  await page.goto('/legacy-fixture');
  await expect(page.locator('scheduling-manager-card')).toContainText('Schedule 1');
  await expect.poll(()=>page.evaluate(()=>(window as any).mock?.subscriptions.length??0)).toBe(1);
  expect(errors).toEqual([]);
});

test('same connection recovers after HA restarts before commands are registered',async({page})=>{
  await page.goto('/');
  const card=page.locator('scheduling-manager-card');
  await expect.poll(()=>page.evaluate(()=>(window as any).mock?.subscriptions.length??0)).toBe(1);
  await page.evaluate(()=>{
    const mock=(window as any).mock;
    mock.connectionEvent('disconnected');mock.unavailable=true;mock.connectionEvent('ready');
  });
  await expect(card).toContainText('Retrying automatically');
  await expect(card).not.toContainText('Unknown command');
  await page.evaluate(()=>{
    const mock=(window as any).mock;
    mock.saved.model.schedules[0].name='Recovered schedule';mock.unavailable=false;
  });
  await expect(card).toContainText('Recovered schedule');
  await expect(card).not.toContainText('Retrying automatically');
  await expect.poll(()=>page.evaluate(()=>(window as any).mock?.subscriptions.length??0)).toBe(1);
  await page.evaluate(()=>{
    const mock=(window as any).mock;mock.saved.model.schedules[0].name='Live update after restart';mock.notify();
  });
  await expect(card).toContainText('Live update after restart');
  expect(await page.evaluate(()=>(window as any).mock.writes)).toEqual([]);
});

test('failed subscription is retried and detached cards stop recovery',async({page})=>{
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>(window as any).mock?.subscriptions.length??0)).toBe(1);
  await page.evaluate(()=>{
    const mock=(window as any).mock;mock.subscribeUnavailable=true;mock.connectionEvent('ready');
  });
  await expect(page.locator('scheduling-manager-card')).toContainText('Retrying automatically');
  await page.evaluate(()=>{(window as any).mock.subscribeUnavailable=false;});
  await expect(page.locator('scheduling-manager-card')).not.toContainText('Retrying automatically');
  await expect.poll(()=>page.evaluate(()=>(window as any).mock?.subscriptions.length??0)).toBe(1);
  await page.evaluate(()=>{
    const mock=(window as any).mock;mock.unavailable=true;mock.connectionEvent('ready');
  });
  await expect(page.locator('scheduling-manager-card')).toContainText('Retrying automatically');
  const reads=await page.evaluate(()=>{
    document.querySelector('scheduling-manager-card')!.remove();return (window as any).mock.reads;
  });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>(window as any).mock.reads)).toBe(reads);
  expect(await page.evaluate(()=>(window as any).mock.connectionListeners())).toBe(0);
  expect(await page.evaluate(()=>(window as any).mock.subscriptions.length)).toBe(0);
});
