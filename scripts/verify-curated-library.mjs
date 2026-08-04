import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('Faltan las variables de Supabase.');

const bucket = 'creative-references';
const manifestPath = 'manifests/starter-static-50.json';
const allowedAngles = new Set([
	'producto', 'competencia', 'resenas', 'precio', 'razones-porque', 'caracteristicas',
	'antes-despues', 'noticias', 'estadisticas', 'estacional',
]);
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const manifestResponse = await fetch(
	`${supabaseUrl}/storage/v1/object/public/${bucket}/${manifestPath}?verify=${Date.now()}`,
	{ headers: { 'cache-control': 'no-cache' } },
);
if (!manifestResponse.ok) throw new Error(`No se pudo leer el manifiesto (${manifestResponse.status}).`);
const manifest = await manifestResponse.json();

const rows = [];
for (let from = 0; ; from += 1000) {
	const { data, error } = await admin.from('creative_references')
		.select('image_path,category_leaf,metadata,is_active')
		.eq('is_active', true)
		.range(from, from + 999);
	if (error) throw error;
	rows.push(...(data || []));
	if (!data || data.length < 1000) break;
}

const manifestStatic = manifest.items.filter((item) => item.imagePath && item.metadata?.mediaType !== 'video');
const manifestPaths = new Set(manifestStatic.map((item) => item.imagePath));
const databasePaths = new Set(rows.map((row) => row.image_path));
const manifestOnly = [...manifestPaths].filter((path) => !databasePaths.has(path));
const databaseOnly = [...databasePaths].filter((path) => !manifestPaths.has(path));
const invalidManifestAngles = manifestStatic.filter((item) => !allowedAngles.has(item.categoryLeaf));
const invalidDatabaseAngles = rows.filter((row) => !allowedAngles.has(row.category_leaf));
const manifestNiches = manifestStatic.filter((item) => Object.hasOwn(item.metadata || {}, 'foreplayNiches'));
const databaseNiches = rows.filter((row) => Object.hasOwn(row.metadata || {}, 'foreplayNiches'));

const angleSamples = new Map();
for (const item of manifestStatic) if (!angleSamples.has(item.categoryLeaf)) angleSamples.set(item.categoryLeaf, item.imagePath);
for (const [angle, imagePath] of angleSamples) {
	const response = await fetch(`${supabaseUrl}/storage/v1/object/public/${bucket}/${imagePath}`, {
		headers: { range: 'bytes=0-31' },
	});
	if (!response.ok) throw new Error(`La muestra de ${angle} no responde (${response.status}): ${imagePath}`);
}

const result = {
	manifest: manifestStatic.length,
	database: rows.length,
	manifestUnique: manifestPaths.size,
	databaseUnique: databasePaths.size,
	manifestOnly: manifestOnly.length,
	databaseOnly: databaseOnly.length,
	invalidManifestAngles: invalidManifestAngles.length,
	invalidDatabaseAngles: invalidDatabaseAngles.length,
	manifestNiches: manifestNiches.length,
	databaseNiches: databaseNiches.length,
	publicAngleSamples: angleSamples.size,
};
console.log(JSON.stringify(result, null, 2));

if (
	result.manifest !== result.database
	|| result.manifest !== result.manifestUnique
	|| result.database !== result.databaseUnique
	|| result.manifestOnly
	|| result.databaseOnly
	|| result.invalidManifestAngles
	|| result.invalidDatabaseAngles
	|| result.manifestNiches
	|| result.databaseNiches
	|| result.publicAngleSamples !== allowedAngles.size
) process.exitCode = 1;
