-- Optional separately approved database-wide step, for a dedicated product database only.
-- Explicit variables: database_name, runtime_role. Never apply to a shared/unidentified database.
BEGIN;
SELECT set_config('mfp.setup.database', :'database_name', true), set_config('mfp.setup.runtime', :'runtime_role', true);
DO $database_permissions$
DECLARE target text:=current_setting('mfp.setup.database'); runtime_name text:=current_setting('mfp.setup.runtime'); actor record; grantee text;
BEGIN
  IF target !~ '^[a-z][a-z0-9_]{0,62}$' OR runtime_name !~ '^mfp_[a-z0-9_]{1,59}$' OR target<>current_database() THEN
    RAISE EXCEPTION 'Explicit dedicated database identity does not match';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=runtime_name AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
    AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication) THEN RAISE EXCEPTION 'Restricted runtime permission role is required'; END IF;
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC',target);
  FOR actor IN SELECT r.rolname FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','authenticator',runtime_name)
      OR (NOT r.rolsuper AND pg_has_role(r.oid,runtime_name,'MEMBER')) LOOP
    EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I',target,actor.rolname);
  END LOOP;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',target,runtime_name);
END
$database_permissions$;
COMMIT;
