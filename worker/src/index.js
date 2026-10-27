// Lobby kiosk notify Worker.
// The kiosk POSTs { counselorId } here; the Worker looks up that counselor's
// email address (kept in the COUNSELORS secret, never in the public site)
// and sends an arrival email through Cloudflare Email Service.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN;
    const cors = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };

    if (url.pathname !== '/notify') {
      return json({ ok: false, error: 'Not found' }, 404, cors);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, cors);
    }
    if (origin !== allowedOrigin) {
      return json({ ok: false, error: 'Forbidden' }, 403, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'Invalid JSON' }, 400, cors);
    }

    const counselorId = String(body.counselorId || '').trim().toLowerCase();
    let counselors;
    try {
      counselors = JSON.parse(env.COUNSELORS || '{}');
    } catch (e) {
      console.error('COUNSELORS secret is not valid JSON');
      return json({ ok: false, error: 'Server misconfigured' }, 500, cors);
    }
    const time = new Date().toLocaleTimeString('en-US', {
      timeZone: env.TIMEZONE || 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit'
    });
    const label = String(body.counselorName || counselorId || 'unknown').slice(0, 50);

    const counselor = counselors[counselorId];
    if (!counselor || !counselor.email) {
      await alertAdmin(env, label, time, 'No email address is set up for this counselor.');
      return json({ ok: false, error: 'Unknown counselor' }, 400, cors);
    }

    // Stops repeated taps (or anyone abusing the public URL) from flooding inboxes.
    const { success } = await env.NOTIFY_LIMITER.limit({ key: counselorId });
    if (!success) {
      return json({ ok: false, error: 'Too many requests' }, 429, cors);
    }
    const text =
      'Hi ' + counselor.name + ',\n\n' +
      'A client checked in at the lobby kiosk at ' + time + ' and is waiting for you.\n\n' +
      '- Lobby kiosk';

    try {
      const result = await env.EMAIL.send({
        to: counselor.email,
        from: { email: env.FROM_ADDRESS, name: env.FROM_NAME || 'Lobby Kiosk' },
        subject: 'Your client has arrived (' + time + ')',
        text: text
      });
      return json({ ok: true, id: result.messageId }, 200, cors);
    } catch (e) {
      console.error('Email send failed:', e && e.message);
      await alertAdmin(env, counselor.name, time, 'Sending to ' + counselor.email + ' failed: ' + (e && e.message));
      return json({ ok: false, error: 'Email failed' }, 502, cors);
    }
  }
};

// There is no front desk, so tell the admin (ADMIN_EMAIL secret) when a
// client checked in but their counselor could not be emailed.
async function alertAdmin(env, counselorName, time, reason) {
  if (!env.ADMIN_EMAIL) return;
  const { success } = await env.NOTIFY_LIMITER.limit({ key: 'admin-alert' });
  if (!success) return;
  try {
    await env.EMAIL.send({
      to: env.ADMIN_EMAIL,
      from: { email: env.FROM_ADDRESS, name: env.FROM_NAME || 'Lobby Kiosk' },
      subject: 'Kiosk could not notify ' + counselorName + ' (' + time + ')',
      text:
        'A client checked in at the lobby kiosk at ' + time + ' for ' + counselorName +
        ', but their counselor was not emailed.\n\n' +
        'Reason: ' + reason + '\n\n' +
        'The client was told their counselor was notified, so they may be waiting.'
    });
  } catch (e) {
    console.error('Admin alert failed:', e && e.message);
  }
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
  });
}
