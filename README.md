# Lobby Kiosk Web App

A static web app for a lobby kiosk. Clients choose whether they have an appointment; those with appointments select a counselor and trigger a notification (iOS Shortcuts and/or an **Outlook** email via **Microsoft Power Automate**).

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
4. **Notifications**: Prefer **`notifyUrl`** (below) so the same Outlook automation runs on iPad and Android. If you are not using `notifyUrl`, set **`androidUrl`** per counselor for your webhook, or rely on Shortcuts only on iPad.

## Outlook email (Microsoft 365) via Power Automate

The web page cannot log in to Outlook directly. Use **Power Automate** to receive an HTTPS request and send mail with the **Office 365 Outlook** “Send an email (V2)” action.

1. In [Power Automate](https://make.powerautomate.com), create an **Instant cloud flow** (or automated flow).
2. Add the trigger **When an HTTP request is received**.
3. Use **POST** and a JSON body schema that includes the fields this app sends, for example:
   ```json
   {
     "type": "object",
     "properties": {
       "counselorName": { "type": "string" },
       "shortcutName": { "type": "string" }
     }
   }
   ```
4. Add **Send an email (V2)** (Outlook) — set **To**, **Subject**, and **Body** (you can insert dynamic content from the trigger body, e.g. `counselorName`).
5. Add a **Response** action so the browser is allowed to call the flow: status **200**, and include headers such as **Access-Control-Allow-Origin** = `*` (or your GitHub Pages origin), **Access-Control-Allow-Methods** = `POST, OPTIONS`, **Access-Control-Allow-Headers** = `Content-Type`. If the kiosk browser still blocks the request, your tenant may need stricter CORS rules or use a **GET**-style hook with **`notifyDelivery: 'iframe'`** instead (see below).
6. Save the flow and copy the **HTTP POST URL** from the trigger into each counselor’s **`notifyUrl`** in `config.js` (one flow per counselor is the simplest; you can also use one flow and branch on `counselorName`).

When **`notifyUrl`** is set for a counselor, that URL is used on **all devices** and **Shortcuts / `androidUrl` are skipped** for that button.

**GET webhooks (Zapier and similar):** If your provider only supports opening a unique GET URL, set **`notifyDelivery: 'iframe'`** on that counselor (or set `CONFIG.notifyDelivery` to `iframe`) and put the full GET URL in **`notifyUrl`**.

## Setup on the iPad

1. **Create three Shortcuts** with these exact names (or match the names in `config.js`):
   - `NotifyCounselorA`
   - `NotifyCounselorB`
   - `NotifyCounselorC`  
   Each Shortcut should send the appropriate templated email to that counselor using the iPad’s Mail account.

2. **Edit `config.js`** in this repo if you use different Shortcut names, **`notifyUrl`** values, or counselor labels, then commit and push so the live site updates.

## Updating the app

After changing files locally:
```bash
git add .
git commit -m "Describe your change"
git push
```
GitHub Pages will redeploy automatically; refresh the app on the iPad to see changes.
