-- Lobby kiosk database (Cloudflare D1).
-- Apply with: npx wrangler d1 execute lobbyapp --remote --file schema.sql

-- A customer location. admin_email gets alerts when a clinician can't be emailed.
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  admin_email TEXT,
  office_phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An iPad. token is the secret in the kiosk link (lobbyapp.app/?kiosk=TOKEN).
CREATE TABLE IF NOT EXISTS kiosks (
  token TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- email may be NULL until the clinician's address is known (check-ins then alert the admin).
CREATE TABLE IF NOT EXISTS clinicians (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  name TEXT NOT NULL,
  email TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS clinicians_facility ON clinicians(facility_id);

-- One row per tap. No client information is stored.
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_id TEXT NOT NULL,
  clinician_id TEXT NOT NULL,
  status TEXT NOT NULL, -- sent | no_email | failed | rate_limited
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS checkins_facility ON checkins(facility_id, created_at);
