import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  completeAuthorizationDecision,
  loadAuthorizationRequest,
  readAuthorizationId,
  type OAuthAuthorizationDetails,
} from '@/features/provider-auth/supabaseAuthorization';
import { createSupabaseAuthorizationService } from '@/features/provider-auth/supabaseClient';

type View =
  | { status: 'loading' }
  | { status: 'sign-in' }
  | { status: 'ready'; details: OAuthAuthorizationDetails }
  | { status: 'unavailable' }
  | { status: 'invalid' };

const genericError = 'Owner access could not be completed. No drawing or workspace data was changed.';

export default function SupabaseAuthorization() {
  const service = useMemo(createSupabaseAuthorizationService, []);
  const authorizationId = useMemo(() => readAuthorizationId(window.location.search), []);
  const [view, setView] = useState<View>(() => authorizationId ? { status: 'loading' } : { status: 'invalid' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Owner authorization · Modern Floor Planner';
    document.documentElement.classList.add('authorization-active');
    return () => {
      document.title = previousTitle;
      document.documentElement.classList.remove('authorization-active');
    };
  }, []);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setError('');
    if (!authorizationId) { setView({ status: 'invalid' }); return; }
    if (!service) { setView({ status: 'unavailable' }); return; }
    setView({ status: 'loading' });
    try {
      const result = await loadAuthorizationRequest(service, authorizationId, window.location.origin);
      if (current !== sequence.current) return;
      if (result.status === 'redirect') {
        window.location.assign(result.redirectUrl);
      } else if (result.status === 'ready') {
        setView({ status: 'ready', details: result.details });
      } else {
        setView({ status: 'sign-in' });
      }
    } catch {
      if (current === sequence.current) { setView({ status: 'invalid' }); setError(genericError); }
    }
  }, [authorizationId, service]);

  useEffect(() => { void load(); }, [load]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service || busy || !email.trim() || !password) return;
    setBusy(true); setError('');
    try {
      await service.signInWithPassword(email.trim(), password);
      setPassword('');
      await load();
    } catch {
      setPassword(''); setError('Owner sign-in failed. Check the approved account credentials and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: 'approve' | 'deny') {
    if (!service || !authorizationId || busy) return;
    setBusy(true); setError('');
    try {
      const redirect = await completeAuthorizationDecision(service, authorizationId, decision, window.location.origin);
      window.location.assign(redirect);
    } catch {
      setError(genericError); setBusy(false);
    }
  }

  async function useAnotherAccount() {
    if (!service || busy) return;
    setBusy(true); setError('');
    try { await service.signOut(); setView({ status: 'sign-in' }); }
    catch { setError(genericError); }
    finally { setBusy(false); }
  }

  return <main className="min-h-dvh bg-slate-50 px-4 py-8 sm:py-14">
    <Card className="mx-auto max-w-lg border-slate-200 shadow-lg">
      <CardHeader className="gap-3">
        <div className="flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-700" aria-hidden="true">
          <ShieldCheck className="size-6" />
        </div>
        <div>
          <CardTitle className="text-2xl">Modern Floor Planner owner access</CardTitle>
          <CardDescription className="mt-2 leading-6">
            Sign in with the approved Supabase owner account, then explicitly approve or deny this request.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {view.status === 'loading' && <p role="status" className="text-sm text-slate-700">Checking the authorization request…</p>}
        {view.status === 'unavailable' && <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Owner sign-in is not configured for this build. Local drawings remain unchanged.
        </div>}
        {view.status === 'invalid' && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          This authorization request is missing, expired, or invalid. Return to Modern Floor Planner and start sign-in again.
        </div>}
        {view.status === 'sign-in' && <form className="space-y-4" onSubmit={signIn}>
          <div className="space-y-2">
            <label htmlFor="owner-email" className="text-sm font-medium text-slate-900">Owner email</label>
            <Input id="owner-email" type="email" autoComplete="username" value={email}
              onChange={event => setEmail(event.target.value)} maxLength={320} disabled={busy} required />
          </div>
          <div className="space-y-2">
            <label htmlFor="owner-password" className="text-sm font-medium text-slate-900">Password</label>
            <Input id="owner-password" type="password" autoComplete="current-password" value={password}
              onChange={event => setPassword(event.target.value)} maxLength={1024} disabled={busy} required />
          </div>
          <Button className="w-full" type="submit" disabled={busy || !email.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in to review'}
          </Button>
          <p className="text-xs leading-5 text-slate-600">There is no public signup on this screen. Account creation and recovery remain owner-controlled in Supabase.</p>
        </form>}
        {view.status === 'ready' && <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">Application requesting access</p>
            <p className="mt-1 font-semibold text-slate-950">{view.details.client.name}</p>
          </div>
          <dl className="space-y-3 text-sm">
            <div><dt className="font-medium text-slate-900">Signed-in account</dt><dd className="mt-1 break-all text-slate-600">{view.details.user.email}</dd></div>
            <div><dt className="font-medium text-slate-900">Permission requested</dt><dd className="mt-1 text-slate-600">Verify this account&apos;s stable identity. This does not grant browser access to the Supabase database.</dd></div>
            <div><dt className="font-medium text-slate-900">Return destination</dt><dd className="mt-1 break-all text-slate-600">{new URL(view.details.redirect_uri).origin}</dd></div>
          </dl>
          <div className="rounded-md border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
            Approval returns you to Modern Floor Planner, where workspace access is checked separately. Local-only drafts are not uploaded automatically.
          </div>
        </div>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </CardContent>
      {view.status === 'ready' && <CardFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" disabled={busy} onClick={useAnotherAccount}>Use another account</Button>
        <div className="flex w-full gap-3 sm:w-auto">
          <Button className="flex-1 sm:flex-none" type="button" variant="outline" disabled={busy} onClick={() => void decide('deny')}>Deny</Button>
          <Button className="flex-1 sm:flex-none" type="button" disabled={busy} onClick={() => void decide('approve')}>{busy ? 'Working…' : 'Approve'}</Button>
        </div>
      </CardFooter>}
    </Card>
  </main>;
}
