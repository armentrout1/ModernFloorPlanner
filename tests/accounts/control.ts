import assert from 'node:assert/strict';
export type IssuerFailure = 'normal' | 'wrong-issuer' | 'wrong-audience' | 'wrong-azp' | 'wrong-nonce' | 'wrong-signature'
  | 'expired-token' | 'expired-code' | 'wrong-pkce' | 'wrong-state' | 'token-failure' | 'missing-id-token' | 'malformed-token';
export async function configureIssuer(options: { mode?: IssuerFailure; discoveryFailure?: boolean; discoveryIssuerMismatch?: boolean; tokenDelayMs?: number; subjectPrefix?: string } = {}) {
  const response = await fetch(`${process.env.MFP_ACCOUNTS_ISSUER_ORIGIN}/test/control`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mfp-fixture-control': process.env.MFP_ACCOUNTS_CONTROL_SECRET! }, body: JSON.stringify(options) });
  assert.equal(response.status, 200, 'Fixture configuration rejected');
}
export async function issuerEvents(): Promise<Record<string, number>> {
  const response = await fetch(`${process.env.MFP_ACCOUNTS_ISSUER_ORIGIN}/test/events`,
    { headers: { 'x-mfp-fixture-control': process.env.MFP_ACCOUNTS_CONTROL_SECRET! } });
  assert.equal(response.status, 200); return response.json();
}
