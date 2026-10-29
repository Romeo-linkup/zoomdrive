CREATE TABLE IF NOT EXISTS otp_codes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('login','signup')),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_phone_created ON otp_codes (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes (expires_at);