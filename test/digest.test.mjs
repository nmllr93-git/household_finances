// Weekly email digest: content from real calculations, and the SMTP client against a fake mail server.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';
const { buildDigest, sendMail } = createRequire(import.meta.url)('../digest.js');

function fakeSmtp(opts = {}) {
  const got = [];
  const srv = net.createServer((s) => {
    let data = false, buf = '';
    s.write('220 fake ESMTP\r\n');
    s.on('data', (d) => { buf += d.toString();
      if (data) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; got.push({ data: buf.slice(0, i) }); buf = buf.slice(i + 5); data = false; s.write('250 queued\r\n'); return; }
      let k; while ((k = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, k); buf = buf.slice(k + 2); got.push({ cmd: line });
        if (/^EHLO/i.test(line)) s.write('250-fake\r\n250 AUTH LOGIN\r\n'); else if (/^AUTH LOGIN/i.test(line)) s.write('334 VXNlcm5hbWU6\r\n');
        else if (got.filter((g) => g.cmd).length === 3 && opts.auth) s.write('334 UGFzc3dvcmQ6\r\n'); else if (got.filter((g) => g.cmd).length === 4 && opts.auth) s.write(opts.badPass ? '535 bad credentials\r\n' : '235 ok\r\n');
        else if (/^DATA/i.test(line)) { s.write('354 go\r\n'); data = true; if (buf.includes('\r\n.\r\n')) s.emit('data', Buffer.from('')); return; } else if (/^QUIT/i.test(line)) { s.write('221 bye\r\n'); s.end(); } else s.write('250 ok\r\n'); } });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ port: srv.address().port, got, close: () => srv.close() })));
}
const servers = []; after(() => servers.forEach((s) => s.close()));

test('digest summarises last week, bills and budget from real calculations', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  const txns = [['2026-11-18', 'HY-VEE GROCERY', 82.5], ['2026-11-19', 'CHIPOTLE', 14], ...['2026-08-03', '2026-09-03', '2026-10-03', '2026-11-03'].map((d) => [d, 'NETFLIX.COM', 15.49])].map(([date, description, amount]) => ({ date, description, amount }));
  const data = { imports: [{ id: 'a', book: 'Personal', accountName: 'Visa', accountKind: 'credit', txns }], budgets: [{ book: 'Personal', category: 'Groceries', amount: 400, from: '2026-11', createdAt: '2026-11-01' }] };
  const d = buildDigest({ id: 'p', name: 'Alex – Personal', label: 'Personal' }, data, now);
  assert.match(d.subject, /Alex – Personal: \$97 spent this week/);
  assert.match(d.text, /Spent \$97 across 2 purchases/);
  assert.match(d.html, /<h2[^>]*>Alex – Personal<\/h2>/);
});
test('SMTP: sends a message with login', async () => {
  const f = await fakeSmtp({ auth: true }); servers.push(f);
  await sendMail({ host: '127.0.0.1', port: f.port, user: 'me@x.com', pass: 'pw', allowPlain: true }, { to: 'you@x.com', subject: 'Héllo', text: 'hi', html: '<b>hi</b>' });
  const cmds = f.got.filter((g) => g.cmd).map((g) => g.cmd);
  assert.ok(cmds.includes('MAIL FROM:<me@x.com>')); assert.ok(cmds.includes('RCPT TO:<you@x.com>'));
  const msg = f.got.find((g) => g.data).data; assert.match(msg, /Subject: =\?UTF-8\?B\?/); assert.match(msg, /multipart\/alternative/);
});
test('SMTP: wrong password is reported', async () => {
  const f = await fakeSmtp({ auth: true, badPass: true }); servers.push(f);
  await assert.rejects(sendMail({ host: '127.0.0.1', port: f.port, user: 'me@x.com', pass: 'no', allowPlain: true }, { to: 'y@x.com', subject: 's', text: 't', html: 'h' }), /bad credentials/);
});
test('SMTP: refuses to send a password without encryption', async () => {
  const f = await fakeSmtp({ auth: true }); servers.push(f);
  await assert.rejects(sendMail({ host: '127.0.0.1', port: f.port, user: 'me@x.com', pass: 'pw' }, { to: 'y@x.com', subject: 's', text: 't', html: 'h' }), /encryption/);
});
