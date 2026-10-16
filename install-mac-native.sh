#!/bin/bash
# Runs HomeView inside a small compiled app (~/Applications/HomeView.app) that starts at login.
# macOS then asks once whether HomeView may use the local network (needed for the camera). Safe to run again.
set -euo pipefail
cd "$(dirname "$0")"
DIR="$(pwd)"
[ -x .venv/bin/python ] || { echo "Run ./install-mac.sh first."; exit 1; }
command -v clang >/dev/null || { echo "Needs Apple's command line tools: run  xcode-select --install  and then this again."; exit 1; }
mkdir -p data
LABEL=com.yani.homeview
APP="$HOME/Applications/HomeView.app"
AGENT="$HOME/Library/LaunchAgents/$LABEL.plist"

echo "Stopping the current HomeView service..."
if [ -f "/Library/LaunchDaemons/$LABEL.plist" ]; then
  sudo launchctl bootout "system/$LABEL" 2>/dev/null || true
  sudo rm -f "/Library/LaunchDaemons/$LABEL.plist"
fi
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
pkill -x HomeView 2>/dev/null || true
pkill -f "HomeView.app/Contents/MacOS/HomeView" 2>/dev/null || true
pkill -f "$DIR/server.py" 2>/dev/null || true
sleep 1

echo "Building HomeView.app..."
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS"
clang -O2 -o "$APP/Contents/MacOS/HomeView" -DHV_DIR="\"$DIR\"" -DHV_PY="\"$DIR/.venv/bin/python\"" macapp/main.c
cat > "$APP/Contents/Info.plist" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.yani.homeview.app</string>
  <key>CFBundleName</key><string>HomeView</string>
  <key>CFBundleDisplayName</key><string>HomeView</string>
  <key>CFBundleExecutable</key><string>HomeView</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
  <key>NSRemindersUsageDescription</key><string>HomeView keeps the kitchen shopping list in sync with your Reminders list.</string>
  <key>NSRemindersFullAccessUsageDescription</key><string>HomeView keeps the kitchen shopping list in sync with your Reminders list.</string>
  <key>NSLocalNetworkUsageDescription</key><string>HomeView shows your camera and controls speakers on your home network.</string>
</dict></plist>
PL
codesign --force -s - "$APP"

# open the app at login (in the background, no Dock icon)
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$AGENT" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-g</string><string>-j</string><string>-a</string><string>$APP</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
PL
launchctl bootstrap "gui/$(id -u)" "$AGENT"

for i in $(seq 1 10); do sleep 1; curl -fsS -o /dev/null http://127.0.0.1:8806/frame/hv/ && break; done
curl -fsS -o /dev/null http://127.0.0.1:8806/frame/hv/ || { echo "The server did not answer. Log: $DIR/data/server.log"; tail -20 data/server.log; exit 1; }
echo "HomeView is running inside HomeView.app. Asking the camera for a picture now..."
curl -s -o /dev/null "http://127.0.0.1:8806/api/camera/status?watch=1"
echo
echo ">>> If macOS asks whether \"HomeView\" may find devices on your local network, click Allow,"
echo ">>> then run ./restart-mac.sh once."
echo "    If no prompt appears: System Settings > Privacy & Security > Local Network > turn on HomeView, then ./restart-mac.sh"
sleep 8
echo "Camera: $(curl -s 'http://127.0.0.1:8806/api/camera/status?watch=1')"
