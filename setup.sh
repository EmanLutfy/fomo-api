#!/usr/bin/env bash
# setup.sh — Auto-install self-hosted Fomo API pada VPS anda sendiri.
# Jalan SEKALI je. Lepas tu login burner via VNC, dan API anda hidup 24/7.
#  Guna:  bash setup.sh
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CFG="$HOME/.fomo-watcher"
PORT="${FOMO_API_PORT:-8788}"
TOKEN="${FOMO_API_TOKEN:-$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')}"

echo "==> [1/5] Pasang keperluan (git, node, chrome, VNC)..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git nodejs xvfb x11vnc openbox xauth >/dev/null 2>&1 || true
# Google Chrome (bukan snap — snap AppArmor menyekat)
if ! command -v google-chrome >/dev/null 2>&1; then
  curl -sL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo apt-get install -y -qq /tmp/chrome.deb >/dev/null 2>&1 || true
  rm -f /tmp/chrome.deb
fi

echo "==> [2/5] Sediakan folder konfigurasi..."
mkdir -p "$CFG"

echo "==> [3/5] Pasang systemd service (auto-start + auto-restart)..."
# pastikan profile path betul dalam run script
sed -i "s|/home/ubuntu/.fomo-watcher|$CFG|g" "$DIR/scripts/run-fomo-api.sh"
sed -i "s|fomt-secret-123|$TOKEN|g" "$DIR/scripts/run-fomo-api.sh" "$DIR/fomo-api.js" 2>/dev/null || true
chmod +x "$DIR/scripts/run-fomo-api.sh" "$DIR/scripts/start-vnc.sh"

cat > /tmp/fomo-api.service <<UNIT
[Unit]
Description=Fomo API (self-hosted)
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=$USER
Environment=FOMO_API_PORT=$PORT
Environment=FOMO_API_TOKEN=$TOKEN
ExecStart=$DIR/scripts/run-fomo-api.sh
Restart=always
RestartSec=5
WorkingDirectory=$DIR
[Install]
WantedBy=multi-user.target
UNIT
sudo cp /tmp/fomo-api.service /etc/systemd/system/fomo-api.service
sudo systemctl daemon-reload
sudo systemctl enable fomo-api >/dev/null 2>&1 || true

echo "==> [4/5] Mulakan VNC + Chrome + API..."
sudo systemctl restart fomo-api >/dev/null 2>&1 || bash "$DIR/scripts/run-fomo-api.sh" &

echo "==> [5/5] Sedia."
echo
echo "======================================================"
echo "  LOGIN BURNER (sekali je) — penting!"
echo "======================================================"
echo "1) SSH tunnel dari komputer anda:"
echo "     ssh -L 5901:localhost:5901 $USER@<IP-VPS>"
echo "2) Buka VNC client -> localhost:5901"
echo "3) Dalam Google Chrome yang terbuka, LOGIN fomo.family guna akun BURNER"
echo "   (bukan akun utama!)"
echo "4) Biarkan chrome buka — API akan kekal 24/7."
echo
echo "  API anda:  http://<IP-VPS>:$PORT"
echo "  Token:     $TOKEN"
echo "  Test:"
echo "    curl -H \"Authorization: Bearer $TOKEN\" http://127.0.0.1:$PORT/leaderboard?period=24h"
echo "  Daftar endpoint: /leaderboard /clans /tokens /trending /following-list /followers-list /resolve /health /reload"
echo "======================================================"
