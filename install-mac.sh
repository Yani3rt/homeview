#!/bin/bash
# Sets up HomeView on this Mac and starts it at login (launchd). Safe to run again.
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"

PY=""
for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' 2>/dev/null; then
    PY="$(command -v "$c")"; break
  fi
done
if [ -z "$PY" ]; then
  echo "HomeView needs Python 3.10 or newer. Install it with:  brew install python   (or from python.org), then run this again."
  exit 1
fi
echo "Using $PY ($("$PY" --version))"

[ -x .venv/bin/python ] || "$PY" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
mkdir -p data photos

LABEL=com.yani.homeview
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$DIR/.venv/bin/python</string><string>$DIR/server.py</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/data/server.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/server.log</string>
</dict></plist>
PL

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

sleep 3
if curl -fsS -o /dev/null http://127.0.0.1:8806/frame/hv/; then
  IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '<this-mac-ip>')"
  echo
  echo "HomeView is running."
  echo "  On this Mac:   http://127.0.0.1:8806/frame/hv/"
  echo "  For the frame: http://$IP:8806/frame/hv/"
  echo "If macOS asks whether python may accept incoming connections, click Allow."
else
  echo "The server did not answer. Log: $DIR/data/server.log"
  tail -20 "$DIR/data/server.log" 2>/dev/null || true
  exit 1
fi
