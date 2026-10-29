-- Emails a kiosk button can send instead of the standard check-in notice. subject and
-- body may use tags such as {Person} or {First name}; see worker/src/kiosk.js.
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS email_templates_facility ON email_templates(facility_id);
