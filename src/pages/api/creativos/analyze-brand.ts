import type { APIRoute } from 'astro';
import { analyzeBrandStyle, persistBrandStyle } from '../../../lib/creattia/brand-style';
import { analyzeCatalogWithAI, scanInstagram, scanWebsite, type ScannedProduct, type ScannedSource } from '../../../lib/creattia/catalog-scanner';
import { mirrorProductImages } from '../../../lib/creattia/product-assets';
import { normalizeExternalUrl } from '../../../lib/creattia/safe-fetch';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 120;

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const body = await request.json().catch(() => ({}));
		const website = body.website ? normalizeExternalUrl(String(body.website).slice(0, 500)) : '';
		const instagram = body.instagram ? normalizeExternalUrl(String(body.instagram).slice(0, 300), 'instagram') : '';
		if (!website && !instagram) return json({ error: 'Agregá la web o el Instagram de la marca.' }, 400);

		const { error: profileStartError } = await admin.from('creative_profiles').upsert({
			user_id: auth.user.id,
			website_url: website || null, instagram_handle: instagram || null, catalog_status: 'scanning', catalog_error: null, updated_at: new Date().toISOString(),
		}, { onConflict: 'user_id' });
		if (profileStartError) throw profileStartError;

		const requested = [
			...(website ? [{ type: 'website' as const, url: website, scan: () => scanWebsite(website) }] : []),
			...(instagram ? [{ type: 'instagram' as const, url: instagram, scan: () => scanInstagram(instagram) }] : []),
		];
		const sourceWrites = await Promise.all(requested.map((source) => admin.from('creative_brand_sources').upsert({
			user_id: auth.user!.id, source_type: source.type, source_url: source.url, status: 'scanning', error_message: null, updated_at: new Date().toISOString(),
		}, { onConflict: 'user_id,source_type' })));
		const sourceWriteError = sourceWrites.find((result) => result.error)?.error;
		if (sourceWriteError) throw sourceWriteError;

		const settled = await Promise.allSettled(requested.map((source) => source.scan()));
		const sources: ScannedSource[] = [];
		const errors: string[] = [];
		for (let index = 0; index < settled.length; index += 1) {
			const outcome = settled[index];
			const source = requested[index];
			if (outcome.status === 'fulfilled') {
				sources.push(outcome.value);
				const { error: sourceUpdateError } = await admin.from('creative_brand_sources').update({
					status: source.type === 'instagram' && !outcome.value.description ? 'partial' : 'ready', title: outcome.value.title || null,
					summary: outcome.value.description || null, metadata: { ...outcome.value.metadata, imageUrl: outcome.value.imageUrl, colors: outcome.value.colors },
					error_message: null, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
				}).eq('user_id', auth.user.id).eq('source_type', source.type);
				if (sourceUpdateError) throw sourceUpdateError;
			} else {
				const message = outcome.reason instanceof Error ? outcome.reason.message : 'No se pudo leer la fuente.';
				errors.push(`${source.type}: ${message}`);
				const { error: sourceUpdateError } = await admin.from('creative_brand_sources').update({ status: 'failed', error_message: message.slice(0, 500), updated_at: new Date().toISOString() })
					.eq('user_id', auth.user.id).eq('source_type', source.type);
				if (sourceUpdateError) throw sourceUpdateError;
			}
		}

		if (!sources.length) {
			await admin.from('creative_profiles').update({ catalog_status: 'failed', catalog_error: errors.join(' · ').slice(0, 1000), updated_at: new Date().toISOString() }).eq('user_id', auth.user.id);
			return json({ error: 'No pudimos leer las fuentes. Revisá que las URLs sean públicas.', details: errors }, 422);
		}

		const products: ScannedProduct[] = [];
		const seen = new Set<string>();
		for (const product of sources.flatMap((source) => source.products)) {
			if (seen.has(product.externalId)) continue;
			seen.add(product.externalId); products.push(product);
		}
		const [analysis, brandStyle] = await Promise.all([
			analyzeCatalogWithAI({ sources, products, apiKey: import.meta.env.OPENAI_API_KEY, endUserId: auth.user.id }),
			website
				? analyzeBrandStyle(website, import.meta.env.OPENAI_API_KEY).catch((styleErr) => {
					console.error('Brand style analysis failed (non-fatal):', styleErr);
					return null;
				})
				: Promise.resolve(null),
		]);
		if (brandStyle) await persistBrandStyle(admin, auth.user.id, brandStyle);
		const insightMap = new Map((analysis.productInsights || []).map((item: any) => [String(item.externalId), item]));

		let storedProducts: any[] = [];
		let photosSaved = 0;
		if (products.length) {
			const rows = products.slice(0, 60).map((product) => {
				const insight: any = insightMap.get(product.externalId);
				return {
					user_id: auth.user!.id, name: product.name, description: insight?.description || product.description || null,
					price_text: product.priceText || null, currency: product.currency || null, source: 'website', external_id: product.externalId,
					product_url: product.productUrl || null, source_image_url: product.imageUrl || null, metadata: { ...product.metadata, sourceImageUrls: product.imageUrls },
					analysis: insight ? { category: insight.category, keywords: insight.keywords } : {}, is_active: true,
					updated_at: new Date().toISOString(), synced_at: new Date().toISOString(),
				};
			});
			const { data, error } = await admin.from('creative_products').upsert(rows, { onConflict: 'user_id,source,external_id' })
				.select('id,name,image_path,source_image_url,external_id');
			if (error) throw error;
			storedProducts = data || [];
			const scannedByExternalId = new Map(products.map((product) => [product.externalId, product]));
			for (let index = 0; index < storedProducts.length; index += 4) {
				const paths = await Promise.all(storedProducts.slice(index, index + 4).map((product) => {
					const scanned = scannedByExternalId.get(product.external_id);
					return mirrorProductImages(auth.user!.id, product, scanned?.imageUrls?.length ? scanned.imageUrls : [product.source_image_url || '']);
				}));
				photosSaved += paths.reduce((total, list) => total + list.length, 0);
			}
		}

		const status = products.length ? (errors.length ? 'partial' : 'ready') : 'partial';
		const { data: currentProfile, error: profileReadError } = await admin.from('creative_profiles').select('brand_name').eq('user_id', auth.user.id).maybeSingle();
		if (profileReadError) throw profileReadError;
		const { error: profileUpdateError } = await admin.from('creative_profiles').update({
			brand_name: currentProfile?.brand_name || sources[0]?.title || null,
			brand_summary: String(analysis.brandSummary || '').slice(0, 3000) || null,
			brand_voice: String(analysis.brandVoice || '').slice(0, 1000) || null,
			target_audience: String(analysis.targetAudience || '').slice(0, 1500) || null,
			catalog_status: status, catalog_error: errors.join(' · ').slice(0, 1000) || null,
			catalog_last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
		}).eq('user_id', auth.user.id);
		if (profileUpdateError) throw profileUpdateError;

		return json({
			status, analysisMode: analysis.mode, sources: sources.map((source) => ({ url: source.url, title: source.title })),
			productsFound: products.length, photosSaved,
			brandSummary: analysis.brandSummary, warnings: errors,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'No se pudo analizar la marca.';
		await admin.from('creative_profiles').update({ catalog_status: 'failed', catalog_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq('user_id', auth.user.id);
		return json({ error: message }, 500);
	}
};
