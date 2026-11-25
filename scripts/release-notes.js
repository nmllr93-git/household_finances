// Prints the release description for a release:  node scripts/release-notes.js Desktop 1.0.12
// With "--list" prints "<Kind> <version>" for every section.
// A Desktop version listed in release-majors.json gets a rolled-up description: every Desktop and Android section in
// its range, newest first (the smaller releases in between are removed from the releases page).
const fs = require('fs'), path = require('path');
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const MAJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'release-majors.json'), 'utf8'));
const parts = text.split(/^## /m).slice(1).map((s) => { const nl = s.indexOf('\n'); return { head: s.slice(0, nl).trim(), body: s.slice(nl + 1).trim() }; });
const [kind, ver] = process.argv.slice(2);
if (kind === '--list') { for (const p of parts) if (/^(Desktop|Android) \S+$/.test(p.head)) console.log(p.head); process.exit(0); }
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const inRange = (k, [lo, hi]) => parts.filter((p) => p.head.startsWith(k + ' ')).map((p) => ({ v: p.head.split(' ')[1], body: p.body }))
  .filter((p) => cmp(p.v, lo) >= 0 && cmp(p.v, hi) <= 0).sort((a, b) => cmp(b.v, a.v));
let out;
const m = kind === 'Desktop' && MAJ[ver];
if (m) {
  const sec = (k, l) => l.filter((p) => p.body).map((p) => `### ${k} ${p.v}\n${p.body.replace(/^### /gm, '#### ')}`).join('\n\n');
  const rng = (r) => (r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`);
  const d = inRange('Desktop', m.desktop), a = inRange('Android', m.android);
  out = `**${m.title}.** This release includes everything from Desktop ${rng(m.desktop)} and Android ${rng(m.android)}.\n\n` + sec('Desktop', d) + (a.length ? '\n\n' + sec('Android', a) : '');
} else {
  const hit = parts.find((p) => p.head === `${kind} ${ver}`);
  out = hit ? hit.body : `${kind} ${ver}`;
}
if (kind === 'Android') out += '\n\n**Install:** open this page on your phone, download the APK and allow your browser to install apps when asked.';
process.stdout.write(out + '\n');
