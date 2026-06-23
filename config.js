// Lobby kiosk configuration
// Edit counselor names and Shortcut names to match the Shortcuts you create on the iPad.

const CONFIG = {
  // Phone number shown on the "No appointment" screen (format for display)
  officePhone: '(555) 555-5555',
  // Tel link for tap-to-call (digits only)
  officePhoneTel: '5555555555',

  // Guided Access blocks opening the Shortcuts app via shortcuts:// — taps do nothing useful.
  // Set a single HTTPS URL to POST JSON to instead (stays inside Safari). Your endpoint
  // should send email / notify staff; it must allow CORS from your GitHub Pages origin.
  // Leave empty to use iOS Shortcuts only (works when Guided Access is off).
  // notifyWebhookUrl: 'https://your-worker.workers.dev/notify',

  // Counselors: button label (name) and exact Shortcut name on the iPad (used when notifyWebhookUrl is empty).
  counselors: [
    { name: 'Emily', shortcutName: 'NotifyCounselorA' },
    { name: 'Kristen', shortcutName: 'NotifyCounselorB' },
    { name: 'Lauren', shortcutName: 'NotifyCounselorC' },
    { name: 'Macie', shortcutName: 'NotifyCounselorD' }
  ],

  // Seconds before auto-return to home
  returnHomeSeconds: 5
};
