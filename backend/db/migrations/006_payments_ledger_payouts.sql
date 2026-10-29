CREATE TABLE IF NOT EXISTS payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id bigint NOT NULL UNIQUE REFERENCES requests (id),
  method text NOT NULL DEFAULT 'unpaid' CHECK (method IN ('card','cash','eft','unpaid')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  amount_cents integer NOT NULL,
  paystack_ref text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_paystack_ref ON payments (paystack_ref) WHERE paystack_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

CREATE TABLE IF NOT EXISTS provider_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_user_id bigint NOT NULL REFERENCES users (id),
  request_id bigint REFERENCES requests (id),
  entry_type text NOT NULL CHECK (entry_type IN ('earning','commission','payout','adjustment')),
  amount_cents integer NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_ledger_provider ON provider_ledger (provider_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_ledger_request ON provider_ledger (request_id);

CREATE TABLE IF NOT EXISTS payouts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_user_id bigint NOT NULL REFERENCES users (id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reference text,
  method text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  paid_by bigint,
  note text
);

CREATE INDEX IF NOT EXISTS idx_payouts_provider ON payouts (provider_user_id, paid_at DESC);