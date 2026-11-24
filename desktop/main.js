// Larenest desktop app (Electron).
// - "This computer" role: runs the finance server in a background process and shows it in a window.
//   Tray icon: open, allow other devices on/off, start/stop, phone addresses, Tailscale status, start with Windows.
// - "Connect to another computer" role: opens the connect screen and then that server's pages.
'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog, clipboard, powerSaveBlocker } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { fork, execFile } = require('node:child_process');
let autoUpdater = null; try { ({ autoUpdater } = require('electron-updater')); } catch {} // missing only when running from source without npm install

// The app was called "Household Finances" before it became Larenest: keep using that settings folder so nothing is lost.
{ const old = path.join(app.getPath('appData'), 'Household Finances'); try { if (fs.existsSync(path.join(old, 'desktop.json'))) app.setPath('userData', old); } catch {} }
const HIDDEN = process.argv.includes('--hidden'); // launched at sign-in: stay in the tray
if (!app.requestSingleInstanceLock()) { app.quit(); }

// ---------- desktop settings (separate from the server's own data) ----------
const SET_FILE = () => path.join(app.getPath('userData'), 'desktop.json');
const DEF = { role: '', mode: 'local', port: 8080, dataDir: '', remoteUrl: '', startWithWindows: false };
let S = { ...DEF };
const loadSet = () => { try { S = { ...DEF, ...JSON.parse(fs.readFileSync(SET_FILE(), 'utf8')) }; } catch { S = { ...DEF }; } };
const saveSet = () => { fs.mkdirSync(path.dirname(SET_FILE()), { recursive: true }); fs.writeFileSync(SET_FILE(), JSON.stringify(S, null, 2)); };
const defaultDataDir = () => {
  const h = app.getPath('home');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), 'HouseholdFinances');
  if (process.platform === 'darwin') return path.join(h, 'Library', 'Application Support', 'HouseholdFinances');
  return path.join(process.env.XDG_DATA_HOME || path.join(h, '.local', 'share'), 'household-finances');
};

// ---------- where things are (packaged vs. running from source) ----------
const RES = app.isPackaged ? process.resourcesPath : __dirname;
// The install folder is deleted and rebuilt on every update, so data must never live inside it.
const INSTALL_DIR = path.dirname(app.getPath('exe'));
const insideInstall = (d) => { if (!app.isPackaged || !d) return false; const rel = path.relative(INSTALL_DIR.toLowerCase(), path.resolve(d).toLowerCase()); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
function rescueDataDir() { // older setups could pick a folder inside the app; move it out before anything else runs
  if (!insideInstall(S.dataDir)) return;
  const from = S.dataDir, to = defaultDataDir();
  try { if (fs.existsSync(path.join(from, 'finance.db')) && !fs.existsSync(path.join(to, 'finance.db'))) fs.cpSync(from, to, { recursive: true }); } catch {}
  S.dataDir = ''; saveSet();
  dialog.showMessageBox({ type: 'warning', message: 'Your data folder was moved', detail: `It was inside the app's own folder (${from}), which updates replace. From now on your data is kept in ${to}.` }).catch(() => {});
}
const nodeBin = () => { const f = path.join(RES, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'); return fs.existsSync(f) ? f : (process.env.FD_NODE || 'node'); };
const serverFile = () => { const f = path.join(RES, 'app-server', 'server.js'); return fs.existsSync(f) ? f : path.join(__dirname, '..', 'server.js'); };
const ICON = path.join(__dirname, 'icons', process.platform === 'win32' ? 'app.ico' : 'icon-512.png');
const TRAY_ICON = path.join(__dirname, 'icons', 'tray-32.png');

// ---------- server process ----------
let child = null, ready = null, seq = 0, INFO = { running: false };
const pending = new Map();
function spawnServer() {
  if (child) return ready;
  ready = new Promise((resolve, reject) => {
    child = fork(path.join(RES, 'runner.js'), [], {
      execPath: nodeBin(), stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FD_APPMODE: '1', FD_SERVER: serverFile(), DATA_DIR: S.dataDir || defaultDataDir(), NODE_NO_WARNINGS: '1' },
    });
    const log = path.join(app.getPath('userData'), 'server.log'), out = fs.createWriteStream(log, { flags: 'a' });
    child.stdout.pipe(out); child.stderr.pipe(out);
    child.on('message', (m) => {
      if (m.type === 'ready') resolve(m);
      else if (m.type === 'fatal') reject(new Error(m.error));
      else if (m.type === 'reply') { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.ok ? p.res(m.value) : p.rej(new Error(m.value)); } }
    });
    child.on('error', (e) => reject(new Error(`Couldn't start the server: ${e.message}`)));
    child.on('exit', () => { const was = INFO.running; child = null; ready = null; INFO = { running: false }; keepAwake(); autoRestart(was); for (const p of pending.values()) p.rej(new Error('Server stopped')); pending.clear(); buildTray(); });
  });
  return ready;
}
async function call(cmd, extra = {}) {
  await spawnServer();
  return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); child.send({ cmd, id, ...extra }); });
}
const refresh = async () => { try { INFO = await call('info'); } catch { INFO = { running: false }; } buildTray(); return INFO; };
let roWarned = false;
// If the server stops on its own (crash, or ended in Task Manager), start it again, up to 3 times a minute.
let intentional = false, restarts = [];
function autoRestart(wasRunning) {
  if (intentional || quitting || !wasRunning || S.role !== 'host') { intentional = false; return; }
  restarts = restarts.filter((t) => Date.now() - t < 60e3); if (restarts.length >= 3) return; restarts.push(Date.now());
  setTimeout(() => { startServer().catch(() => {}); }, 1500);
}
let awake = null; // a sleeping computer can't serve your phone, so stay awake while other devices may connect (Host options can turn this off)
const keepAwake = () => { const want = INFO.running && S.mode === 'host' && S.keepAwake !== false; if (want && awake == null) awake = powerSaveBlocker.start('prevent-app-suspension'); else if (!want && awake != null) { powerSaveBlocker.stop(awake); awake = null; } };
async function startServer() {
  INFO = await call('start', { opts: { mode: S.mode, port: S.port } }); buildTray(); keepAwake();
  if (INFO.writable === false && !roWarned) { roWarned = true; dialog.showMessageBox({ type: 'warning', message: "Larenest can't save to its data folder", detail: INFO.writeHelp + '\n\nYou can also pick a different folder: tray → Change setup.', buttons: ['Open data folder', 'OK'] }).then((r) => { if (r.response === 0) shell.openPath(S.dataDir || defaultDataDir()); }); }
  return INFO;
}
async function stopServer() { if (child) { INFO = await call('stop'); keepAwake(); buildTray(); } return INFO; }

// ---------- Tailscale (status only; turning it on/off is done in Tailscale itself) ----------
let TS = { installed: false };
function tailscale() {
  const exe = process.platform === 'win32' ? ['C:\\Program Files\\Tailscale\\tailscale.exe', 'tailscale'] : ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale', 'tailscale'];
  const tryOne = (i) => { if (i >= exe.length) { TS = { installed: false }; buildTray(); return; }
    execFile(exe[i], ['status', '--json'], { timeout: 4000, windowsHide: true }, (err, out) => {
      if (err && err.code === 'ENOENT') return tryOne(i + 1);
      try { const j = JSON.parse(out); const me = j.Self || {}; TS = { installed: true, on: j.BackendState === 'Running', name: String(me.DNSName || '').replace(/\.$/, ''), ip: (me.TailscaleIPs || [])[0] || '' }; }
      catch { TS = { installed: true, on: false }; }
      buildTray();
    }); };
  tryOne(0);
}

// ---------- windows ----------
let win = null, tray = null, quitting = false;
function makeWindow() {
  if (win) return win;
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 380, minHeight: 500, show: false, icon: ICON, title: 'Larenest', backgroundColor: '#1f2a37', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true } });
  // the dashboard tab is a <webview>: only allow it to show the local server, and open outside links in the browser
  win.webContents.on('will-attach-webview', (_e, wp, params) => { delete wp.preload; wp.nodeIntegration = false; wp.contextIsolation = true; if (params.src && !/^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(params.src)) _e.preventDefault(); });
  win.webContents.on('did-attach-webview', (_e, wc) => wc.setWindowOpenHandler(({ url }) => { if (/^(https?|mailto):/.test(url)) shell.openExternal(url); return { action: 'deny' }; }));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?|mailto):/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', (e) => { if (!quitting && S.role === 'host') { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => { if (S.role === 'remote' && /^https?:/.test(url)) win.loadFile(path.join(__dirname, 'ui', 'connect.html'), { query: { failed: url } }); });
  return win;
}
function show() { const w = makeWindow(); if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
async function openDashboard() {
  const w = makeWindow();
  if (!S.role) await w.loadFile(path.join(__dirname, 'ui', 'setup.html'));
  else if (S.role === 'remote') await (S.remoteUrl ? w.loadURL(S.remoteUrl + '/') : w.loadFile(path.join(__dirname, 'ui', 'connect.html')));
  else {
    try { if (!INFO.running) await startServer(); await w.loadFile(path.join(__dirname, 'ui', 'host.html')); }
    catch (e) { dialog.showErrorBox('Larenest', `${e.message}\n\nIf another copy of the server is running (for example your self-hosted one), stop it or pick a different port under Tray → Change setup.`); await w.loadFile(path.join(__dirname, 'ui', 'setup.html')); }
  }
  if (!HIDDEN || !S.role) show();
}

// ---------- tray ----------
function buildTray() {
  notifyHost();
  if (S.role !== 'host') { if (tray) { tray.destroy(); tray = null; } return; }
  if (!tray) { tray = new Tray(nativeImage.createFromPath(TRAY_ICON)); tray.setToolTip('Larenest'); tray.on('click', show); }
  const on = !!INFO.running, others = on && INFO.mode === 'host';
  const addrs = others ? [...(INFO.lan || []), ...(TS.on && TS.name ? [`${INFO.tlsFp ? 'https' : 'http'}://${TS.name}:${INFO.port}`] : []), ...(TS.on && TS.ip ? [`${INFO.tlsFp ? 'https' : 'http'}://${TS.ip}:${INFO.port}`] : [])] : [];
  const tsItem = !TS.installed ? { label: 'Get Tailscale (to connect away from home)…', click: () => shell.openExternal('https://tailscale.com/download') }
    : { label: TS.on ? `Tailscale: on${TS.name ? ' · ' + TS.name : ''}` : 'Tailscale: off — open Tailscale to turn it on', enabled: !TS.on, click: () => shell.openExternal('https://login.tailscale.com/admin/machines') };
  tray.setToolTip(`Larenest · ${on ? (others ? 'hosting for other devices' : 'this computer only') : 'stopped'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open dashboard', click: () => openDashboard() },
    { type: 'separator' },
    { label: on ? (others ? '● Running · other devices can connect' : '● Running · this computer only') : '○ Stopped', enabled: false },
    on ? { label: 'Stop server', click: () => stopServer().catch((e) => dialog.showErrorBox('Stop failed', e.message)) }
       : { label: 'Start server', click: () => startServer().then(() => win && win.loadFile(path.join(__dirname, 'ui', 'host.html'))).catch((e) => dialog.showErrorBox('Start failed', e.message)) },
    { label: 'Allow other devices (phone, other PCs)', type: 'checkbox', checked: S.mode === 'host', click: async (it) => {
        S.mode = it.checked ? 'host' : 'local'; saveSet();
        try { if (child) INFO = await call('setMode', { mode: S.mode, port: S.port }); } catch (e) { dialog.showErrorBox('Change failed', e.message); }
        buildTray(); keepAwake(); if (it.checked) maybeFirewallNote(); } },
    { label: 'Phone & other device addresses', enabled: addrs.length > 0, submenu: addrs.length ? addrs.map((a) => ({ label: `Copy ${a}`, click: () => clipboard.writeText(a) })) : [{ label: 'none', enabled: false }] },
    tsItem,
    { type: 'separator' },
    { label: process.platform === 'darwin' ? 'Open at login' : process.platform === 'linux' ? 'Start at login' : 'Start with Windows', type: 'checkbox', checked: !!S.startWithWindows, click: (it) => { S.startWithWindows = it.checked; saveSet(); loginItem(); } },
    { label: 'Back up now', enabled: on, click: async () => { try { const f = await call('backup'); dialog.showMessageBox({ message: 'Backup saved', detail: f }); } catch (e) { dialog.showErrorBox('Backup failed', e.message); } } },
    { label: 'Open data folder', click: () => shell.openPath(S.dataDir || defaultDataDir()) },
    { label: `Check for updates… (v${app.getVersion()})`, click: () => checkUpdates(true) },
    { label: 'Change setup…', click: async () => { show(); await win.loadFile(path.join(__dirname, 'ui', 'setup.html')); } },
    { type: 'separator' },
    { label: 'Quit (stops the server)', click: () => { quitting = true; app.quit(); } },
  ]));
}
let fwShown = false;
function maybeFirewallNote() { if (fwShown || process.platform !== 'win32') return; fwShown = true;
  dialog.showMessageBox({ type: 'info', message: 'Other devices can now connect', detail: 'If Windows asks whether to allow "Node.js" through the firewall, choose Private networks so your phone can reach it at home. Away from home, use Tailscale.' }); }
const loginItem = () => {
  if (process.platform === 'linux') { // freedesktop autostart: ~/.config/autostart/larenest.desktop
    try { const dir = path.join(process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config'), 'autostart'), f = path.join(dir, 'larenest.desktop');
      if (S.startWithWindows) { fs.mkdirSync(dir, { recursive: true }); const exe = process.env.APPIMAGE || process.execPath;
        fs.writeFileSync(f, `[Desktop Entry]\nType=Application\nName=Larenest\nExec="${exe}" --hidden\nIcon=larenest\nX-GNOME-Autostart-enabled=true\nComment=Keeps your Larenest server running\n`); }
      else fs.rmSync(f, { force: true }); } catch {}
    return; }
  try { app.setLoginItemSettings({ openAtLogin: !!S.startWithWindows, args: ['--hidden'] }); } catch {} };

// ---------- setup + connect screens (preload.js) ----------
ipcMain.handle('fd:defaults', () => ({ ...S, defaultDataDir: defaultDataDir(), dataDir: S.dataDir || defaultDataDir() }));
ipcMain.handle('fd:pickFolder', async () => { const r = await dialog.showOpenDialog(win, { title: 'Choose the data folder', properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? '' : r.filePaths[0]; });
ipcMain.handle('fd:hasData', (_e, dir) => fs.existsSync(path.join(dir || defaultDataDir(), 'finance.db')));
// can this Windows user change files in the folder (and the database, if there is one)?
ipcMain.handle('fd:canWrite', (_e, dir) => {
  const d = dir || defaultDataDir(), probe = path.join(d, '.write-test-' + process.pid);
  try { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe); } catch { return false; }
  const db = path.join(d, 'finance.db');
  try { if (fs.existsSync(db)) { try { fs.accessSync(db, fs.constants.W_OK); } catch { fs.chmodSync(db, 0o666); fs.accessSync(db, fs.constants.W_OK); } } } catch { return false; }
  return true;
});
ipcMain.handle('fd:startHost', async (_e, o) => {
  if (insideInstall(o.dataDir)) throw new Error('Pick a folder outside the app\u2019s own folder (' + INSTALL_DIR + '). Updates replace everything in there, including your data.');
  const dir = o.dataDir || defaultDataDir(), restart = child && (dir !== (S.dataDir || defaultDataDir()));
  S = { ...S, role: 'host', mode: o.mode === 'host' ? 'host' : 'local', port: Number(o.port) || 8080, dataDir: dir === defaultDataDir() ? '' : dir, startWithWindows: !!o.startWithWindows };
  saveSet(); loginItem();
  if (restart) { (intentional = true, await call('quit').catch(() => {})); await new Promise((r) => setTimeout(r, 300)); }
  if (INFO.running) await stopServer();
  await startServer(); tailscale();
  return { ...INFO, books: await call('books') };
});
ipcMain.handle('fd:addUser', (_e, o) => call('addUser', o));
ipcMain.handle('fd:logins', () => call('logins'));
ipcMain.handle('fd:resetPassword', (e, o) => { if (!e.senderFrame || !/^file:/.test(e.senderFrame.url)) throw new Error('Not allowed'); return call('resetPassword', { name: o && o.name, password: o && o.password }); });
ipcMain.handle('fd:openDashboard', async () => { await openDashboard(); return true; });
ipcMain.handle('fd:useRemote', async () => { if (child) (intentional = true, await call('quit').catch(() => {})); S.role = 'remote'; saveSet(); buildTray(); await win.loadFile(path.join(__dirname, 'ui', 'connect.html')); });
ipcMain.handle('fd:openHost', async (_e, url) => { S.role = 'remote'; S.remoteUrl = String(url).replace(/\/+$/, ''); saveSet(); await win.loadURL(S.remoteUrl + '/'); });
ipcMain.handle('fd:setupAgain', async () => { await win.loadFile(path.join(__dirname, 'ui', 'setup.html')); });

// ---------- updates (GitHub Releases) ----------
// New versions are published as GitHub releases; the app checks once a day and from the tray.
// Nothing downloads without asking. Your data folder is never touched by an update.
let updBusy = false, updManual = false;
function setupUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = false; autoUpdater.autoInstallOnAppQuit = true;
  // The releases repo also holds Android builds; point straight at GitHub's "latest" release (always the desktop one)
  // so an Android release published afterwards can't hide latest.yml.
  try { const pub = require('./package.json').build.publish[0]; autoUpdater.setFeedURL({ provider: 'generic', url: `https://github.com/${pub.owner}/${pub.repo}/releases/latest/download` }); } catch {}
  autoUpdater.on('update-available', async (i) => {
    if (process.platform === 'darwin') { updBusy = false; const pub = require('./package.json').build.publish[0]; const r = await dialog.showMessageBox({ type: 'info', message: `Version ${i.version} is available`, detail: 'On a Mac, download the new version from the releases page and drag it into Applications (replace the old one). Your data stays where it is.', buttons: ['Open download page', 'Later'] }); if (r.response === 0) shell.openExternal(`https://github.com/${pub.owner}/${pub.repo}/releases/latest`); return; }
    const r = await dialog.showMessageBox({ type: 'info', buttons: ['Download now', 'Later'], defaultId: 0, message: `Version ${i.version} is available`, detail: `You have ${app.getVersion()}.${i.releaseNotes ? '\n\n' + String(i.releaseNotes).replace(/<[^>]+>/g, '').slice(0, 600) : ''}` });
    if (r.response === 0) autoUpdater.downloadUpdate(); else updBusy = false;
  });
  autoUpdater.on('update-not-available', () => { updBusy = false; if (updManual) dialog.showMessageBox({ type: 'info', message: "You're up to date", detail: `Version ${app.getVersion()}` }); });
  autoUpdater.on('error', (e) => { updBusy = false; if (updManual) dialog.showErrorBox("Couldn't check for updates", String((e && e.message) || e).split('\n')[0]); });
  autoUpdater.on('update-downloaded', async (i) => {
    updBusy = false;
    const r = await dialog.showMessageBox({ type: 'info', buttons: ['Restart now', 'When I quit'], defaultId: 0, message: `Version ${i.version} is ready`, detail: 'Restarting briefly stops the server; it starts again right after.' });
    // stop the built-in server first and wait for it to exit: a running server keeps files locked and the installer then fails
    // Stop the server first and mark it stopped, so nothing delays or cancels the quit while the installer waits for the
    // app to close (a silent installer that finds the app still running just gives up). The installer runs with its
    // normal window so any problem is visible, then reopens Larenest. If anything still holds the app open, exit anyway.
    if (r.response === 0) { quitting = true; await stopChild(); stopped = true; setImmediate(() => { autoUpdater.quitAndInstall(false, true); setTimeout(() => app.exit(0), 4000); }); }
  });
  setTimeout(() => checkUpdates(false), 30e3); setInterval(() => checkUpdates(false), 24 * 3600e3);
}
function checkUpdates(manual) {
  if (!autoUpdater || !app.isPackaged) { if (manual) dialog.showMessageBox({ message: 'Updates work in the installed app', detail: 'You are running from source (npm start).' }); return; }
  if (updBusy) return; updBusy = true; updManual = manual;
  autoUpdater.checkForUpdates().catch(() => { updBusy = false; });
}
ipcMain.handle('fd:checkUpdates', () => checkUpdates(true));

// ---------- the computer's own sleep setting (shown in Host options, with a button to its settings page) ----------
let SLEEP = { known: false };
function readSleep() {
  const { execFile } = require('node:child_process');
  const done = (o) => { SLEEP = { known: true, ...o }; notifyHost(); };
  try {
    if (process.platform === 'win32') execFile('powercfg', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE'], { timeout: 5000, windowsHide: true }, (e, out) => {
      if (e) return; const ac = /Current AC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(out), dc = /Current DC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(out);
      done({ pluggedMin: ac ? Math.round(parseInt(ac[1], 16) / 60) : null, batteryMin: dc ? Math.round(parseInt(dc[1], 16) / 60) : null }); });
    else if (process.platform === 'darwin') execFile('pmset', ['-g'], { timeout: 5000 }, (e, out) => { if (e) return; const m = /^\s*sleep\s+(\d+)/m.exec(out); done({ pluggedMin: m ? Number(m[1]) : null, batteryMin: null }); });
  } catch {}
}
const openSleepSettings = () => process.platform === 'linux' ? null : shell.openExternal(process.platform === 'darwin' ? 'x-apple.systempreferences:com.apple.Lock-Screen-Settings.extension' : 'ms-settings:powersleep');

// ---------- host options tab (same controls as the tray, for remote desktops / virtual displays) ----------
// ---------- backups to a cloud folder: find the folders that OneDrive, iCloud Drive, Google Drive or Dropbox keep in sync ----------
let CLOUD = { dir: '', last: '', error: '' };
function cloudFolders() {
  const h = require('node:os').homedir(), out = [], add = (name, p) => { try { if (p && fs.statSync(p).isDirectory() && !out.some((x) => x.path === p)) out.push({ name, path: p }); } catch {} };
  if (process.platform === 'win32') {
    add('OneDrive', process.env.OneDrive); add('OneDrive', path.join(h, 'OneDrive')); add('iCloud Drive', path.join(h, 'iCloudDrive')); add('Dropbox', path.join(h, 'Dropbox'));
    for (const d of 'DEFGHIJKLMNOPQRSTUVWXYZ') add('Google Drive', `${d}:\\My Drive`);
    add('Google Drive', path.join(h, 'Google Drive', 'My Drive')); add('Google Drive', path.join(h, 'My Drive'));
  } else if (process.platform === 'darwin') {
    add('iCloud Drive', path.join(h, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'));
    try { for (const f of fs.readdirSync(path.join(h, 'Library', 'CloudStorage'))) { const p = path.join(h, 'Library', 'CloudStorage', f);
      if (/^GoogleDrive/i.test(f)) add('Google Drive', fs.existsSync(path.join(p, 'My Drive')) ? path.join(p, 'My Drive') : p); else if (/^OneDrive/i.test(f)) add('OneDrive', p); else if (/^Dropbox/i.test(f)) add('Dropbox', p); } } catch {}
    add('Dropbox', path.join(h, 'Dropbox'));
  } else { // Linux: the usual sync-client folders
    add('Dropbox', path.join(h, 'Dropbox')); add('Nextcloud', path.join(h, 'Nextcloud')); add('OneDrive', path.join(h, 'OneDrive')); add('pCloud', path.join(h, 'pCloudDrive')); add('Google Drive', path.join(h, 'GoogleDrive')); add('Syncthing', path.join(h, 'Sync'));
  }
  return out;
}
const refreshCloud = async () => { if (child) { try { CLOUD = await call('cloudInfo'); } catch {} } };
const hostState = () => {
  const on = !!INFO.running, others = on && INFO.mode === 'host';
  return { fp: INFO.tlsFp || '', tsHttps: INFO.tsHttps || null, version: app.getVersion(), running: on, mode: S.mode, port: INFO.port || S.port, url: INFO.url || '', dataDir: S.dataDir || defaultDataDir(), startWithWindows: !!S.startWithWindows, keepAwake: S.keepAwake !== false, sleep: SLEEP, cloud: CLOUD, cloudFolders: cloudFolders(), tsSeen: INFO.tsSeen || 0, platform: process.platform, writable: INFO.writable !== false, writeHelp: INFO.writeHelp || '',
    addrs: others ? [...new Set([...(INFO.lan || []).filter((u) => !/\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(u)), ...(INFO.tsHttps && INFO.tsHttps.url ? [INFO.tsHttps.url] : []), ...(TS.on && TS.name ? [`${INFO.tlsFp ? 'https' : 'http'}://${TS.name}:${INFO.port}`] : []), ...(TS.on && TS.ip ? [`${INFO.tlsFp ? 'https' : 'http'}://${TS.ip}:${INFO.port}`] : [])])] : [],
    addrLabels: Object.fromEntries([...(INFO.tsHttps && INFO.tsHttps.url ? [[INFO.tsHttps.url, 'Away from home, works in any browser with no warning (Tailscale HTTPS)']] : []), ...(INFO.lan || []).map((u) => [u, 'On your home network']), ...(TS.name ? [[`${INFO.tlsFp ? 'https' : 'http'}://${TS.name}:${INFO.port}`, 'Away from home (Tailscale name)']] : []), ...(TS.ip ? [[`${INFO.tlsFp ? 'https' : 'http'}://${TS.ip}:${INFO.port}`, 'Away from home (Tailscale number, same as the name)']] : [])]), ts: TS };
};
const notifyHost = () => { try { if (win && !win.isDestroyed()) win.webContents.send('fd:hostChanged', hostState()); } catch {} };
// HTTPS to another Larenest computer: trust its own certificate only if it's the one pinned from the connect screen
const pinFile = () => path.join(app.getPath('userData'), 'tls-pins.json');
const pins = () => { try { return JSON.parse(fs.readFileSync(pinFile(), 'utf8')) || []; } catch { return []; } };
ipcMain.handle('fd:trustCert', (e, host, fp) => {
  if (!e.senderFrame || !/^file:/.test(e.senderFrame.url) || !/^[0-9A-F]{64}$/i.test(String(fp || ''))) return false;
  const l = [...new Set([String(fp).toUpperCase(), ...pins()])].slice(0, 20); try { fs.writeFileSync(pinFile(), JSON.stringify(l)); } catch {} return true;
});
app.on('certificate-error', (event, _wc, _url, _err, cert, cb) => {
  let fp = ''; try { fp = require('crypto').createHash('sha256').update(Buffer.from(String(cert.data).replace(/-----[^-]+-----|\s/g, ''), 'base64')).digest('hex').toUpperCase(); } catch {}
  if (fp && pins().includes(fp)) { event.preventDefault(); cb(true); } else cb(false);
});
ipcMain.handle('fd:hostState', async () => { readSleep(); if (child) { await refresh().catch(() => {}); await refreshCloud(); } return hostState(); });
ipcMain.handle('fd:hostAction', async (_e, act, arg) => {
  switch (act) {
    case 'start': await startServer(); break;
    case 'stop': await stopServer(); break;
    case 'mode': S.mode = arg ? 'host' : 'local'; saveSet(); if (child) INFO = await call('setMode', { mode: S.mode, port: S.port }); buildTray(); if (arg) maybeFirewallNote(); break;
    case 'startWithWindows': S.startWithWindows = !!arg; saveSet(); loginItem(); buildTray(); break;
    case 'keepAwake': S.keepAwake = !!arg; saveSet(); keepAwake(); break;
    case 'sleepSettings': openSleepSettings(); setTimeout(readSleep, 15000); break;
    case 'backup': { const r = await call('backup'); await refreshCloud(); notifyHost(); return r; }
    case 'cloudSet': { CLOUD = await call('setCloud', { dir: arg || '' }); notifyHost(); return hostState(); }
    case 'cloudPick': { const r = await dialog.showOpenDialog(win, { title: 'Choose a folder your cloud app keeps in sync', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled || !r.filePaths[0]) return hostState(); CLOUD = await call('setCloud', { dir: r.filePaths[0] }); notifyHost(); return hostState(); }
    case 'cloudOpen': if (CLOUD.target) shell.openPath(CLOUD.target); break;
    case 'openData': shell.openPath(S.dataDir || defaultDataDir()); break;
    case 'copy': clipboard.writeText(String(arg || '')); break;
    case 'tailscale': shell.openExternal(TS.installed ? 'https://login.tailscale.com/admin/machines' : 'https://tailscale.com/download'); break;
    case 'refreshTs': tailscale(); await new Promise((r) => setTimeout(r, 1500)); break;
    case 'updates': checkUpdates(true); break;
    case 'setup': await win.loadFile(path.join(__dirname, 'ui', 'setup.html')); return null;
    case 'quit': quitting = true; app.quit(); return null;
    default: throw new Error('unknown action');
  }
  return hostState();
});

// ---------- app lifecycle ----------
app.on('second-instance', () => openDashboard());
app.on('window-all-closed', () => { if (S.role !== 'host') app.quit(); });
// Wait for the server process to really end (up to 5 s, then force it), so nothing is left holding files open.
function stopChild() {
  return new Promise((resolve) => {
    const c = child; if (!c || c.exitCode !== null) return resolve();
    const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} resolve(); }, 5000);
    c.once('exit', () => { clearTimeout(t); resolve(); });
    try { c.send({ cmd: 'quit', id: 0 }); } catch { try { c.kill(); } catch {} }
  });
}
let stopped = false;
app.on('before-quit', (e) => { quitting = true; if (child && !stopped) { e.preventDefault(); stopChild().then(() => { stopped = true; app.quit(); }); } });
app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Help', submenu: [{ label: 'Check for updates…', click: () => checkUpdates(true) }, { label: 'Change setup…', click: async () => { show(); await win.loadFile(path.join(__dirname, 'ui', 'setup.html')); } }, { type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] }]));
  app.setAppUserModelId('com.householdfinances.desktop');
  loadSet(); rescueDataDir(); loginItem(); setupUpdates();
  if (S.role === 'host') { try { await startServer(); } catch {} tailscale(); setInterval(() => { tailscale(); refresh(); }, 60e3); }
  await openDashboard();
});
