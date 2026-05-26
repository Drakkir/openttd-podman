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

function fmtCompany(id) {
  if (id === 255) return 'spectator';
  return 'company ' + (id + 1);
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

connect();
