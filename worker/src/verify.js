// Email verification for people's notice addresses. On the free Workers plan, email only
// reaches addresses verified in Cloudflare Email Routing, so the dashboard asks Cloudflare
// to send each person a verification email and shows whether they've confirmed.
//
// Needs the secrets CF_ACCOUNT_ID and CF_EMAIL_TOKEN (an API token with only the
// "Email Routing Addresses Write" permission). CF_API_BASE overrides the API address for
// local testing. Without them, statuses are 'unknown' and the dashboard says to contact us.

import { json, fail } from './util.js';

const RESEND_WAIT_MINUTES = 10;
const DAILY_SENDS_PER_PERSON = 5;
// Across a whole business, so adding many people can't be used to send lots of emails.
const DAILY_SENDS_PER_BUSINESS = 20;

function configured(env) {
  return !!(env.CF_ACCOUNT_ID && env.CF_EMAIL_TOKEN);
}

async function cloudflare(env, method, path, body) {
  const base = env.CF_API_BASE || 'https://api.cloudflare.com/client/v4';
  const res = await fetch(base + '/accounts/' + env.CF_ACCOUNT_ID + '/email/routing/addresses' + path, {
    method: method,
    headers: { 'Authorization': 'Bearer ' + env.CF_EMAIL_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok || !data.success) {
    throw new Error('Cloudflare API ' + method + ' ' + res.status + ': ' + JSON.stringify(data.errors || []));
  }
  return data;
}

// Every destination address on the account, by lower-case email: { id, verified }.
async function listAddresses(env) {
  const found = new Map();
  for (let page = 1; page <= 20; page++) {
    const data = await cloudflare(env, 'GET', '?per_page=50&page=' + page);
    data.result.forEach(function (a) {
      found.set(String(a.email).toLowerCase(), { id: a.id, verified: !!a.verified });
    });
    const info = data.result_info || {};
    if (!data.result.length || page >= (info.total_pages || 1)) break;
  }
  return found;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Sends today for this person (counts from earlier days don't apply).
function sentToday(c) {
  return c.verify_day === today() ? c.verify_count : 0;
}

// When the next send is allowed, as an ISO time, or null if now.
function nextSendAt(c) {
  if (!c.verify_sent_at) return null;
  const at = new Date(c.verify_sent_at.replace(' ', 'T') + 'Z').getTime() + RESEND_WAIT_MINUTES * 60 * 1000;
  return at > Date.now() ? new Date(at).toISOString() : null;
}

// Adds verification to clinician rows for the dashboard:
//   verify: 'confirmed' | 'waiting' | 'none' (has an email, never sent) | 'unknown'
//   verifyAt: ISO time the Send button opens again, verifyCapped: daily limit reached
export async function verificationStatus(env, clinicians) {
  let addresses = null;
  if (configured(env) && clinicians.some(function (c) { return c.email; })) {
    try {
      addresses = await listAddresses(env);
    } catch (e) {
      console.error('Email verification status failed:', e && e.message);
    }
  }
  return clinicians.map(function (c) {
    const a = addresses && c.email ? addresses.get(c.email.toLowerCase()) : null;
    let verify = 'unknown';
    if (addresses && c.email) verify = a ? (a.verified ? 'confirmed' : 'waiting') : 'none';
    return {
      verify: verify,
      verifyAt: nextSendAt(c),
      verifyCapped: sentToday(c) >= DAILY_SENDS_PER_PERSON
    };
  });
}

// POST /api/clinicians/:id/verify: has Cloudflare send this person a verification email.
// Cloudflare's API has no "resend", so an unconfirmed address is removed and added again.
export async function sendVerification(env, facility, id) {
  if (!configured(env)) return fail('Verification emails aren\'t set up yet. Please contact us.', 503);
  const c = await env.DB.prepare(
    'SELECT id, email, verify_sent_at, verify_day, verify_count FROM clinicians WHERE id = ? AND facility_id = ? AND active = 1'
  ).bind(id, facility.id).first();
  if (!c) return fail('Not found.', 404);
  if (!c.email) return fail('Add an email address for this person first.');
  if (nextSendAt(c)) return fail('A verification email was just sent. You can send another ' + RESEND_WAIT_MINUTES + ' minutes after the last one.', 429);
  if (sentToday(c) >= DAILY_SENDS_PER_PERSON) return fail('That\'s ' + DAILY_SENDS_PER_PERSON + ' verification emails today for this person. Try again tomorrow.', 429);
  const business = await env.DB.prepare(
    'SELECT COALESCE(SUM(verify_count), 0) AS n FROM clinicians WHERE facility_id = ? AND verify_day = ?'
  ).bind(facility.id, today()).first();
  if (business.n >= DAILY_SENDS_PER_BUSINESS) return fail('Your business has sent ' + DAILY_SENDS_PER_BUSINESS + ' verification emails today. Try again tomorrow.', 429);

  try {
    const existing = (await listAddresses(env)).get(c.email.toLowerCase());
    if (existing && existing.verified) return json({ ok: true, verify: 'confirmed' });
    if (existing) await cloudflare(env, 'DELETE', '/' + encodeURIComponent(existing.id));
    await cloudflare(env, 'POST', '', { email: c.email });
  } catch (e) {
    console.error('Sending verification failed:', e && e.message);
    return fail('Cloudflare couldn\'t send the verification email. Please try again in a few minutes.', 502);
  }

  await env.DB.prepare(
    "UPDATE clinicians SET verify_sent_at = datetime('now'), verify_count = ?, verify_day = ? WHERE id = ?"
  ).bind(sentToday(c) + 1, today(), c.id).run();
  return json({ ok: true, verify: 'waiting' });
}
