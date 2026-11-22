# Larenest — Windows desktop app

One app that runs your finance server and shows the dashboard in its own window, with a tray icon to control hosting.

## Build the installer (on your PC)
Needs only what you already have: **Node.js 22.13 or newer** (it includes npm).
```
cd desktop
npm install        # first time only: downloads Electron + the installer builder (~250 MB, this folder only)
npm run dist       # makes dist\Larenest Setup 1.0.0.exe
```
Run the .exe. Windows SmartScreen may warn because it isn't code-signed: **More info → Run anyway**.

To try it without installing: `npm start`.

The installer bundles its own copy of Node (copied from yours during the build), so the PCs you install it on don't need Node.

## First run
1. **Keep my finances on this computer** or **Connect to another computer**.
2. For this computer: choose **Only this computer** or **This computer, my phone and other devices**, the port, and the data folder.
   - Already self-hosting? Choose your existing `data` folder to keep everything, and stop the old server first (or use port 8081).
   - Default folder: `%APPDATA%\HouseholdFinances`.
3. Create a login (and pick which dashboards it can see). Skipped if the folder already has logins.

## Host options tab (when this computer is the server)
The window has two tabs: **Dashboard** and **Host options**. Host options has everything the tray menu has (start/stop, allow other devices, addresses to copy, Tailscale status, start with Windows, back up, data folder, updates, change setup, quit), so it works over Remote Desktop or on a virtual display where the tray can't be reached. If the window is closed, open the app again from the Start menu or desktop shortcut to bring it back.

## Tray icon (when this computer is the server)
- Open dashboard · Start / Stop server · **Allow other devices** on/off (takes effect immediately)
- **Phone & other device addresses**: copy your network and Tailscale addresses
- **Tailscale** status (or a link to get it); turning Tailscale on/off happens in Tailscale's own app
- Start with Windows (starts quietly in the tray) · Back up now · Open data folder · Change setup · Quit

Closing the window keeps the server running in the tray. **Quit** stops it.
The first time you allow other devices, Windows may ask about the firewall for "Node.js": choose **Private networks**.

## Files
| File | What it does |
|---|---|
| `main.js` | Window, tray, setup steps, Tailscale status, start with Windows |
| `runner.js` | Runs `server.js` in a background process (bundled Node) and takes start/stop/mode commands |
| `preload.js` | The small, safe bridge the setup and connect screens use |
| `ui/setup.html` | First-run setup |
| `scripts/prepare.js` | Copies the server, pages, Node runtime, connect screen and icons before each build |

Logs: `%APPDATA%\Larenest\server.log`. App settings: `%APPDATA%\Larenest\desktop.json` (your finance data is not in there).

Not yet included: auto-updates (needs a place to publish releases, e.g. a private GitHub repo) and code signing.

## Updates
- **Source code:** the private repo `household_finances`.
- **Installers:** the public repo `household_finances-releases`. It holds only the release files, so the app can check it without a password.
- The app checks once a day, and when you click **Tray → Check for updates** (or **Help → Check for updates**). It asks before downloading, and again before restarting. Your data folder is never touched.
- **To publish a version:** raise `version` in `desktop/package.json`, then push `main` to the `release` branch (`git push origin main:release`). Pushing to `main` alone never releases. GitHub Actions runs the tests, builds the installer on Windows and publishes it to the releases repo. If that version is already released, it does nothing. You can also run it by hand: Actions → Desktop release → Run workflow.
- **One-time setup:** in the private repo, go to Settings → Secrets → Actions and add `RELEASES_TOKEN`. Use a fine-grained token with **Contents: Read and write** on `household_finances-releases` only.
