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
const CONTAINER_NAME = process.env.OPENTTD_CONTAINER_NAME || 'openttd';

// Detect a mounted container engine socket (podman or docker, in that order).
const SOCKET_CANDIDATES = [
  '/var/run/container.sock',
  '/var/run/podman.sock',
  '/run/podman/podman.sock',
  '/var/run/docker.sock',
];
const CONTAINER_SOCKET = SOCKET_CANDIDATES.find(p => {
  try { fs.accessSync(p, fs.constants.R_OK | fs.constants.W_OK); return true; }
  catch { return false; }
}) || null;
if (CONTAINER_SOCKET) console.log('Container socket:', CONTAINER_SOCKET);
else console.log('No container socket mounted; cannot start a stopped server');

function startContainer(name) {
  return new Promise((resolve, reject) => {
    if (!CONTAINER_SOCKET) return reject(new Error('no container socket'));
    const req = http.request({
      socketPath: CONTAINER_SOCKET,
      method: 'POST',
      path: `/containers/${encodeURIComponent(name)}/start`,
      headers: { Host: 'container-engine' },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 304) resolve({ already: res.statusCode === 304 });
        else reject(new Error(`start ${name}: HTTP ${res.statusCode} ${body.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

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

const MAX_BACKUPS = 10;

async function rotateBackups(filePath) {
  // Keep only the most recent MAX_BACKUPS .bak-* files for this path.
  const dir = path.dirname(filePath);
  const base = path.basename(filePath) + '.bak-';
  let entries;
  try { entries = await fs.promises.readdir(dir); }
  catch { return; }
  const baks = entries
    .filter(name => name.startsWith(base))
    .sort()         // ISO timestamps sort naturally
    .reverse();     // newest first
  for (const old of baks.slice(MAX_BACKUPS)) {
    try { await fs.promises.unlink(path.join(dir, old)); } catch {}
  }
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
  await rotateBackups(filePath);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/health') {
      return send(res, 200, JSON.stringify({ ok: true, data_dir: DATA_DIR }), 'application/json');
    }
    if (req.url === '/api/spawn-ai' && req.method === 'POST') {
      const adminPw = readAdminPassword();
      if (!adminPw) {
        return send(res, 500, JSON.stringify({
          ok: false, error: 'admin_password not set in secrets.cfg',
        }), 'application/json');
      }
      const opts = { host: OPENTTD_HOST, port: OPENTTD_ADMIN_PORT, password: adminPw };
      try {
        // Check that at least one AI script is installed; without one the
        // dummy AI loads and dies immediately, producing a silent no-op.
        const listOut = await rconQuery(opts, ['list_ai'], { timeoutMs: 5000 });
        const aiLines = (listOut[0] || []).filter(l => l && !/^List of AIs/.test(l));
        if (aiLines.length === 0) {
          return send(res, 200, JSON.stringify({
            ok: false,
            error: 'no AI scripts installed',
            hint: 'Use OpenTTD’s in-game Online Content to download an AI (e.g. AdmiralAI), or drop a .tar into data/.local/share/openttd/ai/ and restart.',
          }), 'application/json');
        }
        let out = await rconQuery(opts, ['start_ai'], { timeoutMs: 5000 });
        const lines = out[0] || [];
        const blocked = lines.some(l => /not allowed in multiplayer/i.test(l));
        if (blocked) {
          await rconCommands(opts, ['setting ai.ai_in_multiplayer 1'], { expectClose: false, timeoutMs: 5000 });
          out = await rconQuery(opts, ['start_ai'], { timeoutMs: 5000 });
        }
        return send(res, 200, JSON.stringify({ ok: true, output: out[0] || [] }), 'application/json');
      } catch (err) {
        return send(res, 502, JSON.stringify({ ok: false, error: err.message }), 'application/json');
      }
    }
    if (req.url === '/api/chat' && req.method === 'POST') {
      const adminPw = readAdminPassword();
      if (!adminPw) {
        return send(res, 500, JSON.stringify({
          ok: false, error: 'admin_password not set in secrets.cfg',
        }), 'application/json');
      }
      const body = JSON.parse(await readBody(req));
      const message = (body.message || '').toString().trim();
      if (!message) return send(res, 400, JSON.stringify({ ok: false, error: 'empty message' }), 'application/json');
      const safeMsg = message.replace(/"/g, '\\"');
      try {
        await rconCommands({
          host: OPENTTD_HOST,
          port: OPENTTD_ADMIN_PORT,
          password: adminPw,
        }, [`say "${safeMsg}"`], { expectClose: false, timeoutMs: 5000 });
      } catch (err) {
        return send(res, 502, JSON.stringify({ ok: false, error: 'rcon error: ' + err.message }), 'application/json');
      }
      return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
    }
    if (req.url === '/api/map-screenshot' && req.method === 'POST') {
      const adminPw = readAdminPassword();
      if (!adminPw) {
        return send(res, 500, JSON.stringify({
          ok: false,
          error: 'admin_password not set in secrets.cfg',
        }), 'application/json');
      }
      try {
        await rconCommands({
          host: OPENTTD_HOST,
          port: OPENTTD_ADMIN_PORT,
          password: adminPw,
        }, ['screenshot minimap live-map'], { expectClose: false, timeoutMs: 30_000 });
      } catch (err) {
        return send(res, 502, JSON.stringify({
          ok: false, error: 'rcon error: ' + err.message,
        }), 'application/json');
      }
      // Wait a moment for openttd to flush the PNG.
      await new Promise(r => setTimeout(r, 500));
      return send(res, 200, JSON.stringify({ ok: true, ts: Date.now() }), 'application/json');
    }
    if (req.url.startsWith('/api/screenshot/') && req.method === 'GET') {
      const m = req.url.match(/^\/api\/screenshot\/([\w\-\.]+)(?:\?.*)?$/);
      if (!m) return send(res, 400, 'bad name');
      const file = path.join(DATA_ROOT, '.local/share/openttd/screenshot', m[1]);
      try {
        const data = await fs.promises.readFile(file);
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        res.end(data);
        return;
      } catch (e) {
        return send(res, 404, 'not found');
      }
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
        // Admin unreachable. If a container socket is mounted, try to start
        // the container directly — restart policy + sentinel will do the rest.
        if (CONTAINER_SOCKET) {
          try {
            const r2 = await startContainer(CONTAINER_NAME);
            return send(res, 200, JSON.stringify({
              ok: true, sentinel, quit: false, started: !r2.already,
            }), 'application/json');
          } catch (e2) {
            return send(res, 200, JSON.stringify({
              ok: true, sentinel, quit: false,
              note: 'sentinel staged; tried to start container but failed (' + e2.message + '). Start it manually.',
            }), 'application/json');
          }
        }
        return send(res, 200, JSON.stringify({
          ok: true,
          sentinel,
          quit: false,
          note: 'sentinel staged; admin port unreachable (' + err.message + '). Start the container to apply.',
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
let prevConnected = false;
let bootSavePending = false;
const wss = new WebSocketServer({ noServer: true });

async function bootSave() {
  const pw = readAdminPassword();
  if (!pw) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await rconCommands({
      host: OPENTTD_HOST,
      port: OPENTTD_ADMIN_PORT,
      password: pw,
    }, ['save autosave/boot-' + ts], { expectClose: false, timeoutMs: 30_000 });
    console.log(`[${new Date().toISOString()}] boot-save: autosave/boot-${ts}`);
  } catch (e) {
    console.log('[boot-save] failed:', e.message);
  }
}

const live = new LiveAdmin({
  host: OPENTTD_HOST,
  port: OPENTTD_ADMIN_PORT,
  dataDir: DATA_DIR,
  onState: state => {
    latestState = state;
    if (state.connected && !prevConnected && !bootSavePending) {
      // openttd just (re)booted — wait briefly for it to fully load, then
      // capture a fresh autosave so a subsequent quit always has a recent
      // resume point.
      bootSavePending = true;
      setTimeout(() => {
        bootSavePending = false;
        bootSave();
      }, 5_000);
    }
    prevConnected = state.connected;
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
