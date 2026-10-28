-- Customer accounts: a user signs in with email + password and owns a facility.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL, -- pbkdf2$<iterations>$<salt>$<hash>
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- token_hash is SHA-256 of the cookie value, so a database leak can't be replayed.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE facilities ADD COLUMN owner_user_id TEXT REFERENCES users(id);
CREATE INDEX facilities_owner ON facilities(owner_user_id);
