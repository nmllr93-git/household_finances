// Lists English text that still has no Spanish (or other) translation.
// Usage: node tools/i18n-strings.mjs es [--all]   → prints one string per line (most common first)
import fs from 'node:fs'; import vm from 'node:vm';
const lang = process.argv[2] || 'es', all = process.argv.includes('--all');
const have = {}; vm.runInNewContext(fs.readFileSync(`public/i18n/${lang}.js`, 'utf8'), { window: { FDI18n: { add: (t) => Object.assign(have, t) } } });
const out = new Map(), hit = (s, src) => { s = s.replace(/\s+/g, ' ').trim(); if (s.length < 2 || !/[A-Za-z]{2}/.test(s) || /^[\w.-]+$/.test(s) && !/^[A-Z][a-z]+$/.test(s)) return; if (!all && have[s] != null) return; out.set(s, (out.get(s) || 0) + 1); };
for (const f of ['index.html', 'login.html', 'unlock.html', 'join.html']) { const h = fs.readFileSync('public/' + f, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  for (const m of h.matchAll(/>([^<>]+)</g)) hit(m[1], f); for (const m of h.matchAll(/(?:placeholder|title|aria-label)="([^"]+)"/g)) hit(m[1], f); }
for (const f of ['page.js', 'app.js', 'import.js', 'tour.js', 'login.js', 'unlock.js', 'join.js', 'vehicle.js']) { const j = fs.readFileSync('public/' + f, 'utf8');
  for (const m of j.matchAll(/'((?:[^'\\\n]|\\.){2,})'/g)) if (/^[A-Z…+★⚙✎]/.test(m[1]) && / /.test(m[1]) || /^[A-Z][a-z]+$/.test(m[1])) hit(m[1].replace(/\\'/g, "'"), f); }
const list = [...out].sort((a, b) => b[1] - a[1]); console.log(list.map((x) => x[0]).join('\n')); console.error(`${list.length} strings without a ${lang} translation`);
