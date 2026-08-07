import fs from 'node:fs'; import os from 'node:os';
const t = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`,'utf8')).token;
const api = async (r) => (await fetch(`https://api.vercel.com${r}`, { headers: { authorization: `Bearer ${t}` } })).json();
const { teams } = await api('/v2/teams'); const eq = teams?.[0]?.id;
const { projects } = await api(`/v9/projects?${eq?`teamId=${eq}&`:''}limit=100`);
for (let i = 0; i < 45; i += 1) {
  const est = [];
  for (const n of ['car-clientes','car-saas']) {
    const p = projects.find(x=>x.name===n);
    const d = await api(`/v6/deployments?projectId=${p.id}&target=production&limit=1${eq?`&teamId=${eq}`:''}`);
    est.push(`${n}: ${d.deployments?.[0]?.state || '?'}`);
  }
  console.log(`  ${est.join('   ')}`);
  if (est.every(e => /READY|ERROR|CANCELED/.test(e))) break;
  await new Promise(r => setTimeout(r, 15000));
}
