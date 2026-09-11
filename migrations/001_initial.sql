CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS parents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parents(id),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trial_classes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  maximum_capacity INT NOT NULL DEFAULT 4 CHECK (maximum_capacity > 0),
  confirmed_count INT NOT NULL DEFAULT 0 CHECK (confirmed_count >= 0 AND confirmed_count <= maximum_capacity)
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id),
  trial_class_id TEXT NOT NULL REFERENCES trial_classes(id),
  status TEXT NOT NULL DEFAULT 'held'
    CHECK (status IN ('held','confirmed','payment_failed','hold_expired')),
  accepted_payment_attempt_id TEXT,
  hold_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, trial_class_id)
);

CREATE TABLE IF NOT EXISTS payment_attempts (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  provider_invoice_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','succeeded','failed')),
  amount_cents INT NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  provider_event_id TEXT PRIMARY KEY,
  provider_invoice_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('succeeded','failed')),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reject_payment_events_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payment_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_update_payment_events ON payment_events;
CREATE TRIGGER no_update_payment_events
  BEFORE UPDATE OR DELETE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION reject_payment_events_mutation();
CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('refund_requested','refund_succeeded')),
  booking_id TEXT REFERENCES bookings(id),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_jobs (
  outbox_event_id TEXT PRIMARY KEY REFERENCES outbox_events(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
