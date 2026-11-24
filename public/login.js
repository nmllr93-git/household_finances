document.getElementById('hf-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target), err = document.getElementById('hf-err');
  err.hidden = true;
  const r = await FDStore.fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: f.get('username'), password: f.get('password') }) }).catch(() => null);
  if (r && r.ok) { location.href = '/'; return; }
  if (r && r.status === 423) { location.href = 'unlock.html'; return; }
  err.textContent = r ? (await r.json().catch(() => ({}))).error || 'Sign-in failed.' : 'Can’t reach the server.';
  err.hidden = false;
});
