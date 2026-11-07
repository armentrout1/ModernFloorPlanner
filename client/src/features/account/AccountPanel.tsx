import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Building2, CheckCircle2, LockKeyhole, Sparkles } from 'lucide-react';
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
import { accountStore, refreshAccount, accountAction, announceAccountChange, resumeLocalContext, initializeAccountEvents, contextFetch, type AccountSession, type AccountWorkspace } from './runtime';
import { checkpointContext, workspaceContext, UNASSIGNED_CONTEXT } from './localContexts';
import { ACCOUNT_UI_EVENT, type AccountUiCommand } from './accountUi';
import { GoogleButton } from './GoogleButton';

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

function WorkspaceNameSetting({ workspace }: { workspace: AccountWorkspace }) {
  const [name, setName] = useState(workspace.name);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const generation = useRef(0);
  const savedName = useRef(workspace.name);
  const chain = useRef(Promise.resolve());

  useEffect(() => {
    generation.current++;
    savedName.current = workspace.name;
    setName(workspace.name);
    setStatus('idle');
    setError('');
  }, [workspace.id]);

  useEffect(() => {
    if (workspace.role !== 'owner') return;
    const next = name.trim();
    const current = ++generation.current;
    setError('');
    if (!next) {
      setStatus('error');
      setError('Workspace name is required.');
      return;
    }
    if (next === savedName.current) {
      setStatus('idle');
      return;
    }
    setStatus('saving');
    const timer = window.setTimeout(() => {
      chain.current = chain.current.then(async () => {
        if (current !== generation.current) return;
        try {
          const response = await contextFetch('PATCH', `/api/workspaces/${workspace.id}`, { name: next });
          if (!response.ok) throw new Error('Workspace name could not be saved.');
          await response.json();
          savedName.current = next;
          await refreshAccount();
          if (current === generation.current) setStatus('saved');
        } catch (failure) {
          if (current !== generation.current) return;
          setStatus('error');
          setError(failure instanceof Error ? failure.message : 'Workspace name could not be saved.');
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  // The status label is output only; it must not restart the save timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, workspace.id, workspace.role]);

  return (
    <div className="grid gap-1.5">
      <label htmlFor="workspace-settings-name" className="text-sm font-medium">Workspace name</label>
      <Input
        id="workspace-settings-name"
        value={name}
        onChange={event => setName(event.target.value)}
        maxLength={120}
        readOnly={workspace.role !== 'owner'}
        aria-describedby="workspace-name-status"
      />
      <p id="workspace-name-status" role="status" className={`flex items-center gap-1 text-xs ${status === 'error' ? 'text-red-700' : 'text-slate-500'}`}>
        {status === 'saving' ? 'Saving…' : status === 'saved' ? <><CheckCircle2 className="h-3.5 w-3.5" /> Saved</> : status === 'error' ? error : workspace.role === 'owner' ? 'Changes save automatically.' : 'Only a workspace owner can rename this workspace.'}
      </p>
    </div>
  );
}

export default function AccountPanel() {
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot);
  const initialView: AuthView = location.pathname === '/account/reset-password' ? 'reset-password' : 'sign-in';
  const [open, setOpen] = useState(false);
  const [authGatewayOpen, setAuthGatewayOpen] = useState(location.pathname.startsWith('/account/'));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [name, setName] = useState(''), [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [authView, setAuthView] = useState<AuthView>(initialView);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [recoveryReady, setRecoveryReady] = useState(false);
  const busyRef = useRef(false), redirectHandled = useRef(false);
  const workspaceBootstrap = useRef<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  useEffect(initializeAccountEvents, []);
  useEffect(() => { setSelectedWorkspace(account.session.workspace?.id ?? ''); }, [account.session.workspace?.id]);

  async function action(operation: () => Promise<void>, checkpoint = true) {
    if (busyRef.current) return;
    setError('');
    // Read the current editor context at click time. Account refreshes can
    // replace the rendered snapshot while a dialog is open, and a transition
    // must never bypass recovery because its closure captured an older value.
    if (checkpoint && !checkpointContext(accountStore.getSnapshot().editorContext)) { setError(checkpointMessage); return; }
    busyRef.current = true; setBusy(true);
    try { await operation(); } catch (failure) { setError(friendlyError(failure)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function enterAuthenticatedSession(initial: AccountSession): Promise<boolean> {
    if (initial.status !== 'authenticated' || !initial.principal) return false;
    let next = initial;
    if (!next.workspace && next.workspaces.length === 1) {
      await accountAction('/api/auth/workspace', { workspaceId: next.workspaces[0].id });
      next = await announceAccountChange();
    }
    if (!next.workspace && next.workspaces.length > 1) {
      const remembered = rememberedWorkspace(initial.principal.id);
      if (remembered && next.workspaces.some(item => item.id === remembered)) {
        await accountAction('/api/auth/workspace', { workspaceId: remembered });
        next = await announceAccountChange();
      }
    }
    if (!next.workspace && next.workspaces.length === 0) {
      workspaceBootstrap.current = initial.principal.id;
      setName('');
      setRequestId(crypto.randomUUID());
      setCreatingWorkspace(true);
      setAuthGatewayOpen(true);
      setOpen(false);
      return false;
    }
    if (next.principal && next.workspace) {
      rememberWorkspace(next.principal.id, next.workspace.id);
      resumeLocalContext(workspaceContext(next.principal.id, next.workspace.id));
      setAuthGatewayOpen(false);
      setOpen(false);
      return true;
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
    setAuthGatewayOpen(true);
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
    workspaceBootstrap.current = null;
    setCreatingWorkspace(false);
    setAccountMessage('Workspace created. You can start planning.');
    // Close the creation surface before switching editor context. This avoids
    // a disappearing submit control leaving the dialog transition half-open.
    setOpen(false);
    setAuthGatewayOpen(false);
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

  async function signOut() {
    await accountAction('/api/auth/logout', {});
    await clearSupabaseSession();
    await announceAccountChange();
    setAuthView('sign-in');
    setCreatingWorkspace(false);
    setAccountMessage('');
    setOpen(false);
    setAuthGatewayOpen(true);
    cleanAccountRedirect();
  }

  async function continueAsGuest() {
    await refreshAccount();
    resumeLocalContext(UNASSIGNED_CONTEXT);
    setAuthGatewayOpen(false);
    setOpen(false);
  }

  async function switchWorkspace(workspaceId: string) {
    await accountAction('/api/auth/workspace', { workspaceId });
    const next = await announceAccountChange();
    await enterAuthenticatedSession(next);
  }

  useEffect(() => {
    const session = account.session;
    if (session.status !== 'authenticated' || !session.principal || session.workspace || session.workspaces.length ||
        workspaceBootstrap.current === session.principal.id || busyRef.current) return;
    workspaceBootstrap.current = session.principal.id;
    setName('');
    setRequestId(crypto.randomUUID());
    setCreatingWorkspace(true);
    setAuthGatewayOpen(true);
  // This is recovery for an authenticated account interrupted before naming its first workspace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.session.status, account.session.principal?.id, account.session.workspace?.id, account.session.workspaces.length]);

  useEffect(() => {
    const handle = (event: Event) => {
      const command = (event as CustomEvent<AccountUiCommand>).detail;
      if (!command || busyRef.current) return;
      if (command.type === 'open' || command.type === 'settings') {
        setCreatingWorkspace(false);
        runInputLayoutTransition(() => {
          if (account.session.status === 'authenticated') setOpen(true);
          else setAuthGatewayOpen(true);
        });
        void refreshAccount().catch(() => {});
      } else if (command.type === 'sign-in') {
        chooseView('sign-in');
        runInputLayoutTransition(() => {
          setOpen(false);
          setAuthGatewayOpen(true);
        });
        void refreshAccount().catch(() => {});
      } else if (command.type === 'new-workspace') {
        setName('New Workspace');
        setRequestId(crypto.randomUUID());
        setCreatingWorkspace(true);
        runInputLayoutTransition(() => setOpen(true));
      } else if (command.type === 'sign-out') {
        void action(signOut);
      } else if (command.type === 'switch-workspace') {
        void action(() => switchWorkspace(command.workspaceId));
      }
    };
    window.addEventListener(ACCOUNT_UI_EVENT, handle);
    return () => window.removeEventListener(ACCOUNT_UI_EVENT, handle);
  });

  const { session } = account;
  const workspace = session.workspace;
  const needsFirstWorkspace = session.status === 'authenticated' && !workspace && session.workspaces.length === 0;

  const workspaceCreation = (first = false) => <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void action(submitWorkspaceCreation); }}>
    <div>
      <h2 className="text-lg font-semibold">{first ? 'Name your workspace' : 'Create a new workspace'}</h2>
      <p className="mt-1 text-sm text-slate-600">{first
        ? 'This is where your plans will be saved. You can rename it later in Settings.'
        : 'Use another workspace for a different company, team, or collection of plans.'}</p>
    </div>
    <label className="grid gap-1 text-sm">Workspace name<Input aria-label="Workspace name" autoFocus value={name} onChange={event => { setName(event.target.value); setRequestId(crypto.randomUUID()); }} maxLength={120} placeholder="Example: Aaron's projects" required /></label>
    <Button type="submit" disabled={busy || !name.trim()}>{first ? 'Create workspace and continue' : 'Create workspace and start planning'}</Button>
    {!first && <Button type="button" variant="ghost" disabled={busy} onClick={() => setCreatingWorkspace(false)}>Cancel</Button>}
  </form>;

  const signedOutGateway = <>
    {authView === 'reset-password' ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void action(submitNewPassword, false); }}>
      <h2 className="text-lg font-semibold">Choose a new password</h2>
      {!recoveryReady && <p role="status" className="text-sm">Checking the reset link…</p>}
      <label className="grid gap-1 text-sm">New password<Input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} required /></label>
      <label className="grid gap-1 text-sm">Confirm new password<Input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} minLength={8} required /></label>
      <Button type="submit" disabled={busy || !recoveryReady}>Update password</Button>
    </form> : authView === 'forgot-password' ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void action(submitResetRequest, false); }}>
      <h2 className="text-lg font-semibold">Reset your password</h2>
      <p className="text-sm text-slate-600">Enter your email and Supabase will send a secure reset link.</p>
      <label className="grid gap-1 text-sm">Email address<Input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <Button type="submit" disabled={busy}>Email reset link</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => chooseView('sign-in')}>Back to sign in</Button>
    </form> : <form noValidate className="grid gap-3" onSubmit={event => { event.preventDefault(); void action(authView === 'sign-up' ? submitSignUp : submitSignIn); }}>
      <h2 className="text-lg font-semibold">{authView === 'sign-up' ? 'Create an account' : 'Sign in'}</h2>
      <p className="text-sm text-slate-600">{session.status === 'unavailable' ? 'Sign-in is unavailable. Local guest work remains available.' : session.status === 'expired' ? 'Your sign-in expired. Previous private work is preserved separately.' : session.status === 'revoked' ? 'Account access was revoked. Previous private work is preserved separately.' : authView === 'sign-up' ? 'Create an account and start planning.' : 'Sign in and continue where you left off.'}</p>
      <GoogleButton disabled={busy || session.status === 'unavailable' || !session.contextToken} onClick={() => void action(submitGoogleSignIn)} />
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
    <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-wide text-slate-400" aria-hidden="true"><span className="h-px flex-1 bg-slate-200" /><span>or</span><span className="h-px flex-1 bg-slate-200" /></div>
    <Button variant="outline" disabled={busy} onClick={() => void action(
      continueAsGuest,
      // Dismissing sign-in while already editing as a guest does not change
      // identity or context. A real account/workspace transition still needs
      // a verified recovery checkpoint.
      accountStore.getSnapshot().editorContext !== UNASSIGNED_CONTEXT,
    )}>Continue as guest</Button>
    <p className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> Guest drafts stay on this device until you explicitly save them to an account.</p>
  </>;

  return <>
    {(!account.editorContext || authGatewayOpen) && !open && <section className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto bg-gradient-to-br from-blue-50 via-white to-slate-100 p-4 sm:items-center sm:p-6" aria-label="Welcome to Modern Floor Planner" data-physical-layout-control>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <div className="mb-7 flex items-center gap-3 text-primary">
          <div className="rounded-xl bg-primary/10 p-2.5"><Sparkles className="h-6 w-6" /></div>
          <span className="text-lg font-bold">Modern Floor Planner</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Plan your space with confidence.</h1>
        <p className="mt-3 text-slate-600">Sign in to open your saved floor plans, or continue as a guest to work locally in this browser.</p>
        {accountMessage && <p role="status" className="mt-5 rounded border border-blue-200 bg-blue-50 p-3 text-sm">{accountMessage}</p>}
        {account.checking && <p role="status" className="mt-5 text-sm">Checking account access…</p>}
        <div className="mt-7 grid gap-3">
          {needsFirstWorkspace ? workspaceCreation(true) : session.status === 'authenticated' && session.principal && workspace ? <>
            <Button size="lg" disabled={busy} onClick={() => void action(async () => {
              const next = await refreshAccount();
              if (!next.principal || !next.workspace) throw new Error('Workspace access changed. Sign in again.');
              resumeLocalContext(workspaceContext(next.principal.id, next.workspace.id));
            })}>Continue to {workspace.name}</Button>
            <Button variant="outline" disabled={busy} onClick={() => runInputLayoutTransition(() => setOpen(true))}>Settings</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void action(signOut)}>Sign out</Button>
          </> : signedOutGateway}
        </div>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      </div>
    </section>}
    <Dialog open={open && session.status === 'authenticated'} onOpenChange={next => { if (!busy) runInputLayoutTransition(() => setOpen(next)); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" data-physical-layout-control>
        <DialogHeader><DialogTitle>Account</DialogTitle></DialogHeader>
        {accountMessage && <p role="status" className="rounded border border-blue-200 bg-blue-50 p-3 text-sm">{accountMessage}</p>}
        {account.checking && <p role="status">Checking account access…</p>}
        {session.status === 'authenticated' && <div className="grid gap-5">
          {needsFirstWorkspace ? workspaceCreation(true) : creatingWorkspace ? workspaceCreation(false) : <>
            <div>
              <h2 className="text-lg font-semibold">Settings</h2>
              <p className="mt-1 text-sm text-slate-600">Manage your current workspace and account session.</p>
            </div>
            {workspace && <div className="grid gap-4 rounded-lg border p-4">
              <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><span className="font-medium">Workspace</span><span className="ml-auto text-xs capitalize text-slate-500">{workspace.role}</span></div>
              <WorkspaceNameSetting workspace={workspace} />
            </div>}
            {session.workspaces.length > 1 && <>
              <label className="grid gap-1 text-sm">Workspace<select aria-label="Workspace" className="h-10 min-w-0 rounded border px-2" value={selectedWorkspace} onChange={event => setSelectedWorkspace(event.target.value)} disabled={busy}>
                <option value="" disabled>Choose a workspace</option>{session.workspaces.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
              </select></label>
              <Button disabled={busy || !selectedWorkspace || selectedWorkspace === workspace?.id} onClick={() => action(() => switchWorkspace(selectedWorkspace))}>Switch workspace</Button>
            </>}
            {session.principal && workspace && !account.editorContext && <Button disabled={busy} onClick={() => action(async () => {
              const next = await refreshAccount();
              if (!next.principal || !next.workspace) throw new Error('Workspace access changed. Sign in again.');
              resumeLocalContext(workspaceContext(next.principal.id, next.workspace.id));
              setOpen(false);
            })}>Continue planning</Button>}
            {workspace && <Button variant="outline" disabled={busy} onClick={() => { setName('New Workspace'); setRequestId(crypto.randomUUID()); setCreatingWorkspace(true); }}>New workspace</Button>}
          </>}
          <Button variant="outline" disabled={busy} onClick={() => action(continueAsGuest)}>Continue as guest</Button>
          <Button variant="ghost" disabled={busy} onClick={() => action(signOut)}>Sign out</Button>
        </div>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
