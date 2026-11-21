#!/data/data/com.termux/files/usr/bin/sh
# Starts the server on an Android phone running Termux, and keeps the phone from sleeping it.
cd "$(dirname "$0")/.." || exit 1
termux-wake-lock 2>/dev/null
exec node --disable-warning=ExperimentalWarning server.js >> data/server.log 2>&1
