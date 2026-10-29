CREATE TABLE IF NOT EXISTS admin_users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type text NOT NULL CHECK (actor_type IN ('user','admin','system')),
  actor_id bigint,
  action text NOT NULL,
  entity text,
  entity_id bigint,
  meta jsonb,
  request_id text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_request ON audit_log (request_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);

-- Foreign keys to admin_users, added here because admin_users is created last.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_provider_profiles_approved_by') THEN
    ALTER TABLE provider_profiles ADD CONSTRAINT fk_provider_profiles_approved_by FOREIGN KEY (approved_by) REFERENCES admin_users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_provider_documents_reviewed_by') THEN
    ALTER TABLE provider_documents ADD CONSTRAINT fk_provider_documents_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES admin_users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payouts_paid_by') THEN
    ALTER TABLE payouts ADD CONSTRAINT fk_payouts_paid_by FOREIGN KEY (paid_by) REFERENCES admin_users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_app_settings_updated_by') THEN
    ALTER TABLE app_settings ADD CONSTRAINT fk_app_settings_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_provider_profiles_approved_by ON provider_profiles (approved_by);
CREATE INDEX IF NOT EXISTS idx_provider_documents_reviewed_by ON provider_documents (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_payouts_paid_by ON payouts (paid_by);
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_by ON app_settings (updated_by);