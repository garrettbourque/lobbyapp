# Lobby Kiosk Web App

A static web app for a lobby kiosk. Clients choose whether they have an appointment; those with appointments select a counselor and trigger a notification (free options below, or a paid webhook if you prefer).

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

## Notifying counselors (pick a free path)

These avoid **Power Automate’s “When an HTTP request is received”** trigger, which often requires a **Premium** license.

### 1. iOS Shortcuts (iPad only — no ongoing cost)

Create Shortcuts whose names match **`shortcutName`** in `config.js`. Each Shortcut can send email via Mail or Outlook using your existing setup. **Android** does not run Shortcuts; use **`mailto`** or **`androidUrl`** there.

### 2. `mailto:` drafts (iPad and Android — no ongoing cost)

Set **`mailto`** on each counselor in `config.js` to a full `mailto:` link (recipient, optional `subject` and `body`, URL-encoded). Tapping a counselor opens the **default mail app**—if that is **Outlook**, the draft opens in Outlook. Someone may still need to tap **Send** (iOS/Android security does not allow a web page to send mail silently). In **Guided Access**, test whether switching to Mail and back is acceptable for your lobby.

### 3. Third-party automation (often has a free tier)

Services such as **Make** or **Zapier** sometimes offer webhooks plus an **Outlook** action on a free tier (limits change—check their pricing). Put the webhook URL in **`notifyUrl`** and use **`notifyDelivery: 'iframe'`** if the service expects a **GET** in a browser.

### 4. Your own tiny backend (free tiers possible)

Deploy a **serverless function** (e.g. **Cloudflare Workers**, **Vercel**, **Netlify**) with a secret and call **Microsoft Graph** `sendMail`, or relay through **SendGrid** / similar. The kiosk would POST to your function URL (you add CORS on the function). This is more setup but no Power Automate HTTP trigger.

---

## Optional: Power Automate + `notifyUrl` (often Premium)

If your tenant includes the right license, you can use **When an HTTP request is received** → **Send an email (V2)** (Outlook), then paste the **HTTP POST URL** into **`notifyUrl`**. The app POSTs JSON `{ counselorName, shortcutName }`. You may need a **Response** action with **CORS** headers so the browser is allowed to call the flow from GitHub Pages. See Microsoft’s docs for the exact trigger and licensing in your org.

When **`notifyUrl`** is set for a counselor, it takes precedence over **`mailto`**, Shortcuts, and **`androidUrl`**.

**GET webhooks:** If the provider only allows **GET**, set **`notifyDelivery: 'iframe'`** and put the full GET URL in **`notifyUrl`**.

## On an Android tablet or phone

1. **Open the same site** in Chrome (or another Chromium browser).
2. **Add to Home screen** so it opens full-screen like an app.
3. **Screen pinning** or a kiosk app if you need the device locked to this screen.
4. Use **`mailto`** or **`notifyUrl`** for the same behavior as above; **`shortcutName`** alone does nothing on Android unless you add **`androidUrl`**.

## Setup on the iPad (Shortcuts path)

1. **Create Shortcuts** whose names match `config.js` (e.g. `NotifyCounselorA`). Each can send the right email from Mail/Outlook.

2. **Edit `config.js`** for names, optional **`mailto`**, **`notifyUrl`**, or **`androidUrl`**, then commit and push.

## Updating the app

After changing files locally:
```bash
git add .
git commit -m "Describe your change"
git push
```
GitHub Pages will redeploy automatically; refresh the app on the device to see changes.
