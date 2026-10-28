-- A kiosk's screens and buttons as JSON (see src/flow.js). NULL runs the default flow,
-- which uses welcome_message as its first screen's heading.
ALTER TABLE kiosks ADD COLUMN flow TEXT;
