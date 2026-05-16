#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

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
