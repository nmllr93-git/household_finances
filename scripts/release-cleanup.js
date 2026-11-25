// Reads release tags (one per line) on stdin and prints the ones to delete from the public releases page:
// any release whose version falls inside a major release's range in release-majors.json, except the major itself
// and the newest Android release (the download page needs one to find the phone app). Tags themselves are kept.
const fs = require('fs'), path = require('path');
const MAJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'release-majors.json'), 'utf8'));
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const inside = (v, r) => cmp(v, r[0]) >= 0 && cmp(v, r[1]) <= 0;
const tags = fs.readFileSync(0, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const majors = Object.entries(MAJ).filter(([k]) => !k.startsWith('_'));
const android = tags.filter((t) => /^android-v\d/.test(t)).map((t) => t.slice(9)).sort(cmp), newestAndroid = android[android.length - 1];
for (const t of tags) {
  let m;
  if ((m = /^v(\d+\.\d+\.\d+)$/.exec(t))) { const v = m[1]; if (!MAJ[v] && majors.some(([, x]) => inside(v, x.desktop))) console.log(t); }
  else if ((m = /^android-v(\d+\.\d+\.\d+)$/.exec(t))) { const v = m[1]; if (v !== newestAndroid && majors.some(([, x]) => inside(v, x.android))) console.log(t); }
}
