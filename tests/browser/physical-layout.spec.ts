import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import type { PhysicalDraft } from '../../client/src/features/physical-draft/state';
import type { WallSide } from '../../shared/domain/document';

const roomForm = (p: Page) => p.getByTestId('physical-room-inspector');
const openingForm = (p: Page) => p.getByTestId('physical-opening-inspector');
const field = (p: Page, label: string) => roomForm(p).getByLabel(new RegExp('^' + label + ' \\((ft|m)\\)$'));
const drawer = (p: Page) => p.getByRole('dialog', { name: /^Edit (room|door|window|opening):/ });
const opener = (p: Page) => p.getByRole('button', { name: /^Edit selected (room|opening):/ });
const history = (p: Page) => p.getByRole('group', { name: 'Committed edit history', exact: true, includeHidden: true });
const undo = (p: Page) => history(p).getByRole('button', { name: /^Undo(?: |$)/, includeHidden: true });
const redo = (p: Page) => history(p).getByRole('button', { name: /^Redo(?: |$)/, includeHidden: true });
const takeoff = (p: Page) => p.getByTestId('takeoff-panel');
const card = (p: Page, output: string) => p.getByTestId('takeoff-output-' + output);
const total = (p: Page, output: string) => card(p, output).getByTestId('takeoff-total');
const drawing = (p: Page) => p.getByRole('region', { name: 'Physical drawing', exact: true });
const frames = (p: Page) => p.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const LONG = 'Alpha primary bedroom with south-facing windows and hallway access';

// Main fixtures use public controls only. The complete validated recovery draft
// is read for comparisons; no completed editor state is injected into the app.
async function selected(p: Page): Promise<PhysicalDraft> {
  await expect.poll(async () => parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY)).status).toBe('recovered');
  const parsed = parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY));
  if (parsed.status !== 'recovered') throw new Error('Expected valid physical recovery');
  return parsed.registry.drafts.find(d => d.id === parsed.registry.selectedDraftId)!;
}
async function commit(input: Locator, text: string) { await input.fill(text); await input.press('Enter'); await input.press('Tab'); }
async function openInspector(p: Page) {
  if ((p.viewportSize()?.width ?? await p.evaluate(() => innerWidth)) < 1024) {
    await expect.poll(async () => await drawer(p).isVisible() || await opener(p).isVisible()).toBe(true);
    if (!await drawer(p).isVisible()) await opener(p).click();
  }
  await expect(p.getByTestId('physical-inspector')).toBeVisible();
}
async function closeInspector(p: Page) {
  if (await drawer(p).isVisible()) { await drawer(p).getByRole('button', { name: 'Close inspector', exact: true }).click(); await expect(drawer(p)).toBeHidden(); }
}
async function room(p: Page, name: string, length = '12 ft', width = '10 ft') {
  await closeInspector(p); await p.getByRole('tab', { name: 'Quick Rooms', exact: true }).click();
  await p.getByRole('button', { name: 'Add room', exact: true }).click();
  await roomForm(p).getByLabel('Room name', { exact: true }).fill(name);
  for (const [label, value] of [['Length', length], ['Width', width], ['Ceiling height', '8 ft']]) await commit(field(p, label), value);
  return (await selected(p)).document.rooms.at(-1)!;
}
async function opening(p: Page, kind: 'door' | 'window') {
  await closeInspector(p); await p.getByRole('button', { name: 'Create ' + kind, exact: true }).click(); await openInspector(p);
  const label = kind === 'door' ? 'Door' : 'Window';
  for (const [name, text] of [['Position from wall start', kind === 'door' ? '2.5 ft' : '8 ft'],
    [label + ' width', kind === 'door' ? '3 ft' : '4 ft'], [label + ' height', kind === 'door' ? '7 ft' : '3 ft'],
    ['Sill height', kind === 'door' ? '0' : '3 ft']]) await commit(openingForm(p).getByLabel(name, { exact: true }), text);
  await openingForm(p).getByLabel('Measurement basis', { exact: true }).selectOption('finished');
  const result = (await selected(p)).document.openings.at(-1)!; await closeInspector(p); return result;
}
const OUTPUTS = { 'floor-area': 'Floor area', 'ceiling-area': 'Flat ceiling area', 'gross-wall-area': 'Gross wall area',
  'net-wall-area': 'Net wall area', baseboard: 'Baseboard', 'base-shoe': 'Base shoe', 'opening-inventory': 'Physical opening inventory' };
async function configure(p: Page, output: string) { await takeoff(p).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output); }
async function fixture(p: Page, name = LONG) {
  await p.setViewportSize({ width: 1600, height: 900 }); await p.goto('/physical-draft');
  await p.getByRole('button', { name: 'New physical draft', exact: true }).click();
  const alpha = await room(p, name), door = await opening(p, 'door'), window = await opening(p, 'window');
  for (const [output, label] of Object.entries(OUTPUTS)) {
    await takeoff(p).getByRole('checkbox', { name: 'Measure ' + label, exact: true }).check(); await configure(p, output);
    const kind = ['floor-area', 'ceiling-area'].includes(output) ? 'rooms' : output === 'opening-inventory' ? 'openings' : 'walls';
    await takeoff(p).getByRole('button', { name: 'All current ' + kind, exact: true }).click();
  }
  await configure(p, 'floor-area'); await commit(takeoff(p).getByLabel('Waste percentage', { exact: true }), '10');
  const beta = await room(p, 'Beta guest bedroom', '8 ft', '6 ft');
  await p.getByRole('button', { name, exact: true }).click();
  return { alpha, beta, door, window, name };
}
async function amount(p: Page, output: string, attribute: string, text: string) { await expect(total(p, output).locator('[data-amount="' + attribute + '"]')).toHaveText(text); }
async function knownTotals(p: Page) {
  for (const [output, text] of [['floor-area','120.00 sq ft'],['ceiling-area','120.00 sq ft'],['gross-wall-area','352.00 sq ft'],
    ['net-wall-area','319.00 sq ft'],['baseboard','41.00 ft'],['base-shoe','41.00 ft']]) await amount(p, output, 'net', text);
  await amount(p, 'floor-area', 'adjusted', '132.00 sq ft');
}
async function showDrawing(p: Page) {
  await closeInspector(p); await p.getByRole('tab', { name: 'Drawing', exact: true }).click();
  await drawing(p).getByRole('button', { name: 'Fit drawing', exact: true }).click(); await frames(p);
}
async function selectOpening(p: Page, id: string, edit = false) {
  await closeInspector(p); await p.getByTestId('physical-opening-list-' + id).click();
  if (edit) await openInspector(p);
}
async function historyState(p: Page) {
  return { undo: await undo(p).getAttribute('aria-label'), redo: await redo(p).getAttribute('aria-label'),
    undoDisabled: await undo(p).isDisabled(), redoDisabled: await redo(p).isDisabled() };
}
async function invariant(p: Page, draft: PhysicalDraft, controls?: Awaited<ReturnType<typeof historyState>>) {
  expect(await selected(p)).toEqual(draft); if (controls) expect(await historyState(p)).toEqual(controls);
}
async function fits(p: Page) {
  const overflow = await p.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')].map(n => { const r=n.getBoundingClientRect(); return { tag:n.tagName, id:n.id, testId:n.dataset.testid, class:n.className, text:n.textContent?.slice(0,100), x:r.x, right:r.right, width:r.width, scrollWidth:n.scrollWidth, clientWidth:n.clientWidth, overflow:getComputedStyle(n).overflowX }; }).filter(n=>n.width>0&&(n.right>innerWidth+1||n.x< -1||n.scrollWidth>n.clientWidth+1)).slice(0,35) }));
  if(overflow.scrollWidth>overflow.width+1) await test.info().attach('layout-overflow.json',{body:JSON.stringify(overflow,null,2),contentType:'application/json'});
  expect(overflow.scrollWidth,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width+1);
  expect(await p.getByTestId('physical-view').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  const duplicateIds = await p.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(n => n.id); return ids.filter((id, i) => ids.indexOf(id) !== i); });
  expect(duplicateIds).toEqual([]);
}
async function focusVisibleInDrawer(p: Page) {
  expect(await drawer(p).evaluate(node => node.contains(document.activeElement))).toBe(true);
  const bounds = await p.evaluate(() => { const rect = document.activeElement!.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: innerHeight, width: innerWidth }; });
  expect(bounds.top).toBeGreaterThanOrEqual(-1); expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
  expect(bounds.left).toBeGreaterThanOrEqual(-1); expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
}
const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { errors.set(page, []); writes.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET','HEAD','OPTIONS'].includes(request.method())) writes.get(page)!.push(request.method() + ' ' + request.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

test('docked inspectors retain the populated fixture at desktop widths and enlarged text', async ({ page }) => {
  test.setTimeout(60_000); const { alpha, beta, window, name } = await fixture(page); await knownTotals(page); await showDrawing(page);
  const viewportPolicy=await page.locator('meta[name=viewport]').getAttribute('content'); expect(viewportPolicy).not.toMatch(/maximum-scale\s*=\s*1(?:[., ]|$)|user-scalable\s*=\s*no/i);
  for (const [width, height] of [[1600,900],[1280,720]]) {
    await page.setViewportSize({ width, height }); await openInspector(page);
    await expect(page.getByRole('complementary', { name: 'Drawing inspector', exact: true })).toBeVisible();
    await expect(drawer(page)).toHaveCount(0); await expect(opener(page)).toHaveCount(0);
    await expect(roomForm(page)).toHaveAttribute('data-room-id', alpha.id); await fits(page);
    const canvas = (await page.getByTestId('physical-canvas').boundingBox())!;
    expect(canvas.width).toBeGreaterThan(450); expect(canvas.height).toBeGreaterThanOrEqual(260);
  }
  await commit(field(page, 'Ceiling height'), '9 ft'); await amount(page, 'gross-wall-area', 'net', '396.00 sq ft');
  await undo(page).click(); await knownTotals(page);
  await selectOpening(page, window.id, true); await expect(openingForm(page).getByLabel('Window height', { exact: true })).toHaveValue('3 ft');
  const before = await selected(page), controls = await historyState(page);
  // Explicit text-enlargement method: 200% root font size. This is not a claim
  // of physical-device keyboard testing or desktop browser-zoom certification.
  const style = await page.addStyleTag({ content: ':root { font-size: 200% !important; }' });
  await fits(page); await openingForm(page).getByLabel('Window height', { exact: true }).focus();
  // Inspect the actual rendered text range, not the full-room centering wrapper.
  // Enlarged name badges must leave the separate dimension annotation readable.
  for (const [id, dimensionText, fullName] of [[alpha.id, "12' × 10'", name], [beta.id, "8' × 6'", beta.name]]) {
    const modelRoom = page.getByTestId('physical-room-' + id);
    const badge = await modelRoom.getByTestId('room-name-' + id).boundingBox();
    const dimensions = await modelRoom.getByText(dimensionText, { exact: true }).evaluate(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      const r = range.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    });
    expect(badge).not.toBeNull(); expect(dimensions.width).toBeGreaterThan(0); expect(dimensions.height).toBeGreaterThan(0);
    expect(badge!.y + badge!.height, fullName + ' badge must not cover the centered dimensions').toBeLessThanOrEqual(dimensions.top);
    await expect(modelRoom).toHaveAccessibleName('Select ' + fullName);
    await expect(page.getByRole('button', { name: fullName, exact: true })).toBeVisible();
  }
  await expect(openingForm(page).getByLabel('Window height', { exact: true })).toBeFocused(); await invariant(page, before, controls);
  await page.screenshot({ path: test.info().outputPath('layout-enlarged-text.png'), fullPage: true }); await style.evaluate(node => node.remove());
  await page.setViewportSize({ width: 1600, height: 900 }); await page.getByRole('button', { name, exact: true }).click();
  await drawing(page).getByRole('button', { name: 'Fit drawing', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('layout-desktop-docked.png'), fullPage: true });
});

test('narrow inspector edits synchronize fields and drawing with one focus trap and one Escape owner', async ({ page }) => {
  test.setTimeout(60_000); const { alpha, window, name } = await fixture(page); await showDrawing(page);
  await page.setViewportSize({ width: 390, height: 844 }); await expect(roomForm(page)).toHaveCount(0);
  await openInspector(page); await expect(drawer(page)).toHaveAccessibleName('Edit room: ' + name);
  await expect(drawer(page).getByRole('button', { name: 'Close inspector', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Add room', exact: true })).toHaveCount(0);
  for (let index = 0; index < 11; index++) { await page.keyboard.press(index % 2 ? 'Tab' : 'Shift+Tab'); await focusVisibleInDrawer(page); }
  await commit(field(page, 'Ceiling height'), '9 ft'); await closeInspector(page); await expect(opener(page)).toBeFocused();
  await amount(page, 'gross-wall-area', 'net', '396.00 sq ft'); await undo(page).click(); await knownTotals(page);
  await selectOpening(page, window.id); await expect(drawer(page)).toHaveCount(0); await openInspector(page);
  await expect(openingForm(page)).toHaveCount(1); await expect(openingForm(page)).toHaveAttribute('data-opening-id', window.id);
  for (const [label, text] of [['Window width','3.5 ft'],['Window height','4 ft'],['Sill height','2 ft']]) await commit(openingForm(page).getByLabel(label, { exact: true }), text);
  const edited = (await selected(page)).document.openings.find(o => o.id === window.id)!;
  expect(edited.width.valueMm).toBe(3.5 * 304.8); expect(edited.height.valueMm).toBe(4 * 304.8); expect(edited.sillHeight.valueMm).toBe(2 * 304.8);
  expect(edited.attachments).toEqual(window.attachments); await closeInspector(page);
  await expect(page.getByTestId('physical-opening-' + window.id)).toBeVisible();
  await openInspector(page); await openingForm(page).getByLabel('Window width', { exact: true }).fill('3.5 ft -');
  const pending = await selected(page); await openingForm(page).getByRole('button', { name: 'Common window width', exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden(); await expect(drawer(page)).toBeVisible(); await invariant(page, pending);
  await openingForm(page).getByLabel('Window width', { exact: true }).focus(); await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeVisible(); await expect(openingForm(page).getByLabel('Window width', { exact: true })).toHaveValue('3.5 ft');
  await page.keyboard.press('Escape'); await expect(drawer(page)).toBeHidden(); await expect(opener(page)).toBeFocused();
  await page.setViewportSize({ width: 820, height: 1180 }); await openInspector(page); await fits(page);
  await expect(openingForm(page)).toHaveCount(1);
  const beforeOverlay=await selected(page), betaButton=page.getByRole('button',{name:'Beta guest bedroom',exact:true,includeHidden:true});
  const obscured=(await betaButton.boundingBox())!; await page.mouse.click(obscured.x+obscured.width/2,obscured.y+obscured.height/2);
  await expect(betaButton).toHaveAttribute('aria-pressed','false');
  await expect(page.getByRole('button',{name,exact:true,includeHidden:true})).toHaveAttribute('aria-pressed','true');
  await invariant(page,beforeOverlay); await closeInspector(page);
  expect((await selected(page)).document.rooms.find(r => r.id === alpha.id)!.ceilingHeight.valueMm).toBe(8 * 304.8);
});

test('breakpoint transitions preserve pending text caret units and redo, then reload the latest temporary draft', async ({ page }) => {
  test.setTimeout(60_000); const { alpha, door, name } = await fixture(page); await showDrawing(page);
  await commit(field(page, 'Ceiling height'), '9 ft'); await undo(page).click(); await expect(redo(page)).toBeEnabled();
  await field(page, 'Ceiling height').dispatchEvent('compositionstart');
  await field(page, 'Ceiling height').fill('9 ft'); await field(page, 'Ceiling height').evaluate(node => (node as HTMLInputElement).setSelectionRange(2, 2));
  let before = await selected(page), controls = await historyState(page);
  await page.setViewportSize({ width: 1023, height: 900 }); await expect(drawer(page)).toBeVisible();
  await expect(field(page, 'Ceiling height')).toBeFocused(); expect(await field(page, 'Ceiling height').evaluate(n => (n as HTMLInputElement).selectionStart)).toBe(2);
  await invariant(page, before, controls);
  await drawer(page).getByRole('button',{name:'Close inspector',exact:true}).focus();
  await field(page,'Ceiling height').dispatchEvent('compositionend'); await invariant(page,before,controls);
  await closeInspector(page); await invariant(page, before, controls);
  await openInspector(page); await field(page, 'Ceiling height').focus(); await page.setViewportSize({ width: 1024, height: 900 });
  await expect(drawer(page)).toHaveCount(0); await expect(field(page, 'Ceiling height')).toBeFocused(); await invariant(page, before, controls);
  await page.getByRole('button', { name: 'Revert ceiling height', exact: true }).click();
  await field(page, 'Ceiling height').fill('8 ft -'); await page.getByRole('button', { name: 'Meters', exact: true }).click();
  await selectOpening(page, door.id, true); await openingForm(page).getByLabel('Door width', { exact: true }).fill('0.9 m -'); await closeInspector(page);
  await configure(page, 'floor-area'); await takeoff(page).getByLabel('Waste percentage', { exact: true }).fill('10.');
  before = await selected(page); controls = await historyState(page);
  for (const [width,height] of [[390,844],[1280,720],[820,1180],[844,390]]) {
    await page.setViewportSize({ width,height }); await openInspector(page);
    await expect(openingForm(page).getByLabel('Door width', { exact: true })).toHaveValue('0.9 m -'); await closeInspector(page);
    await page.getByRole('tab', { name: 'Quick Rooms', exact: true }).click();
    await expect(field(page, 'Ceiling height')).toHaveValue('8 ft -'); await invariant(page, before, controls);
    await page.getByRole('tab', { name: 'Drawing', exact: true }).click(); await invariant(page, before, controls);
  }
  await openInspector(page); await page.getByRole('button', { name: 'Revert door width', exact: true }).click();
  const reverted = await selected(page); expect(reverted.fields[alpha.id]).toEqual(before.fields[alpha.id]);
  expect(reverted.takeoffState).toEqual(before.takeoffState); expect(reverted.document).toEqual(before.document); expect(await historyState(page)).toEqual(controls);
  await closeInspector(page); await page.getByRole('link', { name: 'Standalone Quick Rooms', exact: true }).click();
  await page.goto('/physical-draft'); await page.reload(); await invariant(page, reverted);
  await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
  await expect(field(page, 'Ceiling height')).toHaveValue('8 ft -'); await expect(takeoff(page).getByLabel('Waste percentage', { exact: true })).toHaveValue('10.');
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('opening gestures use current resized bounds on every wall and cancel when the surface changes', async ({ page }) => {
  test.setTimeout(60_000); const { alpha, door } = await fixture(page); await showDrawing(page);
  for (const [side,width,height,ratio] of [['top',390,844,.35],['right',820,1180,.4],['bottom',844,390,.6],['left',1280,720,.65]] as const) {
    await page.setViewportSize({ width,height }); await selectOpening(page, door.id, true); await closeInspector(page);
    await drawing(page).getByRole('button', { name: 'Fit drawing', exact: true }).click();
    await drawing(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded(); await frames(page);
    const before = await selected(page), start = (await page.getByTestId('physical-opening-' + door.id).boundingBox())!;
    await page.mouse.move(start.x+start.width/2,start.y+start.height/2); await page.mouse.down(); await frames(page);
    await expect(drawer(page)).toHaveCount(0);
    const bounds = (await page.getByTestId('physical-room-' + alpha.id).boundingBox())!;
    const point = wallPoint(bounds, side, ratio); await page.mouse.move(point.x,point.y,{steps:7}); await page.mouse.up();
    const after = await selected(page), moved = after.document.openings.find(o => o.id === door.id)!;
    expect(moved.attachments[0].wallFaceId).toBe(alpha.wallFaces.find(w => w.side === side)!.id);
    const mm = ['top','bottom'].includes(side) ? alpha.length.valueMm! : alpha.width.valueMm!;
    const pixels = ['top','bottom'].includes(side) ? bounds.width : bounds.height;
    expect(Math.abs(moved.attachments[0].offsetMm-mm*ratio)).toBeLessThanOrEqual(mm/pixels+1e-7);
    expect({ ...moved, attachments: door.attachments }).toEqual(door); expect(after.document.rooms).toEqual(before.document.rooms);
    expect(after.openingEvents).toHaveLength(before.openingEvents!.length+1); await expect(undo(page)).toHaveAccessibleName('Undo door move');
  }
  await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded(); const box = (await page.getByTestId('physical-opening-' + door.id).boundingBox())!;
  const before = await selected(page), controls = await historyState(page);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+20,box.y+20);
  await page.setViewportSize({ width: 820,height: 1180 }); await page.mouse.up(); await invariant(page,before,controls);
});
function wallPoint(bounds: {x:number;y:number;width:number;height:number}, side: WallSide, ratio: number) {
  return { x: side==='left'?bounds.x:side==='right'?bounds.x+bounds.width:bounds.x+bounds.width*(side==='bottom'?1-ratio:ratio),
    y: side==='top'?bounds.y:side==='bottom'?bounds.y+bounds.height:bounds.y+bounds.height*(side==='left'?1-ratio:ratio) };
}

test('Locate source preserves selection and scope while Edit source opens the intended narrow inspector', async ({ page }) => {
  test.setTimeout(60_000); const { alpha,beta,window } = await fixture(page); await page.setViewportSize({width:820,height:1180});
  await page.getByRole('button',{name:'Beta guest bedroom',exact:true}).click();
  await card(page,'net-wall-area').getByText('Show breakdown',{exact:true}).click();
  const locate = card(page,'net-wall-area').locator('[data-target-id]').filter({has:page.getByRole('heading',{name:alpha.name+' · top wall',exact:true})}).getByRole('button',{name:'Locate source',exact:true});
  const before = await selected(page), controls = await historyState(page); await locate.focus(); await locate.press('Enter');
  await expect(page.getByRole('tab',{name:'Drawing',exact:true})).toHaveAttribute('aria-selected','true'); await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Beta guest bedroom',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('physical-source-wall-'+alpha.wallFaces[0].id)).toBeVisible(); await expect(locate).toBeFocused(); await invariant(page,before,controls);
  const reviewToggle=takeoff(page).getByRole('button',{name:'Review inputs',exact:true}); await reviewToggle.click();
  await takeoff(page).getByRole('combobox',{name:'Review target',exact:true}).selectOption('opening:'+window.id);
  await takeoff(page).getByRole('button',{name:'Edit in inspector',exact:true}).click();
  await expect(drawer(page)).toBeVisible(); await expect(openingForm(page)).toHaveAttribute('data-opening-id',window.id); await invariant(page,before,controls);
  await closeInspector(page); await takeoff(page).getByRole('combobox',{name:'Review target',exact:true}).selectOption('room:'+beta.id);
  const trigger=page.getByTestId('review-field-room-'+beta.id+'-length').getByRole('button',{name:'Review Length',exact:true}); await trigger.click();
  const review=page.getByRole('dialog',{name:'Review measurement',exact:true}); await expect(review).toBeVisible(); await expect(drawer(page)).toHaveCount(0);
  await expect(review.getByRole('button',{name:'Close review',exact:true})).toBeFocused(); await page.keyboard.press('Tab');
  expect(await review.evaluate(node=>node.contains(document.activeElement))).toBe(true); await page.keyboard.press('Escape');
  await expect(review).toBeHidden(); await expect(trigger).toBeFocused(); await invariant(page,before,controls);
  const scope=takeoff(page).getByRole('checkbox',{name:'Show takeoff scope in drawing',exact:true}); await scope.uncheck(); await scope.check(); await invariant(page,before,controls);
});

test('deleting a drawer target restores logical focus and both guarded opening recovery paths', async ({ page }) => {
  test.setTimeout(60_000); const {door,window,name}=await fixture(page); await showDrawing(page); await page.setViewportSize({width:390,height:844});
  await selectOpening(page,door.id,true); const before=await selected(page);
  await openingForm(page).getByRole('button',{name:'Delete door',exact:true}).click();
  await expect(drawer(page)).toBeHidden(); await expect(openingForm(page)).toHaveCount(0);
  expect((await selected(page)).document.openings.map(o=>o.id)).toEqual([window.id]);
  expect(await page.evaluate(()=>Boolean(document.activeElement?.isConnected && document.activeElement!==document.body))).toBe(true);
  await undo(page).click(); expect((await selected(page)).document.openings.map(o=>o.id)).toEqual([door.id,window.id]);
  await selectOpening(page,door.id,true); await expect(openingForm(page)).toHaveAttribute('data-opening-id',door.id); await closeInspector(page);
  await redo(page).click(); await page.getByRole('button',{name:'Undo opening delete',exact:true}).click();
  const restored=await selected(page); expect(restored.document).toEqual(before.document); expect(restored.request).toEqual(before.request);
  await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled(); await expect(drawer(page)).toHaveCount(0);
  await expect(page.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
  await openInspector(page); await expect(openingForm(page)).toHaveAttribute('data-opening-id',door.id); await closeInspector(page);
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight)); expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(100);
});

test('320px and short-landscape reflow keep invalid drawer fields, focus and explicit partial takeoff reachable', async ({ page }) => {
  test.setTimeout(60_000); const name='Bedroom'+ 'LongUnbrokenRoomName'.repeat(5), {window}=await fixture(page,name); await showDrawing(page);
  for(const [size,width,height] of [['phone',390,844],['narrow',320,844],['landscape',844,390]] as const){
    await page.setViewportSize({width,height}); await selectOpening(page,window.id,true);
    await openingForm(page).getByLabel('Window height',{exact:true}).fill('99 ft'); await openingForm(page).getByLabel('Window height',{exact:true}).press('Enter');
    await expect(openingForm(page)).toContainText(/fit.*ceiling|ceiling.*height/i); await fits(page);
    await openingForm(page).getByLabel('Window height',{exact:true}).focus(); await focusVisibleInDrawer(page);
    await page.screenshot({path:test.info().outputPath('layout-'+size+'-invalid-drawer.png'),fullPage:false});
    await page.getByRole('button',{name:'Revert window height',exact:true}).click();
    await openingForm(page).getByRole('button',{name:'Common window height',exact:true}).click(); await page.keyboard.press('End');
    const lastPreset=page.getByRole('menu').getByRole('menuitem').last(); await expect(lastPreset).toBeFocused();
    const lastBounds=(await lastPreset.boundingBox())!; expect(lastBounds.y).toBeGreaterThanOrEqual(0); expect(lastBounds.y+lastBounds.height).toBeLessThanOrEqual(height+1);
    await page.keyboard.press('Escape'); await expect(drawer(page)).toBeVisible();
    await openingForm(page).getByRole('button',{name:'Common window width',exact:true}).focus(); await page.keyboard.press('Tab'); await focusVisibleInDrawer(page);
    await closeInspector(page); await fits(page);
  }
  await page.setViewportSize({width:390,height:844}); await openInspector(page); await commit(openingForm(page).getByLabel('Window height',{exact:true}),'');
  await closeInspector(page); await expect(total(page,'net-wall-area')).toContainText('Full selected total unavailable');
  await expect(card(page,'net-wall-area').getByTestId('takeoff-subtotal').locator('[data-amount="net"]')).toHaveText('256.00 sq ft');
  await amount(page,'floor-area','adjusted','132.00 sq ft'); await fits(page);
  await card(page,'net-wall-area').scrollIntoViewIfNeeded(); await page.screenshot({path:test.info().outputPath('layout-phone-partial.png'),fullPage:true});
});
