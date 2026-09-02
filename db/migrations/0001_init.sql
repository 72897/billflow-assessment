-- ============================================================================
-- BillFlow — 0001_init.sql
-- Initial schema. Plain PostgreSQL: runs identically against a managed
-- Postgres (Supabase / Neon / RDS) and against the embedded PGlite engine used
-- for zero-setup local development.
--
-- Conventions
--   * Every money column is numeric(14,2). Never float / double precision.
--   * Every tenant-owned table carries user_id and is always queried with it.
--   * Timestamps are timestamptz; dates that belong to the document (issue /
--     due) are plain date because they are calendar facts, not instants.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------------
-- users — authentication identity + profile (the "freelancer")
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  full_name     text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_not_blank CHECK (length(btrim(email)) > 0),
  CONSTRAINT users_full_name_len   CHECK (length(full_name) BETWEEN 1 AND 120)
);

-- Email uniqueness is case-insensitive: Demo@x.com and demo@x.com are one account.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- sessions — server-side session store, so logout genuinely revokes access
-- Only the SHA-256 hash of the cookie token is persisted.
-- ---------------------------------------------------------------------------

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   text        NOT NULL UNIQUE,
  user_agent   text,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);


-- ---------------------------------------------------------------------------
-- business_settings — one row per user; drives invoice branding + numbering
-- ---------------------------------------------------------------------------

CREATE TABLE business_settings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  business_name       text        NOT NULL DEFAULT '',
  business_email      text        NOT NULL DEFAULT '',
  phone               text        NOT NULL DEFAULT '',
  address             text        NOT NULL DEFAULT '',
  tax_id              text        NOT NULL DEFAULT '',
  logo_url            text,
  currency            text        NOT NULL DEFAULT 'INR',
  invoice_prefix      text        NOT NULL DEFAULT 'INV',
  next_invoice_number integer     NOT NULL DEFAULT 1,
  default_tax_rate    numeric(5,2) NOT NULL DEFAULT 0,
  default_notes       text        NOT NULL DEFAULT '',
  payment_terms_days  integer     NOT NULL DEFAULT 14,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_settings_next_number_positive CHECK (next_invoice_number >= 1),
  CONSTRAINT business_settings_prefix_shape         CHECK (invoice_prefix ~ '^[A-Z0-9-]{1,10}$'),
  CONSTRAINT business_settings_currency_shape       CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT business_settings_tax_rate_range       CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),
  CONSTRAINT business_settings_terms_range          CHECK (payment_terms_days BETWEEN 0 AND 365)
);

CREATE TRIGGER business_settings_set_updated_at
  BEFORE UPDATE ON business_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- clients — people and businesses the user invoices
-- archived_at lets a client with invoice history be retired without breaking
-- the historical record (see CL-08).
-- ---------------------------------------------------------------------------

CREATE TABLE clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name        text        NOT NULL,
  company     text        NOT NULL DEFAULT '',
  email       text        NOT NULL,
  phone       text        NOT NULL DEFAULT '',
  address     text        NOT NULL DEFAULT '',
  notes       text        NOT NULL DEFAULT '',
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_name_len    CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT clients_email_shape CHECK (email = '' OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT clients_company_len CHECK (length(company) <= 120),
  CONSTRAINT clients_phone_len   CHECK (length(phone) <= 40),
  CONSTRAINT clients_address_len CHECK (length(address) <= 500)
);

CREATE INDEX clients_user_id_created_idx ON clients (user_id, created_at DESC);
CREATE INDEX clients_user_id_name_idx    ON clients (user_id, lower(name));


-- ---------------------------------------------------------------------------
-- invoices
-- Only durable states are stored (draft | sent | paid). "Overdue" is derived
-- at read time from status + due_date + paid_at, so an invoice can never get
-- stuck in a stale overdue state. See the is_overdue expression below.
-- ---------------------------------------------------------------------------

CREATE TABLE invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id         uuid NOT NULL REFERENCES clients (id) ON DELETE RESTRICT,

  invoice_number    text        NOT NULL,
  issue_date        date        NOT NULL,
  due_date          date        NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',
  currency          text        NOT NULL DEFAULT 'INR',

  subtotal          numeric(14,2) NOT NULL DEFAULT 0,
  discount_type     text,
  discount_value    numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount   numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate          numeric(5,2)  NOT NULL DEFAULT 0,
  tax_amount        numeric(14,2) NOT NULL DEFAULT 0,
  total             numeric(14,2) NOT NULL DEFAULT 0,

  notes             text        NOT NULL DEFAULT '',

  -- Branding as it was when the document was created, so a later Settings
  -- change never rewrites history on an already-sent invoice.
  business_snapshot jsonb,

  public_token      text,
  sent_at           timestamptz,
  first_viewed_at   timestamptz,
  last_viewed_at    timestamptz,
  view_count        integer     NOT NULL DEFAULT 0,
  reminder_sent_at  timestamptz,
  reminder_count    integer     NOT NULL DEFAULT 0,
  paid_at           timestamptz,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invoices_status_valid        CHECK (status IN ('draft', 'sent', 'paid')),
  CONSTRAINT invoices_discount_type_valid CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'fixed')),
  CONSTRAINT invoices_number_len          CHECK (length(btrim(invoice_number)) BETWEEN 1 AND 40),
  CONSTRAINT invoices_currency_shape      CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT invoices_due_after_issue     CHECK (due_date >= issue_date),
  CONSTRAINT invoices_amounts_non_negative CHECK (
    subtotal >= 0 AND discount_value >= 0 AND discount_amount >= 0
    AND tax_amount >= 0 AND total >= 0
  ),
  CONSTRAINT invoices_tax_rate_range      CHECK (tax_rate >= 0 AND tax_rate <= 100),
  CONSTRAINT invoices_discount_not_over   CHECK (discount_amount <= subtotal),
  CONSTRAINT invoices_paid_has_timestamp  CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CONSTRAINT invoices_notes_len           CHECK (length(notes) <= 2000)
);

-- An invoice number is unique per user, never globally.
CREATE UNIQUE INDEX invoices_user_number_key ON invoices (user_id, lower(invoice_number));

-- Public tokens must be globally unique; NULL means "no active share link".
CREATE UNIQUE INDEX invoices_public_token_key ON invoices (public_token) WHERE public_token IS NOT NULL;

CREATE INDEX invoices_user_issue_idx  ON invoices (user_id, issue_date DESC, created_at DESC);
CREATE INDEX invoices_user_status_idx ON invoices (user_id, status);
CREATE INDEX invoices_user_client_idx ON invoices (user_id, client_id);
CREATE INDEX invoices_user_due_idx    ON invoices (user_id, due_date);
CREATE INDEX invoices_user_total_idx  ON invoices (user_id, total);
CREATE INDEX invoices_user_paid_idx   ON invoices (user_id, paid_at);

CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- invoice_items — ordered line items; amount is always quantity * rate
-- ---------------------------------------------------------------------------

CREATE TABLE invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  description text          NOT NULL,
  detail      text          NOT NULL DEFAULT '',
  quantity    numeric(12,3) NOT NULL,
  rate        numeric(14,2) NOT NULL,
  amount      numeric(14,2) NOT NULL,
  position    integer       NOT NULL DEFAULT 0,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT invoice_items_description_len CHECK (length(btrim(description)) BETWEEN 1 AND 200),
  CONSTRAINT invoice_items_detail_len      CHECK (length(detail) <= 300),
  CONSTRAINT invoice_items_quantity_pos    CHECK (quantity > 0),
  CONSTRAINT invoice_items_rate_non_neg    CHECK (rate >= 0),
  CONSTRAINT invoice_items_amount_non_neg  CHECK (amount >= 0)
);

CREATE INDEX invoice_items_invoice_position_idx ON invoice_items (invoice_id, position);


-- ---------------------------------------------------------------------------
-- payments — one row per settled (simulated) payment
-- idempotency_key makes a double-submitted payment a no-op instead of a
-- duplicate charge (PAY-03).
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  amount          numeric(14,2) NOT NULL,
  currency        text        NOT NULL DEFAULT 'INR',
  method          text        NOT NULL,
  reference       text        NOT NULL UNIQUE,
  status          text        NOT NULL DEFAULT 'succeeded',
  card_last4      text,
  payer_note      text        NOT NULL DEFAULT '',
  idempotency_key text,
  paid_at         timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_method_valid    CHECK (method IN ('card', 'bank_transfer', 'manual')),
  CONSTRAINT payments_status_valid    CHECK (status IN ('succeeded', 'failed', 'pending')),
  CONSTRAINT payments_currency_shape  CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX payments_invoice_idempotency_key
  ON payments (invoice_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX payments_invoice_idx ON payments (invoice_id);
CREATE INDEX payments_paid_at_idx ON payments (paid_at);


-- ---------------------------------------------------------------------------
-- invoice_events — append-only audit trail powering the activity timeline
-- ---------------------------------------------------------------------------

CREATE TABLE invoice_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  type       text        NOT NULL,
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_events_type_valid CHECK (type IN (
    'created', 'updated', 'sent', 'viewed', 'reminder_sent',
    'link_revoked', 'link_regenerated', 'payment_received', 'duplicated'
  ))
);

CREATE INDEX invoice_events_invoice_created_idx ON invoice_events (invoice_id, created_at DESC);
