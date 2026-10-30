// Email + password accounts with cookie sessions.

import { json, fail, readJson, str, isEmail, randomId, base64url, fromBase64url, sha256Hex, sqlTime } from './util.js';
import { trySendEmail } from './email.js';

const COOKIE = '__Host-session';
const SESSION_DAYS = 30;
const RESET_MINUTES = 60;
// Workers' PBKDF2 tops out at 100,000 iterations.
const PBKDF2_ITERATIONS = 100000;
const MIN_PASSWORD = 10;

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return ['pbkdf2', PBKDF2_ITERATIONS, base64url(salt), base64url(hash)].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const expected = fromBase64url(parts[3]);
  const actual = await pbkdf2(password, fromBase64url(parts[2]), Number(parts[1]));
  return actual.length === expected.length && crypto.subtle.timingSafeEqual(actual, expected);
}

// Used when the email isn't registered, so a miss takes as long as a wrong password.
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function readCookie(request) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return match ? match[1] : null;
}

function sessionCookie(token) {
  return COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400;
}

function clearedCookie() {
  return COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

async function startSession(env, userId) {
  const token = randomId(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(token), userId, sqlTime(SESSION_DAYS * 86400)).run();
  return sessionCookie(token);
}

export async function getUser(request, env) {
  const token = readCookie(request);
  if (!token) return null;
  return env.DB.prepare(
    'SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id ' +
    "WHERE s.token_hash = ? AND s.expires_at > datetime('now')"
  ).bind(await sha256Hex(token)).first();
}

// Slows password guessing and mass sign-ups from one address.
async function limited(request, env, action) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const { success } = await env.AUTH_LIMITER.limit({ key: action + ':' + ip });
  return !success;
}

function checkPassword(password) {
  if (password.length < MIN_PASSWORD) return 'Password must be at least ' + MIN_PASSWORD + ' characters.';
  if (password.length > 200) return 'Password is too long.';
  return null;
}

export async function signup(request, env) {
  if (await limited(request, env, 'signup')) return fail('Too many attempts. Try again in a minute.', 429);
  const body = await readJson(request);
  const email = str(body.email, 254).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const businessName = str(body.businessName, 100);

  if (!businessName) return fail('Enter your business name.');
  if (!isEmail(email)) return fail('Enter a valid email address.');
  const passwordError = checkPassword(password);
  if (passwordError) return fail(passwordError);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return fail('An account with that email already exists. Try signing in.', 409);

  const userId = randomId(9);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)')
      .bind(userId, email, await hashPassword(password)),
    env.DB.prepare('INSERT INTO facilities (id, name, admin_email, owner_user_id) VALUES (?, ?, ?, ?)')
      .bind(randomId(6), businessName, email, userId)
  ]);
  // Let the site owner know. A failed send doesn't affect the new account.
  if (env.CONTACT_EMAIL) {
    const when = new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    await trySendEmail(env, env.CONTACT_EMAIL, 'New LobbyApp sign-up: ' + businessName,
      'Business: ' + businessName + '\nAccount email: ' + email + '\nTime: ' + when + ' (Central)\n');
  }
  return json({ ok: true }, 200, { 'Set-Cookie': await startSession(env, userId) });
}

export async function signin(request, env) {
  if (await limited(request, env, 'signin')) return fail('Too many attempts. Try again in a minute.', 429);
  const body = await readJson(request);
  const email = str(body.email, 254).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  const user = await env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(email).first();
  const valid = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !valid) return fail('Email or password is incorrect.', 401);
  return json({ ok: true }, 200, { 'Set-Cookie': await startSession(env, user.id) });
}

export async function signout(request, env) {
  const token = readCookie(request);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearedCookie() });
}

export async function forgotPassword(request, env, origin) {
  if (await limited(request, env, 'forgot')) return fail('Too many attempts. Try again in a minute.', 429);
  const body = await readJson(request);
  const email = str(body.email, 254).toLowerCase();
  const user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();

  // Same answer either way, so this can't be used to discover who has an account.
  if (user) {
    const token = randomId(32);
    await env.DB.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256Hex(token), user.id, sqlTime(RESET_MINUTES * 60)).run();
    await trySendEmail(env, user.email, 'Reset your LobbyApp password',
      'Someone (hopefully you) asked to reset the password for your LobbyApp account.\n\n' +
      'Choose a new password here (the link works for ' + RESET_MINUTES + ' minutes):\n' +
      origin + '/reset?token=' + token + '\n\n' +
      "If you didn't ask for this, you can ignore this email.");
  }
  return json({ ok: true });
}

export async function resetPassword(request, env) {
  if (await limited(request, env, 'reset')) return fail('Too many attempts. Try again in a minute.', 429);
  const body = await readJson(request);
  const token = str(body.token, 100);
  const password = typeof body.password === 'string' ? body.password : '';
  const passwordError = checkPassword(password);
  if (passwordError) return fail(passwordError);

  const tokenHash = await sha256Hex(token);
  const reset = await env.DB.prepare(
    "SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')"
  ).bind(tokenHash).first();
  if (!reset) return fail('This reset link is invalid or has expired. Request a new one.');

  // A new password signs out every existing session.
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(password), reset.user_id),
    env.DB.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ?").bind(tokenHash),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(reset.user_id)
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': await startSession(env, reset.user_id) });
}
