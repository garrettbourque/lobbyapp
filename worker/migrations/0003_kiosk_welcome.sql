-- Per-kiosk heading on the home screen. NULL shows the default "Do you have an appointment?".
ALTER TABLE kiosks ADD COLUMN welcome_message TEXT;
