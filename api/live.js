'use strict';

// Persistent OpenTTD admin connection: subscribes to live updates and
// fans them out to WebSocket clients as JSON snapshots.
//
// Packet types and update IDs from src/network/core/tcp_admin.h.

const net = require('net');
const fs = require('fs');
const path = require('path');

const PKT_ADMIN_JOIN = 0;
const PKT_ADMIN_UPDATE_FREQUENCY = 2;
const PKT_ADMIN_POLL = 3;

const PKT_SERVER_FULL = 100;
const PKT_SERVER_BANNED = 101;
const PKT_SERVER_ERROR = 102;
const PKT_SERVER_PROTOCOL = 103;
const PKT_SERVER_WELCOME = 104;
const PKT_SERVER_NEWGAME = 105;
const PKT_SERVER_SHUTDOWN = 106;
const PKT_SERVER_DATE = 107;
const PKT_SERVER_CLIENT_JOIN = 108;
const PKT_SERVER_CLIENT_INFO = 109;
const PKT_SERVER_CLIENT_UPDATE = 110;
const PKT_SERVER_CLIENT_QUIT = 111;
const PKT_SERVER_CLIENT_ERROR = 112;
const PKT_SERVER_COMPANY_NEW = 113;
const PKT_SERVER_COMPANY_INFO = 114;
const PKT_SERVER_COMPANY_UPDATE = 115;
const PKT_SERVER_COMPANY_REMOVE = 116;
const PKT_SERVER_COMPANY_ECONOMY = 117;

const UPDATE_DATE = 0;
const UPDATE_CLIENT_INFO = 1;
const UPDATE_COMPANY_INFO = 2;
const UPDATE_COMPANY_ECONOMY = 3;

const FREQ_POLL = 0x01;
const FREQ_WEEKLY = 0x04;
const FREQ_MONTHLY = 0x08;
const FREQ_AUTOMATIC = 0x40;

// Stream-based packet reader for null-terminated strings + integers.
class Reader {
  constructor(buf) { this.buf = buf; this.off = 0; }
  u8() { const v = this.buf.readUInt8(this.off); this.off += 1; return v; }
  u16() { const v = this.buf.readUInt16LE(this.off); this.off += 2; return v; }
  u32() { const v = this.buf.readUInt32LE(this.off); this.off += 4; return v; }
  i64() {
    const v = this.buf.readBigInt64LE(this.off); this.off += 8; return Number(v);
  }
  str() {
    let end = this.off;
    while (end < this.buf.length && this.buf[end] !== 0) end++;
    const s = this.buf.slice(this.off, end).toString('utf8');
    this.off = end + 1;
    return s;
  }
}

function buildPacket(type, payload) {
  const length = 3 + payload.length;
  const buf = Buffer.alloc(length);
  buf.writeUInt16LE(length, 0);
  buf.writeUInt8(type, 2);
  payload.copy(buf, 3);
  return buf;
}

function joinPacket(password, name, version) {
  const parts = [];
  for (const s of [password, name, version]) {
    parts.push(Buffer.from(s, 'utf8'));
    parts.push(Buffer.from([0]));
  }
  return buildPacket(PKT_ADMIN_JOIN, Buffer.concat(parts));
}

function updateFreqPacket(type, freq) {
  const p = Buffer.alloc(4);
  p.writeUInt16LE(type, 0);
  p.writeUInt16LE(freq, 2);
  return buildPacket(PKT_ADMIN_UPDATE_FREQUENCY, p);
}

function pollPacket(type, data = 0xFFFFFFFF) {
  const p = Buffer.alloc(5);
  p.writeUInt8(type, 0);
  p.writeUInt32LE(data, 1);
  return buildPacket(PKT_ADMIN_POLL, p);
}

function readAdminPassword(secretsPath) {
  try {
    const text = fs.readFileSync(secretsPath, 'utf-8');
    const m = text.match(/^admin_password\s*=\s*(.+)$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}

class LiveAdmin {
  constructor({ host, port, dataDir, onState }) {
    this.host = host;
    this.port = port;
    this.secretsPath = path.join(dataDir, 'secrets.cfg');
    this.onState = onState;
    this.state = {
      connected: false,
      serverName: null,
      serverVersion: null,
      date: null,
      clients: {},    // id → {name, hostname, language, joinDate, company}
      companies: {},  // id → {name, manager, colour, isAI, inauguratedYear, ...}
    };
    this.sock = null;
    this.buffered = Buffer.alloc(0);
    this.backoffMs = 1000;
    this.connect();
  }

  emitState() {
    if (this.onState) this.onState(this.state);
  }

  connect() {
    const password = readAdminPassword(this.secretsPath);
    if (!password) {
      console.log('[live] admin_password not set; retry in 10s');
      setTimeout(() => this.connect(), 10_000);
      return;
    }

    this.sock = net.createConnection({ host: this.host, port: this.port });
    this.sock.on('connect', () => {
      console.log('[live] connected to admin port');
      this.backoffMs = 1000;
      this.sock.write(joinPacket(password, 'webui-live', '1'));
    });

    this.sock.on('data', chunk => {
      this.buffered = Buffer.concat([this.buffered, chunk]);
      this.parseFrames();
    });

    const handleClose = () => {
      this.state.connected = false;
      this.emitState();
      console.log(`[live] disconnected; reconnect in ${this.backoffMs}ms`);
      setTimeout(() => this.connect(), this.backoffMs);
      this.backoffMs = Math.min(30_000, this.backoffMs * 2);
    };
    this.sock.on('error', err => { console.log('[live] socket error:', err.message); });
    this.sock.on('close', handleClose);
  }

  parseFrames() {
    while (this.buffered.length >= 3) {
      const len = this.buffered.readUInt16LE(0);
      if (this.buffered.length < len) break;
      const type = this.buffered.readUInt8(2);
      const payload = this.buffered.slice(3, len);
      this.buffered = this.buffered.slice(len);
      this.handle(type, payload);
    }
  }

  handle(type, payload) {
    const r = new Reader(payload);
    switch (type) {
      case PKT_SERVER_PROTOCOL:
        // Skip the protocol version frame; PKT_SERVER_WELCOME is what unlocks rest.
        break;
      case PKT_SERVER_WELCOME: {
        this.state.serverName = r.str();
        this.state.serverVersion = r.str();
        this.state.connected = true;
        this.emitState();
        // Subscribe to live client + company updates, then poll initial state.
        this.sock.write(updateFreqPacket(UPDATE_CLIENT_INFO, FREQ_AUTOMATIC));
        this.sock.write(updateFreqPacket(UPDATE_COMPANY_INFO, FREQ_AUTOMATIC));
        this.sock.write(updateFreqPacket(UPDATE_COMPANY_ECONOMY, FREQ_MONTHLY | FREQ_WEEKLY));
        this.sock.write(pollPacket(UPDATE_CLIENT_INFO));
        this.sock.write(pollPacket(UPDATE_COMPANY_INFO));
        this.sock.write(pollPacket(UPDATE_COMPANY_ECONOMY));
        break;
      }
      case PKT_SERVER_DATE:
        this.state.date = r.u32();
        this.emitState();
        break;
      case PKT_SERVER_CLIENT_INFO: {
        const id = r.u32();
        const hostname = r.str();
        const name = r.str();
        const language = r.u8();
        const joinDate = r.u32();
        const company = r.u8();
        this.state.clients[id] = { id, hostname, name, language, joinDate, company };
        this.emitState();
        break;
      }
      case PKT_SERVER_CLIENT_UPDATE: {
        const id = r.u32();
        const name = r.str();
        const company = r.u8();
        const existing = this.state.clients[id] || { id };
        existing.name = name;
        existing.company = company;
        this.state.clients[id] = existing;
        this.emitState();
        break;
      }
      case PKT_SERVER_CLIENT_QUIT:
      case PKT_SERVER_CLIENT_ERROR: {
        const id = r.u32();
        delete this.state.clients[id];
        this.emitState();
        break;
      }
      case PKT_SERVER_COMPANY_INFO: {
        const id = r.u8();
        const name = r.str();
        const manager = r.str();
        const colour = r.u8();
        const passwordProtected = r.u8() === 1;
        const inauguratedYear = r.u32();
        const isAI = r.u8() === 1;
        this.state.companies[id] = {
          id, name, manager, colour, passwordProtected, inauguratedYear, isAI,
        };
        this.emitState();
        break;
      }
      case PKT_SERVER_COMPANY_UPDATE: {
        const id = r.u8();
        const name = r.str();
        const manager = r.str();
        const colour = r.u8();
        const passwordProtected = r.u8() === 1;
        const existing = this.state.companies[id] || { id };
        Object.assign(existing, { name, manager, colour, passwordProtected });
        this.state.companies[id] = existing;
        this.emitState();
        break;
      }
      case PKT_SERVER_COMPANY_NEW:
        // Wait for the full INFO frame instead of building from id alone.
        break;
      case PKT_SERVER_COMPANY_REMOVE: {
        const id = r.u8();
        delete this.state.companies[id];
        this.emitState();
        break;
      }
      case PKT_SERVER_COMPANY_ECONOMY: {
        const id = r.u8();
        const money = r.i64();
        const loan = r.i64();
        const income = r.i64();
        const cargo = r.u16();
        const history = [];
        for (let i = 0; i < 2; i++) {
          history.push({
            value: r.i64(),
            performance: r.u16(),
            cargo: r.u16(),
          });
        }
        const co = this.state.companies[id] || { id };
        co.economy = { money, loan, income, cargo, history };
        this.state.companies[id] = co;
        this.emitState();
        break;
      }
      case PKT_SERVER_NEWGAME:
      case PKT_SERVER_SHUTDOWN:
        this.state.clients = {};
        this.state.companies = {};
        this.emitState();
        break;
      case PKT_SERVER_FULL:
      case PKT_SERVER_BANNED:
      case PKT_SERVER_ERROR:
        console.log('[live] admin rejected/error:', type, payload[0]);
        this.sock.destroy();
        break;
    }
  }
}

module.exports = { LiveAdmin };
