// Prints the CHANGELOG.md section for a release:  node scripts/release-notes.js Desktop 1.0.12
// With "--list" prints "<Kind> <version>" for every section.
const fs = require('fs'), path = require('path');
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const parts = text.split(/^## /m).slice(1).map((s) => { const nl = s.indexOf('\n'); return { head: s.slice(0, nl).trim(), body: s.slice(nl + 1).trim() }; });
const [kind, ver] = process.argv.slice(2);
if (kind === '--list') { for (const p of parts) if (/^(Desktop|Android) \S+$/.test(p.head)) console.log(p.head); process.exit(0); }
const hit = parts.find((p) => p.head === `${kind} ${ver}`);
let out = hit ? hit.body : `${kind} ${ver}`;
if (kind === 'Android') out += '\n\n**Install:** open this page on your phone, download the APK and allow your browser to install apps when asked.';
process.stdout.write(out + '\n');
