-- Phase 13B: gateway fees, indexes, append-only financial and audit tables.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_fee_cents integer;
ALTER TABLE platform_charges ADD COLUMN IF NOT EXISTS gateway_fee_cents integer;

CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments (paid_at) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_platform_charges_paid_at ON platform_charges (paid_at) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_payouts_paid_at ON payouts (paid_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_type, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION zd_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ZD-IMMUTABLE: % on % is not allowed', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION zd_payments_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    IF NEW.status NOT IN ('paid','refunded')
       OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.request_id IS DISTINCT FROM OLD.request_id
       OR NEW.method IS DISTINCT FROM OLD.method
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'ZD-IMMUTABLE: a paid payment cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
CREATE TRIGGER trg_audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION zd_block_mutation();

DROP TRIGGER IF EXISTS trg_pricing_change_log_immutable ON pricing_change_log;
CREATE TRIGGER trg_pricing_change_log_immutable BEFORE UPDATE OR DELETE ON pricing_change_log
  FOR EACH ROW EXECUTE FUNCTION zd_block_mutation();

DROP TRIGGER IF EXISTS trg_provider_ledger_immutable ON provider_ledger;
CREATE TRIGGER trg_provider_ledger_immutable BEFORE UPDATE OR DELETE ON provider_ledger
  FOR EACH ROW EXECUTE FUNCTION zd_block_mutation();

DROP TRIGGER IF EXISTS trg_payouts_immutable ON payouts;
CREATE TRIGGER trg_payouts_immutable BEFORE UPDATE OR DELETE ON payouts
  FOR EACH ROW EXECUTE FUNCTION zd_block_mutation();

DROP TRIGGER IF EXISTS trg_payments_no_delete ON payments;
CREATE TRIGGER trg_payments_no_delete BEFORE DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION zd_block_mutation();

DROP TRIGGER IF EXISTS trg_platform_charges_no_delete ON platform_charges;
CREATE TRIGGER trg_platform_charges_no_delete BEFORE DELETE ON platform_charges
  FOR EACH ROW EXECUTE FUNCTION zd_block_mutation();

DROP TRIGGER IF EXISTS trg_requests_no_delete ON requests;
CREATE TRIGGER trg_requests_no_delete BEFORE DELETE ON requests
  FOR EACH ROW EXECUTE FUNCTION zd_block_mutation();

DROP TRIGGER IF EXISTS trg_payments_guard ON payments;
CREATE TRIGGER trg_payments_guard BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION zd_payments_guard();