# Larenest: architecture and review guide

Last updated: November 23, 2026 (Desktop 1.0.26 / Android 1.6.6).

Larenest is a budgeting, bills and net-worth app that people run themselves. There's no company server and no account with us. Data lives on the user's PC, or entirely on their phone. This document explains how the pieces fit, where data lives, how it's protected, and what a reviewer should look at first.

## 1. The big picture

```
                 ┌───────────────────────── the user's PC ─────────────────────────┐
                 │  Desktop app (Electron, desktop/)                                │
                 │   ├─ host window (desktop/ui/host.html): QR codes, options      │
                 │   └─ runs ──► server.js (Node 22, child process via runner.js)  │
                 │               ├─ SQLite: finance.db (+ backups/)                │
                 │               ├─ HTTP + HTTPS on ONE port (first byte sniffed)  │
                 │               └─ serves public/ (the dashboard web app)         │
                 └──────────────▲───────────────────────────▲──────────────────────┘
                                │ https (pinned cert)        │ https (pinned cert)
                 ┌──────────────┴──────────┐   ┌────────────┴───────────────────────┐
                 │ Android app (mobile/)   │   │ Another PC running the desktop app │
                 │  WebView of the PC's    │   │ as a client (apps/connect.html)    │
                 │  dashboard, or phone-   │   └────────────────────────────────────┘
                 │  only mode (local.js)   │
                 │  + home-screen widgets  │
                 └─────────────────────────┘

Outside services (all optional, all HTTPS): SimpleFIN Bridge or Plaid (bank sync, the user's own account/keys),
Finnhub / FMP / Stooq / Yahoo (prices, symbols only), FRED / BLS / EIA / Treasury (economy data), NHTSA (VIN).
```

**One web app, three ways to run it:**

1. **PC host.** `server.js` serves `public/`. Pages call `/api/...` and the server stores everything in SQLite.
2. **Remote client.** The Android app, or another PC running the desktop app, loads the host's pages over the network.
3. **Phone-only.** The Android app serves `public/` from its own assets. `public/local.js` answers the same `/api/...` paths in the browser, storing data on the phone. It uses the same validation code as the server (`core/books.js`, copied in as `core-books.js`).

`public/store.js` (`FDStore`) is the single gateway pages use for data. It doesn't know or care which of the three modes is active.

## 2. Repository map

| Path | What it is |
|---|---|
| `server.js` | The whole server: HTTP/HTTPS, auth, API routes, SQLite schema, backups, command line (`node server.js add-user …`). No npm dependencies; uses Node's built-in `http`, `https`, `crypto` and `node:sqlite`. |
| `core/books.js` | Data rules shared by the server and phone-only mode. Collections, field whitelisting and validation. Every write goes through it. |
| `core/simplefin.js` | Bank-sync engine (`createBankSync`): connect, account review ("nothing comes in until you Save"), dedupe, import. Includes the SimpleFIN provider. |
| `core/banklinks.js` | Plaid provider for the same engine (the user's own Plaid keys, PC only). |
| `core/market.js` | Market data: quotes, history, sectors, movers, screeners, economy data. Caching and pacing (about hourly while markets are open). |
| `core/widgetdata.js` | Builds the compact summary for phone widgets (budget, bills, investments, markets, movers). Used by the server and by phone-only mode. |
| `core/tlscert.js` | Makes this PC's own HTTPS certificate (a small DER/X.509 encoder, ECDSA P-256) and gets Tailscale `*.ts.net` certificates. |
| `digest.js` | Weekly email summary over SMTP (Node built-ins only). |
| `public/` | The dashboard web app. `index.html`, `page.js` (most UI), `calcs.js` (pure calculations), `charts.js`, `runtime.js` (the `dash` data runtime), `import.js` (CSV/OFX/QFX, broker positions), `pdfstatement.js` (PDF statements via bundled pdf.js), `local.js` (phone-only backend), `tour.js` (first-run tour, data-safety picture, diagnostics, feedback), `vehicle.js` (vehicle value curve and odometer), `sw.js` (service worker; bump `hf-vNNN` on every change). |
| `apps/connect.html` | The "connect to a computer" screen used by the Android app and the desktop client. It handles QR scanning and certificate pinning. |
| `desktop/` | Electron app. `main.js` (process control, tray, IPC, certificate pins), `runner.js` (runs `server.js` in a child process), `preload.js` (`window.FDApp`), `ui/` (host, setup and connect windows). |
| `mobile/` | Capacitor Android app. `scripts/prepare.js` builds `www/`; `scripts/android-setup.js` patches the generated Android project (manifest, widgets, receivers). Native code is in `native/android/java/`. |
| `mobile/native/android/java/` | `MainActivity` (bridges, deep links, HTTPS pinning), `WidgetStore` / `WidgetRender` / `*Widget` (5 widgets), `WidgetRefreshReceiver` (⟳ and background refresh), `WidgetConfigActivity` (choose a dashboard per widget), `Alerts` (bill and budget notifications), `Pins` (pinned certificates). |
| `test/` | `node --test` suites (`npm test`, 68 tests): API, calculations, core rules, market, bank sync (SimpleFIN and Plaid), widget data, TLS certificate, vehicle model, digest. |
| `store-assets/` | Cleaned screenshots, Play listing text and data safety answers. |
| `.github/workflows/` | Release builds. See section 8. |
| `seed/` | Personal data used for local testing. **Never committed.** |

## 3. Data model

SQLite (`finance.db` in the data folder):

- `books`: dashboards (Personal, Shared …).
- `users`: logins (scrypt hash + salt).
- `members`: who can see which book (`edit` or `view`).
- `sessions`: login tokens, 60 days.
- `invites`: one-time QR/link invites.
- `docs`: all user records as JSON, by collection.
- `files`: receipts.
- `activity`: who changed what.
- `tls_self`: this PC's HTTPS certificate and key, kept in the database so backups keep phones paired.

Collections (`core/books.js`): `imports` (statement batches), `manual`, `edits`, `rules`, `budgets`, `accounts`, `goals`, `holdings`, `prefs` (per-book settings as JSON, including assets/vehicles and the watchlist), `shares` (values shared from a personal book into a shared one), `receipts`.

Everything the dashboard shows is calculated in the browser by `public/calcs.js` from these raw collections. The digest and widget summaries run the same `calcs.js` on the server (via `vm`), so numbers match everywhere.

Files kept next to the database (private, mode 600, not in backups):
- `api-keys.json`: market and economy keys.
- `simplefin.json`: bank-sync connections.
- `banklink-keys.json`: the user's own Plaid keys.
- `config.json`: mode, port, server id, cloud backup folder, last version.
- `tls/`: certificate files.

## 4. Security model

- **Sign-in:**
  - Passwords are hashed with scrypt.
  - Sessions are random 32-byte tokens in an `HttpOnly; SameSite=Strict` cookie, marked `Secure` on HTTPS.
  - Login and invite attempts are rate-limited per IP.
  - Each API call checks book membership and role; view-only members can't write.
- **Server owner:** the first user created. Only the owner can change Plaid keys.
- **Forgotten passwords:** the owner can reset any login's password from the PC app (Host options), on the basis that they have the computer. `node server.js passwd <name>` does the same for self-hosting. A reset signs that login out everywhere.
- **Transport:**
  - **One port, two protocols:** the server peeks at each connection's first byte. `0x16` is a TLS handshake and goes to HTTPS; anything else goes to HTTP, kept for compatibility.
  - **This PC's own certificate:** made once and pinned by the apps through its SHA-256 fingerprint. The fingerprint comes in the QR code (`/?fp=…`), or is trusted on first use when the user types the address.
    - **Android:** pinned in the WebView (`onReceivedSslError`) and in the widget refresh's `HttpsURLConnection`.
    - **Electron:** pinned through the `certificate-error` handler.
  - **Certificate changes:** if the fingerprint changes, the connect screen warns before continuing.
  - **Tailscale:** when Tailscale HTTPS certificates are enabled, the PC also serves a publicly trusted certificate for its `.ts.net` name (chosen by SNI).
- **Bank data:**
  - SimpleFIN and Plaid are read-only, and bank passwords go only to those services.
  - New accounts wait for the user to review and Save before anything is imported.
- **Outside services:** they receive only stock symbols, a VIN, or the user's own API key, never financial data.
- **Content-Security-Policy:** limits scripts to the app itself and Plaid Link.
- **Phone:**
  - Phone-only data lives in the app's private storage.
  - The JavaScript bridge exposed to pages loaded from the PC (`LarenestWidgetNative`) can only save the widget summary, set the refresh schedule and ask for notification permission.
  - Certificate pinning goes through the Capacitor plugin, which only the app's own local pages can call.

## 5. Backups

- **On the PC:**
  - **Daily backups:** a `VACUUM INTO` copy in `backups/`, keeping the newest 30.
  - **Update backups:** another one the first time a new version starts, before it's used.
  - **Cloud copies (optional):** the newest 14 are also copied to a cloud-synced folder (OneDrive, iCloud Drive and so on).
  - **Restoring:** stop hosting, copy a backup over `finance.db`, start again. The steps are shown in Host options.
- **Phone-only:** "Download backup" exports a file. The phone-only restore uses the same `core/books.js` validation as the server.

## 6. Phone widgets and alerts

1. The page calls `/api/books/<id>/widgets?follow=…&min=…&lev=…` for each dashboard the login can see, then hands `{cfg, books, data}` to the native side (`LarenestWidgetNative.update` or the Capacitor plugin).
2. `WidgetStore` saves it in the app's private preferences, and `WidgetRender` draws 5 widget types with `RemoteViews`.
3. ⟳ and the optional background refresh (`AlarmManager`) fetch the same endpoint natively with the WebView's session cookie.
4. `Alerts` works out bill-due and budget notifications on the phone, from that summary.

"Hide amounts" hides personal figures but keeps public market prices visible.

## 7. Testing

- `npm test` runs all suites with Node's built-in runner. No network: outside services are stubbed.
- UI checks are done with Playwright screenshots during development; there's no automated UI test suite yet.
- `git push -f origin main:android-check` runs a compile-only Android check (Linux minutes, cheap).

## 8. Releases

1. Bump the versions in `desktop/package.json`, `mobile/package.json` and the root `package.json`, which is the server version shown in diagnostics.
2. Add `## Desktop x` / `## Android x` sections to `CHANGELOG.md`.
3. Push `main` to the `release` branch. Windows and Android build automatically.
4. Mac (`desktop-release.yml` with `mac_publish`) and iOS (`ios-release.yml`) run **only by hand**, because macOS minutes cost 10×. Hold them until the app is on the iOS App Store.

Installers are published to the public `household_finances-releases` repo, which also serves larenest.app (`docs/`), including `/privacy` and `/testers`.

## 9. Where a review would help most

Highest value first:

1. **Authentication and access control (`server.js`):**
   - session handling
   - membership and role checks on every `/api/books/:id/...` route
   - invites
   - rate limiting
   - owner-only actions
2. **HTTPS and pinning:**
   - the first-byte protocol sniffing in `start()`
   - `core/tlscert.js` (hand-written DER)
   - certificate pinning in `Pins.java`, `MainActivity.java`, `desktop/main.js` and `apps/connect.html`, including the trust-on-first-use and certificate-change paths
3. **Data integrity:**
   - imports and dedupe (`public/import.js`, `core/simplefin.js`)
   - backups and restore
   - phone-only mode vs server consistency (`public/local.js` vs `server.js`)
4. **Calculations (`public/calcs.js`):** budgets, pace, recurring bills, net worth, investment returns.
5. **Android native code:** the widget refresh threading, `goAsync`, alarms after reboot, and notification permission on Android 13+.

**Known gaps:**
- There's no automated UI testing.
- `public/page.js` is large (about 3,800 lines) and would benefit from being split up.
- Plain `http://` is still accepted for browser compatibility.
- Phone-only mode on iOS isn't built yet.
