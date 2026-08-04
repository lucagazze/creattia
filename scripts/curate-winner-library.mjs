import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'creative-references';
const MANIFEST_PATH = 'manifests/starter-static-50.json';
const BATCH = 'visual-curation-2026-08-03';
const MODEL = process.env.GEMINI_CURATION_MODEL || 'gemini-2.5-flash';
const QUALITY_THRESHOLD = 6;
const APPLY = process.argv.includes('--apply') || process.env.npm_config_apply === 'true';
const RECLASSIFY = process.argv.includes('--reclassify');
const listArg = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--'));
if (!listArg) throw new Error('Uso: npm run references:curate -- <lista.txt> [--apply]');

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googleKey = process.env.GOOGLE_AI_API_KEY;
if (!supabaseUrl || !serviceRoleKey || !googleKey) throw new Error('Faltan credenciales de Supabase o GOOGLE_AI_API_KEY.');

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cacheDir = resolve('scripts/_curation_cache');
const thumbsDir = join(cacheDir, 'thumbs');
const assetCachePath = join(cacheDir, 'assets.json');
const analysisCachePath = join(cacheDir, 'analysis.json');
const duplicateCachePath = join(cacheDir, 'duplicates.json');
const reportPath = join(cacheDir, 'report.json');
await mkdir(thumbsDir, { recursive: true });

const ANGLES = {
	producto: { label: 'Producto / presentación', templateId: 40 },
	competencia: { label: 'Nosotros vs Ellos', templateId: 23 },
	resenas: { label: 'Testimonios', templateId: 7 },
	precio: { label: 'Promociones y descuentos', templateId: 13 },
	'razones-porque': { label: 'Razones por qué', templateId: 30 },
	caracteristicas: { label: 'Características y beneficios', templateId: 41 },
	'antes-despues': { label: 'Antes y después', templateId: 6 },
	noticias: { label: 'Noticias', templateId: 10 },
	estadisticas: { label: 'Datos y estadísticas', templateId: 31 },
	estacional: { label: 'Vacaciones / Estacional', templateId: 19 },
};

async function loadJson(path, fallback = {}) {
	try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

async function mapConcurrent(items, concurrency, mapper) {
	const output = new Array(items.length);
	let cursor = 0;
	async function worker() {
		while (cursor < items.length) {
			const index = cursor++;
			output[index] = await mapper(items[index], index);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
	return output;
}

function sourceKey(source) {
	return source.kind === 'remote' ? `remote:${source.item.imagePath}` : `local:${source.path}`;
}

function publicUrl(imagePath) {
	return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${imagePath}`;
}

function popcount32(value) {
	value -= (value >>> 1) & 0x55555555;
	value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
	return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function hamming(left, right) {
	return popcount32((left[0] ^ right[0]) >>> 0) + popcount32((left[1] ^ right[1]) >>> 0);
}

async function perceptualHash(buffer, fit) {
	const { data } = await sharp(buffer, { failOn: 'none' }).resize(32, 32, { fit, background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
	const coefficients = [];
	for (let v = 0; v < 8; v += 1) {
		for (let u = 0; u < 8; u += 1) {
			let sum = 0;
			for (let y = 0; y < 32; y += 1) {
				for (let x = 0; x < 32; x += 1) sum += data[y * 32 + x] * Math.cos(((2 * x + 1) * u * Math.PI) / 64) * Math.cos(((2 * y + 1) * v * Math.PI) / 64);
			}
			coefficients.push(sum);
		}
	}
	const median = [...coefficients.slice(1)].sort((a, b) => a - b)[31];
	let hi = 0;
	let lo = 0;
	coefficients.forEach((value, index) => {
		if (value <= median) return;
		if (index < 32) hi = (hi | (1 << index)) >>> 0;
		else lo = (lo | (1 << (index - 32))) >>> 0;
	});
	return [hi, lo];
}

async function prepareAsset(source, assetCache) {
	const key = sourceKey(source);
	const cached = assetCache[key];
	if (cached) {
		if (cached.invalid) return cached;
		try { await readFile(cached.thumbPath); return cached; } catch {}
	}
	const buffer = source.kind === 'remote'
		? Buffer.from(await fetch(publicUrl(source.item.imagePath)).then(async (response) => {
			if (!response.ok) throw new Error(`${source.item.imagePath}: HTTP ${response.status}`);
			return response.arrayBuffer();
		}))
		: await readFile(source.path);
	const contentHash = createHash('sha256').update(buffer).digest('hex');
	if (!buffer.byteLength) {
		const invalid = { key, contentHash, invalid: true, invalidReason: 'Archivo vacío', width: 0, height: 0, bytes: 0 };
		assetCache[key] = invalid;
		return invalid;
	}
	let metadata;
	try {
		metadata = await sharp(buffer, { failOn: 'none' }).metadata();
	} catch (error) {
		const invalid = { key, contentHash, invalid: true, invalidReason: String(error.message || error), width: 0, height: 0, bytes: buffer.byteLength };
		assetCache[key] = invalid;
		return invalid;
	}
	const thumbPath = join(thumbsDir, `${contentHash}.jpg`);
	await sharp(buffer, { failOn: 'none' }).rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(thumbPath);
	const result = {
		key,
		contentHash,
		thumbPath,
		width: metadata.width || 0,
		height: metadata.height || 0,
		format: metadata.format || '',
		bytes: buffer.byteLength,
		phashCover: await perceptualHash(buffer, 'cover'),
		phashContain: await perceptualHash(buffer, 'contain'),
	};
	assetCache[key] = result;
	return result;
}

function parseJson(text) {
	const clean = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
	return JSON.parse(clean);
}

async function gemini(parts, { retries = 5, responseSchema } = {}) {
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${googleKey}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.1, maxOutputTokens: 4096 } }),
		});
		if (response.ok) {
			const payload = await response.json();
			const text = payload.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
			if (text.trim() === '{}') console.log(`Respuesta vacía de Gemini: ${JSON.stringify(payload).slice(0, 1000)}`);
			try {
				return parseJson(text);
			} catch (error) {
				if (attempt === retries) throw new Error(`Gemini devolvió JSON inválido: ${error.message}`);
				await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(10_000, 500 * 2 ** attempt)));
				continue;
			}
		}
		if (![429, 500, 503].includes(response.status) || attempt === retries) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
		await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(20_000, 1000 * 2 ** attempt)));
	}
}

const classificationPrompt = `Actuás como director creativo senior. Clasificá cada anuncio visual y evaluá si merece estar en una biblioteca de referencias de alto nivel.
Respondé SOLO un array JSON, un objeto por ID: {"id":"...","angle":"...","quality":1-10,"brand":"...","headline":"...","concept":"...","issues":"..."}.

Los únicos angle válidos son: ${Object.keys(ANGLES).join(', ')}.
Definiciones y prioridad cuando haya mezcla. No fuerces un ángulo: si no hay un gancho dominante, usá producto.
1. estacional: Navidad, vacaciones, Black Friday, estaciones o fecha cultural explícita.
2. antes-despues: transformación visual explícita antes/después.
3. competencia: comparación, versus, alternativa, con/sin o tabla comparativa; no confundir con transformación.
4. resenas: testimonio, cita, review, estrellas o historia de cliente.
5. estadisticas: dato, porcentaje, cifra, estudio o gráfico como gancho dominante.
6. noticias: estética editorial/noticia/prensa, anuncio de lanzamiento o novedad.
7. precio: precio, descuento, cupón, promo, bundle, regalo o envío como oferta dominante.
8. razones-porque: lista de razones, explicación, problema-solución, mito, pregunta educativa o por qué elegirlo.
9. caracteristicas: lista o explicación dominante de funciones, ingredientes o beneficios concretos.
10. producto: presentación clara del producto/servicio, hero o lifestyle sin oferta, comparación, testimonio, transformación, dato, noticia, temporada ni lista de beneficios dominante. Es el ángulo neutral para piezas simples de producto.

Quality: 1-3 rota/ilegible/amateur; 4-5 mediocre o mal recortada; 6-7 profesional y usable; 8-10 excelente. Penalizá texto cortado, baja resolución, marcas de agua, capturas incompletas y composición pobre. brand, headline y concept deben ser breves y servir para detectar si otra imagen es la misma pieza en otro formato.`;

const classificationSchema = {
	type: 'ARRAY',
	items: {
		type: 'OBJECT',
		required: ['id', 'angle', 'quality', 'brand', 'headline', 'concept', 'issues'],
		properties: {
			id: { type: 'STRING' },
			angle: { type: 'STRING', enum: Object.keys(ANGLES) },
			quality: { type: 'INTEGER', minimum: 1, maximum: 10 },
			brand: { type: 'STRING' },
			headline: { type: 'STRING' },
			concept: { type: 'STRING' },
			issues: { type: 'STRING' },
		},
	},
};

async function classifyBatch(batch) {
	const parts = [{ text: classificationPrompt }];
	for (const entry of batch) {
		parts.push({ text: `ID: ${entry.asset.contentHash.slice(0, 16)}` });
		parts.push({ inlineData: { mimeType: 'image/jpeg', data: (await readFile(entry.asset.thumbPath)).toString('base64') } });
	}
	const result = await gemini(parts, { responseSchema: classificationSchema });
	const rows = Array.isArray(result) ? result : Object.values(result || {}).find((value) => Array.isArray(value));
	if (!Array.isArray(rows)) {
		if (batch.length > 1) {
			const middle = Math.ceil(batch.length / 2);
			return [...await classifyBatch(batch.slice(0, middle)), ...await classifyBatch(batch.slice(middle))];
		}
		const entry = batch[0];
		const previousAngle = entry.source.kind === 'remote' && ANGLES[entry.source.item.categoryLeaf] ? entry.source.item.categoryLeaf : 'producto';
		return [{
			id: entry.asset.contentHash.slice(0, 16),
			angle: previousAngle,
			quality: 1,
			brand: '',
			headline: '',
			concept: '',
			issues: 'La imagen fue rechazada por el analizador visual y se retira por seguridad y calidad.',
		}];
	}
	return rows;
}

function normalizeText(value) {
	return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenSimilarity(left, right) {
	const a = left instanceof Set ? left : new Set(normalizeText(left).split(' ').filter((token) => token.length > 2));
	const b = right instanceof Set ? right : new Set(normalizeText(right).split(' ').filter((token) => token.length > 2));
	if (!a.size || !b.size) return 0;
	const intersection = [...a].filter((token) => b.has(token)).length;
	return intersection / Math.max(a.size, b.size);
}

const manifestResponse = await fetch(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${MANIFEST_PATH}?curate=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
if (!manifestResponse.ok) throw new Error(`No se pudo descargar el manifiesto: ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
const passThrough = manifest.items.filter((item) => item.metadata?.mediaType === 'video' || !item.imagePath);
const remoteSources = manifest.items.filter((item) => item.imagePath && item.metadata?.mediaType !== 'video').map((item) => ({ kind: 'remote', item }));
const localPaths = (await readFile(resolve(listArg), 'utf8')).split(/\r?\n/).map((line) => line.trim().replace(/^"|"$/g, '')).filter(Boolean);
const localSources = localPaths.map((path) => ({ kind: 'local', path }));
const sources = [...remoteSources, ...localSources];
console.log(`Biblioteca: ${remoteSources.length} imágenes · Lista nueva: ${localSources.length} archivos.`);

const assetCache = await loadJson(assetCachePath);
let preparedCount = 0;
const entries = await mapConcurrent(sources, 10, async (source) => {
	const asset = await prepareAsset(source, assetCache);
	preparedCount += 1;
	if (preparedCount % 100 === 0 || preparedCount === sources.length) {
		console.log(`Preparadas: ${preparedCount}/${sources.length}`);
		await writeFile(assetCachePath, JSON.stringify(assetCache));
	}
	return { source, asset };
});
await writeFile(assetCachePath, JSON.stringify(assetCache));

const brokenEntries = entries.filter((entry) => entry.asset.invalid);
const validEntries = entries.filter((entry) => !entry.asset.invalid);
const exactGroups = Map.groupBy(validEntries, (entry) => entry.asset.contentHash);
const exactRemoved = [];
const uniqueEntries = [];
for (const group of exactGroups.values()) {
	group.sort((a, b) => Number(b.source.kind === 'remote') - Number(a.source.kind === 'remote') || (b.asset.width * b.asset.height) - (a.asset.width * a.asset.height));
	uniqueEntries.push(group[0]);
	exactRemoved.push(...group.slice(1));
}
console.log(`Rotas o vacías: ${brokenEntries.length} · Exactas: ${validEntries.length - uniqueEntries.length} copias descartadas · ${uniqueEntries.length} imágenes únicas para analizar.`);

const analysisCache = await loadJson(analysisCachePath);
// El manifiesto actual ya contiene una curación visual aprobada. Reutilizamos
// esos metadatos en el flujo normal para no volver a ejecutar el análisis.
// `--reclassify` saltea este cacheo y fuerza una nueva lectura visual de toda
// la biblioteca cuando cambia la taxonomía.
if (!RECLASSIFY) {
	for (const entry of uniqueEntries) {
		if (entry.source.kind !== 'remote') continue;
		const item = entry.source.item;
		const metadata = item.metadata || {};
		if (!ANGLES[item.categoryLeaf] || Number(metadata.qualityScore) < QUALITY_THRESHOLD) continue;
		if (analysisCache[entry.asset.contentHash]) continue;
		analysisCache[entry.asset.contentHash] = {
			angle: item.categoryLeaf,
			quality: Math.max(QUALITY_THRESHOLD, Math.min(10, Number(metadata.qualityScore) || QUALITY_THRESHOLD)),
			brand: String(metadata.visualBrand || item.name || '').slice(0, 120),
			headline: String(metadata.visualHeadline || item.promptNotes || '').slice(0, 240),
			concept: String(metadata.visualConcept || item.promptNotes || '').slice(0, 240),
			issues: '',
			model: metadata.curationModel || 'existing-curation',
			analyzedAt: metadata.curatedAt || new Date().toISOString(),
		};
	}
}
await writeFile(analysisCachePath, JSON.stringify(analysisCache));
const pending = RECLASSIFY ? uniqueEntries : uniqueEntries.filter((entry) => !analysisCache[entry.asset.contentHash]);
const batches = [];
for (let index = 0; index < pending.length; index += 6) batches.push(pending.slice(index, index + 6));
let analyzed = 0;
await mapConcurrent(batches, 10, async (batch) => {
	let results = await classifyBatch(batch);
	const returnedIds = results.map((result) => String(result.id));
	for (const entry of batch.filter((candidate) => !returnedIds.some((id) => candidate.asset.contentHash.startsWith(id)))) {
		results = [...results, ...await classifyBatch([entry])];
	}
	for (const result of results) {
		const fullHash = batch.find((entry) => entry.asset.contentHash.startsWith(String(result.id)))?.asset.contentHash;
		if (!fullHash || !ANGLES[result.angle]) continue;
		analysisCache[fullHash] = {
			angle: result.angle,
			quality: Math.max(1, Math.min(10, Number(result.quality) || 1)),
			brand: String(result.brand || '').slice(0, 120),
			headline: String(result.headline || '').slice(0, 240),
			concept: String(result.concept || '').slice(0, 240),
			issues: String(result.issues || '').slice(0, 300),
			model: MODEL,
			analyzedAt: new Date().toISOString(),
		};
	}
	for (const entry of batch) {
		if (!analysisCache[entry.asset.contentHash]) analysisCache[entry.asset.contentHash] = {
			angle: entry.source.kind === 'remote' && ANGLES[entry.source.item.categoryLeaf] ? entry.source.item.categoryLeaf : 'producto',
			quality: 1,
			brand: '', headline: '', concept: '',
			issues: 'El analizador visual no devolvió una clasificación válida; se retira por control de calidad.',
			model: MODEL,
			analyzedAt: new Date().toISOString(),
		};
	}
	analyzed += batch.length;
	if (analyzed % 60 === 0 || analyzed === pending.length) {
		console.log(`IA: ${analyzed}/${pending.length}`);
		await writeFile(analysisCachePath, JSON.stringify(analysisCache));
	}
});
await writeFile(analysisCachePath, JSON.stringify(analysisCache));

const qualityRemoved = uniqueEntries.filter((entry) => analysisCache[entry.asset.contentHash].quality < QUALITY_THRESHOLD);
const eligible = uniqueEntries.filter((entry) => analysisCache[entry.asset.contentHash].quality >= QUALITY_THRESHOLD);
const similarityMetadata = eligible.map((entry) => {
	const analysis = analysisCache[entry.asset.contentHash];
	return {
		brand: normalizeText(analysis.brand),
		headline: new Set(normalizeText(analysis.headline).split(' ').filter((token) => token.length > 2)),
		concept: new Set(normalizeText(analysis.concept).split(' ').filter((token) => token.length > 2)),
	};
});
const parent = eligible.map((_, index) => index);
const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
const unite = (left, right) => { const a = find(left); const b = find(right); if (a !== b) parent[b] = a; };
let candidatePairs = 0;
for (let left = 0; left < eligible.length; left += 1) {
	const a = eligible[left];
	const aa = similarityMetadata[left];
	for (let right = left + 1; right < eligible.length; right += 1) {
		const b = eligible[right];
		const bb = similarityMetadata[right];
		const distance = Math.min(hamming(a.asset.phashCover, b.asset.phashCover), hamming(a.asset.phashContain, b.asset.phashContain));
		if (distance <= 5) {
			unite(left, right);
			candidatePairs += 1;
			continue;
		}
		const sameBrand = aa.brand.length > 2 && aa.brand === bb.brand;
		if (!sameBrand) continue;
		const headlineMatch = tokenSimilarity(aa.headline, bb.headline);
		const conceptMatch = headlineMatch >= 0.5 ? tokenSimilarity(aa.concept, bb.concept) : 0;
		if (distance <= 10 || headlineMatch >= 0.72 || (headlineMatch >= 0.5 && conceptMatch >= 0.7)) {
			unite(left, right);
			candidatePairs += 1;
		}
	}
}

const components = [...Map.groupBy(eligible.map((entry, index) => ({ entry, index })), ({ index }) => find(index)).values()].filter((group) => group.length > 1);
const duplicateCache = await loadJson(duplicateCachePath);
const nearRemovedHashes = new Set();
let reviewedComponents = 0;
for (const component of components) {
	const sorted = component.map(({ entry }) => entry).sort((a, b) => a.asset.contentHash.localeCompare(b.asset.contentHash));
	for (let offset = 0; offset < sorted.length; offset += 8) {
		const chunk = sorted.slice(offset, offset + 8);
		const cacheKey = createHash('sha256').update(chunk.map((entry) => entry.asset.contentHash).join('|')).digest('hex');
		let review = duplicateCache[cacheKey];
		if (!review) {
			const parts = [{ text: `Compará estas piezas. Agrupá únicamente las que sean la MISMA creatividad o una adaptación casi idéntica donde solo cambia formato, tamaño, recorte, color menor o posición. No agrupes anuncios diferentes por compartir marca o producto. Respondé JSON: {"groups":[{"ids":["id"],"keepId":"id","reason":"breve"}]}. Elegí keepId por mejor calidad, legibilidad, encuadre y resolución.` }];
			for (const entry of chunk) {
				const analysis = analysisCache[entry.asset.contentHash];
				parts.push({ text: `ID ${entry.asset.contentHash.slice(0, 16)} · calidad ${analysis.quality}/10` });
				parts.push({ inlineData: { mimeType: 'image/jpeg', data: (await readFile(entry.asset.thumbPath)).toString('base64') } });
			}
			review = await gemini(parts);
			duplicateCache[cacheKey] = review;
			await writeFile(duplicateCachePath, JSON.stringify(duplicateCache));
		}
		for (const group of Array.isArray(review.groups) ? review.groups : []) {
			if (!Array.isArray(group.ids) || group.ids.length < 2) continue;
			for (const id of group.ids) if (id !== group.keepId) {
				const entry = chunk.find((candidate) => candidate.asset.contentHash.startsWith(String(id)));
				if (entry) nearRemovedHashes.add(entry.asset.contentHash);
			}
		}
	}
	reviewedComponents += 1;
	if (reviewedComponents % 20 === 0) console.log(`Duplicados visuales revisados: ${reviewedComponents}/${components.length}`);
}

const kept = eligible.filter((entry) => !nearRemovedHashes.has(entry.asset.contentHash));
const report = {
	createdAt: new Date().toISOString(),
	model: MODEL,
	input: { remote: remoteSources.length, local: localSources.length },
	brokenRemoved: brokenEntries.length,
	exactDuplicatesRemoved: exactRemoved.length,
	qualityRemoved: qualityRemoved.length,
	nearDuplicatesRemoved: nearRemovedHashes.size,
	nearDuplicateComponents: components.length,
	candidatePairs,
	kept: kept.length,
	keptRemote: kept.filter((entry) => entry.source.kind === 'remote').length,
	keptNew: kept.filter((entry) => entry.source.kind === 'local').length,
	angles: Object.fromEntries(Object.keys(ANGLES).map((angle) => [angle, kept.filter((entry) => analysisCache[entry.asset.contentHash].angle === angle).length])),
	removedLowQuality: qualityRemoved.map((entry) => ({ source: sourceKey(entry.source), ...analysisCache[entry.asset.contentHash] })),
	removedBroken: brokenEntries.map((entry) => ({ source: sourceKey(entry.source), reason: entry.asset.invalidReason })),
	removedExactDuplicates: exactRemoved.map((entry) => ({ source: sourceKey(entry.source), contentHash: entry.asset.contentHash })),
	removedNearDuplicates: [...nearRemovedHashes],
};
await writeFile(reportPath, JSON.stringify(report, null, 2));
const reportSummary = Object.fromEntries(
	Object.entries(report).filter(([key]) => !key.startsWith('removed')),
);
console.log(JSON.stringify(reportSummary, null, 2));
if (!APPLY) {
	console.log(`Informe guardado en ${reportPath}. Ejecutá con --apply para aplicar.`);
	process.exit(0);
}

const originalManifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `manifests/backups/starter-static-50-before-${BATCH}-${timestamp}.json`;
const { error: backupError } = await admin.storage.from(BUCKET).upload(backupPath, originalManifestBytes, { contentType: 'application/json', upsert: false });
if (backupError) throw backupError;

const importedAt = new Date().toISOString();
const currentMaxSort = manifest.items.reduce((max, item) => Math.max(max, Number(item.sortOrder) || 0), 0);
let newSortOffset = 0;
const nextItems = [];
const newRows = [];
for (const entry of kept) {
	const analysis = analysisCache[entry.asset.contentHash];
	const angle = ANGLES[analysis.angle];
	const cleanMetadata = { ...(entry.source.kind === 'remote' ? entry.source.item.metadata : {}) };
	delete cleanMetadata.foreplayNiches;
	Object.assign(cleanMetadata, {
		curationBatch: BATCH,
		curationModel: MODEL,
		qualityScore: analysis.quality,
		visualBrand: analysis.brand,
		visualHeadline: analysis.headline,
		visualConcept: analysis.concept,
		curatedAt: importedAt,
	});
	if (entry.source.kind === 'remote') {
		nextItems.push({ ...entry.source.item, categoryGroup: 'Ángulos publicitarios', categoryBranch: angle.label, categoryLeaf: analysis.angle, category: analysis.angle, metadata: cleanMetadata });
		continue;
	}
	const extension = extname(entry.source.path).toLowerCase() === '.png' ? 'png' : 'jpg';
	const storagePath = `${angle.templateId}/${entry.asset.contentHash.slice(0, 16)}.${extension}`;
	const bytes = await readFile(entry.source.path);
	const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: extension === 'png' ? 'image/png' : 'image/jpeg', cacheControl: '31536000', upsert: true });
	if (uploadError) throw uploadError;
	const item = {
		templateId: angle.templateId,
		name: analysis.brand || basename(entry.source.path, extname(entry.source.path)),
		imagePath: storagePath,
		promptNotes: [analysis.headline, analysis.concept].filter(Boolean).join(' · '),
		sortOrder: currentMaxSort + (++newSortOffset),
		rightsStatus: 'owned',
		categoryGroup: 'Ángulos publicitarios',
		categoryBranch: angle.label,
		categoryLeaf: analysis.angle,
		category: analysis.angle,
		metadata: { ...cleanMetadata, batch: BATCH, mediaType: 'static_image', originalFileName: basename(entry.source.path) },
	};
	nextItems.push(item);
	newRows.push({
		template_id: item.templateId, name: item.name.slice(0, 180), image_path: item.imagePath, prompt_notes: item.promptNotes || null,
		sort_order: item.sortOrder, is_active: true, source_platform: 'user_upload', rights_status: 'owned',
		license_notes: 'Referencia aportada por el usuario y aprobada en la curación visual.', category_group: item.categoryGroup,
		category_branch: item.categoryBranch, category_leaf: item.categoryLeaf, metadata: item.metadata, updated_at: importedAt,
	});
}

const finalItems = [...passThrough, ...nextItems];
	const keptPaths = new Set(finalItems.map((item) => item.imagePath).filter(Boolean));
const removedPaths = [...new Set(remoteSources.map(({ item }) => item.imagePath).filter((path) => !keptPaths.has(path)))];
for (let index = 0; index < removedPaths.length; index += 200) {
	const { error } = await admin.from('creative_references').delete().in('image_path', removedPaths.slice(index, index + 200));
	if (error) throw error;
}

const remoteKept = nextItems.filter((item) => remoteSources.some(({ item: original }) => original.imagePath === item.imagePath));
await mapConcurrent(remoteKept, 10, async (item) => {
	const { error } = await admin.from('creative_references').update({
		category_group: item.categoryGroup,
		category_branch: item.categoryBranch,
		category_leaf: item.categoryLeaf,
		metadata: item.metadata,
		updated_at: importedAt,
	}).eq('image_path', item.imagePath);
	if (error) throw error;
});
const databasePaths = new Set();
for (let from = 0; ; from += 1000) {
	const { data, error } = await admin.from('creative_references').select('image_path').range(from, from + 999);
	if (error) throw error;
	for (const row of data || []) databasePaths.add(row.image_path);
	if (!data || data.length < 1000) break;
}
const orphanDatabasePaths = [...databasePaths].filter((imagePath) => !keptPaths.has(imagePath));
for (let index = 0; index < orphanDatabasePaths.length; index += 200) {
	const { error } = await admin.from('creative_references').delete().in('image_path', orphanDatabasePaths.slice(index, index + 200));
	if (error) throw error;
}
for (const imagePath of orphanDatabasePaths) databasePaths.delete(imagePath);
const missingRows = finalItems
	.filter((item) => item.imagePath && Number(item.templateId) > 0 && !databasePaths.has(item.imagePath))
	.map((item) => ({
		template_id: item.templateId,
		name: String(item.name || 'Referencia ganadora').slice(0, 180),
		image_path: item.imagePath,
		prompt_notes: item.promptNotes || null,
		sort_order: Number(item.sortOrder) || 0,
		is_active: true,
		source_platform: item.metadata?.batch === BATCH ? 'user_upload' : 'curated_library',
		rights_status: item.rightsStatus || 'public_domain',
		license_notes: item.metadata?.batch === BATCH ? 'Referencia aportada por el usuario y aprobada en la curación visual.' : null,
		category_group: item.categoryGroup,
		category_branch: item.categoryBranch,
		category_leaf: item.categoryLeaf,
		metadata: item.metadata || {},
		updated_at: importedAt,
	}));
for (let index = 0; index < missingRows.length; index += 100) {
	const { error } = await admin.from('creative_references').insert(missingRows.slice(index, index + 100));
	if (error) throw error;
}

const nextManifest = { ...manifest, items: finalItems };
const { error: manifestError } = await admin.storage.from(BUCKET).upload(MANIFEST_PATH, Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`), { contentType: 'application/json', cacheControl: '60', upsert: true });
if (manifestError) throw manifestError;

const verifyResponse = await fetch(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${MANIFEST_PATH}?verify=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
const verified = await verifyResponse.json();
if (verified.items.length !== finalItems.length || verified.items.some((item) => item.imagePath && item.metadata?.mediaType !== 'video' && !ANGLES[item.categoryLeaf])) {
	throw new Error('La verificación del manifiesto curado no coincide con el resultado esperado.');
}
console.log(`Curación aplicada: ${finalItems.length} creativos · ${removedPaths.length} referencias retiradas · ${newRows.length} nuevas · ${missingRows.length} filas sincronizadas · ${orphanDatabasePaths.length} filas huérfanas retiradas.`);
console.log(`Respaldo: ${backupPath}`);
