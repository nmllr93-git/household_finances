# Household Finances — Android app

Connects to your Household Finances server (the desktop app in host mode, or the self-hosted server), the same way the phone browser does, but as a real app with its own icon.

## Install on a phone
1. On the phone, open the releases page (`household_finances-releases` → Releases) and find the newest **Android** release.
2. Download `HouseholdFinances-x.y.z.apk`.
3. Open it. Android asks to allow your browser to **install unknown apps**: allow it for that browser only, then tap **Install**. Google Play Protect may warn about an unknown developer: choose **Install anyway**.
4. Open **Household Finances**, enter your server address (e.g. `192.168.1.50:8080` at home, or your Tailscale name/address), tap **Connect**, and sign in.

Next time it opens straight to your dashboard. **Switch server** (top right, next to Sign out) goes back to the connect screen.

Away from home: turn on the Tailscale app on the phone first.

**Updates:** install the newer APK the same way; it installs over the old one and you stay signed in.

## How it's built
- [Capacitor](https://capacitorjs.com) wraps a tiny local start screen (`apps/connect.html`); after connecting, the app shows your server's own pages, so sign-in and every feature work exactly like the browser.
- GitHub Actions (`.github/workflows/android-release.yml`) builds and signs the APK whenever `version` in `mobile/package.json` goes up, and publishes it as `android-v<version>` in the releases repo. No Android Studio needed.
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
