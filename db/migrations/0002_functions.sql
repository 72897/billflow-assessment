-- ============================================================================
-- BillFlow - 0002_functions.sql
-- Invoice numbering (concurrency-safe), derived status, reporting views.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- invoice_display_status(status, due_date, paid_at) -> draft | sent | overdue | paid
--
-- The single source of truth for what a user sees. "overdue" is never stored;
-- it is derived on every read, so an invoice that gets paid stops being overdue
-- immediately and an unpaid invoice becomes overdue on its own overnight
-- (INV-20) with nobody running a cron job.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invoice_display_status(
  p_status   text,
  p_due_date date,
  p_paid_at  timestamptz
) RETURNS text AS $$
BEGIN
  IF p_paid_at IS NOT NULL OR p_status = 'paid' THEN
    RETURN 'paid';
  ELSIF p_status = 'sent' AND p_due_date < CURRENT_DATE THEN
    RETURN 'overdue';
  ELSE
    RETURN p_status;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;


-- ---------------------------------------------------------------------------
-- peek_invoice_number(user_id) -> text
--
-- Read-only preview of the number a new invoice would get. Used to prefill the
-- create form and to render the live preview in Settings. Skips numbers that
-- are already taken (the field is user-editable, so gaps happen).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION peek_invoice_number(p_user_id uuid) RETURNS text AS $$
DECLARE
  v_prefix    text;
  v_next      integer;
  v_candidate text;
  v_attempts  integer := 0;
BEGIN
  SELECT invoice_prefix, next_invoice_number
    INTO v_prefix, v_next
    FROM business_settings
   WHERE user_id = p_user_id;

  IF v_prefix IS NULL THEN
    RETURN 'INV-0001';
  END IF;

  LOOP
    v_candidate := v_prefix || '-' || lpad(v_next::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE user_id = p_user_id AND lower(invoice_number) = lower(v_candidate)
    );
    v_next := v_next + 1;
    v_attempts := v_attempts + 1;
    IF v_attempts > 10000 THEN
      RAISE EXCEPTION 'Could not find a free invoice number for user %', p_user_id;
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$ LANGUAGE plpgsql STABLE;


-- ---------------------------------------------------------------------------
-- allocate_invoice_number(user_id) -> text
--
-- Consumes the next number and advances the counter. Takes a row lock on the
-- settings row first, so two invoices created at the same instant can never
-- receive the same number (INV-10). Must be called inside a transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION allocate_invoice_number(p_user_id uuid) RETURNS text AS $$
DECLARE
  v_prefix    text;
  v_next      integer;
  v_candidate text;
  v_attempts  integer := 0;
BEGIN
  -- FOR UPDATE serialises concurrent allocations for this user.
  SELECT invoice_prefix, next_invoice_number
    INTO v_prefix, v_next
    FROM business_settings
   WHERE user_id = p_user_id
     FOR UPDATE;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'No business settings row for user %', p_user_id;
  END IF;

  LOOP
    v_candidate := v_prefix || '-' || lpad(v_next::text, 4, '0');
    v_next := v_next + 1;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM invoices
       WHERE user_id = p_user_id AND lower(invoice_number) = lower(v_candidate)
    );
    v_attempts := v_attempts + 1;
    IF v_attempts > 10000 THEN
      RAISE EXCEPTION 'Could not find a free invoice number for user %', p_user_id;
    END IF;
  END LOOP;

  UPDATE business_settings
     SET next_invoice_number = v_next
   WHERE user_id = p_user_id;

  RETURN v_candidate;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------------
-- client_financials - per-client billing rollup for the client detail screen
-- Drafts are excluded from "billed" because a draft has not been issued yet.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW client_financials AS
SELECT
  c.id      AS client_id,
  c.user_id AS user_id,
  count(i.id) FILTER (WHERE i.id IS NOT NULL AND i.archived_at IS NULL)                          AS invoice_count,
  coalesce(sum(i.total) FILTER (WHERE i.archived_at IS NULL AND i.status <> 'draft'), 0)         AS total_billed,
  coalesce(sum(i.total) FILTER (WHERE i.archived_at IS NULL AND i.status = 'paid'), 0)           AS total_paid,
  coalesce(sum(i.total) FILTER (WHERE i.archived_at IS NULL AND i.status = 'sent'), 0)           AS total_outstanding,
  count(i.id) FILTER (WHERE i.archived_at IS NULL AND i.status = 'paid')                         AS paid_count,
  count(i.id) FILTER (WHERE i.archived_at IS NULL AND i.status = 'sent')                         AS outstanding_count,
  count(i.id) FILTER (
    WHERE i.archived_at IS NULL AND i.status = 'sent'
      AND i.due_date < CURRENT_DATE AND i.paid_at IS NULL
  )                                                                                              AS overdue_count
FROM clients c
LEFT JOIN invoices i ON i.client_id = c.id AND i.user_id = c.user_id
GROUP BY c.id, c.user_id;
