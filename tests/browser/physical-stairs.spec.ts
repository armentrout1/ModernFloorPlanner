import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import type { PhysicalDraft } from '../../client/src/features/physical-draft/state';
import { evaluateQuantities, createQuantitySnapshot, verifyQuantitySnapshot } from '../../shared/quantities/snapshot';

const rooms = (p: Page) => p.getByTestId('physical-room-inspector');
const stairs = (p: Page) => p.getByTestId('physical-stair-inspector');
const surfaces = (p: Page) => p.getByTestId('physical-surface-opening-inspector');
const level = (p: Page) => p.getByRole('combobox', { name: 'Editing level', exact: true });
const roomField = (p: Page, label: string) => rooms(p).getByLabel(new RegExp('^' + label + ' [(](ft|m)[)]$'));
const takeoff = (p: Page) => p.getByTestId('takeoff-panel');
const card = (p: Page, output: string) => p.getByTestId('takeoff-output-' + output);
const total = (p: Page, output: string) => card(p, output).getByTestId('takeoff-total');
const drawing = (p: Page) => p.getByRole('region', { name: 'Physical drawing', exact: true });
const history = (p: Page) => p.getByRole('group', { name: 'Committed edit history', exact: true, includeHidden: true });
const undo = (p: Page) => history(p).getByRole('button', { name: /^Undo(?: |$)/, includeHidden: true });
const redo = (p: Page) => history(p).getByRole('button', { name: /^Redo(?: |$)/, includeHidden: true });
const frames = (p: Page) => p.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const AT = '2026-09-09T00:00:00.000Z';

async function registry(p: Page) {
  await expect.poll(async () => parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY)).status).toBe('recovered');
  const parsed = parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY));
  if (parsed.status !== 'recovered') throw new Error('Expected supported validated recovery');
  return parsed.registry;
}
async function selected(p: Page): Promise<PhysicalDraft> {
  const value = await registry(p), draft = value.drafts.find(d => d.id === value.selectedDraftId);
  if (!draft) throw new Error('No selected draft');
  return draft;
}
function contract(d: PhysicalDraft) {
  expect(d.document.schemaVersion).toBe(4);
  return (d.document as Extract<PhysicalDraft['document'], { schemaVersion: 4 }>).stairsContract;
}
function durable(d: PhysicalDraft) { const { localEditRevision, levelView, ...rest } = d; return rest; }
async function commit(input: Locator, text: string) { await input.fill(text); await input.press('Enter'); await input.press('Tab'); }
async function openInspector(p: Page) {
  if ((p.viewportSize()?.width ?? 1600) < 1024) {
    const dialog = p.getByRole('dialog', { name: /^Edit / });
    const trigger = p.getByRole('button', { name: /^Edit selected / });
    await expect.poll(async () => await dialog.isVisible() || await trigger.isVisible()).toBe(true);
    if (!await dialog.isVisible()) await trigger.click();
  }
  await expect(p.getByTestId('physical-inspector')).toBeVisible();
}
async function closeInspector(p: Page) {
  const dialog = p.getByRole('dialog', { name: /^Edit / });
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Close inspector', exact: true }).click(); await expect(dialog).toBeHidden();
  }
}
async function switchLevel(p: Page, id: string) {
  await closeInspector(p); await level(p).selectOption(id);
  await expect(p.getByTestId('physical-view')).toHaveAttribute('data-active-level-id', id);
}
async function quick(p: Page) { await closeInspector(p); await p.getByRole('tab', { name: 'Quick Rooms', exact: true }).click(); }
async function showDrawing(p: Page) {
  await closeInspector(p); await p.getByRole('tab', { name: 'Drawing', exact: true }).click();
  await drawing(p).getByRole('button', { name: 'Fit drawing', exact: true }).click(); await frames(p);
}
async function renameLevel(p: Page, text: string) {
  await p.getByLabel('Level name', { exact: true }).fill(text); await p.getByRole('button', { name: 'Rename level', exact: true }).click();
}
async function addRoom(p: Page, name: string, length: string, height: string) {
  await quick(p); await p.getByRole('button', { name: 'Add room', exact: true }).click();
  await rooms(p).getByLabel('Room name', { exact: true }).fill(name); await rooms(p).getByLabel('Room name', { exact: true }).press('Enter');
  for (const [label, text] of [['Length', length], ['Width', '10 ft'], ['Ceiling height', height]]) await commit(roomField(p, label), text);
  await rooms(p).getByLabel('Ceiling model', { exact: true }).selectOption('flat');
  await rooms(p).getByLabel('Wall model', { exact: true }).selectOption('vertical-uniform');
  return (await selected(p)).document.rooms.at(-1)!;
}
async function work(p: Page, output: string, label: string) {
  await takeoff(p).getByRole('checkbox', { name: 'Measure ' + label, exact: true }).check();
  await takeoff(p).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output);
  await takeoff(p).getByRole('button', { name: 'All levels’ current targets', exact: true }).click();
}
async function amount(p: Page, output: string, name: string, value: number) {
  await expect(total(p, output).locator('[data-amount="' + name + '"]')).toHaveText(value.toFixed(2) + ' sq ft');
}
async function totals(p: Page, floor: number, ceiling: number, walls = 802) {
  await amount(p, 'floor-area', 'net', floor); await amount(p, 'ceiling-area', 'net', ceiling); await amount(p, 'gross-wall-area', 'net', walls);
}
// Main fixtures are created and changed only through the real compiled UI.
// Recovery reads below are read-only and pass the production validator.
async function building(p: Page) {
  await p.setViewportSize({ width: 1600, height: 1000 }); await p.goto('/physical-draft');
  await p.getByRole('button', { name: 'New building draft', exact: true }).click();
  const basement = (await selected(p)).levelView!.activeLevelId; await renameLevel(p, 'Basement');
  const alpha = await addRoom(p, 'Basement room', '12 ft', '8 ft');
  await p.getByRole('button', { name: 'Add level', exact: true }).click();
  const main = (await selected(p)).levelView!.activeLevelId; await renameLevel(p, 'Main floor');
  const beta = await addRoom(p, 'Main room', '15 ft', '9 ft');
  for (const [output, label] of [['floor-area', 'Floor area'], ['ceiling-area', 'Flat ceiling area'], ['gross-wall-area', 'Gross wall area']]) await work(p, output, label);
  await totals(p, 270, 270); await switchLevel(p, basement); const source = await selected(p);
  await p.getByRole('button', { name: 'Enable stairs and surface openings', exact: true }).click();
  const upgraded = await selected(p); expect(upgraded.id).not.toBe(source.id); expect(upgraded.document.schemaVersion).toBe(4);
  expect((await registry(p)).drafts.find(d => d.id === source.id)).toEqual(source);
  expect(upgraded.document.rooms).toEqual(source.document.rooms); await totals(p, 270, 270);
  await expect(rooms(p)).toHaveAttribute('data-room-id', alpha.id);
  return { basement, main, alpha, beta, source };
}
async function parity(browser: Browser, draft: PhysicalDraft) {
  const expected = await evaluateQuantities(draft.document, draft.request); expect(expected.ok).toBe(true);
  if (!expected.ok) throw new Error(JSON.stringify(expected.errors));
  const context = await browser.newContext(), p = await context.newPage(), errors: string[] = [];
  p.on('pageerror', e => errors.push(e.message));
  try {
    await p.goto('http://127.0.0.1:4174/'); await expect(p.getByText('Shared quantity engine ready')).toBeVisible();
    const actual = await p.evaluate(({ document, request }) => (window as any).mfpParity.evaluate(document, request), { document: draft.document, request: draft.request });
    expect(actual.ok).toBe(true); expect(actual.evaluation).toEqual(expected.evaluation); expect(errors).toEqual([]);
    return expected.evaluation;
  } finally { await context.close(); }
}
const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); writes.set(page, []); page.on('pageerror', e => errors.get(page)!.push(e.message));
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.get(page)!.push(r.method() + ' ' + r.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

const measure = (scope: Locator, label: string) => scope.getByLabel(new RegExp('^' + label + ' [(](ft|m)[)]$'));
async function selectStair(p: Page, id: string) {
  await closeInspector(p); await p.getByTestId('physical-stair-list-' + id).click(); await openInspector(p);
  await expect(stairs(p)).toHaveAttribute('data-stair-id', id);
}
async function selectSurface(p: Page, id: string) {
  await closeInspector(p); await p.getByTestId('physical-surface-opening-list-' + id).click(); await openInspector(p);
  await expect(surfaces(p)).toHaveAttribute('data-surface-opening-id', id);
}
async function createStair(p: Page, f: Awaited<ReturnType<typeof building>>, connect = true) {
  await switchLevel(p, f.basement); await expect(p.getByRole('button', { name: 'Add stair', exact: true })).toBeEnabled(); await p.getByRole('button', { name: 'Add stair', exact: true }).click(); await openInspector(p);
  const id = (await stairs(p).getAttribute('data-stair-id'))!;
  await stairs(p).getByLabel('Stair name', { exact: true }).fill('Basement to Main'); await stairs(p).getByLabel('Stair name', { exact: true }).press('Enter');
  for (const [label, value] of [['Stair width', '3 ft'], ['Horizontal run', '6 ft'], ['Lower X', '4 ft'], ['Lower Y', '1 ft']]) await commit(measure(stairs(p), label), value);
  if (connect) {
    await stairs(p).getByRole('combobox', { name: 'Upper level', exact: true }).selectOption(f.main);
    for (const [label, value] of [['Upper X', '4 ft'], ['Upper Y', '1 ft']]) await commit(measure(stairs(p), label), value);
  }
  return id;
}
async function noDeduction(p: Page, roles: Array<'lower'|'upper'> = ['lower','upper']) {
  for (const role of roles) for (const surface of ['floor','ceiling'])
    await stairs(p).getByRole('combobox', { name: role[0].toUpperCase() + role.slice(1) + ' ' + surface + ' impact', exact: true }).selectOption('no-deduction');
}
async function landing(p: Page, role: 'lower'|'upper') {
  await stairs(p).getByRole('button', { name: 'Add ' + role + ' landing', exact: true }).click();
  const box = stairs(p).getByTestId('physical-landing-' + role);
  for (const [label,value] of [['Landing width','3 ft'],['Landing depth','3 ft'],['Landing X','1 ft'],['Landing Y','1 ft']]) await commit(measure(box,label),value);
}
async function createSurface(p: Page, targetLevel: string, surface: 'floor'|'ceiling', name: string, x = '4 ft') {
  await switchLevel(p,targetLevel); await p.getByRole('button',{name:'Add surface opening',exact:true}).click(); await openInspector(p);
  const id=(await surfaces(p).getAttribute('data-surface-opening-id'))!;
  await surfaces(p).getByLabel('Surface opening name',{exact:true}).fill(name); await surfaces(p).getByLabel('Surface opening name',{exact:true}).press('Enter');
  await surfaces(p).getByRole('combobox',{name:'Affected surface',exact:true}).selectOption(surface);
  for(const [label,value] of [['Opening width','3 ft'],['Opening length','6 ft'],['Opening X',x],['Opening Y','1 ft']]) await commit(measure(surfaces(p),label),value);
  return id;
}
async function deduct(p: Page, stairId: string, targetLevel: string, role: 'lower'|'upper', surface: 'floor'|'ceiling', openingId: string) {
  await switchLevel(p,targetLevel); await selectStair(p,stairId);
  const label=role[0].toUpperCase()+role.slice(1)+' '+surface;
  await stairs(p).getByRole('combobox',{name:label+' impact',exact:true}).selectOption('deduct');
  await stairs(p).getByRole('combobox',{name:label+' opening',exact:true}).selectOption(openingId);
}
async function roomNet(p: Page, output: string, roomId: string, value: number) {
  const details=card(p,output).locator('details');
  if(await details.getAttribute('open')===null) await details.locator('summary').click();
  await expect(card(p,output).locator('[data-target-id*="'+roomId+'"]').locator('[data-amount="net"]').first()).toHaveText(value.toFixed(2)+' sq ft');
}

test('UI straight stair and landing link both levels while explicit surface holes alone change finish quantities', async ({page}) => {
  test.setTimeout(120_000); const f=await building(page), stairId=await createStair(page,f);
  const created=await selected(page); expect(contract(created).stairs).toHaveLength(1);
  expect(contract(created).stairs[0].totalRise.state).toBe('unknown');
  await landing(page,'lower'); await noDeduction(page); await totals(page,270,270);
  const placed=await selected(page), assembly=contract(placed).stairs[0];
  expect(assembly.landings.lower).not.toBeNull(); expect(assembly.landings.lower!.id).not.toBe(stairId);
  expect(assembly.endpoints.lower).toMatchObject({state:'modeled',levelId:f.basement,roomId:f.alpha.id});
  expect(assembly.endpoints.upper).toMatchObject({state:'modeled',levelId:f.main,roomId:f.beta.id});
  for(const [id,role,direction,destination,file] of [[f.basement,'lower','UP','Main floor','lower'],[f.main,'upper','DOWN','Basement','upper']] as const) {
    await switchLevel(page,id); await showDrawing(page); await selectStair(page,stairId);
    const symbol=page.getByTestId('physical-stair-'+stairId+'-'+role);
    await expect(symbol).toHaveAttribute('data-stair-id',stairId); await expect(symbol).toContainText(direction+' to '+destination);
    await expect(page.getByTestId('physical-stair-'+stairId+'-'+(role==='lower'?'upper':'lower'))).toHaveCount(0);
    await expect(measure(stairs(page),'Stair width')).toHaveValue(/3(?: ft)?/);
    await expect(measure(stairs(page),'Horizontal run')).toHaveValue(/6(?: ft)?/);
    expect(contract(await selected(page)).stairs).toEqual(contract(placed).stairs);
    await page.screenshot({path:test.info().outputPath('stairs-desktop-'+file+'.png'),fullPage:true});
  }
  const floorId=await createSurface(page,f.main,'floor','Main floor opening'); await deduct(page,stairId,f.main,'upper','floor',floorId);
  await totals(page,252,270); await roomNet(page,'floor-area',f.beta.id,132); await roomNet(page,'floor-area',f.alpha.id,120);
  const ceilingId=await createSurface(page,f.basement,'ceiling','Basement ceiling opening'); await deduct(page,stairId,f.basement,'lower','ceiling',ceilingId);
  await totals(page,252,252); await roomNet(page,'ceiling-area',f.alpha.id,102); await roomNet(page,'ceiling-area',f.beta.id,150);
  await takeoff(page).getByRole('combobox',{name:'Configure work',exact:true}).selectOption('floor-area');
  await commit(takeoff(page).getByLabel('Waste percentage',{exact:true}),'10');
  const request=(await selected(page)).request;
  for(const id of [f.main,f.basement]) { await switchLevel(page,id); await totals(page,252,252); await amount(page,'floor-area','effective-deductions',18); await amount(page,'floor-area','allowance',25.2); await amount(page,'floor-area','adjusted',277.2); expect((await selected(page)).request).toEqual(request); }
  expect((await registry(page)).drafts.find(d=>d.id===f.source.id)).toEqual(f.source);
  expect((await selected(page)).document.openings).toEqual(f.source.document.openings);
  await card(page,'floor-area').screenshot({path:test.info().outputPath('stairs-takeoff-18sqft.png')});
});

test('endpoint roles remain explicit through shared edits, level renaming and unresolved destinations',async({page})=>{
  test.setTimeout(85_000);const f=await building(page),id=await createStair(page,f,false);await noDeduction(page,['lower']);await totals(page,270,270);
  let assembly=contract(await selected(page)).stairs[0];expect(assembly.endpoints.upper.state).toBe('unresolved');expect(assembly.totalRise.state).toBe('unknown');
  await showDrawing(page);await expect(page.getByTestId('physical-stair-'+id+'-lower')).toContainText('UP to destination not modeled');
  await selectStair(page,id);await stairs(page).getByRole('combobox',{name:'Upper level',exact:true}).selectOption(f.main);
  await commit(measure(stairs(page),'Upper X'),'4 ft');await commit(measure(stairs(page),'Upper Y'),'1 ft');await noDeduction(page);
  const original=await selected(page);await stairs(page).getByRole('combobox',{name:'Upper level',exact:true}).selectOption(f.basement);
  await expect(page.getByRole('alert').first()).toContainText(/different|same level/i);expect(contract(await selected(page))).toEqual(contract(original));
  await switchLevel(page,f.main);await renameLevel(page,'Ground floor');await page.getByRole('button',{name:'Move level up',exact:true}).click();
  await quick(page);await page.getByRole('button',{name:'Main room',exact:true}).click();await commit(roomField(page,'Ceiling height'),'10 ft');
  await selectStair(page,id);expect(contract(await selected(page)).stairs[0].totalRise.state).toBe('unknown');
  await commit(measure(stairs(page),'Stair width'),'4 ft');const widened=contract(await selected(page)).stairs[0];expect(widened.width.valueMm).toBeCloseTo(1219.2,9);
  await stairs(page).getByRole('button',{name:'Go to lower endpoint',exact:true}).click();await expect(level(page)).toHaveValue(f.basement);await openInspector(page);
  await expect(measure(stairs(page),'Stair width')).toHaveValue(/4(?: ft)?/);await showDrawing(page);await expect(page.getByTestId('physical-stair-'+id+'-lower')).toContainText('UP to Ground floor');
  const before=await selected(page);await selectStair(page,id);await commit(measure(stairs(page),'Horizontal run'),'30 ft');
  expect(contract(await selected(page)).stairs[0].endpoints).toEqual(contract(before).stairs[0].endpoints);
  await expect(stairs(page)).toContainText(/fit|outside|inside|bounds|correction/i);
  const doc=(await selected(page)).document;expect(doc.buildingLevels.levels.every(l=>l.finishedFloorElevation.state==='unknown')).toBe(true);
});

test('surface readiness is local and overlapping internal rectangles use one union in browser and Node',async({page,browser})=>{
  test.setTimeout(100_000);const f=await building(page),id=await createStair(page,f);await noDeduction(page);
  const first=await createSurface(page,f.main,'floor','First floor cut','4 ft');await deduct(page,id,f.main,'upper','floor',first);await totals(page,252,270);
  await selectSurface(page,first);await commit(measure(surfaces(page),'Opening length'),'');
  await expect(total(page,'floor-area')).toContainText(/unavailable/i);await amount(page,'ceiling-area','net',270);await amount(page,'gross-wall-area','net',802);
  await expect(card(page,'floor-area').getByTestId('takeoff-subtotal').locator('[data-amount="net"]')).toHaveText('120.00 sq ft');
  await expect(card(page,'floor-area')).toContainText('270.00 sq ft');
  await commit(measure(surfaces(page),'Opening length'),'6 ft');await totals(page,252,270);
  const beforeInvalid=await selected(page);await commit(measure(surfaces(page),'Opening X'),'14 ft');
  await expect(surfaces(page)).toContainText(/inside|bounds|outside|fit|correction/i);await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(measure(surfaces(page),'Opening X')).toHaveValue('14 ft');expect(contract(await selected(page))).toEqual(contract(beforeInvalid));expect((await selected(page)).document.rooms).toEqual(beforeInvalid.document.rooms);
  await surfaces(page).getByRole('button',{name:'Revert opening x',exact:true}).click();await totals(page,252,270);
  const second=await createSurface(page,f.main,'floor','Overlapping floor cut','5 ft');expect(second).not.toBe(first);
  // Two3×6 rectangles displaced1ft overlap12sqft: union24, not36.
  await totals(page,246,270);await amount(page,'floor-area','raw-deductions',36);await amount(page,'floor-area','effective-deductions',24);
  const evaluated=await parity(browser,await selected(page));expect(evaluated.fingerprints.geometryScope).toBe('physical-geometry-v4');
  expect(evaluated.calculation.schemaVersion).toBe('quantity-result-v4');
  await card(page,'floor-area').screenshot({path:test.info().outputPath('stairs-overlap-union.png')});
});


test('stair landing and independent void deletion share one chronological history with guarded room dependencies',async({page})=>{
  test.setTimeout(110_000);const f=await building(page),id=await createStair(page,f);await landing(page,'lower');await noDeduction(page);
  await switchLevel(page,f.main);await selectStair(page,id);const hole=await createSurface(page,f.main,'floor','Independent floor opening');
  await deduct(page,id,f.main,'upper','floor',hole);const original=await selected(page), originalContract=contract(original);
  expect(originalContract.surfaceOpenings.find(o=>o.id===hole)!.associatedStairId).toBe(id);
  await stairs(page).getByRole('button',{name:'Delete stair; keep surface openings',exact:true}).click();
  let current=await selected(page);expect(contract(current).stairs).toHaveLength(0);expect(contract(current).surfaceOpenings).toHaveLength(1);
  expect(contract(current).surfaceOpenings[0]).toEqual({...originalContract.surfaceOpenings[0],associatedStairId:null});await totals(page,252,270);
  await undo(page).click();current=await selected(page);expect(contract(current)).toEqual(originalContract);expect(current.localEditRevision).toBeGreaterThan(original.localEditRevision);
  await redo(page).click();expect(contract(await selected(page)).stairs).toHaveLength(0);await undo(page).click();
  await switchLevel(page,f.main);await selectSurface(page,hole);await surfaces(page).getByRole('button',{name:'Delete surface opening',exact:true}).click();
  current=await selected(page);expect(contract(current).stairs[0].id).toBe(id);expect(contract(current).stairs[0].landings.lower!.id).toBe(originalContract.stairs[0].landings.lower!.id);
  expect(contract(current).surfaceOpenings).toHaveLength(0);expect(contract(current).stairs[0].surfaceImpacts.upper.floor.state).toBe('unresolved');
  await expect(total(page,'floor-area')).toContainText(/unavailable/i);await amount(page,'ceiling-area','net',270);await amount(page,'gross-wall-area','net',802);
  await undo(page).click();expect(contract(await selected(page))).toEqual(originalContract);await totals(page,252,270);
  await redo(page).click();expect(contract(await selected(page)).surfaceOpenings).toHaveLength(0);await undo(page).click();
  await switchLevel(page,f.main);await quick(page);await page.getByRole('button',{name:'Main room',exact:true}).click();
  const beforeAssign=await selected(page),label=await undo(page).getAttribute('aria-label');
  await rooms(page).getByRole('combobox',{name:'Room level',exact:true}).selectOption(f.basement);
  const pendingAssignment=await selected(page),mainRoom=beforeAssign.document.rooms.find(room=>room.name==='Main room')!;
  expect(durable(pendingAssignment)).toEqual({...durable(beforeAssign),pendingInputs:{version:'physical-pending-input-v1',roomNames:{},buildingNames:{},roomLevels:{[mainRoom.id]:{from:f.main,to:f.basement}}}});
  await rooms(page).getByRole('button',{name:'Assign room',exact:true}).click();
  await expect(page.getByRole('alert').first()).toContainText(/stair|surface opening/i);expect(await selected(page)).toEqual(pendingAssignment);await expect(undo(page)).toHaveAttribute('aria-label',label!);
  await rooms(page).getByRole('button',{name:'Revert room level',exact:true}).click();expect(durable(await selected(page))).toEqual(durable(beforeAssign));
  expect((await selected(page)).request).toEqual(original.request);expect((await registry(page)).drafts.find(d=>d.id===f.source.id)).toEqual(f.source);
});

test('room-local stair dragging uses current zoom and drawer bounds and cancels stale endpoint gestures',async({page})=>{
  test.setTimeout(95_000);const f=await building(page),id=await createStair(page,f);await noDeduction(page);await showDrawing(page);await selectStair(page,id);
  await drawing(page).getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByTestId('physical-canvas').hover();await page.mouse.wheel(18,24);await frames(page);
  await page.setViewportSize({width:820,height:1100});await openInspector(page);await closeInspector(page);
  await drawing(page).getByRole('button',{name:'Fit drawing',exact:true}).click();await drawing(page).getByRole('button',{name:'Zoom in',exact:true}).click();await frames(page);
  const before=await selected(page),symbol=page.getByTestId('physical-stair-'+id+'-lower');await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded();await frames(page);
  const start=(await symbol.boundingBox())!;await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await frames(page);
  const room=(await page.getByTestId('physical-room-'+f.alpha.id).boundingBox())!;
  await page.mouse.move(room.x+room.width*2/12+start.width/2,room.y+room.height*2/10+start.height/2,{steps:7});await page.mouse.up();
  const moved=await selected(page),lower=contract(moved).stairs[0].endpoints.lower;expect(lower.state).toBe('modeled');
  if(lower.state!=='modeled')throw new Error('Missing lower endpoint');
  const onePixelMm=12*304.8/room.width;expect(Math.abs(lower.placement.x.valueMm!-609.6)).toBeLessThanOrEqual(onePixelMm);expect(Math.abs(lower.placement.y.valueMm!-609.6)).toBeLessThanOrEqual(onePixelMm);
  expect(contract(moved).stairs[0].endpoints.upper).toEqual(contract(before).stairs[0].endpoints.upper);expect(moved.document.rooms).toEqual(before.document.rooms);expect(moved.request).toEqual(before.request);
  expect(moved.historyEvidence!.events.length).toBe(before.historyEvidence!.events.length+1);await undo(page).click();expect(contract(await selected(page))).toEqual(contract(before));await redo(page).click();expect(contract(await selected(page))).toEqual(contract(moved));
  await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded();await frames(page);const hit=(await symbol.boundingBox())!;
  const stable=await selected(page);await page.mouse.move(hit.x+hit.width/2,hit.y+hit.height/2);await page.mouse.down();await page.mouse.move(hit.x+hit.width/2+8,hit.y+hit.height/2+8);
  await level(page).selectOption(f.main);await expect(page.getByTestId('physical-stair-'+id+'-lower')).toHaveCount(0);await page.mouse.up();
  expect(contract(await selected(page))).toEqual(contract(stable));await expect(page.getByTestId('physical-stair-'+id+'-upper')).toBeVisible();
  await switchLevel(page,f.basement);await showDrawing(page);const newHit=(await symbol.boundingBox())!;
  await page.mouse.move(newHit.x+newHit.width/2,newHit.y+newHit.height/2);await page.mouse.down();await page.mouse.move(newHit.x+newHit.width/2+10,newHit.y+newHit.height/2+6);await page.keyboard.press('Escape');await page.mouse.up();
  expect(contract(await selected(page))).toEqual(contract(stable));await totals(page,270,270);
  // A synthetic final packet varies release modifiers independently of keydown;
  // the press/move and subsequent physical mouse release are real browser input.
  const releaseBox=(await symbol.boundingBox())!;
  await page.mouse.move(releaseBox.x+releaseBox.width/2,releaseBox.y+releaseBox.height/2);await page.mouse.down();await page.mouse.move(releaseBox.x+releaseBox.width/2+12,releaseBox.y+releaseBox.height/2+4);
  await symbol.dispatchEvent('pointerup',{pointerId:1,button:0,buttons:0,ctrlKey:true,clientX:releaseBox.x+releaseBox.width/2+12,clientY:releaseBox.y+releaseBox.height/2+4});await page.mouse.up();
  expect(contract(await selected(page))).toEqual(contract(stable));
  const fresh=(await symbol.boundingBox())!,host=(await page.getByTestId('physical-room-'+f.alpha.id).boundingBox())!;
  await page.mouse.move(fresh.x+fresh.width/2,fresh.y+fresh.height/2);await page.mouse.down();await page.mouse.move(fresh.x+fresh.width/2+4,fresh.y+fresh.height/2+4);
  const releaseX=host.x+host.width*3/12+fresh.width/2,releaseY=host.y+host.height*1/10+fresh.height/2;
  await symbol.dispatchEvent('pointerup',{pointerId:1,button:0,buttons:0,clientX:releaseX,clientY:releaseY});await page.mouse.up();
  const endpoint=contract(await selected(page)).stairs[0].endpoints.lower;if(endpoint.state!=='modeled')throw new Error('Missing lower endpoint');
  expect(Math.abs(endpoint.placement.x.valueMm!-914.4)).toBeLessThanOrEqual(12*304.8/host.width);
  expect(Math.abs(endpoint.placement.y.valueMm!-304.8)).toBeLessThanOrEqual(12*304.8/host.width);
});

test('new stair and surface raw fields retain unit context through phone drawer IME Revert and reload',async({page})=>{
  test.setTimeout(100_000);const f=await building(page),id=await createStair(page,f);await noDeduction(page);
  const hole=await createSurface(page,f.main,'floor','Pending opening');await deduct(page,id,f.main,'upper','floor',hole);
  const otherId=await createStair(page,f);await noDeduction(page);await selectStair(page,id);
  await measure(stairs(page),'Horizontal run').fill('6 ft -');await measure(stairs(page),'Horizontal run').dispatchEvent('compositionstart');
  await selectStair(page,otherId);await commit(measure(stairs(page),'Horizontal run'),'7 ft');
  expect(contract(await selected(page)).stairs.find(stair=>stair.id===otherId)!.run.valueMm).toBeCloseTo(2133.6,9);
  await selectStair(page,id);await expect(measure(stairs(page),'Horizontal run')).toHaveValue('6 ft -');
  await stairs(page).getByRole('button',{name:'Revert horizontal run',exact:true}).click();
  await switchLevel(page,f.basement);await quick(page);await page.getByRole('button',{name:'Basement room',exact:true}).click();await roomField(page,'Ceiling height').fill('8 ft -');
  await selectStair(page,id);await measure(stairs(page),'Horizontal run').fill('6 ft -');
  await switchLevel(page,f.main);await selectSurface(page,hole);await measure(surfaces(page),'Opening width').fill('3 ft -');
  await closeInspector(page);await page.getByRole('button',{name:'Meters',exact:true}).click();const pending=await selected(page);
  await switchLevel(page,f.basement);await showDrawing(page);await page.setViewportSize({width:390,height:844});await selectStair(page,id);
  const run=measure(stairs(page),'Horizontal run');await expect(run).toHaveValue('6 ft -');await run.focus();
  const revertBounds=await stairs(page).getByRole('button',{name:'Revert horizontal run',exact:true}).boundingBox(),inputBounds=await run.boundingBox();
  expect(revertBounds&&inputBounds).toBeTruthy();expect(revertBounds!.y+revertBounds!.height).toBeLessThanOrEqual(inputBounds!.y);
  await page.screenshot({path:test.info().outputPath('stairs-phone-pending-drawer.png')});
  await run.dispatchEvent('compositionstart');await run.press('Escape');await expect(run).toHaveValue('6 ft -');await expect(page.getByRole('dialog',{name:/^Edit /})).toBeVisible();await run.dispatchEvent('compositionend');
  await run.press('Escape');await expect(run).not.toHaveValue('6 ft -');await expect(page.getByRole('dialog',{name:/^Edit /})).toBeVisible();
  const reverted=await selected(page);expect(reverted.document).toEqual(pending.document);expect(reverted.fields).toEqual(pending.fields);expect(reverted.events).toEqual(pending.events);expect(reverted.source).toEqual(pending.source);
  await closeInspector(page);await switchLevel(page,f.main);await selectSurface(page,hole);await expect(measure(surfaces(page),'Opening width')).toHaveValue('3 ft -');
  await closeInspector(page);const beforeReload=await selected(page);await page.reload();expect(await selected(page)).toEqual(beforeReload);await expect(undo(page)).toBeDisabled();await expect(redo(page)).toBeDisabled();
  await selectSurface(page,hole);await expect(measure(surfaces(page),'Opening width')).toHaveValue('3 ft -');
  await surfaces(page).getByRole('button',{name:'Revert opening width',exact:true}).click();await closeInspector(page);await switchLevel(page,f.basement);await quick(page);await expect(roomField(page,'Ceiling height')).toHaveValue('8 ft -');
  expect((await registry(page)).drafts.find(d=>d.id===f.source.id)).toEqual(f.source);
});

test('versioned recovery rejects duplicate surface attachments and unknown features while old snapshots and quota bytes survive',async({page,browser})=>{
  test.setTimeout(100_000);const f=await building(page);
  const old=await createQuantitySnapshot(f.source.document,f.source.request,{id:'before-stairs',createdAt:AT,kind:'evaluation'},f.source.events);
  expect(old.ok).toBe(true);if(!old.ok)throw new Error(JSON.stringify(old.errors));expect(old.snapshot.snapshotSchemaVersion).toBe('quantity-snapshot-v3');const oldBytes=JSON.stringify(old.snapshot);
  const id=await createStair(page,f);await noDeduction(page);const hole=await createSurface(page,f.main,'floor','Recovery floor cut');await deduct(page,id,f.main,'upper','floor',hole);
  const current=await selected(page),captured=await createQuantitySnapshot(current.document,current.request,{id:'with-stairs',createdAt:AT,kind:'evaluation'},current.events);
  expect(captured.ok).toBe(true);if(!captured.ok)throw new Error(JSON.stringify(captured.errors));expect(captured.snapshot.snapshotSchemaVersion).toBe('quantity-snapshot-v4');expect(await verifyQuantitySnapshot(captured.snapshot)).toEqual({ok:true});
  expect(await verifyQuantitySnapshot(old.snapshot)).toEqual({ok:true});expect(JSON.stringify(old.snapshot)).toBe(oldBytes);
  const valid=await registry(page);
  for(const kind of ['duplicate','future'] as const) {
    const invalid=structuredClone(valid),d=invalid.drafts.find(d=>d.id===current.id)!;
    if(kind==='duplicate'){const opening=contract(d).surfaceOpenings[0];opening.attachments.push(structuredClone(opening.attachments[0]));}
    else(contract(d) as any).version='straight-stairs-future';
    const raw=JSON.stringify(invalid);expect(parseRegistry(raw).status).toMatch(/corrupt|unsupported/);
    const context=await browser.newContext({baseURL:new URL(page.url()).origin});const bad=await context.newPage();
    try {
      await bad.addInitScript(({key,raw})=>sessionStorage.setItem(key,raw),{key:KEY,raw});await bad.goto('/physical-draft');
      await expect(bad.getByRole('alert').first()).toBeVisible();await expect(bad.getByRole('button',{name:'New building draft',exact:true})).toBeDisabled();
      const event=bad.waitForEvent('download');await bad.getByRole('button',{name:'Download original recovery data',exact:true}).click();const download=await event;expect(await readFile((await download.path())!,'utf8')).toBe(raw);
      expect(await bad.evaluate(key=>sessionStorage.getItem(key),KEY)).toBe(raw);
    }finally{await context.close();}
  }
  const recoveryBytes=await page.evaluate(key=>sessionStorage.getItem(key),KEY);
  await page.evaluate(key=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Synthetic quota failure','QuotaExceededError');return set.call(this,name,value);};},KEY);
  await switchLevel(page,f.main);await selectStair(page,id);await measure(stairs(page),'Total rise').fill('9 ft -');
  await expect(page.getByText('This edit is held in memory because temporary recovery could not be saved. Existing stored data has not been cleared.',{exact:true})).toBeVisible();await expect(measure(stairs(page),'Total rise')).toHaveValue('9 ft -');
  expect(await page.evaluate(key=>sessionStorage.getItem(key),KEY)).toBe(recoveryBytes);
  await stairs(page).getByRole('button',{name:'Revert total rise',exact:true}).click();await expect(measure(stairs(page),'Total rise')).toHaveValue('');
});


test('surface deduction Locate and Edit reveal the correct level and finish without altering work or pending stair text',async({page})=>{
  test.setTimeout(90_000);const f=await building(page),id=await createStair(page,f);await noDeduction(page);
  const hole=await createSurface(page,f.main,'floor','Main floor trace opening');await deduct(page,id,f.main,'upper','floor',hole);await totals(page,252,270);
  await quick(page);await page.getByRole('button',{name:'Main room',exact:true}).click();await switchLevel(page,f.basement);await selectStair(page,id);await measure(stairs(page),'Horizontal run').fill('6 ft -');
  await page.setViewportSize({width:820,height:1100});
  // A focused docked field deliberately opens its narrow inspector on this breakpoint.
  await expect(page.getByRole('dialog',{name:/^Edit stair:/})).toBeVisible();
  await expect(measure(stairs(page),'Horizontal run')).toHaveValue('6 ft -');
  await closeInspector(page);const before=await selected(page);
  const details=card(page,'floor-area').locator('details');if(await details.getAttribute('open')===null)await details.locator('summary').click();
  const deduction=card(page,'floor-area').getByTestId('takeoff-surface-deduction').filter({has:page.getByText(/Main floor trace opening/)});
  await expect(deduction).toHaveAttribute('data-surface-opening-id',hole);await expect(deduction).toHaveAttribute('data-surface','floor');
  await deduction.getByRole('button',{name:'Locate opening',exact:true}).click();await expect(level(page)).toHaveValue(f.main);
  await expect(page.getByTestId('physical-surface-opening-'+hole+'-floor')).toBeVisible();
  await expect(page.getByRole('dialog',{name:/^Edit /})).toHaveCount(0);expect(durable(await selected(page))).toEqual(durable(before));
  await deduction.getByRole('button',{name:'Edit opening',exact:true}).click();await expect(page.getByRole('dialog',{name:/^Edit surface-opening:/})).toBeVisible();
  await expect(surfaces(page)).toHaveAttribute('data-surface-opening-id',hole);await expect(surfaces(page).getByRole('combobox',{name:'Affected surface',exact:true})).toHaveValue('floor');
  expect(durable(await selected(page))).toEqual(durable(before));await closeInspector(page);await switchLevel(page,f.basement);await selectStair(page,id);await expect(measure(stairs(page),'Horizontal run')).toHaveValue('6 ft -');
});
