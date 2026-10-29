CREATE TABLE IF NOT EXISTS requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  driver_id bigint NOT NULL REFERENCES users (id),
  service_id bigint NOT NULL REFERENCES services (id),
  status text NOT NULL DEFAULT 'searching' CHECK (status IN ('searching','accepted','arrived','completed','cancelled','expired')),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address_text text,
  notes text,
  distance_km numeric(6,2),
  service_price_cents integer NOT NULL,
  distance_fee_cents integer NOT NULL,
  total_cents integer NOT NULL,
  commission_pct numeric(5,2) NOT NULL,
  commission_cents integer NOT NULL,
  provider_earning_cents integer NOT NULL,
  provider_id bigint REFERENCES users (id),
  assigned_by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text CHECK (cancelled_by IS NULL OR cancelled_by IN ('driver','provider','admin','system')),
  cancel_reason text
);

CREATE INDEX IF NOT EXISTS idx_requests_driver ON requests (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests (provider_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_service ON requests (service_id);
CREATE INDEX IF NOT EXISTS idx_requests_status_expiry ON requests (status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_requests_one_open_per_driver ON requests (driver_id) WHERE status IN ('searching','accepted','arrived');

CREATE TABLE IF NOT EXISTS request_offers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id bigint NOT NULL REFERENCES requests (id),
  provider_id bigint NOT NULL REFERENCES users (id),
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','declined','expired')),
  offered_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (request_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_request_offers_provider ON request_offers (provider_id, status);