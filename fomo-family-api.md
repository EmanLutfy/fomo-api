# fomo-family-api — teknik reverse & bagaimana ia diperoleh

Rujukan lengkap untuk memanggil API internal Fomo (fomo.family) terus.

## API
- Base: `https://prod-api.fomo.family`
- Auth: cookie `privy-token=<JWT>`; `privy-session=t` + header `origin: https://fomo.family`,
  `referer: https://fomo.family/`, `user-agent: Chrome`.

## CARA AMBIL TOKEN
Token ialah cookie Chrome di bawah domain fomo.family, dijana oleh Privy SDK selepas
login. Ambil guna CDP:
```js
// Chrome perlu buka fomo.family + login (burner)
Network.getAllCookies -> cari name === 'privy-token'
```
Token EXPIRE (JWT) — perlu re-pull / refresh. Chrome kekal hidup = Privy auto-refresh.

## PITFALL KRITIKAL
Node `fetch()` (WHATWG) **buang** header `cookie`/`origin`/`referer`/`user-agent`
sebab ia "forbidden headers". Akibat: request nampak tiada cookie -> `unauthorized`.
FIX: guna `https` modul core yang benarkan header penuh (lihat tracker.js / fomo-api.js).

## Endpoint sosial (untuk who-followed-who)
| Endpoint | Fungsi |
|----------|--------|
| `GET /v2/users/{id}/followingPaginate?page&pageSize` | senarai KOL yang dia follow |
| `GET /v2/users/{id}/followers?page&pageSize` | senarai yang follow dia |
| `GET /v2/users/{id}/mutuals` | mutual |
| `GET /v2/users/userHandle/{handle}` | handle -> id + address (solana/evm) |
| `GET /v2/leaderboard/{24h|7d|1m}` | trader leaderboard (id + address) |
| `POST /proxy/trendingTokens` | trending tokens |
| `GET /proxy/verifiedTokens` | verified tokens |

Setiap entri KOL bawa `address` (Solana) + `evmAddress` (0x).

## Anti-ban (penting untuk 1K KOL + realtime)
- **Pacing staggered + jitter** — jangan hantam semua serentak; spread dengan delay
  rawak (nampak manusia). Lihat `tracker.js` → `POLL_MS`.
- **Diff change-detection** — simpan snapshot, hantar event HANYA bila berubah.
- **Backoff** pada 401/430 — berhenti & alert, elak tambah ban.
- **Rotasi burner** — beberapa akun, tiap buat sikit.
- **Browser Cors/sesi real** kurang detect berbanding raw Bearer API.
- Trade-off: makin realtime makin banyak request = makin tinggi risiko ban. Gunakan
  pacing yang munasabah (10–30 minit sweep + push-on-change untuk "realtime" paparan).

## Sumber
Repo ini dihasilkan selepas reverse-engineering: sampling endpoint dari network
Chrome + ujian P&P cookie terhadap prod-api.
