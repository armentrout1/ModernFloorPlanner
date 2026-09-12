import { test, expect, type Page } from '@playwright/test';
import { configureIssuer } from '../accounts/control';
import { capturePhysicalSaveEnvelope } from '../../shared/persistence/physicalSave';
import { richPhysicalSaveDraft } from '../fixtures/physicalSave';
import { setup, api, counts, deferred, setAutosave, autosave, membership, resumeLocal } from '../autosave/helpers';
import { savePanel, roomField, commit, selectedPhysical, account, panel, signIn, selectWorkspace } from './browser-helpers';
import { PROJECT_ACTION_STORAGE_KEY } from '../../client/src/features/physical-draft/projectLifecycleClient';

const projects = (page: Page) => page.getByRole('region', { name: 'Saved physical plans', exact: true });
const row = (page: Page, id: string) => projects(page).locator('[data-project-id="' + id + '"]');
async function list(page: Page) {
  await savePanel(page).getByRole('button', { name: 'Open saved plan', exact: true }).click();
  await expect(projects(page)).toBeVisible();
  await expect(projects(page).getByText('Loading saved projects...', { exact: true })).toHaveCount(0);
}
async function choose(page: Page, name: 'Active' | 'Archived') {
  const response = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/physical-plans' && new URL(r.url()).searchParams.get('status') === name.toLowerCase());
  await projects(page).getByRole('tab', { name, exact: true }).click(); expect((await response).status()).toBe(200);
  await expect(projects(page).getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
}
async function mutate(page: Page, id: string, operation: 'duplicate' | 'archive' | 'restore') {
  const received = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/physical-plans/' + id + '/' + operation);
  if (operation === 'archive') {
    await row(page, id).getByRole('button', { name: 'Archive project', exact: true }).click();
    await row(page, id).getByRole('button', { name: 'Confirm archive', exact: true }).click();
  } else await row(page, id).getByRole('button', { name: operation === 'duplicate' ? 'Duplicate saved revision' : 'Restore project', exact: true }).click();
  const response = await received; expect([200, 201]).toContain(response.status()); const result = await response.json();
  await expect(projects(page).getByRole('button', { name: 'Retry same project action', exact: true })).toHaveCount(0);
  return result;
}
async function pendingBytes(page: Page) {
  return page.evaluate(key => {
    const context = sessionStorage.getItem('modern-floor-planner:working-context:v1');
    return sessionStorage.getItem('modern-floor-planner:context:v1:' + context + ':' + key);
  }, PROJECT_ACTION_STORAGE_KEY);
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }, info) => {
  await configureIssuer({ subjectPrefix: 'projects-' + info.testId.replace(/[^A-Za-z0-9_-]/g, '').slice(-40) });
  errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test('duplicate uses the listed saved schema5 revision and preserves current unfinished local work', async ({ page }) => {
  await setup(page, 'Current local work');
  const created = await api(page, '/api/physical-plans', 'POST', capturePhysicalSaveEnvelope(richPhysicalSaveDraft()), { 'Idempotency-Key': crypto.randomUUID() });
  expect(created.status).toBe(201); const source = created.value;
  await roomField(page, 'Ceiling height').fill('9 ft -'); const before = await selectedPhysical(page);
  await list(page); const result = await mutate(page, source.planId, 'duplicate');
  expect(result.plan.planId).not.toBe(source.planId); expect(result.plan.revisionNumber).toBe(1);
  expect(result.plan.copiedFrom).toEqual({ planId: source.planId, revisionId: source.revisionId });
  await expect(row(page, result.plan.planId).getByText('Copy', { exact: true })).toBeVisible();
  const copied = await api(page, '/api/physical-plans/' + result.plan.planId);
  expect(copied.value.revisionId).not.toBe(source.revisionId); expect(copied.value.envelope).toEqual(source.envelope);
  expect(copied.value.evaluation).toEqual(source.evaluation);
  expect((await api(page, '/api/physical-plans/' + source.planId)).value.envelope).toEqual(source.envelope);
  expect(await selectedPhysical(page)).toEqual(before); await expect(roomField(page, 'Ceiling height')).toHaveValue('9 ft -');
  expect(await counts(source.planId)).toEqual({ revisions: 1, receipts: 1 });
  await projects(page).screenshot({ path: test.info().outputPath('projects-active-copy.png') });
});

test('archive and restore preserve saved revisions, raw local fields and paused autosave', async ({ page }) => {
  const { saved } = await setup(page, 'Retained project'); await setAutosave(page);
  await roomField(page, 'Ceiling height').fill('9 ft -'); const before = await selectedPhysical(page);
  await list(page); await row(page, saved.planId).getByRole('button', { name: 'Archive project', exact: true }).click();
  await row(page, saved.planId).getByRole('button', { name: 'Cancel archive', exact: true }).click();
  expect(await selectedPhysical(page)).toEqual(before); await expect(autosave(page)).toBeChecked();
  await mutate(page, saved.planId, 'archive'); await expect(row(page, saved.planId)).toHaveCount(0); await expect(autosave(page)).not.toBeChecked();
  await choose(page, 'Archived'); await expect(row(page, saved.planId)).toBeVisible();
  const archived = await api(page, '/api/physical-plans/' + saved.planId);
  expect(archived.value.archivedAt).not.toBeNull(); expect(archived.value.envelope).toEqual(saved.envelope);
  expect(archived.value.revisionId).toBe(saved.revisionId);
  expect(await selectedPhysical(page)).toEqual(before); await expect(roomField(page, 'Ceiling height')).toHaveValue('9 ft -');
  await mutate(page, saved.planId, 'restore'); await expect(row(page, saved.planId)).toHaveCount(0); await choose(page, 'Active');
  await expect(row(page, saved.planId)).toBeVisible(); await expect(autosave(page)).not.toBeChecked();
  expect(await selectedPhysical(page)).toEqual(before);
  expect((await api(page, '/api/physical-plans/' + saved.planId)).value.archivedAt).toBeNull();
  expect(await counts(saved.planId)).toEqual({ revisions: 1, receipts: 1 });
});

test('a lost duplicate response retains exact request across same-tab reload and resolves one receipt', async ({ page }) => {
  const { saved } = await setup(page, 'Same request'); await list(page);
  const requests: Array<{ key: string; body: string | null; etag: string }> = []; let lost = true;
  await page.route('**/api/physical-plans/*/duplicate', async route => {
    requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData(), etag: route.request().headers()['if-match'] });
    const response = await route.fetch(); expect([200, 201]).toContain(response.status());
    if (lost) { lost = false; await route.abort('failed'); } else await route.fulfill({ response });
  });
  await row(page, saved.planId).getByRole('button', { name: 'Duplicate saved revision', exact: true }).click();
  await expect(projects(page).getByRole('button', { name: 'Retry same project action', exact: true })).toBeEnabled();
  const bytes = await pendingBytes(page); expect(bytes).not.toBeNull();
  expect(Object.keys(JSON.parse(bytes!).intent).sort()).toEqual(['etag', 'key', 'operation', 'planId', 'revisionId']);
  expect((await api(page, '/api/physical-plans')).value.plans).toHaveLength(2);
  await page.reload(); await resumeLocal(page); await list(page);
  expect(await pendingBytes(page)).toBe(bytes); expect(requests).toHaveLength(1);
  await projects(page).getByRole('button', { name: 'Retry same project action', exact: true }).click();
  await expect(projects(page).getByRole('button', { name: 'Retry same project action', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]); expect(await pendingBytes(page)).toBeNull();
  expect((await api(page, '/api/physical-plans')).value.plans).toHaveLength(2);
  expect(await counts(saved.planId)).toEqual({ revisions: 1, receipts: 1 });
});

test('denied action-intent storage refuses mutation and preserves current local fields', async ({ page }) => {
  const { saved } = await setup(page, 'Storage guard'); await roomField(page, 'Length').fill('12 ft -'); const before = await selectedPhysical(page);
  await list(page); let mutations = 0;
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/duplicate')) mutations++; });
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name.endsWith(key)) throw new DOMException('Synthetic quota denial', 'QuotaExceededError'); return original.call(this, name, value); };
  }, PROJECT_ACTION_STORAGE_KEY);
  await row(page, saved.planId).getByRole('button', { name: 'Duplicate saved revision', exact: true }).click();
  await expect(projects(page)).toContainText('no project mutation was sent'); expect(mutations).toBe(0);
  expect(await pendingBytes(page)).toBeNull(); expect(await selectedPhysical(page)).toEqual(before);
  expect((await api(page, '/api/physical-plans')).value.plans).toHaveLength(1);
});

test('late active-list responses cannot replace archived results or reopen a closed list', async ({ page }) => {
  const { saved } = await setup(page, 'List race'); await list(page); await mutate(page, saved.planId, 'archive');
  const received = deferred(), release = deferred(), finished = deferred();
  await page.route('**/api/physical-plans?*', async route => {
    if (route.request().method() !== 'GET' || new URL(route.request().url()).searchParams.get('status') !== 'active') return route.continue();
    const response = await route.fetch(); received.resolve(); await release.promise;
    try { await route.fulfill({ response }); } finally { finished.resolve(); }
  });
  try {
    await projects(page).getByRole('button', { name: 'Refresh projects', exact: true }).click(); await received.promise;
    await choose(page, 'Archived'); await expect(row(page, saved.planId)).toBeVisible(); release.resolve(); await finished.promise;
    await expect(projects(page).getByRole('tab', { name: 'Archived', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(row(page, saved.planId)).toBeVisible();
    await page.unroute('**/api/physical-plans?*');
    const closeReceived = deferred(), closeRelease = deferred(), closeFinished = deferred();
    await page.route('**/api/physical-plans?*', async route => {
      const response = await route.fetch(); closeReceived.resolve(); await closeRelease.promise;
      try { await route.fulfill({ response }); } finally { closeFinished.resolve(); }
    });
    await projects(page).getByRole('button', { name: 'Refresh projects', exact: true }).click(); await closeReceived.promise;
    await projects(page).getByRole('button', { name: 'Close saved plans', exact: true }).click();
    closeRelease.resolve(); await closeFinished.promise; await expect(projects(page)).toHaveCount(0);
  } finally { release.resolve(); await page.unroute('**/api/physical-plans?*'); }
});

test('logout during an accepted project action cannot repaint private lists or replace unassigned drafts', async ({ page }) => {
  const { saved } = await setup(page, 'Private lifecycle'); await list(page); const received = deferred(), release = deferred(), finished = deferred();
  await page.route('**/api/physical-plans/*/duplicate', async route => {
    const response = await route.fetch(); expect([200, 201]).toContain(response.status()); received.resolve(); await release.promise;
    try { await route.fulfill({ response }); } catch { /* Old context may abort delivery. */ } finally { finished.resolve(); }
  });
  try {
    await row(page, saved.planId).getByRole('button', { name: 'Duplicate saved revision', exact: true }).click(); await received.promise;
    await account(page); await panel(page).getByRole('button', { name: 'Sign out', exact: true }).click(); release.resolve(); await finished.promise;
    await expect(projects(page)).toHaveCount(0); await expect(page.getByText('Private lifecycle', { exact: true })).toHaveCount(0);
    await panel(page).getByRole('button', { name: 'Resume unassigned local-only work', exact: true }).click();
    await expect(page.getByTestId('physical-saved-revision')).toHaveCount(0); await expect(savePanel(page)).not.toContainText('independent project');
  } finally { release.resolve(); await page.unroute('**/api/physical-plans/*/duplicate'); }
});

test('viewer can open archived projects but cannot mutate them; long names remain usable on a phone', async ({ page, browser }) => {
  const { saved: original, workspace } = await setup(page, 'Viewer archive');
  const longName = 'SavedProject_' + 'LongUnbrokenName'.repeat(14);
  const appended = await api(page, '/api/physical-plans/' + original.planId + '/revisions', 'POST',
    { ...original.envelope, document: { ...original.envelope.document, name: longName } },
    { 'Idempotency-Key': crypto.randomUUID(), 'If-Match': original.etag });
  expect(appended.status).toBe(201); const saved = appended.value;
  await list(page); await mutate(page, saved.planId, 'archive');
  const session = await api(page, '/api/auth/session'); await membership(workspace.id, session.value.principal.id, { role: 'viewer' });
  const context = await browser.newContext({ baseURL: process.env.MFP_ACCOUNTS_APP_ORIGIN, viewport: { width: 390, height: 844 } });
  try {
    const viewer = await context.newPage(); await viewer.goto('/physical-draft'); await signIn(viewer); await selectWorkspace(viewer, workspace.id); await list(viewer); await choose(viewer, 'Archived');
    await expect(row(viewer, saved.planId)).toBeVisible();
    await expect(row(viewer, saved.planId)).toContainText(longName);
    await expect(projects(viewer).getByRole('button', { name: 'Restore project', exact: true })).toHaveCount(0);
    await expect(projects(viewer).getByRole('button', { name: 'Duplicate saved revision', exact: true })).toHaveCount(0);
    expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await savePanel(viewer).screenshot({ path: test.info().outputPath('projects-phone-archived-viewer.png') });
    await row(viewer, saved.planId).getByRole('button', { name: 'Open separate copy', exact: true }).click();
    await expect(savePanel(viewer)).toContainText('Opened a separate local copy.');
    await expect(autosave(viewer)).toBeDisabled(); expect(capturePhysicalSaveEnvelope(await selectedPhysical(viewer))).toEqual(saved.envelope);
  } finally { await context.close(); }
});


test('accepted action with denied receipt cleanup keeps the exact key and retries without duplicating again', async ({ page }) => {
  const { saved } = await setup(page, 'Cleanup failure'); await list(page);
  await page.evaluate(key => {
    const original = Storage.prototype.removeItem;
    (window as Window & { restoreProjectRemove?: () => void }).restoreProjectRemove = () => { Storage.prototype.removeItem = original; };
    Storage.prototype.removeItem = function(name) { if (name.endsWith(key)) throw new DOMException('Synthetic cleanup denial', 'SecurityError'); return original.call(this, name); };
  }, PROJECT_ACTION_STORAGE_KEY);
  const requests: Array<{ key: string; body: string | null }> = [];
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/duplicate')) requests.push({ key: request.headers()['idempotency-key'], body: request.postData() }); });
  await row(page, saved.planId).getByRole('button', { name: 'Duplicate saved revision', exact: true }).click();
  await expect(projects(page)).toContainText('local receipt cleanup was unavailable');
  expect(await pendingBytes(page)).not.toBeNull(); expect((await api(page, '/api/physical-plans')).value.plans).toHaveLength(2);
  await page.evaluate(() => (window as Window & { restoreProjectRemove?: () => void }).restoreProjectRemove!());
  await projects(page).getByRole('button', { name: 'Retry same project action', exact: true }).click();
  await expect(projects(page).getByRole('button', { name: 'Retry same project action', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]); expect(await pendingBytes(page)).toBeNull();
  expect((await api(page, '/api/physical-plans')).value.plans).toHaveLength(2);
});

test('unsupported action recovery bytes stay intact and block new lifecycle mutations', async ({ page }) => {
  const { saved } = await setup(page, 'Preserved unsupported intent');
  const preserved = '{"version":"future-project-action","intent":{"doNotLose":true}}';
  await page.evaluate(({ key, bytes }) => {
    const context = sessionStorage.getItem('modern-floor-planner:working-context:v1');
    sessionStorage.setItem('modern-floor-planner:context:v1:' + context + ':' + key, bytes);
  }, { key: PROJECT_ACTION_STORAGE_KEY, bytes: preserved });
  await list(page); await expect(projects(page)).toContainText('unsupported data');
  await expect(row(page, saved.planId).getByRole('button', { name: 'Duplicate saved revision', exact: true })).toBeDisabled();
  expect(await pendingBytes(page)).toBe(preserved); expect((await api(page, '/api/physical-plans')).value.plans).toHaveLength(1);
});


test('a restore accepted after closing the project list updates archived status without replacing local work', async ({ page }) => {
  const { saved } = await setup(page, 'Restore after close'); await setAutosave(page);
  await roomField(page, 'Ceiling height').fill('9 ft -'); const before = await selectedPhysical(page);
  await list(page); await mutate(page, saved.planId, 'archive'); await choose(page, 'Archived');
  await expect(autosave(page)).toBeDisabled();
  const received = deferred(), release = deferred(), finished = deferred();
  await page.route('**/api/physical-plans/*/restore', async route => {
    const response = await route.fetch(); expect(response.status()).toBe(200); received.resolve(); await release.promise;
    try { await route.fulfill({ response }); } finally { finished.resolve(); }
  });
  try {
    await row(page, saved.planId).getByRole('button', { name: 'Restore project', exact: true }).click(); await received.promise;
    await projects(page).getByRole('button', { name: 'Close saved plans', exact: true }).click();
    await expect(projects(page)).toHaveCount(0); release.resolve(); await finished.promise;
    await expect(autosave(page)).toBeEnabled(); await expect(autosave(page)).not.toBeChecked();
    await expect(projects(page)).toHaveCount(0); expect(await selectedPhysical(page)).toEqual(before);
    await expect(roomField(page, 'Ceiling height')).toHaveValue('9 ft -'); expect(await pendingBytes(page)).toBeNull();
    expect((await api(page, '/api/physical-plans/' + saved.planId)).value.archivedAt).toBeNull();
    expect(await counts(saved.planId)).toEqual({ revisions: 1, receipts: 1 });
  } finally { release.resolve(); await page.unroute('**/api/physical-plans/*/restore'); }
});
