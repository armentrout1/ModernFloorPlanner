import { currentLocalContext, setLocalContext, workspaceContext, UNASSIGNED_CONTEXT } from './localContexts';

export interface AccountWorkspace { id: string; name: string; role: string }
export interface AccountSession {
  status: 'authenticated' | 'anonymous' | 'unavailable' | 'expired' | 'revoked';
  contextToken: string | null;
  principal: { id: string; displayName: string } | null;
  workspace: AccountWorkspace | null;
  workspaces: AccountWorkspace[];
  expiresAt?: number;
}
const empty: AccountSession = { status: 'unavailable', contextToken: null, principal: null, workspace: null, workspaces: [] };
export interface AccountSnapshot { session: AccountSession; generation: number; checking: boolean; initialized: boolean; editorContext: string | null; message: string }
const savedContext = currentLocalContext();
let snapshot: AccountSnapshot = { session: empty, generation: 0, checking: false, initialized: false,
  editorContext: savedContext === UNASSIGNED_CONTEXT ? savedContext : null, message: '' };
const listeners = new Set<() => void>();
const controllers = new Set<AbortController>();
let refreshPromise: Promise<AccountSession> | null = null;
let refreshSequence = 0;
let channel: BroadcastChannel | null = null;
let suspended: { context: string; identity: string } | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
export class WorkspaceContextRequired extends Error {}
export class AccountContextChanged extends Error {
  constructor() { super('The account or workspace changed. The previous request was not applied to this editor.'); this.name = 'AccountContextChanged'; }
}
function publish(next: AccountSnapshot) { snapshot = next; listeners.forEach(listener => listener()); }
function identity(session: AccountSession) { return `${session.principal?.id ?? ''}:${session.workspace?.id ?? ''}:${session.contextToken ?? ''}`; }
export function invalidateAccount(message = 'Checking account access. Previous private work is preserved separately.') {
  ++refreshSequence;
  refreshPromise = null;
  controllers.forEach(controller => controller.abort()); controllers.clear();
  if (snapshot.editorContext && snapshot.editorContext !== UNASSIGNED_CONTEXT) suspended = { context: snapshot.editorContext, identity: identity(snapshot.session) };
  const editorContext = snapshot.editorContext === UNASSIGNED_CONTEXT ? UNASSIGNED_CONTEXT : null;
  if (!editorContext) setLocalContext(null);
  publish({ ...snapshot, generation: snapshot.generation + 1, checking: true, editorContext, message });
  window.dispatchEvent(new Event('mfp-account-invalidated'));
}
function accept(session: AccountSession) {
  const changed = identity(session) !== identity(snapshot.session);
  if (changed) {
    controllers.forEach(controller => controller.abort()); controllers.clear();
    window.dispatchEvent(new Event('mfp-account-invalidated'));
  }
  let editorContext = snapshot.editorContext;
  if (editorContext && editorContext !== UNASSIGNED_CONTEXT && editorContext !== (session.principal && session.workspace ? workspaceContext(session.principal.id, session.workspace.id) : null)) editorContext = null;
  if (!editorContext && suspended?.identity === identity(session) && session.principal && session.workspace &&
      suspended.context === workspaceContext(session.principal.id, session.workspace.id)) {
    editorContext = suspended.context; setLocalContext(editorContext);
  }
  suspended = null;
  clearTimeout(expiryTimer);
  if (session.status === 'authenticated' && typeof session.expiresAt === 'number') {
    expiryTimer = setTimeout(() => {
      invalidateAccount('Your sign-in may have expired. Previous private work is preserved separately.');
      void refreshAccount().catch(() => {});
    }, Math.max(1, Math.min(2147483647, session.expiresAt - Date.now())));
  }
  // A recovered bound context is offered for explicit resumption, never silently
  // selected from a registry that may belong to a previous person.
  publish({ session, generation: snapshot.generation + (changed ? 1 : 0), checking: false, initialized: true, editorContext, message: '' });
}
function parseSession(value: unknown): AccountSession {
  const x = value as AccountSession;
  if (!x || !['authenticated','anonymous','unavailable','expired','revoked'].includes(x.status) || !Array.isArray(x.workspaces)) throw Error('Invalid session response');
  if (x.status === 'authenticated' && (!x.principal?.id || typeof x.contextToken !== 'string')) throw Error('Invalid session response');
  return x;
}
export async function refreshAccount(): Promise<AccountSession> {
  if (refreshPromise) return refreshPromise;
  const sequence = ++refreshSequence;
  const pending = (async () => {
    let next = empty;
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
      if (res.ok) next = parseSession(await res.json());
    } catch { /* No provider details or private response bodies enter UI/logs. */ }
    if (sequence !== refreshSequence) throw new AccountContextChanged();
    accept(next);
    return next;
  })().finally(() => { if (refreshPromise === pending) refreshPromise = null; });
  refreshPromise = pending;
  return pending;
}
export interface RequestContext { generation: number; token: string | null; workspace: string | null; principal: string | null }
export async function captureRequestContext(): Promise<RequestContext> {
  const intended = { initialized: snapshot.initialized, generation: snapshot.generation, context: snapshot.editorContext };
  await refreshAccount();
  if (intended.initialized && (intended.generation !== snapshot.generation || intended.context !== snapshot.editorContext)) throw new AccountContextChanged();
  return { generation: snapshot.generation, token: snapshot.session.contextToken, workspace: snapshot.session.workspace?.id ?? null, principal: snapshot.session.principal?.id ?? null };
}
export function assertRequestContext(context: RequestContext) {
  if (snapshot.checking || context.generation !== snapshot.generation || context.token !== snapshot.session.contextToken) throw new AccountContextChanged();
}
export async function contextFetch(method: string, url: string, data?: unknown, captured?: RequestContext): Promise<Response> {
  const context = captured ?? await captureRequestContext();
  assertRequestContext(context);
  if (url.startsWith('/api/floor-plans') && snapshot.session.status === 'authenticated' &&
      (!snapshot.session.principal || !snapshot.session.workspace ||
       snapshot.editorContext !== workspaceContext(snapshot.session.principal.id, snapshot.session.workspace.id))) {
    throw new WorkspaceContextRequired('Select and resume the verified workspace local context before accessing server-saved sketches. Unassigned drafts remain separate.');
  }
  const controller = new AbortController(); controllers.add(controller);
  try {
    const response = await fetch(url, { method, credentials: 'include', cache: 'no-store', signal: controller.signal,
      headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(!['GET','HEAD','OPTIONS'].includes(method.toUpperCase()) ? { 'X-MFP-Request': '1' } : {}),
        ...(context.token ? { 'X-MFP-Context': context.token } : {}), ...(context.workspace ? { 'X-MFP-Workspace-Id': context.workspace } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data) });
    assertRequestContext(context);
    // Recheck after body consumption too. Fetch fulfillment is not the end of an operation.
    const originalJson = response.json.bind(response);
    response.json = async () => { const value = await originalJson(); assertRequestContext(context); return value; };
    if ([401,403,404,409].includes(response.status) && snapshot.session.status === 'authenticated') {
      invalidateAccount('Server access changed. Previous private work is preserved separately.');
      void refreshAccount().catch(() => {});
    }
    return response;
  } catch (error) {
    if (controller.signal.aborted) throw new AccountContextChanged();
    throw error;
  } finally { controllers.delete(controller); }
}
export async function accountAction(path: string, data: unknown) {
  const intended = identity(snapshot.session);
  const context = await captureRequestContext();
  if (intended !== identity(snapshot.session)) throw new AccountContextChanged();
  const response = await contextFetch('POST', path, data, context);
  if (!response.ok) throw new Error(response.status === 503 ? 'Sign-in services are unavailable. Your local work is unchanged.' : 'The account request was not accepted. Refresh account access and try again.');
  return response.json();
}
export function resumeLocalContext(context: string) {
  if (snapshot.checking) throw new AccountContextChanged();
  const { principal, workspace } = snapshot.session;
  if (context !== UNASSIGNED_CONTEXT && (!principal || !workspace || context !== workspaceContext(principal.id, workspace.id))) throw new AccountContextChanged();
  if (snapshot.editorContext !== context) {
    controllers.forEach(controller => controller.abort()); controllers.clear();
    window.dispatchEvent(new Event('mfp-account-invalidated'));
  }
  setLocalContext(context); publish({ ...snapshot, editorContext: context, generation: snapshot.generation + 1 });
}
export async function announceAccountChange() {
  invalidateAccount();
  // Establish this tab's new anonymous/authenticated cookie before asking peer
  // tabs to revalidate; simultaneous cookie-less GETs must not race by design.
  const next = await refreshAccount();
  channel?.postMessage({ type: 'session-changed' });
  return next;
}
export function initializeAccountEvents() {
  const changed = () => { if (!snapshot.initialized && snapshot.editorContext === UNASSIGNED_CONTEXT) return; invalidateAccount(); void refreshAccount().catch(() => {}); };
  const visibility = () => { if (document.visibilityState === 'visible') changed(); };
  try { channel = new BroadcastChannel('modern-floor-planner:account-events:v1'); channel.onmessage = event => { if (event.data?.type === 'session-changed') { invalidateAccount(); void refreshAccount().catch(() => {}); } }; } catch { /* focus and pre-action revalidation remain */ }
  window.addEventListener('focus', changed); document.addEventListener('visibilitychange', visibility);
  if (savedContext !== UNASSIGNED_CONTEXT || location.pathname === '/account/callback') void refreshAccount().catch(() => {});
  return () => { channel?.close(); channel = null; window.removeEventListener('focus', changed); document.removeEventListener('visibilitychange', visibility); };
}
export const accountStore = { getSnapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
