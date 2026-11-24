// Runs the finance server in its own process, controlled by the desktop app over IPC.
// Started with the bundled Node runtime so the built-in SQLite database is always available.
'use strict';
const path = require('node:path');
process.env.FD_APPMODE = '1';
const serverFile = process.env.FD_SERVER || path.join(__dirname, 'app-server', 'server.js');
let srv;
try { srv = require(serverFile); } catch (e) { process.send({ type: 'fatal', error: e.message }); process.exit(1); }
const reply = (id, ok, v) => process.send({ type: 'reply', id, ok, value: ok ? v : String((v && v.message) || v) });
process.on('message', async (m) => {
  if (!m || !m.cmd) return;
  try {
    let v;
    switch (m.cmd) {
      case 'start': v = await srv.start({ ...(m.opts || {}), quiet: true }); break;
      case 'stop': await srv.stop(); v = srv.info(); break;
      case 'info': v = srv.info(); break;
      case 'setMode': v = await srv.setMode(m.mode, m.port); break;
      case 'addUser': v = srv.addUser(m.name, m.password, m.books); break;
      case 'books': v = srv.books(); break;
      case 'logins': v = srv.logins(); break;
      case 'resetPassword': v = srv.resetPassword(m.name, m.password); break;
      case 'backup': v = srv.backup(); break;
      case 'setCloud': v = srv.setCloudDir(m.dir); break;
      case 'cloudInfo': v = srv.cloudInfo(); break;
      case 'quit': await srv.stop(); process.exit(0); break;
      default: throw new Error('unknown command ' + m.cmd);
    }
    reply(m.id, true, v);
  } catch (e) { reply(m.id, false, e); }
});
process.send({ type: 'ready', dataDir: srv.dataDir });
