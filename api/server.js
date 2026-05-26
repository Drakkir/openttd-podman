#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { rconQuit, rconSaveAndQuit, rconCommands, rconQuery } = require('./admin');
const { LiveAdmin } = require('./live');
const { WebSocketServer } = require('ws');

const OPENTTD_HOST = process.env.OPENTTD_HOST || 'openttd';
const OPENTTD_ADMIN_PORT = parseInt(process.env.OPENTTD_ADMIN_PORT || '3977', 10);

function readAdminPassword() {
  try {
    const text = fs.readFileSync(path.join(DATA_DIR, 'secrets.cfg'), 'utf-8');
    const m = text.match(/^admin_password\s*=\s*(.+)$/m);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

const DATA_DIR = process.env.DATA_DIR || '/data/.config/openttd';
const DATA_ROOT = process.env.DATA_ROOT || '/data';
const PORT = parseInt(process.env.PORT || '3000', 10);
const TARGETS = new Set(['openttd', 'private', 'secrets']);

function send(res, code, body, type = 'text/plain') {
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf-8');
}

async function atomicWrite(filePath, contents) {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  // Take a timestamped backup of the existing file before clobbering.
  try {
    const existing = await fs.promises.readFile(filePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.promises.writeFile(filePath + '.bak-' + stamp, existing);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
  await fs.promises.writeFile(tmp, contents, 'utf-8');
  await fs.promises.rename(tmp, filePath);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, data_dir: DATA_DIR }), 'application/json');
    }
    if (req.url === '/api/live-values' && req.method === 'POST') {
      const adminPw = readAdminPassword();
      if (!adminPw) {
        return send(res, 500, JSON.stringify({
          ok: false,
          error: 'admin_password not set in secrets.cfg',
        }), 'application/json');
      }
      const body = JSON.parse(await readBody(req));
      const keys = Array.isArray(body.keys) ? body.keys : [];
      if (keys.length === 0) {
        return send(res, 200, JSON.stringify({ ok: true, values: {} }), 'application/json');
      }
      const commands = keys.map(k => 'setting ' + k);
      let outputs;
      try {
        outputs = await rconQuery({
          host: OPENTTD_HOST,
          port: OPENTTD_ADMIN_PORT,
          password: adminPw,
        }, commands, { timeoutMs: 60_000 });
      } catch (err) {
        return send(res, 502, JSON.stringify({
          ok: false,
          error: 'admin port error: ' + err.message,
        }), 'application/json');
      }
      // Parse each output. OpenTTD prints:
      //   "Current value for 'network.max_clients' is '25' (min: 2, max: 255, def: 25)."
      const values = {};
      const re = /Current value for '([^']+)' is '([^']*)'/;
      for (let i = 0; i < keys.length; i++) {
        for (const line of outputs[i]) {
          const m = line.match(re);
          if (m && m[1] === keys[i]) {
            values[keys[i]] = m[2];
            break;
          }
        }
      }
      console.log(`[${new Date().toISOString()}] live-values: ${keys.length} queried, ${Object.keys(values).length} parsed`);
      return send(res, 200, JSON.stringify({ ok: true, values }), 'application/json');
    }
    if (req.url === '/api/apply-live' && req.method === 'POST') {
      const adminPw = readAdminPassword();
      if (!adminPw) {
        return send(res, 500, JSON.stringify({
          ok: false,
          error: 'admin_password not set in secrets.cfg',
        }), 'application/json');
      }
      const body = JSON.parse(await readBody(req));
      // Stage cfg files first so disk reflects what's in the editor — this
      // matters because OpenTTD's in-memory state and our .cfg files would
      // otherwise drift after live changes, and a page refresh would read
      // stale cfg back into the UI.
      for (const target of ['openttd', 'private', 'secrets']) {
        if (typeof body[target] !== 'string') continue;
        const staged = path.join(DATA_DIR, target + '.cfg.staged');
        await fs.promises.writeFile(staged + '.tmp', body[target], 'utf-8');
        await fs.promises.rename(staged + '.tmp', staged);
      }
      const settings = Array.isArray(body.settings) ? body.settings : [];
      if (settings.length === 0) {
        return send(res, 200, JSON.stringify({ ok: true, applied: 0, staged: true }), 'application/json');
      }
      // Build rcon commands. Most settings use `setting <name> <value>`.
      // A few have dedicated commands (server_name, server_password, rcon_password).
      const cmds = settings.map(s => {
        const name = `${s.section}.${s.key}`;
        const v = String(s.value);
        if (name === 'network.server_name') return `server_name "${v.replace(/"/g, '\\"')}"`;
        if (name === 'network.server_password') return `server_password "${v.replace(/"/g, '\\"')}"`;
        if (name === 'network.rcon_password') return `rcon_password "${v.replace(/"/g, '\\"')}"`;
        return `setting ${name} ${v}`;
      });
      try {
        await rconCommands({
          host: OPENTTD_HOST,
          port: OPENTTD_ADMIN_PORT,
          password: adminPw,
        }, cmds, { expectClose: false, timeoutMs: 30_000 });
      } catch (err) {
        return send(res, 502, JSON.stringify({
          ok: false,
          error: 'admin port error: ' + err.message,
        }), 'application/json');
      }
      console.log(`[${new Date().toISOString()}] apply-live: ${cmds.length} commands`);
      return send(res, 200, JSON.stringify({ ok: true, applied: cmds.length }), 'application/json');
    }
    if (req.url === '/api/apply-restart' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const adminPw = readAdminPassword();
      if (!adminPw) {
        return send(res, 500, JSON.stringify({
          ok: false,
          error: 'admin_password not set in secrets.cfg',
        }), 'application/json');
      }
      // Stage cfg files first. entrypoint.sh will move .staged → .cfg
      // at next startup so they win over what OpenTTD writes on shutdown.
      for (const target of ['openttd', 'private', 'secrets']) {
        if (typeof body[target] !== 'string') continue;
        const staged = path.join(DATA_DIR, target + '.cfg.staged');
        await fs.promises.writeFile(staged + '.tmp', body[target], 'utf-8');
        await fs.promises.rename(staged + '.tmp', staged);
      }
      try {
        // Save game state before quit so the next start has a recent autosave
        // to resume from. Filename goes under autosave/ so entrypoint picks it
        // up as the latest .sav.
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await rconSaveAndQuit({
          host: OPENTTD_HOST,
          port: OPENTTD_ADMIN_PORT,
          password: adminPw,
        }, 'autosave/pre-restart-' + stamp);
      } catch (err) {
        console.error('rconSaveAndQuit failed:', err.message);
        return send(res, 502, JSON.stringify({
          ok: false,
          error: 'could not reach openttd admin port: ' + err.message,
          hint: 'check that allow_insecure_admin_login = true in openttd.cfg',
        }), 'application/json');
      }
      console.log(`[${new Date().toISOString()}] apply-restart: staged cfg, saved game, sent quit`);
      return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
    }
    if (req.url === '/api/fresh-start' && req.method === 'POST') {
      // Stage cfg if provided (so the user's pending edits win after start).
      const body = await readBody(req);
      if (body) {
        const parsed = JSON.parse(body);
        for (const target of ['openttd', 'private', 'secrets']) {
          if (typeof parsed[target] !== 'string') continue;
          const staged = path.join(DATA_DIR, target + '.cfg.staged');
          await fs.promises.writeFile(staged + '.tmp', parsed[target], 'utf-8');
          await fs.promises.rename(staged + '.tmp', staged);
        }
      }
      const sentinel = path.join(DATA_ROOT, '.no-resume');
      await fs.promises.writeFile(sentinel, 'set ' + new Date().toISOString() + '\n');
      console.log(`[${new Date().toISOString()}] sentinel + staged cfg ready`);

      const adminPw = readAdminPassword();
      if (!adminPw) {
        // No admin pw → can't quit, but sentinel + cfg are staged.
        return send(res, 200, JSON.stringify({
          ok: true,
          sentinel,
          quit: false,
          note: 'sentinel staged; admin_password not set so could not signal a running server to quit',
        }), 'application/json');
      }
      try {
        await rconQuit({
          host: OPENTTD_HOST,
          port: OPENTTD_ADMIN_PORT,
          password: adminPw,
        });
        return send(res, 200, JSON.stringify({ ok: true, sentinel, quit: true }), 'application/json');
      } catch (err) {
        // Server unreachable (probably stopped) — sentinel will still apply
        // whenever the server starts next. This is a success from the user's
        // perspective: their changes are queued.
        return send(res, 200, JSON.stringify({
          ok: true,
          sentinel,
          quit: false,
          note: 'sentinel staged; server admin port unreachable (' + err.message + '). Start the container to apply.',
        }), 'application/json');
      }
    }
    const m = req.url.match(/^\/api\/cfg\/(openttd|private|secrets)$/);
    if (!m) return send(res, 404, 'not found');

    const target = m[1];
    const file = path.join(DATA_DIR, `${target}.cfg`);
    const staged = file + '.staged';

    if (req.method === 'GET') {
      // Prefer staged if it exists (last-saved state, not what openttd is using)
      const data = await fs.promises.readFile(staged, 'utf-8').catch(() =>
        fs.promises.readFile(file, 'utf-8').catch(err => {
          if (err.code === 'ENOENT') return '';
          throw err;
        })
      );
      return send(res, 200, data);
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      // Stage instead of clobbering the live .cfg, so OpenTTD's
      // shutdown-write can't overwrite our edits.
      await fs.promises.writeFile(staged + '.tmp', body, 'utf-8');
      await fs.promises.rename(staged + '.tmp', staged);
      console.log(`[${new Date().toISOString()}] staged ${staged} (${body.length}B)`);
      return send(res, 200, JSON.stringify({ ok: true, bytes: body.length, staged: true }), 'application/json');
    }
    return send(res, 405, 'method not allowed');
  } catch (err) {
    console.error(err);
    return send(res, 500, 'internal error: ' + err.message);
  }
});

// Live state + WebSocket fan-out.
let latestState = null;
const wss = new WebSocketServer({ noServer: true });
const live = new LiveAdmin({
  host: OPENTTD_HOST,
  port: OPENTTD_ADMIN_PORT,
  dataDir: DATA_DIR,
  onState: state => {
    latestState = state;
    const msg = JSON.stringify({ type: 'state', state });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(msg);
    }
  },
});
wss.on('connection', ws => {
  if (latestState) ws.send(JSON.stringify({ type: 'state', state: latestState }));
});
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/api/live-ws') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`openttd-api listening on :${PORT}, data dir: ${DATA_DIR}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`Received ${sig}, shutting down`);
    server.close(() => process.exit(0));
  });
}
