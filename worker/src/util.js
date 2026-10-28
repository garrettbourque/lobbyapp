export function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers)
  });
}

export function fail(error, status) {
  return json({ ok: false, error: error }, status || 400);
}

export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch (e) {
    return {};
  }
}

// Trimmed string capped at max characters ('' for anything else).
export function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function randomId(bytes) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, function (c) { return c.charCodeAt(0); });
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// SQLite datetime('now') format, offset by the given seconds.
export function sqlTime(offsetSeconds) {
  return new Date(Date.now() + offsetSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

export function formatTime(timeZone) {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: timeZone || 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'
];
