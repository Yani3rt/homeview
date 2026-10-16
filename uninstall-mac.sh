#!/bin/bash
# Stops HomeView and removes it from startup (any of the ways it was installed). Leaves this folder alone.
LABEL=com.yani.homeview
DIR="$(cd "$(dirname "$0")" && pwd)"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
pkill -x HomeView 2>/dev/null || true; pkill -f "HomeView.app/Contents/MacOS/HomeView" 2>/dev/null || true
rm -rf "$HOME/Applications/HomeView.app"
if [ -f "/Library/LaunchDaemons/$LABEL.plist" ]; then
  sudo launchctl bootout "system/$LABEL" 2>/dev/null || true
  sudo rm -f "/Library/LaunchDaemons/$LABEL.plist"
fi
pkill -f "$DIR/server.py" 2>/dev/null || true
echo "HomeView stopped and removed from startup."
