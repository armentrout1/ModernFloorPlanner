import { expect, test, type Page, type Locator } from '@playwright/test';
import { parseRegistry, serializeRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import { adoptPhysicalDraft, createRegistry, insertDraft, type PhysicalDraft } from '../../client/src/features/physical-draft/state';
import type { PhysicalOpening, WallSide } from '../../shared/domain/document';
import { calculateQuantities } from '../../shared/quantities/engine';
import { evaluateQuantities } from '../../shared/quantities/snapshot';

const QUICK_KEY = 'modern-floor-planner:quick-rooms:v1';
const roomInspector = (page: Page) => page.getByTestId('physical-room-inspector');
const openingInspector = (page: Page) => page.getByTestId('physical-opening-inspector');
const drawing = (page: Page) => page.getByRole('region', { name: 'Physical drawing', exact: true });
const overlay = (page: Page, id: string) => page.getByTestId('physical-opening-' + id);
const listItem = (page: Page, id: string) => page.getByTestId('physical-opening-list-' + id);
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
async function selected(page: Page): Promise<PhysicalDraft> {
  await expect.poll(async () => parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY)).status).toBe('recovered');
  const result = parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY));
  if (result.status !== 'recovered') throw new Error('Expected a validated physical recovery registry');
  const draft = result.registry.drafts.find(item => item.id === result.registry.selectedDraftId);
  if (!draft) throw new Error('No selected physical draft');
  return draft;
}
async function commit(input: Locator, text: string) {
  await input.fill(text); await input.press('Enter'); await input.press('Tab');
}
async function room(page: Page, name = 'Alpha', length = '12 ft', width = '10 ft', height = '8 ft') {
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await roomInspector(page).getByLabel('Room name', { exact: true }).fill(name);
  for (const [field, value] of [['Length', length], ['Width', width], ['Ceiling height', height]]) {
    await commit(roomInspector(page).getByLabel(field + ' (ft)', { exact: true }), value);
  }
  await roomInspector(page).getByLabel('Ceiling model', { exact: true }).selectOption('flat');
  await roomInspector(page).getByLabel('Wall model', { exact: true }).selectOption('vertical-uniform');
  return (await selected(page)).document.rooms.find(value => value.name === name)!;
}
async function start(page: Page) {
  await page.goto('/physical-draft');
  await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  return room(page);
}
async function createOpening(page: Page, kind: 'door' | 'window' | 'opening', values: { width: string; height: string; sill: string; offset: string }) {
  await page.getByRole('button', { name: 'Create ' + kind, exact: true }).click();
  const panel = openingInspector(page), label = kind[0].toUpperCase() + kind.slice(1);
  await panel.getByLabel('Opening wall', { exact: true }).selectOption({ label: 'Top wall' });
  await commit(panel.getByLabel('Position from wall start', { exact: true }), values.offset);
  await commit(panel.getByLabel(label + ' width', { exact: true }), values.width);
  await commit(panel.getByLabel(label + ' height', { exact: true }), values.height);
  await commit(panel.getByLabel('Sill height', { exact: true }), values.sill);
  await panel.getByLabel('Measurement basis', { exact: true }).selectOption('finished');
  const id = await panel.getAttribute('data-opening-id');
  return (await selected(page)).document.openings.find(value => value.id === id)!;
}
async function fixture(page: Page) {
  const alpha = await start(page);
  const door = await createOpening(page, 'door', { width: '3 ft', height: '7 ft', sill: '0', offset: '2.5 ft' });
  const window = await createOpening(page, 'window', { width: '4 ft', height: '3 ft', sill: '3 ft', offset: '8 ft' });
  return { alpha, door, window };
}
async function showDrawing(page: Page) {
  await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
  await drawing(page).getByRole('button', { name: 'Fit drawing', exact: true }).click();
  await frames(page);
}
async function wallPoint(page: Page, roomId: string, side: WallSide, ratio: number, reveal = true) {
  if (reveal) await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded();
  const bounds = await page.getByTestId('physical-room-' + roomId).boundingBox();
  if (!bounds) throw new Error('Rendered room bounds unavailable');
  return { x: side === 'left' ? bounds.x : side === 'right' ? bounds.x + bounds.width : bounds.x + bounds.width * (side === 'bottom' ? 1 - ratio : ratio),
    y: side === 'top' ? bounds.y : side === 'bottom' ? bounds.y + bounds.height : bounds.y + bounds.height * (side === 'left' ? 1 - ratio : ratio),
    pixels: side === 'top' || side === 'bottom' ? bounds.width : bounds.height, roomId, side, ratio };
}
async function move(page: Page, id: string, target: Awaited<ReturnType<typeof wallPoint>>) {
  const box = await overlay(page, id).first().boundingBox();
  if (!box) throw new Error('Opening overlay bounds unavailable');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await frames(page);
  // Selection and feedback can reflow the page when the gesture begins.
  const current = await wallPoint(page,target.roomId,target.side,target.ratio,false);
  await page.mouse.move(current.x,current.y,{steps:7}); await page.mouse.up();
}
async function clickOpening(page: Page, id: string, double = false) {
  await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded(); await frames(page);
  const box = await overlay(page,id).first().boundingBox();
  if (!box) throw new Error('Opening surface is unavailable');
  // The bar and its transparent swept sector intentionally share this identity.
  // A real pointer can hit either surface; targeting only the lower bar locator
  // would incorrectly reject the overlapping sector as an unrelated interceptor.
  if (double) await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);
  else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
}
function measured(opening: PhysicalOpening) {
  return { id: opening.id, kind: opening.kind, width: opening.width, height: opening.height, sillHeight: opening.sillHeight,
    measureBasis: opening.measureBasis, appearance: opening.appearance, metadata: opening.metadata };
}
function engine(draft: PhysicalDraft) {
  const document = draft.document, rooms = document.rooms.map(room => room.id), walls = document.rooms.flatMap(room => room.wallFaces.map(wall => wall.id));
  const result = calculateQuantities(document, {
    policy: { version: document.quantityPolicyVersion, openingMeasureBasis: 'finished', crownFullHeightGaps: [] },
    selections: [
      { output: 'floor-area', roomIds: rooms, wasteFraction: 0 }, { output: 'ceiling-area', roomIds: rooms, wasteFraction: 0 },
      ...['gross-wall-area', 'net-wall-area', 'baseboard', 'base-shoe'].map(output => ({ output, wallFaceIds: walls, wasteFraction: 0 })),
      { output: 'opening-inventory', openingIds: document.openings.map(opening => opening.id) },
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.calculation;
}
const pageErrors = new WeakMap<Page, string[]>(), apiWrites = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  pageErrors.set(page, []); apiWrites.set(page, []);
  page.on('pageerror', error => pageErrors.get(page)!.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) apiWrites.get(page)!.push(request.method() + ' ' + request.url()); });
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); expect(apiWrites.get(page)).toEqual([]); });

test('UI-built physical door and window share exact form, drawing and engine quantities', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  const { alpha, door, window } = await fixture(page);
  const draft = await selected(page);
  expect(draft.document.openings).toHaveLength(2);
  for (const [opening,width,height,sill,offset] of [[door,914.4,2133.6,0,762],[window,1219.2,914.4,914.4,2438.4]] as const) {
    expect(opening.width.valueMm).toBeCloseTo(width,9); expect(opening.height.valueMm).toBeCloseTo(height,9); expect(opening.sillHeight.valueMm).toBeCloseTo(sill,9);
    expect(opening.measureBasis).toBe('finished'); expect(opening.attachments[0]).toMatchObject({wallFaceId:alpha.wallFaces[0].id,anchor:'center'});
    expect(opening.attachments[0].offsetMm).toBeCloseTo(offset,9);
  }
  const result = engine(draft);
  const nodeEvaluation = await evaluateQuantities(draft.document, result.request);
  expect(nodeEvaluation.ok).toBe(true);
  if (!nodeEvaluation.ok) throw new Error(JSON.stringify(nodeEvaluation.errors));
  const parityContext = await browser.newContext();
  const parityPage = await parityContext.newPage(), parityErrors: string[] = [];
  parityPage.on('pageerror', error => parityErrors.push(error.message));
  try {
    await parityPage.goto('http://127.0.0.1:4174/');
    await expect(parityPage.getByText('Shared quantity engine ready')).toBeVisible();
    const browserEvaluation = await parityPage.evaluate(async ({ document, request }) =>
      (window as any).mfpParity.evaluate(document, request), { document: draft.document, request: result.request });
    expect(browserEvaluation.ok).toBe(true);
    expect(browserEvaluation.evaluation.calculation).toEqual(nodeEvaluation.evaluation.calculation);
    expect(browserEvaluation.evaluation.fingerprints).toEqual(nodeEvaluation.evaluation.fingerprints);
    expect(browserEvaluation.evaluation.calculation).toEqual(result);
    expect(parityErrors).toEqual([]);
  } finally { await parityContext.close(); }
  for (const [output, expected, divisor] of [['floor-area',120,304.8 ** 2],['ceiling-area',120,304.8 ** 2],['gross-wall-area',352,304.8 ** 2],['net-wall-area',319,304.8 ** 2],['baseboard',41,304.8],['base-shoe',41,304.8]] as const) {
    const aggregate = result.outputs.find(value => value.output === output)!;
    expect(aggregate.total, output).not.toBeNull(); expect(aggregate.total!.net / divisor, output).toBeCloseTo(expected, 8);
  }
  expect(result.records.find(value => value.output === 'opening-inventory')!.inventory).toEqual({ door: 1, window: 1, 'floor-level-opening': 0 });
  await showDrawing(page);
  for (const opening of [door, window]) {
    await listItem(page, opening.id).click();
    await expect(overlay(page, opening.id)).toHaveAttribute('aria-pressed', 'true');
    await expect(openingInspector(page)).toHaveAttribute('data-opening-id', opening.id);
    const target = await wallPoint(page, alpha.id, 'top', opening.attachments[0].offsetMm / alpha.length.valueMm!);
    const box = await overlay(page, opening.id).boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - target.x)).toBeLessThanOrEqual(1);
    await clickOpening(page,opening.id);
    await expect(openingInspector(page)).toHaveAttribute('data-opening-id', opening.id);
  }
  expect((await selected(page)).document).toEqual(draft.document);
});

test('drawing placement uses clockwise center offsets on all four walls and keeps missing measurements unknown', async ({ page }) => {
  const alpha = await start(page); await showDrawing(page);
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    await drawing(page).getByRole('button', { name: 'Add Window', exact: true }).click();
    const point = await wallPoint(page, alpha.id, side, .35);
    await page.mouse.move(point.x, point.y); await page.mouse.click(point.x, point.y);
    const draft = await selected(page), opening = draft.document.openings.at(-1)!;
    const wall = alpha.wallFaces.find(wall => wall.side === side)!;
    const mm = side === 'top' || side === 'bottom' ? alpha.length.valueMm! : alpha.width.valueMm!;
    expect(opening.attachments[0].wallFaceId).toBe(wall.id);
    expect(Math.abs(opening.attachments[0].offsetMm - mm * .35)).toBeLessThanOrEqual(mm / point.pixels + 1e-7);
    expect(opening.height.state).toBe('unknown'); expect(opening.sillHeight.state).toBe('unknown'); expect(opening.measureBasis).toBe('unknown');
    await expect(openingInspector(page)).toHaveAttribute('data-opening-id', opening.id);
  }
  expect((await selected(page)).document.openings).toHaveLength(4);
  await drawing(page).getByRole('button', { name: 'Add Opening', exact: true }).click();
  const point = await wallPoint(page, alpha.id, 'top', .75); await page.mouse.click(point.x, point.y);
  const opening = (await selected(page)).document.openings.at(-1)!;
  expect(opening.kind).toBe('floor-level-opening'); expect(opening.appearance).toBeUndefined();
  await expect(overlay(page, opening.id)).toBeVisible();
  await expect(page.getByTestId('door-swing-' + opening.id)).toHaveCount(0);
});

test('along-wall, cross-wall and cross-room drags retain exact opening data and commit one action per gesture', async ({ page }) => {
  const { alpha, door } = await fixture(page);
  const beta = await room(page, 'Beta', '14 ft', '10 ft', '9 ft');
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await showDrawing(page);
  for (const [targetRoom, side, ratio] of [[alpha,'top',.28],[alpha,'right',.3],[beta,'bottom',.3]] as const) {
    await listItem(page, door.id).click(); await frames(page);
    const before = await selected(page), point = await wallPoint(page, targetRoom.id, side, ratio);
    await move(page, door.id, point);
    const after = await selected(page), moved = after.document.openings.find(value => value.id === door.id)!;
    expect(measured(moved)).toEqual(measured(door));
    expect(moved.attachments[0].wallFaceId).toBe(targetRoom.wallFaces.find(value => value.side === side)!.id);
    const wallMm = side === 'top' || side === 'bottom' ? targetRoom.length.valueMm! : targetRoom.width.valueMm!;
    expect(Math.abs(moved.attachments[0].offsetMm - wallMm * ratio)).toBeLessThanOrEqual(wallMm / point.pixels + 1e-7);
    expect(after.openingEvents!.length).toBe(before.openingEvents!.length + 1);
    expect(after.document.rooms).toEqual(before.document.rooms);
  }
  expect((await selected(page)).document.openings).toHaveLength(2);
  for (const [targetRoom,side,ratio] of [[alpha,'top',8/12],[beta,'bottom',.02]] as const) {
    const before = await selected(page);
    const target = await wallPoint(page,targetRoom.id,side,ratio);
    const beforeBounds = await page.getByTestId('physical-canvas').boundingBox();
    await move(page,door.id,target);
    await frames(page);
    const afterBounds = await page.getByTestId('physical-canvas').boundingBox();
    expect(afterBounds).toEqual(beforeBounds);
    expect((await selected(page)).document).toEqual(before.document);
    expect((await selected(page)).openingEvents).toEqual(before.openingEvents);
    await expect(page.getByTestId('physical-gesture-message')).toContainText(/fit|overlap|intersect/i);
  }
});

test('exact fractional and metric widths, independent sill and height, and invalid raw edits preserve the opening', async ({ page }) => {
  const { door, window } = await fixture(page);
  await listItem(page, door.id).click();
  const panel = openingInspector(page);
  await panel.getByRole('button', { name: 'Common door width', exact: true }).click();
  await page.getByRole('menuitem', { name: '32 in', exact: true }).click();
  const exact = (await selected(page)).document.openings.find(value => value.id === door.id)!;
  expect(exact.width.valueMm).toBeCloseTo(812.8, 9);
  const count = (await selected(page)).openingEvents!.length;
  await commit(panel.getByLabel('Door width', { exact: true }), '2 ft 8 1/2 in');
  expect((await selected(page)).openingEvents!.length).toBe(count + 1);
  const fractional = (await selected(page)).document.openings.find(value => value.id === door.id)!;
  expect(fractional.width.valueMm).toBeCloseTo(825.5, 9);
  await commit(panel.getByLabel('Door width', { exact: true }), '0.8255 m');
  expect((await selected(page)).document.openings.find(value => value.id === door.id)!.width.valueMm).toBe(fractional.width.valueMm);
  await listItem(page, window.id).click();
  await commit(panel.getByLabel('Window height', { exact: true }), '2 ft 6 in');
  let current = (await selected(page)).document.openings.find(value => value.id === window.id)!;
  expect(current.width).toEqual(window.width); expect(current.sillHeight).toEqual(window.sillHeight);
  await commit(panel.getByLabel('Sill height', { exact: true }), '4 ft');
  current = (await selected(page)).document.openings.find(value => value.id === window.id)!;
  expect(current.height.valueMm).toBeCloseTo(762, 9); expect(current.width).toEqual(window.width); expect(current.sillHeight.valueMm).toBeCloseTo(1219.2, 9);
  const valid = await selected(page);
  await commit(panel.getByLabel('Window height', { exact: true }), '6 ft');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(panel.getByLabel('Window height', { exact: true })).toHaveValue('6 ft');
  expect((await selected(page)).document).toEqual(valid.document);
  await commit(panel.getByLabel('Window height', { exact: true }), '2.5 ft');
  await commit(panel.getByLabel('Position from wall start', { exact: true }), '0.5 ft');
  await expect(page.getByRole('alert').first()).toBeVisible();
  expect((await selected(page)).document.openings.find(value => value.id === window.id)!.attachments).toEqual(window.attachments);
  await commit(panel.getByLabel('Position from wall start', { exact: true }), '2.5 ft');
  await expect(page.getByRole('alert').first()).toBeVisible();
  expect((await selected(page)).document.openings.find(value => value.id === window.id)!.attachments).toEqual(window.attachments);
});

test('door appearance and exact-target delete undo preserve measurements, rooms and unrelated edits', async ({ page }) => {
  const { alpha, door, window } = await fixture(page); await showDrawing(page);
  await listItem(page, door.id).click();
  const panel = openingInspector(page);
  await panel.getByLabel('Door style', { exact: true }).selectOption('bifold');
  await panel.getByLabel('Swing', { exact: true }).selectOption('outward');
  await panel.getByLabel('Hand', { exact: true }).selectOption('right');
  const changed = (await selected(page)).document.openings.find(value => value.id === door.id)!;
  expect({ ...measured(changed), appearance: undefined }).toEqual({ ...measured(door), appearance: undefined });
  expect(changed.appearance).toMatchObject({ style:'bifold',swingDirection:'outward' });
  await clickOpening(page,door.id,true);
  const flipped = (await selected(page)).document.openings.find(value => value.id === door.id)!;
  expect(flipped.appearance!.swingSide).not.toBe(changed.appearance!.swingSide);
  expect(flipped.width).toEqual(door.width); expect(flipped.height).toEqual(door.height);
  await panel.getByLabel('Door width', { exact: true }).focus(); await page.keyboard.press('Delete');
  expect((await selected(page)).document.openings).toHaveLength(2);
  await panel.getByRole('button', { name: 'Delete door', exact: true }).click();
  expect((await selected(page)).document.openings.map(value => value.id)).toEqual([window.id]);
  expect((await selected(page)).document.rooms.map(value => value.id)).toEqual([alpha.id]);
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await roomInspector(page).getByLabel('Room name', { exact: true }).fill('Alpha renamed');
  await page.getByRole('button', { name: 'Undo opening delete', exact: true }).click();
  const restored = await selected(page);
  expect(restored.document.openings.map(value => value.id)).toEqual([door.id, window.id]);
  expect(restored.document.openings[0]).toEqual(flipped); expect(restored.document.rooms[0].name).toBe('Alpha renamed');
  await clickOpening(page,window.id); await page.keyboard.press('Delete');
  expect((await selected(page)).document.openings.map(value=>value.id)).toEqual([door.id]);
  expect((await selected(page)).document.rooms).toHaveLength(1);
  await page.getByRole('button',{name:'Undo opening delete',exact:true}).click();
  expect((await selected(page)).document.openings).toEqual(restored.document.openings);
});

test('canceled and stale gestures never move or duplicate an opening', async ({ page }) => {
  const { alpha, door } = await fixture(page); await showDrawing(page); await listItem(page, door.id).click();
  for (const cancel of ['Escape', 'Control', 'blur', 'pointercancel', 'lostpointercapture', 'view'] as const) {
    const before = await selected(page), box = await overlay(page, door.id).boundingBox();
    const point = await wallPoint(page, alpha.id, 'bottom', .4);
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down();
    await page.mouse.move(point.x, point.y, { steps: 5 });
    if (cancel === 'Escape') await page.keyboard.press('Escape');
    else if (cancel === 'Control') { await page.keyboard.down('Control'); await page.keyboard.up('Control'); }
    else if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else if (cancel === 'view') await page.getByRole('tab',{name:'Quick Rooms',exact:true}).press('Enter');
    else await page.getByTestId('physical-canvas').dispatchEvent(cancel, { pointerId:1,pointerType:'mouse',isPrimary:true });
    await page.mouse.up();
    if (cancel === 'view') { await showDrawing(page); await listItem(page,door.id).click(); }
    expect((await selected(page)).document).toEqual(before.document);
    expect((await selected(page)).openingEvents).toEqual(before.openingEvents);
  }
  const box = await overlay(page, door.id).boundingBox(), target = await wallPoint(page, alpha.id, 'right', .4);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await openingInspector(page).getByLabel('Door height', { exact: true }).fill('6 ft -');
  const newer = await selected(page);
  await page.mouse.up();
  expect((await selected(page)).document).toEqual(newer.document);
  expect((await selected(page)).openingEvents).toEqual(newer.openingEvents);
  expect((await selected(page)).document.openings).toHaveLength(2);
});

test('opening recovery retains pending unit context, source originals and selected draft without legacy saving', async ({ page }) => {
  await page.goto('/quick-room'); await page.getByRole('button', { name: 'Add room', exact: true }).click();
  const card = page.getByTestId('quick-room-card');
  for (const [label,text] of [['Length','12 ft'],['Width','10 ft'],['Ceiling height','8 ft']]) await commit(card.getByLabel(label,{exact:true}),text);
  const original = await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY);
  await page.getByRole('button', { name:'Open a physical copy',exact:true }).click();
  const source = (await selected(page)).source;
  const door = await createOpening(page,'door',{width:'32 in',height:'7 ft',sill:'0',offset:'2.5 ft'});
  await openingInspector(page).getByLabel('Door width',{exact:true}).fill('2 ft -');
  await page.getByRole('button',{name:'Meters',exact:true}).click();
  const pending = await selected(page);
  await page.getByRole('link',{name:'Standalone Quick Rooms',exact:true}).click();
  await page.goto('/physical-draft'); await listItem(page,door.id).click();
  await expect(openingInspector(page).getByLabel('Door width',{exact:true})).toHaveValue('2 ft -');
  expect((await selected(page)).id).toBe(pending.id);
  await page.reload(); await listItem(page,door.id).click();
  await expect(openingInspector(page).getByLabel('Door width',{exact:true})).toHaveValue('2 ft -');
  expect(await selected(page)).toEqual(pending);
  expect((await selected(page)).source).toEqual(source);
  expect(await page.evaluate(key => sessionStorage.getItem(key),QUICK_KEY)).toBe(original);
});

test('populated opening views retain controls and precise placement through zoom, pan and desktop tablet phone reflow', async ({ page }) => {
  const { alpha, door } = await fixture(page); await showDrawing(page);
  const original = await selected(page);
  for (const [name,width,height] of [['desktop',1600,1200],['tablet',820,1100],['phone',390,844]] as const) {
    await page.setViewportSize({width,height});
    await listItem(page,door.id).click(); await frames(page);
    await drawing(page).getByRole('button',{name:'Fit drawing',exact:true}).click();
    await drawing(page).getByRole('button',{name:'Zoom in',exact:true}).click();
    await drawing(page).getByRole('button',{name:'Zoom out',exact:true}).click();
    await page.getByTestId('physical-canvas').evaluate(node=>{node.scrollLeft+=17;node.scrollTop+=9;});
    await drawing(page).getByRole('button',{name:'Fit drawing',exact:true}).click(); await frames(page);
    expect((await selected(page)).document).toEqual(original.document);
    await expect(openingInspector(page).getByLabel('Door width',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const point=await wallPoint(page,alpha.id,'top',2.5/12),box=await overlay(page,door.id).boundingBox();
    expect(Math.abs(box!.x+box!.width/2-point.x)).toBeLessThanOrEqual(1);
    await page.screenshot({path:test.info().outputPath('physical-openings-'+name+'.png'),fullPage:true});
  }
});
test('a recovered two-face opening retains one identity and blocks uncoordinated moves and invalid dimensions', async ({ page }) => {
  const alpha = await start(page);
  const door = await createOpening(page,'door',{width:'3 ft',height:'7 ft',sill:'0',offset:'2.5 ft'});
  const beta = await room(page,'Beta','4 ft','10 ft','8 ft');
  const source = structuredClone((await selected(page)).document);
  source.openings[0].attachments.push({wallFaceId:beta.wallFaces[0].id,anchor:'center',offsetMm:609.6 as PhysicalOpening['attachments'][number]['offsetMm']});
  const recovered = adoptPhysicalDraft(source,'shared-browser-draft');
  const raw = serializeRegistry(insertDraft(createRegistry(),recovered));
  expect(parseRegistry(raw).status).toBe('recovered');
  await page.evaluate(({key,raw})=>sessionStorage.setItem(key,raw),{key:KEY,raw}); await page.reload();
  await showDrawing(page); await listItem(page,door.id).click();
  const panel=openingInspector(page),before=await selected(page);
  await expect(overlay(page,door.id)).toHaveCount(2);
  await expect(panel.getByLabel('Opening room',{exact:true})).toBeDisabled();
  await expect(panel.getByLabel('Opening wall',{exact:true})).toBeDisabled();
  await expect(panel.getByLabel('Position from wall start',{exact:true})).toBeDisabled();
  await expect(panel).toContainText('both attachments must remain linked');
  await move(page,door.id,await wallPoint(page,alpha.id,'bottom',.4));
  expect((await selected(page)).document).toEqual(before.document);
  await commit(panel.getByLabel('Door width',{exact:true}),'5 ft');
  await expect(page.getByRole('alert').first()).toContainText('wall length');
  expect((await selected(page)).document).toEqual(before.document);
  await commit(panel.getByLabel('Door width',{exact:true}),'3 ft');
  await commit(panel.getByLabel('Door height',{exact:true}),'6 ft');
  const edited=await selected(page);
  expect(edited.document.openings).toHaveLength(1);
  expect(edited.document.openings[0].id).toBe(door.id);
  expect(edited.document.openings[0].attachments).toEqual(source.openings[0].attachments);
  expect(edited.document.openings[0].height.valueMm).toBeCloseTo(1828.8,9);
  expect(edited.source.original).toEqual(source);
  await panel.getByRole('button',{name:'Delete door',exact:true}).click();
  expect((await selected(page)).document.rooms).toHaveLength(2);
  await page.getByRole('button',{name:'Undo opening delete',exact:true}).click();
  expect((await selected(page)).document.openings).toEqual(edited.document.openings);
});