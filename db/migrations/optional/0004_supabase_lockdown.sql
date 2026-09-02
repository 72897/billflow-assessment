-- ============================================================================
-- BillFlow - 0004_supabase_lockdown.sql
--
-- HOST-SPECIFIC, and not part of `npm run db:migrate`.
--
-- On Supabase every project also exposes an auto-generated REST API over the
-- same database, reachable at https://<ref>.supabase.co/rest/v1/<table> with
-- the project's anon key. That key is designed to be public - it ships inside
-- browser bundles - so any table left readable by the `anon` role is readable
-- by the whole internet, regardless of how careful the application is.
--
-- BillFlow does not use that API at all. It connects as the `postgres` role
-- with its own session auth, and tenant isolation lives in the data layer
-- (`WHERE user_id = $1` on every statement, proven by the integration tests).
-- So the correct posture is to shut the REST surface down completely:
--
--   1. ENABLE ROW LEVEL SECURITY with no policies. PostgREST connects as
--      `anon` or `authenticated`, neither of which owns the tables, so every
--      query returns zero rows. `postgres` owns them and is not FORCEd, so the
--      application is unaffected.
--   2. REVOKE the table grants as well, so the API answers "permission denied"
--      instead of an empty list - a clearer signal, and defence in depth if a
--      policy is ever added by accident.
--
-- Safe to run more than once. Skips silently on a database with no Supabase
-- roles, so the same file can be run against plain Postgres or PGlite.
--
-- To undo: GRANT the privileges back and `ALTER TABLE ... DISABLE ROW LEVEL
-- SECURITY` for each table listed below.
-- ============================================================================

DO $$
DECLARE
  v_table text;
  v_role  text;
  v_tables text[] := ARRAY[
    'users', 'sessions', 'business_settings', 'clients',
    'invoices', 'invoice_items', 'payments', 'invoice_events'
  ];
  v_roles text[] := ARRAY['anon', 'authenticated'];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = v_table) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

      FOREACH v_role IN ARRAY v_roles LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
          EXECUTE format('REVOKE ALL PRIVILEGES ON public.%I FROM %I', v_table, v_role);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- The financial rollup reads from clients and invoices, so it must not be a
  -- way around the tables above.
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'client_financials') THEN
    FOREACH v_role IN ARRAY v_roles LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON public.client_financials FROM %I', v_role);
      END IF;
    END LOOP;
  END IF;

  -- Future tables in this schema should not be granted to the API roles either.
  FOREACH v_role IN ARRAY v_roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', v_role);
    END IF;
  END LOOP;
END $$;
