# Lobby Kiosk Web App

A static web app for an iPad lobby kiosk. Clients choose whether they have an appointment; those with appointments select a counselor and trigger an iOS Shortcut to send a notification email.

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
   - Open that URL in Safari
   - **Share** → **Add to Home Screen** so it opens like an app
   - Use **Guided Access** (Settings → Accessibility → Guided Access) for kiosk mode

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
