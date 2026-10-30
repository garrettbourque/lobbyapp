# Notes for Claude Code

Read README.md for how LobbyApp works. This file holds working notes that the code doesn't show. This repo is public: never put email addresses, kiosk tokens or other private details here.

## Working on two computers

The owner switches between two Windows computers a couple of times a day.
- At the start of a session, run `git pull` (or check `git status -sb`) before changing anything.
- When the owner says they're switching or done, commit and push so the other computer can pull.
- A push to `main` deploys to production at lobbyapp.app (Workers Builds, root `/worker`), so don't push half-finished changes without saying so.

## Current status

- Live at https://lobbyapp.app as a multi-customer service. Free during the beta; no billing yet.
- "My Business Center" (facility `0nTV93rS`, owned by the owner's own account; formerly Bloom Counseling) is a test and example business, not a live customer. The owner removed its counselors (as of 2026-10-28), so there's no pending work on their email addresses; don't bring it up.
- No front desk: when a notice can't be sent, the alert goes to the owner (the facility's alert email).

## Things to know

- To give a person a working notice email: their address must be a verified destination in Cloudflare Email Routing (the person clicks a confirmation link once). The dashboard's **Send verification email** button does this through the API (`worker/src/verify.js`: 10-minute resend wait, 5 sends per person and 20 per business a day). It needs the Worker secrets `CF_ACCOUNT_ID` and `CF_EMAIL_TOKEN` (a token with only "Email Routing Addresses Write"); without them the dashboard says to contact us, and the address can be added by hand in Email Routing. Addresses can also be set with `node scripts/admin.mjs clinician set <clinicianId> --email <address>` from `worker/` (`node scripts/admin.mjs list` shows the ids).
- For local testing of verification, `worker/.dev.vars` (gitignored) can point `CF_API_BASE` at a fake API; wrangler dev only reads it at startup.

- The account is on the free Workers plan, so email only reaches addresses verified in Email Routing. That applies to every customer's people and to password-reset emails. Workers Paid ($5/mo) lifts it; the owner said "not yet".
- Changes to the production setup (DNS records, deploys, domain cutovers) need the owner's explicit go-ahead.
- Apply a new migration to the remote database (`npx wrangler d1 migrations apply lobbyapp --remote`) *before* pushing code that uses it; otherwise kiosks break until it's applied. Claude Code's auto mode blocks Claude from running that command, so the owner runs it in the VS Code terminal.
- Under `wrangler dev`, kiosk links on the dashboard still point at https://lobbyapp.app (the Worker's route), so swap in the local address when testing a kiosk locally.
- Kiosk customization (2026-10-28/29): each kiosk has its own screens (`kiosks.flow`, format in `worker/src/flow.js`). Screens are button screens or information screens; every screen but the start gets a Back button, except right after an email and when its auto return is above 0; answers can be shown on later screens as {Field name}, and {Person} shows who the visitor notified. Email templates (table email_templates, filled in by worker/src/kiosk.js) also get {Time}, {Kiosk} and {All answers}; no field may use those four names. A tag that isn't filled in stays as typed in the email, and the editor warns about it in red but still saves. The owner's rule: what visitors type goes in the notice email only and is never stored.
- Windows quirks:
  - Pipe JSON into `wrangler secret put` from Bash, not PowerShell (PowerShell strips the quotes).
  - `admin.mjs` calls wrangler with `--command`, because `--file` against the remote database is an import and returns no rows.
