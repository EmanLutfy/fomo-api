#!/usr/bin/env node
// tracker.js — anti-ban social-graph tracker.
// Polls following + followers untuk senarai KOL dengan pacing berperingkat
// (staggered + jitter), DIFF terhadap snapshot, dan catat perubahan sahaja.
// Realtime pada paparan (event bila berubah), kuantiti request rendah.
//
// Konfigurasi (env):
//   KOL_ID_FILE    path senarai KOL ids (satu id sebaris) — wajib
//   POLL_MS        jeda MINIMUM antara setiap request (default 2000 = 30 req/min)
//   CDP_PORT       port Chrome (default 9224)
//   STATE_DIR      direktori output (default ~/.fomo-watcher)
// Output:
//   graph.json       snapshot terkini {id:{handle,following:[..],followers:[..],wallet}}
//   changes.jsonl    log perubahan (append)
//   meta.json        status/last sweep
'use strict';
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');

const HOME = process.env.HOME || os.homedir();
const STATE_DIR = process.env.STATE_DIR || path.join(HOME, '.fomo-watcher');
const CDP_PORT = Number(process.env.CDP_PORT || 9224);
const KOL_FILE = process.env.KOL_ID_FILE || path.join(STATE_DIR, 'kols.txt');
const POLL_MS = Number(process.env.POLL_MS || 2000); // min gap antara request
const BASE = 'https://prod-api.fomo.family';

let privyToken = null;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(u){ return (await fetch(u)).json(); }

// --- ambil privy-token dari Chrome yang login ---
async function fetchToken(){
  for (let i=0;i<20;i++){
    try {
      const list = await getJSON(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const page = list.find(t=>t.type==='page');
      if (!page) { await wait(1500); continue; }
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r,j)=>{ ws.onopen=r; ws.onerror=j; });
      let id=0; const pend={};
      ws.onmessage=e=>{ const m=JSON.parse(e.data); if(m.id&&pend[m.id]){pend[m.id](m.result);} };
      const c=(method,params={})=>new Promise(res=>{ const i=++id; pend[i]=res; ws.send(JSON.stringify({id:i,method,params})); });
      const r = await c('Network.getAllCookies', {});
      const ck = (r.cookies||[]).find(x=>x.name==='privy-token');
      if (ck && ck.value.length>100) { ws.close(); return ck.value; }
      ws.close(); await wait(2000);
    } catch(e){ await wait(1500); }
  }
  return null;
}

// --- API prod-api (https modul core — fetch buang header cookie!) ---
function httpsReq(p, body){
  return new Promise((res, rej) => {
    const u = new URL(BASE + p);
    const h = { 'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/154 Safari/537.36',
                'origin':'https://fomo.family','referer':'https://fomo.family/','accept':'application/json' };
    if (privyToken) h['cookie'] = `privy-token=${privyToken}; privy-session=t`;
    const rq = https.request({ hostname:u.hostname, port:443, path:u.pathname+u.search, method: body?'POST':'GET', headers:h }, r=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ let j; try{j=JSON.parse(d)}catch(e){j=d} res({status:r.statusCode, body:j}); });
    });
    rq.on('error', rej);
    if (body) rq.write(JSON.stringify(body));
    rq.end();
  });
}

// --- helper per-KOL ---
function pick(items){ return (items||[])[0]; }
function users(ro){ return (ro&&ro.users)||[]; }
async function getList(userId, kind){
  // kind: 'followingPaginate' | 'followers'
  const r = await httpsReq(`/v2/users/${userId}/${kind}?page=1&pageSize=250`);
  return users(r.body && r.body.responseObject);
}

// --- simpan + diff ---
function norm(usersArr){ return usersArr.map(u=>({ id:u.id, handle:u.userHandle||'', wallet:{sol:u.address, evm:u.evmAddress} })); }
function ids(arr){ return arr.map(x=>x.id).join(','); }

async function trackOne(id, graph, appendChanges){
  try {
    const [fing, fers] = await Promise.all([
      getList(id, 'followingPaginate').catch(()=>null),
      getList(id, 'followers').catch(()=>null)
    ]);
    const prev = graph[id];
    const now = { following: norm(fing||[]), followers: norm(fers||[]) };
    graph[id] = now;
    if (prev) {
      if (ids(prev.following) !== ids(now.following)) appendChanges(id, 'following', diffIds(prev.following, now.following));
      if (ids(prev.followers) !== ids(now.followers)) appendChanges(id, 'followers', diffIds(prev.followers, now.followers));
    }
    return true;
  } catch(e){ return false; }
}
function diffIds(a,b){ const A=new Set(a.map(x=>x.id)), B=new Set(b.map(x=>x.id)); return { added:b.filter(x=>!A.has(x.id)), removed:a.filter(x=>!B.has(x.id)) }; }

// --- runtime ---
(async () => {
  const idsList = fs.existsSync(KOL_FILE) ? fs.readFileSync(KOL_FILE,'utf8').split('\n').map(s=>s.trim()).filter(Boolean) : [];
  if (!idsList.length) { console.error('[tracker] KOL_ID_FILE kosong/tiada. Tulis id KOL satu sebaris di', KOL_FILE); process.exit(1); }
  fs.mkdirSync(STATE_DIR,{recursive:true});
  let graph = {}; try { graph = JSON.parse(fs.readFileSync(path.join(STATE_DIR,'graph.json'),'utf8')); } catch(e){}

  console.log('[tracker] ambil token...');
  privyToken = await fetchToken();
  if (!privyToken) { console.error('[tracker] TIADA privy-token. Pastikan Chrome login Fomo (burner) hidup.'); process.exit(1); }

  let changesFile = fs.createWriteStream(path.join(STATE_DIR,'changes.jsonl'), {flags:'a'});
  const appendChanges = (id, kind, diff) => {
    const rec = { t: new Date().toISOString(), userId:id, kind, added:diff.added.map(x=>x.id), removed:diff.removed.map(x=>x.id) };
    changesFile.write(JSON.stringify(rec)+'\n');
    console.log('[tracker] PERUBAHAN', id, kind, JSON.stringify(rec));
  };

  console.log(`[tracker] mula sweep ${idsList.length} KOL, POLL_MS=${POLL_MS}`);
  let i = 0;
  for (;;) {
    const id = idsList[i % idsList.length];
    const ok = await trackOne(id, graph, appendChanges);
    if (!ok) console.log('[tracker] gagal', id);
    if ((i+1) % idsList.length === 0) {
      fs.writeFileSync(path.join(STATE_DIR,'graph.json'), JSON.stringify(graph,null,2));
      fs.writeFileSync(path.join(STATE_DIR,'meta.json'), JSON.stringify({lastSweep:new Date().toISOString(), kols:idsList.length},null,2));
      console.log('[tracker] sweep selesai, kitaran seterusnya...');
      // catat if no ver : print total
    }
    i++;
    // manusiawi: waited POLL_MS + jitter rawak 0..40%
    const jitter = Math.random()*0.4;
    await wait(POLL_MS * (1 + jitter));
  }
})().catch(e=>{ console.error('[tracker] FATAL', e); process.exit(1); });
