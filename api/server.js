#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
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

function inspectContainer(name) {
  return new Promise((resolve, reject) => {
    if (!CONTAINER_SOCKET) return reject(new Error('no container socket'));
    const req = http.request({
      socketPath: CONTAINER_SOCKET,
      method: 'GET',
      path: `/containers/${encodeURIComponent(name)}/json`,
      headers: { Host: 'container-engine' },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        } else {
          reject(new Error(`inspect ${name}: HTTP ${res.statusCode} ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Poll until the container has actually exited, then start it again. Used
// after rconQuit/rconSaveAndQuit: with restart: "no" the container stays
// down after the game quits, so the API must bring it back up. Polling beats
// a fixed sleep — if we call start while the old container is still running
// the engine returns 304 and the staged cfg / sentinel never get applied.
async function restartAfterExit(name, { timeoutMs = 20_000, intervalMs = 500 } = {}) {
  if (!CONTAINER_SOCKET) return { restarted: false, reason: 'no container socket' };
  const deadline = Date.now() + timeoutMs;
  // Wait for Running === false (or the inspect to 404, meaning gone).
  while (Date.now() < deadline) {
    let running = true;
    try {
      const info = await inspectContainer(name);
      running = !!(info.State && info.State.Running);
    } catch {
      running = false; // can't inspect → assume not running, let start decide
    }
    if (!running) break;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  const r = await startContainer(name);
  return { restarted: !r.already, already: r.already };
}

// Fallback installer for AdmiralAI when BaNaNaS is unreachable / 502.
// Pulls the latest nightly tar from openttdcoop directly. Returns the
// landed filename relative to the AI dir.
function httpsGet(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'openttd-podman-installer' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        return resolve(httpsGet(new URL(res.headers.location, url).href, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' from ' + url));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function installAdmiralAIFromOpenttdcoop() {
  const indexUrl = 'https://bundles.openttdcoop.org/ai-admiralai/nightlies/LATEST/';
  const html = (await httpsGet(indexUrl)).toString('utf-8');
  const m = html.match(/href="(AdmiralAI-\d+\.tar)"/);
  if (!m) throw new Error('AdmiralAI-N.tar link not found in ' + indexUrl);
  const fileName = m[1];
  const tarUrl = indexUrl + fileName;
  const tar = await httpsGet(tarUrl);
  const aiDir = path.join(DATA_ROOT, '.local/share/openttd/ai');
  await fs.promises.mkdir(aiDir, { recursive: true });
  const target = path.join(aiDir, fileName);
  await fs.promises.writeFile(target, tar);
  return { file: fileName, bytes: tar.length };
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

// Quote a string for use as a single rcon argument. Escapes backslashes
// before double-quotes (otherwise a trailing backslash escapes the closing
// quote) and strips control chars / newlines that would corrupt the command.
function rconQuoteArg(v) {
  const clean = String(v).replace(/[\x00-\x1f\x7f]/g, '');
  return clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Build the rcon command for one changed setting. Quotes the value when it
// contains whitespace or is empty so multi-word values (e.g. a client_name
// with a space) aren't split into extra args and silently dropped.
function settingRconCmd(s) {
  const name = `${s.section}.${s.key}`;
  const v = String(s.rcon ?? '');
  if (name === 'network.server_name') return `server_name "${rconQuoteArg(v)}"`;
  if (name === 'network.server_password') return `server_password "${rconQuoteArg(v)}"`;
  if (name === 'network.rcon_password') return `rcon_password "${rconQuoteArg(v)}"`;
  const arg = (/\s/.test(v) || v === '') ? `"${rconQuoteArg(v)}"` : v;
  return `setting ${name} ${arg}`;
}

// Patch only the given key=value lines into an existing cfg's text, preserving
// every other line: machine-managed secrets (client_secret_key, invite codes),
// passwords, and any setting the editor doesn't model. This replaces the old
// "reserialize the whole file from the editor" approach, which wiped anything
// not in the editor's schema/loaded state. changes: [{section, key, value}].
function patchCfgText(text, changes) {
  const bySection = new Map();
  for (const c of changes) {
    if (!bySection.has(c.section)) bySection.set(c.section, new Map());
    bySection.get(c.section).set(c.key, c.value);
  }
  const applied = new Set();       // "section\0key"
  const seenSection = new Set();
  const out = [];
  let cur = null;
  const flushMissing = sec => {
    if (sec == null || !bySection.has(sec)) return;
    for (const [key, val] of bySection.get(sec)) {
      if (!applied.has(sec + '\0' + key)) {
        out.push(`${key} = ${val}`);
        applied.add(sec + '\0' + key);
      }
    }
  };
  const lines = text.length ? text.split('\n') : [];
  for (const line of lines) {
    const h = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (h) {
      flushMissing(cur);           // add this section's not-yet-seen keys before moving on
      cur = h[1];
      seenSection.add(cur);
      out.push(line);
      continue;
    }
    const kv = line.match(/^\s*([A-Za-z0-9_.]+)\s*=/);
    if (kv && cur && bySection.has(cur) && bySection.get(cur).has(kv[1])) {
      out.push(`${kv[1]} = ${bySection.get(cur).get(kv[1])}`);
      applied.add(cur + '\0' + kv[1]);
      continue;
    }
    out.push(line);
  }
  flushMissing(cur);               // last section in the file
  for (const [sec, kv] of bySection) {   // sections not present at all
    if (seenSection.has(sec)) continue;
    out.push(`[${sec}]`);
    for (const [key, val] of kv) out.push(`${key} = ${val}`);
  }
  return out.join('\n');
}

// Apply changed settings to cfg files by patching (never reserializing).
// settings: [{section, key, file, cfg}]. staged=true writes *.cfg.staged
// (consumed by entrypoint on next boot); staged=false patches the live *.cfg.
async function applySettingsToCfg(settings, { staged }) {
  const byFile = {};
  for (const s of settings) {
    const f = TARGETS.has(s.file) ? s.file : 'openttd';
    (byFile[f] = byFile[f] || []).push({ section: s.section, key: s.key, value: s.cfg });
  }
  for (const [target, changes] of Object.entries(byFile)) {
    const livePath = path.join(DATA_DIR, target + '.cfg');
    const text = await fs.promises.readFile(livePath, 'utf-8').catch(() => '');
    const patched = patchCfgText(text, changes);
    if (staged) {
      const st = path.join(DATA_DIR, target + '.cfg.staged');
      await fs.promises.writeFile(st + '.tmp', patched, 'utf-8');
      await fs.promises.rename(st + '.tmp', st);
    } else {
      await atomicWrite(livePath, patched);
    }
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
      return send(res, 200, JSON.stringify({
        ok: true,
        data_dir: DATA_DIR,
        openttd_connected: !!(latestState && latestState.connected),
      }), 'application/json');
    }
    if (req.url === '/api/server/status' && req.method === 'GET') {
      const connected = !!(latestState && latestState.connected);
      if (!CONTAINER_SOCKET) {
        return send(res, 200, JSON.stringify({
          ok: true, socket: false, connected,
          running: connected, status: connected ? 'running' : 'unknown',
        }), 'application/json');
      }
      try {
        const info = await inspectContainer(CONTAINER_NAME);
        const s = info.State || {};
        return send(res, 200, JSON.stringify({
          ok: true, socket: true, connected,
          running: s.Running === true,
          status: s.Status || 'unknown',
          startedAt: s.StartedAt || null,
          finishedAt: s.FinishedAt || null,
        }), 'application/json');
      } catch (err) {
        return send(res, 500, JSON.stringify({ ok: false, error: err.message }), 'application/json');
      }
    }
    if (req.url === '/api/server/start' && req.method === 'POST') {
      if (!CONTAINER_SOCKET) {
        return send(res, 503, JSON.stringify({
          ok: false, error: 'container socket not mounted',
        }), 'application/json');
      }
      try {
        const r = await startContainer(CONTAINER_NAME);
        return send(res, 200, JSON.stringify({ ok: true, started: !r.already, already: r.already }), 'application/json');
      } catch (err) {
        return send(res, 502, JSON.stringify({ ok: false, error: err.message }), 'application/json');
      }
    }
    if (req.url === '/api/server/stop' && req.method === 'POST') {
      const adminPw = readAdminPassword();
      if (!adminPw) {
        return send(res, 500, JSON.stringify({ ok: false, error: 'admin_password not set' }), 'application/json');
      }
      try {
        await rconQuit({ host: OPENTTD_HOST, port: OPENTTD_ADMIN_PORT, password: adminPw });
        return send(res, 200, JSON.stringify({ ok: true, quit: true }), 'application/json');
      } catch (err) {
        return send(res, 502, JSON.stringify({ ok: false, error: err.message }), 'application/json');
      }
    }
    if (req.url === '/api/logs/openttd' && req.method === 'GET') {
      const logPath = path.join(DATA_ROOT, 'openttd.log');
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      let pos = 0;
      // Seed with the last ~100 lines (read at most the tail of the file).
      try {
        const st = await fs.promises.stat(logPath);
        const tailBytes = Math.min(st.size, 64 * 1024);
        const start = st.size - tailBytes;
        let fd;
        let text = '';
        try {
          fd = await fs.promises.open(logPath, 'r');
          const buf = Buffer.alloc(tailBytes);
          const { bytesRead } = await fd.read(buf, 0, tailBytes, start);
          text = buf.subarray(0, bytesRead).toString('utf-8');
        } finally {
          if (fd) await fd.close();
        }
        const lines = text.split('\n');
        // Drop a leading partial line if we didn't start at byte 0.
        if (start > 0) lines.shift();
        const recent = lines.filter(l => l.length > 0).slice(-100);
        for (const line of recent) res.write(`data: ${JSON.stringify(line)}\n\n`);
        pos = st.size;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          res.write(`event: error\ndata: ${JSON.stringify(err.message)}\n\n`);
        }
      }
      let leftover = '';
      // Re-entrancy guard: a slow tick must not overlap the next one, or both
      // read the same range and corrupt pos/leftover.
      let polling = false;
      const poll = setInterval(async () => {
        if (polling) return;
        polling = true;
        try {
          const st = await fs.promises.stat(logPath);
          if (st.size < pos) { pos = 0; leftover = ''; } // truncated on container restart
          if (st.size > pos) {
            const len = st.size - pos;
            let fd;
            let bytesRead = 0;
            const buf = Buffer.alloc(len);
            try {
              fd = await fs.promises.open(logPath, 'r');
              ({ bytesRead } = await fd.read(buf, 0, len, pos));
            } finally {
              if (fd) await fd.close();
            }
            pos += bytesRead;
            const text = leftover + buf.subarray(0, bytesRead).toString('utf-8');
            const parts = text.split('\n');
            leftover = parts.pop(); // keep last partial line for next tick
            for (const line of parts) {
              if (line.length > 0) res.write(`data: ${JSON.stringify(line)}\n\n`);
            }
          }
        } catch (err) {
          if (err.code !== 'ENOENT') {
            res.write(`event: error\ndata: ${JSON.stringify(err.message)}\n\n`);
          }
        } finally {
          polling = false;
        }
      }, 1000);
      req.on('close', () => clearInterval(poll));
      return;
    }
    if (req.url === '/api/list-ai' && req.method === 'GET') {
      const adminPw = readAdminPassword();
      if (!adminPw) return send(res, 500, JSON.stringify({ ok: false, error: 'admin_password not set' }), 'application/json');
      const opts = { host: OPENTTD_HOST, port: OPENTTD_ADMIN_PORT, password: adminPw };
      try {
        const out = await rconQuery(opts, ['list_ai'], { timeoutMs: 5000 });
        // Parse lines like " AdmiralAI (v25): An AI that uses..." or
        // legacy " 1: AdmiralAI  v34". Capture the name token.
        const ais = [];
        for (const line of out[0] || []) {
          if (/^List of AIs/i.test(line)) continue;
          const m = line.match(/^\s*(?:\d+:\s*)?(\S+)/);
          if (m && m[1]) ais.push(m[1]);
        }
        return send(res, 200, JSON.stringify({ ok: true, ais }), 'application/json');
      } catch (err) {
        return send(res, 502, JSON.stringify({ ok: false, error: err.message }), 'application/json');
      }
    }
    if (req.url === '/api/install-ai' && req.method === 'POST') {
      const adminPw = readAdminPassword();
      if (!adminPw) return send(res, 500, JSON.stringify({ ok: false, error: 'admin_password not set' }), 'application/json');
      const opts = { host: OPENTTD_HOST, port: OPENTTD_ADMIN_PORT, password: adminPw };
      const body = JSON.parse(await readBody(req) || '{}');
      const search = (body.search || 'AdmiralAI').toLowerCase();
      let bananasError = null;
      try {
        // Refresh content list then scan for the AI by name
        await rconCommands(opts, ['content update'], { expectClose: false, timeoutMs: 15_000 });
        const state = await rconQuery(opts, ['content state'], { timeoutMs: 15_000 });
        // Lines look like: "id, type, state, name" then "  42, ai, Unselected, AdmiralAI"
        let foundId = null, foundName = null;
        for (const line of state[0] || []) {
          const parts = line.split(',').map(s => s.trim());
          if (parts.length >= 4 && parts[1].toLowerCase() === 'ai' && parts[3].toLowerCase().includes(search)) {
            foundId = parts[0];
            foundName = parts[3];
            break;
          }
        }
        if (foundId) {
          await rconCommands(opts, [`content select ${foundId}`, 'content download'], { expectClose: false, timeoutMs: 60_000 });
          // Verify the AI actually landed — list_ai is filesystem-backed.
          const listed = await rconQuery(opts, ['list_ai'], { timeoutMs: 5000 });
          const installed = (listed[0] || []).some(l => !/^List of AIs/i.test(l) && l.toLowerCase().includes(search));
          if (installed) {
            return send(res, 200, JSON.stringify({ ok: true, via: 'bananas', installed: foundName, id: foundId }), 'application/json');
          }
          bananasError = 'content download via BaNaNaS returned no installed AI (CDN 502?)';
        } else {
          bananasError = 'no matching AI found in BaNaNaS catalog';
        }
      } catch (err) {
        bananasError = err.message;
      }
      // Fallback: only AdmiralAI is supported via openttdcoop.
      if (!search.includes('admiralai')) {
        return send(res, 502, JSON.stringify({
          ok: false, error: bananasError + ' (fallback only available for AdmiralAI)',
        }), 'application/json');
      }
      try {
        console.log('[install-ai] BaNaNaS failed (' + bananasError + ') — falling back to openttdcoop');
        const r = await installAdmiralAIFromOpenttdcoop();
        return send(res, 200, JSON.stringify({
          ok: true, via: 'openttdcoop', installed: r.file, bytes: r.bytes, bananasError,
        }), 'application/json');
      } catch (err) {
        return send(res, 502, JSON.stringify({
          ok: false, error: 'both BaNaNaS and openttdcoop fallback failed',
          bananasError, fallbackError: err.message,
        }), 'application/json');
      }
    }
    if (req.url === '/api/spawn-ai' && req.method === 'POST') {
      const adminPw = readAdminPassword();
      if (!adminPw) {
        return send(res, 500, JSON.stringify({
          ok: false, error: 'admin_password not set in secrets.cfg',
        }), 'application/json');
      }
      const opts = { host: OPENTTD_HOST, port: OPENTTD_ADMIN_PORT, password: adminPw };
      const body = JSON.parse(await readBody(req) || '{}');
      const aiName = (body.name || '').toString().trim();
      try {
        // Check that at least one AI script is installed.
        const listOut = await rconQuery(opts, ['list_ai'], { timeoutMs: 5000 });
        const aiLines = (listOut[0] || []).filter(l => l && !/^List of AIs/.test(l));
        if (aiLines.length === 0) {
          return send(res, 200, JSON.stringify({
            ok: false,
            error: 'no AI scripts installed',
            hint: 'Click "Install default AI" first.',
          }), 'application/json');
        }
        const cmd = aiName ? `start_ai "${rconQuoteArg(aiName)}"` : 'start_ai';
        let out = await rconQuery(opts, [cmd], { timeoutMs: 5000 });
        const lines = out[0] || [];
        const blocked = lines.some(l => /not allowed in multiplayer/i.test(l));
        if (blocked) {
          await rconCommands(opts, ['setting ai.ai_in_multiplayer 1'], { expectClose: false, timeoutMs: 5000 });
          out = await rconQuery(opts, [cmd], { timeoutMs: 5000 });
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
      const safeMsg = rconQuoteArg(message);
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
      await takeMapScreenshot();
      await new Promise(r => setTimeout(r, 300));
      return send(res, 200, JSON.stringify({ ok: true, ts: mapTs, history: mapHistory }), 'application/json');
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
      const settings = Array.isArray(body.settings) ? body.settings : [];
      // Patch only the changed keys into the live cfg — never reserialize the
      // whole file (that wiped passwords, network keys, and settings the
      // editor doesn't model).
      await applySettingsToCfg(settings, { staged: false });
      // Clear any leftover staged files from earlier apply-restart attempts.
      for (const target of ['openttd', 'private', 'secrets']) {
        await fs.promises.unlink(path.join(DATA_DIR, target + '.cfg.staged')).catch(() => {});
      }
      const live = settings.filter(s => s.change === 'live');
      if (live.length === 0) {
        return send(res, 200, JSON.stringify({ ok: true, applied: 0, staged: true }), 'application/json');
      }
      const cmds = live.map(settingRconCmd);
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
      // server_name comes from WELCOME and won't change in the ws state on its
      // own; patch it in so dashboards see the new value immediately.
      if (latestState) {
        let stateChanged = false;
        for (const s of live) {
          if (s.section === 'network' && s.key === 'server_name') {
            latestState.serverName = s.cfg;
            stateChanged = true;
          }
        }
        if (stateChanged) broadcast();
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
      const settings = Array.isArray(body.settings) ? body.settings : [];
      // Stage by patching changed keys into a copy of the live cfg, preserving
      // everything else. entrypoint.sh moves .staged → .cfg at next start.
      await applySettingsToCfg(settings, { staged: true });
      // stageOnly = "save to server" (no restart): just leave the staged files.
      if (body.stageOnly) {
        return send(res, 200, JSON.stringify({ ok: true, staged: true }), 'application/json');
      }
      try {
        // Apply live-class settings via rcon FIRST, then save, then quit. Most
        // game settings (_settings_game) are mutable at runtime, so this bakes
        // them into the savegame and they survive the resume. Client settings
        // are also read from the staged cfg on restart. (A few settings OpenTTD
        // locks mid-game — e.g. enabling inflation, or ai_in_multiplayer with
        // AIs present — won't stick here; those need a Fresh start.)
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const live = settings.filter(s => s.change === 'live');
        const cmds = [
          ...live.map(settingRconCmd),
          'save autosave/pre-restart-' + stamp,
          'quit',
        ];
        await rconCommands({
          host: OPENTTD_HOST,
          port: OPENTTD_ADMIN_PORT,
          password: adminPw,
        }, cmds);
      } catch (err) {
        console.error('apply-restart rcon failed:', err.message);
        return send(res, 502, JSON.stringify({
          ok: false,
          error: 'could not reach openttd admin port: ' + err.message,
          hint: 'check that allow_insecure_admin_login = true in openttd.cfg',
        }), 'application/json');
      }
      // openttd runs with restart: "no", so the save+quit leaves the container
      // exited. Bring it back up (applying the staged cfg) — otherwise the
      // server would stay down after every restart-only settings apply.
      let restarted = false;
      if (CONTAINER_SOCKET) {
        try {
          const r = await restartAfterExit(CONTAINER_NAME);
          restarted = r.restarted;
        } catch (e) {
          console.error('apply-restart: auto-restart failed:', e.message);
          return send(res, 200, JSON.stringify({
            ok: true, restarted: false,
            note: 'cfg saved and server quit, but auto-restart failed: ' + e.message + '. Start it manually.',
          }), 'application/json');
        }
      }
      console.log(`[${new Date().toISOString()}] apply-restart: staged cfg, saved game, restarted (${restarted})`);
      return send(res, 200, JSON.stringify({ ok: true, restarted }), 'application/json');
    }
    if (req.url === '/api/fresh-start' && req.method === 'POST') {
      // Stage the user's pending edits by patching changed keys into a copy of
      // the live cfg (a fresh game reads these as _settings_newgame). No rcon
      // apply needed — there's no running game to mutate.
      const parsed = JSON.parse((await readBody(req)) || '{}');
      const settings = Array.isArray(parsed.settings) ? parsed.settings : [];
      await applySettingsToCfg(settings, { staged: true });
      // A fresh start discards the current game — wipe the old map snapshots
      // (files + history) now so the dashboard doesn't keep showing the
      // previous game's minimaps. (The admin reconnects to the already-started
      // new game and never receives a NEWGAME packet.)
      await clearMapHistory();
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
        // With restart: no on the openttd service, the container exits after
        // rconQuit and stays down. Wait for it to actually exit, then start it
        // back up so fresh-start ends with a running server.
        let restarted = false;
        if (CONTAINER_SOCKET) {
          try {
            const r = await restartAfterExit(CONTAINER_NAME);
            restarted = r.restarted;
          } catch (e) {
            return send(res, 200, JSON.stringify({
              ok: true, sentinel, quit: true, restarted: false,
              note: 'quit succeeded but auto-restart failed: ' + e.message,
            }), 'application/json');
          }
        }
        return send(res, 200, JSON.stringify({ ok: true, sentinel, quit: true, restarted }), 'application/json');
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
let mapTs = 0;
// History of yearly minimap snapshots — populated from disk on boot and
// extended as new snapshots are taken. Each entry: { year, ts, file }.
let mapHistory = [];
const SCREENSHOT_DIR = path.join(DATA_ROOT, '.local/share/openttd/screenshot');
const wss = new WebSocketServer({ noServer: true });

// Cached starting_year from openttd.cfg, refreshed on mtime change.
let cachedStartingYear = null;
let cachedStartingYearMtime = 0;
function readStartingYear() {
  const cfgPath = path.join(DATA_DIR, 'openttd.cfg');
  try {
    const st = fs.statSync(cfgPath);
    if (st.mtimeMs === cachedStartingYearMtime) return cachedStartingYear;
    const text = fs.readFileSync(cfgPath, 'utf-8');
    const m = text.match(/^\s*starting_year\s*=\s*(\d+)\s*$/m);
    cachedStartingYear = m ? parseInt(m[1], 10) : null;
    cachedStartingYearMtime = st.mtimeMs;
    return cachedStartingYear;
  } catch {
    return cachedStartingYear;
  }
}

function mapStatePayload(state) {
  return { ...state, mapTs, mapHistory, startingYear: readStartingYear() };
}

function broadcast() {
  if (!latestState) return;
  const msg = JSON.stringify({ type: 'state', state: mapStatePayload(latestState) });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(msg);
  }
}

function sortKey(e) { return e.year * 12 + (e.month ?? 0); }

async function loadMapHistory() {
  try {
    const files = await fs.promises.readdir(SCREENSHOT_DIR);
    const entries = [];
    for (const f of files) {
      // New format: live-map-1989-12.png  (year-month, month 1-12)
      // Legacy:     live-map-Y1989.png    (year only, treated as Jan)
      let year = null, month = null;
      let m = f.match(/^live-map-(\d+)-(\d{2})\.png$/);
      if (m) { year = parseInt(m[1], 10); month = parseInt(m[2], 10) - 1; }
      else {
        m = f.match(/^live-map-Y(\d+)\.png$/);
        if (m) { year = parseInt(m[1], 10); month = null; }
      }
      if (year == null) continue;
      try {
        const st = await fs.promises.stat(path.join(SCREENSHOT_DIR, f));
        entries.push({ year, month, ts: st.mtimeMs, file: f });
      } catch {}
    }
    entries.sort((a, b) => sortKey(a) - sortKey(b));
    mapHistory = entries;
  } catch { /* dir doesn't exist yet — fine */ }
}
loadMapHistory();

// Single-flight guard: boot, month-rollover, and manual refresh can all fire
// near-simultaneously. Without serialization two calls for the same year/month
// both pass the await, both find no existing entry, and both push a duplicate.
let mapScreenshotInFlight = null;
function takeMapScreenshot() {
  if (mapScreenshotInFlight) return mapScreenshotInFlight;
  mapScreenshotInFlight = doTakeMapScreenshot().finally(() => { mapScreenshotInFlight = null; });
  return mapScreenshotInFlight;
}

async function doTakeMapScreenshot() {
  const pw = readAdminPassword();
  if (!pw) return;
  const year = latestState && latestState.year != null ? latestState.year : null;
  const month = latestState && latestState.month != null ? latestState.month : null;
  let baseName;
  if (year != null && month != null) {
    baseName = `live-map-${year}-${String(month + 1).padStart(2, '0')}`;
  } else if (year != null) {
    baseName = `live-map-Y${year}`;
  } else {
    baseName = 'live-map';
  }
  try {
    await rconCommands({
      host: OPENTTD_HOST,
      port: OPENTTD_ADMIN_PORT,
      password: pw,
    }, [`screenshot minimap ${baseName}`], { expectClose: false, timeoutMs: 30_000 });
    mapTs = Date.now();
    if (year != null) {
      const file = `${baseName}.png`;
      // Game reset (fresh start / older save): a snapshot that predates the
      // existing history means the old game is gone. The admin reconnects to an
      // already-running new game and never sees a NEWGAME packet, so wipe the
      // stale snapshots + their files here instead.
      const thisKey = sortKey({ year, month });
      const maxKey = mapHistory.reduce((m, e) => Math.max(m, sortKey(e)), -1);
      if (mapHistory.length && thisKey < maxKey) {
        for (const e of mapHistory) {
          try { await fs.promises.unlink(path.join(SCREENSHOT_DIR, e.file)); } catch {}
        }
        mapHistory = [];
      }
      const existing = mapHistory.find(e => e.year === year && e.month === month);
      if (existing) { existing.ts = mapTs; existing.file = file; }
      else { mapHistory.push({ year, month, ts: mapTs, file }); mapHistory.sort((a, b) => sortKey(a) - sortKey(b)); }
    }
    broadcast();
  } catch (e) {
    console.log('[map-screenshot] failed:', e.message);
  }
}

async function clearMapHistory() {
  for (const entry of mapHistory) {
    try { await fs.promises.unlink(path.join(SCREENSHOT_DIR, entry.file)); } catch {}
  }
  // Also remove any stray live-map.png so we don't show pre-newgame content.
  try { await fs.promises.unlink(path.join(SCREENSHOT_DIR, 'live-map.png')); } catch {}
  mapHistory = [];
  mapTs = Date.now();
  broadcast();
}

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
        // Also refresh the map preview on boot so dashboards have a baseline.
        takeMapScreenshot();
      }, 5_000);
    }
    prevConnected = state.connected;
    broadcast();
  },
  onYearChange: (year) => {
    console.log(`[live] year rolled over to ${year} — taking map snapshot`);
    takeMapScreenshot();
  },
  onNewGame: () => {
    console.log('[live] new game detected — clearing map history');
    clearMapHistory();
  },
});
wss.on('connection', ws => {
  if (latestState) ws.send(JSON.stringify({ type: 'state', state: mapStatePayload(latestState) }));
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

// Last-resort net so a stray throw (e.g. an unexpected admin frame) can't take
// the whole API down. The frame parser already guards known cases; this keeps
// the config editor and dashboard alive for everyone if something slips past.
process.on('uncaughtException', err => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', err => {
  console.error('[unhandledRejection]', err && err.stack ? err.stack : err);
});
