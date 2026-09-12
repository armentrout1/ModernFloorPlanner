-- Once-only additive lifecycle metadata after 0003. Never run by application startup.
-- Existing physical documents, immutable revisions and save receipts stay unchanged.
BEGIN;
ALTER TABLE physical_plans
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES application_principals(id) ON DELETE RESTRICT,
  ADD COLUMN lifecycle_version integer NOT NULL DEFAULT 0,
  ADD COLUMN copied_from_plan_id uuid,
  ADD COLUMN copied_from_revision_id uuid,
  ADD CONSTRAINT physical_plans_lifecycle_version CHECK (lifecycle_version >= 0),
  ADD CONSTRAINT physical_plans_archive_actor CHECK ((archived_at IS NULL) = (archived_by IS NULL)),
  ADD CONSTRAINT physical_plans_copy_pair CHECK ((copied_from_plan_id IS NULL) = (copied_from_revision_id IS NULL) AND (copied_from_plan_id IS NULL OR copied_from_plan_id <> id)),
  ADD CONSTRAINT physical_plans_copy_revision_fk FOREIGN KEY (workspace_id,copied_from_plan_id,copied_from_revision_id)
    REFERENCES physical_plan_revisions(workspace_id,plan_id,id) ON DELETE RESTRICT;
CREATE INDEX physical_plans_active_workspace_idx ON physical_plans(workspace_id,id) WHERE archived_at IS NULL;
CREATE INDEX physical_plans_archived_workspace_idx ON physical_plans(workspace_id,id) WHERE archived_at IS NOT NULL;
CREATE TABLE physical_lifecycle_receipts (
  principal_id uuid NOT NULL REFERENCES application_principals(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL, operation text NOT NULL,
  resource_plan_id uuid NOT NULL, idempotency_key uuid NOT NULL,
  request_hash text NOT NULL, result_plan_id uuid NOT NULL, result_revision_id uuid NOT NULL,
  applied_archived_at timestamptz, applied_lifecycle_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id,workspace_id,operation,resource_plan_id,idempotency_key),
  CONSTRAINT physical_lifecycle_source_fk FOREIGN KEY (workspace_id,resource_plan_id)
    REFERENCES physical_plans(workspace_id,id) ON DELETE RESTRICT,
  CONSTRAINT physical_lifecycle_result_fk FOREIGN KEY (workspace_id,result_plan_id,result_revision_id)
    REFERENCES physical_plan_revisions(workspace_id,plan_id,id) ON DELETE RESTRICT,
  CONSTRAINT physical_lifecycle_operation CHECK (operation IN ('duplicate','archive','restore')),
  CONSTRAINT physical_lifecycle_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT physical_lifecycle_version CHECK (applied_lifecycle_version >= 0),
  CONSTRAINT physical_lifecycle_result CHECK ((operation='duplicate' AND result_plan_id<>resource_plan_id AND applied_lifecycle_version=0)
    OR (operation IN ('archive','restore') AND result_plan_id=resource_plan_id)),
  CONSTRAINT physical_lifecycle_archive CHECK ((operation='archive') = (applied_archived_at IS NOT NULL))
);
CREATE TRIGGER physical_lifecycle_receipts_immutable BEFORE UPDATE OR DELETE ON physical_lifecycle_receipts
  FOR EACH ROW EXECUTE FUNCTION physical_saved_history_is_immutable();
COMMIT;
