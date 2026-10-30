-- When each person's verification email was last sent from the dashboard, and how many
-- were sent on verify_day (UTC date), for the resend wait and daily cap in src/verify.js.
ALTER TABLE clinicians ADD COLUMN verify_sent_at TEXT;
ALTER TABLE clinicians ADD COLUMN verify_day TEXT;
ALTER TABLE clinicians ADD COLUMN verify_count INTEGER NOT NULL DEFAULT 0;
