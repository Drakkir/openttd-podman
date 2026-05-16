#!/bin/sh
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
