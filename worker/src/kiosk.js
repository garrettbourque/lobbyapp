// Kiosk endpoints: an iPad identified by its secret token loads its facility's
// clinicians and checks clients in against them.

import { json, fail, readJson, str, formatTime } from './util.js';
import { sendEmail, trySendEmail } from './email.js';
import { kioskFlow } from './flow.js';

export async function findKiosk(env, token) {
  return env.DB.prepare(
    'SELECT k.token, k.welcome_message, k.flow, f.id AS facility_id, f.name, f.admin_email, f.office_phone, f.timezone ' +
    'FROM kiosks k JOIN facilities f ON f.id = k.facility_id WHERE k.token = ?'
  ).bind(token).first();
}

export async function getKiosk(env, kiosk, headers) {
  const { results } = await env.DB.prepare(
    'SELECT id, name FROM clinicians WHERE facility_id = ? AND active = 1 ORDER BY sort_order, name'
  ).bind(kiosk.facility_id).all();
  return json({
    ok: true,
    facility: { name: kiosk.name, officePhone: kiosk.office_phone || '' },
    flow: kioskFlow(kiosk),
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

  const status = await notifyClinician(env, {
    limitKey: kiosk.facility_id + ':' + clinician.id,
    alertKey: kiosk.facility_id,
    name: clinician.name,
    email: clinician.email,
    adminEmail: kiosk.admin_email,
    time: formatTime(kiosk.timezone)
  });

  await env.DB.prepare('INSERT INTO checkins (facility_id, clinician_id, status) VALUES (?, ?, ?)')
    .bind(kiosk.facility_id, clinician.id, status).run();

  return json({ ok: status === 'sent', status: status }, status === 'sent' ? 200 : 202, headers);
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
    await sendEmail(env, n.email, 'Your client has arrived (' + n.time + ')',
      'Hi ' + n.name + ',\n\n' +
      'A client checked in at the lobby kiosk at ' + n.time + ' and is waiting for you.\n\n' +
      '- Lobby kiosk', 'Lobby Kiosk');
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
    'The client was told their clinician was notified, so they may be waiting.', 'Lobby Kiosk');
}
