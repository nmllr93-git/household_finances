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
if (!x.includes('android.permission.CAMERA')) x = x.replace('<application', '<uses-permission android:name="android.permission.CAMERA" />\n    <application'); // scan the host's QR code and take receipt photos
if (!x.includes('usesCleartextTraffic')) x = x.replace('<application', '<application android:usesCleartextTraffic="true"');
// home-screen widget (mobile/native/android): Java classes, layout, and the widget receiver
const N = path.join(M, 'native', 'android'), JAVA = path.join(M, 'android', 'app', 'src', 'main', 'java', 'com', 'larenest', 'app');
fs.mkdirSync(JAVA, { recursive: true });
for (const f of fs.readdirSync(path.join(N, 'java'))) fs.copyFileSync(path.join(N, 'java', f), path.join(JAVA, f));
for (const d of fs.readdirSync(path.join(N, 'res'))) { fs.mkdirSync(path.join(RES, d), { recursive: true }); for (const f of fs.readdirSync(path.join(N, 'res', d))) fs.copyFileSync(path.join(N, 'res', d, f), path.join(RES, d, f)); }
if (!x.includes('.LarenestWidget')) x = x.replace('</application>', `    <receiver android:name=".LarenestWidget" android:exported="false" android:label="Larenest">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/larenest_widget_info" />
        </receiver>
    </application>`);
fs.writeFileSync(man, x);
console.log('Android project configured');
