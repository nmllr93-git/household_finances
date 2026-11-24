#!/usr/bin/env bash
# Packs the server for Linux installs: larenest-server-<version>.tar.gz (no personal data, no keys).
set -euo pipefail
cd "$(dirname "$0")/.."
V="$(node -p "require('./package.json').version")"
OUT="${1:-.}/larenest-server-$V.tar.gz"
tar --exclude='seed' -czf "$OUT" package.json server.js digest.js core public scripts/install-linux.sh
echo "$OUT"
