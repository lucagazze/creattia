/**
 * classify-niches.mjs — Asigna un nicho de industria a cada anuncio del manifest
 * que no lo tenga, con visión (gemini-2.5-flash). Actualiza el manifest en Storage.
 * Uso: node --env-file=.env.local scripts/classify-niches.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPA = process.env.PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GKEY = process.env.GOOGLE_AI_API_KEY;
const admin = createClient(SUPA, KEY, { auth: { persistSession: false } });

const NICHES = ['Beauty', 'Health/Wellness', 'Fashion', 'Food/Drink', 'Home/Garden', 'Sports/Outdoors', 'Pets', 'Accessories', 'Jewelry/Watches', 'Kids/Baby', 'Tech', 'App/Software', 'Automotive', 'Travel', 'Finance', 'Education', 'Medical', 'Service Business', 'Business/Professional', 'Real Estate', 'Entertainment', 'Other'];
const NICHE_ES = { 'Beauty': 'Belleza', 'Health/Wellness': 'Salud y Bienestar', 'Fashion': 'Moda', 'Food/Drink': 'Comida y Bebida', 'Home/Garden': 'Hogar y Jardín', 'Sports/Outdoors': 'Deporte', 'Pets': 'Mascotas', 'Accessories': 'Accesorios', 'Jewelry/Watches': 'Joyería', 'Kids/Baby': 'Niños y Bebés', 'Tech': 'Tecnología', 'App/Software': 'Apps', 'Automotive': 'Automotor', 'Travel': 'Viajes', 'Finance': 'Finanzas', 'Education': 'Educación', 'Medical': 'Médico', 'Service Business': 'Servicios', 'Business/Professional': 'Negocios', 'Real Estate': 'Inmobiliaria', 'Entertainment': 'Entretenimiento', 'Other': 'Otros' };
const VALID = new Set(NICHES);

async function classify(publicUrl, name, tags) {
  try {
    const img = await fetch(publicUrl);
    if (!img.ok) return null;
    const b64 = Buffer.from(await img.arrayBuffer()).toString('base64');
    const mime = img.headers.get('content-type') || 'image/jpeg';
    const prompt = `Clasificá este anuncio publicitario en UN solo nicho de industria. Marca: "${name}". Pistas: ${(tags || []).join(', ') || 'ninguna'}.\nElegí exactamente uno de esta lista (devolvé el nombre EXACTO en inglés):\n${NICHES.join(', ')}\nReglas: mirá el PRODUCTO/servicio que se vende, no el estilo del anuncio. Si es skincare/maquillaje→Beauty; suplementos/vitaminas/fitness gear→Health/Wellness; ropa/calzado→Fashion; comida/bebida/snacks→Food/Drink; joyas/relojes→Jewelry/Watches; software/app→App/Software; electrónica/gadgets→Tech. Solo usá "Other" si de verdad no encaja en ninguno.\nDevolvé SOLO JSON: {"niche":"..."}`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GKEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    const data = await res.json().catch(() => ({}));
    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const niche = JSON.parse(raw)?.niche;
    return VALID.has(niche) ? niche : null;
  } catch { return null; }
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); } }
  await Promise.all(Array.from({ length: size }, worker));
  return out;
}

async function main() {
  const { data: file } = await admin.storage.from('creative-references').download('manifests/starter-static-50.json');
  const manifest = JSON.parse(await file.text());
  const pending = manifest.items.filter((it) => !(it.metadata?.foreplayNiches?.length));
  console.log(`Total ${manifest.items.length} · a clasificar ${pending.length}`);

  let done = 0, ok = 0;
  const counts = {};
  await pool(pending, 8, async (it) => {
    const url = `${SUPA}/storage/v1/object/public/creative-references/${it.imagePath}`;
    const niche = await classify(url, it.name, it.tags) || 'Other';
    it.metadata = { ...(it.metadata || {}), foreplayNiches: [niche] };
    // que el tag del nicho aparezca también
    const label = NICHE_ES[niche] || niche;
    it.tags = Array.from(new Set([...(it.tags || []), label]));
    counts[niche] = (counts[niche] || 0) + 1;
    if (niche !== 'Other') ok++;
    if (++done % 40 === 0) console.log(`  ${done}/${pending.length}`);
  });

  const buf = Buffer.from(JSON.stringify(manifest, null, 2));
  const { error } = await admin.storage.from('creative-references').upload('manifests/starter-static-50.json', buf, { contentType: 'application/json', upsert: true });
  console.log(error ? `ERROR subir manifest: ${error.message}` : 'Manifest actualizado en Storage');
  console.log('Clasificados con nicho real:', ok, '/', pending.length);
  console.log('Distribución:', Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
