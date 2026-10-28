// Lobby kiosk configuration
//
// Each iPad opens its kiosk link (lobbyapp.app/?kiosk=...), which loads that facility's
// name, phone and clinicians from the API. Owners manage those from their dashboard.

const CONFIG = {
  // The API is on the same site, so no host is needed.
  apiBaseUrl: '',
  // How often a kiosk re-fetches its clinician list.
  kioskRefreshMinutes: 5,

  // Seconds before auto-return to home
  returnHomeSeconds: 5
};
