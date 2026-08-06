import type { APIRoute } from 'astro';
import {
	analyzeReferenceLayout,
	buildReferenceClonePrompt,
	normalizeImageInput,
	LANGUAGE_NAMES,
	type LayoutAnalysis,
} from '../../../lib/creattia/ad-analysis';
import { generateAdImage, type EngineImage } from '../../../lib/creattia/image-engines';
import { pickQualityTier } from '../../../lib/creattia/quality-router';
import { authenticateRequest, closeGenerationsAndCountRefunds, getAdminClient, json } from '../../../lib/creattia/server';
import { readLimited, safeExternalFetch } from '../../../lib/creattia/safe-fetch';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { stripWebReferences } from '../../../lib/creattia/ad-copy';
import { listProductImageRows } from '../../../lib/creattia/product-media';
import { resolveAvatarReferences } from '../../../lib/creattia/avatar-assets';
import { closestFormat } from '../../../lib/creattia/formats';

export const prerender = false;
export const maxDuration = 300;

const ASSETS = 'creative-assets';
const REFERENCES = 'creative-references';


/**
 * Genera UN anuncio del lote clonando un ganador real de la biblioteca con el
 * producto del usuario — el mismo motor que usa el Studio, no un prompt de
 * texto genérico.
 *
 * Cada anuncio es una invocación HTTP corta e independiente: así ninguna
 * generación depende de que una única función serverless siga viva 10 minutos.
 */
export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const googleKey = process.env.GOOGLE_AI_API_KEY || import.meta.env.GOOGLE_AI_API_KEY || '';
	const openAIKey = process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY || '';
	if (!googleKey && !openAIKey) return json({ error: 'Falta configurar GOOGLE_AI_API_KEY u OPENAI_API_KEY.' }, 503);

	const userId = auth.user.id;
	const access = await getEffectiveAccess(admin, userId, auth.user.email);
	const isUnlimited = access.isUnlimited;

	let generationId = '';
	try {
		const body = await request.json().catch(() => ({}));
		generationId = String(body?.generationId || '').trim();
		if (!generationId) return json({ error: 'Falta generationId.' }, 400);

		const { data: row, error: rowError } = await admin.from('creative_generations')
			.select('id,user_id,status,output_path,title,format,template_id,user_brief,batch_id,output_index,product_id,settings_snapshot')
			.eq('id', generationId).eq('user_id', userId).maybeSingle();
		if (rowError) throw rowError;
		if (!row) return json({ error: 'La generación no existe o no pertenece a tu cuenta.' }, 404);

		// Idempotente: si ya está lista, devolvemos la misma imagen sin volver a gastar.
		if (row.status === 'completed' && row.output_path) {
			const { data: signed } = await admin.storage.from(ASSETS).createSignedUrl(row.output_path, 60 * 60);
			return json({ ok: true, id: row.id, alreadyDone: true, imageUrl: signed?.signedUrl || '' });
		}

		// Solo se trabaja sobre filas que siguen en curso. Una fila 'failed' ya
		// tuvo su crédito devuelto: generarla igual era exactamente el agujero
		// que permitía cancelar el lote, recuperar los créditos y llevarse las
		// imágenes gratis.
		if (row.status !== 'processing') {
			return json({ error: 'Esta generación ya fue cerrada. Volvé a lanzarla desde el lote.', code: 'NOT_PROCESSING' }, 409);
		}

		const snapshot: any = row.settings_snapshot || {};
		const requestedFormat = String(row.format || snapshot.format || 'original');
		const brief = stripWebReferences(row.user_brief);
		const subjectMode = ['product', 'service', 'saas', 'brand'].includes(String(snapshot.subjectMode))
			? String(snapshot.subjectMode) as 'product' | 'service' | 'saas' | 'brand'
			: 'product';

		// ── 1. El anuncio ganador que hay que clonar ──────────────────────────
		const referencePath = String(snapshot.referencePath || '');
		if (!referencePath) throw new Error('Esta generación no tiene un anuncio ganador de referencia asignado.');
		const { data: referenceBlob, error: referenceError } = await admin.storage.from(REFERENCES).download(referencePath);
		if (referenceError || !referenceBlob) throw referenceError || new Error('No se pudo descargar el anuncio ganador de referencia.');
		const normalizedReference = await normalizeImageInput(Buffer.from(await referenceBlob.arrayBuffer()));
		if (!normalizedReference) throw new Error('El anuncio ganador de referencia no se pudo procesar.');

		// ── 2. Las fotos reales del producto ─────────────────────────────────
		const productImages: EngineImage[] = [];
		const productId = row.product_id || snapshot.productId || null;
		let productRecord: any = null;
		if (productId) {
			const { data: product } = await admin.from('creative_products')
				.select('name,description,price_text,currency,image_path,analysis,metadata')
				.eq('id', productId).eq('user_id', userId).maybeSingle();
			productRecord = product;
			if (subjectMode === 'product') {
			const paths: string[] = [];
			if (product?.image_path) paths.push(product.image_path);
			const extraImages = await listProductImageRows(admin, userId, [productId]);
			for (const item of extraImages || []) {
				if (item.storage_path) paths.push(item.storage_path);
			}
			for (const path of [...new Set(paths)].slice(0, 5)) {
				const { data: blob } = await admin.storage.from(ASSETS).download(path);
				if (!blob) continue;
				const normalized = await normalizeImageInput(Buffer.from(await blob.arrayBuffer()));
				if (normalized) productImages.push({ buffer: normalized.buffer, type: normalized.type });
			}
			}
		}
		// En modo texto no hay fotos y está bien: se clonan ganadores que no
		// muestran producto y la composición visual se clona tal como está.
		const textMode = snapshot.textMode === true || subjectMode !== 'product' || !productId;
		const allowNoProductImage = snapshot.allowNoProductImage === true;
		if (!productImages.length && !textMode && !allowNoProductImage) {
			throw new Error('No hay ninguna foto real del producto disponible para clonar el anuncio.');
		}

		const productName = subjectMode === 'product'
			? (productRecord?.name || snapshot.productName || row.title || 'el producto')
			: (snapshot.productName || productRecord?.metadata?.brandFromUrl?.name || row.title || 'el servicio o la marca');
		// Datos verificados del producto para reconstruirlo visualmente. Nunca se
		// completa con supuestos.
		const productFacts = subjectMode === 'product' ? [
			productRecord?.description || snapshot.productDescription,
			(productRecord?.price_text || snapshot.productPriceText)
				&& `Precio exacto tal como figura en la web: ${productRecord?.price_text || snapshot.productPriceText}`,
			productRecord?.analysis?.category,
		].filter(Boolean).join(' · ') : [snapshot.productDescription, snapshot.serviceDescription, productRecord?.metadata?.brandFromUrl?.styleSummary].filter(Boolean).join(' · ');

		// ── 3. De qué marca habla el anuncio ──────────────────────────────────
		// 'url'  → la marca del sitio de donde salió el producto
		// 'mine' → la que el usuario tiene guardada en Mi marca
		// 'none' → ninguna: el anuncio habla solo del producto
		const brandSource = String(snapshot.brandSource || 'url');
		const { data: profile } = await admin.from('creative_profiles')
			.select('brand_name,website_url,brand_colors,logo_path,brand_style').eq('user_id', userId).maybeSingle();

		let brandName = '';
		let urlBrand: any = (productRecord?.metadata as any)?.brandFromUrl || null;
		const myBrandColors: string[] = Array.isArray(profile?.brand_colors) ? profile.brand_colors : [];
		const urlBrandColors: string[] = Array.isArray(urlBrand?.colors) ? urlBrand.colors : [];
		const myBrandTypography: any = (profile?.brand_style as any)?.typography;
		const urlBrandTypography: any = urlBrand?.typography || undefined;
		const myBrandPalette: any = (profile?.brand_style as any)?.palette || null;
		const urlBrandPalette: any = urlBrand?.palette || null;
		const brandPalette: any = snapshot.colorMode === 'brand' ? myBrandPalette : snapshot.colorMode === 'url' ? urlBrandPalette : null;
		let brandColors: string[] = [];
		let brandTypography: any = undefined;
		let logoImage: EngineImage | null = null;
		// El usuario elige explícitamente si quiere el logo en este anuncio: antes
		// se agregaba solo porque había uno disponible, sin preguntar nunca. Las
		// filas viejas (sin este campo) se tratan como "sin logo": es la opción
		// segura, nunca agrega algo que el usuario no pidió.
		const includeLogo = snapshot.includeLogo === true;

		if (brandSource === 'mine') {
			brandName = profile?.brand_name || '';
			if (includeLogo && profile?.logo_path) {
				const { data: logoBlob } = await admin.storage.from(ASSETS).download(profile.logo_path);
				const normalized = logoBlob ? await normalizeImageInput(Buffer.from(await logoBlob.arrayBuffer())) : null;
				if (normalized) logoImage = { buffer: normalized.buffer, type: normalized.type };
			}
		} else if (brandSource === 'url') {
			brandName = urlBrand?.name || '';
			// El logo del sitio viene como URL: se baja y se normaliza. Si sale
			// sucio o no se puede leer, se sigue sin logo antes que arruinar el aviso.
			if (includeLogo && urlBrand?.logoUrl) {
				try {
					// URL sacada del HTML de un sitio de terceros: va por el fetch
					// con guarda de red privada, nunca por fetch directo.
					const logoResponse = await safeExternalFetch(urlBrand.logoUrl, { headers: { accept: 'image/*' } });
					if (logoResponse.ok) {
						const raw = Buffer.from(await readLimited(logoResponse, 4_000_000));
						if (raw.length > 500 && raw.length < 4_000_000) {
							const normalized = await normalizeImageInput(raw);
							if (normalized) logoImage = { buffer: normalized.buffer, type: normalized.type };
						}
					}
				} catch (logoError) {
					console.warn(`[batch-worker ${generationId}] no se pudo bajar el logo del sitio:`, logoError);
				}
			}
		}
		brandColors = snapshot.colorMode === 'brand' ? myBrandColors : snapshot.colorMode === 'url' ? urlBrandColors : [];
		brandTypography = snapshot.typoMode === 'brand' ? myBrandTypography : snapshot.typoMode === 'url' ? urlBrandTypography : undefined;
		const hasLogo = Boolean(logoImage);
		const avatarReferenceImages: EngineImage[] = [];
		let avatarDescription = '';
		if (snapshot.avatarId) {
			const avatar = await resolveAvatarReferences({ admin, userId, mode: 'saved', avatarId: String(snapshot.avatarId) });
			avatarDescription = avatar.description || avatar.name || '';
			for (const image of avatar.images.slice(0, 8)) {
				avatarReferenceImages.push({ buffer: image.buffer, type: image.type });
			}
		}
		// ── 4. Análisis visual del ganador y de las áreas de imagen ──────────────
		const approvedCarouselPlan = snapshot.approvedPlan && typeof snapshot.approvedPlan === 'object'
			? snapshot.approvedPlan as LayoutAnalysis
			: null;
		let analysis: LayoutAnalysis | null = approvedCarouselPlan ? {
			...approvedCarouselPlan,
			textZones: approvedCarouselPlan.textZones?.filter((zone: any) => !zone.slide || zone.slide === Number(snapshot.carouselIndex || row.output_index || 1)),
			people: approvedCarouselPlan.people?.filter((person: any) => !person.slide || person.slide === Number(snapshot.carouselIndex || row.output_index || 1)),
			comparisonItems: approvedCarouselPlan.comparisonItems?.filter((item: any) => !item.slide || item.slide === Number(snapshot.carouselIndex || row.output_index || 1)),
			creativeDecisions: approvedCarouselPlan.creativeDecisions?.filter((decision: any) => !decision.slide || decision.slide === Number(snapshot.carouselIndex || row.output_index || 1)),
		} : null;
		try {
		if (!analysis) {
			analysis = await analyzeReferenceLayout({ openAIKey, googleKey }, {
				referenceB64: normalizedReference.buffer.toString('base64'),
				referenceMime: normalizedReference.type,
				productB64: productImages[0]?.buffer.toString('base64'),
				productMime: productImages[0]?.type,
				productName,
				productFacts,
				productImages: productImages.map((photo) => ({ b64: photo.buffer.toString('base64'), mime: photo.type })),
				avatarImages: avatarReferenceImages.map((photo) => ({ b64: photo.buffer.toString('base64'), mime: photo.type })),
				avatarDescription,
				brandName,
				language: snapshot.language || '',
				subjectMode,
				brandPalette,
			});
		}
		} catch (analysisError) {
			console.error(`[batch-worker ${generationId}] análisis de layout falló:`, analysisError);
		}
		const prompt = buildReferenceClonePrompt({
			productNames: [productName],
			brandName,
			hasLogo,
			brief,
			analysis,
			productFacts: [productFacts],
			languageCode: analysis?.language || (LANGUAGE_NAMES[snapshot.language] ? snapshot.language : undefined),
			adCopy: analysis?.adCopy ? {
				headline: analysis.adCopy.headline,
				subheadline: analysis.adCopy.description,
				cta: analysis.adCopy.cta,
				language: analysis.language,
			} : undefined,
			colorMode: ['winner', 'url', 'brand'].includes(snapshot.colorMode) ? snapshot.colorMode : 'winner',
			typoMode: ['winner', 'url', 'brand'].includes(snapshot.typoMode) ? snapshot.typoMode : 'winner',
			brandColors,
			brandTypography,
			brandPalette,
			subjectMode,
			hasAvatarReference: avatarReferenceImages.length > 0,
			avatarDescription,
			carousel: snapshot.carousel ? { index: Number(snapshot.carouselIndex || row.output_index || 1), total: Number(snapshot.carouselTotal || 1) } : undefined,
		});

		// ── 5. Formato: 'original' toma la proporción real del ganador ────────
		let format = requestedFormat;
		if (format === 'original') {
			format = '1:1';
			try {
				const sharp = (await import('sharp')).default;
				const metadata = await sharp(normalizedReference.buffer).metadata();
				if (metadata.width && metadata.height) format = closestFormat(metadata.width / metadata.height);
			} catch { /* sin metadata: cuadrado */ }
		}

		// ── 6. Generar ────────────────────────────────────────────────────────
		// Si el anuncio ganador NO muestra ningún producto (puro texto, tipografía
		// grande sobre un fondo), se clona tal cual: solo cambia el copy. En ese
		// caso las fotos del producto no se adjuntan, porque tenerlas a la vista
		// hace que el modelo las pegue igual y arruine el diseño original.
		const referenceShowsProduct = analysis?.referenceHasProduct !== false;
		const engineImages: EngineImage[] = [
			{ buffer: normalizedReference.buffer, type: normalizedReference.type },
			...(referenceShowsProduct ? productImages : []),
			...avatarReferenceImages,
			...(logoImage ? [logoImage] : []),
		];

		// Nivel de calidad según lo que el anuncio necesite: 'low' cuesta 60% menos
		// y alcanza salvo cuando hay letra chica en juego.
		const decision = pickQualityTier(analysis, { force: snapshot.forceTier });
		console.log(`[batch-worker ${generationId}] calidad ${decision.tier}: ${decision.reason}`);

		const { buffer, engine } = await generateAdImage({
			googleKey,
			openAIKey,
			prompt,
			images: engineImages,
			format,
			tier: decision.tier,
		});

		// Gemini devuelve JPEG y OpenAI PNG: se etiqueta según los bytes reales,
		// no a ojo, para que el navegador y la descarga reciban el tipo correcto.
		const isPng = buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50;
		const extension = isPng ? 'png' : 'jpg';
		const contentType = isPng ? 'image/png' : 'image/jpeg';

		const outputPath = `${userId}/generations/${row.batch_id || row.id}/${row.output_index || 1}.${extension}`;
		const { error: uploadError } = await admin.storage.from(ASSETS)
			.upload(outputPath, buffer, { contentType, upsert: true });
		if (uploadError) {
			// El error de Storage venía como "Bad Request" pelado: sin la ruta, el
			// tipo ni el tamaño no había forma de saber qué lo rechazó.
			throw new Error(
				`Storage rechazó la subida (${outputPath}, ${contentType}, ${Math.round(buffer.length / 1024)} KB): `
				+ `${(uploadError as any).message || ''} ${JSON.stringify(uploadError).slice(0, 200)}`,
			);
		}

		const { error: completionError } = await admin.from('creative_generations').update({
			status: 'completed',
			output_path: outputPath,
			prompt,
			settings_snapshot: {
				...snapshot,
				qualityTier: decision.tier,
				qualityReason: decision.reason,
				engine,
				// Lectura creativa del ganador: sirve para mostrar el puntaje y, más
				// adelante, para buscar creativos parecidos por estética.
				creative: analysis?.creative || null,
			},
			completed_at: new Date().toISOString(),
		}).eq('id', row.id).eq('user_id', userId);
		if (completionError) {
			await admin.storage.from(ASSETS).remove([outputPath]);
			throw completionError;
		}

		const { data: signed } = await admin.storage.from(ASSETS).createSignedUrl(outputPath, 60 * 60);
		return json({
			ok: true,
			id: row.id,
			engine,
			analyzed: Boolean(analysis),
			imageUrl: signed?.signedUrl || '',
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'No se pudo generar el anuncio.';
		console.error(`[batch-worker ${generationId}] falló:`, error);
		if (generationId) {
			// El crédito se devuelve solo si esta invocación es la que cerró la
			// fila. Si el barrido de colgadas ya la había cerrado, ya lo devolvió.
			const closed = await closeGenerationsAndCountRefunds(admin, userId, [generationId], message);
			if (!isUnlimited && closed.length) {
				const { error: refundError } = await admin.rpc('refund_creative_credits', { p_user_id: userId, p_amount: 1 });
				if (refundError) console.error('Refund falló:', refundError);
			}
		}
		return json({ error: 'No pudimos generar este anuncio. El crédito fue devuelto.' }, 500);
	}
};
