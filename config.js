// Lobby kiosk configuration
// Edit counselor names and Shortcut names to match the Shortcuts you create on the iPad.

const CONFIG = {
  // Phone number shown on the "No appointment" screen (format for display)
  officePhone: '(555) 555-5555',
  // Tel link for tap-to-call (digits only)
  officePhoneTel: '5555555555',

  // Counselors — iOS Shortcuts path (this setup):
  // - name: label on the button.
  // - shortcutName: exact name of the Shortcut on the iPad (shortcuts://run-shortcut?name=...).
  //
  // Optional (see README): mailto, notifyUrl, androidUrl — only if you add them later.
  counselors: [
    { name: 'Emily', shortcutName: 'NotifyCounselorA' },
    { name: 'Kristen', shortcutName: 'NotifyCounselorB' },
    { name: 'Lauren', shortcutName: 'NotifyCounselorC' },
    { name: 'Macie', shortcutName: 'NotifyCounselorD' }
  ],

  // Seconds before auto-return to home
  returnHomeSeconds: 5
};
