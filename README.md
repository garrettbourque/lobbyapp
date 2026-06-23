# Lobby Kiosk Web App

A static web app for an **iPad** lobby kiosk. Clients choose whether they have an appointment; those with appointments select a counselor and trigger an **iOS Shortcut** (for example to send a notification email).

## Deploy to GitHub Pages

1. **Create a GitHub repo** (e.g. `lobbyapp` or `lobby-kiosk`).

2. **Push this project** to the repo:
   ```bash
   git init
   git add index.html styles.css app.js config.js README.md
   git commit -m "Initial lobby kiosk app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

3. **Turn on GitHub Pages**
   - Repo → **Settings** → **Pages**
   - **Source**: Deploy from a branch
   - **Branch**: `main` (or `master`), folder **/ (root)**
   - Save

4. **Open the site**  
   After a minute or two it will be at:
   `https://YOUR_USERNAME.github.io/YOUR_REPO/`

5. **On the iPad**
   - Open that URL in **Safari**
   - **Share** → **Add to Home Screen** so it opens like an app
   - Use **Guided Access** (Settings → Accessibility → Guided Access) for kiosk mode

## Guided Access and iOS Shortcuts (important)

**Guided Access locks the iPad to one app.** Tapping a counselor runs `shortcuts://…`, which normally **hands off to the Shortcuts app**. Guided Access **blocks leaving Safari**, so that handoff does not complete and the shortcut **will not run**. That is an iOS limitation, not something this page can work around.

**Ways to proceed:**

1. **Use Guided Access + a webhook (recommended for kiosk)**  
   Set **`notifyWebhookUrl`** in `config.js` to an **HTTPS** endpoint you control. On each counselor tap, the page **stays in Safari** and POSTs JSON:
   ```json
   { "counselorName": "Emily", "shortcutName": "NotifyCounselorA" }
   ```
   Your endpoint can send Outlook email, Slack, etc. The endpoint must respond with **CORS** headers so the browser is allowed to POST from your GitHub Pages URL (e.g. `Access-Control-Allow-Origin: https://YOUR_USER.github.io`). Small **Cloudflare Workers**, **Vercel**, or **Netlify** functions are typical.

2. **Keep using Shortcuts only**  
   Turn **Guided Access off** while testing or operating the lobby (or use a physical stand / supervision instead of GA). Shortcuts can run when the device is allowed to open the Shortcuts app.

## Setup on the iPad

1. **Shortcuts path** (when **`notifyWebhookUrl`** is empty): Create Shortcuts whose names match **`shortcutName`** in `config.js`. Each Shortcut should do what you need (such as sending email).

2. **Webhook path** (when **`notifyWebhookUrl`** is set): Implement your HTTPS endpoint; Shortcuts are not used for the tap (but you can keep `shortcutName` in JSON for logging).

3. **Edit `config.js`** for names, optional **`notifyWebhookUrl`**, then commit and push so the live site updates.

## Updating the app

After changing files locally:
```bash
git add .
git commit -m "Describe your change"
git push
```
GitHub Pages will redeploy automatically; refresh the app on the iPad to see changes.
