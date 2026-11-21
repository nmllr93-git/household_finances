// Household Finances desktop app (Electron).
// - "This computer" role: runs the finance server in a background process and shows it in a window.
//   Tray icon: open, allow other devices on/off, start/stop, phone addresses, Tailscale status, start with Windows.
// - "Connect to another computer" role: opens the connect screen and then that server's pages.
'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { fork, execFile } = require('node:child_process');
let autoUpdater = null; try { ({ autoUpdater } = require('electron-updater')); } catch {} // missing only when running from source without npm install

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
    child.on('exit', () => { child = null; ready = null; INFO = { running: false }; for (const p of pending.values()) p.rej(new Error('Server stopped')); pending.clear(); buildTray(); });
  });
  return ready;
}
async function call(cmd, extra = {}) {
  await spawnServer();
  return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); child.send({ cmd, id, ...extra }); });
}
const refresh = async () => { try { INFO = await call('info'); } catch { INFO = { running: false }; } buildTray(); return INFO; };
async function startServer() { INFO = await call('start', { opts: { mode: S.mode, port: S.port } }); buildTray(); return INFO; }
async function stopServer() { if (child) { INFO = await call('stop'); buildTray(); } return INFO; }

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
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 380, minHeight: 500, show: false, icon: ICON, title: 'Household Finances', backgroundColor: '#1f2a37', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
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
    try { if (!INFO.running) await startServer(); await w.loadURL(INFO.url + '/'); }
    catch (e) { dialog.showErrorBox('Household Finances', `${e.message}\n\nIf another copy of the server is running (for example your self-hosted one), stop it or pick a different port under Tray → Change setup.`); await w.loadFile(path.join(__dirname, 'ui', 'setup.html')); }
  }
  if (!HIDDEN || !S.role) show();
}

// ---------- tray ----------
function buildTray() {
  if (S.role !== 'host') { if (tray) { tray.destroy(); tray = null; } return; }
  if (!tray) { tray = new Tray(nativeImage.createFromPath(TRAY_ICON)); tray.setToolTip('Household Finances'); tray.on('click', show); }
  const on = !!INFO.running, others = on && INFO.mode === 'host';
  const addrs = others ? [...(INFO.lan || []), ...(TS.on && TS.name ? [`http://${TS.name}:${INFO.port}`] : []), ...(TS.on && TS.ip ? [`http://${TS.ip}:${INFO.port}`] : [])] : [];
  const tsItem = !TS.installed ? { label: 'Get Tailscale (to connect away from home)…', click: () => shell.openExternal('https://tailscale.com/download') }
    : { label: TS.on ? `Tailscale: on${TS.name ? ' · ' + TS.name : ''}` : 'Tailscale: off — open Tailscale to turn it on', enabled: !TS.on, click: () => shell.openExternal('https://login.tailscale.com/admin/machines') };
  tray.setToolTip(`Household Finances · ${on ? (others ? 'hosting for other devices' : 'this computer only') : 'stopped'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open dashboard', click: () => openDashboard() },
    { type: 'separator' },
    { label: on ? (others ? '● Running · other devices can connect' : '● Running · this computer only') : '○ Stopped', enabled: false },
    on ? { label: 'Stop server', click: () => stopServer().catch((e) => dialog.showErrorBox('Stop failed', e.message)) }
       : { label: 'Start server', click: () => startServer().then(() => win && win.loadURL(INFO.url + '/')).catch((e) => dialog.showErrorBox('Start failed', e.message)) },
    { label: 'Allow other devices (phone, other PCs)', type: 'checkbox', checked: S.mode === 'host', click: async (it) => {
        S.mode = it.checked ? 'host' : 'local'; saveSet();
        try { if (child) INFO = await call('setMode', { mode: S.mode, port: S.port }); } catch (e) { dialog.showErrorBox('Change failed', e.message); }
        buildTray(); if (it.checked) maybeFirewallNote(); } },
    { label: 'Phone & other device addresses', enabled: addrs.length > 0, submenu: addrs.length ? addrs.map((a) => ({ label: `Copy ${a}`, click: () => clipboard.writeText(a) })) : [{ label: 'none', enabled: false }] },
    tsItem,
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: !!S.startWithWindows, click: (it) => { S.startWithWindows = it.checked; saveSet(); loginItem(); } },
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
const loginItem = () => { try { app.setLoginItemSettings({ openAtLogin: !!S.startWithWindows, args: ['--hidden'] }); } catch {} };

// ---------- setup + connect screens (preload.js) ----------
ipcMain.handle('fd:defaults', () => ({ ...S, defaultDataDir: defaultDataDir(), dataDir: S.dataDir || defaultDataDir() }));
ipcMain.handle('fd:pickFolder', async () => { const r = await dialog.showOpenDialog(win, { title: 'Choose the data folder', properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? '' : r.filePaths[0]; });
ipcMain.handle('fd:hasData', (_e, dir) => fs.existsSync(path.join(dir || defaultDataDir(), 'finance.db')));
ipcMain.handle('fd:startHost', async (_e, o) => {
  const dir = o.dataDir || defaultDataDir(), restart = child && (dir !== (S.dataDir || defaultDataDir()));
  S = { ...S, role: 'host', mode: o.mode === 'host' ? 'host' : 'local', port: Number(o.port) || 8080, dataDir: dir === defaultDataDir() ? '' : dir, startWithWindows: !!o.startWithWindows };
  saveSet(); loginItem();
  if (restart) { await call('quit').catch(() => {}); await new Promise((r) => setTimeout(r, 300)); }
  if (INFO.running) await stopServer();
  await startServer(); tailscale();
  return { ...INFO, books: await call('books') };
});
ipcMain.handle('fd:addUser', (_e, o) => call('addUser', o));
ipcMain.handle('fd:openDashboard', async () => { await openDashboard(); return true; });
ipcMain.handle('fd:useRemote', async () => { if (child) await call('quit').catch(() => {}); S.role = 'remote'; saveSet(); buildTray(); await win.loadFile(path.join(__dirname, 'ui', 'connect.html')); });
ipcMain.handle('fd:openHost', async (_e, url) => { S.role = 'remote'; S.remoteUrl = String(url).replace(/\/+$/, ''); saveSet(); await win.loadURL(S.remoteUrl + '/'); });
ipcMain.handle('fd:setupAgain', async () => { await win.loadFile(path.join(__dirname, 'ui', 'setup.html')); });

// ---------- updates (GitHub Releases) ----------
// New versions are published as GitHub releases; the app checks once a day and from the tray.
// Nothing downloads without asking. Your data folder is never touched by an update.
let updBusy = false, updManual = false;
function setupUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = false; autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', async (i) => {
    const r = await dialog.showMessageBox({ type: 'info', buttons: ['Download now', 'Later'], defaultId: 0, message: `Version ${i.version} is available`, detail: `You have ${app.getVersion()}.${i.releaseNotes ? '\n\n' + String(i.releaseNotes).replace(/<[^>]+>/g, '').slice(0, 600) : ''}` });
    if (r.response === 0) autoUpdater.downloadUpdate(); else updBusy = false;
  });
  autoUpdater.on('update-not-available', () => { updBusy = false; if (updManual) dialog.showMessageBox({ type: 'info', message: "You're up to date", detail: `Version ${app.getVersion()}` }); });
  autoUpdater.on('error', (e) => { updBusy = false; if (updManual) dialog.showErrorBox("Couldn't check for updates", String((e && e.message) || e).split('\n')[0]); });
  autoUpdater.on('update-downloaded', async (i) => {
    updBusy = false;
    const r = await dialog.showMessageBox({ type: 'info', buttons: ['Restart now', 'When I quit'], defaultId: 0, message: `Version ${i.version} is ready`, detail: 'Restarting briefly stops the server; it starts again right after.' });
    if (r.response === 0) { quitting = true; setImmediate(() => autoUpdater.quitAndInstall()); }
  });
  setTimeout(() => checkUpdates(false), 30e3); setInterval(() => checkUpdates(false), 24 * 3600e3);
}
function checkUpdates(manual) {
  if (!autoUpdater || !app.isPackaged) { if (manual) dialog.showMessageBox({ message: 'Updates work in the installed app', detail: 'You are running from source (npm start).' }); return; }
  if (updBusy) return; updBusy = true; updManual = manual;
  autoUpdater.checkForUpdates().catch(() => { updBusy = false; });
}
ipcMain.handle('fd:checkUpdates', () => checkUpdates(true));

// ---------- app lifecycle ----------
app.on('second-instance', () => openDashboard());
app.on('window-all-closed', () => { if (S.role !== 'host') app.quit(); });
app.on('before-quit', () => { quitting = true; if (child) { try { child.send({ cmd: 'quit', id: 0 }); } catch {} } });
app.whenReady().then(async () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Help', submenu: [{ label: 'Check for updates…', click: () => checkUpdates(true) }, { label: 'Change setup…', click: async () => { show(); await win.loadFile(path.join(__dirname, 'ui', 'setup.html')); } }, { type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] }]));
  app.setAppUserModelId('com.householdfinances.desktop');
  loadSet(); loginItem(); setupUpdates();
  if (S.role === 'host') { try { await startServer(); } catch {} tailscale(); setInterval(() => { tailscale(); refresh(); }, 60e3); }
  await openDashboard();
});
