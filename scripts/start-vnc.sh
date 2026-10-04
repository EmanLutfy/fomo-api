#!/usr/bin/env bash
# start-vnc.sh — start/stop virtual display + VNC di VPS.
# Cara:  ./start-vnc.sh start | stop | status
set -e
DISPNUM=1
PORT=5901
export DISPLAY=:${DISPNUM}

start(){
  echo "[VNC] start Xvfb, openbox, x11vnc..."
  pkill Xvfb 2>/dev/null || true
  sleep 1
  Xvfb :${DISPNUM} -screen 0 1440x950x24 -ac >/tmp/xvfb.log 2>&1 &
  sleep 2
  DISPLAY=:${DISPNUM} openbox >/tmp/openbox.log 2>&1 &
  sleep 2
  DISPLAY=:${DISPNUM} x11vnc -localhost -rfbport ${PORT} -forever -shared -nopw >/tmp/x11vnc.log 2>&1 &
  sleep 2
  echo "[VNC] siap. (localhost:${PORT})"
  echo "[VNC] pastikan SSH tunnel:  ssh -L ${PORT}:localhost:${PORT} ubuntu@<IP>"
}

stop(){
  echo "[VNC] stop..."
  pkill x11vnc 2>/dev/null || true
  pkill openbox 2>/dev/null || true
  pkill Xvfb 2>/dev/null || true
  sleep 1
  echo "[VNC] stopped."
}

status(){
  echo "--- proses ---"
  ps aux | grep -E 'Xvfb|x11vnc|openbox' | grep -v grep | awk '{print $2, $11, $12, $13}'
  echo "--- port ${PORT} ---"
  ss -ltn 2>/dev/null | grep ${PORT} || echo "tidak mendengar"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "Guna: ./start-vnc.sh start|stop|status"; exit 1 ;;
esac
