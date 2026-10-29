// A kiosk's flow: the screens a visitor steps through. Stored as JSON in kiosks.flow;
// NULL means the default flow below.
//
// { screens: [ {
//     id, name,              id is referenced by buttons; name is only shown in the editor
//     message,               heading at the top
//     showPhone,             show the business phone number under the message
//     returnAfter,           seconds before going back to the first screen (0 = only after a minute idle)
//     buttons: [ { label, action, target, person } ]
//       action 'screen' -> go to target
//       action 'notify' -> email person (a clinician id), then go to target
//       action 'people' -> one button per person on the People list (no label); tapping
//                          emails that person, then goes to target
//       action 'home'   -> back to the first screen
// } ] }
// The first screen is where the kiosk starts.

import { str } from './util.js';

export const DEFAULT_WELCOME = 'Do you have an appointment?';

const MAX_SCREENS = 30;
const MAX_BUTTONS = 10;
const MAX_RETURN_AFTER = 120;
const ID = /^[A-Za-z0-9]{1,12}$/;

export function defaultFlow(welcomeMessage) {
  return {
    screens: [
      {
        id: 'home', name: 'Welcome', message: welcomeMessage || DEFAULT_WELCOME,
        showPhone: false, returnAfter: 0,
        buttons: [
          { label: 'Yes, I have an appointment.', action: 'screen', target: 'people' },
          { label: 'No, I do not have an appointment.', action: 'screen', target: 'noappt' }
        ]
      },
      {
        id: 'people', name: 'Pick a person', message: "Please select who you're here to see.",
        showPhone: false, returnAfter: 0,
        buttons: [{ action: 'people', target: 'arrived' }]
      },
      {
        id: 'arrived', name: 'Checked in',
        message: 'They have been notified you have arrived. Please have a seat and they will be with you shortly.',
        showPhone: false, returnAfter: 5, buttons: []
      },
      {
        id: 'noappt', name: 'No appointment', message: 'Please call the office to schedule an appointment.',
        showPhone: true, returnAfter: 5,
        buttons: [{ label: 'Back', action: 'home' }]
      }
    ]
  };
}

// Flows saved before 2026-10-29 marked whole screens as kind 'people' (with the next
// screen in then); that is now a single 'people' button.
function upgrade(flow) {
  (flow.screens || []).forEach(function (s) {
    if (s && s.kind === 'people') s.buttons = [{ action: 'people', target: s.then }];
    if (s) {
      delete s.kind;
      delete s.then;
    }
  });
  return flow;
}

// The flow a kiosk row runs: its saved flow, or the default built from its welcome message.
export function kioskFlow(row) {
  if (row.flow) {
    try { return upgrade(JSON.parse(row.flow)); } catch (e) {}
  }
  return defaultFlow(row.welcome_message);
}

// Checks a flow sent from the editor. personIds are the business's active clinicians.
// Returns { flow } with only known fields kept, or { error } to show the owner.
export function validateFlow(input, personIds) {
  const screens = input && Array.isArray(input.screens) ? upgrade(input).screens : null;
  if (!screens || !screens.length) return { error: 'Add at least one screen.' };
  if (screens.length > MAX_SCREENS) return { error: 'A kiosk can have up to ' + MAX_SCREENS + ' screens.' };

  const ids = new Set();
  for (const s of screens) {
    const id = s && typeof s.id === 'string' ? s.id : '';
    if (!ID.test(id) || ids.has(id)) return { error: 'Screens are mixed up. Reload the page and try again.' };
    ids.add(id);
  }

  const out = [];
  for (let i = 0; i < screens.length; i++) {
    const s = screens[i];
    const name = str(s.name, 40) || 'Screen ' + (i + 1);
    const where = ' on "' + name + '".';
    const returnAfter = Math.trunc(Number(s.returnAfter)) || 0;
    if (returnAfter < 0 || returnAfter > MAX_RETURN_AFTER) {
      return { error: 'The countdown must be 0 to ' + MAX_RETURN_AFTER + ' seconds' + where };
    }
    const screen = {
      id: s.id, name: name, message: str(s.message, 200),
      showPhone: !!s.showPhone, returnAfter: returnAfter, buttons: []
    };

    const buttons = Array.isArray(s.buttons) ? s.buttons : [];
    if (buttons.length > MAX_BUTTONS) return { error: 'A screen can have up to ' + MAX_BUTTONS + ' buttons' + where };
    for (const b of buttons) {
      const action = b && b.action;
      if (action === 'people') {
        if (screen.buttons.some(function (x) { return x.action === 'people'; })) {
          return { error: 'List everyone on your People list only once' + where };
        }
        if (!ids.has(b.target)) return { error: 'Choose the screen to show after someone on your People list is tapped' + where };
        screen.buttons.push({ action: action, target: b.target });
        continue;
      }

      const label = str(b && b.label, 60);
      if (!label) return { error: 'Every button needs text' + where };
      const button = { label: label, action: action };
      if (action === 'screen' || action === 'notify') {
        if (!ids.has(b.target)) return { error: 'Choose where the "' + label + '" button goes' + where };
        button.target = b.target;
      } else if (action !== 'home') {
        return { error: 'Choose what the "' + label + '" button does' + where };
      }
      if (action === 'notify') {
        if (!personIds.has(b.person)) return { error: 'Choose who the "' + label + '" button notifies' + where };
        button.person = b.person;
      }
      screen.buttons.push(button);
    }
    out.push(screen);
  }
  return { flow: { screens: out } };
}
