-- Empty application schema only. psql -v ON_ERROR_STOP=1 -v schema_name=public -v object_owner=mfp_owner -f database/bootstrap.sql
-- Existing 0001-0004 migrations are separate, unchanged transactions applied afterward.
BEGIN;
SET LOCAL ROLE :"object_owner";
SELECT set_config('mfp.setup.schema', :'schema_name', true), set_config('mfp.setup.owner', :'object_owner', true);
DO $bootstrap$
DECLARE target text := current_setting('mfp.setup.schema'); owner_name text := current_setting('mfp.setup.owner');
BEGIN
  IF target !~ '^[a-z][a-z0-9_]{0,62}$' OR owner_name !~ '^mfp_[a-z0-9_]{1,59}$' OR current_user <> owner_name THEN
    RAISE EXCEPTION 'Invalid explicit application schema or owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname=target) THEN RAISE EXCEPTION 'Target schema must already exist'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=target AND c.relkind IN ('r','p','S','v','m','f')) THEN
    RAISE EXCEPTION 'Bootstrap requires an empty application schema; existing objects are preserved';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=target
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'))
    OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=target AND t.typtype IN ('e','d','c','r','m')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')) THEN
    RAISE EXCEPTION 'Bootstrap requires no pre-existing application functions or types';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=owner_name AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
    RAISE EXCEPTION 'Object owner must be a restricted non-login role';
  END IF;
  EXECUTE format('CREATE TABLE %I.users (id serial PRIMARY KEY, username text NOT NULL UNIQUE, password text NOT NULL)', target);
  EXECUTE format('CREATE TABLE %I.floor_plans (id serial PRIMARY KEY, name text NOT NULL, rooms jsonb NOT NULL, created_at text NOT NULL, updated_at text NOT NULL)', target);
END
$bootstrap$;
COMMIT;
