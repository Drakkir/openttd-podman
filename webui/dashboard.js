'use strict';

function $(sel) { return document.querySelector(sel); }
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

// OpenTTD company colour palette (matches Colours enum in src/core/colour.h).
const COMPANY_COLOURS = [
  '#465a99', // dark blue
  '#76a55f', // pale green
  '#8c5a64', // pink
  '#ffe66b', // yellow
  '#ee2b2b', // red
  '#dddddd', // white
  '#5a463d', // dark brown
  '#b87842', // light brown
  '#ff8c1f', // orange
  '#a55cc8', // purple
  '#b4b428', // mauve (close)
  '#28a0a0', // dark teal
  '#5cbcd4', // light blue
  '#286f28', // dark green
  '#5cbe5c', // green
  '#1c1c1c', // dark grey/cream actually
];

function fmtCompany(id) {
  if (id === 255) return 'spectator';
  return 'company ' + (id + 1);
}

function fmtMoney(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(0) + 'k';
  return String(v);
}

function renderState(state) {
  const status = $('#conn-status');
  if (state.connected) {
    status.classList.add('online');
    status.title = 'Live admin connected';
  } else {
    status.classList.remove('online');
    status.title = 'Admin port unreachable';
  }

  $('#server-info').textContent = state.serverName
    ? `${state.serverName} (${state.serverVersion || 'unknown version'})`
    : 'No server info yet';

  const clients = Object.values(state.clients || {}).sort((a, b) => a.id - b.id);
  $('#player-count').textContent = String(clients.length);

  const tbody = $('#players tbody');
  tbody.innerHTML = '';
  for (const c of clients) {
    tbody.appendChild(el('tr', {},
      el('td', {}, String(c.id)),
      el('td', {}, c.name || '—'),
      el('td', {}, fmtCompany(c.company)),
      el('td', {}, c.hostname || '—'),
      el('td', {}, c.joinDate ? String(c.joinDate) : '—'),
    ));
  }
  $('#no-players').classList.toggle('hidden', clients.length > 0);

  const companies = Object.values(state.companies || {}).sort((a, b) => a.id - b.id);
  $('#company-count').textContent = String(companies.length);
  const cTbody = document.querySelector('#companies tbody');
  cTbody.innerHTML = '';
  for (const co of companies) {
    const colour = COMPANY_COLOURS[co.colour] || '#999';
    const swatch = el('span', { class: 'colour-swatch', style: 'background:' + colour });
    const econ = co.economy || {};
    const lastYear = econ.history && econ.history[0] || {};
    cTbody.appendChild(el('tr', {},
      el('td', {}, String(co.id + 1)),
      el('td', {}, swatch),
      el('td', {}, co.name || '—'),
      el('td', {}, co.manager || '—'),
      el('td', {}, co.isAI ? 'AI' : 'Human'),
      el('td', {}, co.inauguratedYear ? String(co.inauguratedYear) : '—'),
      el('td', { class: 'money' }, fmtMoney(econ.money)),
      el('td', { class: 'money' }, fmtMoney(econ.loan)),
      el('td', { class: 'money' }, fmtMoney(econ.income)),
      el('td', { class: 'money' }, econ.cargo != null ? String(econ.cargo) : '—'),
      el('td', {}, lastYear.performance != null ? String(lastYear.performance) : '—'),
    ));
  }
  $('#no-companies').classList.toggle('hidden', companies.length > 0);

  // Chat
  const chat = state.chat || [];
  $('#chat-count').textContent = String(chat.length);
  const log = $('#chat-log');
  // Render only new messages — keep scroll position unless user is at bottom.
  if (log.childElementCount !== chat.length) {
    const wasAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 32;
    log.innerHTML = '';
    for (const m of chat) {
      const client = state.clients && state.clients[m.clientId];
      const who = client ? client.name : ('client #' + m.clientId);
      const t = new Date(m.ts);
      const stamp = t.toTimeString().slice(0, 8);
      log.appendChild(el('div', { class: 'chat-line' },
        el('span', { class: 'chat-ts' }, stamp),
        el('span', { class: 'chat-who' }, who + ':'),
        el('span', { class: 'chat-msg' }, m.message),
      ));
    }
    if (wasAtBottom) log.scrollTop = log.scrollHeight;
  }
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/api/live-ws');
  ws.onmessage = ev => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'state') renderState(msg.state);
    } catch (e) { console.error('bad ws frame', e); }
  };
  ws.onclose = () => {
    $('#conn-status').classList.remove('online');
    $('#conn-status').title = 'WebSocket closed — reconnecting…';
    setTimeout(connect, 2000);
  };
  ws.onerror = () => { /* close handler will reconnect */ };
}

async function refreshMap() {
  const btn = $('#refresh-map');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const r = await fetch('/api/map-screenshot', { method: 'POST' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
    const img = $('#map-img');
    img.src = '/api/screenshot/live-map.png?t=' + (data.ts || Date.now());
    img.hidden = false;
    $('#map-empty').classList.add('hidden');
  } catch (e) {
    $('#map-empty').textContent = 'Map snapshot failed: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh';
  }
}

$('#refresh-map').addEventListener('click', refreshMap);

$('#chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  $('#chat-send').disabled = true;
  try {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    input.value = '';
  } catch (err) {
    alert('Send failed: ' + err.message);
  } finally {
    $('#chat-send').disabled = false;
    input.focus();
  }
});

connect();
