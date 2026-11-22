// Small stand-ins for newer browser features pdf.js uses that Safari (iPhone) is missing or only recently added.
// Loaded before pdf.js on the page and in its worker. Each one only fills a gap; it never replaces a built-in.
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype.values = function ({ preventCancel = false } = {}) {
    const reader = this.getReader();
    return {
      async next() { const r = await reader.read(); if (r.done) reader.releaseLock(); return r; },
      async return(value) { if (!preventCancel) { const p = reader.cancel(value); reader.releaseLock(); await p; } else reader.releaseLock(); return { done: true, value }; },
      [Symbol.asyncIterator]() { return this; },
    };
  };
  ReadableStream.prototype[Symbol.asyncIterator] = ReadableStream.prototype.values;
}
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
}
for (const T of [Array, String, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array]) {
  if (!T.prototype.at) Object.defineProperty(T.prototype, 'at', { configurable: true, writable: true, value(i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return i < 0 || i >= this.length ? undefined : this[i]; } });
}
if (!Uint8Array.prototype.toHex) Object.defineProperty(Uint8Array.prototype, 'toHex', { configurable: true, writable: true, value() { let s = ''; for (const b of this) s += b.toString(16).padStart(2, '0'); return s; } });
if (!Uint8Array.fromBase64) Uint8Array.fromBase64 = function (str) { const bin = atob(String(str).replace(/[-_]/g, (c) => (c === '-' ? '+' : '/'))); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
if (typeof structuredClone !== 'function') globalThis.structuredClone = (v) => JSON.parse(JSON.stringify(v));
