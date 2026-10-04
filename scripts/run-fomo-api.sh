#!/usr/bin/env bash
# run-fomo-api.sh — starts Xvfb + Chrome + VNC + fomo-api as one systemd-managed unit.
# Javascript/service: kalau mana-mana komponen mati, ia restart.
set -e
export DISPLAY=:1
CFG=/home/ubuntu/.fomo-watcher

# 1. Xvfb (virtual display)
if ! pgrep -f "Xvfb :1" >/dev/null; then
  Xvfb :1 -screen 0 1440x950x24 -ac >/tmp/xvfb.log 2>&1 &
  sleep 2
fi

# 2. openbox (window manager supaya chrome visible kat VNC)
if ! pgrep -x openbox >/dev/null; then
  DISPLAY=:1 openbox >/tmp/openbox.log 2>&1 &
  sleep 2
fi

# 3. Google Chrome (persistent profile + CDP 9224) — kekal hidup utk sesi
if ! curl -s -m 2 http://127.0.0.1:9224/json/version >/dev/null 2>&1; then
  DISPLAY=:1 google-chrome --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --remote-debugging-port=9224 --user-data-dir="$CFG/profile" \
    --window-size=1440,950 --window-position=0,0 https://fomo.family/ \
    >/tmp/fomo-api-chrome.log 2>&1 &
  sleep 6
fi

# 4. VNC (localhost sahaja — secure, guna kat login)
if ! pgrep -f "x11vnc" >/dev/null; then
  DISPLAY=:1 x11vnc -localhost -rfbport 5901 -forever -shared -nopw >/tmp/x11vnc.log 2>&1 &
  sleep 2
fi

# 5. fomo-api dalam foreground (systemd track proses ni)
cd /home/ubuntu/fomo-watcher
exec env DISPLAY=:1 FOMO_API_PORT="${FOMO_API_PORT:-8788}" FOMO_API_TOKEN="${FOMO_API_TOKEN:-fomt-secret-123}" node fomo-api.js
