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

# One-shot sentinel: if /data/.no-resume exists, skip autosave loading
# and start a fresh game. The sentinel is removed so the next restart
# resumes normally.
SENTINEL=/data/.no-resume
if [ -e "$SENTINEL" ]; then
  echo "Sentinel /data/.no-resume found — starting fresh game (sentinel cleared)" >&2
  rm -f "$SENTINEL"
  exec /opt/openttd/openttd -D "$@"
fi

LATEST=$(ls -t /data/.local/share/openttd/save/autosave/*.sav 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then
  echo "Resuming latest autosave: $LATEST" >&2
  exec /opt/openttd/openttd -D -g "$LATEST" "$@"
else
  echo "No autosave found, starting fresh game" >&2
  exec /opt/openttd/openttd -D "$@"
fi
