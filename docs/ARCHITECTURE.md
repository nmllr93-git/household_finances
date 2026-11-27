# Larenest: architecture and review guide

Last updated: November 23, 2026 (Desktop 1.0.26 / Android 1.6.6, plus the Linux work for the next release).

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

**Where the server runs:** the Windows, Mac or Linux desktop app (Electron), the Docker image (`Dockerfile`, x86-64 and ARM64), or a Linux systemd service (`scripts/install-linux.sh`). All of them run the same `server.js` on Node 22, with the same data format. See `docs/LINUX.md`.

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
| `Dockerfile`, `.dockerignore`, `deploy/docker-compose.yml` | The server as a container (`node:22-alpine`, non-root, data in `/data`, health check). |
| `scripts/install-linux.sh`, `scripts/pack-server.sh` | Linux installer: uses or downloads Node 22 (checksum-verified), installs the server tarball to `/opt/larenest`, data in `/var/lib/larenest`, hardened systemd unit, and a `larenest` command wrapper. The packer builds `larenest-server-<version>.tar.gz` for releases. |
| `docs/LINUX.md` | Linux guide (Docker, installer, desktop, Tailscale, environment variables). It's also published at larenest.app/linux. |
| `desktop/` | Electron app (Windows, Mac, Linux AppImage/.deb). `main.js` (process control, tray, IPC, certificate pins), `runner.js` (runs `server.js` in a child process), `preload.js` (`window.FDApp`), `ui/` (host, setup and connect windows). |
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
- `enc_meta`: optional encryption at rest — the data key wrapped by the password and by the recovery key (`core/crypt.js`). When on, `docs.json`, `files.data`, `seed.json` and `activity.summary` are stored AES-256-GCM encrypted (`enc1:` text, `LNE1` bytes); reads decrypt in a `db.prepare` wrapper and writes encrypt at their call sites. Locked → every data API answers 423 and background jobs pause.
- `tls_self`: this PC's HTTPS certificate and key, kept in the database so backups keep phones paired.

Collections (`core/books.js`): `imports` (statement batches, with `source`, `fileRows`, `skipped` and an optional `reconcile` record), `manual`, `edits`, `rules`, `budgets`, `accounts`, `goals`, `holdings`, `prefs` (per-book settings as JSON, including assets/vehicles, the watchlist, `settlements` and forecast `schedules`), `shares` (values shared from a personal book into a shared one), `receipts`.

Receipt inbox entries have an empty `txKey` until matched. `public/receipt.js` matches an unambiguous expense using vendor, amount (respecting whether the tip is included), and a three-day date window; the dashboard runs this after data loads. Receipt edits and attachments use a compare-and-set endpoint, and discarding an unattached receipt removes its file only if no other receipt references it.

Business features (docs/BUSINESS.md) add `biz`, `bizPct` and `schedC` to edits and rules, and keep their settings in prefs (`business`, `mileage-YYYY`, `bizyear-YYYY`); the totals come from `businessSummary` in `calcs.js`.

Everything the dashboard shows is calculated in the browser by `public/calcs.js` from these raw collections. The digest and widget summaries run the same `calcs.js` on the server (via `vm`), so numbers match everywhere.

Files kept next to the database (private, mode 600, not in backups):
- `api-keys.json`: market and economy keys.
- `simplefin.json`: bank-sync connections.
- `banklink-keys.json`: the user's own Plaid keys.
- `config.json`: mode, port, server id, cloud backup folder, last version, last backup check.

Server environment variables:
- `DATA_DIR`, `PORT`, `HOST`.
- `LARENEST_ADDRESSES`: the addresses shown in QR codes and links. Needed behind Docker bridge networking, where the container only sees its internal IP.
- `LARENEST_ADMIN_USER` / `LARENEST_ADMIN_PASSWORD`: create the first login on a headless first run.
- `tls/`: certificate files.

## 4. Security model

- **Sign-in:**
  - Passwords are hashed with scrypt.
  - Sessions are random 32-byte tokens in an `HttpOnly; SameSite=Strict` cookie, marked `Secure` on HTTPS.
  - Login and invite attempts are rate-limited per IP.
  - Each API call checks book membership and role; view-only members can't write.
- **Server owner:** the first user created. Only the owner can change Plaid keys and encryption settings.
- **Encryption at rest (optional):** scrypt-derived keys wrap a random data key; the recovery key is shown once. "Unlock automatically" keeps a key file in `~/.larenest-keys` (or `HF_KEY_DIR`), outside the data folder, so copies and backups still need the password. Servers can unlock with `HF_ENC_PASSWORD`.
- **Forgotten passwords:** the owner can reset any login's password from the PC app (Host options), on the basis that they have the computer. For self-hosting, `node server.js passwd <name>` does the same; it's `larenest passwd <name>` after the Linux installer and `docker exec -it larenest node server.js passwd <name>` in Docker. A reset signs that login out everywhere.
- **First login on headless servers:** created from the command line, or once from `LARENEST_ADMIN_USER` / `LARENEST_ADMIN_PASSWORD`. Those are ignored once any login exists.
- **Transport:**
  - **One port, two protocols:** the server peeks at each connection's first byte. `0x16` is a TLS handshake and goes to HTTPS; anything else goes to HTTP.
  - **HTTPS-only for other devices (default):** plain HTTP from a non-loopback address gets a 307 redirect to `https://` for pages and a 403 for the API. `/api/ping` stays open, because the apps use it to discover and pin the certificate. Loopback (the desktop app's own window) can always use HTTP. The Host options toggle or `LARENEST_ALLOW_HTTP=1` re-allows HTTP. `X-Forwarded-Proto` is only trusted with `LARENEST_TRUST_PROXY=1`.
  - **This PC's own certificate:** made once and pinned by the apps through its SHA-256 fingerprint. The fingerprint comes in the QR code (`/?fp=…`), or is trusted on first use when the user types the address.
    - **Android:** pinned in the WebView (`onReceivedSslError`) and in the widget refresh's `HttpsURLConnection`.
    - **Electron:** pinned through the `certificate-error` handler.
  - **Certificate changes:** if the fingerprint changes, the connect screen warns before continuing.
  - **Tailscale:** when Tailscale HTTPS certificates are enabled, the PC also serves a publicly trusted certificate for its `.ts.net` name (chosen by SNI). On a Linux service, this needs `tailscale set --operator=larenest`. In Docker, `tailscale serve` on the host provides it instead.
- **Bank data:**
  - SimpleFIN and Plaid are read-only, and bank passwords go only to those services.
  - New accounts wait for the user to review and Save before anything is imported.
- **Outside services:** they receive only stock symbols, a VIN, or the user's own API key, never financial data.
- **Content-Security-Policy:** limits scripts to the app itself and Plaid Link.
- **Phone:**
  - Phone-only data lives in the app's private storage.
  - The JavaScript bridge exposed to pages loaded from the PC (`LarenestWidgetNative`) can only save the widget summary, set the refresh schedule and ask for notification permission.
  - Certificate pinning goes through the Capacitor plugin, which only the app's own local pages can call.

## 4a. Data integrity rules

- **Restore** (`core/books.js` `restore`):
  - It stages everything first and gives documents and photos new IDs.
  - It remaps `txKey` (`i:<import>:<row>`, `m:<manual>`) in edits and receipts, and `fileId` in receipts.
  - It requires a successful safety copy (with photos on phones), then replaces documents and photos in one transaction (`store.replaceBook`).
  - A backup without `files` keeps the book's current photos.
- **Duplicates** (`public/calcs.js` `makeDupeChecker`, shared by totals, import preview and save):
  - Duplicates are judged per account. Rows with the bank's own ID (OFX `FITID`, provider IDs scoped as `provider:account:id`) match by ID.
  - For rows without an ID, each statement counts its own identical rows, and an overlapping statement only adds rows beyond those already counted.
  - Bank sync applies the same rule before saving.
- **Imports:** a statement is saved whole or refused. The limit is `MAX_IMPORT_ROWS` = 5,000, and it's never trimmed.
- **Loading:** `public/runtime.js` numbers each load, and only the newest one updates the screen. Writes stay with the dashboard they started in.
- **Undo an import** (`POST /api/books/<id>/undo-import`, `core/books.js` `undoImport`):
  - The request names the import plus the edit and receipt IDs the user ticked. Anything else that points at the import is left alone.
  - If the ticked list no longer matches what's stored, it's refused (409), so the preview is always what gets removed.
  - Removal runs in one transaction (`store.removeMany`, SQLite on the host, IndexedDB on phones), photos included.
- **Statement reconciliation** (`public/calcs.js` `reconcileStatement`): works in cents. Deposit accounts: closing = opening − money out + money in. Credit accounts: closing = opening + purchases − payments. It only reports; nothing is posted to the ledger. The result is saved on the import as `reconcile`.
- **Settlements** (`settlementStatement`, `settlementBalances`): a closed period stores each person's paid-minus-share as totals. Payments are separate records that move balances between people and never enter `txns`.
- **Layout** (`public/page.js`, layout block): the `layout` pref is `{ v: 1, tabs: { <tab>: { tiles?: [id], items?: [{ id, size }] } } }`. A tab without `items` keeps the static HTML layout. A tab with `items` is drawn on the same 12-column grid as ★ report tabs. Sections are moved into the grid and back home through comment markers. Tiles come from a registry: the five original cards are moved into place as they are; the others are generic number tiles computed from the same data the sections use.
- **Custom reports** (`public/calcs.js` `customReport`, the `customs` pref): a spec (measure, grouping, time, filters, top N, chart type) runs against `txns` or `balances` in cents. Each saved spec becomes a `section#cr-<id>` that Arrange and report tabs can place, plus a `cr:<id>` tile. Deleting a spec removes it from every layout and report.
- **Forecast schedules** (`scheduleOccurrences`, `mergeForecast`): occurrences come from a start date and repeat rule, with per-occurrence skip or move overrides. A confirmed item replaces the estimate named in `replaces`. Schedules live in `prefs` and never enter `txns`.

## 5. Backups

- **On the PC:**
  - **Daily backups:** a `VACUUM INTO` copy in `backups/`, keeping the newest 30.
  - **Update backups:** another one the first time a new version starts, before it's used.
  - **Cloud copies (optional):** the newest 14 are also copied to a cloud-synced folder (OneDrive, iCloud Drive and so on).
  - **Restoring:** stop hosting, copy a backup over `finance.db`, start again. The steps are shown in Host options.
- **Phone-only:** "Download backup" exports a file. The phone-only restore uses the same `core/books.js` validation as the server. Daily in-app snapshots leave photos out; the one taken before a restore keeps them.
- **Backup health:**
  - `GET /api/backup-health` reports server copies, the cloud folder and the last check. Folder paths are shown to the owner only. Phone-only mode answers from its snapshots instead.
  - `POST /api/backup-health/check` (owner only) opens the newest copy read-only and runs `PRAGMA integrity_check` plus counts.
  - `POST /api/books/<id>/verify-backup` stages a JSON backup exactly like a restore and stops before writing anything.

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

1. Bump the versions in `desktop/package.json`, `mobile/package.json` and the root `package.json`. The root version is the server version shown in diagnostics, used in the Docker image tag and in the server tarball name.
2. Add `## Desktop x` / `## Android x` sections to `CHANGELOG.md`.
3. Push `main` to the `release` branch. These build automatically:
   - **Windows:** the installer.
   - **Linux:** AppImage and .deb for x86-64 and ARM64, plus `larenest-server-<version>.tar.gz` and `install-linux.sh`, all added to the same release.
   - **Docker:** `ghcr.io/<owner>/larenest:<version>` and `:latest`, multi-arch, with a smoke test.
   - **Android.**

   Linux builds use 1× minutes. The desktop workflow's `linux_test` input and the Docker workflow's `push=false` input build without publishing.
4. Mac (`desktop-release.yml` with `mac_publish`) and iOS (`ios-release.yml`) run **only by hand**, because macOS minutes cost 10×. Hold them until the app is on the iOS App Store.

Installers are published to the public `household_finances-releases` repo, which also serves larenest.app (`docs/`), including `/privacy`, `/testers`, `/linux`, `/download` and `/install.sh` (a copy of `scripts/install-linux.sh`; keep the two in step). The GHCR package `larenest` must be set to **Public** once in GitHub → Packages so people can pull it without signing in.

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
6. **Linux packaging:** the installer script (runs as root: download verification, file permissions, the systemd hardening), and the Docker image (non-root user, volume permissions).

**Known gaps:**
- There's no automated UI testing.
- `public/page.js` is large (about 3,800 lines) and would benefit from being split up.
- Phone-only mode on iOS isn't built yet.
