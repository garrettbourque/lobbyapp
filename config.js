// Lobby kiosk configuration
// Edit counselor names and Shortcut names to match the Shortcuts you create on the iPad.

const CONFIG = {
  // Phone number shown on the "No appointment" screen (format for display)
  officePhone: '(555) 555-5555',
  // Tel link for tap-to-call (digits only)
  officePhoneTel: '5555555555',

  // Optional default for counselor notifyDelivery ('json-post' | 'iframe'). Per-counselor
  // notifyDelivery overrides this. See README "Outlook email" for Power Automate setup.
  // notifyDelivery: 'json-post',

  // Counselors:
  // - notifyUrl: optional Microsoft Power Automate (or other) HTTPS webhook that sends
  //   Outlook email. When set, used on iPad, Android, and desktop instead of Shortcuts
  //   / androidUrl. Body is JSON: { counselorName, shortcutName }.
  // - notifyDelivery: 'iframe' only if your service expects a GET in a hidden iframe
  //   (e.g. some Zapier hooks). Default is json-post for Power Automate POST triggers.
  // - shortcutName: used when notifyUrl is omitted (iOS Shortcuts).
  // - androidUrl: optional when notifyUrl is omitted on Android only.
  //
  // Example with Outlook via Power Automate (duplicate per counselor or use one URL + branch in the flow):
  // { name: 'Counselor A', shortcutName: 'NotifyCounselorA', notifyUrl: 'https://prod-00.westus.logic.azure.com/workflows/YOUR_WORKFLOW_ID/triggers/manual/paths/invoke?...' },
  counselors: [
    { name: 'Emily', shortcutName: 'NotifyCounselorA' },
    { name: 'Kristen', shortcutName: 'NotifyCounselorB' },
    { name: 'Lauren', shortcutName: 'NotifyCounselorC' },
    { name: 'Macie', shortcutName: 'NotifyCounselorD' }
  ],

  // Seconds before auto-return to home
  returnHomeSeconds: 5
};
