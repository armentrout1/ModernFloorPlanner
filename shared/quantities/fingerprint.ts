import { canonicalJson } from './canonicalJson';

/** Platform Web Crypto adapter; arithmetic has no hashing/runtime dependency.
 * Supported in Node 20 and secure browser contexts, including loopback tests.
 */
export async function sha256Canonical(input: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(input));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
