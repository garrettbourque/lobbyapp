# Notes for Claude Code

Read README.md for how LobbyApp works. This file holds working notes that the code doesn't show. This repo is public: never put email addresses, kiosk tokens or other private details here.

## Working on two computers

The owner switches between two Windows computers a couple of times a day.
- At the start of a session, run `git pull` (or check `git status -sb`) before changing anything.
- When the owner says they're switching or done, commit and push so the other computer can pull.
- A push to `main` deploys to production at lobbyapp.app (Workers Builds, root `/worker`), so don't push half-finished changes without saying so.

## Current status

- Live at https://lobbyapp.app as a multi-customer service. Free during the beta; no billing yet.
- Bloom Counseling (facility `0nTV93rS`, owned by the owner's own account) is now a test case for the site, not a live customer. The owner removed its counselors (as of 2026-10-28), so there's no pending work on their email addresses; don't bring it up.
- No front desk: when a notice can't be sent, the alert goes to the owner (the facility's alert email).

## Things to know

- To give a person a working notice email: add the address as a destination in Cloudflare Email Routing (zone lobbyapp.app), where the person must click a confirmation link once. Then set it from the dashboard (**Edit**) or with `node scripts/admin.mjs clinician set <clinicianId> --email <address>` from `worker/` (`node scripts/admin.mjs list` shows the ids).

- The account is on the free Workers plan, so email only reaches addresses verified in Email Routing. That applies to every customer's people and to password-reset emails. Workers Paid ($5/mo) lifts it; the owner said "not yet".
- Changes to the production setup (DNS records, deploys, domain cutovers) need the owner's explicit go-ahead.
- Windows quirks:
  - Pipe JSON into `wrangler secret put` from Bash, not PowerShell (PowerShell strips the quotes).
  - `admin.mjs` calls wrangler with `--command`, because `--file` against the remote database is an import and returns no rows.
