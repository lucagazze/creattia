import fs from 'node:fs'; import os from 'node:os';
const t = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`,'utf8')).token;
const api = async (r) => (await fetch(`https://api.vercel.com${r}`, { headers: { authorization: `Bearer ${t}` } })).json();
const { teams } = await api('/v2/teams'); const eq = teams?.[0]?.id;
const { projects } = await api(`/v9/projects?${eq?`teamId=${eq}&`:''}limit=100`);
const ahora = Date.now();
for (const n of ['creattia','car-clientes','car-saas']) {
  const p = projects.find(x=>x.name===n);
  const d = await api(`/v6/deployments?projectId=${p.id}&limit=6${eq?`&teamId=${eq}`:''}`);
  console.log(`\n${n}`);
  for (const dep of d.deployments||[]) {
    const min = Math.round((ahora-dep.created)/60000);
    console.log(`  ${String(dep.state).padEnd(9)} ${String(dep.target||'preview').padEnd(11)} hace ${String(min).padStart(3)} min  ${dep.uid}`);
  }
}
