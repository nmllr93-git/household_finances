# App groundwork (desktop + Android)

Shared pieces both apps use. Nothing here changes the self-hosted server.

## icons/
| File | Used by |
|---|---|
| `windows/app.ico` (16–256 px) | Electron installer and window icon |
| `windows/tray-16.png`, `tray-32.png` | System-tray icon (Start/Stop hosting) |
| `icon-512.png`, `icon-1024.png` | Electron (Linux/mac builds), store listings |
| `android/mipmap-*/ic_launcher.png` | Android launcher icon, all densities |
| `android/mipmap-*/ic_launcher_foreground.png` + `ic_launcher.xml` + `ic_launcher_background.xml` | Android adaptive icon (background #1F2A37) |
| `android/playstore-512.png` | Google Play listing |

To regenerate after changing `public/icons/icon-512.png`, rerun the icon script in the project notes (Pillow).

## connect.html (remote mode)
The first screen of the Android app (and the desktop app when it isn't the host).
- You type the server address (`192.168.1.20:8080`, a Tailscale name, or `https://…`); `http://` and `:8080` are added if left off.
- It calls `/api/ping` to confirm the address really is Household Finances, then opens the server's own pages, so sign-in works exactly like the browser.
- The last 5 addresses are remembered on the device only.
- If the app provides `window.FDApp.openHost(url)`, it's used instead of a plain page change (lets the app save the address natively).

## Server hooks already in place
- `require('./server.js')` → `start / stop / info / setMode / addUser` (see main README).
- `FD_APPMODE=1` → data goes in the per-user folder (Windows `%APPDATA%\HouseholdFinances`).
- `/api/ping` → `{ app: "household-finances", version }`, no login, no data.
- `public/store.js` → the single data connector; a future on-device backend plugs in with `FDStore.use(...)`.
