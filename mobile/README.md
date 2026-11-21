# Household Finances — Android app

Two ways to use it, chosen on the first screen:
- **Keep my data on this phone** (phone-only mode): no PC or server at all. Everything is stored privately inside the app on this phone. Nothing is sent anywhere except the stock symbols and data requests to the market services whose keys you add.
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
- **First run:** a short walkthrough. Name your dashboard (and optionally add a shared one), turn on bill reminders, learn about backups, then import a statement or look around. *Skip setup* is always there.
- **Dashboards:** ⚙ Settings → *On this phone* → rename, add (personal or shared) or delete dashboards. A snapshot is saved inside the app before a delete.
- **Bill reminders:** phone notifications before recurring bills are due (on the day, 1, 2, 3 or 7 days before, at a time you pick), for the next 60 days, from *Subscriptions & recurring bills* in every dashboard. Set on the phone only; nothing is sent anywhere.
- **Backup reminder:** until you've saved a backup file in the last 30 days, a banner explains that the data only lives on this phone, with **Make a backup now** and **Remind me in a week**. Settings shows when you last saved one.
- **Your data** lives in the app's private storage on the phone, kept until the app is uninstalled or its data is cleared in Android settings.
- **Same rules as the PC:** it runs the same shared core (`core/books.js`) as the server, so imports, budgets, rules, accounts, goals, holdings and settings all work the same.
- **Backups:** the app keeps a snapshot every day (last 14) and one before any restore. **Download backup** opens the share sheet so you can save the file to Drive or Files, or email it. That file also restores on a PC (⚙ Settings → Backup & restore), and a PC backup restores here, which is how you move between phone-only and a server.
- **Market, economy and live prices work too:** add your keys under ⚙ Settings → Data sources on the phone. They're stored on the phone only. The same pacing as the PC applies (markets at most hourly during trading hours, economy daily), and results are kept between app launches so reopening the app doesn't spend extra calls.
- **Not in phone-only mode:** sharing between dashboards (needs a server).
- **Switching:** *Connect to a server instead* (top right) goes to the start screen; your phone data stays put and is there when you come back.
- **Uninstalling the app deletes phone-only data.** Make a backup file first.

## How it's built
- [Capacitor](https://capacitorjs.com) ships the dashboard (`public/`), the start screen (`apps/connect.html` → `start.html`) and the shared core. In server mode the app opens your server's own pages; in phone-only mode `public/local.js` answers the dashboard's requests on the device (IndexedDB storage) using the shared core.
- Plugins: Filesystem + Share (saving backup files), Local Notifications (bill reminders).
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

## Google Play (store release)
Every Android release also produces **`HouseholdFinances-x.y.z.aab`**, the bundle the Play Store needs. It's signed with the same key as the APK, and Play uses that key as your **upload key**.
- Download it: private repo → **Actions → Android release →** the run → **Artifacts** → `play-store-bundle-x.y.z`. It's kept 90 days and isn't public.
- In Play Console: **Test and release → Closed testing → Create release** → upload the `.aab`. The first time, accept **Play App Signing**: Google keeps the final signing key, and your key stays the upload key.
- The app targets Android 16 (API 36), as Google Play requires (Capacitor 8).

## iPhone (TestFlight and App Store)
GitHub builds the iPhone app on its Macs and uploads it to App Store Connect, so you don't need a Mac. The iOS build skips quietly until these secrets exist in the private repo (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `APPLE_TEAM_ID` | developer.apple.com → Account → Membership details → **Team ID** (10 characters) |
| `APPSTORE_KEY_ID` | App Store Connect → Users and Access → **Integrations → App Store Connect API** → Team Keys → **+**, role **App Manager** → the key's **Key ID** |
| `APPSTORE_ISSUER_ID` | Same page, **Issuer ID** at the top |
| `APPSTORE_KEY_P8` | **Download API Key** (only possible once) → open the `.p8` file in a text editor → paste everything, including the BEGIN/END lines |

Before the first build: in App Store Connect, **Apps → + → New App**, platform iOS, bundle ID `com.householdfinances.app` (register it first under developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers**, if it isn't offered), SKU anything such as `hf-ios`.

Each release then uploads a new build. After Apple processes it (about 10–30 minutes), it appears under **TestFlight**. Add yourself and testers there, or submit it for App Store review.

The iPhone app asks permission for the camera (receipt photos), photos and local network (reaching your home server). It allows plain-http home servers only inside the dashboard view and on the local network.
