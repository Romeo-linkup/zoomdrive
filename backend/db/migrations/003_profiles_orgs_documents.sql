CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id bigint PRIMARY KEY REFERENCES users (id),
  vehicle_make text,
  vehicle_model text,
  vehicle_colour text,
  plate text,
  hail_platform text CHECK (hail_platform IS NULL OR hail_platform IN ('uber','bolt','indrive','other')),
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organisations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  reg_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  owner_user_id bigint NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organisations_owner ON organisations (owner_user_id);

CREATE TABLE IF NOT EXISTS provider_profiles (
  user_id bigint PRIMARY KEY REFERENCES users (id),
  provider_type text NOT NULL CHECK (provider_type IN ('individual','company')),
  organisation_id bigint REFERENCES organisations (id),
  vehicle_description text,
  plate text,
  base_lat double precision,
  base_lng double precision,
  service_radius_km integer NOT NULL DEFAULT 25,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')),
  rejection_reason text,
  is_online boolean NOT NULL DEFAULT false,
  last_lat double precision,
  last_lng double precision,
  last_seen_at timestamptz,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  jobs_completed integer NOT NULL DEFAULT 0,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by bigint,
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_org ON provider_profiles (organisation_id);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_dispatch ON provider_profiles (verification_status, is_online, last_seen_at);

CREATE TABLE IF NOT EXISTS provider_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_user_id bigint NOT NULL REFERENCES users (id),
  doc_type text NOT NULL CHECK (doc_type IN ('id_document','drivers_licence','vehicle_insurance','company_registration')),
  file_url text NOT NULL,
  cloudinary_public_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by bigint
);

CREATE INDEX IF NOT EXISTS idx_provider_documents_provider ON provider_documents (provider_user_id);
CREATE INDEX IF NOT EXISTS idx_provider_documents_status ON provider_documents (status);

CREATE TABLE IF NOT EXISTS saved_places (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id),
  label text NOT NULL,
  address text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places (user_id);