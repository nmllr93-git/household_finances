// Shown when the server's data is encrypted and locked (after a restart without automatic unlock).
(() => {
  const f = document.getElementById('hf-unlock'), err = document.getElementById('hf-err'), lbl = document.getElementById('hf-ul-lbl'), inp = f.elements.secret;
  let useKey = false;
  document.getElementById('hf-ul-rk').addEventListener('click', (e) => { useKey = !useKey; lbl.textContent = useKey ? 'Recovery key' : 'Encryption password'; inp.type = useKey ? 'text' : 'password'; inp.placeholder = useKey ? 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX' : ''; e.target.textContent = useKey ? 'Use the password instead' : 'Use the recovery key instead'; inp.focus(); });
  FDStore.fetch('/api/encryption/status').then((r) => r.json()).then((s) => { if (!s.locked) location.href = '/'; }).catch(() => {});
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault(); err.hidden = true;
    const r = await FDStore.fetch('/api/encryption/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(useKey ? { recovery: inp.value } : { password: inp.value }) }).catch(() => null);
    if (r && r.ok) { location.href = '/'; return; }
    err.textContent = r ? (await r.json().catch(() => ({}))).error || 'Unlock failed.' : 'Can’t reach the server.'; err.hidden = false;
  });
})();
