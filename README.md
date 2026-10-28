# Lobby Kiosk Web App

A web app for an **iPad** lobby kiosk. Clients choose whether they have an appointment; those with appointments tap their clinician, and that clinician gets an email saying their client has arrived. One deployment serves any number of facilities, each with its own clinicians and kiosk links.

## How it fits together

| Piece | Where | What it does |
|---|---|---|
| Kiosk site (`index.html`, `app.js`, `config.js`, `styles.css`) | GitHub Pages at **https://lobbyapp.app/** | The screens the client sees |
| Worker (`worker/`) | Cloudflare Worker `lobbyapp` (`lobbyapp.bourque-garrett.workers.dev`) | Serves each kiosk's clinician list and sends the emails |
| Database | Cloudflare D1 `lobbyapp` (`worker/schema.sql`) | Facilities, clinicians, kiosks and a check-in log (no client info) |
| Email | Cloudflare Email Service, from `kiosk@lobbyapp.app` | Clinician emails and admin alerts |

Each iPad opens its own kiosk link, `https://lobbyapp.app/?kiosk=<token>`. The token identifies the facility, so treat the link like a key. The kiosk re-fetches its clinician list every few minutes, so changes show up without touching the iPad.

When a clinician has no email address, or their email fails to send, the facility's admin gets an alert instead (there is no front desk).

## Managing facilities, clinicians and kiosks

Run from `worker/` (after `npm install` and `npx wrangler login`):

```bash
node scripts/admin.mjs list
node scripts/admin.mjs facility add "Clinic Name" --admin owner@clinic.com --phone "(713) 555-0100" --tz America/Chicago
node scripts/admin.mjs facility set <facilityId> --name "New Name" --phone "(713) 555-0199"
node scripts/admin.mjs clinician add <facilityId> "Name" --email name@clinic.com --order 1
node scripts/admin.mjs clinician set <clinicianId> --email name@clinic.com
node scripts/admin.mjs clinician remove <clinicianId>
node scripts/admin.mjs kiosk add <facilityId> --label "Lobby iPad"
node scripts/admin.mjs kiosk remove <token>
```

These change data only; nothing needs to be pushed.

**Email addresses must be verified first.** On the free Workers plan, Cloudflare only sends to addresses verified under **Email Routing → Destination addresses**. Add each clinician's (and facility admin's) address there; they click a confirmation link once. The Workers Paid plan removes this requirement.

## Setting up an iPad

1. Run `node scripts/admin.mjs kiosk add <facilityId>` and open the printed link in **Safari**.
2. **Share → Add to Home Screen** so it opens full-screen like an app.
3. Turn on **Guided Access** (Settings → Accessibility → Guided Access), open the app, and triple-click the side or Home button to lock the iPad to it.

## Updating the app

After changing files locally:
```bash
git add .
git commit -m "Describe your change"
git push
```

Both halves redeploy automatically on every push to `main`:
- **Kiosk site:** GitHub Pages republishes the repo root. Close and reopen the app on the iPad to pick it up.
- **Worker:** the Cloudflare `lobbyapp` Worker is connected to this repo (Workers Builds, root directory `/worker`) and runs `npx wrangler deploy` there.
