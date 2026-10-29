// A kiosk's flow: the screens a visitor steps through. Stored as JSON in kiosks.flow;
// NULL means the default flow below.
//
// { screens: [ {
//     id, name,              id is referenced by buttons; name is only shown in the editor
//     type,                  'buttons' | 'form' (information entry)
//     message,               heading at the top
//     returnAfter,           seconds before going back to the first screen (0 = only after a minute idle)
//
//     'buttons' screens:
//     buttons: [ { label, action, target, person, template } ]
//       action 'screen' -> go to target
//       action 'notify' -> email person (a clinician id), then go to target
//       action 'people' -> one button per person on the People list (no label); tapping
//                          emails that person, then goes to target
//       template        -> on 'notify' and 'people': the email_templates id to send;
//                          absent means the standard notice
//       action 'home'   -> back to the first screen
//
//     'form' screens:
//     fields: [ { label, name, required } ]   label is the prompt the visitor sees; name is
//                                             how messages refer to the answer: {First name}
//                                             (no field may use a name from TAGS below)
//     submit: { label, target }               enabled once every required field is filled in
// } ] }
// The first screen is where the kiosk starts. The kiosk adds a Back button to the others.
// Answers go in the notice email when someone is notified, and are never stored.

import { str } from './util.js';

export const DEFAULT_WELCOME = 'Do you have an appointment?';

const MAX_SCREENS = 30;
const MAX_BUTTONS = 10;
const MAX_FIELDS = 10;
const MAX_RETURN_AFTER = 120;
const ID = /^[A-Za-z0-9]{1,12}$/;
// Field names appear inside {braces} in messages, so keep them to plain words.
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9 ]{0,29}$/;
// Tags that are always filled in. {Person} (who was notified) also works on kiosk
// screens; the others only in email templates.
export const TAGS = ['Person', 'Time', 'Kiosk', 'All answers'];

export function defaultFlow(welcomeMessage, officePhone) {
  return {
    screens: [
      {
        id: 'home', name: 'Welcome', type: 'buttons', message: welcomeMessage || DEFAULT_WELCOME, returnAfter: 0,
        buttons: [
          { label: 'Yes, I have an appointment.', action: 'screen', target: 'people' },
          { label: 'No, I do not have an appointment.', action: 'screen', target: 'noappt' }
        ]
      },
      {
        id: 'people', name: 'Pick a person', type: 'buttons', message: "Please select who you're here to see.", returnAfter: 0,
        buttons: [{ action: 'people', target: 'arrived' }]
      },
      {
        id: 'arrived', name: 'Checked in', type: 'buttons',
        message: 'They have been notified you have arrived. Please have a seat and they will be with you shortly.',
        returnAfter: 5, buttons: []
      },
      {
        id: 'noappt', name: 'No appointment', type: 'buttons',
        message: 'Please call the office' + (officePhone ? ' at ' + officePhone : '') + ' to schedule an appointment.',
        returnAfter: 5, buttons: []
      }
    ]
  };
}

// Flows saved on 2026-10-28 used fields since dropped: screens of kind 'people' (with the
// next screen in then) are now a single 'people' button, and showPhone is now the phone
// number written into the message. Screens saved before 2026-10-29 have no type and are
// all button screens. Runs on every read until a flow is saved again.
function upgrade(flow, officePhone) {
  (flow.screens || []).forEach(function (s) {
    if (!s) return;
    if (s.kind === 'people') s.buttons = [{ action: 'people', target: s.then }];
    if (s.showPhone && officePhone) s.message = ((s.message || '') + ' Phone: ' + officePhone).trim();
    // The old default "No appointment" screen had its own Back button; the kiosk now adds one.
    if (s.showPhone && Array.isArray(s.buttons)) {
      s.buttons = s.buttons.filter(function (b) { return !(b && b.action === 'home' && b.label === 'Back'); });
    }
    if (s.type !== 'form') s.type = 'buttons';
    delete s.kind;
    delete s.then;
    delete s.showPhone;
  });
  return flow;
}

// The flow a kiosk row runs: its saved flow, or the default built from its welcome message.
export function kioskFlow(row, officePhone) {
  if (row.flow) {
    try { return upgrade(JSON.parse(row.flow), officePhone); } catch (e) {}
  }
  return defaultFlow(row.welcome_message, officePhone);
}

// Checks a flow sent from the editor. personIds are the business's active clinicians;
// templateIds are its email templates.
// Returns { flow } with only known fields kept, or { error } to show the owner.
export function validateFlow(input, personIds, templateIds) {
  const screens = input && Array.isArray(input.screens) ? upgrade(input).screens : null;
  if (!screens || !screens.length) return { error: 'Add at least one screen.' };
  if (screens.length > MAX_SCREENS) return { error: 'A kiosk can have up to ' + MAX_SCREENS + ' screens.' };

  const ids = new Set();
  for (const s of screens) {
    const id = s && typeof s.id === 'string' ? s.id : '';
    if (!ID.test(id) || ids.has(id)) return { error: 'Screens are mixed up. Reload the page and try again.' };
    ids.add(id);
  }

  const fieldNames = new Set();
  const out = [];
  for (let i = 0; i < screens.length; i++) {
    const s = screens[i];
    const name = str(s.name, 40) || 'Screen ' + (i + 1);
    const where = ' on "' + name + '".';
    const returnAfter = Math.trunc(Number(s.returnAfter)) || 0;
    if (returnAfter < 0 || returnAfter > MAX_RETURN_AFTER) {
      return { error: 'Auto return must be 0 to ' + MAX_RETURN_AFTER + ' seconds' + where };
    }
    const screen = { id: s.id, name: name, type: s.type, message: str(s.message, 200), returnAfter: returnAfter };
    const problem = s.type === 'form'
      ? checkForm(s, screen, ids, fieldNames, where)
      : checkButtons(s, screen, ids, personIds, templateIds, where);
    if (problem) return { error: problem };
    out.push(screen);
  }
  return { flow: { screens: out } };
}

function checkButtons(s, screen, ids, personIds, templateIds, where) {
  const buttons = Array.isArray(s.buttons) ? s.buttons : [];
  if (buttons.length > MAX_BUTTONS) return 'A screen can have up to ' + MAX_BUTTONS + ' buttons' + where;
  screen.buttons = [];
  for (const b of buttons) {
    const action = b && b.action;
    if (action === 'people') {
      if (screen.buttons.some(function (x) { return x.action === 'people'; })) {
        return 'List everyone on your People list only once' + where;
      }
      if (!ids.has(b.target)) return 'Choose the screen to show after someone on your People list is tapped' + where;
      const people = { action: action, target: b.target };
      if (!readTemplate(b, people, templateIds)) return 'Choose the email for your People list' + where;
      screen.buttons.push(people);
      continue;
    }

    const label = str(b && b.label, 60);
    if (!label) return 'Every button needs text' + where;
    const button = { label: label, action: action };
    if (action === 'screen' || action === 'notify') {
      if (!ids.has(b.target)) return 'Choose where the "' + label + '" button goes' + where;
      button.target = b.target;
    } else if (action !== 'home') {
      return 'Choose what the "' + label + '" button does' + where;
    }
    if (action === 'notify') {
      if (!personIds.has(b.person)) return 'Choose who the "' + label + '" button notifies' + where;
      button.person = b.person;
      if (!readTemplate(b, button, templateIds)) return 'Choose the email the "' + label + '" button sends' + where;
    }
    screen.buttons.push(button);
  }
  return null;
}

// Copies a button's email template onto button. False if it names one that no longer exists.
function readTemplate(b, button, templateIds) {
  const template = str(b.template, 32);
  if (!template) return true;
  if (!templateIds.has(template)) return false;
  button.template = template;
  return true;
}

function checkForm(s, screen, ids, fieldNames, where) {
  const fields = Array.isArray(s.fields) ? s.fields : [];
  if (!fields.length) return 'Add at least one entry field' + where;
  if (fields.length > MAX_FIELDS) return 'A screen can have up to ' + MAX_FIELDS + ' entry fields' + where;
  screen.fields = [];
  for (const f of fields) {
    const label = str(f && f.label, 120);
    const fieldName = str(f && f.name, 30).replace(/\s+/g, ' ');
    if (!label) return 'Every entry field needs a prompt for the visitor' + where;
    if (!FIELD_NAME.test(fieldName)) {
      return 'Give the "' + label + '" field a tag of letters, numbers and spaces, starting with a letter' + where;
    }
    const key = fieldName.toLowerCase();
    if (TAGS.some(function (t) { return t.toLowerCase() === key; })) {
      return 'Choose another tag for the "' + label + '" field. ' + TAGS.slice(0, -1).join(', ') + ' and ' + TAGS[TAGS.length - 1] + ' are already used as tags.';
    }
    if (fieldNames.has(key)) return 'Two entry fields use the tag "' + fieldName + '". Tags must be different across all screens.';
    fieldNames.add(key);
    screen.fields.push({ label: label, name: fieldName, required: !!(f && f.required) });
  }

  const submit = s.submit || {};
  if (!ids.has(submit.target)) return 'Choose where the submit button goes' + where;
  screen.submit = { label: str(submit.label, 60) || 'Continue', target: submit.target };
  return null;
}
