// Copies what the desktop app bundles: the server + pages, the Node runtime that runs them,
// the shared connect screen, and the icons. Runs automatically before `npm start` and `npm run dist`.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const D = path.join(__dirname, '..'), ROOT = path.join(D, '..');
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const cp = (a, b) => fs.cpSync(a, b, { recursive: true });

// 1. server + pages (no data, no keys)
rm(path.join(D, 'app-server')); fs.mkdirSync(path.join(D, 'app-server'), { recursive: true });
for (const f of ['server.js', 'digest.js', 'package.json', 'public', 'core']) cp(path.join(ROOT, f), path.join(D, 'app-server', f));

// 2. Node runtime: the one running this script (needs 22.13+ for built-in SQLite)
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) { console.error(`Node ${process.versions.node} is too old; install Node 22.13 or newer (LTS) and run again.`); process.exit(1); }
rm(path.join(D, 'runtime')); fs.mkdirSync(path.join(D, 'runtime'));
fs.copyFileSync(process.execPath, path.join(D, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node'));
if (process.platform !== 'win32') fs.chmodSync(path.join(D, 'runtime', 'node'), 0o755);

// 3. shared screens + icons
fs.mkdirSync(path.join(D, 'ui'), { recursive: true });
fs.writeFileSync(path.join(D, 'ui', 'connect.html'), fs.readFileSync(path.join(ROOT, 'apps', 'connect.html'), 'utf8').replace('src="icons/icon-192.png"', 'src="../icons/icon-512.png"'));
rm(path.join(D, 'icons')); fs.mkdirSync(path.join(D, 'icons'));
const I = path.join(ROOT, 'apps', 'icons');
for (const [a, b] of [['windows/app.ico', 'app.ico'], ['windows/tray-16.png', 'tray-16.png'], ['windows/tray-32.png', 'tray-32.png'], ['icon-512.png', 'icon-512.png']]) fs.copyFileSync(path.join(I, a), path.join(D, 'icons', b));
fs.copyFileSync(path.join(ROOT, 'public', 'showpw.js'), path.join(D, 'ui', 'showpw.js')); // keep the setup screen's Show-password button in step
console.log(`Prepared: server ${require(path.join(ROOT, 'package.json')).version}, Node ${process.versions.node}`);
