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

let lastState = null;
let lastChatKey = '';
// mapIndex points into state.mapHistory; null means "stick to latest".
let mapIndex = null;
function renderMap(state) {
  const history = state.mapHistory || [];
  const img = $('#map-img');
  const empty = $('#map-empty');
  const yearLabel = $('#map-year');
  const prev = $('#map-prev');
  const next = $('#map-next');
  if (history.length === 0) {
    img.hidden = true;
    empty.classList.remove('hidden');
    yearLabel.textContent = '—';
    prev.disabled = true;
    next.disabled = true;
    return;
  }
  // Default: stick to latest. User can pin via prev/next.
  const idx = mapIndex == null ? history.length - 1 : Math.min(mapIndex, history.length - 1);
  const entry = history[idx];
  img.src = '/api/screenshot/' + entry.file + '?t=' + entry.ts;
  img.hidden = false;
  empty.classList.add('hidden');
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  yearLabel.textContent = entry.month != null
    ? `${entry.year}-${MONTHS[entry.month]}`
    : String(entry.year);
  prev.disabled = idx === 0;
  next.disabled = idx === history.length - 1;
}
function renderState(state) {
  lastState = state;
  // renderMap cache-busts per entry via entry.ts, so it's safe to call on
  // every frame; no separate change-gate needed.
  if (state.mapHistory) renderMap(state);
  const status = $('#conn-status');
  // Match the config page's three-state dot: green = openttd connected,
  // orange = api up but openttd unreachable, grey = no WebSocket frames yet.
  status.classList.remove('online', 'warning');
  if (state.connected) {
    status.classList.add('online');
    status.title = 'Live admin connected';
  } else {
    status.classList.add('warning');
    status.title = 'OpenTTD admin port unreachable';
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
  // Re-render when the contents change. The server caps the ring at 100, so a
  // plain length check freezes once full (length pins at 100). Key on first +
  // last message ts + length: at the cap the window still slides each new
  // message, so first/last ts change even though length stays 100.
  const chatKey = chat.length
    ? `${chat.length}:${chat[0].ts}:${chat[chat.length - 1].ts}`
    : '0';
  if (chatKey !== lastChatKey) {
    lastChatKey = chatKey;
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
    const s = $('#conn-status');
    s.classList.remove('online', 'warning');
    s.title = 'WebSocket closed — reconnecting…';
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
    // Snap back to latest after a manual refresh so the user sees what
    // they just captured, even if they were browsing older snapshots.
    mapIndex = null;
    // The WebSocket broadcast will deliver the new mapHistory; renderMap
    // updates from there. If lastState is fresh we can render immediately.
    if (lastState && data.history) {
      lastState.mapHistory = data.history;
      renderMap(lastState);
    }
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
  // Find global time + value range. X axis is OpenTTD calendar days
  // (gameDate). Points missing gameDate get skipped — wall-clock ts must
  // never leak into a game-date formatter. The window dropdown clips
  // visible points to the last N game-years.
  const xOf = pt => pt.gameDate;
  const windowYears = parseInt($('#econ-window')?.value || '0', 10);
  let cutoff = null;
  if (windowYears > 0 && state.date != null) {
    cutoff = state.date - Math.round(windowYears * 365.25);
  }
  const visiblePoints = id => (history[id] || []).filter(p =>
    typeof p.gameDate === 'number' && (cutoff == null || p.gameDate >= cutoff)
  );
  let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const id of ids) {
    for (const pt of visiblePoints(id)) {
      const x = xOf(pt);
      if (x < tMin) tMin = x;
      if (x > tMax) tMax = x;
      const v = pt[metric] ?? 0;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }
  // X axis spans the chosen window even when data is sparse. For "All"
  // (cutoff=null) we fall back to the earliest company's inauguratedYear
  // as a proxy for game-start year so the axis reads "1950 → now" instead
  // of just "wherever the oldest ring point sits".
  if (state.date != null) {
    tMax = state.date;
    if (cutoff != null) {
      tMin = cutoff;
    } else if (typeof state.startingYear === 'number') {
      // "All" anchors to the server's configured start year so a scenario
      // that begins in 1970 shows an axis from 1970, not from when the
      // first company was inaugurated.
      tMin = state.startingYear * 365.25;
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
  // X-axis labels: OpenTTD calendar date (days) → "YYYY-MM-DD" so weekly
  // economy ticks within the same month don't render as identical labels.
  const fmtGameDate = d => {
    const year = Math.floor(d / 365.25);
    const dayOfYear = Math.max(0, Math.floor(d - year * 365.25));
    const month = Math.min(11, Math.floor(dayOfYear / 30.4));
    // Clamp to 30: the model is only month-accurate (30.4-day buckets), so
    // without this the last bucket of the year can produce day 31/32.
    const dayOfMonth = Math.min(30, Math.max(1, dayOfYear - Math.floor(month * 30.4) + 1));
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(dayOfMonth).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
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

  // Polyline per company. Hover snaps a crosshair to the nearest data
  // point on that company's line and shows date + exact value at the
  // hovered point.
  const metricLabel = $('#econ-metric').selectedOptions[0]?.text || metric;
  const fmtMoneyShort = v => {
    const a = Math.abs(v);
    if (a >= 1e9) return (v/1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (v/1e6).toFixed(2) + 'M';
    if (a >= 1e3) return (v/1e3).toFixed(0) + 'k';
    return String(v);
  };
  // Shared crosshair guide + dot, positioned by whichever line is hovered.
  const guide = svg('line', {
    x1: 0, x2: 0, y1: PAD_T, y2: H - PAD_B,
    stroke: '#a8a29e', 'stroke-dasharray': '3,3',
    'pointer-events': 'none', visibility: 'hidden',
  });
  const dot = svg('circle', {
    r: 4, fill: '#fff', stroke: '#1c1917', 'stroke-width': '1.5',
    'pointer-events': 'none', visibility: 'hidden',
  });
  const tip = $('#econ-tip');
  const hideCrosshair = () => {
    tip.hidden = true;
    guide.setAttribute('visibility', 'hidden');
    dot.setAttribute('visibility', 'hidden');
  };
  for (const id of ids) {
    const points = visiblePoints(id);
    if (points.length === 0) continue;
    const co = (state.companies || {})[id];
    const colour = COMPANY_COLOURS[co?.colour] || '#999';
    const pts = points.map(p => `${xScale(xOf(p)).toFixed(1)},${yScale(p[metric] ?? 0).toFixed(1)}`).join(' ');
    const name = co?.name || ('Company ' + (parseInt(id) + 1));
    const hit = svg('polyline', {
      points: pts, fill: 'none', stroke: 'transparent', 'stroke-width': '12',
    });
    hit.addEventListener('mousemove', e => {
      const ctm = chart.getScreenCTM();
      if (!ctm) return;
      const svgPt = chart.createSVGPoint();
      svgPt.x = e.clientX; svgPt.y = e.clientY;
      const local = svgPt.matrixTransform(ctm.inverse());
      let nearest = null, bestDx = Infinity;
      for (const p of points) {
        const dx = Math.abs(xScale(xOf(p)) - local.x);
        if (dx < bestDx) { bestDx = dx; nearest = p; }
      }
      if (!nearest) return;
      const nx = xScale(xOf(nearest));
      const ny = yScale(nearest[metric] ?? 0);
      guide.setAttribute('x1', nx);
      guide.setAttribute('x2', nx);
      guide.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', nx);
      dot.setAttribute('cy', ny);
      dot.setAttribute('stroke', colour);
      dot.setAttribute('visibility', 'visible');
      tip.textContent = `${name} — ${fmtGameDate(xOf(nearest))} — ${metricLabel}: ${fmtMoneyShort(nearest[metric] ?? 0)}`;
      tip.style.left = e.clientX + 'px';
      tip.style.top = e.clientY + 'px';
      tip.hidden = false;
    });
    hit.addEventListener('mouseleave', hideCrosshair);
    chart.appendChild(hit);
    chart.appendChild(svg('polyline', {
      points: pts, fill: 'none', stroke: colour, 'stroke-width': '2',
      'pointer-events': 'none',
    }));
  }
  chart.appendChild(guide);
  chart.appendChild(dot);
}

$('#econ-metric').addEventListener('change', () => {
  if (lastState) renderEconomyChart(lastState);
});
$('#econ-window').addEventListener('change', () => {
  if (lastState) renderEconomyChart(lastState);
});

$('#refresh-map').addEventListener('click', refreshMap);
$('#map-prev').addEventListener('click', () => {
  const hist = (lastState && lastState.mapHistory) || [];
  if (hist.length === 0) return;
  const cur = mapIndex == null ? hist.length - 1 : mapIndex;
  mapIndex = Math.max(0, cur - 1);
  renderMap(lastState);
});
$('#map-next').addEventListener('click', () => {
  const hist = (lastState && lastState.mapHistory) || [];
  if (hist.length === 0) return;
  const cur = mapIndex == null ? hist.length - 1 : mapIndex;
  if (cur >= hist.length - 1) { mapIndex = null; renderMap(lastState); return; }
  mapIndex = cur + 1;
  if (mapIndex === hist.length - 1) mapIndex = null; // back to "follow latest"
  renderMap(lastState);
});

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

async function refreshServerStatus() {
  try {
    const r = await fetch('/api/server/status');
    const d = await r.json();
    const badge = $('#srv-state');
    const start = $('#srv-start');
    const stop = $('#srv-stop');
    badge.classList.remove('running', 'stopped');
    if (d.running) {
      badge.textContent = 'running';
      badge.classList.add('running');
      start.hidden = true;
      stop.hidden = !d.socket && !d.connected; // need rcon to quit
    } else {
      badge.textContent = d.status || 'stopped';
      badge.classList.add('stopped');
      start.hidden = !d.socket;       // need socket to start
      stop.hidden = true;
    }
    if (!d.socket) {
      start.title = 'Container socket not mounted; cannot start from here';
      start.disabled = true;
    } else {
      start.title = 'Start the openttd container';
      start.disabled = false;
    }
  } catch {
    $('#srv-state').textContent = '?';
  }
}
refreshServerStatus();
setInterval(refreshServerStatus, 5000);

$('#srv-start').addEventListener('click', async () => {
  const btn = $('#srv-start');
  btn.disabled = true;
  try {
    const r = await fetch('/api/server/start', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
  } catch (e) {
    alert('Start failed: ' + e.message);
  } finally {
    btn.disabled = false;
    refreshServerStatus();
  }
});
$('#srv-stop').addEventListener('click', async () => {
  if (!confirm('Stop the OpenTTD server? Players will be disconnected.')) return;
  const btn = $('#srv-stop');
  btn.disabled = true;
  try {
    const r = await fetch('/api/server/stop', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
  } catch (e) {
    alert('Stop failed: ' + e.message);
  } finally {
    btn.disabled = false;
    setTimeout(refreshServerStatus, 1500);
  }
});

// Server log: SSE stream. Cap UI scrollback at 100 lines.
const LOG_MAX = 100;
let logSrc = null;
function attachLog() {
  const pre = $('#server-log');
  const follow = $('#log-follow');
  if (logSrc) logSrc.close();
  logSrc = new EventSource('/api/logs/openttd');
  logSrc.onmessage = ev => {
    let text;
    try { text = JSON.parse(ev.data); } catch { return; }
    pre.appendChild(document.createTextNode(text + '\n'));
    // Trim to last LOG_MAX lines
    while (pre.childNodes.length > LOG_MAX) pre.removeChild(pre.firstChild);
    if (follow.checked) pre.scrollTop = pre.scrollHeight;
  };
  logSrc.onerror = () => {
    // EventSource auto-reconnects; nothing else to do.
  };
}
$('#log-clear').addEventListener('click', () => {
  $('#server-log').innerHTML = '';
});
attachLog();

connect();
