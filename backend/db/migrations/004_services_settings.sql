CREATE TABLE IF NOT EXISTS services (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code IN ('flat_tyre','jump_start','fuel','essentials','towing')),
  name text NOT NULL,
  icon text,
  base_price_cents integer NOT NULL CHECK (base_price_cents >= 0),
  per_km_cents integer NOT NULL DEFAULT 700 CHECK (per_km_cents >= 0),
  min_distance_fee_cents integer NOT NULL DEFAULT 2000 CHECK (min_distance_fee_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS provider_services (
  provider_user_id bigint NOT NULL REFERENCES users (id),
  service_id bigint NOT NULL REFERENCES services (id),
  PRIMARY KEY (provider_user_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_services_service ON provider_services (service_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by bigint
);