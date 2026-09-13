-- Administrative, once-only setup after unchanged 0001-0004. Never application startup.
-- Variables: schema_name, object_owner (dedicated NOLOGIN), runtime_role (dedicated NOLOGIN permission role).
BEGIN;
SELECT set_config('mfp.setup.schema', :'schema_name', true), set_config('mfp.setup.owner', :'object_owner', true),
  set_config('mfp.setup.runtime', :'runtime_role', true);
DO $hardening$
DECLARE
  target text := current_setting('mfp.setup.schema');
  owner_name text := current_setting('mfp.setup.owner'); runtime_name text := current_setting('mfp.setup.runtime');
  owner_id oid; runtime_id oid; member_row record; table_name text; role_name text; grantee text; obj record;
  tables text[] := ARRAY['users','floor_plans','application_principals','external_identities','workspaces','workspace_memberships',
    'mfp_sessions','auth_browser_contexts','oidc_login_transactions','workspace_creation_receipts','physical_plans',
    'physical_plan_revisions','physical_save_receipts','physical_lifecycle_receipts'];
  mutable text[] := ARRAY['floor_plans','workspaces','workspace_memberships','mfp_sessions','auth_browser_contexts','oidc_login_transactions','physical_plans'];
  grantees text[] := ARRAY['PUBLIC'];
BEGIN
  IF target !~ '^[a-z][a-z0-9_]{0,62}$' OR owner_name !~ '^mfp_[a-z0-9_]{1,59}$'
    OR runtime_name !~ '^mfp_[a-z0-9_]{1,59}$' OR owner_name=runtime_name THEN RAISE EXCEPTION 'Invalid explicit setup identifiers'; END IF;
  SELECT oid INTO owner_id FROM pg_roles WHERE rolname=owner_name;
  SELECT oid INTO runtime_id FROM pg_roles WHERE rolname=runtime_name;
  IF owner_id IS NULL OR runtime_id IS NULL THEN RAISE EXCEPTION 'Dedicated setup roles must already exist'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE oid IN (owner_id,runtime_id)
    AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
    RAISE EXCEPTION 'Owner and runtime permission roles must be restricted non-login roles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN (owner_id,runtime_id)) THEN
    RAISE EXCEPTION 'Owner and runtime permission roles must not inherit or SET ROLE to another role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=owner_id AND d.deptype='o'
      AND d.dbid<>(SELECT oid FROM pg_database WHERE datname=current_database()))
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relowner=owner_id AND c.relkind IN ('r','p','S','v','m','f') AND n.nspname<>target)
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proowner=owner_id AND n.nspname<>target)
    OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner=owner_id AND n.nspname<>target) THEN
    RAISE EXCEPTION 'Object owner must be dedicated to this application schema and database';
  END IF;
  -- Membership authority matters even when INHERIT is disabled. Check every descendant login/group.
  FOR member_row IN WITH RECURSIVE members(id) AS (
      SELECT runtime_id UNION SELECT m.member FROM pg_auth_members m JOIN members a ON m.roleid=a.id
    ) SELECT r.* FROM pg_roles r JOIN members m ON m.id=r.oid LOOP
    IF member_row.rolsuper OR member_row.rolbypassrls OR member_row.rolcreatedb OR member_row.rolcreaterole OR member_row.rolreplication
      OR member_row.rolname IN ('anon','authenticated','service_role','authenticator')
      OR pg_has_role(member_row.oid, owner_id, 'MEMBER') THEN RAISE EXCEPTION 'Unsafe runtime role membership'; END IF;
    IF EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member=member_row.oid AND m.roleid<>runtime_id)
      OR EXISTS (SELECT 1 FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=member_row.oid AND d.deptype='o') THEN
      RAISE EXCEPTION 'Runtime identities must own no objects and have only the runtime membership';
    END IF;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) AND
      (pg_has_role(role_name,owner_name,'MEMBER') OR pg_has_role(role_name,runtime_name,'MEMBER')) THEN
      RAISE EXCEPTION 'Data API identity must not assume application roles';
    END IF;
  END LOOP;
  -- Fail before changing privileges if this is not the exact expected application object set.
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=target
      AND c.relname=ANY(tables) AND c.relkind='r' AND c.relowner=owner_id) <> cardinality(tables) THEN
    RAISE EXCEPTION 'All expected application tables must exist under the dedicated owner';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=target
      AND c.relowner=owner_id AND c.relkind IN ('r','p','v','m','f') AND NOT c.relname=ANY(tables)) THEN
    RAISE EXCEPTION 'Unexpected owned application tables or views';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=target
      AND c.relname IN ('users_id_seq','floor_plans_id_seq') AND c.relkind='S' AND c.relowner=owner_id)<>2 THEN
    RAISE EXCEPTION 'Expected legacy sequences are missing or differently owned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=target
      AND p.proname='physical_saved_history_is_immutable' AND p.pronargs=0 AND p.prorettype='trigger'::regtype AND p.proowner=owner_id AND NOT p.prosecdef) THEN
    RAISE EXCEPTION 'Expected invoker history trigger function is missing or changed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=target
      AND NOT (p.proname='physical_saved_history_is_immutable' AND p.pronargs=0 AND p.proowner=owner_id)
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')) THEN
    RAISE EXCEPTION 'Unexpected application function requires explicit review';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname=target AND p.proname='physical_saved_history_is_immutable'
      AND p.pronamespace=n.oid AND t.tgenabled='O' AND t.tgtype=27 AND NOT t.tgisinternal AND t.tgqual IS NULL
      AND ((c.relname='physical_plan_revisions' AND t.tgname='physical_revisions_immutable')
        OR (c.relname='physical_save_receipts' AND t.tgname='physical_receipts_immutable')
        OR (c.relname='physical_lifecycle_receipts' AND t.tgname='physical_lifecycle_receipts_immutable')))<>3 THEN
    RAISE EXCEPTION 'Expected enabled immutable-history triggers are missing or changed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=target AND c.relname=ANY(tables)) THEN RAISE EXCEPTION 'Unexpected pre-existing application RLS policies'; END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=target AND c.relname=ANY(tables) AND a.attacl IS NOT NULL) THEN
    RAISE EXCEPTION 'Unexpected column privileges require explicit review before hardening';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','authenticator'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN grantees:=array_append(grantees,role_name); END IF;
  END LOOP;
  grantees:=array_append(grantees,runtime_name);
  -- Also remove direct ACLs from the runtime login(s), so inheritance cannot mask excessive privileges.
  FOR member_row IN SELECT r.rolname FROM pg_roles r WHERE r.oid<>runtime_id AND pg_has_role(r.oid,runtime_id,'MEMBER') AND NOT r.rolsuper LOOP
    grantees:=array_append(grantees,member_row.rolname);
  END LOOP;
  FOREACH role_name IN ARRAY grantees LOOP
    grantee:=CASE WHEN role_name='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(role_name) END;
    FOREACH table_name IN ARRAY tables LOOP EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %s',target,table_name,grantee); END LOOP;
    EXECUTE format('REVOKE ALL ON SEQUENCE %I.users_id_seq, %I.floor_plans_id_seq FROM %s',target,target,grantee);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.physical_saved_history_is_immutable() FROM %s',target,grantee);
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM %s',target,grantee);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON TABLES FROM %s',owner_name,target,grantee);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %s',owner_name,target,grantee);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %s',owner_name,target,grantee);
    -- Global defaults cannot be revoked IN SCHEMA. The object owner is dedicated to this schema/database.
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON TABLES FROM %s',owner_name,grantee);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON SEQUENCES FROM %s',owner_name,grantee);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM %s',owner_name,grantee);
  END LOOP;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',target,runtime_name);
  EXECUTE format('GRANT USAGE ON SEQUENCE %I.floor_plans_id_seq TO %I',target,runtime_name);
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',target,table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',target,table_name);
    IF table_name='users' THEN CONTINUE; END IF;
    EXECUTE format('GRANT SELECT, INSERT ON TABLE %I.%I TO %I',target,table_name,runtime_name);
    EXECUTE format('CREATE POLICY mfp_server_read ON %I.%I FOR SELECT TO %I USING (true)',target,table_name,runtime_name);
    EXECUTE format('CREATE POLICY mfp_server_insert ON %I.%I FOR INSERT TO %I WITH CHECK (true)',target,table_name,runtime_name);
    IF table_name=ANY(mutable) THEN
      EXECUTE format('GRANT UPDATE ON TABLE %I.%I TO %I',target,table_name,runtime_name);
      EXECUTE format('CREATE POLICY mfp_server_update ON %I.%I FOR UPDATE TO %I USING (true) WITH CHECK (true)',target,table_name,runtime_name);
    ELSIF table_name IN ('application_principals','external_identities') THEN
      EXECUTE format('GRANT UPDATE(status) ON TABLE %I.%I TO %I',target,table_name,runtime_name);
      EXECUTE format('CREATE POLICY mfp_server_lock_only ON %I.%I FOR UPDATE TO %I USING (true) WITH CHECK (false)',target,table_name,runtime_name);
    END IF;
    IF table_name IN ('floor_plans','mfp_sessions') THEN
      EXECUTE format('GRANT DELETE ON TABLE %I.%I TO %I',target,table_name,runtime_name);
      EXECUTE format('CREATE POLICY mfp_server_delete ON %I.%I FOR DELETE TO %I USING (true)',target,table_name,runtime_name);
    END IF;
  END LOOP;
END
$hardening$;
COMMIT;
