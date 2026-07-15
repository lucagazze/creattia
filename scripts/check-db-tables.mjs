/**
 * Check which Supabase tables and RPC functions exist
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = [
  'creative_templates',
  'creative_references', 
  'creative_generations',
  'creative_profiles',
  'creative_products',
  'creative_product_images',
  'creative_generation_products',
];

console.log('Verificando tablas en Supabase...\n');

for (const table of tables) {
  const { error } = await admin.from(table).select('id').limit(1);
  if (error) {
    console.log(`❌ ${table} — ${error.message}`);
  } else {
    const { count } = await admin.from(table).select('id', { count: 'exact', head: true });
    console.log(`✅ ${table} — ${count ?? 0} filas`);
  }
}

// Check RPC functions
console.log('\nVerificando funciones RPC...');

const { error: reserveErr } = await admin.rpc('reserve_creative_credits', {
  p_user_id: '00000000-0000-0000-0000-000000000000',
  p_amount: 0,
});
if (reserveErr?.message?.includes('does not exist') || reserveErr?.message?.includes('no existe')) {
  console.log('❌ reserve_creative_credits — no existe');
} else {
  console.log(`✅ reserve_creative_credits — existe (error esperado: ${reserveErr?.message?.slice(0, 60)})`);
}

const { error: refundErr } = await admin.rpc('refund_creative_credits', {
  p_user_id: '00000000-0000-0000-0000-000000000000',
  p_amount: 0,
});
if (refundErr?.message?.includes('does not exist') || refundErr?.message?.includes('no existe')) {
  console.log('❌ refund_creative_credits — no existe');
} else {
  console.log(`✅ refund_creative_credits — existe (error esperado: ${refundErr?.message?.slice(0, 60)})`);
}
