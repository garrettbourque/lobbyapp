# Lobby Kiosk Web App

A static web app for an iPad lobby kiosk. Clients choose whether they have an appointment; those with appointments select a counselor and trigger an iOS Shortcut to send a notification email.

## Deploy to GitHub Pages

1. **Create a GitHub repo** (e.g. `lobbyapp` or `lobby-kiosk`).

2. **Push this project** to the repo:
   ```bash
   git init
   git add index.html styles.css app.js config.js manifest.json README.md
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
   - Open that URL in Safari
   - **Share** → **Add to Home Screen** so it opens like an app
   - Use **Guided Access** (Settings → Accessibility → Guided Access) for kiosk mode

## On an Android tablet or phone

1. **Open the same site** in Chrome (or another Chromium browser).
2. **Add to Home screen** (Chrome menu → **Add to Home screen** or **Install app**) so it opens full-screen like an app.
3. **Kiosk-style lock**: use **Screen pinning** (Settings → Security → App pinning) or a dedicated kiosk app if you need the device locked to this screen.
4. **Notifications**: Android does not run Apple Shortcuts. For each counselor in `config.js`, set **`androidUrl`** to a URL your automation understands — for example an **HTTPS webhook** (IFTTT, Zapier, your server), or a **Tasker / MacroDroid** “open URL” trigger. Leaving `androidUrl` empty still shows the arrival message, but nothing is triggered in the background.

## Setup on the iPad

1. **Create three Shortcuts** with these exact names (or match the names in `config.js`):
   - `NotifyCounselorA`
   - `NotifyCounselorB`
   - `NotifyCounselorC`  
   Each Shortcut should send the appropriate templated email to that counselor using the iPad’s Mail account.

2. **Edit `config.js`** in this repo if you use different Shortcut names or counselor labels, then commit and push so the live site updates.

## Updating the app

After changing files locally:
```bash
git add .
git commit -m "Describe your change"
git push
```
GitHub Pages will redeploy automatically; refresh the app on the iPad to see changes.
