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

let lastMapTs = 0;
let lastState = null;
function renderState(state) {
  lastState = state;
  if (state.mapTs && state.mapTs !== lastMapTs) {
    lastMapTs = state.mapTs;
    const img = $('#map-img');
    if (img) {
      img.src = '/api/screenshot/live-map.png?t=' + state.mapTs;
      img.hidden = false;
      $('#map-empty').classList.add('hidden');
    }
  }
  const status = $('#conn-status');
  if (state.connected) {
    status.classList.add('online');
    status.title = 'Live admin connected';
  } else {
    status.classList.remove('online');
    status.title = 'Admin port unreachable';
  }

  const yearPart = state.year != null ? ` — year ${state.year}` : '';
  $('#server-info').textContent = state.serverName
    ? `${state.serverName} (${state.serverVersion || 'unknown version'})${yearPart}`
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

  // Economy chart
  renderEconomyChart(state);

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

function renderEconomyChart(state) {
  const metric = $('#econ-metric').value;
  const chart = $('#econ-chart');
  if (!chart) return;
  const history = state.economyHistory || {};
  const ids = Object.keys(history).sort();
  // Find global time + value range
  // X axis is OpenTTD calendar days (gameDate); fall back to wall-clock ts if absent.
  const xOf = pt => (pt.gameDate != null ? pt.gameDate : pt.ts);
  let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const id of ids) {
    for (const pt of history[id]) {
      const x = xOf(pt);
      if (x < tMin) tMin = x;
      if (x > tMax) tMax = x;
      const v = pt[metric] ?? 0;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }
  chart.innerHTML = '';
  if (tMin === Infinity) return;
  if (vMin === vMax) { vMin -= 1; vMax += 1; }
  const W = 800, H = 240, PAD_L = 38, PAD_R = 6, PAD_T = 8, PAD_B = 18;
  const xScale = t => PAD_L + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - PAD_L - PAD_R);
  const yScale = v => H - PAD_B - ((v - vMin) / (vMax - vMin)) * (H - PAD_T - PAD_B);

  const ns = 'http://www.w3.org/2000/svg';
  function svg(name, attrs, text) {
    const el = document.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    return el;
  }
  // Y zero-line
  if (vMin <= 0 && vMax >= 0) {
    chart.appendChild(svg('line', {
      x1: PAD_L, x2: W - PAD_R, y1: yScale(0), y2: yScale(0),
      stroke: '#d6d3d1', 'stroke-dasharray': '3,3',
    }));
  }
  // X-axis labels: OpenTTD calendar date (days → "YYYY MMM"). Few labels if
  // the span is short so they don't repeat.
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtGameDate = d => {
    const year = Math.floor(d / 365.25);
    const dayOfYear = d - Math.floor(year * 365.25);
    const month = Math.min(11, Math.max(0, Math.floor(dayOfYear / 30.4)));
    return `${year} ${MONTHS[month]}`;
  };
  for (let i = 0; i <= 4; i++) {
    const t = tMin + (tMax - tMin) * i / 4;
    const x = xScale(t);
    chart.appendChild(svg('text', {
      x, y: H - 4, 'text-anchor': i === 0 ? 'start' : (i === 4 ? 'end' : 'middle'),
      'font-size': '10', fill: '#78716c',
    }, fmtGameDate(t)));
    chart.appendChild(svg('line', {
      x1: x, x2: x, y1: PAD_T, y2: H - PAD_B,
      stroke: '#f5f5f4',
    }));
  }
  // Y-axis value labels (top, mid, bottom)
  const fmtVal = v => Math.abs(v) >= 1e6 ? (v/1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v/1e3).toFixed(0) + 'k' : String(Math.round(v));
  for (const v of [vMin, (vMin + vMax) / 2, vMax]) {
    chart.appendChild(svg('text', {
      x: PAD_L - 4, y: yScale(v) + 4, 'text-anchor': 'end',
      'font-size': '10', fill: '#78716c',
    }, fmtVal(v)));
  }

  // Polyline per company — colour cross-references the Companies table.
  // Each line carries a <title> so hovering shows the company name + last value.
  const metricLabel = $('#econ-metric').selectedOptions[0]?.text || metric;
  const fmtMoneyShort = v => {
    const a = Math.abs(v);
    if (a >= 1e9) return (v/1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (v/1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (v/1e3).toFixed(0) + 'k';
    return String(v);
  };
  for (const id of ids) {
    const co = (state.companies || {})[id];
    const colour = COMPANY_COLOURS[co?.colour] || '#999';
    const pts = history[id].map(p => `${xScale(xOf(p)).toFixed(1)},${yScale(p[metric] ?? 0).toFixed(1)}`).join(' ');
    const last = history[id][history[id].length - 1]?.[metric] ?? 0;
    const name = co?.name || ('Company ' + (parseInt(id) + 1));
    // Wider transparent hit-line so the thin visible line is easier to hover,
    // with a custom tooltip that shows immediately (no native title delay).
    const hit = svg('polyline', {
      points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': '12',
    });
    const label = `${name} — ${metricLabel}: ${fmtMoneyShort(last)}`;
    const tip = $('#econ-tip');
    hit.addEventListener('mouseenter', () => { tip.textContent = label; tip.hidden = false; });
    hit.addEventListener('mousemove', e => { tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; });
    hit.addEventListener('mouseleave', () => { tip.hidden = true; });
    chart.appendChild(hit);
    chart.appendChild(svg('polyline', {
      points: pts, fill: 'none', stroke: colour, 'stroke-width': '2',
      'pointer-events': 'none',
    }));
  }
}

$('#econ-metric').addEventListener('change', () => {
  if (lastState) renderEconomyChart(lastState);
});

$('#refresh-map').addEventListener('click', refreshMap);

async function refreshAiList() {
  const sel = $('#ai-pick');
  try {
    const r = await fetch('/api/list-ai');
    const data = await r.json();
    sel.innerHTML = '';
    if (!data.ais || data.ais.length === 0) {
      // No AIs installed → hide spawn/dropdown, show install
      sel.hidden = true;
      $('#spawn-ai').hidden = true;
      $('#install-ai').hidden = false;
    } else {
      sel.hidden = false;
      $('#spawn-ai').hidden = false;
      $('#install-ai').hidden = true;
      sel.appendChild(el('option', { value: '' }, 'Random'));
      for (const ai of data.ais) sel.appendChild(el('option', { value: ai }, ai));
    }
  } catch {}
}
refreshAiList();

$('#spawn-ai').addEventListener('click', async () => {
  const btn = $('#spawn-ai');
  const sel = $('#ai-pick');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const r = await fetch('/api/spawn-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sel.value || '' }),
    });
    const data = await r.json().catch(() => ({}));
    if (!data.ok) throw new Error((data.error || 'HTTP ' + r.status) + (data.hint ? '\n\n' + data.hint : ''));
  } catch (e) {
    alert('Spawn AI failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Spawn AI';
  }
});

$('#install-ai').addEventListener('click', async () => {
  const btn = $('#install-ai');
  btn.disabled = true;
  btn.textContent = 'Installing…';
  try {
    const r = await fetch('/api/install-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: 'AdmiralAI' }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'HTTP ' + r.status);
    alert('Installed: ' + data.installed + '. May need a server restart to register.');
    setTimeout(refreshAiList, 2000);
  } catch (e) {
    alert('Install failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Install default AI';
  }
});

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
