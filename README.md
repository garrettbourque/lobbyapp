# LobbyApp

**https://lobbyapp.app/**: an iPad lobby check-in service. A business signs up, lists the people clients come to see, and opens its kiosk link on an iPad. Clients tap who they're here to see, and that person gets an email right away.

## How it fits together

Everything runs on one Cloudflare Worker (`worker/`), served at `lobbyapp.app` and `www.lobbyapp.app`.

| Piece | Where | What it does |
|---|---|---|
| Site | `worker/public/` | Homepage, sign-up/sign-in, password reset, contact form, dashboard |
| Kiosk | `worker/public/kiosk/` | The iPad screens, served for kiosk links `lobbyapp.app/?kiosk=<token>` |
| API | `worker/src/` | Accounts (`auth.js`), dashboard (`account.js`), kiosk check-ins (`kiosk.js`) |
| Database | Cloudflare D1 `lobbyapp` (`worker/migrations/`) | Users, sessions, businesses, people, kiosks, check-in log, contact messages |
| Email | Cloudflare Email Service, from `kiosk@lobbyapp.app` | Check-in notices, admin alerts, password resets, contact messages |

The kiosk token identifies the business, so treat a kiosk link like a key. Kiosks re-fetch their list every few minutes, so dashboard changes reach the iPad without touching it. No client information is collected: notices only say a client has arrived and when.

## Email on the free plan

On the free Workers plan, Cloudflare only delivers to addresses verified under **Email Routing → Destination addresses** (each person clicks a confirmation link once). Until the account moves to **Workers Paid**, new customers' clinicians and password-reset emails only arrive for verified addresses.

## Deploying

Push to `main`. The Cloudflare `lobbyapp` Worker is connected to this repo (Workers Builds, root directory `/worker`) and runs `npx wrangler deploy`.

Database schema changes go in a new file in `worker/migrations/`, then:
```bash
cd worker
npx wrangler d1 migrations apply lobbyapp --remote
```

Secrets (set with `npx wrangler secret put NAME`): `CONTACT_EMAIL`, where contact-form messages go.

## Running locally

```bash
cd worker
npm install
npx wrangler d1 migrations apply lobbyapp --local
npx wrangler dev
```
Local email is simulated: messages are logged to the console instead of sent.

## Admin commands

Customers manage their own business from the dashboard. For support, run these from `worker/` (after `npx wrangler login`):

```bash
node scripts/admin.mjs list
node scripts/admin.mjs facility owner <facilityId> <account email>
node scripts/admin.mjs facility set <facilityId> --name "New Name" --phone "(713) 555-0199"
node scripts/admin.mjs clinician set <clinicianId> --email name@clinic.com
node scripts/admin.mjs kiosk add <facilityId> --label "Lobby iPad"
```
Add `--local` to work against the local development database.
