// Lobby kiosk configuration
//
// Each iPad opens its kiosk link (lobbyapp.app/?kiosk=...), which loads that kiosk's
// screens, the business phone and its people from the API. Owners manage those from their dashboard.

const CONFIG = {
  // The API is on the same site, so no host is needed.
  apiBaseUrl: '',
  // How often a kiosk re-fetches its screens and people.
  kioskRefreshMinutes: 5,

  // Seconds without a tap before a screen goes back to the start (screens without their own countdown)
  idleReturnSeconds: 60
};
