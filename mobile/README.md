# Household Finances — Android app

Two ways to use it, chosen on the first screen:
- **Keep my data on this phone** (phone-only mode): no PC or server at all. Everything is stored privately inside the app on this phone. Nothing is sent anywhere (market data in this mode comes later).
- **Connect to a server:** the desktop app in host mode, or the self-hosted server, the same way the phone browser does.

## Install on a phone
1. On the phone, open the releases page (`household_finances-releases` → Releases) and find the newest **Android** release.
2. Download `HouseholdFinances-x.y.z.apk`.
3. Open it. Android asks to allow your browser to **install unknown apps**: allow it for that browser only, then tap **Install**. Google Play Protect may warn about an unknown developer: choose **Install anyway**.
4. Open **Household Finances**, enter your server address (e.g. `192.168.1.50:8080` at home, or your Tailscale name/address), tap **Connect**, and sign in.

Next time it opens straight to your dashboard. **Switch server** (top right, next to Sign out) goes back to the connect screen.

Away from home: turn on the Tailscale app on the phone first.

**Updates:** install the newer APK the same way; it installs over the old one and you stay signed in.

## Phone-only mode
- **Your data** lives in the app's private storage on the phone, kept until the app is uninstalled or its data is cleared in Android settings.
- **Same rules as the PC:** it runs the same shared core (`core/books.js`) as the server, so imports, budgets, rules, accounts, goals, holdings and settings all work the same.
- **Backups:** the app keeps a snapshot every day (last 14) and one before any restore. **Download backup** opens the share sheet so you can save the file to Drive or Files, or email it. That file also restores on a PC (⚙ Settings → Backup & restore), and a PC backup restores here, which is how you move between phone-only and a server.
- **Not in phone-only mode:** sharing between dashboards (needs a server) and, for now, market, economy and live price data.
- **Switching:** *Connect to a server instead* (top right) goes to the start screen; your phone data stays put and is there when you come back.
- **Uninstalling the app deletes phone-only data.** Make a backup file first.

## How it's built
- [Capacitor](https://capacitorjs.com) ships the dashboard (`public/`), the start screen (`apps/connect.html` → `start.html`) and the shared core. In server mode the app opens your server's own pages; in phone-only mode `public/local.js` answers the dashboard's requests on the device (IndexedDB storage) using the shared core.
- Plugins: Filesystem + Share (saving backup files).
- GitHub Actions (`.github/workflows/android-release.yml`) builds and signs the APK when `main` is pushed to the `release` branch and `version` in `mobile/package.json` is new, and publishes it as `android-v<version>` in the releases repo. No Android Studio needed.
- Plain `http://` home servers are allowed (`usesCleartextTraffic`), since most home servers don't have HTTPS.

## Signing key (one-time setup)
Android only installs an update over the old app if both are signed with the same key. Two secrets in the private repo (Settings → Secrets and variables → Actions):
- `ANDROID_KEYSTORE_B64`: the keystore file, base64-encoded
- `ANDROID_KEYSTORE_PASSWORD`: its password

Keep a copy of the keystore and password somewhere safe (a password manager). If they're lost, future versions can't update the installed app; you'd uninstall and reinstall (no data is lost; it lives on the server).

## Building on your own PC (optional)
Needs Node.js and Android Studio: `npm install`, `npm run android:add`, then `npm run android:open` and Build → Build APK.

## Local mode (later)
Running entirely on the phone, without a server, is a separate, larger step (an on-device database behind `public/store.js`).
