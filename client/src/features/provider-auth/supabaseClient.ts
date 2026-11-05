import { createClient } from '@supabase/supabase-js';
import {
  parsePublicSupabaseConfiguration,
  type OAuthAuthorizationLookup,
  type ProviderUser,
  type SupabaseAuthorizationService,
} from './supabaseAuthorization';

function configuredValues() {
  return parsePublicSupabaseConfiguration(import.meta.env);
}

export function createSupabaseAuthorizationService(): SupabaseAuthorizationService | null {
  const configuration = configuredValues();
  if (!configuration) return null;
  const client = createClient(configuration.url, configuration.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return {
    async getAuthenticatedUser(): Promise<ProviderUser | null> {
      const session = await client.auth.getSession();
      if (session.error) throw new Error('PROVIDER_SESSION_UNAVAILABLE');
      if (!session.data.session) return null;
      const verified = await client.auth.getUser();
      if (verified.error || !verified.data.user?.email) throw new Error('PROVIDER_SESSION_UNAVAILABLE');
      return { id: verified.data.user.id, email: verified.data.user.email };
    },
    async signInWithPassword(email: string, password: string): Promise<void> {
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error || !result.data.user || !result.data.session) throw new Error('OWNER_SIGN_IN_FAILED');
    },
    async signOut(): Promise<void> {
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw new Error('OWNER_SIGN_OUT_FAILED');
    },
    async getAuthorizationDetails(authorizationId: string): Promise<OAuthAuthorizationLookup> {
      const result = await client.auth.oauth.getAuthorizationDetails(authorizationId);
      if (result.error || !result.data) throw new Error('AUTHORIZATION_LOOKUP_FAILED');
      return result.data;
    },
    async decide(authorizationId: string, decision: 'approve' | 'deny'): Promise<string> {
      const result = decision === 'approve'
        ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (result.error || !result.data?.redirect_url) throw new Error('AUTHORIZATION_DECISION_FAILED');
      return result.data.redirect_url;
    },
  };
}
