'use strict';

// Group IDs (language-neutral). Display labels live in I18N.
const GROUPS_ORDER = ['server', 'client', 'other'];

const SECTION_GROUP = {
  game_creation: 'server', difficulty: 'server', economy: 'server',
  station: 'server', vehicle: 'server', construction: 'server',
  order: 'server', ai: 'server', script: 'server',
  linkgraph: 'server', pf: 'server',
  network: 'server',
  gui: 'client', news_display: 'client', sound: 'client', music: 'client',
  misc: 'other', locale: 'other',
};

// Per-key overrides: move client-side network.* keys out of server group.
const KEY_OVERRIDES = {
  'network.client_name': 'client',
  'network.connect_to_ip': 'client',
  'network.last_joined': 'client',
  'network.last_host': 'client',
  'network.last_port': 'client',
  'network.network_id': 'client',
  'network.servers': 'client',
  'network.participate_survey': 'client',
  'network.use_relay_service': 'client',
  'network.client_secret_key': 'client',
  'network.client_public_key': 'client',
  'network.no_http_content_downloads': 'client',
};

function groupOf(section, key) {
  return KEY_OVERRIDES[section + '.' + key]
      || SECTION_GROUP[section]
      || 'other';
}

const I18N = {
  en: {
    group_server: 'Server', group_client: 'Client', group_other: 'Other',
    upload_cfg: 'Upload .cfg files',
    load_from_server: 'Load from server',
    save_to_server: 'Stage for next restart',
    apply_restart: 'Save + restart server',
    apply_restart_confirm: 'This will stage your changes, tell the server to quit, and let the container auto-restart with your new settings applied. The current game state is preserved via autosave. Proceed?',
    apply_restart_done: 'Saved and quit signal sent. Server is restarting…',
    apply_restart_failed: 'Apply failed: ',
    fresh_start: 'Start fresh game',
    fresh_start_confirm: 'The server will quit and restart with the current settings, skipping any autosave. Old autosaves stay on disk (rotation will eventually overwrite them). Proceed?',
    fresh_start_done: 'Server restarting fresh…',
    offline_tools: 'Offline tools',
    offline_tools_hint: 'Download cfg files for manual edit / backup. The live "Save + restart" above is the preferred flow.',
    change_newgame: 'needs new game',
    change_newgame_long: 'OpenTTD locks this setting after the map is generated. It only takes effect on a fresh game — use "Start fresh game" to apply.',
    change_live: 'live',
    change_live_long: 'Can be applied immediately via the admin port without restarting the server.',
    apply_live: 'Apply live',
    apply_live_done: applied => `Applied ${applied} change(s) live. Restart-only changes stayed staged.`,
    apply_live_failed: 'Live apply failed: ',
    apply_live_nothing: 'No changes to apply.',
    wiki_link: 'OpenTTD wiki ↗',
    search_placeholder: 'Search settings…',
    show_advanced: 'Show advanced + expert',
    select_group: 'Pick a group on the left.',
    no_matches: 'No matches.',
    drop_files: 'Drop .cfg files to load',
    reset_default: 'Reset to default',
    api_online: 'Connected to server',
    api_offline: 'Server API unreachable',
    loaded_from_server: 'Loaded from server',
    saved_restart: 'Staged. Changes apply at next server restart.',
    load_failed: 'Load failed: ',
    save_failed: 'Save failed: ',
    config_loaded: 'Configuration loaded',
    no_cfg_dropped: 'No .cfg files found',
    loaded_n_files: n => `Loaded ${n} file(s)`,
    settings_summary: (total, sections) => `${total} settings in ${sections} sections.`,
    hint_map_wide: v => `→ ${1 << v} tiles wide`,
    hint_map_deep: v => `→ ${1 << v} tiles deep`,
    hint_autosave: v => v === 0 ? '→ disabled' : `→ every ${v} min`,
    hint_seconds: v => `→ ${v} seconds`,
    hint_tiles: v => `→ ${v} tiles`,
    hint_town_growth: { 0: 'off', 1: 'slow', 2: 'normal', 3: 'fast', 4: 'very fast' },
    hint_max_loan: v => `→ ${v.toLocaleString('en-US')} (internal GBP base, shown in player's currency)`,
    hint_max_clients: v => `→ ${v} simultaneous players`,
    hint_max_companies: v => `→ ${v} companies`,
    hint_server_port: v => v === 3979 ? '→ default port' : `→ port ${v}`,
    hint_autoclean: v => v === 0 ? '→ never' : `→ after ${v} months`,
    hint_min_active: v => v === 0 ? '→ no auto-pause' : `→ needs ${v} active players`,
    hint_restart_year: v => v === 0 ? '→ never' : `→ year ${v}`,
  },
  sv: {
    group_server: 'Server', group_client: 'Klient', group_other: 'Övrigt',
    upload_cfg: 'Ladda upp .cfg-filer',
    load_from_server: 'Hämta från server',
    save_to_server: 'Stagea inför nästa start',
    apply_restart: 'Spara + starta om server',
    apply_restart_confirm: 'Detta stagear dina ändringar, ber servern avsluta och låter containern auto-starta om med dina nya inställningar. Pågående spel bevaras via autosave. Fortsätta?',
    apply_restart_done: 'Sparat och quit-signal skickad. Servern startar om…',
    apply_restart_failed: 'Misslyckades: ',
    fresh_start: 'Starta nytt spel',
    fresh_start_confirm: 'Servern avslutas och startar om med nuvarande inställningar, autosaves hoppas över. Gamla autosaves ligger kvar på disk (rotationen skriver så småningom över dem). Fortsätta?',
    fresh_start_done: 'Servern startar om till nytt spel…',
    offline_tools: 'Offline-verktyg',
    offline_tools_hint: 'Ladda ner cfg-filer för manuell editering / backup. "Spara + starta om" ovan är det rekommenderade flödet.',
    change_newgame: 'kräver nytt spel',
    change_newgame_long: 'OpenTTD låser denna inställning efter att kartan genererats. Den tar bara effekt vid nytt spel — använd "Starta nytt spel" för att applicera.',
    change_live: 'live',
    change_live_long: 'Kan appliceras direkt via admin-porten utan att starta om servern.',
    apply_live: 'Applicera live',
    apply_live_done: applied => `Applicerade ${applied} ändring(ar) live. Övriga ändringar är stagade till nästa omstart.`,
    apply_live_failed: 'Live-applicering misslyckades: ',
    apply_live_nothing: 'Inga ändringar att applicera.',
    wiki_link: 'OpenTTD-wikin ↗',
    search_placeholder: 'Sök inställning…',
    show_advanced: 'Visa avancerade + expert',
    select_group: 'Välj en grupp till vänster.',
    no_matches: 'Inga träffar.',
    drop_files: 'Släpp .cfg-filer för att ladda in',
    reset_default: 'Återställ till default',
    api_online: 'Ansluten till server',
    api_offline: 'Server-API ej tillgängligt',
    loaded_from_server: 'Laddat från servern',
    saved_restart: 'Stagat. Ändringarna tar effekt vid nästa server-omstart.',
    load_failed: 'Kunde inte ladda: ',
    save_failed: 'Sparning misslyckades: ',
    config_loaded: 'Konfiguration laddad',
    no_cfg_dropped: 'Inga .cfg-filer hittades',
    loaded_n_files: n => `Laddade ${n} fil(er)`,
    settings_summary: (total, sections) => `${total} inställningar i ${sections} sektioner.`,
    hint_map_wide: v => `→ ${1 << v} tiles brett`,
    hint_map_deep: v => `→ ${1 << v} tiles djupt`,
    hint_autosave: v => v === 0 ? '→ avstängd' : `→ var ${v}:e minut`,
    hint_seconds: v => `→ ${v} sekunder`,
    hint_tiles: v => `→ ${v} tiles`,
    hint_town_growth: { 0: 'avstängd', 1: 'långsam', 2: 'normal', 3: 'snabb', 4: 'mycket snabb' },
    hint_max_loan: v => `→ ${v.toLocaleString('sv-SE')} (intern GBP-bas, visas i spelarens valuta)`,
    hint_max_clients: v => `→ ${v} spelare samtidigt`,
    hint_max_companies: v => `→ ${v} företag`,
    hint_server_port: v => v === 3979 ? '→ standardport' : `→ port ${v}`,
    hint_autoclean: v => v === 0 ? '→ aldrig' : `→ efter ${v} månader`,
    hint_min_active: v => v === 0 ? '→ pausar inte automatiskt' : `→ behöver ${v} aktiva spelare`,
    hint_restart_year: v => v === 0 ? '→ aldrig' : `→ år ${v}`,
  },
};
function T(key, ...args) {
  const v = (I18N[state?.lang] || I18N.en)[key] ?? I18N.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

function applyI18N() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = T(el.dataset.i18n);
  });
  const search = document.getElementById('search');
  if (search) search.placeholder = T('search_placeholder');
  const drop = document.querySelector('.drop-card');
  if (drop) drop.textContent = T('drop_files');
  const apiStatus = document.getElementById('api-status');
  if (apiStatus) {
    apiStatus.title = apiStatus.classList.contains('online') ? T('api_online') : T('api_offline');
  }
}

// Manual help-text fallbacks for settings whose source strhelp is missing or unclear.
// Each entry has {en, sv}; getHelp() picks based on state.lang.
const HELP_OVERRIDES = {
  'difficulty.max_no_competitors': {
    en: 'Max number of AI competitors (computer-controlled companies) that can exist simultaneously. 0 = no AI players.',
    sv: 'Max antal AI-konkurrenter (datorstyrda företag) som kan finnas samtidigt. 0 = inga AI-spelare.',
  },
  'difficulty.competitors_interval': {
    en: 'How often new AI competitors appear, measured in months between spawn attempts.',
    sv: 'Hur ofta nya AI-konkurrenter dyker upp, mätt i månader mellan spawn-försök.',
  },
  'difficulty.competitor_start_time': {
    en: 'Legacy: when AI competitors started appearing in old savegames. Has no effect on new games.',
    sv: 'Föråldrad: när AI-konkurrenter började dyka upp i gamla sparfiler. Påverkar inte nya spel.',
  },
  'difficulty.competitor_intelligence': {
    en: 'Legacy: old AI difficulty level. Modern AIs control their behaviour via AI scripts instead.',
    sv: 'Föråldrad: gammal AI-svårighetsnivå. Numera styrs AI:s beteende per AI-skript.',
  },
  'difficulty.number_towns': {
    en: 'Density of towns on the map. Pick "Custom" to set an exact count via custom_town_number.',
    sv: 'Tätheten av städer på kartan. Välj "Egna" för att ange exakt antal via custom_town_number.',
  },
  'difficulty.number_industries': {
    en: 'Density of industries. "Funding only" = no spontaneous spawns, players must fund them. "Custom" = exact count via custom_industry_number.',
    sv: 'Tätheten av industrier på kartan. "Endast finansiering" = inga spontana, måste fonderas av spelare. "Egna" = ange exakt antal via custom_industry_number.',
  },
  'difficulty.quantity_sea_lakes': {
    en: 'Amount of sea and lakes on the map. "Custom" = set water percentage via custom_sea_level.',
    sv: 'Mängd hav och sjöar på kartan. "Egna" = ange procent vatten via custom_sea_level.',
  },
  'difficulty.economy': {
    en: 'Smart economy: industries can close or open dynamically based on demand.',
    sv: 'Smart ekonomi: industrier kan stängas/öppnas dynamiskt baserat på efterfrågan.',
  },
  'difficulty.line_reverse_mode': {
    en: 'When trains are allowed to reverse: only at stations or anywhere on track.',
    sv: 'När tåg är tillåtna att vända: vid stationer eller när som helst på spåret.',
  },
  'difficulty.initial_interest': {
    en: 'Bank loan interest rate (% per year, fixed for the whole game). Double duty: when economy.inflation is on, the same value is used as ANNUAL price inflation, and payment inflation = this value minus 1. Default 2 → 2% price inflation, 1% income inflation. The 1 pp gap is why long games get harder over time (income falls behind costs). Range 2–4.',
    sv: 'Bank-räntesats för lån (i procent per år, fast under hela spelet). Dubbeltjänst: när economy.inflation är på används samma värde också som ÅRLIG pris-inflation, och betalnings-inflation = detta värde minus 1. Default 2 → 2% pris-inflation, 1% intäkts-inflation. Skillnaden på 1 procentenhet är varför långa spel blir svårare över tid (intäkter halkar efter kostnader). Range 2–4.',
  },
  'difficulty.max_loan': {
    en: 'Maximum total loan. Stored in internal units (GBP-based) — OpenTTD multiplies by the player\'s chosen currency for display. If economy.inflation is on, the effective ceiling scales up over time at the inflation rate.',
    sv: 'Maxgräns för totalt lån. Värdet är i intern enhet (GBP-bas) — OpenTTD multiplicerar med den valuta spelaren valt för visning. Om economy.inflation är på skalas det effektiva taket upp över tid i takt med inflationen.',
  },
  'difficulty.construction_cost': {
    en: 'Scaling on construction and vehicle purchase costs. Multipliers from source: Low = 0.75x, Medium = 1.0x, High = 1.125x — so Low vs High differs by ~50%. Affects: rails, roads, stations, signals, bridges, tunnels, terraforming, vehicles. NOTE: does NOT affect running costs (that\'s vehicle_costs).',
    sv: 'Skala på konstruktions- och fordonsinköpskostnader. Multiplikatorerna i koden: Låg = 0,75x, Medium = 1,0x, Hög = 1,125x — så skillnaden Låg vs Hög är ca 50% mer. Påverkar: räls, vägar, stationer, signaler, broar, tunnlar, terraforming, fordon. OBS: påverkar inte löpande driftkostnader (det är vehicle_costs).',
  },
  'difficulty.vehicle_costs': {
    en: 'Scaling on running costs of vehicles (fuel, wear, wages). Same multipliers as construction_cost: Low = 0.75x, Medium = 1.0x, High = 1.125x — ~50% gap between Low and High. Especially affects expensive vehicles (aircraft) and loss-making routes.',
    sv: 'Skala på löpande driftkostnader för fordon (bränsle, slitage, lön). Samma multiplikatorer som construction_cost: Låg = 0,75x, Medium = 1,0x, Hög = 1,125x — ca 50% skillnad mellan Låg och Hög. Påverkar speciellt dyra fordon (flyg) och förlust-rutter.',
  },
  'vehicle.servint_trains': {
    en: 'Default service interval for new trains. Vehicles are auto-sent to the nearest depot when the interval elapses, restoring reliability and fixing breakdowns. Unit: days (or % depending on servint_ispercent). 0 = no auto-service (only via explicit service orders). Lower = more reliable but more downtime. Default is typically 150 days.',
    sv: 'Default-värde för hur ofta nya tåg åker till depå för service. Konkret: fordon skickas automatiskt till närmaste depå när intervallet löpt ut, vilket återställer tillförlitlighet och fixar haverier. Värdet anges i dagar (eller % beroende på servint_ispercent). 0 = inget auto-service (fordon åker bara om du sätter en service-order manuellt). Lägre intervall = mer pålitliga fordon men mer "borta från jobbet"-tid. Default brukar vara 150 dagar.',
  },
  'vehicle.servint_roadveh': {
    en: 'Default service interval for new road vehicles (trucks, buses). See servint_trains for the full explanation. Default is typically 150 days.',
    sv: 'Default-värde för service-intervall på nya lastbilar/bussar. Se servint_trains för full förklaring. Default brukar vara 150 dagar.',
  },
  'vehicle.servint_ships': {
    en: 'Default service interval for new ships. Ships make few stops, so a short interval can force unnecessary depot visits. Default is typically 360 days.',
    sv: 'Default-värde för service-intervall på nya båtar. Båtar gör typiskt få stop, så ett kort intervall kan tvinga onödiga depå-besök. Default brukar vara 360 dagar.',
  },
  'vehicle.servint_aircraft': {
    en: 'Default service interval for new aircraft. Planes get natural servicing at airports, so this only affects extra scheduled service. Default is typically 150 days.',
    sv: 'Default-värde för service-intervall på nya flygplan. Flyg har naturlig service på flygplatser, så detta påverkar bara den extra schemalagda servicen. Default brukar vara 150 dagar.',
  },
  'vehicle.servint_ispercent': {
    en: 'Off: interval is measured in days (e.g. 150 = every 150 days). On: interval is a % of the vehicle\'s max reliability (e.g. 50 = service when reliability drops to 50% of max). Percent mode is often smarter — old vehicles get serviced more often, new ones rarely.',
    sv: 'Av: intervall mäts i dagar (t.ex. 150 = var 150:e dag). På: intervall mäts som procent av fordonets max-pålitlighet (t.ex. 50 = service när tillförlitligheten sjunkit till 50% av max). Procentläge är ofta smartare — gamla fordon servas oftare, nya sällan.',
  },
  'economy.infinite_money': {
    en: 'Companies can spend freely without a balance limit and cannot go bankrupt. Removes the entire economy challenge.',
    sv: 'Företag kan spendera fritt utan kontogräns och kan inte gå i konkurs. Tar bort hela ekonomi-utmaningen.',
  },
  'economy.infrastructure_maintenance': {
    en: 'Maintenance cost on all infrastructure (rails, roads, signals, stations, airports, canals). Scales super-linearly with network size — large companies are penalised harder. Balances long-term snowballing. Note: the penalty hits train empires much harder than airlines because airports have few tiles but high revenue — keep vehicle.plane_speed at its default (4 = 1/4 speed) so aircraft stay balanced. Do NOT lower it on multiplayer servers.',
    sv: 'Underhållskostnader för all infrastruktur (räls, vägar, signaler, stationer, flygplatser, kanaler). Skalas super-linjärt med nätverkets storlek — stora företag straffas hårdare. Balanserar långsiktig snöbollning. Obs: straffet träffar tåg-imperier mycket hårdare än flyg eftersom flygplatser har få tiles men hög intäkt — håll vehicle.plane_speed på default (4 = 1/4 hastighet) så flyget förblir balanserat. Sätt den INTE lägre på multiplayerservrar.',
  },
  'vehicle.max_trains': {
    en: 'Max trains per company. Setting to 0 disables the entire rail system: nobody can buy trains AND rails/train stations disappear from the build menu. Great for "no rail" challenges.',
    sv: 'Max antal tåg per företag. Sätter du 0 disablas hela tåg-systemet: ingen kan köpa tåg OCH räls/tågstationer försvinner från byggmenyn. Bra för "no rail"-utmaningar.',
  },
  'vehicle.max_roadveh': {
    en: 'Max road vehicles per company. 0 disables both vehicles AND road construction/bus stops. Great for "no road" challenges.',
    sv: 'Max antal lastbilar/bussar per företag. 0 disablar både fordon OCH vägbygge/hållplatser. Bra för "no road"-utmaningar.',
  },
  'vehicle.max_aircraft': {
    en: 'Max aircraft per company. 0 disables both aircraft AND airport construction — the whole air-infrastructure disappears from the build menu. The classic "no plane" server setting.',
    sv: 'Max antal flygplan per företag. 0 disablar både flyg OCH flygplatsbygge — hela flyg-infrastrukturen försvinner från byggmenyn. Klassiker för "no plane"-servrar.',
  },
  'vehicle.max_ships': {
    en: 'Max ships per company. 0 disables both vehicles AND harbours/canals. Great for "no ship" challenges.',
    sv: 'Max antal båtar per företag. 0 disablar både fordon OCH hamnar/kanaler. Bra för "no ship"-utmaningar.',
  },
  'vehicle.plane_speed': {
    en: 'Aircraft speed divisor — the value is the divisor. 1 = full speed (OP, very profitable), 2 = half, 3 = a third, 4 = a quarter (default — OpenTTD already slows aircraft down to balance them against trains/road vehicles). Lower it only if you want faster/more profitable planes; you can\'t go higher (max is 4).',
    sv: 'Hastighetsdelare för flyg — värdet är delaren. 1 = full hastighet (OP, mycket lönsamt), 2 = halv, 3 = en tredjedel, 4 = en fjärdedel (default — OpenTTD slår redan ner flyget för att balansera mot tåg/lastbilar). Sänk bara om du vill ha snabbare/lönsammare flyg, höj inte (max är 4).',
  },
  'economy.town_cargo_scale': {
    en: 'Percentage multiplier for how much cargo (passengers, mail) towns produce. Range 15–300%, default 100%. Raise for more traffic, lower for a calmer pace.',
    sv: 'Procentmultiplikator för hur mycket gods (passagerare, post) städer producerar. Range 15–300%, default 100%. Höj för mer trafik, sänk för lugnare tempo.',
  },
  'economy.industry_cargo_scale': {
    en: 'Percentage multiplier for how much raw materials/products industries produce. Range 15–300%, default 100%. Only affects production — not what industries accept.',
    sv: 'Procentmultiplikator för hur mycket råvaror/produkter industrier producerar. Range 15–300%, default 100%. Påverkar bara produktion — inte vad industrier accepterar.',
  },
  'economy.timekeeping_units': {
    en: 'Two clocks run in parallel: an economy clock (drives production/finances) and a calendar clock (drives vehicle introduction dates). Calendar = classic OpenTTD, both clocks lock-stepped: 1 year = 12 months. Wallclock = the economy ticks per real-time minute, 12 minutes = 1 economy period. The calendar is then decoupled and controlled separately by minutes_per_calendar_year. Vehicles still arrive in their calendar year regardless of mode.',
    sv: 'Två klockor körs parallellt i spelet: en ekonomi-klocka (styr produktion/finanser) och en kalender-klocka (styr när fordon introduceras). Kalender = klassisk OpenTTD, båda går i takt: 1 år = 12 månader. Väggklocka = ekonomin tickar per realtidsminut, 12 minuter = 1 ekonomi-period. Kalendern är då frikopplad och styrs separat av minutes_per_calendar_year. Fordon kommer i sin kalendermåltid oavsett spelläge.',
  },
  'economy.minutes_per_calendar_year': {
    en: 'In Wallclock mode: how many real-time minutes one calendar year takes. Default 12 min/year (same pace as the economy). Lower = the calendar runs faster (vehicles arrive sooner, but the economy fits more periods per calendar year). Higher = the calendar trails. 0 = the calendar is fully frozen (same vehicles for the whole game). Has no effect in Calendar mode.',
    sv: 'I Väggklocksläge: hur många realtidsminuter ett kalenderår tar. Default 12 min/år (samma takt som ekonomin). Lägre = kalendern går snabbare (fordon kommer fortare, men ekonomin hinner med fler perioder per kalenderår). Högre = kalendern släpar. 0 = kalendern fryses helt (samma fordon hela spelet). Påverkar inget i Kalenderläge.',
  },
  'economy.dist_local_authority': {
    en: 'Max distance (tiles) within which a town\'s local authority considers your activity "local".',
    sv: 'Maxavstånd (i tiles) inom vilket en stads myndighet anser att din verksamhet räknas som "lokal".',
  },
  'economy.mod_road_rebuild': {
    en: 'How often towns demolish and rebuild their roads. Lower value = more frequent rebuilding.',
    sv: 'Hur ofta städer river och bygger om sina vägar. Lägre värde = oftare rivningar.',
  },
  'economy.station_noise_level': {
    en: 'Whether airports generate noise that affects the town\'s permission. Off = unlimited construction.',
    sv: 'Om flygplatser genererar buller som påverkar stadens tillstånd. Av = obegränsat byggande.',
  },
  'economy.town_noise_population[0]': {
    en: 'Noise tolerance for the smallest towns (population below the first threshold). 1 unit per small airport.',
    sv: 'Bullertolerans per småstad (befolkning under första tröskeln). 1 enhet per litet flygfält.',
  },
  'economy.town_noise_population[1]': {
    en: 'Noise tolerance for medium-sized towns. Raise to allow more airports in smaller towns.',
    sv: 'Bullertolerans per medelstor stad. Höj för fler flygplatser i mindre städer.',
  },
  'economy.town_noise_population[2]': {
    en: 'Noise tolerance for large towns.',
    sv: 'Bullertolerans per storstad.',
  },
  'economy.town_noise_population[3]': {
    en: 'Noise tolerance for metropolises.',
    sv: 'Bullertolerans per metropol.',
  },
  'game_creation.map_x': {
    en: 'Map width as log2. Value 8 = 256 tiles, 11 = 2048 tiles, 12 = 4096 tiles.',
    sv: 'Kartans bredd som logaritm-2. Värde 8 = 256 tiles, 11 = 2048 tiles, 12 = 4096 tiles.',
  },
  'game_creation.map_y': {
    en: 'Map height as log2. Value 8 = 256 tiles, 11 = 2048 tiles, 12 = 4096 tiles.',
    sv: 'Kartans höjd som logaritm-2. Värde 8 = 256 tiles, 11 = 2048 tiles, 12 = 4096 tiles.',
  },
  'game_creation.heightmap_height': {
    en: 'Maximum height level when importing a PNG/BMP heightmap. Grayscale values are scaled up to this height.',
    sv: 'Max höjdnivå vid import av PNG/BMP-heightmap. Gråvärden skalas upp till denna höjd.',
  },
  'game_creation.water_borders': {
    en: 'Bitfield: which map edges are water (1=NW, 2=NE, 4=SE, 8=SW). 15 = all.',
    sv: 'Bitfält: vilka kartkanter som ska vara vatten (1=NV, 2=NO, 4=SO, 8=SV). 15 = alla.',
  },
  'game_creation.water_border_presets': {
    en: 'Preset combinations of water borders — only affects the UI in the map-generation dialog.',
    sv: 'Förinställda kombinationer av vattenkanter — påverkar bara UI:t i kart-genereringsdialogen.',
  },
  'game_creation.custom_town_number': {
    en: 'Exact number of towns on the map (when "custom" count is selected).',
    sv: 'Exakt antal städer på kartan (om man valt "anpassat" antal).',
  },
  'game_creation.custom_industry_number': {
    en: 'Exact number of industries on the map (when "custom" count is selected).',
    sv: 'Exakt antal industrier på kartan (om man valt "anpassat" antal).',
  },
  'game_creation.custom_terrain_type': {
    en: 'Exact maximum terrain height (when "custom height" is selected as terrain type).',
    sv: 'Exakt högsta terränghöjd (om man valt "anpassad höjd" som terrängtyp).',
  },
  'game_creation.custom_sea_level': {
    en: 'Water percentage (when "custom" sea level is selected).',
    sv: 'Andel vatten i procent (om man valt "anpassad" havsnivå).',
  },
  'game_creation.min_river_length': {
    en: 'Minimum length (tiles) for a river to be generated.',
    sv: 'Minsta längd för en flod (i tiles) för att den ska genereras.',
  },
  'game_creation.river_route_random': {
    en: 'How randomly rivers wind. 0 = straight to the sea, higher = more curves.',
    sv: 'Hur slumpmässigt floder slingrar sig. 0 = rakt mot havet, högre = mer kurvor.',
  },
  'game_creation.se_flat_world_height': {
    en: 'Starting height for a completely flat map in the Scenario Editor (when you choose "Flat" instead of randomly generated terrain). 0 = sea level (all water/coast), 1 = lowest dry level (default), up to 15. Does NOT affect normally generated maps — only when creating scenarios manually.',
    sv: 'Starthöjd för en helt platt karta i Scenario Editor (när man väljer "Flat" istället för slumpgenererad terräng). 0 = på havsnivå (allt vatten/strand), 1 = lägsta torra nivå (default), upp till 15. Påverkar inte vanliga genererade kartor — bara när man skapar scenarier manuellt.',
  },
  'vehicle.dynamic_engines': {
    en: 'Allow each NewGRF to have its own vehicles. Must be changed before a new map is created.',
    sv: 'Tillåt varje NewGRF att ha egna fordon. Måste ändras innan ny karta skapas.',
  },
  'vehicle.extend_vehicle_life': {
    en: 'Number of years vehicles remain purchasable after their official retirement date.',
    sv: 'Antal år som fordon förblir köpbara efter att de officiellt pensionerats.',
  },
  'construction.build_on_slopes': {
    en: 'Allow building on sloped terrain (otherwise you must flatten first).',
    sv: 'Tillåt byggande på sluttande mark (annars måste man planera först).',
  },
  'construction.terraform_per_64k_frames': {
    en: 'Rate limit for terraforming (land modification) — tiles per 64k frames.',
    sv: 'Hastighetsgräns för terraforming (modifiering av mark) — antal tiles per 64k frames.',
  },
  'construction.terraform_frame_burst': {
    en: 'How much terraforming can be accumulated into a short burst.',
    sv: 'Hur mycket terraforming som kan ackumuleras till en kortare burst.',
  },
  'station.never_expire_airports': {
    en: 'Airport types never disappear from the buy menu — otherwise older types are phased out.',
    sv: 'Flygplatstyper försvinner aldrig från köpmenyn — annars fasas äldre typer ut.',
  },
  'station.modified_catchment': {
    en: 'Stations use realistic catchment areas instead of fixed squares.',
    sv: 'Stationer har realistiska upptagningsområden istället för fasta kvadrater.',
  },
  'pf.forbid_90_deg': {
    en: 'Forbid 90-degree turns (sharp U-turns) for trains and ships.',
    sv: 'Förbjud 90-graderssvängar (skarpa U-svängar) för tåg och båtar.',
  },
  'pf.path_backoff_interval': {
    en: 'How often the pathfinder backs off and retries when stuck (in ticks).',
    sv: 'Hur ofta pathfindern backar och försöker hitta ny väg när den fastnat (i ticks).',
  },
  'order.improved_load': {
    en: 'Improved loading logic: vehicles share load evenly at the same station instead of "first come, first served".',
    sv: 'Förbättrad lastningslogik: fordon delar last jämnt vid samma station istället för "först till kvarn".',
  },
  'order.gradual_loading': {
    en: 'Loading/unloading happens gradually over time instead of instantaneously.',
    sv: 'Last/lossning sker gradvis under tid istället för momentant.',
  },
  'order.serviceathelipad': {
    en: 'Helicopters are auto-serviced at helipads even without an explicit service order.',
    sv: 'Helikoptrar servas automatiskt på helipads även utan service-order.',
  },
  'misc.engine_renew_months': {
    en: 'How many months before a vehicle\'s retirement date it should be auto-replaced. Negative = after the retirement date.',
    sv: 'Hur många månader innan ett fordons pensionsdatum det ska bytas automatiskt. Negativt = efter pensionsdatum.',
  },
  'misc.engine_renew_money': {
    en: 'Minimum cash balance for auto-replacement to fire. Stored in internal units (GBP-based), multiplied by the player\'s currency on display.',
    sv: 'Lägsta belopp i kassan för att autoersättning ska genomföras. Värdet är i intern enhet (GBP-bas), multipliceras med spelarens valuta vid visning.',
  },
};

function lookupHelpOverride(key) {
  const ov = HELP_OVERRIDES[key];
  if (!ov) return null;
  if (typeof ov === 'string') return ov; // legacy plain-string entries
  return ov[state.lang] || ov.en || ov.sv || null;
}

// Per-setting hint that explains what the value actually means.
// Returns a string to append to the help text given a value, or null.
const VALUE_HINTS = {
  'game_creation.map_x': v => T('hint_map_wide', v),
  'game_creation.map_y': v => T('hint_map_deep', v),
  'gui.autosave_interval': v => T('hint_autosave', v),
  'gui.errmsg_duration': v => T('hint_seconds', v),
  'gui.hover_delay_ms': v => `→ ${v} ms`,
  'economy.dist_local_authority': v => T('hint_tiles', v),
  'economy.town_growth_rate': v => {
    const map = T('hint_town_growth');
    return map[v];
  },
  'difficulty.max_loan': v => T('hint_max_loan', v),
  'network.max_clients': v => T('hint_max_clients', v),
  'network.max_companies': v => T('hint_max_companies', v),
  'network.server_port': v => T('hint_server_port', v),
  'network.autoclean_protected': v => T('hint_autoclean', v),
  'network.autoclean_novehicles': v => T('hint_autoclean', v),
  'network.min_active_clients': v => T('hint_min_active', v),
  'network.restart_game_year': v => T('hint_restart_year', v),
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
  lang: localStorage.getItem('lang') || 'en',
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
  const ov = lookupHelpOverride(section + '.' + entry.key);
  if (state.lang === 'sv') {
    return ov || entry.help_sv || entry.help || '';
  }
  return ov || entry.help || '';
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
    }, T('group_' + group), el('span', { class: 'count' }, String(total)));
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
    title: T('reset_default'),
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
      T('select_group') + ' ' + T('settings_summary', SCHEMA_META.total, SCHEMA_META.sections)));
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
      if (entry.change === 'newgame') {
        labelChildren.push(el('span', {
          class: 'badge newgame',
          title: T('change_newgame_long'),
        }, T('change_newgame')));
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
    main.appendChild(el('div', { class: 'empty' }, T('no_matches')));
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
  flash(T('loaded_n_files', files.length));
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
  flash(T('config_loaded'));
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

// ===== Server API (level A: read/write cfg files via backend) =====
let initialLoadDone = false;
async function pingApi() {
  const ind = $('#api-status');
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) throw new Error('not ok');
    ind.classList.add('online');
    ind.title = T('api_online');
    $('#server-save').disabled = false;
    $('#apply-restart').disabled = false;
    $('#fresh-start').disabled = false;
    $('#apply-live').disabled = false;
    if (!initialLoadDone) {
      initialLoadDone = true;
      loadFromServer();
    }
  } catch {
    ind.classList.remove('online');
    ind.title = T('api_offline');
    $('#server-save').disabled = true;
    $('#apply-restart').disabled = true;
    $('#fresh-start').disabled = true;
    $('#apply-live').disabled = true;
  }
}

function serializeValueForRcon(entry, v) {
  // For rcon `setting <name> <value>`, OpenTTD accepts:
  //   bool → 1 / 0
  //   enum → integer index
  //   int → number
  //   string → bare or quoted; use as-is (without quotes here, OpenTTD strips)
  if (entry.type === 'bool') return v ? '1' : '0';
  return String(v ?? '');
}

function collectModifiedSettings() {
  // Returns [{section, key, value, entry}, ...] for everything different from default.
  const out = [];
  for (const [k, v] of Object.entries(state.values)) {
    const dot = k.indexOf('.');
    if (dot < 0) continue;
    const section = k.slice(0, dot);
    const key = k.slice(dot + 1);
    const entry = (SCHEMA[section] || []).find(e => e.key === key);
    if (!entry) continue;
    if (v === entry.def) continue;
    out.push({ section, key, value: v, entry });
  }
  return out;
}

async function applyLive() {
  const modified = collectModifiedSettings();
  if (modified.length === 0) {
    flash(T('apply_live_nothing'));
    return;
  }
  const live = modified.filter(m => m.entry.change === 'live');
  const settings = live.map(m => ({
    section: m.section,
    key: m.key,
    value: serializeValueForRcon(m.entry, m.value),
  }));
  if (settings.length === 0) {
    flash(T('apply_live_nothing'));
    return;
  }
  try {
    const r = await fetch('/api/apply-live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    flash(T('apply_live_done', data.applied ?? settings.length));
  } catch (e) {
    flash(T('apply_live_failed') + e.message);
  }
}

async function applyAndRestart() {
  if (!confirm(T('apply_restart_confirm'))) return;
  try {
    const body = {
      openttd: serializeCfg('openttd'),
      private: serializeCfg('private'),
      secrets: serializeCfg('secrets'),
    };
    const r = await fetch('/api/apply-restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    flash(T('apply_restart_done'));
  } catch (e) {
    flash(T('apply_restart_failed') + e.message);
  }
}

async function freshStart() {
  if (!confirm(T('fresh_start_confirm'))) return;
  try {
    const body = {
      openttd: serializeCfg('openttd'),
      private: serializeCfg('private'),
      secrets: serializeCfg('secrets'),
    };
    const r = await fetch('/api/fresh-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || ('HTTP ' + r.status));
    }
    flash(T('fresh_start_done'));
  } catch (e) {
    flash(T('save_failed') + e.message);
  }
}

async function loadFromServer() {
  try {
    const targets = ['openttd', 'private', 'secrets'];
    const texts = await Promise.all(targets.map(t =>
      fetch('/api/cfg/' + t).then(r => r.ok ? r.text() : '')));
    const merged = {};
    for (const text of texts) {
      const secs = parseIni(text);
      for (const [sec, entries] of Object.entries(secs)) {
        merged[sec] = (merged[sec] || []).concat(entries);
      }
    }
    applyParsedIni(merged);
    flash(T('loaded_from_server'));
  } catch (e) {
    flash(T('load_failed') + e.message);
  }
}

async function saveToServer() {
  try {
    const targets = ['openttd', 'private', 'secrets'];
    await Promise.all(targets.map(t =>
      fetch('/api/cfg/' + t, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: serializeCfg(t),
      }).then(r => { if (!r.ok) throw new Error(t + ': ' + r.status); })));
    flash(T('saved_restart'));
  } catch (e) {
    flash(T('save_failed') + e.message);
  }
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
  state.currentGroup = 'server';
  $('#lang').value = state.lang;
  $('#lang').addEventListener('change', e => {
    state.lang = e.target.value;
    localStorage.setItem('lang', state.lang);
    applyI18N(); renderNav(); renderSettings();
  });
  applyI18N();
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
  $('#server-save').addEventListener('click', saveToServer);
  $('#apply-live').addEventListener('click', applyLive);
  $('#apply-restart').addEventListener('click', applyAndRestart);
  $('#fresh-start').addEventListener('click', freshStart);
  pingApi();

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
    else flash(T('no_cfg_dropped'));
  });
}

init();
