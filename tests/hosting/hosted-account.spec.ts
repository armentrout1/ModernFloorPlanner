import { test, expect } from '@playwright/test';
import { configureIssuer } from '../accounts/control';
import { account, panel, signIn, createWorkspace, selectWorkspace, physical, roomField, selectedPhysical, savePanel, savePhysical } from '../persistence/browser-helpers';
import { capturePhysicalSaveEnvelope } from '../../shared/persistence/physicalSave';
import { PHYSICAL_DRAFT_STORAGE_KEY } from '../../client/src/features/physical-draft/storage';

test.beforeEach(async ({}, info) => configureIssuer({ subjectPrefix: 'host-ui-' + info.testId.replace(/[^A-Za-z0-9_-]/g, '').slice(-35) }));

test('HTTPS edge login rotates Secure cookies and preserves unapplied anonymous work across the real callback', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let uploads = 0; page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/physical-plans')) uploads++; });
  await physical(page, 'Synthetic unassigned room'); await roomField(page, 'Length').fill('12 ft -');
  await account(page); await expect(panel(page).getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  const before = await page.evaluate(key => sessionStorage.getItem(key), PHYSICAL_DRAFT_STORAGE_KEY);
  const rawBefore = await selectedPhysical(page);
  const prior = (await context.cookies()).find(cookie => cookie.name === '__Host-mfp-session'); expect(Boolean(prior)).toBe(true);
  await signIn(page); const cookie = (await context.cookies()).find(item => item.name === '__Host-mfp-session');
  expect(Boolean(cookie && prior && cookie.value !== prior.value)).toBe(true);
  expect(cookie && { secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, path: cookie.path }).toEqual({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
  expect(page.url()).toBe(process.env.MFP_ACCOUNTS_APP_ORIGIN + '/physical-draft');
  await expect(panel(page)).toContainText('Local drafts have not been uploaded or assigned');
  await panel(page).getByRole('button', { name: 'Resume unassigned local-only work', exact: true }).click();
  await expect(roomField(page, 'Length')).toHaveValue('12 ft -'); expect(await selectedPhysical(page)).toEqual(rawBefore);
  expect(await page.evaluate(key => sessionStorage.getItem(key), PHYSICAL_DRAFT_STORAGE_KEY)).toBe(before);
  expect(uploads).toBe(0); expect(errors).toEqual([]);
  await page.getByTestId('physical-room-inspector').screenshot({ path: test.info().outputPath('hosted-preserved-raw-room.png') });
});

test('browser can save and reopen SQL content through hosted transport; logout blocks the former private context', async ({ page, browser }) => {
  await page.goto('/physical-draft'); await signIn(page); const workspace = await createWorkspace(page, 'Hosting Save');
  await physical(page, 'Synthetic hosted saved room'); const original = await selectedPhysical(page); const saved = await savePhysical(page);
  expect(saved.envelope).toEqual(capturePhysicalSaveEnvelope(original));
  await savePanel(page).screenshot({ path: test.info().outputPath('hosted-saved-plan.png') });
  const fresh = await browser.newContext({ baseURL: process.env.MFP_ACCOUNTS_APP_ORIGIN });
  try {
    const copy = await fresh.newPage(); await copy.goto('/physical-draft'); await signIn(copy); await selectWorkspace(copy, workspace.id);
    await savePanel(copy).getByRole('button', { name: 'Open saved plan', exact: true }).click();
    await savePanel(copy).getByRole('button', { name: 'Open separate copy', exact: true }).first().click();
    await expect(copy.getByTestId('physical-save-status')).toHaveText(/^Saved revision /);
    expect(capturePhysicalSaveEnvelope(await selectedPhysical(copy))).toEqual(saved.envelope);
    await expect(roomField(copy, 'Length')).toHaveValue('12 ft');
  } finally { await fresh.close(); }
  const session = await page.evaluate(() => fetch('/api/auth/session').then(response => response.json()));
  await account(page); await panel(page).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  const status = await page.evaluate(async ({ planId, contextToken, workspaceId }) => (await fetch('/api/physical-plans/' + planId,
    { headers: { 'X-MFP-Context': contextToken, 'X-MFP-Workspace-Id': workspaceId } })).status,
    { planId: saved.planId, contextToken: session.contextToken, workspaceId: workspace.id });
  expect(status).toBe(401);
  await expect(page.getByTestId('physical-draft-id')).toHaveCount(0);
});
