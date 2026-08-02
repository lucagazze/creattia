/**
 * quality-review-library.mjs — Pasada de calidad + recategorización sobre
 * TODA la biblioteca de ganadores (manifest en Supabase Storage).
 *
 * Para cada anuncio: le pide a gpt-4o-mini (visión) que puntúe la calidad
 * real de la imagen (1-10) y confirme/corrija nicho + ángulo de venta.
 * - Calidad < QUALITY_THRESHOLD → se saca de la biblioteca (manifest + DB).
 *   Los archivos NO se borran del storage (reversible si hace falta).
 * - Nicho/ángulo distinto al que tenía → se corrige en el manifest + DB.
 *
 * Resumible: guarda progreso en scripts/_quality_review_cache.json, así si
 * se corta a mitad de camino no hay que volver a pagar el análisis ya hecho.
 *
 * Uso: node --env-file=.env.local scripts/quality-review-library.mjs
 *      node --env-file=.env.local scripts/quality-review-library.mjs --apply   (aplica los cambios; sin esto solo informa)
 */
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const MANIFEST_URL = 'https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/manifests/starter-static-50.json';
const CACHE_PATH = new URL('./_quality_review_cache.json', import.meta.url);
const CONCURRENCY = 2; // la cuenta tiene 200k TPM (~1155 tokens/llamada): con más se satura
const QUALITY_THRESHOLD = 4; // 1-10, se saca lo que puntúa por debajo
const APPLY = process.argv.includes('--apply');

const NICHES = [
  'Beauty', 'Health/Wellness', 'Fashion', 'App/Software', 'Food/Drink', 'Pets',
  'Accessories', 'Real Estate', 'Education', 'Tech', 'Home/Garden', 'Medical',
  'Business/Professional', 'Jewelry/Watches', 'Kids/Baby', 'Service Business',
  'Finance', 'Sports/Outdoors', 'Travel', 'Automotive', 'Entertainment',
];
const ANGLES = ['hero', 'caracteristicas', 'precio', 'resenas', 'mitos', 'urgencia', 'envio', 'competencia', 'garantia'];

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openAIKey = process.env.OPENAI_API_KEY;
if (!supabaseUrl || !serviceRoleKey) { console.log('Faltan credenciales de Supabase.'); process.exit(1); }
if (!openAIKey) { console.log('Falta OPENAI_API_KEY.'); process.exit(1); }

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const openai = new OpenAI({ apiKey: openAIKey });

async function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  try { return JSON.parse(await readFile(CACHE_PATH, 'utf-8')); } catch { return {}; }
}
async function saveCache(cache) {
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function publicUrlFor(path) {
  return `https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${path}`;
}

async function analyzeOne(item) {
  const prompt = `Sos un director de arte evaluando anuncios reales para una biblioteca de referencias de e-commerce. Mirá la imagen y respondé SOLO un JSON con esta forma exacta:
{"quality": <entero 1-10>, "reason": "<motivo breve en español si quality<=4, si no cadena vacía>", "niche": "<uno de: ${NICHES.join(', ')}>", "angle": "<uno de: ${ANGLES.join(', ')}>"}

Criterio de "quality":
- 1-3: imagen rota, cortada, borrosa, texto ilegible o superpuesto mal, diseño amateur que ninguna marca real usaría, o que directamente da vergüenza ajena.
- 4-5: se entiende pero es mediocre (mal recorte, tipografía pobre, muy genérico).
- 6-7: correcto, prolijo, usable.
- 8-10: muy bueno, se ve como un anuncio real de una marca profesional.
"niche": el rubro del PRODUCTO que se muestra (no de quién lo mira).
"angle": el ángulo de venta principal — hero (producto en el centro sin gancho particular), caracteristicas (lista de beneficios/funciones), precio (oferta/descuento/precio destacado), resenas (testimonios/reviews), mitos (desmiente un mito o creencia), urgencia (tiempo limitado/últimas unidades), envio (envío gratis/rápido), competencia (nosotros vs. ellos/comparación), garantia (devolución/garantía).
No agregues texto fuera del JSON.`;

  let response;
  let attempt = 0;
  for (;;) {
    try {
      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: publicUrlFor(item.imagePath), detail: 'low' } },
          ],
        }],
        response_format: { type: 'json_object' },
        max_tokens: 200,
      });
      break;
    } catch (e) {
      attempt += 1;
      const isRateLimit = e?.status === 429 || /rate limit/i.test(e?.message || '');
      if (!isRateLimit || attempt > 6) throw e;
      const wait = Math.min(20000, 1000 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  const raw = response.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);
  return {
    quality: Number(parsed.quality) || 0,
    reason: String(parsed.reason || ''),
    niche: NICHES.includes(parsed.niche) ? parsed.niche : null,
    angle: ANGLES.includes(parsed.angle) ? parsed.angle : null,
  };
}

async function withConcurrency(items, limit, worker) {
  const queue = [...items];
  let done = 0;
  const runNext = async () => {
    const item = queue.shift();
    if (!item) return;
    try {
      await worker(item);
    } catch (e) {
      console.log(`   ⚠️ falló ${item.imagePath}: ${e.message}`);
    }
    done += 1;
    if (done % 25 === 0) console.log(`   ...${done}/${items.length}`);
    return runNext();
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, runNext));
}

async function main() {
  console.log('=== Pasada de calidad y categorización de la biblioteca ===');
  console.log(APPLY ? '🔧 MODO APLICAR: se van a guardar los cambios.' : 'ℹ️  MODO INFORME: no se guarda nada (correr con --apply para aplicar).');

  const res = await fetch(MANIFEST_URL);
  if (!res.ok) { console.log('No se pudo bajar el manifiesto.'); process.exit(1); }
  const manifest = await res.json();
  const items = manifest.items || [];
  console.log(`📦 ${items.length} anuncios en el manifiesto.`);

  const cache = await loadCache();
  const pending = items.filter((item) => item.imagePath && !cache[item.imagePath]);
  console.log(`🔎 ${items.length - pending.length} ya analizados antes (cache). Faltan ${pending.length}.`);

  let analyzed = 0;
  await withConcurrency(pending, CONCURRENCY, async (item) => {
    const result = await analyzeOne(item);
    cache[item.imagePath] = { ...result, name: item.name, templateId: item.templateId, analyzedAt: new Date().toISOString() };
    analyzed += 1;
    if (analyzed % 40 === 0) await saveCache(cache); // guarda progreso cada tanto
  });
  await saveCache(cache);
  console.log(`✅ Análisis completo: ${Object.keys(cache).length} anuncios en cache.`);

  // Resumen
  const toRemove = items.filter((item) => cache[item.imagePath] && cache[item.imagePath].quality > 0 && cache[item.imagePath].quality < QUALITY_THRESHOLD);
  const toRecategorize = items.filter((item) => {
    const c = cache[item.imagePath];
    if (!c) return false;
    const nicheChanged = c.niche && !(item.metadata?.foreplayNiches || []).includes(c.niche);
    const angleChanged = c.angle && c.angle !== (item.categoryLeaf || '');
    return nicheChanged || angleChanged;
  });

  console.log(`\n📊 Resultado:`);
  console.log(`   Para sacar de la biblioteca (calidad < ${QUALITY_THRESHOLD}): ${toRemove.length}`);
  console.log(`   Para recategorizar (nicho o ángulo distinto): ${toRecategorize.length}`);
  console.log(`   Ejemplos a sacar:`);
  toRemove.slice(0, 15).forEach((item) => {
    const c = cache[item.imagePath];
    console.log(`     - [${c.quality}/10] ${item.name} (${item.imagePath}) — ${c.reason}`);
  });

  if (!APPLY) {
    console.log('\nCorré de nuevo con --apply para aplicar estos cambios al manifiesto y a la base.');
    return;
  }

  // Aplicar: filtra el manifiesto y corrige categorías
  const removeSet = new Set(toRemove.map((i) => i.imagePath));
  const updatedItems = items
    .filter((item) => !removeSet.has(item.imagePath))
    .map((item) => {
      const c = cache[item.imagePath];
      if (!c) return item;
      const next = { ...item };
      if (c.angle) { next.categoryLeaf = c.angle; next.category = c.angle; }
      if (c.niche) {
        const currentNiches = Array.isArray(item.metadata?.foreplayNiches) ? item.metadata.foreplayNiches : [];
        if (!currentNiches.includes(c.niche)) {
          next.metadata = { ...item.metadata, foreplayNiches: [c.niche] };
        }
      }
      return next;
    });

  const updatedManifest = { ...manifest, items: updatedItems };
  const { error: uploadError } = await admin.storage.from('creative-references')
    .upload('manifests/starter-static-50.json', Buffer.from(JSON.stringify(updatedManifest, null, 2)), { contentType: 'application/json', upsert: true });
  if (uploadError) { console.log('❌ Error subiendo el manifiesto actualizado:', uploadError.message); process.exit(1); }
  console.log(`📄 Manifiesto actualizado subido (${updatedItems.length} anuncios, ${toRemove.length} sacados).`);

  // Sincronizar la tabla en la base: borrar los sacados, corregir categoría/nicho de los que cambiaron.
  if (toRemove.length) {
    const paths = toRemove.map((i) => i.imagePath);
    for (let i = 0; i < paths.length; i += 200) {
      const chunk = paths.slice(i, i + 200);
      const { error } = await admin.from('creative_references').delete().in('image_path', chunk);
      if (error) console.log('⚠️ error borrando de la DB:', error.message);
    }
    console.log(`🗑️  ${toRemove.length} filas borradas de creative_references (los archivos del storage NO se tocaron).`);
  }

  let updatedRows = 0;
  for (const item of toRecategorize) {
    const c = cache[item.imagePath];
    if (!c || removeSet.has(item.imagePath)) continue;
    const patch = {};
    if (c.angle) { patch.category_leaf = c.angle; }
    if (c.niche) {
      const { data: existing } = await admin.from('creative_references').select('metadata').eq('image_path', item.imagePath).maybeSingle();
      patch.metadata = { ...(existing?.metadata || item.metadata || {}), foreplayNiches: [c.niche] };
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from('creative_references').update(patch).eq('image_path', item.imagePath);
      if (!error) updatedRows += 1;
    }
  }
  console.log(`✏️  ${updatedRows} filas recategorizadas en creative_references.`);
  console.log('\n✅ Listo.');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
