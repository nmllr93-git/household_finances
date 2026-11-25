// Translations. The English wording is the key, so code keeps writing plain English and a missing translation
// simply shows English. Two ways text gets translated:
//   1. window.T('Budget left')            – in code, for text built in scripts (with {0} {1} placeholders)
//   2. the page watcher below             – any text node or placeholder/title/aria-label whose whole text matches
// Anything inside translate="no" (account names, vendors, categories you typed, amounts) is left alone.
// Money, dates and numbers keep US formatting: the app is still about US accounts in US dollars.
// Settings carried over from the http:// address (Settings → Security → Switch to https://): this device's own choices, never data or sign-ins
(function () { try { const m = /[#&]fdcarry=([A-Za-z0-9_-]+)/.exec(location.hash); if (!m) return;
  const o = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
  for (const [k, v] of Object.entries(o || {})) if (/^fd-/.test(k) && k !== 'fd-lock' && typeof v === 'string' && localStorage.getItem(k) === null) localStorage.setItem(k, v);
  history.replaceState(null, '', location.pathname + location.search + location.hash.replace(/[#&]?fdcarry=[A-Za-z0-9_-]+/, '').replace(/^#$/, ''));
} catch (e) {} })();
window.FDCarryLink = (url) => { try { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^fd-/.test(k) && k !== 'fd-lock') o[k] = localStorage.getItem(k); }
  const b = btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); return url + '#fdcarry=' + b; } catch (e) { return url; } };
(function () {
  'use strict';
  const LANGS = { en: 'English', es: 'Español (beta)' };
  const get = () => { try { return localStorage.getItem('fd-lang') || ''; } catch (e) { return ''; } };
  const pick = () => { const s = get(); if (LANGS[s]) return s; const n = String(navigator.language || 'en').slice(0, 2).toLowerCase(); return LANGS[n] && !s ? n : 'en'; };
  const lang = pick();
  const DICT = {}, PAT = []; // exact strings, and patterns such as "usual month ≈ {0}"
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function add(table) {
    for (const [en, tr] of Object.entries(table || {})) {
      if (/\{\d\}/.test(en)) { const keys = []; const re = new RegExp('^' + esc(en).replace(/\\\{(\d)\\\}/g, (m, d) => { keys.push(+d); return '(.+?)'; }) + '$'); PAT.push({ re, keys, tr, len: en.replace(/\{\d\}/g, '').length }); }
      else DICT[en] = tr;
    }
    PAT.sort((a, b) => b.len - a.len); // the most specific pattern wins
  }
  const fill = (s, a) => s.replace(/\{(\d)\}/g, (m, d) => (a[+d] != null ? a[+d] : m));
  // translate one whole string, or return it unchanged
  function tr(s) {
    if (lang === 'en' || !s) return s;
    const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim(); if (!core) return s;
    if (DICT[core] != null) return lead + DICT[core] + tail;
    for (const p of PAT) { const m = p.re.exec(core); if (m) { const a = []; p.keys.forEach((k, i) => { a[k] = tr(m[i + 1]); }); return lead + fill(p.tr, a) + tail; } }
    return s;
  }
  const T = (s, ...a) => fill(lang === 'en' ? s : DICT[s] != null ? DICT[s] : tr(s), a);

  // ---- page watcher ----
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const skip = (el) => !el || el.closest('[translate="no"], script, style, code, textarea, svg title');
  const seen = new WeakMap(); // node -> the text we last wrote, so we don't translate our own output again
  function doText(n) { const v = n.nodeValue; if (seen.get(n) === v || skip(n.parentElement)) return; const t = tr(v); if (t !== v) { n.nodeValue = t; } seen.set(n, n.nodeValue); }
  function doEl(el) {
    if (skip(el)) return;
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) el.value = tr(el.value);
    if (el.tagName === 'OPTION') { const t = tr(el.textContent); if (t !== el.textContent) el.textContent = t; return; }
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return; doEl(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) n.nodeType === 3 ? doText(n) : doEl(n);
  }
  function start() {
    if (lang === 'en') return;
    document.documentElement.lang = lang; document.title = tr(document.title);
    walk(document.body);
    new MutationObserver((ms) => { for (const m of ms) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doEl(m.target);
      else m.addedNodes.forEach(walk);
    } }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  window.FDI18n = { lang, langs: LANGS, add, tr, missing: () => [], set: (l) => { try { localStorage.setItem('fd-lang', l); } catch (e) {} location.reload(); } };
  window.T = T;
  if (lang !== 'en') { // load this language's phrase file, then translate the page
    const s = document.createElement('script'); s.src = (document.currentScript && document.currentScript.src.replace(/i18n\.js.*$/, '') || '') + 'i18n/' + lang + '.js';
    s.onload = () => (document.body ? start() : document.addEventListener('DOMContentLoaded', start)); document.head.append(s);
  }
})();
