-- Once-only additive migration after 0002, for an explicitly verified database.
-- No startup application, legacy backfill, ownership reassignment or rollback.
BEGIN;
CREATE TABLE physical_plans (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  current_revision_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES application_principals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physical_plans_workspace_id_key UNIQUE (workspace_id,id)
);
CREATE INDEX physical_plans_workspace_id_idx ON physical_plans(workspace_id,id);
CREATE TABLE physical_plan_revisions (
  id uuid PRIMARY KEY, workspace_id uuid NOT NULL, plan_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0), name text NOT NULL,
  envelope jsonb NOT NULL, evaluation jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES application_principals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physical_revisions_identity_key UNIQUE (workspace_id,plan_id,id),
  CONSTRAINT physical_revisions_number_key UNIQUE (workspace_id,plan_id,revision_number),
  CONSTRAINT physical_revisions_plan_fk FOREIGN KEY (workspace_id,plan_id) REFERENCES physical_plans(workspace_id,id) ON DELETE RESTRICT
);
ALTER TABLE physical_plans ADD CONSTRAINT physical_plans_current_revision_fk
  FOREIGN KEY (workspace_id,id,current_revision_id) REFERENCES physical_plan_revisions(workspace_id,plan_id,id)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE physical_save_receipts (
  principal_id uuid NOT NULL REFERENCES application_principals(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL, operation text NOT NULL CHECK (operation IN ('create','append')),
  resource text NOT NULL, idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  plan_id uuid NOT NULL, revision_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id,workspace_id,operation,resource,idempotency_key),
  CONSTRAINT physical_receipts_revision_fk FOREIGN KEY (workspace_id,plan_id,revision_id)
    REFERENCES physical_plan_revisions(workspace_id,plan_id,id) ON DELETE RESTRICT,
  CONSTRAINT physical_receipts_resource CHECK ((operation='create' AND resource='collection') OR (operation='append' AND resource=plan_id::text))
);
CREATE FUNCTION physical_saved_history_is_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Physical saved history is immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER physical_revisions_immutable BEFORE UPDATE OR DELETE ON physical_plan_revisions
  FOR EACH ROW EXECUTE FUNCTION physical_saved_history_is_immutable();
CREATE TRIGGER physical_receipts_immutable BEFORE UPDATE OR DELETE ON physical_save_receipts
  FOR EACH ROW EXECUTE FUNCTION physical_saved_history_is_immutable();
COMMIT;
