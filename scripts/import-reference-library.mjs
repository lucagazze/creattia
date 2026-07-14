import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error('Uso: npm run references:import -- docs/reference-library.example.json');

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('Faltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');

const manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
if (!Array.isArray(manifest.items) || !manifest.items.length) throw new Error('El manifiesto debe incluir un array items.');
if (manifest.items.length > 100) throw new Error('Importá como máximo 100 referencias por lote.');

const allowedRights = new Set(['owned', 'licensed', 'public_domain']);
const allowedMime = new Map([
	['image/png', 'png'],
	['image/jpeg', 'jpg'],
	['image/webp', 'webp'],
	['image/avif', 'avif'],
]);
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function loadAsset(item) {
	if (item.localImage) {
		const path = resolve(item.localImage);
		const extension = extname(path).toLowerCase().replace('.', '');
		const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
		if (!allowedMime.has(mime)) throw new Error(`Formato no permitido: ${basename(path)}`);
		const bytes = await readFile(path);
		if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('La referencia supera los 15 MB.');
		return { bytes, mime, extension: allowedMime.get(mime) };
	}
	if (item.imageUrl) {
		const response = await fetch(item.imageUrl, { signal: AbortSignal.timeout(20_000) });
		if (!response.ok) throw new Error(`No se pudo descargar ${item.imageUrl}: ${response.status}`);
		const mime = (response.headers.get('content-type') || '').split(';')[0];
		if (!allowedMime.has(mime)) throw new Error(`Formato remoto no permitido: ${mime || 'desconocido'}`);
		const bytes = Buffer.from(await response.arrayBuffer());
		if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('La referencia supera los 15 MB.');
		return { bytes, mime, extension: allowedMime.get(mime) };
	}
	throw new Error('Cada referencia necesita localImage o imageUrl.');
}

let imported = 0;
for (const [index, item] of manifest.items.entries()) {
	if (!Number.isInteger(item.templateId) || item.templateId < 1) throw new Error(`Item ${index + 1}: templateId inválido.`);
	if (!item.name?.trim()) throw new Error(`Item ${index + 1}: falta name.`);
	if (!allowedRights.has(item.rightsStatus)) throw new Error(`Item ${index + 1}: rightsStatus debe ser owned, licensed o public_domain.`);
	if (item.rightsStatus === 'licensed' && !item.licenseNotes?.trim()) throw new Error(`Item ${index + 1}: una referencia licenciada necesita licenseNotes.`);

	const asset = await loadAsset(item);
	const fingerprint = createHash('sha256').update(asset.bytes).digest('hex').slice(0, 16);
	const storagePath = `${item.templateId}/${fingerprint}.${asset.extension}`;
	const { error: uploadError } = await admin.storage.from('creative-references').upload(storagePath, asset.bytes, {
		contentType: asset.mime,
		upsert: true,
	});
	if (uploadError) throw uploadError;

	const sourceUrl = String(item.sourceUrl || item.imageUrl || '').trim() || null;
	const { data: existing, error: findError } = await admin.from('creative_references').select('id')
		.eq('template_id', item.templateId).eq('image_path', storagePath).maybeSingle();
	if (findError) throw findError;
	const row = {
		template_id: item.templateId,
		name: item.name.trim().slice(0, 180),
		image_path: storagePath,
		prompt_notes: String(item.promptNotes || '').trim().slice(0, 2000) || null,
		sort_order: Number.isInteger(item.sortOrder) ? item.sortOrder : 0,
		is_active: true,
		source_url: sourceUrl,
		source_platform: String(item.sourcePlatform || '').trim().slice(0, 80) || null,
		rights_status: item.rightsStatus,
		license_notes: String(item.licenseNotes || '').trim().slice(0, 2000) || null,
		category_group: String(item.categoryGroup || '').trim().slice(0, 120) || null,
		category_branch: String(item.categoryBranch || '').trim().slice(0, 120) || null,
		category_leaf: String(item.categoryLeaf || '').trim().slice(0, 120) || null,
		metadata: {
			...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
			importedBy: 'scripts/import-reference-library.mjs',
			fingerprint,
		},
		updated_at: new Date().toISOString(),
	};
	const query = existing
		? admin.from('creative_references').update(row).eq('id', existing.id)
		: admin.from('creative_references').insert(row);
	const { error } = await query;
	if (error) throw error;
	imported += 1;
	process.stdout.write(`\rReferencias importadas: ${imported}/${manifest.items.length}`);
}

process.stdout.write(`\nListo. ${imported} referencias verificadas quedaron disponibles.\n`);
