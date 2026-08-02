import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: buckets } = await admin.storage.listBuckets();
const existing = new Set((buckets || []).map((b) => b.id));

if (!existing.has('creative-videos')) {
  console.log('Creando bucket creative-videos (público)...');
  const { error } = await admin.storage.createBucket('creative-videos', { public: true, fileSizeLimit: 104857600 });
  if (error) { console.error('Error creando bucket:', error.message); process.exit(1); }
} else {
  console.log('Bucket creative-videos ya existe.');
}
console.log('OK');
