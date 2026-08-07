import fs from 'node:fs'; import os from 'node:os';
const t = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`,'utf8')).token;
const api = async (r) => (await fetch(`https://api.vercel.com${r}`, { headers: { authorization: `Bearer ${t}` } })).json();
const { teams } = await api('/v2/teams'); const eq = teams?.[0]?.id;
const ev = await api(`/v3/deployments/dpl_CnQVUxyfuidUotsjUdGRCVBb1LNV/events?limit=200&builds=1${eq?`&teamId=${eq}`:''}`);
const l = (Array.isArray(ev)?ev:ev.events||[]).map(e=>String(e.text||e.payload?.text||'').trim()).filter(Boolean);
for (const x of l.slice(-22)) console.log('  ', x.slice(0,150));
