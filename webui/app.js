'use strict';

const GROUPS_ORDER = ['Server', 'Klient', 'Övrigt'];

// Default group per section. Per-key overrides below take precedence.
const SECTION_GROUP = {
  game_creation: 'Server', difficulty: 'Server', economy: 'Server',
  station: 'Server', vehicle: 'Server', construction: 'Server',
  order: 'Server', ai: 'Server', script: 'Server',
  linkgraph: 'Server', pf: 'Server',
  network: 'Server',
  gui: 'Klient', news_display: 'Klient', sound: 'Klient', music: 'Klient',
  misc: 'Övrigt', locale: 'Övrigt',
};

// All network* .ini files write into the [network] cfg section, so per-key overrides
// here move client-side keys out of Server → Klient.
const KEY_OVERRIDES = {
  'network.client_name': 'Klient',
  'network.connect_to_ip': 'Klient',
  'network.last_joined': 'Klient',
  'network.last_host': 'Klient',
  'network.last_port': 'Klient',
  'network.network_id': 'Klient',
  'network.servers': 'Klient',
  'network.participate_survey': 'Klient',
  'network.use_relay_service': 'Klient',
  'network.client_secret_key': 'Klient',
  'network.client_public_key': 'Klient',
  'network.no_http_content_downloads': 'Klient',
};

function groupOf(section, key) {
  return KEY_OVERRIDES[section + '.' + key]
      || SECTION_GROUP[section]
      || 'Övrigt';
}

// Manual help-text fallbacks for settings that lack strhelp in OpenTTD source.
const HELP_OVERRIDES = {
  'difficulty.max_no_competitors': 'Max antal AI-konkurrenter (datorstyrda företag) som kan finnas samtidigt. 0 = inga AI-spelare.',
  'difficulty.competitors_interval': 'Hur ofta nya AI-konkurrenter dyker upp, mätt i månader mellan spawn-försök.',
  'difficulty.competitor_start_time': 'Föråldrad: när AI-konkurrenter började dyka upp i gamla sparfiler. Påverkar inte nya spel.',
  'difficulty.competitor_intelligence': 'Föråldrad: gammal AI-svårighetsnivå. Numera styrs AI:s beteende per AI-skript.',
  'difficulty.number_towns': 'Tätheten av städer på kartan. Välj "Egna" för att ange exakt antal via custom_town_number.',
  'difficulty.number_industries': 'Tätheten av industrier på kartan. "Endast finansiering" = inga spontana, måste fonderas av spelare. "Egna" = ange exakt antal via custom_industry_number.',
  'difficulty.quantity_sea_lakes': 'Mängd hav och sjöar på kartan. "Egna" = ange procent vatten via custom_sea_level.',
  'difficulty.economy': 'Smart ekonomi: industrier kan stängas/öppnas dynamiskt baserat på efterfrågan.',
  'difficulty.line_reverse_mode': 'När tåg är tillåtna att vända: vid stationer eller när som helst på spåret.',
  'difficulty.initial_interest': 'Bank-räntesats för lån (i procent per år, fast under hela spelet). Dubbeltjänst: när economy.inflation är på används samma värde också som ÅRLIG pris-inflation, och betalnings-inflation = detta värde minus 1. Default 2 → 2% pris-inflation, 1% intäkts-inflation. Skillnaden på 1 procentenhet är varför långa spel blir svårare över tid (intäkter halkar efter kostnader). Range 2–4.',
  'difficulty.max_loan': 'Maxgräns för totalt lån. Värdet är i intern enhet (GBP-bas) — OpenTTD multiplicerar med den valuta spelaren valt för visning. Om economy.inflation är på skalas det effektiva taket upp över tid i takt med inflationen.',
  'difficulty.construction_cost': 'Skala på konstruktions- och fordonsinköpskostnader. Multiplikatorerna i koden: Låg = 0,75x, Medium = 1,0x, Hög = 1,125x — så skillnaden Låg vs Hög är ca 50% mer. Påverkar: räls, vägar, stationer, signaler, broar, tunnlar, terraforming, fordon. OBS: påverkar inte löpande driftkostnader (det är vehicle_costs).',
  'difficulty.vehicle_costs': 'Skala på löpande driftkostnader för fordon (bränsle, slitage, lön). Samma multiplikatorer som construction_cost: Låg = 0,75x, Medium = 1,0x, Hög = 1,125x — ca 50% skillnad mellan Låg och Hög. Påverkar speciellt dyra fordon (flyg) och förlust-rutter.',
  'vehicle.servint_trains': 'Default-värde för hur ofta nya tåg åker till depå för service. Konkret: fordon skickas automatiskt till närmaste depå när intervallet löpt ut, vilket återställer tillförlitlighet och fixar haverier. Värdet anges i dagar (eller % beroende på servint_ispercent). 0 = inget auto-service (fordon åker bara om du sätter en service-order manuellt). Lägre intervall = mer pålitliga fordon men mer "borta från jobbet"-tid. Default brukar vara 150 dagar.',
  'vehicle.servint_roadveh': 'Default-värde för service-intervall på nya lastbilar/bussar. Se servint_trains för full förklaring. Default brukar vara 150 dagar.',
  'vehicle.servint_ships': 'Default-värde för service-intervall på nya båtar. Båtar gör typiskt få stop, så ett kort intervall kan tvinga onödiga depå-besök. Default brukar vara 360 dagar.',
  'vehicle.servint_aircraft': 'Default-värde för service-intervall på nya flygplan. Flyg har naturlig service på flygplatser, så detta påverkar bara den extra schemalagda servicen. Default brukar vara 150 dagar.',
  'vehicle.servint_ispercent': 'Av: intervall mäts i dagar (t.ex. 150 = var 150:e dag). På: intervall mäts som procent av fordonets max-pålitlighet (t.ex. 50 = service när tillförlitligheten sjunkit till 50% av max). Procentläge är ofta smartare — gamla fordon servas oftare, nya sällan.',
  'economy.infinite_money': 'Företag kan spendera fritt utan kontogräns och kan inte gå i konkurs. Tar bort hela ekonomi-utmaningen.',
  'economy.infrastructure_maintenance': 'Underhållskostnader för all infrastruktur (räls, vägar, signaler, stationer, flygplatser, kanaler). Skalas super-linjärt med nätverkets storlek — stora företag straffas hårdare. Balanserar långsiktig snöbollning. Obs: straffet träffar tåg-imperier mycket hårdare än flyg eftersom flygplatser har få tiles men hög intäkt — håll vehicle.plane_speed på default (4 = 1/4 hastighet) så flyget förblir balanserat. Sätt den INTE lägre på multiplayerservrar.',
  'vehicle.plane_speed': 'Hastighetsdelare för flyg — värdet är delaren. 1 = full hastighet (OP, mycket lönsamt), 2 = halv, 3 = en tredjedel, 4 = en fjärdedel (default — OpenTTD slår redan ner flyget för att balansera mot tåg/lastbilar). Sänk bara om du vill ha snabbare/lönsammare flyg, höj inte (max är 4).',
  'economy.town_cargo_scale': 'Procentmultiplikator för hur mycket gods (passagerare, post) städer producerar. Range 15–300%, default 100%. Höj för mer trafik, sänk för lugnare tempo.',
  'economy.industry_cargo_scale': 'Procentmultiplikator för hur mycket råvaror/produkter industrier producerar. Range 15–300%, default 100%. Påverkar bara produktion — inte vad industrier accepterar.',
  'economy.timekeeping_units': 'Två klockor körs parallellt i spelet: en ekonomi-klocka (styr produktion/finanser) och en kalender-klocka (styr när fordon introduceras). Kalender = klassisk OpenTTD, båda går i takt: 1 år = 12 månader. Väggklocka = ekonomin tickar per realtidsminut, 12 minuter = 1 ekonomi-period. Kalendern är då frikopplad och styrs separat av minutes_per_calendar_year. Fordon kommer i sin kalendermåltid oavsett spelläge.',
  'economy.minutes_per_calendar_year': 'I Väggklocksläge: hur många realtidsminuter ett kalenderår tar. Default 12 min/år (samma takt som ekonomin). Lägre = kalendern går snabbare (fordon kommer fortare, men ekonomin hinner med fler perioder per kalenderår). Högre = kalendern släpar. 0 = kalendern fryses helt (samma fordon hela spelet). Påverkar inget i Kalenderläge.',
  'economy.dist_local_authority': 'Maxavstånd (i tiles) inom vilket en stads myndighet anser att din verksamhet räknas som "lokal".',
  'economy.mod_road_rebuild': 'Hur ofta städer river och bygger om sina vägar. Lägre värde = oftare rivningar.',
  'economy.station_noise_level': 'Om flygplatser genererar buller som påverkar stadens tillstånd. Av = obegränsat byggande.',
  'economy.town_noise_population[0]': 'Bullertolerans per småstad (befolkning under första tröskeln). 1 enhet per litet flygfält.',
  'economy.town_noise_population[1]': 'Bullertolerans per medelstor stad. Höj för fler flygplatser i mindre städer.',
  'economy.town_noise_population[2]': 'Bullertolerans per storstad.',
  'economy.town_noise_population[3]': 'Bullertolerans per metropol.',
  'game_creation.map_x': 'Kartans bredd som logaritm-2. Värde 8 = 256 tiles, 11 = 2048 tiles, 12 = 4096 tiles.',
  'game_creation.map_y': 'Kartans höjd som logaritm-2. Värde 8 = 256 tiles, 11 = 2048 tiles, 12 = 4096 tiles.',
  'game_creation.heightmap_height': 'Max höjdnivå vid import av PNG/BMP-heightmap. Gråvärden skalas upp till denna höjd.',
  'game_creation.water_borders': 'Bitfält: vilka kartkanter som ska vara vatten (1=NV, 2=NO, 4=SO, 8=SV). 15 = alla.',
  'game_creation.water_border_presets': 'Förinställda kombinationer av vattenkanter — påverkar bara UI:t i kart-genereringsdialogen.',
  'game_creation.custom_town_number': 'Exakt antal städer på kartan (om man valt "anpassat" antal).',
  'game_creation.custom_industry_number': 'Exakt antal industrier på kartan (om man valt "anpassat" antal).',
  'game_creation.custom_terrain_type': 'Exakt högsta terränghöjd (om man valt "anpassad höjd" som terrängtyp).',
  'game_creation.custom_sea_level': 'Andel vatten i procent (om man valt "anpassad" havsnivå).',
  'game_creation.min_river_length': 'Minsta längd för en flod (i tiles) för att den ska genereras.',
  'game_creation.river_route_random': 'Hur slumpmässigt floder slingrar sig. 0 = rakt mot havet, högre = mer kurvor.',
  'game_creation.se_flat_world_height': 'Starthöjd för en helt platt karta i Scenario Editor (när man väljer "Flat" istället för slumpgenererad terräng). 0 = på havsnivå (allt vatten/strand), 1 = lägsta torra nivå (default), upp till 15. Påverkar inte vanliga genererade kartor — bara när man skapar scenarier manuellt.',
  'vehicle.dynamic_engines': 'Tillåt varje NewGRF att ha egna fordon. Måste ändras innan ny karta skapas.',
  'vehicle.extend_vehicle_life': 'Antal år som fordon förblir köpbara efter att de officiellt pensionerats.',
  'construction.build_on_slopes': 'Tillåt byggande på sluttande mark (annars måste man planera först).',
  'construction.terraform_per_64k_frames': 'Hastighetsgräns för terraforming (modifiering av mark) — antal tiles per 64k frames.',
  'construction.terraform_frame_burst': 'Hur mycket terraforming som kan ackumuleras till en kortare burst.',
  'station.never_expire_airports': 'Flygplatstyper försvinner aldrig från köpmenyn — annars fasas äldre typer ut.',
  'station.modified_catchment': 'Stationer har realistiska upptagningsområden istället för fasta kvadrater.',
  'pf.forbid_90_deg': 'Förbjud 90-graderssvängar (skarpa U-svängar) för tåg och båtar.',
  'pf.path_backoff_interval': 'Hur ofta pathfindern backar och försöker hitta ny väg när den fastnat (i ticks).',
  'order.improved_load': 'Förbättrad lastningslogik: fordon delar last jämnt vid samma station istället för "först till kvarn".',
  'order.gradual_loading': 'Last/lossning sker gradvis under tid istället för momentant.',
  'order.serviceathelipad': 'Helikoptrar servas automatiskt på helipads även utan service-order.',
  'misc.engine_renew_months': 'Hur många månader innan ett fordons pensionsdatum det ska bytas automatiskt. Negativt = efter pensionsdatum.',
  'misc.engine_renew_money': 'Lägsta belopp i kassan för att autoersättning ska genomföras. Värdet är i intern enhet (GBP-bas), multipliceras med spelarens valuta vid visning.',
};

// Per-setting hint that explains what the value actually means.
// Returns a string to append to the help text given a value, or null.
const VALUE_HINTS = {
  'game_creation.map_x': v => `→ ${1 << v} tiles brett`,
  'game_creation.map_y': v => `→ ${1 << v} tiles djupt`,
  'gui.autosave_interval': v => v === 0 ? '→ avstängd' : `→ var ${v}:e minut`,
  'gui.errmsg_duration': v => `→ ${v} sekunder`,
  'gui.hover_delay_ms': v => `→ ${v} ms`,
  'gui.osk_activation': null,
  'economy.dist_local_authority': v => `→ ${v} tiles`,
  'economy.town_growth_rate': v => ({0: 'avstängd', 1: 'långsam', 2: 'normal', 3: 'snabb', 4: 'mycket snabb'})[v],
  'difficulty.max_loan': v => `→ ${(v).toLocaleString('sv-SE')} (intern GBP-bas, visas i spelarens valuta)`,
  'network.max_clients': v => `→ ${v} spelare samtidigt`,
  'network.max_companies': v => `→ ${v} företag`,
  'network.server_port': v => v === 3979 ? '→ standardport' : `→ port ${v}`,
  'network.autoclean_protected': v => v === 0 ? '→ aldrig' : `→ efter ${v} månader`,
  'network.autoclean_novehicles': v => v === 0 ? '→ aldrig' : `→ efter ${v} månader`,
  'network.min_active_clients': v => v === 0 ? '→ pausar inte automatiskt' : `→ behöver ${v} spelare`,
  'network.restart_game_year': v => v === 0 ? '→ aldrig' : `→ år ${v}`,
};

function valueHint(section, key, value) {
  const fn = VALUE_HINTS[section + '.' + key];
  if (typeof fn === 'function') {
    try { const r = fn(value); if (r) return r; } catch {}
  }
  return null;
}

// Render OpenTTD-style format strings like "{COMMA} month{P 0 \"\" s}" with a number.
function formatFmt(fmt, value) {
  if (fmt == null || value == null || value === '' || isNaN(value)) return '';
  const n = Number(value);
  const comma = n.toLocaleString('sv-SE');
  return fmt
    .replace(/\{P\s+\d+\s+([^}]+)\}/g, (_, parts) => {
      const tokens = [...parts.matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]);
      return Math.abs(n) === 1 ? (tokens[0] ?? '') : (tokens[1] ?? tokens[0] ?? '');
    })
    .replace(/\{COMMA\}/g, comma)
    .replace(/\{NUM\}/g, String(n))
    .replace(/\{NBSP\}/g, ' ')
    .replace(/\{CURRENCY_LONG\}/g, comma + ' (intern GBP-bas — multipliceras med vald valuta in-game)')
    .replace(/\{UNITS_YEARS_OR_PERIODS\}/g, comma + ' år')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Wiki link per setting. Exact key match > section prefix.
const WIKI_BASE = 'https://wiki.openttd.org/en/';
const WIKI_KEYS = {
  'game_creation.starting_year': 'Manual/Vehicles',
  'game_creation.ending_year': 'Manual/Vehicles',
  'construction.map_height_limit': 'Manual/Heightmap',
  'game_creation.heightmap_height': 'Manual/Heightmap',
  'game_creation.heightmap_rotation': 'Manual/Heightmap',
  'game_creation.water_borders': 'Manual/Heightmap',
  'game_creation.custom_sea_level': 'Manual/Heightmap',
  'game_creation.land_generator': 'Manual/Heightmap',

  'economy.town_layout': 'Manual/Town',
  'economy.town_growth_rate': 'Manual/Town',
  'economy.found_town': 'Manual/Town',
  'economy.larger_towns': 'Manual/Town',
  'economy.initial_city_size': 'Manual/Town',
  'economy.mod_road_rebuild': 'Manual/Town',
  'economy.town_cargogen_mode': 'Manual/Town',
  'economy.multiple_industry_per_town': 'Manual/Industries',
  'game_creation.custom_town_number': 'Manual/Town',
  'game_creation.custom_industry_number': 'Manual/Industries',

  'difficulty.industry_density': 'Manual/Industries',
  'difficulty.vehicle_breakdowns': 'Manual/Disasters',
  'difficulty.disasters': 'Manual/Disasters',
  'vehicle.plane_crashes': 'Manual/Aircraft',

  'economy.inflation': 'Manual/Economy#inflation',
  'economy.allow_shares': 'Manual/Shares',
  'economy.bribe': 'Manual/Local%20Authority',
  'economy.exclusive_rights': 'Manual/Local%20Authority',
  'economy.dist_local_authority': 'Manual/Local%20Authority',

  'gui.cycle_signal_types': 'Manual/Signals',
  'gui.default_signal_type': 'Manual/Signals',
  'gui.drag_signals_density': 'Manual/Signals',
  'construction.semaphore_build_before': 'Manual/Signals',
};

const WIKI_SECTION_DEFAULTS = {
  pf: 'Manual/Pathfinder',
  linkgraph: 'Manual/Cargodist',
  network: 'Manual/Multiplayer',
  network_private: 'Manual/Multiplayer',
  network_secrets: 'Manual/Multiplayer',
  ai: 'Manual/AI',
  script: 'Manual/Game%20script',
};

function wikiLink(section, key) {
  const exact = WIKI_KEYS[section + '.' + key];
  if (exact) return WIKI_BASE + exact;
  const sec = WIKI_SECTION_DEFAULTS[section];
  if (sec) return WIKI_BASE + sec;
  return null;
}

function computeHint(section, entry, value) {
  // Manual override first
  const manual = valueHint(section, entry.key, value);
  if (manual) return manual;
  // Auto from strval format
  if (entry.fmt && entry.type === 'int') {
    const formatted = formatFmt(entry.fmt, value);
    if (formatted) return '→ ' + formatted;
  }
  // For enum, the dropdown label is already shown
  return '';
}

// Build: group -> section -> [entries]
function buildIndex() {
  const idx = {};
  for (const [section, entries] of Object.entries(SCHEMA)) {
    for (const e of entries) {
      const g = groupOf(section, e.key);
      idx[g] = idx[g] || {};
      idx[g][section] = idx[g][section] || [];
      idx[g][section].push(e);
    }
  }
  return idx;
}

const state = {
  values: {},        // { "section.key": value }
  unknown: {},       // { section: { key: rawString } } — preserve round-trip
  unknownSections: {}, // { sectionName: [ [k,v], ... ] } for unknown sections
  currentGroup: null,
  currentSection: null, // null = show all sections in currentGroup
  showAdvanced: false,
  lang: localStorage.getItem('lang') || 'sv',
  search: '',
};

function $(sel, root = document) { return root.querySelector(sel); }
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function flash(msg) {
  const s = $('#status');
  s.textContent = msg;
  s.classList.add('show');
  clearTimeout(flash._t);
  flash._t = setTimeout(() => s.classList.remove('show'), 2200);
}

function valKey(section, key) { return section + '.' + key; }

function getLabel(entry) {
  return (state.lang === 'sv' && entry.label_sv) || entry.label || entry.key;
}
function getHelp(section, entry) {
  if (state.lang === 'sv') {
    return HELP_OVERRIDES[section + '.' + entry.key] || entry.help_sv || entry.help || '';
  }
  return entry.help || '';
}
function getValues(entry) {
  return (state.lang === 'sv' && entry.values_sv) || entry.values || [];
}

function currentRaw(section, key) {
  const k = section + '.' + key;
  if (k in state.values) return state.values[k];
  const entry = (SCHEMA[section] || []).find(e => e.key === key);
  return entry ? entry.def : null;
}

// Predicates: { 'section.key': () => boolean (true = relevant) }.
// When false, the setting is faded with an "n/a" badge.
const DEPENDENCIES = {
  'game_creation.snow_coverage': () => currentRaw('game_creation', 'landscape') === 1,
  'game_creation.snow_line_height': () => currentRaw('game_creation', 'landscape') === 1,
  'game_creation.desert_coverage': () => currentRaw('game_creation', 'landscape') === 2,
  'game_creation.rainforest_line_height': () => currentRaw('game_creation', 'landscape') === 2,
  'game_creation.lake_size': () => currentRaw('game_creation', 'landscape') !== 3,
  'economy.minutes_per_calendar_year': () => currentRaw('economy', 'timekeeping_units') === 1,
  'game_creation.heightmap_rotation': () => currentRaw('game_creation', 'land_generator') === 0,
  'game_creation.heightmap_height': () => currentRaw('game_creation', 'land_generator') === 0,
  // "Custom" tier in respective dropdown (last enum value)
  'game_creation.custom_town_number': () => currentRaw('difficulty', 'number_towns') === 4,
  'game_creation.custom_industry_number': () => currentRaw('difficulty', 'number_industries') === 6,
  'game_creation.custom_terrain_type': () => currentRaw('difficulty', 'terrain_type') === 5,
  'game_creation.custom_sea_level': () => currentRaw('difficulty', 'quantity_sea_lakes') === 4,
};
const RELEVANCE_NOTES = {
  'game_creation.snow_coverage': 'Bara arktiskt landskap',
  'game_creation.snow_line_height': 'Bara arktiskt landskap',
  'game_creation.desert_coverage': 'Bara tropiskt landskap',
  'game_creation.rainforest_line_height': 'Bara tropiskt landskap',
  'game_creation.lake_size': 'Inte i toyland',
  'economy.minutes_per_calendar_year': 'Bara Väggklocksläge',
  'game_creation.heightmap_rotation': 'Bara vid heightmap-import',
  'game_creation.heightmap_height': 'Bara vid heightmap-import',
  'game_creation.custom_town_number': 'Bara om number_towns = Egna',
  'game_creation.custom_industry_number': 'Bara om number_industries = Egna',
  'game_creation.custom_terrain_type': 'Bara om terrain_type = Egen höjd',
  'game_creation.custom_sea_level': 'Bara om quantity_sea_lakes = Egna',
};

// Override OpenTTD's source category when it's misleading for server admins.
// Source has SC_BASIC for many settings that only matter in specific UI contexts.
const CAT_OVERRIDES = {
  'game_creation.se_flat_world_height': 'advanced', // Scenario Editor only
};

function effectiveCat(section, entry) {
  return CAT_OVERRIDES[section + '.' + entry.key] || entry.cat;
}

function isRelevant(section, entry) {
  const fn = DEPENDENCIES[section + '.' + entry.key];
  return !fn || fn();
}

function refreshRelevance() {
  document.querySelectorAll('.setting').forEach(card => {
    const k = card.dataset.key;
    if (!k) return;
    const i = k.indexOf('.');
    const sec = k.slice(0, i);
    const key = k.slice(i + 1);
    const entry = (SCHEMA[sec] || []).find(e => e.key === key);
    if (entry) card.classList.toggle('irrelevant', !isRelevant(sec, entry));
  });
}
function currentVal(section, entry) {
  const k = valKey(section, entry.key);
  return k in state.values ? state.values[k] : entry.def;
}

function isModified(section, entry) {
  const k = valKey(section, entry.key);
  if (!(k in state.values)) return false;
  return state.values[k] !== entry.def;
}

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  const idx = buildIndex();
  const groups = [...GROUPS_ORDER, ...Object.keys(idx).filter(g => !GROUPS_ORDER.includes(g))];
  for (const group of groups) {
    if (!idx[group]) continue;
    const total = Object.values(idx[group]).reduce((n, arr) => n + arr.length, 0);
    const isCurrentGroup = group === state.currentGroup;
    const groupBtn = el('button', {
      class: 'group-btn' + (isCurrentGroup && !state.currentSection ? ' active' : ''),
      onclick: () => {
        state.currentGroup = group; state.currentSection = null;
        renderNav(); renderSettings();
      },
    }, group, el('span', { class: 'count' }, String(total)));
    nav.appendChild(groupBtn);

    if (isCurrentGroup) {
      const sections = Object.keys(idx[group]).sort();
      for (const sec of sections) {
        const btn = el('button', {
          class: 'section-btn' + (sec === state.currentSection ? ' active' : ''),
          onclick: () => {
            state.currentSection = sec;
            renderNav(); renderSettings();
          },
        }, sec, el('span', { class: 'count' }, String(idx[group][sec].length)));
        nav.appendChild(btn);
      }
    }
  }
}

function renderControl(section, entry) {
  const k = valKey(section, entry.key);
  let inputEl;
  const onChange = (newVal) => {
    state.values[k] = newVal;
    const card = document.querySelector(`[data-key="${k}"]`);
    if (card) {
      card.classList.toggle('modified', isModified(section, entry));
      const hintEl = card.querySelector('.value-hint');
      if (hintEl) hintEl.textContent = computeHint(section, entry, newVal);
    }
    refreshRelevance();
  };
  const v = currentVal(section, entry);
  switch (entry.type) {
    case 'bool': {
      inputEl = el('input', { type: 'checkbox' });
      inputEl.checked = !!v;
      inputEl.onchange = () => onChange(inputEl.checked);
      break;
    }
    case 'enum': {
      inputEl = el('select');
      getValues(entry).forEach((opt, i) => {
        const o = el('option', { value: String(i) }, opt);
        if (i === v) o.selected = true;
        inputEl.appendChild(o);
      });
      inputEl.onchange = () => onChange(parseInt(inputEl.value, 10));
      break;
    }
    case 'int': {
      inputEl = el('input', { type: 'number', value: String(v ?? 0) });
      if (entry.min != null) inputEl.setAttribute('min', String(entry.min));
      if (entry.max != null) inputEl.setAttribute('max', String(entry.max));
      inputEl.onchange = () => onChange(inputEl.value === '' ? '' : Number(inputEl.value));
      break;
    }
    case 'string':
    default: {
      inputEl = el('input', { type: 'text', value: v ?? '' });
      inputEl.onchange = () => onChange(inputEl.value);
      break;
    }
  }
  const reset = el('button', {
    class: 'reset-btn',
    type: 'button',
    title: state.lang === 'sv' ? 'Återställ till default' : 'Reset to default',
    onclick: () => {
      delete state.values[k];
      if (entry.type === 'bool') inputEl.checked = !!entry.def;
      else if (entry.type === 'enum') inputEl.value = String(entry.def ?? 0);
      else if (entry.type === 'string') inputEl.value = entry.def ?? '';
      else inputEl.value = String(entry.def ?? '');
      onChange(entry.def);
    },
  }, '↺');
  return el('span', { class: 'control-wrap' }, inputEl, reset);
}

function renderSettings() {
  const main = $('#settings');
  main.innerHTML = '';
  const idx = buildIndex();
  const q = state.search.toLowerCase();

  // Determine what to render.
  // Search: all groups, all sections matching the query.
  // No search, no group selected: empty state.
  // No search, group selected, no section: all sections of that group with headers.
  // No search, group + section selected: just that section.
  let pairs = []; // [section, entries]

  if (q) {
    for (const [sec, entries] of Object.entries(SCHEMA)) pairs.push([sec, entries]);
  } else if (!state.currentGroup) {
    main.appendChild(el('div', { class: 'empty' },
      `Välj en grupp till vänster. ${SCHEMA_META.total} inställningar i ${SCHEMA_META.sections} sektioner.`));
    return;
  } else {
    const groupIdx = idx[state.currentGroup] || {};
    const sections = state.currentSection ? [state.currentSection] : Object.keys(groupIdx).sort();
    for (const sec of sections) pairs.push([sec, groupIdx[sec] || []]);
  }

  let shown = 0;
  const showHeaders = q || (!state.currentSection);
  for (const [sec, entriesIn] of pairs) {
    const entries = entriesIn.filter(e => {
      if (!q && state.currentGroup && groupOf(sec, e.key) !== state.currentGroup) return false;
      if (!state.showAdvanced && effectiveCat(sec, e) !== 'basic') return false;
      if (q) {
        const hay = (e.key + ' ' + (e.label || '') + ' ' + (e.help || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (!entries.length) continue;
    if (showHeaders) main.appendChild(el('div', { class: 'section-title' }, `[${sec}]`));

    for (const entry of entries) {
      shown++;
      const k = valKey(sec, entry.key);
      const card = el('div', { class: 'setting', 'data-key': k });
      if (isModified(sec, entry)) card.classList.add('modified');
      if (!isRelevant(sec, entry)) card.classList.add('irrelevant');
      const labelChildren = [getLabel(entry)];
      const cat = effectiveCat(sec, entry);
      if (cat === 'expert' || cat === 'advanced') {
        labelChildren.push(el('span', { class: 'badge ' + cat }, cat));
      }
      const relevanceNote = RELEVANCE_NOTES[sec + '.' + entry.key];
      if (relevanceNote) {
        labelChildren.push(el('span', { class: 'badge na' }, relevanceNote));
      }
      if (entry.file && entry.file !== 'openttd') {
        labelChildren.push(el('span', { class: 'badge file' }, '→ ' + entry.file + '.cfg'));
      }
      labelChildren.push(el('span', { class: 'key' }, entry.key));
      const wiki = wikiLink(sec, entry.key);
      if (wiki) {
        labelChildren.push(el('a', {
          class: 'wiki-link',
          href: wiki,
          target: '_blank',
          rel: 'noopener',
          title: 'Öppna OpenTTD-wikin',
        }, 'wiki ↗'));
      }
      const helpText = getHelp(sec, entry);
      const zeroNote = entry.zero_special ? (state.lang === 'sv' ? '0 = auto/avstängd' : '0 = auto/disabled') : '';
      const fullHelp = [helpText, zeroNote].filter(Boolean).join(' · ');
      const currentValue = currentVal(sec, entry);
      const hintText = computeHint(sec, entry, currentValue);
      const meta = el('div', { class: 'meta' },
        el('div', { class: 'label' }, labelChildren),
        fullHelp ? el('div', { class: 'help' }, fullHelp) : null,
        el('div', { class: 'value-hint' }, hintText),
      );
      const control = el('div', { class: 'control' }, renderControl(sec, entry));
      card.appendChild(meta);
      card.appendChild(control);
      main.appendChild(card);
    }
  }
  if (shown === 0) {
    main.appendChild(el('div', { class: 'empty' }, 'Inga träffar.'));
  }
}

// ===== Load .cfg =====
function parseIni(text) {
  const sections = {};
  let cur = '__root__';
  sections[cur] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sm = line.match(/^\[([^\]]+)\]$/);
    if (sm) { cur = sm[1]; sections[cur] = sections[cur] || []; continue; }
    const eq = raw.indexOf('=');
    if (eq < 0) continue;
    const k = raw.slice(0, eq).trim();
    const v = raw.slice(eq + 1).trim();
    sections[cur].push([k, v]);
  }
  return sections;
}

async function applyFiles(files) {
  if (!files.length) return;
  // Merge: parse each, combine sections, then apply once.
  const merged = {};
  for (const f of files) {
    const text = await f.text();
    const secs = parseIni(text);
    for (const [sec, entries] of Object.entries(secs)) {
      merged[sec] = (merged[sec] || []).concat(entries);
    }
  }
  applyParsedIni(merged);
  flash(`Laddade ${files.length} fil(er)`);
}

function applyParsedIni(sections) {
  state.values = {};
  state.unknown = {};
  state.unknownSections = {};
  for (const [sec, entries] of Object.entries(sections)) {
    if (sec === '__root__') continue;
    const knownKeys = new Set((SCHEMA[sec] || []).map(e => e.key));
    if (!SCHEMA[sec]) {
      state.unknownSections[sec] = entries;
      continue;
    }
    for (const [k, raw] of entries) {
      if (!knownKeys.has(k)) {
        state.unknown[sec] = state.unknown[sec] || {};
        state.unknown[sec][k] = raw;
        continue;
      }
      const entry = SCHEMA[sec].find(e => e.key === k);
      let v = raw;
      if (entry.type === 'bool') v = (raw === 'true' || raw === '1');
      else if (entry.type === 'int') v = raw === '' ? '' : Number(raw);
      else if (entry.type === 'enum') {
        const idx = (entry.values || []).indexOf(raw);
        v = idx >= 0 ? idx : Number(raw) || 0;
      } else v = raw.replace(/^"(.*)"$/, '$1');
      state.values[valKey(sec, k)] = v;
    }
  }
  renderSettings();
  flash('Konfiguration laddad');
}

// ===== Download .cfg =====
function serializeValue(entry, v) {
  if (entry.type === 'bool') return v ? 'true' : 'false';
  if (entry.type === 'enum') return (entry.values || [])[v] ?? String(v);
  return String(v ?? '');
}

function serializeCfg(targetFile) {
  const lines = [];
  const sections = Object.keys(SCHEMA).sort();
  for (const sec of sections) {
    const entries = SCHEMA[sec].filter(e => (e.file || 'openttd') === targetFile);
    // Unknown keys: only emit into the openttd.cfg download to avoid duplicating them.
    const unknownInSec = (targetFile === 'openttd' && state.unknown[sec]) || {};
    if (!entries.length && !Object.keys(unknownInSec).length) continue;

    lines.push('[' + sec + ']');
    for (const e of entries) {
      const k = valKey(sec, e.key);
      const v = k in state.values ? state.values[k] : e.def;
      if (v === undefined) continue;
      lines.push(e.key + ' = ' + serializeValue(e, v));
    }
    for (const [k, v] of Object.entries(unknownInSec)) {
      lines.push(k + ' = ' + v);
    }
    lines.push('');
  }
  if (targetFile === 'openttd') {
    for (const [sec, entries] of Object.entries(state.unknownSections)) {
      lines.push('[' + sec + ']');
      for (const [k, v] of entries) lines.push(k + ' = ' + v);
      lines.push('');
    }
  }
  return lines.join('\n');
}

function downloadCfg(targetFile) {
  const blob = new Blob([serializeCfg(targetFile)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: targetFile + '.cfg' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  flash(targetFile + '.cfg laddas ner');
}

// ===== Init =====
function init() {
  if (typeof SCHEMA === 'undefined') {
    $('#settings').textContent = 'schema.js saknas — kör build-schema.py först.';
    return;
  }
  state.currentGroup = 'Server';
  $('#lang').value = state.lang;
  $('#lang').addEventListener('change', e => {
    state.lang = e.target.value;
    localStorage.setItem('lang', state.lang);
    renderNav(); renderSettings();
  });
  renderNav();
  renderSettings();

  $('#search').addEventListener('input', e => {
    state.search = e.target.value.trim();
    renderSettings();
  });
  $('#show-advanced').addEventListener('change', e => {
    state.showAdvanced = e.target.checked;
    renderSettings();
  });
  $('#upload').addEventListener('change', async e => {
    await applyFiles([...e.target.files]);
    e.target.value = '';
  });
  $('#dl-openttd').addEventListener('click', () => downloadCfg('openttd'));
  $('#dl-private').addEventListener('click', () => downloadCfg('private'));
  $('#dl-secrets').addEventListener('click', () => downloadCfg('secrets'));

  // Drag-and-drop anywhere on the page.
  const overlay = $('#drop-overlay');
  let dragDepth = 0;
  window.addEventListener('dragenter', e => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    dragDepth++;
    overlay.classList.add('show');
  });
  window.addEventListener('dragleave', e => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.classList.remove('show');
  });
  window.addEventListener('dragover', e => { e.preventDefault(); });
  window.addEventListener('drop', async e => {
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove('show');
    const files = [...(e.dataTransfer.files || [])].filter(f => f.name.endsWith('.cfg'));
    if (files.length) await applyFiles(files);
    else flash('Inga .cfg-filer hittades');
  });
}

init();
