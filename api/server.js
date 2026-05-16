#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { rconQuit } = require('./admin');

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
        await rconQuit({
          host: OPENTTD_HOST,
          port: OPENTTD_ADMIN_PORT,
          password: adminPw,
        });
      } catch (err) {
        console.error('rconQuit failed:', err.message);
        // Clean up staged files so a manual restart doesn't accidentally apply them.
        return send(res, 502, JSON.stringify({
          ok: false,
          error: 'could not reach openttd admin port: ' + err.message,
          hint: 'check that allow_insecure_admin_login = true in secrets.cfg',
        }), 'application/json');
      }
      console.log(`[${new Date().toISOString()}] apply-restart: staged cfg, sent quit`);
      return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
    }
    if (req.url === '/api/fresh-start' && req.method === 'POST') {
      const sentinel = path.join(DATA_ROOT, '.no-resume');
      await fs.promises.writeFile(sentinel, 'set ' + new Date().toISOString() + '\n');
      console.log(`[${new Date().toISOString()}] sentinel created: ${sentinel}`);
      return send(res, 200, JSON.stringify({ ok: true, sentinel }), 'application/json');
    }
    const m = req.url.match(/^\/api\/cfg\/(openttd|private|secrets)$/);
    if (!m) return send(res, 404, 'not found');

    const target = m[1];
    const file = path.join(DATA_DIR, `${target}.cfg`);

    if (req.method === 'GET') {
      const data = await fs.promises.readFile(file, 'utf-8').catch(err => {
        if (err.code === 'ENOENT') return '';
        throw err;
      });
      return send(res, 200, data);
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      await atomicWrite(file, body);
      console.log(`[${new Date().toISOString()}] wrote ${file} (${body.length}B)`);
      return send(res, 200, JSON.stringify({ ok: true, bytes: body.length }), 'application/json');
    }
    return send(res, 405, 'method not allowed');
  } catch (err) {
    console.error(err);
    return send(res, 500, 'internal error: ' + err.message);
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
