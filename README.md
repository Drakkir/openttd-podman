# openttd-podman

Self-hosted OpenTTD dedicated server in podman, plus a schema-driven web config editor.

## What's in here

- **Containerfile** + **entrypoint.sh** — OpenTTD 15.3 + OpenGFX 7.1 on Debian slim. Auto-resumes the latest autosave if one exists in the mounted data volume.
- **openttd.container** / **webui.container** — systemd quadlet units (rootless podman).
- **compose.yaml** — alternative deployment via `podman-compose` / `docker-compose`.
- **webui/** — static web UI (HTML + vanilla JS) that reads, edits, and writes OpenTTD's three config files:
  - 377 settings parsed from OpenTTD 15.3 source (`src/table/settings/*.ini`)
  - Bilingual labels and help (Swedish + English from OpenTTD's own translations)
  - Dropdowns auto-resolved (89+ enums incl. implicit `GuiDropdown`-flagged ints)
  - Live value hints from `strval` format strings (`{COMMA}`, `{CURRENCY_LONG}`, etc.)
  - Dynamic relevance (e.g. snow settings fade out unless landscape is arctic)
  - File-split downloads: `openttd.cfg` / `private.cfg` / `secrets.cfg`
  - Drag-and-drop uploads (multiple files at once)
  - Wiki links per setting where applicable

## Choose your deployment

Two equivalent ways to run the same three containers. **Pick one — don't run both**, they share container names and ports.

| | `podman-compose` | systemd quadlet |
|---|---|---|
| Lifecycle | `podman-compose up/down` | `systemctl --user start/stop ...` |
| Logs | `podman-compose logs -f` | `journalctl --user -u openttd -f` |
| Auto-start at login | No | Yes if you symlink the units (current files omit it) |
| Portability | Works with `docker-compose` too | podman-only |

If you don't have a strong preference: compose is simpler to get going. Quadlet integrates nicer with systemd if you already manage other user services that way.

## Quick start (compose)

```sh
git clone git@github.com:Drakkir/openttd-podman.git
cd openttd-podman
podman-compose up -d            # or: docker compose up -d
```

The compose file is portable and works with both. For rootless **podman** specifically, add the override so files in `./data/` are owned by your real user instead of a subuid, and the api can auto-start a stopped openttd container when you click "Start fresh game":

```sh
systemctl --user enable --now podman.socket    # one-time, for auto-start
podman-compose -f compose.yaml -f compose.podman.yaml up -d
```

First run builds two images (~2–3 min):
- `openttd-server` (OpenTTD 15.3 + OpenGFX, Debian slim base)
- `openttd-api` (Node 20 alpine)

Then three containers start:

| Container | What | Port |
|---|---|---|
| `openttd` | Dedicated server (auto-resumes latest autosave) | `:3979` (TCP+UDP) |
| `openttd-api` | Node backend exposing `/api/cfg/*` over the data volume | internal |
| `openttd-webui` | nginx serving the editor + reverse-proxying `/api/` | `:8088` |

### First-time configuration

1. Browse to <http://localhost:8088>. Status dot should be green (= API reachable).
2. Set the basics in the editor:
   - `network.server_name` / `server_password` / `rcon_password` / `admin_password`
   - `network.max_clients`, `max_companies`
   - Whatever game settings you want
3. Click **Spara till server**. The backend writes `openttd.cfg`, `private.cfg`, `secrets.cfg` to the data volume (each PUT also creates a `.bak-<timestamp>` snapshot).
4. Apply with `podman restart openttd`.
5. In your OpenTTD client: **Multiplayer → Add server → `<your-ip>:3979` → Join**.

### Changing settings later

| Type | How |
|---|---|
| Runtime tweaks (max_clients, autoclean, AI, economy multipliers) | Edit → save → `podman restart openttd` |
| Map-gen settings (landscape, map size, town_layout) | Edit → save → `podman-compose down` → optionally `rm -rf data/.local/share/openttd/save/*` → `up -d` for a fresh world |
| Live console commands (kick, ban, pause, say) | `podman attach openttd` (detach with `Ctrl-P Ctrl-Q`), or via in-game `rcon <password> <cmd>` from a connected client |

Stop with `podman-compose down`, view logs with `podman-compose logs -f openttd`.

## Quick start (quadlet, systemd-user)

```sh
./build.sh                                                # builds both images
ln -s "$PWD/openttd.container" "$PWD/webui.container" \
      "$PWD/api.container" "$PWD/openttd.network" \
      ~/.config/containers/systemd/
systemctl --user daemon-reload
systemctl --user start openttd api webui
```

(If you also want auto-start at user login: add an `[Install]\nWantedBy=default.target` section and run `loginctl enable-linger $USER` plus `systemctl --user enable openttd api webui`.)

The post-start configuration flow (open webui → edit → "Spara till server" → restart) is identical to the compose path; just substitute `systemctl --user restart openttd` for `podman restart openttd`.

## Data

`data/` holds runtime state: openttd.cfg, private.cfg, secrets.cfg, savegames, downloaded content. **Not** checked in.

To resume a specific save instead of latest autosave, drop the `.sav` file into `data/.local/share/openttd/save/` and start the server — the entrypoint always picks the most recent autosave it can find.

## Regenerating the config schema

When OpenTTD releases a new version, refresh `webui/schema.js`:

```sh
mkdir -p /tmp/openttd-schema && cd /tmp/openttd-schema
for f in english swedish; do
  curl -sLO "https://raw.githubusercontent.com/OpenTTD/OpenTTD/<tag>/src/lang/${f}.txt"
done
for f in company currency difficulty economy game gui linkgraph locale misc multimedia \
         network_private network_secrets network news_display pathfinding script window world; do
  curl -sLO "https://raw.githubusercontent.com/OpenTTD/OpenTTD/<tag>/src/table/settings/${f}_settings.ini"
done
cd -
python3 webui/build-schema.py
```

## License

Personal/hobby project. OpenTTD itself is GPL-2.0 — see the upstream project for that.
