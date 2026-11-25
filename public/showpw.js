// Adds a "Show" button to every password box (including ones added later), so you can check what you typed.
(function () {
  function add(i) {
    if (i.__pw) return; i.__pw = true;
    const w = document.createElement('span'); w.className = 'fd-pw';
    i.parentNode.insertBefore(w, i); w.append(i);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-pw-btn'; b.textContent = 'Show'; b.setAttribute('aria-label', 'Show password');
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the cursor (and phone keyboard) in the box
    b.addEventListener('click', () => { const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });
    w.append(b);
  }
  const scan = (root) => { if (root.querySelectorAll) root.querySelectorAll('input[type=password]').forEach(add); };
  const css = document.createElement('style');
  css.textContent = '.fd-pw{position:relative;display:block;width:100%}.fd-pw>input{width:100%;padding-right:4.2em!important;box-sizing:border-box}' +
    '.fd-pw:has(>input[hidden]){display:none}.fd-pw-btn{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;opacity:.7;font:inherit;font-size:.85em;cursor:pointer;padding:4px 6px}.fd-pw-btn:hover{opacity:1}';
  const go = () => { document.head.append(css); scan(document); new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches && n.matches('input[type=password]') ? add(n) : scan(n))))).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
