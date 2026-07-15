import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

// Load credentials
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

async function scrapePage(page = 3) {
	const url = `https://greatads.co/?format=Image&page=${page}`;
	console.log(`\n--- Raspando: ${url} ---`);
	
	try {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP error status: ${response.status}`);
		
		const html = await response.text();
		const $ = cheerio.load(html);
		
		// Selector corresponding to the masonry grid columns
		const adCards = [];
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
				adCards.push({
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
		
		console.log(`Se encontraron ${adCards.length} anuncios listos para procesar.`);
		
		let processed = 0;
		for (const card of adCards) {
			console.log(`\n[${processed+1}/${adCards.length}] Procesando anuncio ID: ${card.adId} (${card.brandName})...`);
			
			try {
				// 1. Download Ad Image
				const imgRes = await fetch(card.adImg);
				if (!imgRes.ok) {
					console.warn(`Saltando: no se pudo descargar la imagen ${card.adImg}`);
					continue;
				}
				const mime = imgRes.headers.get('content-type') || 'image/webp';
				const extension = mime.split('/').pop() || 'webp';
				const bytes = Buffer.from(await imgRes.arrayBuffer());
				
				// Calculate Fingerprint
				const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
				
				// 2. Classify Ad
				const classification = classifyAd(card.headline, card.brandName);
				
				// Path structure matching templateId / fingerprint
				const storagePath = `${classification.templateId}/${fingerprint}.${extension}`;
				
				// 3. Upload to Supabase Storage bucket 'creative-references'
				console.log(`Subiendo imagen a Storage: ${storagePath}...`);
				const { error: uploadError } = await admin.storage.from('creative-references').upload(storagePath, bytes, {
					contentType: mime,
					upsert: true
				});
				if (uploadError) throw uploadError;
				
				// 4. Save metadata to creative_references table
				const row = {
					template_id: classification.templateId,
					name: card.brandName.slice(0, 180),
					image_path: storagePath,
					prompt_notes: card.headline ? card.headline.slice(0, 2000) : null,
					sort_order: 10,
					is_active: true,
					source_url: `https://greatads.co/ads/${card.adId}`,
					source_platform: 'Facebook & Instagram',
					rights_status: 'public_domain', // Publicly scraped for inspiration
					license_notes: 'Scraped from GreatAds.co',
					category_group: classification.group,
					category_branch: classification.branch,
					category_leaf: classification.leaf,
					metadata: {
						cta: card.cta,
						domain: card.domain,
						scrapedAt: new Date().toISOString(),
						logoUrl: card.logoImg
					},
					updated_at: new Date().toISOString()
				};
				
				// Check if already exists in table
				const { data: existing } = await admin.from('creative_references')
					.select('id')
					.eq('template_id', classification.templateId)
					.eq('image_path', storagePath)
					.maybeSingle();
				
				if (existing) {
					console.log(`Registro existente. Actualizando metadata en DB...`);
					const { error: updateError } = await admin.from('creative_references')
						.update(row)
						.eq('id', existing.id);
					if (updateError) throw updateError;
				} else {
					console.log(`Insertando nuevo registro en DB...`);
					const { error: insertError } = await admin.from('creative_references')
						.insert(row);
					if (insertError) throw insertError;
				}
				
				processed++;
			} catch (err) {
				console.error(`Error procesando anuncio ${card.adId}:`, err.message);
			}
		}
		
		console.log(`\n¡Página ${page} completada con éxito! Se importaron ${processed} anuncios.`);
		
	} catch (err) {
		console.error('Fallo en el raspador:', err.message);
	}
}

const pageArg = process.argv[2] ? parseInt(process.argv[2], 10) : 3;
scrapePage(pageArg);
