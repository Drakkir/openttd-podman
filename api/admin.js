'use strict';

// Minimal OpenTTD admin protocol client.
// Supports insecure password auth only — requires
// `allow_insecure_admin_login = true` in OpenTTD's secrets.cfg.
//
// Protocol frames: uint16 length (LE) including this header + uint8 type + payload.
// Strings are null-terminated UTF-8.

const net = require('net');

// Packet type IDs from src/network/core/tcp_admin.h
const PKT_ADMIN_JOIN = 0;
const PKT_ADMIN_RCON = 5;
const PKT_SERVER_FULL = 100;
const PKT_SERVER_BANNED = 101;
const PKT_SERVER_ERROR = 102;
const PKT_SERVER_PROTOCOL = 103;
const PKT_SERVER_WELCOME = 104;
const PKT_SERVER_RCON_END = 123;

function buildPacket(type, ...strings) {
  const parts = [];
  for (const s of strings) {
    parts.push(Buffer.from(s, 'utf8'));
    parts.push(Buffer.from([0]));
  }
  const payload = Buffer.concat(parts);
  const length = 3 + payload.length;
  const buf = Buffer.alloc(length);
  buf.writeUInt16LE(length, 0);
  buf.writeUInt8(type, 2);
  payload.copy(buf, 3);
  return buf;
}

function parseFrames(buffer) {
  const frames = [];
  let off = 0;
  while (off + 3 <= buffer.length) {
    const len = buffer.readUInt16LE(off);
    if (off + len > buffer.length) break;
    const type = buffer.readUInt8(off + 2);
    frames.push({ type, payload: buffer.slice(off + 3, off + len) });
    off += len;
  }
  return { frames, rest: buffer.slice(off) };
}

// Send `rcon quit` to make OpenTTD exit. Resolves when the server closes the
// socket; rejects on error or auth failure.
function rconQuit({ host, port, password, name = 'webui-api', version = '1' }) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    let buffered = Buffer.alloc(0);
    let authed = false;
    let quitSent = false;
    let lastError = null;

    sock.setTimeout(10_000, () => {
      sock.destroy(new Error('admin handshake timed out'));
    });

    sock.on('connect', () => {
      sock.write(buildPacket(PKT_ADMIN_JOIN, password, name, version));
    });

    sock.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      const { frames, rest } = parseFrames(buffered);
      buffered = rest;
      for (const f of frames) {
        switch (f.type) {
          case PKT_SERVER_WELCOME:
          case PKT_SERVER_PROTOCOL:
            if (!authed) {
              authed = true;
              sock.write(buildPacket(PKT_ADMIN_RCON, 'quit'));
              quitSent = true;
            }
            break;
          case PKT_SERVER_FULL:
            lastError = new Error('admin slots full');
            sock.destroy();
            break;
          case PKT_SERVER_BANNED:
            lastError = new Error('banned by admin port');
            sock.destroy();
            break;
          case PKT_SERVER_ERROR:
            lastError = new Error('admin error frame (code ' + f.payload[0] + ')');
            sock.destroy();
            break;
          case PKT_SERVER_RCON_END:
            // rcon done; quit packet was queued; server will close shortly.
            break;
        }
      }
    });

    sock.on('error', err => { lastError = lastError || err; });

    sock.on('close', () => {
      if (lastError) return reject(lastError);
      if (!authed) return reject(new Error('disconnected before authentication'));
      if (!quitSent) return reject(new Error('disconnected before quit was sent'));
      resolve();
    });
  });
}

module.exports = { rconQuit };
