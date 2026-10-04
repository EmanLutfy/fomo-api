# Fomo API — Self-Hosted (portable) + Anti-Ban Social Tracker

Reverse-engineered access ke data Fomo (fomo.family) TANPA fomoapi.io, TANPA kos.
Nota: ini **server + strategi anti-ban**, bukan "Claude skill". Ia awalnya dibina
untuk VPS Linux dan autentikasi via cookie Privy dari Chrome yang login.

Dua komponen:
1. **`fomo-api.js`** — API proxy (leaderboard, tokens, socials, resolve).
2. **`tracker.js`** — anti-ban social-graph tracker untuk 1K+ KOL: polling berperingkat,
   diff change-detection, output perubahan. Ini jawapan kepada masalah "who followed who".

## Isi repo
```
fomo-api.js                 # API server (Node, zero dependency)
tracker.js                  # anti-ban graph tracker (staggered + diff + change event)
fomo-family-api.md          # rujukan teknikal / cara reverse (disebut dalam README)
dashboard.html              # Dashboard sedia-guna (buka terus)
scripts/run-fomo-api.sh     # start Xvfb + Chrome + VNC + API (systemd entry)
scripts/start-vnc.sh        # start/stop VNC manual
app/api/fomo/route.js       # integrasi FOMT (Next App Router)
pages/api/fomo.js           # integrasi FOMT (Next Pages Router)
setup.sh                    # AUTO-INSTALL semua sekali
```

## Mengapa ini jawapan untuk 1K KOL + realtime (tanpa ban)
Boss sudah ada endpoint (`lib/fomo.mjs`). Masalah sebenar = **ban**. `tracker.js`
menyelesaikan dengan:
- **Staggered + jitter**: sebarkan poll ke seluruh kitaran (delay rawak), bukan
  hantam serentak → kurang nampak seperti bot.
- **Diff change-detection**: simpan snapshot; hanya catat/hantar bila ada
  perubahan following/followers. "Realtime" paparan, kuantiti request rendah.
- **Backoff** pada 401/430 (isyarat ban): berhenti sementara untuk path itu.
- **Rotasi burner** (cadangan): beberapa akun, tiap buat sikit.
- **Cache wallet** — address ditarik sekali, disimpan.

### Trade-off jujur (penting!)
Lebih realtime → lebih banyak request → lebih tinggi risiko ban. Untuk 1K KOL × 2
endpoints = 2000 request/sweep. Dengan `POLL_MS=2000` (~30 req/min), satu sweep
≈ 66 minit. Untuk lebih pantas, naikkan kadar (risiko naik) atau tambah burner
rotasi. UI masih boleh papar "realtime" kerana push-on-change.

## Cara guna

### 1. Clone + install
```bash
git clone <repo> fomo-api && cd fomo-api
bash setup.sh          # node+chrome+VNC+systemd+token
```
Login burner via VNC (tunnel + client), biarkan Chrome terbuka.

### 2. API (leaderboard / tokens / socials)
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://127.0.0.1:8788/leaderboard?period=24h
```

### 3. Tracker social graph (1K KOL)
```bash
# tulis id KOL (dari leaderboard / senarai boss) satu sebaris
printf '%s\n' <id1> <id2> ... > ~/.fomo-watcher/kols.txt
node tracker.js
# output: ~/.fomo-watcher/graph.json (snapshot)
#         ~/.fomo-watcher/changes.jsonl (perubahan, append)
```
Setiap kali ada KOL follow/unfollow KOL lain, baris baru ditulis ke
`changes.jsonl` — ini sumber "real-time who-followed-who".

## Endpoints API
`/leaderboard`, `/clans`, `/tokens`, `/trending`, `/following-list?userId=`,
`/followers-list?userId=`, `/resolve?handle=`, `/following`, `/proxy?path=`,
`/health`, `/reload`.

## Keselamatan
- Burner account wajib; jangan expose `Authorization` di client-side public.
- Token Privy expire; API auto-refresh (401/430) + refresh tiap 10 min.
