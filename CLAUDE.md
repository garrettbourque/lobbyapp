# Notes for Claude Code

Read README.md for how LobbyApp works. This file holds working notes that the code doesn't show. This repo is public: never put email addresses, kiosk tokens or other private details here.

## Working on two computers

The owner switches between two Windows computers a couple of times a day.
- At the start of a session, run `git pull` (or check `git status -sb`) before changing anything.
- When the owner says they're switching or done, commit and push so the other computer can pull.
- A push to `main` deploys to production at lobbyapp.app (Workers Builds, root `/worker`), so don't push half-finished changes without saying so.

## Current status

- Live at https://lobbyapp.app as a multi-customer service. Free during the beta; no billing yet.
- First customer: Bloom Counseling (facility `0nTV93rS`), owned by the owner's own account. Houston, Central time.
- Only Kristen's notice email is set up and verified. The owner is waiting on the other counselors' addresses (Emily, Lauren, Macie).
- No front desk: when a notice can't be sent, the alert goes to the owner (the facility's alert email).

## To do when the counselors' emails arrive

1. Add each address as a destination in Cloudflare Email Routing (zone lobbyapp.app). Cloudflare emails them a confirmation link they must click once.
2. Set the email on the person, either from the dashboard (**Edit**) or with `node scripts/admin.mjs clinician set <clinicianId> --email <address>` from `worker/` (`node scripts/admin.mjs list` shows the ids).

## Things to know

- The account is on the free Workers plan, so email only reaches addresses verified in Email Routing. That applies to every customer's people and to password-reset emails. Workers Paid ($5/mo) lifts it; the owner said "not yet".
- Changes to the production setup (DNS records, deploys, domain cutovers) need the owner's explicit go-ahead.
- Windows quirks:
  - Pipe JSON into `wrangler secret put` from Bash, not PowerShell (PowerShell strips the quotes).
  - `admin.mjs` calls wrangler with `--command`, because `--file` against the remote database is an import and returns no rows.
