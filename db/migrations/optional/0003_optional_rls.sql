-- ============================================================================
-- BillFlow - 0003_optional_rls.sql
--
-- OPTIONAL, OFF BY DEFAULT.
--
-- BillFlow ships its own session-based auth, and tenant isolation is enforced
-- in one place in the data layer: every repository function takes a userId and
-- every statement carries `WHERE user_id = $1` (child tables join through their
-- parent invoice). `tests/integration/isolation.test.ts` proves that a second
-- user cannot read or mutate the first user's rows.
--
-- This file adds Row-Level Security as a second, database-level line of
-- defence for deployments that want it. It is NOT applied by `npm run
-- db:migrate` because forcing RLS requires every connection to declare who it
-- is acting as, which the seed script and the public (unauthenticated) invoice
-- endpoints deliberately do not do.
--
-- To enable it:
--   1. Run this file against your database once.
--   2. Set BILLFLOW_DB_RLS=1 so the data layer issues
--      `SELECT set_config('app.user_id', $1, true)` at the start of every
--      authenticated transaction.
--
-- If you instead move auth to Supabase, replace
-- `current_setting('app.user_id', true)::uuid` with `auth.uid()` throughout.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- --- Tenant-owned tables ----------------------------------------------------

ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_settings FORCE  ROW LEVEL SECURITY;
CREATE POLICY business_settings_owner ON business_settings
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE  ROW LEVEL SECURITY;
CREATE POLICY clients_owner ON clients
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE  ROW LEVEL SECURITY;
CREATE POLICY invoices_owner ON invoices
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

-- --- Child tables reach ownership through their invoice ---------------------

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items FORCE  ROW LEVEL SECURITY;
CREATE POLICY invoice_items_owner ON invoice_items
  USING (EXISTS (
    SELECT 1 FROM invoices i
     WHERE i.id = invoice_items.invoice_id AND i.user_id = app_current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
     WHERE i.id = invoice_items.invoice_id AND i.user_id = app_current_user_id()
  ));

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE  ROW LEVEL SECURITY;
CREATE POLICY payments_owner ON payments
  USING (EXISTS (
    SELECT 1 FROM invoices i
     WHERE i.id = payments.invoice_id AND i.user_id = app_current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
     WHERE i.id = payments.invoice_id AND i.user_id = app_current_user_id()
  ));

ALTER TABLE invoice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_events FORCE  ROW LEVEL SECURITY;
CREATE POLICY invoice_events_owner ON invoice_events
  USING (EXISTS (
    SELECT 1 FROM invoices i
     WHERE i.id = invoice_events.invoice_id AND i.user_id = app_current_user_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM invoices i
     WHERE i.id = invoice_events.invoice_id AND i.user_id = app_current_user_id()
  ));
