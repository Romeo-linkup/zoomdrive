-- Phase 11: ledger integrity, payout links, encrypted provider bank details.
ALTER TABLE provider_ledger ADD COLUMN IF NOT EXISTS payout_id bigint REFERENCES payouts(id);

-- A request can be credited (earning) or charged (commission) at most once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_ledger_request_entry
  ON provider_ledger (request_id, entry_type)
  WHERE request_id IS NOT NULL AND entry_type IN ('earning','commission');
CREATE INDEX IF NOT EXISTS idx_provider_ledger_provider ON provider_ledger (provider_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_paystack_ref ON payments (paystack_ref) WHERE paystack_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payouts_reference ON payouts (reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payouts_provider ON payouts (provider_user_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS provider_bank_details (
  provider_user_id bigint PRIMARY KEY REFERENCES users(id),
  account_holder text NOT NULL,
  bank_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('cheque','savings','transmission')),
  branch_code text NOT NULL,
  account_number_enc text NOT NULL,
  account_last4 text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);