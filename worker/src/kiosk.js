// Kiosk endpoints: an iPad identified by its secret token loads its facility's
// clinicians and checks clients in against them.

import { json, fail, readJson, str, formatTime } from './util.js';
import { sendEmail, trySendEmail } from './email.js';
import { kioskFlow } from './flow.js';

export async function findKiosk(env, token) {
  return env.DB.prepare(
    'SELECT k.token, k.label, k.welcome_message, k.flow, f.id AS facility_id, f.name, f.admin_email, f.office_phone, f.timezone ' +
    'FROM kiosks k JOIN facilities f ON f.id = k.facility_id WHERE k.token = ?'
  ).bind(token).first();
}

export async function getKiosk(env, kiosk, headers) {
  const { results } = await env.DB.prepare(
    'SELECT id, name FROM clinicians WHERE facility_id = ? AND active = 1 ORDER BY sort_order, name'
  ).bind(kiosk.facility_id).all();
  return json({
    ok: true,
    facility: { name: kiosk.name },
    flow: kioskFlow(kiosk, kiosk.office_phone),
    clinicians: results
  }, 200, headers);
}

export async function checkin(request, env, kiosk, headers) {
  const body = await readJson(request);
  const clinician = await env.DB.prepare(
    'SELECT id, name, email FROM clinicians WHERE id = ? AND facility_id = ? AND active = 1'
  ).bind(str(body.clinicianId, 32), kiosk.facility_id).first();
  if (!clinician) {
    return json({ ok: false, error: 'Unknown clinician' }, 400, headers);
  }

  const templateId = str(body.template, 32);
  const template = templateId ? await env.DB.prepare(
    'SELECT subject, body FROM email_templates WHERE id = ? AND facility_id = ?'
  ).bind(templateId, kiosk.facility_id).first() : null;

  const time = formatTime(kiosk.timezone);
  const answers = readAnswers(body.answers, kioskFlow(kiosk, kiosk.office_phone));
  const lines = answerLines(answers);
  const entered = lines ? 'They entered:\n' + lines + '\n\n' : '';
  // Without a template, the standard notice.
  const email = template ? fillTemplate(template, clinician, kiosk, time, answers) : {
    subject: 'Your client has arrived (' + time + ')',
    text: 'Hi ' + clinician.name + ',\n\n' +
      'A client checked in at the lobby kiosk at ' + time + ' and is waiting for you.\n\n' +
      entered +
      '- Lobby kiosk'
  };

  const status = await notifyClinician(env, {
    limitKey: kiosk.facility_id + ':' + clinician.id,
    alertKey: kiosk.facility_id,
    name: clinician.name,
    email: clinician.email,
    adminEmail: kiosk.admin_email,
    time: time,
    subject: email.subject,
    text: email.text,
    answers: entered
  });

  await env.DB.prepare('INSERT INTO checkins (facility_id, clinician_id, status) VALUES (?, ?, ?)')
    .bind(kiosk.facility_id, clinician.id, status).run();

  return json({ ok: status === 'sent', status: status }, status === 'sent' ? 200 : 202, headers);
}

// What the visitor typed on information screens, as [{ name, value }] in screen order.
// Only this kiosk's field names are accepted, and only fields the visitor was shown
// (a blank optional field comes through as ''). Nothing here is stored.
function readAnswers(answers, flow) {
  const given = answers && typeof answers === 'object' ? answers : {};
  const list = [];
  flow.screens.forEach(function (s) {
    (s.fields || []).forEach(function (f) {
      if (!Object.prototype.hasOwnProperty.call(given, f.name)) return;
      list.push({ name: f.name, value: str(given[f.name], 200).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() });
    });
  });
  return list;
}

// "Name: value" lines for the answers that aren't blank.
function answerLines(answers) {
  return answers.filter(function (a) { return a.value; })
    .map(function (a) { return a.name + ': ' + a.value; }).join('\n');
}

// Fills {Person}, {Time}, {Kiosk}, {All answers} and {Field name} in an owner's template.
// A tag the visitor never reached stays as typed, so the owner can see what was missing.
function fillTemplate(template, clinician, kiosk, time, answers) {
  const tags = new Map([
    ['person', clinician.name],
    ['time', time],
    ['kiosk', kiosk.label || 'Kiosk'],
    ['all answers', answerLines(answers)]
  ]);
  answers.forEach(function (a) { tags.set(a.name.toLowerCase(), a.value); });
  const fill = function (text) {
    return text.replace(/\{([^{}]+)\}/g, function (match, name) {
      const key = name.trim().toLowerCase();
      return tags.has(key) ? tags.get(key) : match;
    });
  };
  return {
    subject: fill(template.subject).replace(/\s+/g, ' ').trim().slice(0, 200) || 'Check-in at ' + time,
    text: fill(template.body)
  };
}

// Emails one clinician, or tells the facility admin why that couldn't happen.
// Returns sent | no_email | failed | rate_limited.
async function notifyClinician(env, n) {
  if (!n.email) {
    await alertAdmin(env, n, 'No email address is set up for this clinician.');
    return 'no_email';
  }

  // Stops repeated taps (or anyone abusing a kiosk link) from flooding inboxes.
  const { success } = await env.NOTIFY_LIMITER.limit({ key: n.limitKey });
  if (!success) return 'rate_limited';

  try {
    await sendEmail(env, n.email, n.subject, n.text, 'Lobby Kiosk');
    return 'sent';
  } catch (e) {
    console.error('Email send failed:', e && e.message);
    await alertAdmin(env, n, 'Sending to ' + n.email + ' failed: ' + (e && e.message));
    return 'failed';
  }
}

// There is no front desk, so tell the facility admin when a client checked in
// but their clinician could not be emailed.
async function alertAdmin(env, n, reason) {
  if (!n.adminEmail) return;
  const { success } = await env.NOTIFY_LIMITER.limit({ key: 'admin-alert:' + n.alertKey });
  if (!success) return;
  await trySendEmail(env, n.adminEmail, 'Kiosk could not notify ' + n.name + ' (' + n.time + ')',
    'A client checked in at the lobby kiosk at ' + n.time + ' for ' + n.name +
    ', but their clinician was not emailed.\n\n' +
    'Reason: ' + reason + '\n\n' +
    n.answers +
    'The client was told their clinician was notified, so they may be waiting.', 'Lobby Kiosk');
}
