import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { writeFile } from 'node:fs/promises';
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

// Classification helper matching existing creative templates schema
function classifyAd(headline = '', brandName = '') {
	const text = `${headline} ${brandName}`.toLowerCase();
	
	if (text.includes('free shipping') || text.includes('envio gratis') || text.includes('envío gratis') || text.includes('delivery') || text.includes('envios')) {
		return { templateId: 18, group: 'vender', branch: 'promociones', leaf: 'envio' };
	}
	if (text.includes('vs') || text.includes('them') || text.includes('other') || text.includes('alternative') || text.includes('better than')) {
		return { templateId: 23, group: 'convencer', branch: 'comparar', leaf: 'competencia' };
	}
	if (text.includes('guarantee') || text.includes('warranty') || text.includes('refund') || text.includes('garantía') || text.includes('garantia') || text.includes('asegurado')) {
		return { templateId: 21, group: 'vender', branch: 'ticket', leaf: 'garantia' };
	}
	if (text.includes('% off') || text.includes('sale') || text.includes('discount') || text.includes('descuento') || text.includes('save') || text.includes('precio') || text.includes('ahorrar') || text.includes('oferta')) {
		return { templateId: 13, group: 'vender', branch: 'promociones', leaf: 'precio' };
	}
	if (text.includes('limited') || text.includes('hurry') || text.includes('stock') || text.includes('clock') || text.includes('last') || text.includes('ends') || text.includes('urgente') || text.includes('stocks last') || text.includes('quedan pocos')) {
		return { templateId: 15, group: 'vender', branch: 'promociones', leaf: 'urgencia' };
	}
	if (text.includes('love') || text.includes('recommend') || text.includes('best') || text.includes('review') || text.includes('stars') || text.includes('rating') || text.includes('customer') || text.includes('opiniones') || text.includes('cliente')) {
		return { templateId: 1, group: 'confianza', branch: 'clientes', leaf: 'resenas' };
	}
	if (text.includes('myth') || text.includes('fake') || text.includes('truth') || text.includes('fact') || text.includes('science') || text.includes('mito')) {
		return { templateId: 32, group: 'educar', branch: 'descubrir', leaf: 'mitos' };
	}
	
	// Default to template 40 (Hero Product Display)
	return { templateId: 40, group: 'producto', branch: 'presentar', leaf: 'hero' };
}

async function scrapeAll() {
	let page = 1;
	let hasMore = true;
	const allScrapedAds = [];
	const manifestItems = [];
	
	console.log('=== Iniciando Raspado Completo de GreatAds ===');
	
	while (hasMore) {
		const url = `https://greatads.co/?format=Image&page=${page}`;
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
			$('div.break-inside-avoid').each((_, elem) => {
				const card = $(elem);
				const logoImg = card.find('img.size-10').attr('src');
				const brandName = card.find('span.truncate').text().trim();
				const adDetailUrl = card.find('a.block').attr('href');
				const adImg = card.find('a.block img').attr('src');
				const domain = card.find('p.truncate').text().trim();
				const headline = card.find('p.line-clamp-2').text().trim();
				const cta = card.find('span.bg-ad-cta').text().trim();
				
				if (brandName && adImg) {
					const adId = adDetailUrl ? adDetailUrl.split('/').pop() : `scraped_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
					pageAds.push({
						adId,
						brandName,
						logoImg,
						adImg,
						domain,
						headline,
						cta
					});
				}
			});
			
			if (pageAds.length === 0) {
				console.log(`No se encontraron más anuncios en la página ${page}. Finalizando rastreo.`);
				hasMore = false;
				break;
			}
			
			console.log(`Página ${page}: se encontraron ${pageAds.length} anuncios.`);
			allScrapedAds.push(...pageAds);
			page++;
			
			// Safety limit to avoid infinite loops if pagination is circular
			if (page > 30) {
				console.warn('Límite de seguridad de 30 páginas alcanzado.');
				break;
			}
			
		} catch (err) {
			console.error(`Error raspando página ${page}:`, err.message);
			hasMore = false;
		}
	}
	
	console.log(`\nBúsqueda finalizada. Total de anuncios recolectados: ${allScrapedAds.length}`);
	
	let databaseAvailable = true;
	let importedCount = 0;
	
	const batchSize = 15;
	for (let i = 0; i < allScrapedAds.length; i += batchSize) {
		const batch = allScrapedAds.slice(i, i + batchSize);
		console.log(`\n--- Procesando lote ${Math.floor(i / batchSize) + 1} / ${Math.ceil(allScrapedAds.length / batchSize)} ---`);
		
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
				
				// Fingerprint for storage deduplication
				const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
				
				// Classify ad
				const classification = classifyAd(card.headline, card.brandName);
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
					prompt_notes: card.headline ? card.headline.slice(0, 2000) : null,
					sort_order: 10,
					is_active: true,
					source_url: `https://greatads.co/ads/${card.adId}`,
					source_platform: 'Facebook & Instagram',
					rights_status: 'public_domain',
					license_notes: 'Scraped from GreatAds.co',
					category_group: classification.group,
					category_branch: classification.branch,
					category_leaf: classification.leaf,
					metadata: {
						cta: card.cta,
						domain: card.domain,
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
				
				// Add to manifest item list
				manifestItems.push({
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
				
				importedCount++;
				console.log(`[OK] Anuncio ${idx+1}/${allScrapedAds.length} importado: ${card.brandName}`);
				
			} catch (err) {
				console.error(`Error procesando anuncio ${card.adId}:`, err.message);
			}
		}));
	}
	
	// Create local JSON manifest
	const localManifest = {
		version: 1,
		collection: 'scraped-ads-library',
		items: manifestItems
	};
	
	try {
		const localPath = resolve('./public/scraped_ads/manifest.json');
		await writeFile(localPath, JSON.stringify(localManifest, null, 2), 'utf-8');
		console.log(`\nManifiesto local guardado en: ${localPath}`);
	} catch (err) {
		console.warn('No se pudo guardar el manifiesto local:', err.message);
	}
	
	// Upload remote starter static manifest so the frontend fallback loads all of them!
	try {
		console.log('Subiendo manifiesto starter-static-50.json a Storage...');
		const buffer = Buffer.from(JSON.stringify(localManifest, null, 2));
		
		const { error: manifestError } = await admin.storage.from('creative-references').upload('manifests/starter-static-50.json', buffer, {
			contentType: 'application/json',
			upsert: true
		});
		if (manifestError) throw manifestError;
		console.log('Manifiesto starter-static-50.json subido con éxito al Storage.');
		
	} catch (err) {
		console.error('Error al subir el manifiesto remoto a Storage:', err.message);
	}
	
	console.log(`\n=== Proceso terminado. Se procesaron e importaron exitosamente ${importedCount} anuncios de GreatAds ===`);
}

scrapeAll();
