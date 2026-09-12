import { test, expect, type Page } from '@playwright/test';
import { configureIssuer } from '../accounts/control';
import { parseRegistry } from '../../client/src/features/physical-draft/storage';
import { RECOVERY_JOURNAL_NAME } from '../../client/src/features/physical-draft/recoveryJournal';
import { setup, counts, roomField, commit, selectedPhysical, savePanel, saveButton,
  recoveryStatus, resumeLocal, deferred } from './helpers';

test.beforeEach(async ({}, info) => configureIssuer({ subjectPrefix: 'journal-crash-' + info.testId.replace(/[^A-Za-z0-9_-]/g, '').slice(-35) }));

type Row = { key: string; value: any; bytes: string };
async function rows(page: Page): Promise<Row[]> {
  return page.evaluate(async name => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const q = indexedDB.open(name); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    try { return await new Promise<Row[]>((resolve, reject) => {
      const tx = db.transaction('branches'), store = tx.objectStore('branches'), result: Row[] = [], q = store.openCursor();
      q.onsuccess = () => { const c = q.result; if (c) { result.push({ key: String(c.key), value: c.value, bytes: JSON.stringify(c.value) }); c.continue(); } };
      tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }, RECOVERY_JOURNAL_NAME);
}
async function branch(page: Page, planId: string, pending = false) {
  await expect.poll(async () => (await rows(page)).filter(r => r.value.scope.planId === planId && (!pending || r.value.intent)).length).toBeGreaterThan(0);
  return (await rows(page)).find(r => r.value.scope.planId === planId && (!pending || r.value.intent))!;
}
async function resumeBranch(page: Page, branchId: string) {
  await resumeLocal(page);
  await savePanel(page).getByRole('button', { name: 'Find recovery on this device', exact: true }).click();
  await savePanel(page).locator(`[data-branch-id="${branchId}"]`).getByRole('button', { name: 'Resume recovery', exact: true }).click();
  await expect(savePanel(page)).toContainText('Resumed recovery as a separate local draft.');
  await expect(page.getByTestId('physical-saved-revision')).toBeVisible();
}
const requestIdentity = (request: { headers(): Record<string, string>; postData(): string | null }) => ({
  key: request.headers()['idempotency-key'], base: request.headers()['if-match'], body: request.postData(),
});

test('G/L: real SQL commit followed by local acknowledgement abort preserves newer raw bytes and replays one receipt after reload', async ({ page }) => {
  const { saved } = await setup(page, 'ack-transaction-abort');
  const committed = deferred(), release = deferred(), requests: ReturnType<typeof requestIdentity>[] = [];
  let first = true;
  await page.route('**/api/physical-plans/*/revisions', async route => {
    requests.push(requestIdentity(route.request()));
    const response = await route.fetch();
    if (first) { first = false; committed.resolve(); await release.promise; }
    await route.fulfill({ response });
  });
  await commit(roomField(page, 'Ceiling height'), '9 ft');
  await saveButton(page).click(); await committed.promise;
  await roomField(page, 'Width').fill('10 ft -');
  const newer = await selectedPhysical(page), source = await branch(page, saved.planId, true);
  await expect.poll(async () => {
    const row = (await rows(page)).find(r => r.key === source.key);
    if (!row) return '';
    const recovered = parseRegistry(row.value.draftText);
    return recovered.status === 'recovered' ? recovered.registry.drafts[0].fields[newer.document.rooms[0].id].width.text : '';
  }).toBe('10 ft -');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as any).ackAbortCount = 0;
    IDBObjectStore.prototype.put = function (...args: any[]) {
      const q = original.apply(this, args as any), value = args[0];
      if (this.name === 'branches' && value?.state === 'checkpointed' && value.intent === null && value.binding?.revisionNumber === 2) {
        q.addEventListener('success', () => { ++(window as any).ackAbortCount; this.transaction.abort(); }, { once: true });
      }
      return q;
    };
  });
  release.resolve();
  await expect.poll(() => page.evaluate(() => (window as any).ackAbortCount)).toBe(1);
  await expect(recoveryStatus(page)).toContainText('unavailable');
  await expect.poll(async () => (await rows(page)).find(r => r.key === source.key)?.value.state).toBe('uncertain');
  expect(await counts(saved.planId)).toEqual({ revisions: 2, receipts: 2 });
  expect(await selectedPhysical(page)).toEqual(newer);
  const pending = (await rows(page)).find(r => r.key === source.key)!;
  expect(pending.value.binding.revisionNumber).toBe(1);
  expect(pending.value.intent.key).toBe(requests[0].key);
  const preserved = parseRegistry(pending.value.draftText);
  expect(preserved.status).toBe('recovered');
  if (preserved.status !== 'recovered') throw Error('Missing complete journal draft');
  expect(preserved.registry.drafts[0]).toEqual(newer);

  await page.reload(); // Clears only this synthetic page's injected fault.
  await resumeBranch(page, source.value.scope.branchId);
  await expect(roomField(page, 'Width')).toHaveValue('10 ft -');
  await savePanel(page).getByRole('button', { name: 'Retry same save request', exact: true }).click();
  await expect(page.getByTestId('physical-saved-revision')).toContainText(' · revision 2 · ');
  await expect(roomField(page, 'Width')).toHaveValue('10 ft -');
  const restored = await selectedPhysical(page);
  expect({ ...restored, id: newer.id }).toEqual(newer);
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  expect(await counts(saved.planId)).toEqual({ revisions: 2, receipts: 2 });
  expect((await rows(page)).find(r => r.key === source.key)?.bytes).toBe(pending.bytes);
});

test('J: two resumed copies of one uncertain request share an atomic attempt claim and never create another revision', async ({ page, context }) => {
  const { saved } = await setup(page, 'copied-uncertain-request');
  let originalRequest: ReturnType<typeof requestIdentity> | undefined;
  await page.route('**/api/physical-plans/*/revisions', async route => {
    originalRequest = requestIdentity(route.request()); await route.fetch(); await route.abort('failed');
  });
  await commit(roomField(page, 'Ceiling height'), '9 ft'); await saveButton(page).click();
  await expect(page.getByTestId('physical-save-status')).toContainText(/failed/i);
  const source = await branch(page, saved.planId, true);
  await expect.poll(async () => (await rows(page)).find(r => r.key === source.key)?.value.state).toBe('uncertain');
  const sourceBytes = (await rows(page)).find(r => r.key === source.key)!.bytes;
  const a = await context.newPage(), b = await context.newPage(), held = deferred(), release = deferred();
  const requests: ReturnType<typeof requestIdentity>[] = [];
  try {
    for (const p of [a, b]) { await p.goto('/physical-draft'); await resumeBranch(p, source.value.scope.branchId); }
    expect((await selectedPhysical(a)).id).not.toBe((await selectedPhysical(b)).id);
    await a.route('**/api/physical-plans/*/revisions', async route => {
      requests.push(requestIdentity(route.request())); const response = await route.fetch(); held.resolve(); await release.promise; await route.fulfill({ response });
    });
    let bPosts = 0;
    b.on('request', req => { if (req.method() === 'POST' && /\/api\/physical-plans\/[^/]+\/revisions$/.test(new URL(req.url()).pathname)) { ++bPosts; requests.push(requestIdentity(req)); } });
    await savePanel(a).getByRole('button', { name: 'Retry same save request', exact: true }).click(); await held.promise;
    await savePanel(b).getByRole('button', { name: 'Retry same save request', exact: true }).click();
    await expect(savePanel(b)).toContainText('This exact request is being resolved by another editor');
    expect(bPosts).toBe(0); expect(await counts(saved.planId)).toEqual({ revisions: 2, receipts: 2 });
    release.resolve(); await expect(a.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
    await savePanel(b).getByRole('button', { name: 'Retry same save request', exact: true }).click();
    await expect(b.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
    expect(bPosts).toBe(1); expect(requests).toHaveLength(2);
    for (const request of requests) expect(request).toEqual(originalRequest);
    expect(await counts(saved.planId)).toEqual({ revisions: 2, receipts: 2 });
    expect((await rows(page)).find(r => r.key === source.key)?.bytes).toBe(sourceBytes);
  } finally { release.resolve(); await a.close(); await b.close(); }
});

test('L: corrupt and unsupported journal branches show recovery failure while memory and prior bytes remain untouched', async ({ page }) => {
  const { saved } = await setup(page, 'invalid-journal-record');
  const source = await branch(page, saved.planId);
  let posts = 0;
  page.on('request', req => { if (req.method() === 'POST' && new URL(req.url()).pathname.startsWith('/api/physical-plans')) ++posts; });
  for (const kind of ['corrupt', 'unsupported'] as const) {
    const invalid = structuredClone(source.value);
    if (kind === 'corrupt') invalid.draftText = '{invalid checkpoint'; else invalid.version = 99;
    await page.evaluate(async ({ name, key, value }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const q = indexedDB.open(name); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
      try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('branches', 'readwrite'); tx.objectStore('branches').put(value, key); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
    }, { name: RECOVERY_JOURNAL_NAME, key: source.key, value: invalid });
    const bytes = (await rows(page)).find(r => r.key === source.key)!.bytes;
    await savePanel(page).getByRole('button', { name: 'Find recovery on this device', exact: true }).click();
    await expect(savePanel(page).getByRole('alert')).toContainText(kind === 'corrupt' ? /could not be validated|corrupt/i : /unsupported/i);
    await expect(savePanel(page).getByRole('button', { name: 'Resume recovery', exact: true })).toHaveCount(0);
    const raw = kind === 'corrupt' ? '10 ft -' : '11 ft -';
    await roomField(page, 'Width').fill(raw);
    await expect(recoveryStatus(page)).toContainText('unavailable');
    await expect(roomField(page, 'Width')).toHaveValue(raw);
    const memory = await selectedPhysical(page);
    expect(memory.fields[memory.document.rooms[0].id].width.text).toBe(raw);
    expect((await rows(page)).find(r => r.key === source.key)?.bytes).toBe(bytes);
    expect(await counts(saved.planId)).toEqual({ revisions: 1, receipts: 1 }); expect(posts).toBe(0);
  }
});
