-- Apply only after 0001 to a verified, explicitly authorized PostgreSQL database.
-- Once-only and transactional; no legacy ownership, identity merge or default workspace.
BEGIN;
CREATE TABLE mfp_sessions (
  sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL
);
CREATE INDEX mfp_sessions_expire_idx ON mfp_sessions(expire);
CREATE TABLE auth_browser_contexts (
  browser_id uuid PRIMARY KEY,
  session_id_hash text NOT NULL CHECK (session_id_hash ~ '^[0-9a-f]{64}$'),
  context_token uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('anonymous','authenticated','revoked')),
  issuer text, subject text,
  principal_id uuid REFERENCES application_principals(id) ON DELETE RESTRICT,
  selected_workspace_id uuid REFERENCES workspaces(id) ON DELETE RESTRICT,
  authenticated_at timestamptz,
  last_seen_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  CHECK ((status='authenticated' AND issuer IS NOT NULL AND subject IS NOT NULL AND principal_id IS NOT NULL AND authenticated_at IS NOT NULL)
    OR (status<>'authenticated' AND issuer IS NULL AND subject IS NULL AND principal_id IS NULL AND authenticated_at IS NULL AND selected_workspace_id IS NULL))
);
CREATE INDEX auth_browser_contexts_expiry_idx ON auth_browser_contexts(absolute_expires_at);
CREATE TABLE oidc_login_transactions (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  browser_id uuid NOT NULL REFERENCES auth_browser_contexts(browser_id) ON DELETE RESTRICT,
  context_token uuid NOT NULL,
  session_id_hash text NOT NULL CHECK (session_id_hash ~ '^[0-9a-f]{64}$'),
  nonce text, code_verifier text, return_path text NOT NULL,
  created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, completed_at timestamptz
);
CREATE INDEX oidc_login_transactions_browser_created_idx ON oidc_login_transactions(browser_id,created_at);
CREATE INDEX oidc_login_transactions_expiry_idx ON oidc_login_transactions(expires_at);
CREATE TABLE workspace_creation_receipts (
  principal_id uuid NOT NULL REFERENCES application_principals(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  name text NOT NULL, created_at timestamptz NOT NULL,
  PRIMARY KEY (principal_id,idempotency_key)
);
CREATE INDEX workspace_creation_receipts_rate_idx ON workspace_creation_receipts(principal_id,created_at);
COMMIT;
