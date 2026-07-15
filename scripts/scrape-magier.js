import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const supabaseUrl = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
	console.error('Error: Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
	process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
	auth: { persistSession: false, autoRefreshToken: false }
});

function classifyMagierAd(type = '', name = '') {
	const t = type.toLowerCase();
	if (t.includes('testimonial') || t.includes('trust')) {
		return { templateId: 1, group: 'confianza', branch: 'clientes', leaf: 'resenas' };
	}
	if (t.includes('comparison')) {
		return { templateId: 23, group: 'convencer', branch: 'comparar', leaf: 'competencia' };
	}
	if (t.includes('free')) {
		return { templateId: 18, group: 'vender', branch: 'promociones', leaf: 'envio' };
	}
	if (t.includes('explanation') || t.includes('statement')) {
		return { templateId: 32, group: 'educar', branch: 'descubrir', leaf: 'mitos' };
	}
	return { templateId: 40, group: 'producto', branch: 'presentar', leaf: 'hero' };
}

async function scrapeMagier() {
	let page = 1;
	let hasMore = true;
	const scrapedAds = [];
	
	console.log('=== Iniciando Raspado de Magier.com ===');
	
	while (hasMore) {
		const url = page === 1 ? 'https://www.magier.com/ad-examples' : `https://www.magier.com/ad-examples?page=${page}`;
		console.log(`\n--- Conectando a la página ${page}: ${url} ---`);
		
		try {
			const response = await fetch(url);
			if (!response.ok) {
				console.warn(`Error al conectar con la página ${page}: ${response.status}`);
				hasMore = false;
				break;
			}
			
			const html = await response.text();
			const $ = cheerio.load(html);
			
			const pageAds = [];
			$('div.ads.w-dyn-item').each((_, elem) => {
				const card = $(elem);
				const adCardAnchor = card.find('a.ads_card');
				const adDetailUrl = adCardAnchor.attr('href');
				const logoImg = card.find('img.ads_logo').attr('src');
				const brandName = card.find('div.text-weight-medium').text().trim();
				const adImg = card.find('img.ads_example_image').attr('src');
				
				// Finsweet filters might be in hidden divs
				const type = card.find('[fs-cmsfilter-field="type"]').text().trim();
				const industry = card.find('[fs-cmsfilter-field="industry"]').text().trim();
				
				if (brandName && adImg) {
					const adId = adDetailUrl ? adDetailUrl.split('/').pop() : `magier_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
					pageAds.push({
						adId,
						brandName,
						logoImg,
						adImg,
						type,
						industry
					});
				}
			});
			
			if (pageAds.length === 0) {
				console.log(`No se encontraron más anuncios en la página ${page}. Finalizando rastreo.`);
				hasMore = false;
				break;
			}
			
			console.log(`Página ${page}: se encontraron ${pageAds.length} anuncios.`);
			scrapedAds.push(...pageAds);
			
			// If we got fewer than 10 items, it's likely the last page
			if (pageAds.length < 10) {
				hasMore = false;
				break;
			}
			
			page++;
			
			if (page > 20) {
				console.warn('Límite de seguridad de 20 páginas alcanzado.');
				break;
			}
			
		} catch (err) {
			console.error(`Error raspando página ${page}:`, err.message);
			hasMore = false;
		}
	}
	
	console.log(`\nBúsqueda finalizada. Total de anuncios recolectados de Magier: ${scrapedAds.length}`);
	
	// Load existing manifest to merge and avoid overwriting GreatAds data
	const manifestPath = resolve('./public/scraped_ads/manifest.json');
	let existingManifest = { version: 1, collection: 'scraped-ads-library', items: [] };
	try {
		const raw = await readFile(manifestPath, 'utf-8');
		existingManifest = JSON.parse(raw);
		console.log(`Manifiesto existente cargado con ${existingManifest.items.length} anuncios.`);
	} catch (e) {
		console.log('No se encontró manifiesto existente, se creará uno nuevo.');
	}
	
	const existingFingerprints = new Set(existingManifest.items.map(item => item.imagePath.split('/').pop().split('.')[0]));
	
	let databaseAvailable = true;
	let importedCount = 0;
	
	const batchSize = 15;
	for (let i = 0; i < scrapedAds.length; i += batchSize) {
		const batch = scrapedAds.slice(i, i + batchSize);
		console.log(`\n--- Procesando lote ${Math.floor(i / batchSize) + 1} / ${Math.ceil(scrapedAds.length / batchSize)} ---`);
		
		await Promise.all(batch.map(async (card, batchIdx) => {
			const idx = i + batchIdx;
			try {
				// Download Ad Image
				const imgRes = await fetch(card.adImg);
				if (!imgRes.ok) {
					console.warn(`Saltando: falló la descarga de la imagen ${card.adImg}`);
					return;
				}
				const mime = imgRes.headers.get('content-type') || 'image/webp';
				const extension = mime.split('/').pop() || 'webp';
				const bytes = Buffer.from(await imgRes.arrayBuffer());
				
				// Fingerprint
				const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
				
				// Deduplicate using fingerprints
				if (existingFingerprints.has(fingerprint)) {
					console.log(`[Doble] Anuncio ${idx+1}/${scrapedAds.length} ya existe en el manifiesto.`);
					return;
				}
				
				// Classify ad
				const classification = classifyMagierAd(card.type, card.brandName);
				const storagePath = `${classification.templateId}/${fingerprint}.${extension}`;
				
				// Upload to Storage
				const { error: uploadError } = await admin.storage.from('creative-references').upload(storagePath, bytes, {
					contentType: mime,
					upsert: true
				});
				if (uploadError) throw uploadError;
				
				const row = {
					template_id: classification.templateId,
					name: card.brandName.slice(0, 180),
					image_path: storagePath,
					prompt_notes: `Social Media Ad by ${card.brandName}`,
					sort_order: 20,
					is_active: true,
					source_url: `https://www.magier.com/ad-examples`,
					source_platform: card.type || 'Social Media',
					rights_status: 'public_domain',
					license_notes: 'Scraped from Magier.com',
					category_group: classification.group,
					category_branch: classification.branch,
					category_leaf: classification.leaf,
					metadata: {
						industry: card.industry,
						scrapedAt: new Date().toISOString(),
						logoUrl: card.logoImg,
						mediaType: 'static_image'
					},
					updated_at: new Date().toISOString()
				};
				
				// Try inserting into DB if available
				if (databaseAvailable) {
					const { data: existing, error: findError } = await admin.from('creative_references')
						.select('id')
						.eq('template_id', classification.templateId)
						.eq('image_path', storagePath)
						.maybeSingle();
					
					if (findError?.code === '42P01') {
						databaseAvailable = false;
					} else if (!findError) {
						const query = existing
							? admin.from('creative_references').update(row).eq('id', existing.id)
							: admin.from('creative_references').insert(row);
						const { error: saveError } = await query;
						if (saveError && saveError.code === '42P01') {
							databaseAvailable = false;
						}
					}
				}
				
				// Push to manifest items
				existingManifest.items.push({
					templateId: classification.templateId,
					name: row.name,
					imagePath: storagePath,
					promptNotes: row.prompt_notes,
					sortOrder: row.sort_order,
					rightsStatus: row.rights_status,
					categoryGroup: row.category_group,
					categoryBranch: row.category_branch,
					categoryLeaf: row.category_leaf,
					metadata: row.metadata
				});
				
				existingFingerprints.add(fingerprint);
				importedCount++;
				console.log(`[OK] Anuncio Magier ${idx+1}/${scrapedAds.length} importado: ${card.brandName}`);
				
			} catch (err) {
				console.error(`Error procesando anuncio ${card.adId}:`, err.message);
			}
		}));
	}
	
	// Save the combined manifest locally
	try {
		await writeFile(manifestPath, JSON.stringify(existingManifest, null, 2), 'utf-8');
		console.log(`\nManifiesto combinado guardado localmente en: ${manifestPath}`);
	} catch (err) {
		console.warn('No se pudo guardar el manifiesto local:', err.message);
	}
	
	// Upload the updated manifest file to Supabase Storage
	try {
		console.log('Subiendo manifiesto starter-static-50.json a Storage...');
		const buffer = Buffer.from(JSON.stringify(existingManifest, null, 2));
		
		const { error: manifestError } = await admin.storage.from('creative-references').upload('manifests/starter-static-50.json', buffer, {
			contentType: 'application/json',
			upsert: true
		});
		if (manifestError) throw manifestError;
		console.log('Manifiesto starter-static-50.json subido con éxito al Storage.');
		
	} catch (err) {
		console.error('Error al subir el manifiesto remoto a Storage:', err.message);
	}
	
	console.log(`\n=== Proceso terminado. Se procesaron e importaron exitosamente ${importedCount} anuncios de Magier.com. Total de referencias en catálogo: ${existingManifest.items.length} ===`);
}

scrapeMagier();
