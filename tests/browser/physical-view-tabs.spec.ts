import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import type { PhysicalDraft } from '../../client/src/features/physical-draft/state';

const QUICK_KEY = 'modern-floor-planner:quick-rooms:v1';
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Physical draft views', exact: true });
const tab = (page: Page, view: 'rooms' | 'drawing') => tabs(page).getByRole('tab', { name: view === 'rooms' ? 'Quick Rooms' : 'Drawing', exact: true });
const activePanel = (page: Page) => page.getByRole('tabpanel');
const roomInspector = (page: Page) => page.getByTestId('physical-room-inspector');
const openingInspector = (page: Page) => page.getByTestId('physical-opening-inspector');
const field = (page: Page, label: string) => roomInspector(page).getByLabel(new RegExp('^' + label + ' \\((ft|m)\\)$'));
const takeoff = (page: Page) => page.getByTestId('takeoff-panel');
const card = (page: Page, output: string) => page.getByTestId('takeoff-output-' + output);
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

// Public UI creates every fixture; storage is inspected read-only for exact
// domain, raw-input, evidence, request and source invariance.
async function selected(page: Page): Promise<PhysicalDraft> {
  await expect.poll(async () => parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY)).status).toBe('recovered');
  const parsed = parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY));
  if (parsed.status !== 'recovered') throw new Error('Expected validated recovery');
  const draft = parsed.registry.drafts.find(value => value.id === parsed.registry.selectedDraftId);
  if (!draft) throw new Error('No selected physical draft');
  return draft;
}
async function commit(input: Locator, value: string) { await input.fill(value); await input.press('Enter'); await input.press('Tab'); }
async function room(page: Page, name = 'Alpha') {
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await roomInspector(page).getByLabel('Room name', { exact: true }).fill(name);
  for (const [name, value] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) await commit(field(page, name), value);
  return (await selected(page)).document.rooms.find(value => value.name === name)!;
}
async function start(page: Page, name = 'Alpha') {
  await page.goto('/physical-draft'); await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  return room(page, name);
}
async function windowOpening(page: Page) {
  await page.getByRole('button', { name: 'Create window', exact: true }).click();
  for (const [name, value] of [['Position from wall start', '8 ft'], ['Window width', '4 ft'], ['Window height', '3 ft'], ['Sill height', '3 ft']]) {
    await commit(openingInspector(page).getByLabel(name, { exact: true }), value);
  }
  await openingInspector(page).getByLabel('Measurement basis', { exact: true }).selectOption('finished');
  return (await selected(page)).document.openings.at(-1)!;
}
async function work(page: Page) {
  for (const [output, name, kind] of [['floor-area', 'Floor area', 'rooms'], ['net-wall-area', 'Net wall area', 'walls']]) {
    await takeoff(page).getByRole('checkbox', { name: 'Measure ' + name, exact: true }).check();
    await takeoff(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output);
    await takeoff(page).getByRole('button', { name: 'All current ' + kind, exact: true }).click();
  }
  await takeoff(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption('floor-area');
}
async function reviewTarget(page: Page, key: string) {
  const toggle = takeoff(page).getByRole('button', { name: 'Review inputs', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await takeoff(page).getByRole('combobox', { name: 'Review target', exact: true }).selectOption(key);
}
async function semantics(page: Page, view: 'rooms' | 'drawing') {
  await expect(tabs(page).getByRole('tab')).toHaveCount(2);
  await expect(tabs(page).locator('[tabindex="0"]')).toHaveCount(1);
  await expect(tab(page, view)).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, view === 'rooms' ? 'drawing' : 'rooms')).toHaveAttribute('aria-selected', 'false');
  for (const name of ['rooms', 'drawing'] as const) {
    await expect(tab(page, name)).toHaveAttribute('id', 'physical-' + name + '-tab');
    await expect(tab(page, name)).toHaveAttribute('aria-controls', 'physical-' + name + '-panel');
    const panel = page.locator('#physical-' + name + '-panel');
    await expect(panel).toHaveCount(1); await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', 'physical-' + name + '-tab');
    if (name === view) { await expect(panel).toBeVisible(); await expect(panel).toHaveAttribute('tabindex', '0'); }
    else await expect(panel).toBeHidden();
  }
  await expect(activePanel(page)).toHaveCount(1);
  await expect(activePanel(page)).toHaveAccessibleName(view === 'rooms' ? 'Quick Rooms' : 'Drawing');
  await expect(page.getByTestId('physical-canvas')).toHaveCount(1);
  const duplicateIds = await page.getByTestId('physical-view').evaluate(root => {
    const ids = [...root.querySelectorAll('[id]')].map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  expect(duplicateIds).toEqual([]);
}
async function enterFromBefore(page: Page, selectedView: 'rooms' | 'drawing') {
  await page.getByRole('button', { name: 'Meters', exact: true }).focus();
  await page.keyboard.press('Tab'); await expect(tab(page, selectedView)).toBeFocused();
}
const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); writes.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.get(page)!.push(request.method() + ' ' + request.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

test('physical view tabs rove focus, activate manually, and leave one accessible editor without a keyboard trap', async ({ page }) => {
  const alpha = await start(page); await enterFromBefore(page, 'rooms');
  const before = await selected(page); await semantics(page, 'rooms');
  for (const [key, focused] of [['ArrowLeft', 'drawing'], ['ArrowRight', 'rooms'], ['ArrowRight', 'drawing'],
    ['ArrowRight', 'rooms'], ['End', 'drawing'], ['Home', 'rooms']] as const) {
    await page.keyboard.press(key); await expect(tab(page, focused)).toBeFocused(); await semantics(page, 'rooms');
    expect(await selected(page)).toEqual(before);
  }
  await page.keyboard.press('End'); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Add room', exact: true })).toBeFocused();
  await expect(tab(page, 'rooms')).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('Shift+Tab'); await expect(tab(page, 'rooms')).toBeFocused();
  await page.keyboard.press('End'); await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Meters', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(tab(page, 'rooms')).toBeFocused();
  await page.keyboard.press('End'); await page.keyboard.press('Enter'); await semantics(page, 'drawing');
  await expect(tab(page, 'drawing')).toBeFocused();
  const canvas = await page.getByTestId('physical-canvas').elementHandle();
  await page.keyboard.press('Enter'); await tab(page, 'drawing').click();
  expect(await canvas!.evaluate(node => node.isConnected)).toBe(true);
  // Observe actual window bubbling: drawing's global pan listener must not see
  // tab Space keydown, while keyup still reaches its held-key cleanup.
  const windowSpace: string[] = [];
  await page.exposeFunction('recordViewTabSpace', (type: string) => windowSpace.push(type));
  await page.evaluate(() => {
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
      if ((event as KeyboardEvent).code === 'Space') (window as unknown as { recordViewTabSpace: (type: string) => void }).recordViewTabSpace(type);
    });
  });
  await page.keyboard.down('Space'); await frames(page); expect(windowSpace).toEqual([]);
  expect(await canvas!.evaluate(node => node.isConnected)).toBe(true); await semantics(page, 'drawing');
  await page.keyboard.up('Space'); await expect.poll(() => windowSpace).toEqual(['keyup']);
  expect(await canvas!.evaluate(node => node.isConnected)).toBe(true); expect(await selected(page)).toEqual(before);
  await page.keyboard.press('Home'); await expect(tab(page, 'rooms')).toBeFocused();
  await page.keyboard.down('Space'); await semantics(page, 'drawing');
  await page.keyboard.up('Space'); await semantics(page, 'rooms'); await expect(tab(page, 'rooms')).toBeFocused();
  await tab(page, 'drawing').click(); await semantics(page, 'drawing');
  await page.getByRole('button', { name: 'Add room', exact: true }).focus();
  await page.keyboard.press('Shift+Tab'); await expect(tab(page, 'drawing')).toBeFocused();
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Alpha', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(activePanel(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(activePanel(page).getByRole('button', { name: 'Add Door', exact: true })).toBeFocused();
  expect(await selected(page)).toEqual(before);
  await expect(roomInspector(page)).toHaveAttribute('data-room-id', alpha.id);
});

test('pending room opening and waste fields retain exact evidence source and scope through manual views and recovery', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/quick-room'); await page.getByRole('button', { name: 'Add room', exact: true }).click();
  const quick = page.getByTestId('quick-room-card');
  await quick.getByLabel('Room name', { exact: true }).fill('Alpha');
  for (const [name, value] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) await commit(quick.getByLabel(name, { exact: true }), value);
  const original = await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY); expect(original).not.toBeNull();
  await page.getByRole('button', { name: 'Open a physical copy', exact: true }).click();
  const alpha = (await selected(page)).document.rooms[0]; const window = await windowOpening(page); await work(page);
  await reviewTarget(page, 'room:' + alpha.id);
  await page.getByTestId('review-field-room-' + alpha.id + '-length').getByRole('button', { name: 'Review Length', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review measurement', exact: true }).getByRole('button', { name: 'Confirm reviewed value', exact: true }).click();
  await commit(takeoff(page).getByLabel('Waste percentage', { exact: true }), '10');
  await field(page, 'Ceiling height').fill('8 ft -');
  await openingInspector(page).getByLabel('Window height', { exact: true }).fill('3 ft -');
  await takeoff(page).getByLabel('Waste percentage', { exact: true }).fill('10.');
  await page.getByRole('button', { name: 'Meters', exact: true }).click(); await enterFromBefore(page, 'rooms');
  const pending = await selected(page);
  expect(pending.document.rooms[0].length.state === 'known' && pending.document.rooms[0].length.provenance.confirmation.status).toBe('confirmed');
  const quantities = await page.locator('[data-testid^="takeoff-output-"]').allTextContents();
  for (const view of ['drawing', 'rooms', 'drawing', 'rooms'] as const) {
    await page.keyboard.press(view === 'drawing' ? 'End' : 'Home'); await page.keyboard.press('Enter');
    await semantics(page, view); expect(await selected(page)).toEqual(pending);
    await expect(page.getByTestId('physical-opening-list-' + window.id)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Alpha', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('[data-testid^="takeoff-output-"]').allTextContents()).toEqual(quantities);
  }
  await expect(field(page, 'Ceiling height')).toHaveValue('8 ft -');
  await expect(openingInspector(page).getByLabel('Window height', { exact: true })).toHaveValue('3 ft -');
  await expect(card(page, 'floor-area').getByTestId('takeoff-total').locator('[data-amount="adjusted"]')).toContainText(/unavailable/i);
  await page.reload(); expect(await selected(page)).toEqual(pending); await semantics(page, 'rooms');
  await expect(field(page, 'Ceiling height')).toHaveValue('8 ft -');
  await page.getByTestId('physical-opening-list-' + window.id).click();
  await expect(openingInspector(page).getByLabel('Window height', { exact: true })).toHaveValue('3 ft -');
  await takeoff(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption('floor-area');
  await expect(takeoff(page).getByLabel('Waste percentage', { exact: true })).toHaveValue('10.');
  expect(await selected(page)).toEqual(pending); expect(await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY)).toBe(original);
});

test('tab navigation leaves text editing selectors review menus and composition to their own controls', async ({ page }) => {
  const alpha = await start(page); await work(page);
  const length = field(page, 'Length'); await length.fill('12 ft -');
  await length.press('Home'); expect(await length.evaluate(node => (node as HTMLInputElement).selectionStart)).toBe(0);
  await length.press('End'); expect(await length.evaluate(node => (node as HTMLInputElement).selectionStart)).toBe(7);
  await length.press('ArrowLeft'); expect(await length.evaluate(node => (node as HTMLInputElement).selectionStart)).toBe(6);
  await length.press('ArrowRight'); await length.press('Space'); await expect(length).toHaveValue('12 ft - '); await semantics(page, 'rooms');
  await length.dispatchEvent('compositionstart'); await length.press('ArrowRight'); await length.press('Escape');
  await expect(length).toHaveValue('12 ft - '); await expect(length).toBeFocused();
  await length.dispatchEvent('compositionend'); await length.press('Escape'); await expect(length).toHaveValue('12 ft');
  const selectedBeforeTabs = await selected(page);
  await enterFromBefore(page, 'rooms');
  for (const key of ['ArrowUp', 'ArrowDown']) {
    const prevented = await tab(page, 'rooms').evaluate((node, key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); node.dispatchEvent(event); return event.defaultPrevented;
    }, key);
    expect(prevented).toBe(false); await expect(tab(page, 'rooms')).toBeFocused(); await semantics(page, 'rooms');
  }
  for (const mode of ['composing', 'handled', 'modified']) {
    await tab(page, 'rooms').evaluate((node, mode) => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true,
        isComposing: mode === 'composing', ctrlKey: mode === 'modified' });
      if (mode === 'handled') event.preventDefault(); node.dispatchEvent(event);
    }, mode);
    await expect(tab(page, 'rooms')).toBeFocused(); await semantics(page, 'rooms');
  }
  expect(await selected(page)).toEqual(selectedBeforeTabs);
  const configure = takeoff(page).getByRole('combobox', { name: 'Configure work', exact: true });
  await configure.focus(); await configure.press('Home'); await configure.press('End'); await configure.press('Space'); await configure.press('Escape');
  await expect(configure).toBeFocused(); await semantics(page, 'rooms'); expect(await selected(page)).toEqual(selectedBeforeTabs);
  await reviewTarget(page, 'room:' + alpha.id);
  const trigger = page.getByTestId('review-field-room-' + alpha.id + '-width').getByRole('button', { name: 'Review Width', exact: true });
  await trigger.click(); const dialog = page.getByRole('dialog', { name: 'Review measurement', exact: true });
  const close = dialog.getByRole('button', { name: 'Close review', exact: true }); await close.focus();
  await expect(tabs(page)).toHaveCount(0); // The modal correctly hides background semantics.
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) { await close.press(key); await expect(close).toBeFocused(); await expect(page.locator('#physical-rooms-tab')).toHaveAttribute('aria-selected', 'true'); }
  await close.press('Space'); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
  await trigger.click(); await expect(dialog).toBeVisible(); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
  const window = await windowOpening(page); const beforeMenu = await selected(page);
  await openingInspector(page).getByRole('button', { name: 'Common window width', exact: true }).click();
  await page.keyboard.press('End'); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu')).toBeVisible(); await expect(page.locator('#physical-rooms-tab')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toBeHidden(); expect(await selected(page)).toEqual(beforeMenu);
  expect((await selected(page)).document.openings[0].id).toBe(window.id);
});

test('Locate source and explicit Edit in inspector select the matching panel while keeping invocation focus and scope separate', async ({ page }) => {
  const alpha = await start(page), window = await windowOpening(page), beta = await room(page, 'Beta'); await work(page);
  await card(page, 'net-wall-area').getByText('Show breakdown', { exact: true }).click();
  const row = card(page, 'net-wall-area').locator('[data-target-id]').filter({ has: page.getByRole('heading', { name: 'Alpha · top wall', exact: true }) });
  const locate = row.getByRole('button', { name: 'Locate source', exact: true }); await locate.focus(); const before = await selected(page);
  await locate.press('Enter'); await semantics(page, 'drawing'); await expect(locate).toBeFocused();
  await expect(page.getByTestId('physical-source-wall-' + alpha.wallFaces[0].id)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beta', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(roomInspector(page)).toHaveAttribute('data-room-id', beta.id); expect(await selected(page)).toEqual(before);
  await expect(tab(page, 'drawing')).toHaveAttribute('tabindex', '0');
  await tab(page, 'rooms').click(); await reviewTarget(page, 'opening:' + window.id);
  const edit = takeoff(page).getByRole('button', { name: 'Edit in inspector', exact: true }); await edit.focus(); await edit.press('Enter');
  await semantics(page, 'drawing'); await expect(edit).toBeFocused();
  await expect(openingInspector(page)).toHaveAttribute('data-opening-id', window.id);
  await expect(page.getByRole('button', { name: 'Alpha', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('physical-opening-list-' + window.id)).toHaveAttribute('aria-pressed', 'true');
  expect(await selected(page)).toEqual(before);
  const drawing = await page.getByTestId('physical-canvas').elementHandle();
  await tab(page, 'drawing').click(); await page.keyboard.press('Space');
  expect(await drawing!.evaluate(node => node.isConnected)).toBe(true); expect(await selected(page)).toEqual(before);
});

test.describe('physical view tab touch and focus', () => {
  test.use({ hasTouch: true });
  test('populated desktop and phone distinguish keyboard focus from selection and retain native touch activation', async ({ page }) => {
    await start(page, 'Bedroom with north windows and hallway access'); await windowOpening(page);
    await page.getByRole('button', { name: 'Bedroom with north windows and hallway access', exact: true }).click();
    const before = await selected(page);
    for (const [name, width, height] of [['desktop', 1600, 1200], ['phone', 390, 844]] as const) {
      await page.setViewportSize({ width, height }); await tab(page, 'rooms').tap();
      await page.getByRole('region', { name: 'Physical drawing', exact: true }).getByRole('button', { name: 'Fit drawing', exact: true }).click();
      await enterFromBefore(page, 'rooms'); await page.keyboard.press('ArrowRight');
      await semantics(page, 'rooms'); await expect(tab(page, 'drawing')).toBeFocused();
      expect(await tab(page, 'drawing').evaluate(node => node.matches(':focus-visible'))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await tabs(page).scrollIntoViewIfNeeded(); await frames(page);
      await page.screenshot({ path: test.info().outputPath('physical-view-tabs-focus-' + name + '.png'), fullPage: true });
      await page.keyboard.press('Space'); await semantics(page, 'drawing'); await expect(tab(page, 'drawing')).toBeFocused();
      await tab(page, 'rooms').tap(); await semantics(page, 'rooms');
      await tab(page, 'drawing').tap(); await semantics(page, 'drawing'); expect(await selected(page)).toEqual(before);
    }
  });
});
