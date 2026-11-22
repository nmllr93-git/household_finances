// "You're invited" page: shows what the invite gives, then creates the login (no sign-in needed; the link is the permission).
(function () {
  const $ = (id) => document.getElementById(id), token = location.hash.slice(1) || new URLSearchParams(location.search).get('t') || '';
  const bad = (m) => { $('badmsg').textContent = m; $('bad').hidden = false; $('f').hidden = true; };
  if (!token) return bad('This link is missing its invite code. Ask for a new link.');
  fetch('/api/join/' + encodeURIComponent(token)).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return bad(j.error || 'This invite link has expired or was already used.');
    $('what').textContent = `${j.name ? 'Hi ' + j.name + '! ' : ''}${j.from || 'Someone'} invited you to Larenest. You'll be able to open:`;
    for (const b of j.books) { const li = document.createElement('li'); li.textContent = `${b.name}${b.role === 'view' ? ' (view only)' : ''}`; $('gets').append(li); }
    if (j.newBook) { const li = document.createElement('li'); li.textContent = `${j.newBook} (a new dashboard of your own)`; $('gets').append(li); }
    $('f').hidden = false; $('f').username.focus();
  }).catch(() => bad('Couldn’t reach the server. Make sure you’re on the same Wi-Fi as the computer that hosts it.'));
  $('f').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, err = $('err'); err.hidden = true;
    if (f.password.value !== f.password2.value) { err.textContent = 'The passwords don’t match.'; err.hidden = false; return; }
    const r = await fetch('/api/join/' + encodeURIComponent(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { err.textContent = j.error || 'Something went wrong.'; err.hidden = false; return; }
    location.href = './';
  });
})();
