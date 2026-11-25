// Screen readers: make sure every form control has a name. Most have a <label>; the ones built on the fly
// (settings rows, inline editors) get an aria-label from their placeholder, their settings row or the text right before them.
(function () {
  'use strict';
  const named = (el) => (el.labels && [...el.labels].some((l) => l.textContent.trim())) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title;
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  function nameFor(el) {
    if (el.placeholder) return clean(el.placeholder);
    const row = el.closest('.fd-rb-row'); const lbl = row && row.querySelector(':scope > .fd-rb-lbl');
    let before = '';
    for (let n = el.previousSibling; n && !before; n = n.previousSibling) before = clean(n.nodeType === 3 ? n.textContent : n.matches && n.matches('input,select,textarea,button') ? '' : n.textContent);
    if (lbl && before) return clean(`${lbl.textContent}: ${before}`);
    if (lbl) return clean(lbl.textContent);
    if (before) return before;
    const sel = el.tagName === 'SELECT' && el.options[el.selectedIndex]; return sel ? clean(sel.textContent) : '';
  }
  let t = 0;
  function pass() { t = 0;
    document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach((el) => { if (named(el)) return; const n = nameFor(el); if (n) el.setAttribute('aria-label', n); });
    // messages that appear after an action ("Saved", "Couldn't save") are read out when they change
    document.querySelectorAll('.fd-msg:not([aria-live]), .fd-sync-msg:not([aria-live]), .fd-scanmsg:not([aria-live])').forEach((el) => el.setAttribute('aria-live', 'polite'));
    // the page's language follows the app's language, so a screen reader pronounces it right
    try { const l = (window.FDI18n && window.FDI18n.lang) || 'en'; if (document.documentElement.lang !== l) document.documentElement.lang = l; } catch (e) {}
  }
  const queue = () => { if (!t) t = setTimeout(pass, 250); };
  new MutationObserver(queue).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pass); else pass();
})();
