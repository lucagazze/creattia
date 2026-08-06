/**
 * Copia la muestra pública de la landing desde `creative-references` (privado,
 * el catálogo que se vende) al bucket público `creative-showcase`.
 *
 * Hay que correrlo UNA vez, después de aplicar las migraciones y ANTES de que
 * el bucket de referencias quede cerrado, si no la landing queda sin imágenes.
 *
 *   node --env-file=.env scripts/publish-showcase-assets.mjs
 *
 * Es idempotente: vuelve a subir con upsert, así que se puede repetir.
 */
import { createClient } from '@supabase/supabase-js';

const SOURCE_BUCKET = 'creative-references';
const TARGET_BUCKET = 'creative-showcase';

// Misma lista que SHOWCASE_PATHS en src/lib/creattia/showcase.ts.
const paths = [
	'40/efd72e666983d8e7.webp',
	'40/1b76d7e89d46ac25.webp',
	'40/f0e11445b9ff5bcf.webp',
	'40/95585757da7f44a8.webp',
	'40/1d58518c1d718dd4.webp',
	'1/af32ca5ec7697330.webp',
	'40/dae50b9af9994bbc.webp',
	'1/dcaf28871a7a4904.webp',
	'40/ece227e7e0c07477.webp',
	'40/9c8d4a8001b24d29.webp',
	'40/6115528cf8820436.webp',
	'40/2712b3774b326865.webp',
	'40/e00a8677f0d13e45.webp',
	'40/2fb666571bf2802e.png',
	'40/55596501e64f813b.png',
	'40/174faa5c6ab2a671.png',
	'40/8640d4617f2e692d.png',
	'40/b3aaaa6a8d580a1a.png',
	'23/ec1000c7e99f98bf.jpg',
	'7/c621e734bc3f2b0d.jpg',
	'13/8d769523a157558c.jpg',
	'41/fee532dba2b04af0.jpg',
	'10/383bfa16d248c64d.png',
	'19/4e9aee92bbc8b5db.jpg',
];

const contentTypes = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', avif: 'image/avif' };

const url = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
	console.error('Faltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
	process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

let copied = 0;
const missing = [];

for (const path of paths) {
	const { data, error } = await admin.storage.from(SOURCE_BUCKET).download(path);
	if (error || !data) {
		missing.push(path);
		continue;
	}
	const extension = path.split('.').pop()?.toLowerCase() || 'png';
	const bytes = new Uint8Array(await data.arrayBuffer());
	const { error: uploadError } = await admin.storage.from(TARGET_BUCKET).upload(path, bytes, {
		contentType: contentTypes[extension] || 'image/png',
		upsert: true,
	});
	if (uploadError) {
		console.error(`✗ ${path}: ${uploadError.message}`);
		continue;
	}
	copied += 1;
	console.log(`✓ ${path}`);
}

console.log(`\n${copied}/${paths.length} imágenes publicadas en ${TARGET_BUCKET}.`);
if (missing.length) {
	console.warn(`\nNo se encontraron en ${SOURCE_BUCKET} (revisá las rutas en src/lib/creattia/showcase.ts):`);
	for (const path of missing) console.warn(`  - ${path}`);
	process.exit(1);
}
