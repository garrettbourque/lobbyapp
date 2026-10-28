// Signed-in endpoints: a facility owner manages their business, clinicians and kiosks.
// Every query is scoped to the facility the signed-in user owns.

import { json, fail, readJson, str, isEmail, randomId, TIMEZONES } from './util.js';
import { trySendEmail } from './email.js';

const MAX_CLINICIANS = 50;
const MAX_KIOSKS = 10;
const MAX_WELCOME = 120;

async function ownedFacility(env, user) {
  return env.DB.prepare('SELECT * FROM facilities WHERE owner_user_id = ?').bind(user.id).first();
}

function kioskLink(origin, token) {
  return origin + '/?kiosk=' + token;
}

export async function getAccount(env, user, origin) {
  const f = await ownedFacility(env, user);
  if (!f) return json({ ok: true, user: { email: user.email }, facility: null });

  const [clinicians, kiosks, checkins] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, email, sort_order FROM clinicians WHERE facility_id = ? AND active = 1 ORDER BY sort_order, name').bind(f.id),
    env.DB.prepare('SELECT token, label, welcome_message, created_at FROM kiosks WHERE facility_id = ? ORDER BY created_at').bind(f.id),
    env.DB.prepare(
      'SELECT c.name, k.status, k.created_at FROM checkins k JOIN clinicians c ON c.id = k.clinician_id ' +
      'WHERE k.facility_id = ? ORDER BY k.id DESC LIMIT 25'
    ).bind(f.id)
  ]);

  return json({
    ok: true,
    user: { email: user.email },
    facility: {
      name: f.name,
      officePhone: f.office_phone || '',
      adminEmail: f.admin_email || '',
      timezone: f.timezone
    },
    timezones: TIMEZONES,
    clinicians: clinicians.results.map(function (c) {
      return { id: c.id, name: c.name, email: c.email || '', sortOrder: c.sort_order };
    }),
    kiosks: kiosks.results.map(function (k) {
      return {
        token: k.token, label: k.label || 'Kiosk', welcomeMessage: k.welcome_message || '',
        link: kioskLink(origin, k.token), createdAt: k.created_at
      };
    }),
    checkins: checkins.results.map(function (c) {
      return { clinician: c.name, status: c.status, at: c.created_at };
    })
  });
}

export async function updateFacility(request, env, user) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  const body = await readJson(request);
  const name = str(body.name, 100);
  const officePhone = str(body.officePhone, 30);
  const adminEmail = str(body.adminEmail, 254).toLowerCase();
  const timezone = str(body.timezone, 40);

  if (!name) return fail('Enter your business name.');
  if (adminEmail && !isEmail(adminEmail)) return fail('Enter a valid alert email address.');
  if (TIMEZONES.indexOf(timezone) === -1) return fail('Choose a time zone.');

  await env.DB.prepare('UPDATE facilities SET name = ?, office_phone = ?, admin_email = ?, timezone = ? WHERE id = ?')
    .bind(name, officePhone || null, adminEmail || null, timezone, f.id).run();
  return json({ ok: true });
}

function readClinician(body) {
  const name = str(body.name, 60);
  const email = str(body.email, 254).toLowerCase();
  if (!name) return { error: 'Enter a name.' };
  if (email && !isEmail(email)) return { error: 'Enter a valid email address, or leave it blank.' };
  return { name: name, email: email || null, sortOrder: Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : 0 };
}

export async function addClinician(request, env, user) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  const c = readClinician(await readJson(request));
  if (c.error) return fail(c.error);

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM clinicians WHERE facility_id = ? AND active = 1').bind(f.id).first();
  if (count.n >= MAX_CLINICIANS) return fail('You can list up to ' + MAX_CLINICIANS + ' people.');

  const id = randomId(6);
  await env.DB.prepare('INSERT INTO clinicians (id, facility_id, name, email, sort_order) VALUES (?, ?, ?, ?, ?)')
    .bind(id, f.id, c.name, c.email, c.sortOrder || count.n + 1).run();
  return json({ ok: true, id: id });
}

export async function updateClinician(request, env, user, id) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  const c = readClinician(await readJson(request));
  if (c.error) return fail(c.error);

  const result = await env.DB.prepare('UPDATE clinicians SET name = ?, email = ?, sort_order = ? WHERE id = ? AND facility_id = ? AND active = 1')
    .bind(c.name, c.email, c.sortOrder, id, f.id).run();
  if (!result.meta.changes) return fail('Not found.', 404);
  return json({ ok: true });
}

export async function removeClinician(env, user, id) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  // Soft delete keeps check-in history readable.
  const result = await env.DB.prepare('UPDATE clinicians SET active = 0 WHERE id = ? AND facility_id = ?').bind(id, f.id).run();
  if (!result.meta.changes) return fail('Not found.', 404);
  return json({ ok: true });
}

export async function addKiosk(request, env, user) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  const body = await readJson(request);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM kiosks WHERE facility_id = ?').bind(f.id).first();
  if (count.n >= MAX_KIOSKS) return fail('You can have up to ' + MAX_KIOSKS + ' kiosks.');

  await env.DB.prepare('INSERT INTO kiosks (token, facility_id, label) VALUES (?, ?, ?)')
    .bind(randomId(24), f.id, str(body.label, 40) || 'Lobby iPad').run();
  return json({ ok: true });
}

export async function updateKiosk(request, env, user, token) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  const body = await readJson(request);
  // Blank falls back to the default heading on the kiosk.
  const welcomeMessage = str(body.welcomeMessage, MAX_WELCOME);

  const result = await env.DB.prepare('UPDATE kiosks SET label = ?, welcome_message = ? WHERE token = ? AND facility_id = ?')
    .bind(str(body.label, 40) || 'Lobby iPad', welcomeMessage || null, token, f.id).run();
  if (!result.meta.changes) return fail('Not found.', 404);
  return json({ ok: true });
}

export async function removeKiosk(env, user, token) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  const result = await env.DB.prepare('DELETE FROM kiosks WHERE token = ? AND facility_id = ?').bind(token, f.id).run();
  if (!result.meta.changes) return fail('Not found.', 404);
  return json({ ok: true });
}

export async function contact(request, env, user) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const { success } = await env.AUTH_LIMITER.limit({ key: 'contact:' + ip });
  if (!success) return fail('Too many messages. Try again in a minute.', 429);

  const body = await readJson(request);
  // Hidden field real people never fill in.
  if (str(body.website, 200)) return json({ ok: true });

  const name = str(body.name, 100);
  const email = str(body.email, 254).toLowerCase();
  const message = str(body.message, 5000);
  if (!name) return fail('Enter your name.');
  if (!isEmail(email)) return fail('Enter a valid email address so we can reply.');
  if (message.length < 5) return fail('Enter a message.');

  await env.DB.prepare('INSERT INTO contact_messages (name, email, message, user_id) VALUES (?, ?, ?, ?)')
    .bind(name, email, message, user ? user.id : null).run();
  if (env.CONTACT_EMAIL) {
    await trySendEmail(env, env.CONTACT_EMAIL, 'LobbyApp contact: ' + name,
      'From: ' + name + ' <' + email + '>\n' +
      (user ? 'Signed in as: ' + user.email + '\n' : '') +
      '\n' + message + '\n\n(Reply to ' + email + ' directly.)');
  }
  return json({ ok: true });
}
