// Despliegue NUEVO desde el mismo commit de git: build limpio, sin caché, con
// las variables ya actualizadas. No cambia una línea de código.
import fs from 'node:fs'; import os from 'node:os';
const t = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`,'utf8')).token;
const api = async (r, o={}) => {
  const res = await fetch(`https://api.vercel.com${r}`, { ...o, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', ...(o.headers||{}) } });
  const b = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(b.error||b).slice(0,200)}`);
  return b;
};
const { teams } = await api('/v2/teams'); const eq = teams?.[0]?.id;
const q = eq ? `?teamId=${eq}&forceNew=1&skipAutoDetectionConfirmation=1` : '?forceNew=1';
const fuentes = { 'car-clientes': { repoId: '1236030144', ref: '2744e78c' }, 'car-saas': { repoId: '1266293353', ref: 'aa201b55' } };
for (const [n, f] of Object.entries(fuentes)) {
  try {
    const nuevo = await api(`/v13/deployments${q}`, {
      method: 'POST',
      body: JSON.stringify({ name: n, target: 'production', gitSource: { type: 'github', repoId: f.repoId, ref: f.ref } }),
    });
    console.log(`${n.padEnd(14)} build limpio lanzado → ${nuevo.url}`);
  } catch (e) { console.log(`${n.padEnd(14)} FALLÓ: ${e.message}`); }
}
