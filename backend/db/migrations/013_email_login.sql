-- Phase 13B: email login, consent version, anonymous audit actor.
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- Phone becomes a contact detail: remove any unique rule on it.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(phone)%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', c);
  END LOOP;
  FOR c IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename = 'users'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%(phone)%'
  LOOP
    EXECUTE format('DROP INDEX %I', c);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (lower(email)) WHERE email IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE otp_codes ALTER COLUMN phone DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes (email, created_at DESC);

ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS consent_version text;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS consent_version text;

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'audit_log'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%actor_type%'
  LOOP
    EXECUTE format('ALTER TABLE audit_log DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_type_check
  CHECK (actor_type IN ('user','admin','system','anonymous'));