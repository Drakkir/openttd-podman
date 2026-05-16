#!/bin/sh
LATEST=$(ls -t /data/.local/share/openttd/save/autosave/*.sav 2>/dev/null | head -1)
if [ -n "$LATEST" ]; then
  echo "Resuming latest autosave: $LATEST" >&2
  exec /opt/openttd/openttd -D -g "$LATEST" "$@"
else
  echo "No autosave found, starting fresh game" >&2
  exec /opt/openttd/openttd -D "$@"
fi
