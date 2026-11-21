// Builds www/ (the app's own screens): the shared connect screen as index.html, plus the icon.
// On launch it reopens the last server automatically; "?pick=1" shows the connect screen instead.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const M = path.join(__dirname, '..'), ROOT = path.join(M, '..'), W = path.join(M, 'www');
fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(path.join(W, 'icons'), { recursive: true });
let html = fs.readFileSync(path.join(ROOT, 'apps', 'connect.html'), 'utf8');
const auto = `<script>
  // Phone app: reopen the last server unless the user asked to pick one (or it just failed).
  (function () { try { var q = new URLSearchParams(location.search); var h = JSON.parse(localStorage.getItem('fd-hosts') || '[]')[0];
    if (h && !q.has('pick') && !q.has('failed')) { document.documentElement.style.visibility = 'hidden'; location.replace(h + '/'); } } catch (e) {} })();
</script>`;
html = html.replace('<head>', '<head>\n' + auto);
fs.writeFileSync(path.join(W, 'index.html'), html);
fs.copyFileSync(path.join(ROOT, 'apps', 'icons', 'icon-192.png'), path.join(W, 'icons', 'icon-192.png'));
console.log('www ready');
