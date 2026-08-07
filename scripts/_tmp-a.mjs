import fs from 'node:fs'; import os from 'node:os';
const t = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`,'utf8')).token;
const api = async (r) => (await fetch(`https://api.vercel.com${r}`, { headers: { authorization: `Bearer ${t}` } })).json();
const { teams } = await api('/v2/teams'); const eq = teams?.[0]?.id;
for (const [n,uid] of [['car-saas nuevo','dpl_Am23vsGenETmthD5mL3fzeJoRUhe'],['car-saas anterior','dpl_Y754oVCGfNepY7YEbLDvici4E43j']]) {
  const d = await api(`/v13/deployments/${uid}${eq?`?teamId=${eq}`:''}`);
  console.log(`${n}: estado=${d.status||d.readyState} target=${d.target}`);
  console.log(`   alias: ${(d.alias||[]).slice(0,4).join(', ') || 'ninguno'}`);
  console.log(`   asignado: ${d.aliasAssigned ? 'sí' : 'NO'}  error: ${d.aliasError ? JSON.stringify(d.aliasError).slice(0,140) : 'ninguno'}`);
}
