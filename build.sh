#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
podman build -t localhost/openttd-server:latest -f Containerfile .
