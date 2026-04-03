CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_encrypted TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'sub-admin', 'provider')) DEFAULT 'provider',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS relief_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('cooling_center', 'hydration', 'medical', 'shade')),
  address TEXT,
  open_hours TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('water', 'ors', 'shade')),
  description TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  provider_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);


CREATE TABLE IF NOT EXISTS location_usage_events (
  id BIGSERIAL PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('manual', 'qr')) DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relief_sites_location ON relief_sites USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_locations_location ON locations USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users (email_hash);
CREATE INDEX IF NOT EXISTS idx_location_usage_events_location_id ON location_usage_events (location_id);
CREATE INDEX IF NOT EXISTS idx_location_usage_events_created_at ON location_usage_events (created_at);
