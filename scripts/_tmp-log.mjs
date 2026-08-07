import fs from 'node:fs'; import os from 'node:os';
const t = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`,'utf8')).token;
const api = async (r) => (await fetch(`https://api.vercel.com${r}`, { headers: { authorization: `Bearer ${t}` } })).json();
const { teams } = await api('/v2/teams'); const eq = teams?.[0]?.id;
const { projects } = await api(`/v9/projects?${eq?`teamId=${eq}&`:''}limit=100`);
for (const n of ['car-clientes','car-saas']) {
  const p = projects.find(x=>x.name===n);
  const d = await api(`/v6/deployments?projectId=${p.id}&target=production&limit=2${eq?`&teamId=${eq}`:''}`);
  const dep = d.deployments?.[0];
  const min = Math.round((Date.now()-dep.created)/60000);
  console.log(`\n${n}: ${dep.state}  hace ${min} min  (${dep.url})`);
  const ev = await api(`/v3/deployments/${dep.uid}/events?limit=12&builds=1${eq?`&teamId=${eq}`:''}`);
  const lineas = (Array.isArray(ev)?ev:ev.events||[]).map(e=>String(e.text||e.payload?.text||'').trim()).filter(Boolean);
  for (const l of lineas.slice(-8)) console.log('   ', l.slice(0,110));
}
