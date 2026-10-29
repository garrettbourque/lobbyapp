// Signed-in endpoints: a facility owner manages their business, clinicians and kiosks.
// Every query is scoped to the facility the signed-in user owns.

import { json, fail, readJson, str, isEmail, randomId, TIMEZONES } from './util.js';
import { trySendEmail } from './email.js';
import { kioskFlow, validateFlow } from './flow.js';

const MAX_CLINICIANS = 50;
const MAX_KIOSKS = 10;
const MAX_TEMPLATES = 20;

async function ownedFacility(env, user) {
  return env.DB.prepare('SELECT * FROM facilities WHERE owner_user_id = ?').bind(user.id).first();
}

function kioskLink(origin, token) {
  return origin + '/?kiosk=' + token;
}

export async function getAccount(env, user, origin) {
  const f = await ownedFacility(env, user);
  if (!f) return json({ ok: true, user: { email: user.email }, facility: null });

  const [clinicians, kiosks, templates, checkins] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, email, sort_order FROM clinicians WHERE facility_id = ? AND active = 1 ORDER BY sort_order, name').bind(f.id),
    env.DB.prepare('SELECT token, label, welcome_message, flow, created_at FROM kiosks WHERE facility_id = ? ORDER BY created_at').bind(f.id),
    env.DB.prepare('SELECT id, name, subject, body FROM email_templates WHERE facility_id = ? ORDER BY name').bind(f.id),
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
        token: k.token, label: k.label || 'Kiosk', flow: kioskFlow(k, f.office_phone), customized: !!k.flow,
        link: kioskLink(origin, k.token), createdAt: k.created_at
      };
    }),
    templates: templates.results,
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

  // flow: null goes back to the default screens.
  let flow = null;
  if (body.flow !== null) {
    const [people, templates] = await env.DB.batch([
      env.DB.prepare('SELECT id FROM clinicians WHERE facility_id = ? AND active = 1').bind(f.id),
      env.DB.prepare('SELECT id FROM email_templates WHERE facility_id = ?').bind(f.id)
    ]);
    const ids = function (r) { return new Set(r.results.map(function (row) { return row.id; })); };
    const checked = validateFlow(body.flow, ids(people), ids(templates));
    if (checked.error) return fail(checked.error);
    flow = JSON.stringify(checked.flow);
  }

  // A saved flow carries its own welcome message, so the old column is cleared.
  const result = await env.DB.prepare('UPDATE kiosks SET label = ?, flow = ?, welcome_message = NULL WHERE token = ? AND facility_id = ?')
    .bind(str(body.label, 40) || 'Lobby iPad', flow, token, f.id).run();
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

function readTemplate(body) {
  const t = { name: str(body.name, 60), subject: str(body.subject, 150), body: str(body.body, 2000) };
  if (!t.name) return { error: 'Give the template a name.' };
  if (!t.subject) return { error: 'Enter a subject line.' };
  if (!t.body) return { error: 'Enter the email text.' };
  return t;
}

export async function addTemplate(request, env, user) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  const t = readTemplate(await readJson(request));
  if (t.error) return fail(t.error);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM email_templates WHERE facility_id = ?').bind(f.id).first();
  if (count.n >= MAX_TEMPLATES) return fail('You can have up to ' + MAX_TEMPLATES + ' email templates.');

  const id = randomId(6);
  await env.DB.prepare('INSERT INTO email_templates (id, facility_id, name, subject, body) VALUES (?, ?, ?, ?, ?)')
    .bind(id, f.id, t.name, t.subject, t.body).run();
  return json({ ok: true, id: id });
}

export async function updateTemplate(request, env, user, id) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  const t = readTemplate(await readJson(request));
  if (t.error) return fail(t.error);
  const result = await env.DB.prepare('UPDATE email_templates SET name = ?, subject = ?, body = ? WHERE id = ? AND facility_id = ?')
    .bind(t.name, t.subject, t.body, id, f.id).run();
  if (!result.meta.changes) return fail('Not found.', 404);
  return json({ ok: true });
}

// A template still chosen on a kiosk button can't be deleted; the owner is told which kiosks use it.
export async function removeTemplate(env, user, id) {
  const f = await ownedFacility(env, user);
  if (!f) return fail('No business on this account.', 404);
  const { results } = await env.DB.prepare('SELECT label, flow FROM kiosks WHERE facility_id = ? AND flow IS NOT NULL ORDER BY created_at').bind(f.id).all();
  const usedOn = results.filter(function (k) {
    return kioskFlow(k, f.office_phone).screens.some(function (s) {
      return (s.buttons || []).some(function (b) { return b.template === id; });
    });
  }).map(function (k) { return '"' + (k.label || 'Kiosk') + '"'; });
  if (usedOn.length) {
    return fail('This template is still used on the ' + usedOn.join(' and ') + ' kiosk' + (usedOn.length > 1 ? 's' : '') +
      '. Choose another email for those buttons in Edit screens, then delete it.');
  }
  const result = await env.DB.prepare('DELETE FROM email_templates WHERE id = ? AND facility_id = ?').bind(id, f.id).run();
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
