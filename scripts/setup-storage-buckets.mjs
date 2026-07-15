/**
 * Creates the creative-assets bucket in Supabase (private, for user uploads)
 * and also checks/fixes any other missing infrastructure
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log('Verificando buckets existentes...');
const { data: buckets, error: listErr } = await admin.storage.listBuckets();
if (listErr) { console.error('Error listando buckets:', listErr.message); process.exit(1); }

const existing = new Set(buckets.map(b => b.id));
console.log('Buckets actuales:', [...existing].join(', ') || '(ninguno)');

// ── creative-assets (private, for user-generated images) ──────────────────
if (existing.has('creative-assets')) {
  console.log('✅ Bucket creative-assets ya existe');
} else {
  console.log('Creando bucket creative-assets (privado)...');
  const { error } = await admin.storage.createBucket('creative-assets', {
    public: false,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/avif'],
    fileSizeLimit: 52428800, // 50MB
  });
  if (error) {
    console.error('❌ Error creando creative-assets:', error.message);
  } else {
    console.log('✅ Bucket creative-assets creado exitosamente (privado)');
  }
}

// ── creative-references (should already exist as public) ──────────────────
if (existing.has('creative-references')) {
  console.log('✅ Bucket creative-references ya existe');
} else {
  console.log('Creando bucket creative-references (público)...');
  const { error } = await admin.storage.createBucket('creative-references', {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/avif'],
    fileSizeLimit: 52428800,
  });
  if (error) {
    console.error('❌ Error creando creative-references:', error.message);
  } else {
    console.log('✅ Bucket creative-references creado exitosamente (público)');
  }
}

// ── Verify final state ────────────────────────────────────────────────────
console.log('\nVerificando estado final...');
const { data: finalBuckets, error: finalErr } = await admin.storage.listBuckets();
if (finalErr) { console.error('Error verificando:', finalErr.message); process.exit(1); }

for (const bucket of finalBuckets) {
  console.log(`  ${bucket.id} — public=${bucket.public}`);
}

// ── Test upload to creative-assets ───────────────────────────────────────
console.log('\nProbando upload de prueba a creative-assets...');
const testData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const testPath = 'test/ping.png';

const { error: uploadErr } = await admin.storage.from('creative-assets').upload(testPath, testData, {
  contentType: 'image/png', upsert: true,
});

if (uploadErr) {
  console.error('❌ Upload de prueba falló:', uploadErr.message);
} else {
  console.log('✅ Upload de prueba exitoso');
  // Clean up test file
  await admin.storage.from('creative-assets').remove([testPath]);
  console.log('   Archivo de prueba eliminado');
}

console.log('\n✅ Setup de storage completado.');
