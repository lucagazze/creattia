/**
 * sync-db-categories.mjs — Aplica a creative_references (DB) las correcciones
 * de nicho/ángulo que ya quedaron guardadas en scripts/_quality_review_cache.json
 * y en el manifiesto (quality-review-library.mjs --apply se cortó a mitad del
 * loop de UPDATE de la DB). Idempotente: correrlo de nuevo no rompe nada.
 *
 * Uso: node --env-file=.env.local scripts/sync-db-categories.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';

const CACHE_PATH = new URL('./_quality_review_cache.json', import.meta.url);
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) { console.log('Faltan credenciales de Supabase.'); process.exit(1); }

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const cache = JSON.parse(await readFile(CACHE_PATH, 'utf-8'));
  const entries = Object.entries(cache).filter(([, c]) => (c.niche || c.angle) && !(c.quality > 0 && c.quality < 4));
  console.log(`🔎 ${entries.length} filas a sincronizar en la DB.`);

  let updated = 0;
  let skipped = 0;
  for (const [imagePath, c] of entries) {
    const { data: existing, error: selError } = await admin
      .from('creative_references')
      .select('metadata, category_leaf')
      .eq('image_path', imagePath)
      .maybeSingle();
    if (selError || !existing) { skipped += 1; continue; }

    const patch = {};
    if (c.angle && existing.category_leaf !== c.angle) patch.category_leaf = c.angle;
    const currentNiches = Array.isArray(existing.metadata?.foreplayNiches) ? existing.metadata.foreplayNiches : [];
    if (c.niche && !currentNiches.includes(c.niche)) {
      patch.metadata = { ...(existing.metadata || {}), foreplayNiches: [c.niche] };
    }
    if (Object.keys(patch).length === 0) { skipped += 1; continue; }

    const { error: updError } = await admin.from('creative_references').update(patch).eq('image_path', imagePath);
    if (updError) { console.log(`   ⚠️ ${imagePath}: ${updError.message}`); continue; }
    updated += 1;
    if (updated % 100 === 0) console.log(`   ...${updated} actualizadas`);
  }
  console.log(`✅ Listo. ${updated} filas actualizadas, ${skipped} ya estaban al día.`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
