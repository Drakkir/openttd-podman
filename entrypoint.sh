#!/bin/sh
# Apply any staged cfg files before starting. The webui-api writes
# *.cfg.staged then triggers a quit via the admin port; OpenTTD writes
# its own cfg on exit, then on the next start we move staged over it so
# the user's edits win.
CFG_DIR=/data/.config/openttd
for staged in "$CFG_DIR"/*.cfg.staged; do
  [ -e "$staged" ] || continue
  dest="${staged%.staged}"
  echo "Applying staged cfg: $(basename "$staged") → $(basename "$dest")" >&2
  mv "$staged" "$dest"
done

# Fill in missing/empty cfg values from /opt/defaults/. Each file in
# defaults/ is an INI-shaped file: keys with non-empty values get ensured
# in the corresponding actual cfg file. User-set non-empty values are
# never touched.
ensure_kv() {
  file="$1"; key="$2"; default="$3"; section="$4"
  [ -f "$file" ] || { mkdir -p "$(dirname "$file")"; printf '[%s]\n%s = %s\n' "$section" "$key" "$default" > "$file"; \
    echo "entrypoint: created $(basename "$file") with $key = $default" >&2; return 0; }
  if grep -q "^$key = $" "$file"; then
    sed -i "s|^$key = $|$key = $default|" "$file"
    echo "entrypoint: set $key = $default in $(basename "$file")" >&2
    return 0
  fi
  if ! grep -q "^$key = " "$file"; then
    if grep -q "^\\[$section\\]" "$file"; then
      sed -i "/^\\[$section\\]/a $key = $default" "$file"
    else
      printf '\n[%s]\n%s = %s\n' "$section" "$key" "$default" >> "$file"
    fi
    echo "entrypoint: added $key = $default to [$section] in $(basename "$file")" >&2
  fi
}

# Pre-create all standard openttd data directories so they exist with
# the container user's ownership/umask from the start — avoids the
# "Screenshot failed!" / "Autosave failed" class of issues that happen
# when a directory was created earlier under different permissions.
DATA_HOME=/data/.local/share/openttd
for d in save save/autosave screenshot content_download newgrf ai game social_integration; do
  mkdir -p "$DATA_HOME/$d" 2>/dev/null || true
done
mkdir -p "$CFG_DIR" 2>/dev/null || true

if [ -d /opt/defaults ]; then
  for def in /opt/defaults/*.cfg; do
    [ -f "$def" ] || continue
    actual="$CFG_DIR/$(basename "$def")"
    cur_section=""
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        \[*\]) cur_section="${line#[}"; cur_section="${cur_section%]}" ;;
        *=*)
          key="${line%% =*}"
          val="${line#*= }"
          [ -n "$cur_section" ] && [ -n "$key" ] && [ -n "$val" ] \
            && ensure_kv "$actual" "$key" "$val" "$cur_section"
          ;;
      esac
    done < "$def"
  done
fi

# Force-override settings the webui hard-depends on. allow_insecure_admin_login
# must be true for our minimal admin protocol client to authenticate; OpenTTD
# itself defaults it to false. We always set it to true on each startup.
if [ -f "$CFG_DIR/openttd.cfg" ]; then
  if grep -q "^allow_insecure_admin_login = " "$CFG_DIR/openttd.cfg"; then
    sed -i 's|^allow_insecure_admin_login = .*|allow_insecure_admin_login = true|' "$CFG_DIR/openttd.cfg"
  fi
  echo "entrypoint: forced allow_insecure_admin_login = true" >&2
fi

# Launch openttd and tee stdout/stderr to /data/openttd.log so the
# webui can scroll back through the last ~100 lines. A FIFO keeps
# openttd as PID 1 (signal handling intact) while tee writes to both
# the file and the container stdout (so `podman logs` still works).
LOG=/data/openttd.log
: > "$LOG"  # truncate on each start
PIPE=/tmp/ottd-log
rm -f "$PIPE"
mkfifo "$PIPE"
(tee -a "$LOG" < "$PIPE" &)

# One-shot sentinel: if /data/.no-resume exists, skip autosave loading
# and start a fresh game. The sentinel is removed so the next restart
# resumes normally.
SENTINEL=/data/.no-resume
if [ -e "$SENTINEL" ]; then
  echo "Sentinel /data/.no-resume found — starting fresh game (sentinel cleared)" >&2
  rm -f "$SENTINEL"
  exec /opt/openttd/openttd -D "$@" > "$PIPE" 2>&1
fi

LATEST=$(ls -t /data/.local/share/openttd/save/autosave/*.sav 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then
  echo "Resuming latest autosave: $LATEST" >&2
  exec /opt/openttd/openttd -D -g "$LATEST" "$@" > "$PIPE" 2>&1
else
  echo "No autosave found, starting fresh game" >&2
  exec /opt/openttd/openttd -D "$@" > "$PIPE" 2>&1
fi
