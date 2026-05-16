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

## Quick start (compose)

```sh
podman-compose up -d
```

- Server reachable at `:3979` (TCP+UDP, OpenTTD game port).
- Admin port at `:3977` (TCP, for admin-protocol tools).
- Config editor at `http://localhost:8088`.

Stop with `podman-compose down`.

## Quick start (quadlet, systemd-user)

```sh
ln -s "$PWD/openttd.container" ~/.config/containers/systemd/
ln -s "$PWD/webui.container"   ~/.config/containers/systemd/
systemctl --user daemon-reload
systemctl --user start openttd webui
```

`./build.sh` builds the OpenTTD image before first start.

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
