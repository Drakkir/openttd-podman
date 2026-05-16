#!/usr/bin/env python3
import re, json
from pathlib import Path

INI_DIR = Path('/tmp/openttd-schema')
OUT = Path(__file__).parent / 'schema.js'

CONST = {
    'true': 1, 'false': 0,
    'UINT8_MAX': 255, 'UINT16_MAX': 65535, 'UINT32_MAX': 4294967295,
    'INT8_MAX': 127, 'INT16_MAX': 32767, 'INT32_MAX': 2147483647,
    'NETWORK_DEFAULT_PORT': 3979, 'NETWORK_ADMIN_PORT': 3977,
    'MAX_COMPANIES': 15, 'MAX_CLIENTS': 255,
    'CalendarTime::MIN_YEAR': 0, 'CalendarTime::MAX_YEAR': 5000000,
    'CalendarTime::DEF_START_YEAR': 1950, 'CalendarTime::DEF_END_YEAR': 2050,
    'NUM_TIMEKEEPING_UNITS': 2,
    'MAX_LOAN_LIMIT': 2000000000, 'INITIAL_LOAN_DEFAULT': 100000,
    'MAX_INFLATION': 2147483647,
    'MIN_MAP_HEIGHT_LIMIT': 15, 'MAX_MAP_HEIGHT_LIMIT': 255,
    'MIN_MAP_SIZE_BITS': 6, 'MAX_MAP_SIZE_BITS': 12,
    'MIN_SNOWLINE_HEIGHT': 2, 'MAX_SNOWLINE_HEIGHT': 58, 'DEF_SNOWLINE_HEIGHT': 7,
    'MIN_HEIGHTMAP_HEIGHT': 1, 'MAX_HEIGHTMAP_HEIGHT': 255,
    'MIN_RAINFOREST_HEIGHT': 1, 'MAX_RAINFOREST_HEIGHT': 58, 'DEF_RAINFOREST_HEIGHT': 8,
    'MIN_RAINFOREST_INVERTED_HEIGHT': 8,
    'MIN_DESERT_COVERAGE': 0, 'MAX_DESERT_COVERAGE': 100,
    'DEF_SNOW_COVERAGE': 40, 'DEF_DESERT_COVERAGE': 50,
    'MIN_CARGO_SCALE': 15, 'MAX_CARGO_SCALE': 300, 'DEF_CARGO_SCALE': 100,
    'TimerGameEconomy::DAYS_IN_YEAR': 365,
    'EconomyTime::DAYS_IN_YEAR': 365, 'EconomyTime::MAX_YEAR': 9999,
    'TimerGameEconomy::MAX_YEAR': 9999,
}

def resolve(v):
    if v is None: return None
    v = v.strip()
    if v == '': return None
    if v in CONST: return CONST[v]
    try: return int(v, 0)
    except ValueError: pass
    try: return float(v)
    except ValueError: pass
    return None  # unresolved C++ const

def parse_lang(path):
    strings = {}
    positions = []   # ordered list of keys (for dropdown adjacency)
    blank_after = set()
    last_key = None
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'^(STR_\w+)\s+:(.*)$', line)
        if m:
            strings[m.group(1)] = m.group(2)
            positions.append(m.group(1))
            last_key = m.group(1)
        elif last_key and line.strip() == '':
            blank_after.add(last_key)
            last_key = None
    return strings, positions, blank_after

def dropdown_options(strval, strings, positions, blank_after, strings_sv=None):
    if strval not in strings: return [], []
    idx = positions.index(strval)
    parts = strval.split('_')
    best_keys = []
    for cut in range(len(parts) - 1, 0, -1):
        prefix = '_'.join(parts[:cut]) + '_'
        keys = []
        for k in positions[idx:idx + 25]:
            if not k.startswith(prefix): break
            keys.append(k)
            if k in blank_after: break
        if len(keys) > len(best_keys):
            best_keys = keys
    seen = set()
    en, sv = [], []
    for k in best_keys:
        label = clean_str(strings[k])
        if label in seen: continue
        seen.add(label)
        en.append(label)
        sv.append(clean_str((strings_sv or {}).get(k, label)) if strings_sv else label)
    return en, sv

def clean_str(s):
    s = re.sub(r'\{[^}]*\}', '', s)
    s = re.sub(r'\s+', ' ', s).strip().rstrip(':').strip()
    # Clean up empty parens left from placeholders: "Custom ()" → "Custom"
    s = re.sub(r'\s*\(\s*\)\s*', '', s)
    return s.strip()

def parse_ini(path):
    text = path.read_text(encoding='utf-8', errors='replace')
    enums = {}
    for m in re.finditer(
        r'constexpr\s+std::initializer_list<std::string_view>\s+(\w+)\s*\{([^}]+)\}',
        text):
        items = re.findall(r'"([^"]+)"sv', m.group(2))
        enums[m.group(1)] = items

    blocks = []
    SKIP = {'pre-amble', 'post-amble', 'templates', 'validation', 'defaults'}
    cur_name, cur_data = None, {}
    for line in text.splitlines() + ['[__END__]']:
        h = re.match(r'^\s*\[([^\]]+)\]\s*$', line)
        if h:
            if cur_name and cur_name.startswith(('SDT_', 'SDTC_')) and 'var' in cur_data:
                cur_data['_block'] = cur_name
                blocks.append(cur_data)
            cur_name = h.group(1)
            cur_data = {}
            continue
        if not cur_name or cur_name in SKIP:
            continue
        kv = re.match(r'^\s*(\w+)\s*=\s*(.*?)\s*$', line)
        if kv:
            cur_data[kv.group(1)] = kv.group(2)
    return blocks, enums

EXTERNAL_ENUMS = {
    '_climates': ['temperate', 'arctic', 'tropic', 'toyland'],
    '_town_names': [
        'english', 'french', 'german', 'american', 'latin', 'silly',
        'swedish', 'dutch', 'finnish', 'polish', 'slovak', 'norwegian',
        'hungarian', 'austrian', 'romanian', 'czech', 'swiss', 'danish',
        'turkish', 'italian', 'catalan',
    ],
}

def main():
    strings, positions, blank_after = parse_lang(INI_DIR / 'english.txt')
    sv_path = INI_DIR / 'swedish.txt'
    strings_sv = parse_lang(sv_path)[0] if sv_path.exists() else {}
    schema = {}
    all_enums = dict(EXTERNAL_ENUMS)
    skipped_notinconfig = 0

    for ini in sorted(INI_DIR.glob('*_settings.ini')):
        # Determine target cfg file based on source .ini filename
        name = ini.stem  # e.g. "network_private_settings"
        if name == 'network_private_settings':
            target_file = 'private'
        elif name == 'network_secrets_settings':
            target_file = 'secrets'
        else:
            target_file = 'openttd'
        blocks, enums = parse_ini(ini)
        all_enums.update(enums)
        for b in blocks:
            flags = b.get('flags', '')
            if 'NotInConfig' in flags:
                skipped_notinconfig += 1
                continue

            var = b['var']
            section, key = (var.split('.', 1) + ['misc'])[:2] if '.' in var else ('misc', var)
            if '.' not in var:
                section, key = 'misc', var

            block = b['_block']
            entry = {'key': key, 'cat': b.get('cat', 'SC_ADVANCED').replace('SC_', '').lower(), 'file': target_file}
            if 'GuiZeroIsSpecial' in flags:
                entry['zero_special'] = True

            str_key = b.get('str', 'STR_NULL')
            if str_key != 'STR_NULL' and str_key in strings:
                entry['label'] = clean_str(strings[str_key])
                if str_key in strings_sv:
                    sv = clean_str(strings_sv[str_key])
                    if sv and sv != entry['label']:
                        entry['label_sv'] = sv
            else:
                entry['label'] = key.replace('_', ' ').capitalize()

            help_key = b.get('strhelp', 'STR_NULL')
            if help_key != 'STR_NULL' and help_key in strings:
                entry['help'] = clean_str(strings[help_key])
                if help_key in strings_sv:
                    sv = clean_str(strings_sv[help_key])
                    if sv and sv != entry['help']:
                        entry['help_sv'] = sv

            if 'BOOL' in block:
                entry['type'] = 'bool'
                entry['def'] = b.get('def', 'false').strip().lower() == 'true'
            elif 'OMANY' in block:
                entry['type'] = 'enum'
                values = all_enums.get(b.get('full', ''), [])
                entry['values'] = values
                d = resolve(b.get('def'))
                entry['def'] = d if isinstance(d, int) and 0 <= d < len(values) else 0
            elif 'SSTR' in block or 'STR' in b.get('type', ''):
                entry['type'] = 'string'
                entry['def'] = b.get('def', '').strip().strip('"')
            else:
                # Try GuiDropdown → enum, or implicit (int range matching consecutive STR_ block).
                dd_en, dd_sv = [], []
                strval = b.get('strval', 'STR_NULL')
                if strval != 'STR_NULL' and strval in strings:
                    en_list, sv_list = dropdown_options(strval, strings, positions, blank_after, strings_sv)
                    if 'GuiDropdown' in flags:
                        dd_en, dd_sv = en_list, sv_list
                    else:
                        mn_r = resolve(b.get('min'))
                        mx_r = resolve(b.get('max'))
                        n = mx_r - mn_r + 1 if (mn_r is not None and mx_r is not None) else 0
                        if 2 <= n <= 12 and len(en_list) >= n:
                            dd_en, dd_sv = en_list[:n], sv_list[:n]
                if len(dd_en) >= 2:
                    entry['type'] = 'enum'
                    entry['values'] = dd_en
                    if dd_sv != dd_en:
                        entry['values_sv'] = dd_sv
                    d = resolve(b.get('def'))
                    entry['def'] = d if isinstance(d, int) and 0 <= d < len(dd_en) else 0
                else:
                    entry['type'] = 'int'
                    d = resolve(b.get('def'))
                    mn = resolve(b.get('min'))
                    mx = resolve(b.get('max'))
                    if d is not None: entry['def'] = d
                    if mn is not None: entry['min'] = mn
                    if mx is not None: entry['max'] = mx
                    # Capture format string (strval) so UI can render value hints.
                    sv = b.get('strval', 'STR_NULL')
                    if sv != 'STR_NULL' and sv in strings:
                        entry['fmt'] = strings[sv]

            schema.setdefault(section, []).append(entry)

    total = sum(len(v) for v in schema.values())
    OUT.write_text(
        '// Auto-generated by build-schema.py\n'
        'const SCHEMA = ' + json.dumps(schema, indent=2, ensure_ascii=False) + ';\n'
        f'const SCHEMA_META = {{ generated_from: "OpenTTD 15.3", sections: {len(schema)}, total: {total} }};\n',
        encoding='utf-8'
    )

    print(f'Wrote {OUT}')
    print(f'Sections: {len(schema)}, total settings: {total}')
    print(f'Skipped (NotInConfig): {skipped_notinconfig}')
    for sec in sorted(schema):
        print(f'  [{sec}]: {len(schema[sec])}')

if __name__ == '__main__':
    main()
