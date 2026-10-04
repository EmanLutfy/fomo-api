// Next.js Pages Router version — simpan di pages/api/fomo.js
export default async function handler(req, res) {
  const resource = req.query.r || 'leaderboard';
  const userId = req.query.userId || '';
  const base = process.env.FOMO_API_URL || 'http://43.133.62.181:8788';
  const token = process.env.FOMO_API_TOKEN || '';
  const path = userId ? `/${resource}?userId=${userId}` : `/${resource}`;
  try {
    const r = await fetch(base + path, { headers: { Authorization: 'Bearer ' + token } });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: String(e.message) });
  }
}
