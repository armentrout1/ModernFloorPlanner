import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { runInputLayoutTransition } from '@/utils/inputLayout';
import { accountStore, refreshAccount, accountAction, announceAccountChange, resumeLocalContext, initializeAccountEvents } from './runtime';
import { checkpointContext, workspaceContext, UNASSIGNED_CONTEXT } from './localContexts';

const checkpointMessage = 'Refresh recovery is unavailable. Your unfinished work is still held in this page. Stay here and restore browser storage before leaving; no account transition has been started.';
export default function AccountPanel() {
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState(''), [selectedWorkspace, setSelectedWorkspace] = useState('');
  const busyRef = useRef(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [callbackMessage, setCallbackMessage] = useState('');
  useEffect(initializeAccountEvents, []);
  useEffect(() => { setSelectedWorkspace(account.session.workspace?.id ?? ''); }, [account.session.workspace?.id]);
  useEffect(() => {
    if (location.pathname !== '/account/callback') return;
    const result = new URLSearchParams(location.search).get('result');
    let returnPath = '/';
    try { const saved = sessionStorage.getItem('modern-floor-planner:account-return:v1'); if (['/','/quick-room','/physical-draft'].includes(saved ?? '')) returnPath = saved!; } catch { /* safe default */ }
    history.replaceState(null, '', returnPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setCallbackMessage(result === 'success' ? 'Signed in. Local drafts have not been uploaded or assigned to a workspace.' : result === 'cancelled' ? 'Sign-in cancelled. Your local recovery is unchanged.' : 'Sign-in could not be completed. Your local recovery is unchanged.');
    setOpen(true); void announceAccountChange().catch(() => {});
  }, []);
  async function action(operation: () => Promise<void>, checkpoint = true) {
    if (busyRef.current) return;
    setError('');
    if (checkpoint && !checkpointContext(account.editorContext)) { setError(checkpointMessage); return; }
    busyRef.current = true; setBusy(true);
    try { await operation(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Account services are unavailable.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function login() {
    const returnPath = ['/','/quick-room','/physical-draft'].includes(location.pathname) ? location.pathname : '/';
    sessionStorage.setItem('modern-floor-planner:account-return:v1', returnPath);
    const response = await accountAction('/api/auth/login', { returnPath });
    if (typeof response.authorizationUrl !== 'string' || new URL(response.authorizationUrl).protocol !== 'https:') throw Error('The sign-in service did not provide a secure redirect.');
    location.assign(response.authorizationUrl);
  }
  const { session } = account;
  const workspace = session.workspace;
  const scope = session.principal && workspace ? workspaceContext(session.principal.id, workspace.id) : null;
  return <>
    <Button type="button" size="sm" variant="outline" className="fixed bottom-2 left-2 z-40 bg-white shadow" data-physical-layout-control
      onPointerDownCapture={() => runInputLayoutTransition(() => {})}
      onClick={() => runInputLayoutTransition(() => { setOpen(true); void refreshAccount().catch(() => {}); })}>Account</Button>
    {!account.editorContext && <section className="mx-auto max-w-xl p-8" aria-label="Choose local working context">
      <h1 className="text-xl font-semibold">Your previous work is preserved separately</h1>
      <p className="my-4">Choose a verified workspace or explicitly resume your unassigned local-only work using Account. Previous private records are hidden.</p>
      <Button onClick={() => setOpen(true)}>Choose working context</Button>
    </section>}
    <Dialog open={open} onOpenChange={next => { if (!busy) runInputLayoutTransition(() => setOpen(next)); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-physical-layout-control>
        <DialogHeader><DialogTitle>Account and local work</DialogTitle></DialogHeader>
        <p className="text-sm">Browser drafts are local-only. Account labels do not encrypt local recovery or authorize server access. Use a separate browser profile on a shared device.</p>
        {callbackMessage && <p role="status" className="text-sm">{callbackMessage}</p>}
        {account.checking && <p role="status">Checking account access…</p>}
        {session.status === 'authenticated' ? <>
          <p>Signed in as <strong>{session.principal?.displayName}</strong></p>
          <p>{workspace ? <>Workspace: <strong>{workspace.name}</strong> · {workspace.role}</> : 'No workspace selected.'}</p>
          <label className="grid gap-1 text-sm">Workspace<select aria-label="Workspace" className="h-10 min-w-0 rounded border px-2" value={selectedWorkspace} onChange={event => setSelectedWorkspace(event.target.value)} disabled={busy}>
            <option value="">No workspace selected</option>{session.workspaces.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
          </select></label>
          <Button disabled={busy} onClick={() => action(async () => {
            await accountAction('/api/auth/workspace', { workspaceId: selectedWorkspace || null });
            const next = await announceAccountChange();
            if (next.principal && next.workspace) { resumeLocalContext(workspaceContext(next.principal.id, next.workspace.id)); setOpen(false); }
          })}>Select workspace</Button>
          {scope && <Button variant="outline" disabled={busy} onClick={() => action(async () => { const next = await refreshAccount(); if (!next.principal || !next.workspace || workspaceContext(next.principal.id, next.workspace.id) !== scope) throw Error('Account access changed. Choose the intended workspace again.'); resumeLocalContext(scope); setOpen(false); })}>Resume workspace local work</Button>}
          {!workspace && <div className="grid gap-2 rounded border p-3">
            <label className="grid gap-1 text-sm">New workspace name<Input aria-label="New workspace name" value={name} onChange={event => { setName(event.target.value); setRequestId(crypto.randomUUID()); }} maxLength={120} /></label>
            <Button disabled={busy || !name.trim()} onClick={() => action(async () => {
              await accountAction('/api/workspaces', { name: name.trim(), idempotencyKey: requestId });
              await refreshAccount(); setCallbackMessage('Workspace created. Select it explicitly to begin working there.');
            })}>Create workspace</Button>
          </div>}
          <Button variant="outline" disabled={busy} onClick={() => action(async () => { await accountAction('/api/auth/logout', {}); await announceAccountChange(); setCallbackMessage('Signed out. Prior workspace drafts are preserved separately and hidden.'); })}>Sign out</Button>
        </> : <>
          <p>{session.status === 'unavailable' ? 'Sign-in is unavailable. Local-only editing remains available.' : session.status === 'expired' ? 'Your sign-in expired. Previous private work is preserved separately.' : session.status === 'revoked' ? 'Account access was revoked. Previous private work is preserved separately.' : 'You are not signed in.'}</p>
          <Button disabled={busy || session.status === 'unavailable' || !session.contextToken} onClick={() => action(login)}>Sign in</Button>
        </>}
        <Button variant="outline" disabled={busy} onClick={() => action(async () => { await refreshAccount(); resumeLocalContext(UNASSIGNED_CONTEXT); setOpen(false); })}>Resume unassigned local-only work</Button>
        <p className="text-xs text-slate-600">A redirect preserves current drafts, unfinished fields and evidence when recovery succeeds. Undo/Redo is preserved for same-page context switches; after a page reload it starts a new session, as before.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
