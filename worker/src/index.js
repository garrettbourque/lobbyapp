// Lobby kiosk Worker.
//
// GET  /api/kiosk/:token          -> the facility's name, phone and clinician list (no emails)
// POST /api/kiosk/:token/checkin  -> { clinicianId }: emails that clinician, alerts the
//                                    facility admin if that isn't possible
//
// Facilities, kiosks and clinicians live in D1 (see schema.sql, scripts/admin.mjs).

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(function (o) { return o.trim(); });
    const originAllowed = allowedOrigins.indexOf(origin) !== -1;
    const cors = {
      'Access-Control-Allow-Origin': originAllowed ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (!originAllowed) {
      return json({ ok: false, error: 'Forbidden' }, 403, cors);
    }

    const kioskMatch = url.pathname.match(/^\/api\/kiosk\/([A-Za-z0-9_-]{16,64})(\/checkin)?$/);
    if (kioskMatch) {
      const kiosk = await findKiosk(env, kioskMatch[1]);
      if (!kiosk) {
        return json({ ok: false, error: 'Unknown kiosk' }, 404, cors);
      }
      if (!kioskMatch[2] && request.method === 'GET') {
        return getKiosk(env, kiosk, cors);
      }
      if (kioskMatch[2] && request.method === 'POST') {
        return checkin(request, env, kiosk, cors);
      }
      return json({ ok: false, error: 'Method not allowed' }, 405, cors);
    }

    return json({ ok: false, error: 'Not found' }, 404, cors);
  }
};

async function findKiosk(env, token) {
  return env.DB.prepare(
    'SELECT k.token, f.id AS facility_id, f.name, f.admin_email, f.office_phone, f.timezone ' +
    'FROM kiosks k JOIN facilities f ON f.id = k.facility_id WHERE k.token = ?'
  ).bind(token).first();
}

async function getKiosk(env, kiosk, cors) {
  const { results } = await env.DB.prepare(
    'SELECT id, name FROM clinicians WHERE facility_id = ? AND active = 1 ORDER BY sort_order, name'
  ).bind(kiosk.facility_id).all();
  return json({
    ok: true,
    facility: { name: kiosk.name, officePhone: kiosk.office_phone || '' },
    clinicians: results
  }, 200, cors);
}

async function checkin(request, env, kiosk, cors) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: 'Invalid JSON' }, 400, cors);
  }

  const clinician = await env.DB.prepare(
    'SELECT id, name, email FROM clinicians WHERE id = ? AND facility_id = ? AND active = 1'
  ).bind(String(body.clinicianId || ''), kiosk.facility_id).first();
  if (!clinician) {
    return json({ ok: false, error: 'Unknown clinician' }, 400, cors);
  }

  const time = formatTime(kiosk.timezone);
  const status = await notifyClinician(env, {
    limitKey: kiosk.facility_id + ':' + clinician.id,
    alertKey: kiosk.facility_id,
    name: clinician.name,
    email: clinician.email,
    adminEmail: kiosk.admin_email,
    time: time
  });

  await env.DB.prepare('INSERT INTO checkins (facility_id, clinician_id, status) VALUES (?, ?, ?)')
    .bind(kiosk.facility_id, clinician.id, status).run();

  return json({ ok: status === 'sent', status: status }, status === 'sent' ? 200 : 202, cors);
}

// Emails one clinician, or tells the admin why that couldn't happen.
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
    await env.EMAIL.send({
      to: n.email,
      from: { email: env.FROM_ADDRESS, name: env.FROM_NAME || 'Lobby Kiosk' },
      subject: 'Your client has arrived (' + n.time + ')',
      text:
        'Hi ' + n.name + ',\n\n' +
        'A client checked in at the lobby kiosk at ' + n.time + ' and is waiting for you.\n\n' +
        '- Lobby kiosk'
    });
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
  try {
    await env.EMAIL.send({
      to: n.adminEmail,
      from: { email: env.FROM_ADDRESS, name: env.FROM_NAME || 'Lobby Kiosk' },
      subject: 'Kiosk could not notify ' + n.name + ' (' + n.time + ')',
      text:
        'A client checked in at the lobby kiosk at ' + n.time + ' for ' + n.name +
        ', but their clinician was not emailed.\n\n' +
        'Reason: ' + reason + '\n\n' +
        'The client was told their clinician was notified, so they may be waiting.'
    });
  } catch (e) {
    console.error('Admin alert failed:', e && e.message);
  }
}

function formatTime(timeZone) {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: timeZone || 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
  });
}
