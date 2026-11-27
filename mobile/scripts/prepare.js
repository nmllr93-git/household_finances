// Builds www/ (everything the phone app ships with):
//   index.html … the full dashboard (from public/), used in phone-only mode
//   start.html … the first screen: connect to a server, or keep data on this phone (apps/connect.html)
//   core-books.js … the shared data rules (core/books.js), same as the PC server
// index.html sends you to start.html unless phone-only mode is on; start.html reopens your last server automatically.
'use strict';
const fs = require('node:fs'), path = require('node:path');
const M = path.join(__dirname, '..'), ROOT = path.join(M, '..'), W = path.join(M, 'www');
fs.rmSync(W, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), W, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'core', 'books.js'), path.join(W, 'core-books.js'));
fs.copyFileSync(path.join(ROOT, 'core', 'market.js'), path.join(W, 'core-market.js'));
fs.copyFileSync(path.join(ROOT, 'core', 'simplefin.js'), path.join(W, 'core-simplefin.js'));
fs.copyFileSync(path.join(ROOT, 'core', 'widgetdata.js'), path.join(W, 'core-widgetdata.js'));
fs.rmSync(path.join(W, 'sw.js'), { force: true }); // the app ships its own files; no offline cache needed

const router = `<script>
  // Phone app: the dashboard runs here only in phone-only mode; otherwise show the start screen.
  (function () { var m = ''; try { m = localStorage.getItem('fd-mode') || ''; } catch (e) {} if (m !== 'local') { document.documentElement.style.visibility = 'hidden'; location.replace('start.html' + location.search); } })();
</script>`;
let idx = fs.readFileSync(path.join(W, 'index.html'), 'utf8');
fs.writeFileSync(path.join(W, 'index.html'), idx.replace('<head>', '<head>\n' + router));

const reopen = `<script>
  // Reopen the last server automatically (remote mode), unless the user asked to pick (or it just failed).
  (function () { try { var q = new URLSearchParams(location.search), m = localStorage.getItem('fd-mode'), h = JSON.parse(localStorage.getItem('fd-hosts') || '[]')[0];
    if (m === 'remote' && h && !q.has('pick') && !q.has('failed')) { document.documentElement.classList.add('reopening'); window.__fdOpenPending = h;
      var show = function () { if (window.__fdOpening && window.__fdOpenPending) window.__fdOpening(h); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
      // check it answers first; if not, stay here and let the page look for the computer at its new address
      var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 3500);
      fetch(h + '/api/ping', { signal: c.signal, cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { clearTimeout(t); if (!j || j.app !== 'household-finances') throw 0;
        // the computer now offers HTTPS: let the start page switch this saved address over (it trusts that computer's certificate)
        if (/^http:/.test(h) && j.tls && j.tls.fp && window.Capacitor) { window.__fdOpenPending = ''; document.documentElement.classList.remove('reopening'); var oo = document.getElementById('opening'); if (oo) oo.hidden = true; window.__fdUpgrade = h; if (window.__fdGoHost) window.__fdGoHost(h); return; }
        location.replace(h + '/?app=phone&home=' + encodeURIComponent(location.origin)); })
        .catch(function () { window.__fdReopenFailed = h; window.__fdOpenPending = ''; document.documentElement.classList.remove('reopening'); var oo = document.getElementById('opening'); if (oo) oo.hidden = true; if (window.__fdFind) window.__fdFind(h); }); } } catch (e) {} })();
</script>`;
let start = fs.readFileSync(path.join(ROOT, 'apps', 'connect.html'), 'utf8').replace('<head>', '<head>\n' + reopen).replace('src="icons/icon-192.png"', 'src="icons/icon-192.png"');
fs.writeFileSync(path.join(W, 'start.html'), start);
// If the server's page fails to load (network dropped mid-load), the app shows this instead of a blank screen.
fs.writeFileSync(path.join(W, 'error.html'), '<!DOCTYPE html><meta charset="utf-8"><script>var h="";try{h=JSON.parse(localStorage.getItem("fd-hosts")||"[]")[0]||""}catch(e){}location.replace("start.html?failed="+encodeURIComponent(h||"your server"))</script>');
console.log('www ready (dashboard + start screen + shared core)');
