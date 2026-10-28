// Lobby kiosk configuration
//
// Each iPad opens its kiosk link (lobbyapp.app/?kiosk=...), which loads that facility's
// name, phone and clinicians from the Worker at apiBaseUrl. Manage facilities, clinicians
// and kiosks with worker/scripts/admin.mjs.

const CONFIG = {
  apiBaseUrl: 'https://lobbyapp.bourque-garrett.workers.dev',
  // How often a kiosk re-fetches its clinician list.
  kioskRefreshMinutes: 5,

  // Seconds before auto-return to home
  returnHomeSeconds: 5
};
