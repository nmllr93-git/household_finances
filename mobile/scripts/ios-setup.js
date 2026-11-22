// After `cap add ios`: app icon, permission texts, network settings and the build number.
// Version/build come from mobile/package.json and the IOS_BUILD environment variable (the CI run number).
'use strict';
const fs = require('node:fs'), path = require('node:path');
const M = path.join(__dirname, '..'), ROOT = path.join(M, '..'), APP = path.join(M, 'ios', 'App');
if (!fs.existsSync(APP)) { console.error('Run `npx cap add ios` first.'); process.exit(1); }
// 1. icon: one 1024×1024 image with no transparency (App Store rule); Xcode makes the other sizes
const set = path.join(APP, 'App', 'Assets.xcassets', 'AppIcon.appiconset');
fs.rmSync(set, { recursive: true, force: true }); fs.mkdirSync(set, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'apps', 'icons', 'ios-1024.png'), path.join(set, 'AppIcon-1024.png'));
fs.writeFileSync(path.join(set, 'Contents.json'), JSON.stringify({ images: [{ filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2));
// 2. Info.plist additions
const plistFile = path.join(APP, 'App', 'Info.plist'); let p = fs.readFileSync(plistFile, 'utf8');
const add = (key, xml) => { if (!p.includes(`<key>${key}</key>`)) p = p.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${xml}\n</dict>\n</plist>\n`); };
add('NSCameraUsageDescription', '<string>Take a photo of a receipt to attach it to a transaction.</string>');
add('NSPhotoLibraryUsageDescription', '<string>Choose a receipt photo to attach to a transaction.</string>');
add('NSLocalNetworkUsageDescription', '<string>Connect to your own Larenest server on your home network.</string>');
add('ITSAppUsesNonExemptEncryption', '<false/>'); // only standard HTTPS: no export-compliance paperwork
// Home servers are usually plain http on the home network or Tailscale: allow that for the dashboard web view and local addresses only.
add('NSAppTransportSecurity', '<dict>\n\t\t<key>NSAllowsArbitraryLoadsInWebContent</key>\n\t\t<true/>\n\t\t<key>NSAllowsLocalNetworking</key>\n\t\t<true/>\n\t</dict>');
fs.writeFileSync(plistFile, p);
// 3. version and build number
const ver = require(path.join(M, 'package.json')).version, build = process.env.IOS_BUILD || '1';
const pbx = path.join(APP, 'App.xcodeproj', 'project.pbxproj');
fs.writeFileSync(pbx, fs.readFileSync(pbx, 'utf8').replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${ver};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`));
console.log(`iOS project configured (version ${ver}, build ${build})`);
