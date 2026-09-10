import * as oidc from 'openid-client';
import type { AuthConfiguration } from './authConfiguration';

/** Maintained protocol client; no provider tokens or raw errors leave this module. */
export function createOidcClient(settings: AuthConfiguration) {
  let discovered: Promise<oidc.Configuration> | undefined;
  const configuration = () => {
    if (!discovered) discovered = oidc.discovery(new URL(settings.issuer), settings.clientId,
      { client_secret: settings.clientSecret, [oidc.clockTolerance]: 0 },
      settings.clientAuthMethod === 'none' ? oidc.None() :
        settings.clientAuthMethod === 'client_secret_basic' ? oidc.ClientSecretBasic(settings.clientSecret) :
          oidc.ClientSecretPost(settings.clientSecret),
      { timeout: 10, execute: [oidc.enableNonRepudiationChecks] },
    ).then(config => {
      const metadata = config.serverMetadata();
      if (metadata.issuer !== settings.issuer || !metadata.jwks_uri || !metadata.authorization_endpoint || !metadata.token_endpoint)
        throw new Error('OIDC configuration unavailable');
      for (const endpoint of [metadata.jwks_uri, metadata.authorization_endpoint, metadata.token_endpoint]) {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('OIDC configuration unavailable');
      }
      if (metadata.code_challenge_methods_supported && !metadata.code_challenge_methods_supported.includes('S256'))
        throw new Error('OIDC configuration unavailable');
      return config;
    }).catch(() => { discovered = undefined; throw new Error('OIDC configuration unavailable'); });
    return discovered;
  };
  return {
    async authorizationUrl(state: string, nonce: string, codeVerifier: string) {
      const config = await configuration();
      return oidc.buildAuthorizationUrl(config, {
        redirect_uri: settings.callbackUri, response_type: 'code', scope: 'openid', state, nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier), code_challenge_method: 'S256',
      }).href;
    },
    async exchange(callbackUrl: URL, checks: { state: string; nonce: string; codeVerifier: string }) {
      const config = await configuration();
      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        expectedState: checks.state, expectedNonce: checks.nonce, pkceCodeVerifier: checks.codeVerifier, idTokenExpected: true,
      });
      const claims = tokens.claims();
      // Signature, issuer/audience, expiry and nonce are validated by openid-client.
      // Enforce the optional azp constraint as well, including single-audience tokens.
      if (!claims || claims.iss !== settings.issuer || !claims.sub || claims.sub.length > 2048 ||
        /[\u0000-\u001f\u007f]/.test(claims.sub) ||
        (claims.azp !== undefined && claims.azp !== settings.clientId) ||
        (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== settings.clientId))
        throw new Error('OIDC response invalid');
      return { issuer: claims.iss, subject: claims.sub };
    },
  };
}
