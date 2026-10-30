// Admin tool for the lobby kiosk database. Run from the worker/ folder:
//
//   node scripts/admin.mjs list [facilityId]
//   node scripts/admin.mjs facility add "Name" [--admin email] [--phone "(555) 555-5555"] [--tz America/Chicago]
//   node scripts/admin.mjs facility set <facilityId> [--name ..] [--admin ..] [--phone ..] [--tz ..]
//   node scripts/admin.mjs facility owner <facilityId> <account email>   (hand a facility to a signed-up user)
//   node scripts/admin.mjs clinician add <facilityId> "Name" [--email address] [--order n]
//   node scripts/admin.mjs clinician set <clinicianId> [--name ..] [--email address|none] [--order n]
//   node scripts/admin.mjs clinician remove <clinicianId>
//   node scripts/admin.mjs kiosk add <facilityId> [--label "Lobby tablet"]
//   node scripts/admin.mjs kiosk remove <token>
//
// Add --local to work against the local `wrangler dev` database instead of production.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SITE = 'https://lobbyapp.app/';
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

const args = process.argv.slice(2);
const local = takeFlag('--local');
const [group, action, ...rest] = args;

function takeFlag(name) {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function opt(name) {
  const i = rest.indexOf(name);
  if (i === -1) return undefined;
  const value = rest[i + 1];
  rest.splice(i, 2);
  return value;
}

function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function id(bytes) {
  return randomBytes(bytes).toString('base64url');
}

// Runs SQL through wrangler's own script with node, so no shell mangles the quotes.
// (--file on a remote database is an import and returns no rows, hence --command.)
function run(statement) {
  const r = spawnSync(process.execPath, [
    WRANGLER, 'd1', 'execute', 'lobbyapp', local ? '--local' : '--remote', '--json', '--command', statement
  ], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout || '', r.stderr || '');
    process.exit(1);
  }
  const out = JSON.parse(r.stdout);
  return out[out.length - 1].results || [];
}

function setClause(fields) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => k + ' = ' + sql(v));
  if (!parts.length) {
    console.error('Nothing to change.');
    process.exit(1);
  }
  return parts.join(', ');
}

function usage() {
  console.log(
    'Usage: node scripts/admin.mjs <list|facility|clinician|kiosk> ...\n' +
    'See the comment at the top of scripts/admin.mjs for every command.'
  );
  process.exit(1);
}

function list(facilityId) {
  const facilities = run('SELECT * FROM facilities' + (facilityId ? ' WHERE id = ' + sql(facilityId) : '') + ' ORDER BY created_at');
  for (const f of facilities) {
    console.log('\n' + f.name + '  [facility ' + f.id + ']');
    console.log('  admin: ' + (f.admin_email || '-') + '   phone: ' + (f.office_phone || '-') + '   tz: ' + f.timezone);
    const clinicians = run('SELECT * FROM clinicians WHERE facility_id = ' + sql(f.id) + ' ORDER BY active DESC, sort_order, name');
    console.log('  clinicians:');
    for (const c of clinicians) {
      console.log('    ' + c.name.padEnd(16) + (c.email || '(no email)').padEnd(34) + c.id + (c.active ? '' : '  (removed)'));
    }
    const kiosks = run('SELECT * FROM kiosks WHERE facility_id = ' + sql(f.id));
    console.log('  kiosks:');
    for (const k of kiosks) {
      console.log('    ' + (k.label || 'kiosk').padEnd(16) + SITE + '?kiosk=' + k.token);
    }
  }
}

if (group === 'list') {
  list(action);
} else if (group === 'facility' && action === 'add') {
  const name = rest.shift();
  if (!name) usage();
  const fid = id(6);
  run('INSERT INTO facilities (id, name, admin_email, office_phone, timezone) VALUES (' +
    [fid, name, opt('--admin') || null, opt('--phone') || null, opt('--tz') || 'America/Chicago'].map(sql).join(', ') + ')');
  console.log('Added facility ' + name + ': ' + fid);
} else if (group === 'facility' && action === 'set') {
  const fid = rest.shift();
  if (!fid) usage();
  run('UPDATE facilities SET ' + setClause({
    name: opt('--name'), admin_email: opt('--admin'), office_phone: opt('--phone'), timezone: opt('--tz')
  }) + ' WHERE id = ' + sql(fid));
  console.log('Updated facility ' + fid);
} else if (group === 'facility' && action === 'owner') {
  const [fid, email] = [rest.shift(), rest.shift()];
  if (!fid || !email) usage();
  const users = run('SELECT id FROM users WHERE email = ' + sql(email.toLowerCase()));
  if (!users.length) {
    console.error('No account with email ' + email + '. Have them sign up first.');
    process.exit(1);
  }
  // A user owns one facility, so drop any empty one created at sign-up.
  const others = run('SELECT id FROM facilities WHERE owner_user_id = ' + sql(users[0].id) + ' AND id != ' + sql(fid));
  for (const f of others) {
    const used = run('SELECT (SELECT COUNT(*) FROM clinicians WHERE facility_id = ' + sql(f.id) + ') + ' +
      '(SELECT COUNT(*) FROM kiosks WHERE facility_id = ' + sql(f.id) + ') AS n')[0].n;
    if (used) {
      console.error('That account already has facility ' + f.id + ' with clinicians or kiosks. Remove those first.');
      process.exit(1);
    }
    run('DELETE FROM facilities WHERE id = ' + sql(f.id));
  }
  run('UPDATE facilities SET owner_user_id = ' + sql(users[0].id) + ' WHERE id = ' + sql(fid));
  console.log('Facility ' + fid + ' now belongs to ' + email + '.');
} else if (group === 'clinician' && action === 'add') {
  const [fid, name] = [rest.shift(), rest.shift()];
  if (!fid || !name) usage();
  const cid = id(6);
  const email = opt('--email') || null;
  const order = Number(opt('--order') || 0);
  run('INSERT INTO clinicians (id, facility_id, name, email, sort_order) VALUES (' +
    [cid, fid, name, email, order].map(sql).join(', ') + ')');
  console.log('Added clinician ' + name + ': ' + cid);
  if (email) console.log('Reminder: ' + email + ' must be a verified destination address in Cloudflare Email Routing.');
} else if (group === 'clinician' && action === 'set') {
  const cid = rest.shift();
  if (!cid) usage();
  const email = opt('--email');
  const order = opt('--order');
  run('UPDATE clinicians SET ' + setClause({
    name: opt('--name'),
    email: email === 'none' ? null : email,
    sort_order: order === undefined ? undefined : Number(order)
  }) + ' WHERE id = ' + sql(cid));
  console.log('Updated clinician ' + cid);
  if (email && email !== 'none') console.log('Reminder: ' + email + ' must be a verified destination address in Cloudflare Email Routing.');
} else if (group === 'clinician' && action === 'remove') {
  const cid = rest.shift();
  if (!cid) usage();
  run('UPDATE clinicians SET active = 0 WHERE id = ' + sql(cid));
  console.log('Removed clinician ' + cid + ' (check-in history is kept).');
} else if (group === 'kiosk' && action === 'add') {
  const fid = rest.shift();
  if (!fid) usage();
  const token = id(24);
  run('INSERT INTO kiosks (token, facility_id, label) VALUES (' + [token, fid, opt('--label') || null].map(sql).join(', ') + ')');
  console.log('Kiosk link (open this on the tablet, then add it to the home screen):\n  ' + SITE + '?kiosk=' + token);
} else if (group === 'kiosk' && action === 'remove') {
  const token = rest.shift();
  if (!token) usage();
  run('DELETE FROM kiosks WHERE token = ' + sql(token));
  console.log('Removed kiosk. Its link no longer works.');
} else {
  usage();
}
