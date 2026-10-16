#!/bin/bash
# Restarts the HomeView server.
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f /Library/LaunchDaemons/com.yani.homeview.plist ]; then
  sudo launchctl kickstart -k system/com.yani.homeview && echo "HomeView restarted."
elif pgrep -x HomeView >/dev/null; then
  pkill -f "$DIR/server.py"; echo "HomeView restarted (back in about 3 seconds)."
else
  open -g -j -a "$HOME/Applications/HomeView.app" && echo "HomeView started."
fi
