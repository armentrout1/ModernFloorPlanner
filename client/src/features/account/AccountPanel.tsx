import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { runInputLayoutTransition } from '@/utils/inputLayout';
import {
  clearSupabaseSession,
  currentSupabaseAccessToken,
  onSupabaseAuthChange,
  sendSupabasePasswordReset,
  signInWithGoogle,
  signInWithSupabase,
  signUpWithSupabase,
  SupabaseAccountError,
  updateSupabasePassword,
} from '@/features/provider-auth/supabaseAuth';
import { accountStore, refreshAccount, accountAction, announceAccountChange, resumeLocalContext, initializeAccountEvents, type AccountSession } from './runtime';
import { checkpointContext, workspaceContext, UNASSIGNED_CONTEXT } from './localContexts';

type AuthView = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';
const checkpointMessage = 'Refresh recovery is unavailable. Your unfinished work is still held in this page. Stay here and restore browser storage before leaving; no account transition has been started.';

function friendlyError(error: unknown): string {
  if (error instanceof SupabaseAccountError) {
    if (error.code === 'NOT_CONFIGURED') return 'Sign-in is not configured for this build. Local guest work is still available.';
    if (error.code === 'SIGN_IN_FAILED') return 'The email or password was not accepted. Check both fields and try again.';
    if (error.code === 'SIGN_UP_FAILED') return 'The account could not be created. Check the email and password, then try again.';
    if (error.code === 'OAUTH_FAILED') return 'Google sign-in could not be started. Wait a moment and try again.';
    if (error.code === 'RESET_FAILED') return 'The reset email could not be requested. Wait a moment and try again.';
    return 'The password could not be updated. Request a new reset link and try again.';
  }
  return error instanceof Error ? error.message : 'Account services are unavailable.';
}

const lastWorkspaceKey = (principalId: string) => `modern-floor-planner:last-workspace:v1:${principalId}`;
function rememberedWorkspace(principalId: string): string | null {
  try { return localStorage.getItem(lastWorkspaceKey(principalId)); } catch { return null; }
}
function rememberWorkspace(principalId: string, workspaceId: string) {
  try { localStorage.setItem(lastWorkspaceKey(principalId), workspaceId); } catch { /* A preference must never block account access. */ }
}

function cleanAccountRedirect() {
  if (!location.pathname.startsWith('/account/')) return;
  history.replaceState(null, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function AccountPanel() {
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot);
  const initialView: AuthView = location.pathname === '/account/reset-password' ? 'reset-password' : 'sign-in';
  const [open, setOpen] = useState(location.pathname.startsWith('/account/'));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState('My Workspace'), [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [authView, setAuthView] = useState<AuthView>(initialView);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [recoveryReady, setRecoveryReady] = useState(false);
  const busyRef = useRef(false), redirectHandled = useRef(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  useEffect(initializeAccountEvents, []);
  useEffect(() => { setSelectedWorkspace(account.session.workspace?.id ?? ''); }, [account.session.workspace?.id]);

  async function action(operation: () => Promise<void>, checkpoint = true) {
    if (busyRef.current) return;
    setError('');
    if (checkpoint && !checkpointContext(account.editorContext)) { setError(checkpointMessage); return; }
    busyRef.current = true; setBusy(true);
    try { await operation(); } catch (failure) { setError(friendlyError(failure)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function enterAuthenticatedSession(initial: AccountSession): Promise<boolean> {
    if (initial.status !== 'authenticated' || !initial.principal) return false;
    let next = initial;
    if (!next.workspace && next.workspaces.length > 1) {
      const remembered = rememberedWorkspace(initial.principal.id);
      if (remembered && next.workspaces.some(item => item.id === remembered)) {
        await accountAction('/api/auth/workspace', { workspaceId: remembered });
        next = await announceAccountChange();
      }
    }
    if (next.principal && next.workspace) {
      rememberWorkspace(next.principal.id, next.workspace.id);
      resumeLocalContext(workspaceContext(next.principal.id, next.workspace.id));
      setOpen(false);
      return true;
    }
    if (next.workspaces.length === 0) {
      setName('My Workspace');
      setRequestId(crypto.randomUUID());
    }
    return false;
  }

  async function finishMfpSignIn(token: string, message = 'Signed in. Local drafts remain separate from saved workspace plans.') {
    try {
      await accountAction('/api/auth/login', {}, { Authorization: 'Bearer ' + token });
      await clearSupabaseSession();
      const next = await announceAccountChange();
      setPassword(''); setPasswordConfirmation(''); setAccountMessage(message); setAuthView('sign-in');
      cleanAccountRedirect();
      await enterAuthenticatedSession(next);
    } catch (failure) {
      await clearSupabaseSession();
      throw failure;
    }
  }

  useEffect(() => {
    if (!location.pathname.startsWith('/account/')) return;
    const recovery = location.pathname === '/account/reset-password';
    setOpen(true);
    if (recovery) setAuthView('reset-password');
    const handle = (event: string, token: string | null) => {
      if (recovery) {
        if (event === 'PASSWORD_RECOVERY' || token) setRecoveryReady(true);
        return;
      }
      if (location.pathname === '/account/confirm' && token && !redirectHandled.current) {
        redirectHandled.current = true;
        void action(() => finishMfpSignIn(token, 'Email confirmed and account signed in. Local drafts remain separate.'), false);
      }
    };
    const unsubscribe = onSupabaseAuthChange(handle);
    void currentSupabaseAccessToken().then(token => handle(recovery ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', token)).catch(() => {
      setError(recovery ? 'This reset link is invalid or expired. Request a new link.' : 'This confirmation link is invalid or expired. Sign in with your email and password.');
    });
    return unsubscribe;
  // The account redirect is handled once on the page that received it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitSignIn() {
    if (!email.trim() || !password) throw new Error('Enter your email and password.');
    const token = await signInWithSupabase(email.trim(), password);
    await finishMfpSignIn(token);
  }

  async function submitGoogleSignIn() {
    await signInWithGoogle();
  }

  async function submitWorkspaceCreation() {
    if (!name.trim()) throw new Error('Enter a workspace name.');
    await accountAction('/api/workspaces', { name: name.trim(), idempotencyKey: requestId });
    const next = await announceAccountChange();
    setCreatingWorkspace(false);
    setAccountMessage('Workspace created. You can start planning.');
    await enterAuthenticatedSession(next);
  }

  async function submitSignUp() {
    if (!email.trim() || password.length < 8) throw new Error('Enter a valid email and a password with at least 8 characters.');
    if (password !== passwordConfirmation) throw new Error('The passwords do not match.');
    const token = await signUpWithSupabase(email.trim(), password);
    setPassword(''); setPasswordConfirmation('');
    if (token) await finishMfpSignIn(token, 'Account created and signed in. Local drafts remain separate.');
    else {
      setAuthView('sign-in');
      setAccountMessage('Check your email to confirm the new account, then return here to sign in.');
    }
  }

  async function submitResetRequest() {
    if (!email.trim()) throw new Error('Enter the email address for your account.');
    await sendSupabasePasswordReset(email.trim());
    setAuthView('sign-in');
    setAccountMessage('If an account exists for that email, a password-reset link has been sent.');
  }

  async function submitNewPassword() {
    if (!recoveryReady) throw new Error('This reset link is invalid or expired. Request a new link.');
    if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
    if (password !== passwordConfirmation) throw new Error('The passwords do not match.');
    await updateSupabasePassword(password);
    await clearSupabaseSession();
    setPassword(''); setPasswordConfirmation(''); setAuthView('sign-in');
    setAccountMessage('Password updated. Sign in with your new password.');
    cleanAccountRedirect();
  }

  function chooseView(next: AuthView) {
    setError(''); setAccountMessage(''); setPassword(''); setPasswordConfirmation(''); setAuthView(next);
  }

  const { session } = account;
  const workspace = session.workspace;
  const scope = session.principal && workspace ? workspaceContext(session.principal.id, workspace.id) : null;
  const needsFirstWorkspace = session.status === 'authenticated' && !workspace && session.workspaces.length === 0;
  return <>
    <Button type="button" size="sm" variant="outline" className="fixed bottom-2 left-2 z-40 bg-white shadow" data-physical-layout-control
      onPointerDownCapture={() => runInputLayoutTransition(() => {})}
      onClick={() => runInputLayoutTransition(() => { setOpen(true); void refreshAccount().catch(() => {}); })}>Account</Button>
    {!account.editorContext && <section className="mx-auto max-w-xl p-8" aria-label="Choose local working context">
      <h1 className="text-xl font-semibold">Your previous work is preserved separately</h1>
      <p className="my-4">Choose a verified workspace or explicitly continue with local guest work using Account. Previous private records are hidden.</p>
      <Button onClick={() => setOpen(true)}>Choose working context</Button>
    </section>}
    <Dialog open={open} onOpenChange={next => { if (!busy) runInputLayoutTransition(() => setOpen(next)); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-physical-layout-control>
        <DialogHeader><DialogTitle>Account and local work</DialogTitle></DialogHeader>
        <p className="text-sm">Sign-in protects server workspaces. Browser drafts remain local-only and are never uploaded or assigned automatically.</p>
        {accountMessage && <p role="status" className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">{accountMessage}</p>}
        {account.checking && <p role="status">Checking account access…</p>}
        {authView === 'reset-password' ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void action(submitNewPassword, false); }}>
          <h2 className="text-lg font-semibold">Choose a new password</h2>
          {!recoveryReady && <p role="status" className="text-sm">Checking the reset link…</p>}
          <label className="grid gap-1 text-sm">New password<Input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} required /></label>
          <label className="grid gap-1 text-sm">Confirm new password<Input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} minLength={8} required /></label>
          <Button type="submit" disabled={busy || !recoveryReady}>Update password</Button>
        </form> : session.status === 'authenticated' ? <div className="grid gap-4">
          {needsFirstWorkspace || creatingWorkspace ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void action(submitWorkspaceCreation); }}>
            <div>
              <h2 className="text-lg font-semibold">{needsFirstWorkspace ? 'Name your workspace' : 'Create a new workspace'}</h2>
              <p className="mt-1 text-sm text-slate-600">This is where your saved floor plans will live. You can change the name later.</p>
            </div>
            <label className="grid gap-1 text-sm">Workspace name<Input aria-label="Workspace name" autoFocus value={name} onChange={event => { setName(event.target.value); setRequestId(crypto.randomUUID()); }} maxLength={120} required /></label>
            <Button type="submit" disabled={busy || !name.trim()}>Create workspace and start planning</Button>
            {!needsFirstWorkspace && <Button type="button" variant="ghost" disabled={busy} onClick={() => setCreatingWorkspace(false)}>Cancel</Button>}
          </form> : <>
            <div>
              <h2 className="text-lg font-semibold">Signed in</h2>
              <p className="mt-1 text-sm text-slate-600">{workspace ? <>Working in <strong>{workspace.name}</strong> · {workspace.role}</> : 'Choose a workspace to continue.'}</p>
            </div>
            {session.workspaces.length > 1 && <>
              <label className="grid gap-1 text-sm">Workspace<select aria-label="Workspace" className="h-10 min-w-0 rounded border px-2" value={selectedWorkspace} onChange={event => setSelectedWorkspace(event.target.value)} disabled={busy}>
                <option value="" disabled>Choose a workspace</option>{session.workspaces.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
              </select></label>
              <Button disabled={busy || !selectedWorkspace} onClick={() => action(async () => {
                await accountAction('/api/auth/workspace', { workspaceId: selectedWorkspace });
                const next = await announceAccountChange();
                await enterAuthenticatedSession(next);
              })}>{workspace ? 'Switch workspace' : 'Open workspace'}</Button>
            </>}
            {scope && session.workspaces.length === 1 && <Button disabled={busy} onClick={() => action(async () => {
              const next = await refreshAccount();
              if (!next.principal || !next.workspace || workspaceContext(next.principal.id, next.workspace.id) !== scope) throw Error('Account access changed. Sign in again.');
              rememberWorkspace(next.principal.id, next.workspace.id); resumeLocalContext(scope); setOpen(false);
            })}>Continue planning</Button>}
            {workspace && <Button variant="ghost" disabled={busy} onClick={() => { setName('New Workspace'); setRequestId(crypto.randomUUID()); setCreatingWorkspace(true); }}>New workspace</Button>}
          </>}
          <Button variant="outline" disabled={busy} onClick={() => action(async () => { await accountAction('/api/auth/logout', {}); await clearSupabaseSession(); await announceAccountChange(); setAccountMessage('Signed out. Prior workspace drafts are preserved separately and hidden.'); })}>Sign out</Button>
        </div> : authView === 'forgot-password' ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void action(submitResetRequest, false); }}>
          <h2 className="text-lg font-semibold">Reset your password</h2>
          <p className="text-sm">Enter your email and Supabase will send a secure reset link.</p>
          <label className="grid gap-1 text-sm">Email address<Input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <Button type="submit" disabled={busy}>Email reset link</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => chooseView('sign-in')}>Back to sign in</Button>
        </form> : <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void action(authView === 'sign-up' ? submitSignUp : submitSignIn); }}>
          <h2 className="text-lg font-semibold">{authView === 'sign-up' ? 'Create an account' : 'Sign in'}</h2>
          <p>{session.status === 'unavailable' ? 'Sign-in is unavailable. Local guest work remains available.' : session.status === 'expired' ? 'Your sign-in expired. Previous private work is preserved separately.' : session.status === 'revoked' ? 'Account access was revoked. Previous private work is preserved separately.' : authView === 'sign-up' ? 'Create an account and start planning.' : 'Sign in and continue where you left off.'}</p>
          <Button type="button" variant="outline" disabled={busy || session.status === 'unavailable' || !session.contextToken} onClick={() => void action(submitGoogleSignIn)}>Continue with Google</Button>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500" aria-hidden="true"><span className="h-px flex-1 bg-slate-200" /><span>or use email</span><span className="h-px flex-1 bg-slate-200" /></div>
          <label className="grid gap-1 text-sm">Email address<Input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label className="grid gap-1 text-sm">Password<Input type="password" autoComplete={authView === 'sign-up' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} minLength={authView === 'sign-up' ? 8 : undefined} required /></label>
          {authView === 'sign-up' && <label className="grid gap-1 text-sm">Confirm password<Input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} minLength={8} required /></label>}
          <Button type="submit" disabled={busy || session.status === 'unavailable' || !session.contextToken}>{authView === 'sign-up' ? 'Create account' : 'Sign in'}</Button>
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => chooseView(authView === 'sign-up' ? 'sign-in' : 'sign-up')}>{authView === 'sign-up' ? 'Already have an account? Sign in' : 'Create account'}</Button>
            {authView === 'sign-in' && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => chooseView('forgot-password')}>Forgot password?</Button>}
          </div>
        </form>}
        {session.status !== 'authenticated' && <>
          <Button variant="outline" disabled={busy} onClick={() => action(async () => { await refreshAccount(); resumeLocalContext(UNASSIGNED_CONTEXT); setOpen(false); })}>Continue as guest (local only)</Button>
          <p className="text-xs text-slate-600">Guest work stays in this browser. Signing in never uploads it automatically.</p>
        </>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
