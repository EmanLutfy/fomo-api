# Fomo API — Self-Hosted (portable)

Reverse-engineered access ke data Fomo (fomo.family) TANPA fomoapi.io, TANPA kos,
guna API internal `prod-api.fomo.family` yang diautentikasi via cookie Privy.

Sesiapa yang ada VPS + akun Fomo **burner** boleh deploy API sendiri dalam
beberapa minit. Setiap orang guna token & burner mereka sendiri — tak kongsi.

## Isi repo
```
fomo-api.js                 # API server (Node, tiada dependency)
dashboard.html              # Dashboard sedia-guna (buka terus)
scripts/run-fomo-api.sh     # start Xvfb + Chrome + VNC + API (systemd entry)
scripts/start-vnc.sh        # start/stop VNC manual
app/api/fomo/route.js       # route handler FOMT (Next App Router)
pages/api/fomo.js           # route handler FOMT (Next Pages Router)
setup.sh                    # AUTO-INSTALL semua sekali
```

## Cara guna (5 minit)

### 1. Clone + jalankan installer
```bash
git clone https://<repo-anda> fomo-boss && cd fomo-boss
bash setup.sh
```
Installer pasang: node, Google Chrome, VNC, systemd service (auto-start boot,
auto-restart). Token API dijana automatik.

### 2. Login burner (sekali je — anda sahaja)
- SSH tunnel: `ssh -L 5901:localhost:5901 <user>@<IP>`
- Buka VNC client → `localhost:5901`
- Dalam Google Chrome yang buka `fomo.family` → **login guna akun BURNER**
- Biarkan chrome terbuka (Privy auto-refresh token)

### 3. API anda sedia
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://127.0.0.1:8788/leaderboard?period=24h
```
Sambung ke website anda (FOMT/Vercel): guna `app/api/fomo/route.js` + set env
`FOMO_API_URL` & `FOMO_API_TOKEN`. Website panggil `/api/fomo?r=...`.

## Endpoints
| Route | Keterangan |
|-------|-----------|
| `/leaderboard?period=24h` | trader leaderboard PnL |
| `/clans` | clan/KOL leaderboard |
| `/tokens` | verified tokens (447) |
| `/trending` | trending tokens |
| `/following-list?userId=<id>` | KOL yang di-follow (senarai) |
| `/followers-list?userId=<id>` | KOL yang follow (senarai) |
| `/resolve?handle=<username>` | handle → id + wallet solana/evm |
| `/following` | followingIds current user |
| `/proxy?path=...` | panggil endpoint prod-api lain |
| `/health` | status + token |
| `/reload` | re-grab privy-token |

Setiap entri KOL dalam following/followers bawa wallet:
`address` (Solana) + `evmAddress` (0x).

## Nota penting
- **Burner account WAJIB** — akun utama mudah kena block bila di-scrape.
- Token Privy **expire** — API auto-refresh (401/430 → reload) + refresh tiap 10 min.
- Jangan expose `Authorization Bearer` token dalam kod client-side yang public —
  letak di env/backend (Vercel env atau route handler server-side).
- Polling Fomo/API elok perlahan (≥120s) — elak dideteksi bot.

## Cara MENDAPAT privilege
Ini disusun selepas reverse-engineer: jumpa base API `prod-api.fomo.family`,
auth = cookie `privy-token` (dari Privy SDK selepas login), dan sampling endpoint
dari network tab. Detail lengkap: skill `fomo-family-api`.
