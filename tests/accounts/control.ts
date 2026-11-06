import assert from 'node:assert/strict';
export type SupabaseFixtureMode = 'normal' | 'token-failure' | 'user-failure' | 'invalid-user';
export async function configureSupabase(options: { mode?: SupabaseFixtureMode; userDelayMs?: number; subjectPrefix?: string } = {}) {
  const response = await fetch(`${process.env.MFP_ACCOUNTS_SUPABASE_ORIGIN}/test/control`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mfp-fixture-control': process.env.MFP_ACCOUNTS_CONTROL_SECRET! }, body: JSON.stringify(options) });
  assert.equal(response.status, 200, 'Fixture configuration rejected');
}
export async function supabaseEvents(): Promise<Record<string, number>> {
  const response = await fetch(`${process.env.MFP_ACCOUNTS_SUPABASE_ORIGIN}/test/events`,
    { headers: { 'x-mfp-fixture-control': process.env.MFP_ACCOUNTS_CONTROL_SECRET! } });
  assert.equal(response.status, 200); return response.json();
}
