import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const BATCH = 'user-angle-library-2026-08-03';
const BUCKET = 'creative-references';
const MANIFEST_PATH = 'manifests/starter-static-50.json';

const ANGLES = new Map([
	['nosotros vs ellos', { leaf: 'competencia', label: 'Nosotros vs Ellos', templateId: 23 }],
	['testimonios', { leaf: 'resenas', label: 'Testimonios', templateId: 7 }],
	['promociones y descuentos', { leaf: 'precio', label: 'Promociones y descuentos', templateId: 13 }],
	['razones porque', { leaf: 'razones-porque', label: 'Razones por qué', templateId: 30 }],
	['caracteristicas y beneficios', { leaf: 'caracteristicas', label: 'Características y beneficios', templateId: 41 }],
	['antes y despues', { leaf: 'antes-despues', label: 'Antes y después', templateId: 6 }],
	['noticias', { leaf: 'noticias', label: 'Noticias', templateId: 10 }],
	['factos y estadisticas', { leaf: 'estadisticas', label: 'Datos y estadísticas', templateId: 31 }],
	['vacaciones - estacional', { leaf: 'estacional', label: 'Vacaciones / Estacional', templateId: 19 }],
]);

function normalize(value) {
	return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function angleFromPath(filePath) {
	const stem = basename(filePath, extname(filePath)).replace(/\s+\(\d+\)$/, '').trim();
	const angle = ANGLES.get(normalize(stem));
	if (!angle) throw new Error(`Ángulo desconocido en el archivo: ${basename(filePath)}`);
	return angle;
}

async function mapConcurrent(items, concurrency, mapper) {
	const results = new Array(items.length);
	let cursor = 0;
	async function worker() {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await mapper(items[index], index);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
	return results;
}

const listArgument = process.argv.find((argument) => !argument.startsWith('--') && argument !== process.argv[0] && argument !== process.argv[1]);
const shouldApply = process.argv.includes('--apply') || process.env.npm_config_apply === 'true';
if (!listArgument) throw new Error('Uso: npm run references:import-angles -- <lista.txt> [--apply]');

const listPath = resolve(listArgument);
const paths = (await readFile(listPath, 'utf8'))
	.split(/\r?\n/)
	.map((line) => line.trim().replace(/^"|"$/g, ''))
	.filter(Boolean);

if (!paths.length) throw new Error('La lista no contiene archivos.');

const prepared = [];
for (const [index, filePath] of paths.entries()) {
	const extension = extname(filePath).toLowerCase().replace('.', '');
	if (!['jpg', 'jpeg', 'png'].includes(extension)) throw new Error(`Formato no permitido: ${basename(filePath)}`);
	const bytes = await readFile(filePath);
	if (bytes.byteLength > 15 * 1024 * 1024) throw new Error(`El archivo supera 15 MB: ${basename(filePath)}`);
	const angle = angleFromPath(filePath);
	const contentFingerprint = createHash('sha256').update(bytes).digest('hex');
	// El nombre participa del ID para preservar archivos idénticos clasificados en ángulos distintos.
	const fingerprint = createHash('sha256').update(bytes).update('\0').update(basename(filePath).toLowerCase()).digest('hex').slice(0, 16);
	prepared.push({
		index,
		filePath,
		fileName: basename(filePath),
		name: basename(filePath, extname(filePath)),
		bytes,
		extension: extension === 'jpeg' ? 'jpg' : extension,
		mime: extension === 'png' ? 'image/png' : 'image/jpeg',
		angle,
		contentFingerprint,
		fingerprint,
		storagePath: `${angle.templateId}/${fingerprint}.${extension === 'jpeg' ? 'jpg' : extension}`,
	});
}

const counts = Object.fromEntries([...ANGLES.values()].map(({ label }) => [label, 0]));
for (const item of prepared) counts[item.angle.label] += 1;
const duplicateContentGroups = [...Map.groupBy(prepared, (item) => item.contentFingerprint).values()].filter((group) => group.length > 1);

console.log(`Archivos válidos: ${prepared.length}`);
console.log(`Imágenes visualmente únicas: ${prepared.length - duplicateContentGroups.reduce((total, group) => total + group.length - 1, 0)}`);
console.table(counts);
if (!shouldApply) {
	console.log('Auditoría terminada. Agregá --apply para subir y sincronizar.');
	process.exit(0);
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('Faltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: manifestBlob, error: manifestDownloadError } = await admin.storage.from(BUCKET).download(MANIFEST_PATH);
if (manifestDownloadError || !manifestBlob) throw manifestDownloadError || new Error('No se pudo descargar el manifiesto actual.');
const manifestBytes = Buffer.from(await manifestBlob.arrayBuffer());
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (!Array.isArray(manifest.items)) throw new Error('El manifiesto remoto no contiene items.');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `manifests/backups/starter-static-50-before-${BATCH}-${timestamp}.json`;
const { error: backupError } = await admin.storage.from(BUCKET).upload(backupPath, manifestBytes, {
	contentType: 'application/json',
	upsert: false,
});
if (backupError) throw backupError;
console.log(`Respaldo creado: ${backupPath}`);

let uploaded = 0;
await mapConcurrent(prepared, 8, async (item) => {
	const { error } = await admin.storage.from(BUCKET).upload(item.storagePath, item.bytes, {
		contentType: item.mime,
		cacheControl: '31536000',
		upsert: true,
	});
	if (error) throw new Error(`${item.fileName}: ${error.message}`);
	uploaded += 1;
	if (uploaded % 25 === 0 || uploaded === prepared.length) console.log(`Storage: ${uploaded}/${prepared.length}`);
});

const previousItems = manifest.items.filter((item) => item.metadata?.batch === BATCH);
const baseItems = manifest.items.filter((item) => item.metadata?.batch !== BATCH);
const firstSortOrder = baseItems.reduce((max, item) => Math.max(max, Number(item.sortOrder) || 0), 0) + 1;
const importedAt = new Date().toISOString();
const remoteItems = prepared.map((item, index) => ({
	templateId: item.angle.templateId,
	name: item.name,
	imagePath: item.storagePath,
	promptNotes: `Referencia de ${item.angle.label}. Clasificada según el nombre original del archivo.`,
	sortOrder: firstSortOrder + index,
	rightsStatus: 'owned',
	categoryGroup: 'Ángulos publicitarios',
	categoryBranch: item.angle.label,
	categoryLeaf: item.angle.leaf,
	metadata: {
		batch: BATCH,
		mediaType: 'static_image',
		originalFileName: item.fileName,
		sourceAngle: item.angle.label,
		fingerprint: item.contentFingerprint.slice(0, 16),
		importedAt,
		importedBy: 'scripts/import-user-angle-library.mjs',
	},
}));

const rows = remoteItems.map((item) => ({
	template_id: item.templateId,
	name: item.name.slice(0, 180),
	image_path: item.imagePath,
	prompt_notes: item.promptNotes,
	sort_order: item.sortOrder,
	is_active: true,
	source_url: null,
	source_platform: 'user_upload',
	rights_status: 'owned',
	license_notes: 'Referencia aportada por el usuario para la biblioteca de creativos.',
	category_group: item.categoryGroup,
	category_branch: item.categoryBranch,
	category_leaf: item.categoryLeaf,
	metadata: item.metadata,
	updated_at: importedAt,
}));

const { error: deleteError } = await admin.from('creative_references').delete().contains('metadata', { batch: BATCH });
if (deleteError) throw deleteError;
for (let index = 0; index < rows.length; index += 100) {
	const { error } = await admin.from('creative_references').insert(rows.slice(index, index + 100));
	if (error) throw error;
	console.log(`Base de datos: ${Math.min(index + 100, rows.length)}/${rows.length}`);
}

const nextManifest = { ...manifest, items: [...baseItems, ...remoteItems] };
const { error: manifestUploadError } = await admin.storage.from(BUCKET).upload(
	MANIFEST_PATH,
	Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`),
	{ contentType: 'application/json', cacheControl: '60', upsert: true },
);
if (manifestUploadError) throw manifestUploadError;

// La descarga del SDK puede devolver por unos segundos la versión cacheada tras un upsert.
// El query param fuerza una lectura fresca del objeto público recién publicado.
const verificationResponse = await fetch(
	`${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${MANIFEST_PATH}?verify=${Date.now()}`,
	{ headers: { 'cache-control': 'no-cache' } },
);
if (!verificationResponse.ok) throw new Error(`No se pudo verificar el manifiesto: ${verificationResponse.status}.`);
const verifiedManifest = await verificationResponse.json();
const verifiedBatch = verifiedManifest.items.filter((item) => item.metadata?.batch === BATCH);
const { count: databaseCount, error: countError } = await admin
	.from('creative_references')
	.select('id', { count: 'exact', head: true })
	.contains('metadata', { batch: BATCH });
if (countError) throw countError;
if (verifiedBatch.length !== prepared.length || databaseCount !== prepared.length) {
	throw new Error(`Verificación incompleta: manifiesto=${verifiedBatch.length}, base=${databaseCount}, esperado=${prepared.length}.`);
}

const verifiedCounts = Object.fromEntries([...ANGLES.values()].map(({ leaf }) => [leaf, 0]));
for (const item of verifiedBatch) verifiedCounts[item.categoryLeaf] = (verifiedCounts[item.categoryLeaf] || 0) + 1;
for (const [label, expected] of Object.entries(counts)) {
	const leaf = [...ANGLES.values()].find((angle) => angle.label === label).leaf;
	if (verifiedCounts[leaf] !== expected) throw new Error(`Conteo incorrecto para ${label}: ${verifiedCounts[leaf]} de ${expected}.`);
}

console.log(`Importación verificada: ${prepared.length} imágenes, ${previousItems.length} entradas previas reemplazadas.`);
console.log(`Manifiesto final: ${verifiedManifest.items.length} creativos.`);
console.log(`Respaldo recuperable: ${backupPath}`);
