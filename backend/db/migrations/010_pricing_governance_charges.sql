-- Pricing governance (emailed-code change flow), Paystack platform charges, Plus memberships, provider fee state.
CREATE TABLE IF NOT EXISTS admin_change_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id bigint NOT NULL REFERENCES admin_users(id),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_change_challenges_admin ON admin_change_challenges (admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pricing_change_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id bigint NOT NULL REFERENCES admin_users(id),
  challenge_id uuid REFERENCES admin_change_challenges(id),
  changes jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pricing_change_log_created ON pricing_change_log (created_at DESC);

CREATE TABLE IF NOT EXISTS platform_charges (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('provider_registration','driver_plus')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','abandoned')),
  paystack_ref text NOT NULL UNIQUE,
  paid_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_charges_user ON platform_charges (user_id, purpose);

CREATE TABLE IF NOT EXISTS driver_memberships (
  user_id bigint PRIMARY KEY REFERENCES users(id),
  plan text NOT NULL DEFAULT 'plus' CHECK (plan IN ('plus')),
  started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz,
  paid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS registration_paid_at timestamptz;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS registration_waived boolean NOT NULL DEFAULT false;
ALTER TABLE provider_profiles ADD COLUMN IF NOT EXISTS registration_charge_id bigint REFERENCES platform_charges(id);

-- Commission default moves from 12 to 15, only if nobody has changed it yet.
UPDATE app_settings SET value = '15' WHERE key = 'commission_pct' AND value = '12';