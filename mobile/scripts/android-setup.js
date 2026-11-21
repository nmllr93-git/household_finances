// After `cap add android`: copy launcher icons, allow plain-http home servers, set the app name/colors.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const M = path.join(__dirname, '..'), ROOT = path.join(M, '..'), RES = path.join(M, 'android', 'app', 'src', 'main', 'res');
if (!fs.existsSync(RES)) { console.error('Run `npx cap add android` first.'); process.exit(1); }
const I = path.join(ROOT, 'apps', 'icons', 'android');
for (const d of fs.readdirSync(I).filter((x) => x.startsWith('mipmap-'))) {
  fs.mkdirSync(path.join(RES, d), { recursive: true });
  for (const f of fs.readdirSync(path.join(I, d))) { fs.copyFileSync(path.join(I, d, f), path.join(RES, d, f)); fs.copyFileSync(path.join(I, d, f), path.join(RES, d, f.replace('ic_launcher', 'ic_launcher_round'))); }
}
fs.mkdirSync(path.join(RES, 'mipmap-anydpi-v26'), { recursive: true });
for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) fs.copyFileSync(path.join(I, 'ic_launcher.xml'), path.join(RES, 'mipmap-anydpi-v26', f));
fs.mkdirSync(path.join(RES, 'values'), { recursive: true });
fs.copyFileSync(path.join(I, 'ic_launcher_background.xml'), path.join(RES, 'values', 'ic_launcher_background.xml'));
// home servers are usually plain http on the local network or Tailscale
const man = path.join(M, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let x = fs.readFileSync(man, 'utf8');
if (!x.includes('usesCleartextTraffic')) x = x.replace('<application', '<application android:usesCleartextTraffic="true"');
fs.writeFileSync(man, x);
console.log('Android project configured');
