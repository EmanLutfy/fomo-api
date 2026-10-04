#!/usr/bin/env node
// fomo-api.js — SELF-HOSTED FOMO API (Fomo-only, fast, no browser per poll).
//
// Privy-token diambil SEKALI dari sesi fomo.family (browser/VNC yang dah login),
// lepas tu SEMUA data dipanggil terus via HTTP ke prod-api.fomo.family — laju,
// tiada browser untuk setiap poll, tiada fomoapi.io, tiada kos.
//
// Routes (GET), semua wajib `Authorization: Bearer <TOKEN>`:
//   /health                        -> status + token ok?
//   /leaderboard?period=24h        -> trader leaderboard  (24h|7d|1m)
//   /clans                         -> clan/leaderboard (KOL)
//   /tokens                        -> verified tokens
//   /trending                      -> trending tokens
//   /trades?userId=<id>            -> trades user tertentu
//   /following                     -> followingIds current user
//   /proxy?path=<prod-api path>    -> proxy panggil mana-mana endpoint prod-api
//
// Run: DISPLAY=:1 FOMO_API_TOKEN=xxx node fomo-api.js
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');

const HOME = process.env.HOME || os.homedir();
const PROFILE = path.join(HOME, '.fomo-watcher', 'profile');
const CDP_PORT = 9224;
const HTTP_PORT = Number(process.env.FOMO_API_PORT || 8788);
const API_TOKEN = process.env.FOMO_API_TOKEN || 'change-me';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const BASE = 'https://prod-api.fomo.family';

let privyToken = null;   // diletakkan semasa startup
const wait = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(u){ return (await fetch(u)).json(); }

// ---- pastikan browser berjalan supaya privy-token wujud ----
async function ensureChrome(){
  // kalau CDP dah hidup (chrome berjalan), jangan spawn lagi
  try { await getJSON(`http://127.0.0.1:${CDP_PORT}/json/version`); return; } catch(e){}
  spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`,'--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--window-size=1440,950',`--user-data-dir=${PROFILE}`,'https://fomo.family/'],
    { stdio:['ignore','ignore','ignore'], detached:false }).unref();
}

async function fetchPrivyToken(){
  for (let i=0;i<20;i++){
    try {
      const list = await getJSON(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const page = list.find(t=>t.type==='page');
      if (!page) { await wait(1500); continue; }
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r,j)=>{ ws.onopen=r; ws.onerror=j; });
      let id=0; const pend={};
      ws.onmessage = e => { const m=JSON.parse(e.data); if(m.id&&pend[m.id]){pend[m.id](m.result);} };
      const c=(method,params={})=>new Promise(res=>{ const i=++id; pend[i]=res; ws.send(JSON.stringify({id:i,method,params})); });
      const r = await c('Network.getAllCookies', {});
      const ck = (r.cookies||[]).find(x => x.name === 'privy-token');
      if (ck && ck.value && ck.value.length > 100) {
        privyToken = ck.value;
        console.log('[fomo-api] privy-token OK (panjang', ck.value.length, ')');
        ws.close();
        return true;
      }
      ws.close();
      await wait(3000);
    } catch(e){ await wait(1500); }
  }
  console.log('[fomo-api] TIDAK jumpa privy-token. Login Fomo dulu dalam browser/VNC.');
  return false;
}

// ---- panggil prod-api dengan cookie privy-token (guna https modul core, sebab
//      fetch/WHATWG BUANG header cookie/origin/referer — itu punca unauthorized) ----
const https = require('https');

function httpsReq(urlStr, method, customHeaders, body){
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const headers = Object.assign({ 'accept':'application/json' }, customHeaders);
    if (body) { headers['content-type'] = 'application/json'; }
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      method: method || 'GET', headers
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json; try { json = JSON.parse(data); } catch(e){ json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function fetchBase(pathQ, method='GET', body, _retried){
  const url = BASE + pathQ;
  const headers = {
    'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/154 Safari/537.36',
    'origin':'https://fomo.family',
    'referer':'https://fomo.family/',
    'accept':'application/json'
  };
  if (privyToken) headers['cookie'] = `privy-token=${privyToken}; privy-session=t`;
  const res = await httpsReq(url, method, headers, body);
  if ((res.status === 401 || res.status === 403 || res.status === 430) && !_retried) {
    console.log('[fomo-api] token mungkin expire (', res.status, ') — auto re-login cuba refresh token...');
    const ok = await fetchPrivyToken();
    if (ok) return fetchBase(pathQ, method, body, true);
  }
  return res;
}

async function proxyPath(pathQ, method, body){
  const r = await fetchBase(pathQ, method, body);
  return { status: r.status, json: r.body };
}

function auth(req,res){
  const h = req.headers['authorization'] || '';
  return (h === `Bearer ${API_TOKEN}` || h === API_TOKEN);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('content-type','application/json');
  res.setHeader('access-control-allow-origin','*');
  res.setHeader('access-control-allow-headers','authorization, content-type');
  if (req.method==='OPTIONS'){ res.writeHead(204); res.end(); return; }
  if (!auth(req,res)){ res.writeHead(401); res.end(JSON.stringify({error:'unauthorized'})); return; }
  const u = new URL(req.url, 'http://x');
  const route = u.pathname;

  try {
    let out;
    if (route === '/health') {
      out = { ok:true, privyToken: !!privyToken, base: BASE };
    } else if (route === '/reload') {
      // re-grab privy-token dari browser (guna lepas login)
      const ok = await fetchPrivyToken();
      out = { reloaded: ok, privyToken: !!privyToken };
    } else if (route === '/leaderboard') {
      const p = u.searchParams.get('period') || '24h';
      out = (await fetchBase(`/v2/leaderboard/${p}`)).body;
    } else if (route === '/clans') {
      out = (await fetchBase('/v2/clans/leaderboard')).body;
    } else if (route === '/tokens') {
      out = (await fetchBase('/proxy/verifiedTokens')).body;
    } else if (route === '/trending') {
      out = (await fetchBase('/proxy/trendingTokens','POST',{page:1,pageSize:25,timeframe:'24h'})).body;
    } else if (route === '/trades') {
      const userId = u.searchParams.get('userId') || '';
      if (!userId){ res.writeHead(400); res.end(JSON.stringify({error:'perlukan ?userId='})); return; }
      out = (await fetchBase(`/trades?userId=${encodeURIComponent(userId)}`)).body;
    } else if (route === '/following') {
      out = (await fetchBase('/v2/users/current/followingIds')).body;
    } else if (route === '/following-list' || route === '/followers-list') {
      // socials graph:  ?userId=<uuid>&page=1&pageSize=100
      const userId = u.searchParams.get('userId') || '';
      const page = u.searchParams.get('page') || '1';
      const ps = u.searchParams.get('pageSize') || '100';
      if (!userId){ res.writeHead(400); res.end(JSON.stringify({error:'perlukan ?userId=<uuid>'})); return; }
      const pathQ = `/v2/users/${userId}/${route === '/following-list' ? 'followingPaginate' : 'followers'}?page=${page}&pageSize=${ps}`;
      out = (await fetchBase(pathQ)).body;
    } else if (route === '/resolve') {
      // resolve handle -> user (id + wallet addresses): ?handle=<userHandle>
      const handle = (u.searchParams.get('handle') || '').toLowerCase();
      if (!handle){ res.writeHead(400); res.end(JSON.stringify({error:'perlukan ?handle='})); return; }
      out = (await fetchBase(`/v2/users/userHandle/${handle}`)).body;
    } else if (route === '/proxy') {
      const pp = u.searchParams.get('path') || '';
      out = (await fetchBase(pp)).body;
    } else {
      res.writeHead(404); res.end(JSON.stringify({error:'not found'})); return;
    }
    res.end(JSON.stringify(out));
  } catch (e) {
    res.writeHead(502); res.end(JSON.stringify({error:'upstream error', detail:String(e.message)}));
  }
});

// boot
(async () => {
  await ensureChrome();
  await wait(6000);
  const ok = await fetchPrivyToken();
  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`[fomo-api] hidup di http://0.0.0.0:${HTTP_PORT}  (token: private=${ok ? 'YA':'TIDAK'})`);
    console.log('[fomo-api] routes: /leaderboard /clans /tokens /trending /trades?userId= /following /proxy /health /reload');
  });
  // refresh privy-token berkala (Privy auto-rotate) supaya sentiasa segar
  setInterval(async () => { try { await fetchPrivyToken(); } catch(e){} }, 10 * 60 * 1000);
})();
