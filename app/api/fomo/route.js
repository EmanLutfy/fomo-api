// Next.js (App Router) route handler — proxy ke self-hosted Fomo API.
// Simpan di: app/api/fomo/route.js  (dalam project FOMT)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('r') || 'leaderboard';
  const userId = searchParams.get('userId') || '';
  const base = process.env.FOMO_API_URL || 'http://43.133.62.181:8788';
  const token = process.env.FOMO_API_TOKEN || '';
  const path = userId ? `/${resource}?userId=${userId}` : `/${resource}`;

  try {
    const res = await fetch(base + path, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message) }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
}
