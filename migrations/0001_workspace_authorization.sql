-- Additive M4A authorization foundation. Apply once to an explicitly identified database.
-- Existing users/password scaffolding and floor-plan payloads remain untouched.
BEGIN;
CREATE TABLE application_principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active' CONSTRAINT application_principals_status CHECK (status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE external_identities (
  issuer text NOT NULL, subject text NOT NULL,
  principal_id uuid NOT NULL REFERENCES application_principals(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CONSTRAINT external_identities_status CHECK (status IN ('active','revoked')),
  PRIMARY KEY (issuer, subject),
  CONSTRAINT external_identities_nonempty CHECK (length(trim(issuer)) > 0 AND length(trim(subject)) > 0)
);
CREATE INDEX external_identities_principal_idx ON external_identities(principal_id);
CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CONSTRAINT workspaces_name CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workspace_memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  principal_id uuid NOT NULL REFERENCES application_principals(id) ON DELETE RESTRICT,
  role text NOT NULL CONSTRAINT workspace_memberships_role CHECK (role IN ('owner','editor','viewer')),
  status text NOT NULL DEFAULT 'active' CONSTRAINT workspace_memberships_status CHECK (status IN ('active','revoked')),
  PRIMARY KEY (workspace_id, principal_id)
);
CREATE INDEX workspace_memberships_principal_idx ON workspace_memberships(principal_id);
ALTER TABLE floor_plans ADD COLUMN workspace_id uuid REFERENCES workspaces(id) ON DELETE RESTRICT;
CREATE INDEX floor_plans_workspace_updated_idx ON floor_plans(workspace_id, updated_at);
COMMIT;
