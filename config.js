// Lobby kiosk configuration
// Edit counselor names and Shortcut names to match the Shortcuts you create on the iPad.

const CONFIG = {
  // Phone number shown on the "No appointment" screen (format for display)
  officePhone: '(555) 555-5555',
  // Tel link for tap-to-call (digits only)
  officePhoneTel: '5555555555',

  // Counselors: display name and the exact name of the iOS Shortcut to run
  counselors: [
    { name: 'Counselor A', shortcutName: 'NotifyCounselorA' },
    { name: 'Counselor B', shortcutName: 'NotifyCounselorB' },
    { name: 'Counselor C', shortcutName: 'NotifyCounselorC' }
  ],

  // Seconds before auto-return to home
  returnHomeSeconds: 5
};
