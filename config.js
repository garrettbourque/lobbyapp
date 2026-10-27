// Lobby kiosk configuration
//
// Kiosk links (lobbyapp.app/?kiosk=...) load their facility, phone and clinicians from
// the Worker at apiBaseUrl; manage those with worker/scripts/admin.mjs.
// Everything below apiBaseUrl/kioskRefreshMinutes is the legacy setup, used only when
// the page is opened without a kiosk link.

const CONFIG = {
  apiBaseUrl: 'https://lobbyapp.bourque-garrett.workers.dev',
  // How often a kiosk re-fetches its clinician list.
  kioskRefreshMinutes: 5,

  // Phone number shown on the "No appointment" screen (format for display)
  officePhone: '(555) 555-5555',
  // Tel link for tap-to-call (digits only)
  officePhoneTel: '5555555555',

  // Guided Access blocks opening the Shortcuts app via shortcuts:// — taps do nothing useful.
  // Set a single HTTPS URL to POST JSON to instead (stays inside Safari). Your endpoint
  // should send email / notify staff; it must allow CORS from your GitHub Pages origin.
  // Leave empty to use iOS Shortcuts only (works when Guided Access is off).
  // Cloudflare Worker in worker/ that emails the selected counselor.
  notifyWebhookUrl: 'https://lobbyapp.bourque-garrett.workers.dev/notify',

  // Counselors: button label (name), id (key in the Worker's COUNSELORS secret, which holds
  // the email address), and exact Shortcut name on the iPad (used when notifyWebhookUrl is empty).
  counselors: [
    { id: 'emily', name: 'Emily', shortcutName: 'NotifyCounselorA' },
    { id: 'kristen', name: 'Kristen', shortcutName: 'NotifyCounselorB' },
    { id: 'lauren', name: 'Lauren', shortcutName: 'NotifyCounselorC' },
    { id: 'macie', name: 'Macie', shortcutName: 'NotifyCounselorD' }
  ],

  // Seconds before auto-return to home
  returnHomeSeconds: 5
};
