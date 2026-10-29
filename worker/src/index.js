// LobbyApp Worker: serves the site (public/) and its API.
//
// Kiosk (token in the link, no sign-in):
//   GET  /api/kiosk/:token            facility name, screens (flow) and clinician list (no emails)
//   POST /api/kiosk/:token/checkin    { clinicianId, answers } -> emails that clinician (answers are never stored)
// Accounts:
//   POST /api/signup | /api/signin | /api/signout | /api/forgot | /api/reset
// Signed in (facility owner):
//   GET  /api/account                 everything the dashboard shows
//   PUT  /api/facility
//   POST /api/clinicians, PUT|DELETE /api/clinicians/:id
//   POST /api/kiosks, PUT|DELETE /api/kiosks/:token (PUT takes { label, flow })
// Anyone:
//   POST /api/contact
//
// Data lives in D1 (migrations/); worker/scripts/admin.mjs manages it from the command line.

import { json, fail } from './util.js';
import { getUser, signup, signin, signout, forgotPassword, resetPassword } from './auth.js';
import { findKiosk, getKiosk, checkin } from './kiosk.js';
import { getAccount, updateFacility, addClinician, updateClinician, removeClinician, addKiosk, updateKiosk, removeKiosk, contact } from './account.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        console.error('API error:', e && e.stack);
        return fail('Something went wrong. Please try again.', 500);
      }
    }

    // Kiosk links are lobbyapp.app/?kiosk=TOKEN; everything else at / is the homepage.
    if (url.pathname === '/' && url.searchParams.has('kiosk')) {
      return env.ASSETS.fetch(new Request(new URL('/kiosk/', url), request));
    }
    return env.ASSETS.fetch(request);
  }
};

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  const kioskMatch = path.match(/^\/api\/kiosk\/([A-Za-z0-9_-]{16,64})(\/checkin)?$/);
  if (kioskMatch) {
    return handleKiosk(request, env, url, kioskMatch[1], !!kioskMatch[2]);
  }

  // Everything else is same-origin only. Browsers always send Origin on POST/PUT/DELETE,
  // so this blocks other sites from acting with a signed-in user's cookie.
  if (method !== 'GET' && request.headers.get('Origin') !== url.origin) {
    return fail('Forbidden', 403);
  }

  if (method === 'POST' && path === '/api/signup') return signup(request, env);
  if (method === 'POST' && path === '/api/signin') return signin(request, env);
  if (method === 'POST' && path === '/api/signout') return signout(request, env);
  if (method === 'POST' && path === '/api/forgot') return forgotPassword(request, env, url.origin);
  if (method === 'POST' && path === '/api/reset') return resetPassword(request, env);

  const user = await getUser(request, env);
  if (method === 'POST' && path === '/api/contact') return contact(request, env, user);
  if (!user) return fail('Please sign in.', 401);

  if (method === 'GET' && path === '/api/account') return getAccount(env, user, url.origin);
  if (method === 'PUT' && path === '/api/facility') return updateFacility(request, env, user);
  if (method === 'POST' && path === '/api/clinicians') return addClinician(request, env, user);
  if (method === 'POST' && path === '/api/kiosks') return addKiosk(request, env, user);

  const clinicianMatch = path.match(/^\/api\/clinicians\/([A-Za-z0-9_-]{1,32})$/);
  if (clinicianMatch && method === 'PUT') return updateClinician(request, env, user, clinicianMatch[1]);
  if (clinicianMatch && method === 'DELETE') return removeClinician(env, user, clinicianMatch[1]);

  const kioskOwned = path.match(/^\/api\/kiosks\/([A-Za-z0-9_-]{16,64})$/);
  if (kioskOwned && method === 'PUT') return updateKiosk(request, env, user, kioskOwned[1]);
  if (kioskOwned && method === 'DELETE') return removeKiosk(env, user, kioskOwned[1]);

  return fail('Not found', 404);
}

// Kiosk calls are same-origin from lobbyapp.app, but also allowed from ALLOWED_ORIGINS
// (the old GitHub Pages setup called this Worker cross-origin). The token is the real check.
async function handleKiosk(request, env, url, token, isCheckin) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(function (o) { return o.trim(); });
  const originAllowed = origin === url.origin || allowed.indexOf(origin) !== -1;
  const cors = originAllowed && origin !== url.origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  } : {};

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: originAllowed ? 204 : 403, headers: cors });
  }
  // A same-origin GET carries no Origin header; anything that does must be allowed.
  if (origin && !originAllowed) {
    return json({ ok: false, error: 'Forbidden' }, 403);
  }

  const kiosk = await findKiosk(env, token);
  if (!kiosk) return json({ ok: false, error: 'Unknown kiosk' }, 404, cors);
  if (!isCheckin && request.method === 'GET') return getKiosk(env, kiosk, cors);
  if (isCheckin && request.method === 'POST') return checkin(request, env, kiosk, cors);
  return json({ ok: false, error: 'Method not allowed' }, 405, cors);
}
