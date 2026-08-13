import type { APIRoute } from 'astro';
import { waitUntil } from '@vercel/functions';
import { toFile } from 'openai';
import { analyzeReferenceLayout, normalizeImageInput, LANGUAGE_NAMES, type LayoutAnalysis } from '../../../lib/creattia/ad-analysis';
import { generateAdImage } from '../../../lib/creattia/image-engines';
import { authenticateRequest, checkRateLimit, closeGenerationsAndCountRefunds, getAdminClient, json } from '../../../lib/creattia/server';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { checkReferencePath } from '../../../lib/creattia/library-access';
import { readLimited, safeExternalFetch } from '../../../lib/creattia/safe-fetch';
import { stripWebReferences, type AdaptedAdCopy } from '../../../lib/creattia/ad-copy';
import { listProductImageRows } from '../../../lib/creattia/product-media';
import { resolveAvatarReferences } from '../../../lib/creattia/avatar-assets';
import { closestFormat, formatSizes, supportedFormats } from '../../../lib/creattia/formats';
import { fotosParaElMotor, leerElProducto, refotografiarProducto, todasSonPlacas } from '../../../lib/creattia/clon-libre';
import { alcanceDesde, buildClonePrompt, buildClonePromptDeRespaldo, parseFotosElegidas, parseRolesDeColor, parseTipografiaElegida, mergePaletteOverride, parseBrandOverride, parseLogoMode, parsePaletteOverride, parsePersonMode, SUBJECT_MODES, subjectModeDesde, usesRealProductPhotos, type SubjectMode } from '../../../lib/creattia/generation-pipeline';
import { pickQualityTier } from '../../../lib/creattia/quality-router';
import { trackEvent } from '../../../lib/creattia/events';
import { datosDelNavegador } from '../../../lib/creattia/meta-capi';

export const prerender = false;
export const maxDuration = 300;

// Motor primario: Gemini image (nano-banana). ~6x más barato y ~10x más rápido
// que gpt-image en calidad alta, con excelente fidelidad de producto y texto.
const imageTypes = new Set(['product', 'promotion', 'lifestyle', 'catalog']);
const variationStrengths = new Set(['exact', 'light', 'strong']);
const acceptedInputTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

function clean(value: FormDataEntryValue | null, max = 500) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function uniqueIds(values: string[]) {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildPrompt(input: {
	templateName: string;
	purpose: string;
	usageHint: string;
	preset: string;
	brandName: string;
	colors: string;
	brandSummary: string;
	brandVoice: string;
	targetAudience: string;
	typography: string;
	styleSummary: string;
	brandPersonality: string;
	products: Array<{ name: string; description: string }>;
	imageType: string;
	brief: string;
	format: string;
	hasLogo: boolean;
	hasReference: boolean;
	hasSourceGeneration: boolean;
	hasUploadedProduct: boolean;
	variationStrength: string;
	replaceProduct: boolean;
	inputImageMap: string[];
	adCopy?: AdaptedAdCopy;
}) {
	const revisionRules: Record<string, string> = {
		exact: 'Use the first input image as the master reference. Preserve its framing, layout, hierarchy, palette, lighting, typography zones and every untouched detail as closely as possible. Apply only the requested change.',
		light: 'Use the first input image as the main reference. Keep the creative angle, recognizable layout and visual hierarchy while allowing restrained variations in styling, spacing and supporting details.',
		strong: 'Use the first input image as strategic reference. Preserve the creative angle and selling logic, but create a substantially different composition and art direction.',
	};
	const compositionRule = input.hasSourceGeneration
		? revisionRules[input.variationStrength] || revisionRules.exact
		: input.hasReference
			? 'Use the first input image only as the advertising composition reference. Preserve its visual hierarchy, rhythm and conversion-oriented composition, but do not copy trademarks, people, product identity or exact wording.'
			: 'Create a polished static image with a clear visual hierarchy and one dominant focal point.';
	const productFacts = input.products.length
		? input.products.map((product, index) => `${index + 1}. ${product.name}: ${product.description || 'No additional verified facts.'}`).join('\n')
		: 'No specific product selected.';
	const adCopyBlock = input.adCopy
		? `
TEXT COPY TO WRITE EXACTLY ON THE IMAGE (keep the same visible zones, hierarchy and language as the winning reference):
- Primary text / main message: "${input.adCopy.primaryText}"
- Headline: "${input.adCopy.headline}"
- Description: "${input.adCopy.description}"
- CTA: "${input.adCopy.cta}"
Render this copy sharply and correctly. Do not add extra text blocks that are not present in the reference.`
		: '';

	return `Create a production-ready static advertising image for a real ecommerce brand.

OBJECTIVE
- Creative angle: ${input.templateName}
- Why it works: ${input.purpose}
- Best moment to use it: ${input.usageHint}
- Visual variation: ${input.preset}
- Requested image type: ${input.imageType}
- Output placement: ${input.format}

VERIFIED BRAND CONTEXT
- Brand name: ${input.brandName || 'Use a discreet generic brand lockup'}
- Brand colors: ${input.colors || '#18181b and #ffffff'}
- Brand summary: ${input.brandSummary || 'Use only the supplied facts.'}
- Brand voice: ${input.brandVoice || 'Clear and direct.'}
- Target audience: ${input.targetAudience || 'Not provided.'}
- Brand typography: ${input.typography || 'Not provided — pick a clean modern sans-serif.'}
- Brand visual style: ${input.styleSummary || 'Not provided.'}
- Brand personality: ${input.brandPersonality || 'Not provided.'}

INPUT IMAGE MAP
${input.inputImageMap.length ? input.inputImageMap.map((label, index) => `- Image ${index + 1}: ${label}`).join('\n') : '- No input images. Build from verified text context only.'}

SELECTED PRODUCTS
${productFacts}
${adCopyBlock}

ART DIRECTION
${compositionRule}
${input.hasSourceGeneration && input.replaceProduct ? '- Replace the product or products visible in the source generation with the selected product inputs. Do not blend old and new products.' : ''}
${input.hasReference && !input.hasSourceGeneration && (input.products.length > 0 || input.hasUploadedProduct) ? `- The first image is the WINNING AD TEMPLATE (reference layout). The second image is the REAL PRODUCT to feature. Create a new professional advertisement by using the EXACT COMPOSITION, color scheme, background aesthetic, alignment, speech bubbles, and layout of the first image (winning ad template), but replacing its original product with the real product shown in the second image. Do not draw the template's original product/packaging.` : ''}
${input.products.length > 1 ? `- This is a multi-product creative with ${input.products.length} distinct products. Show every supplied product clearly in one intentional group shot or collection composition. Preserve the real shape, packaging, logo and colors of each one.` : ''}
${input.products.length === 1 || (!input.products.length && input.hasUploadedProduct) ? '- The selected product is supplied as an input image. Preserve its real shape, packaging, logo and colors with high fidelity.' : ''}
  - PRODUCT INTEGRATION & REALISM (CRITICAL): Do NOT simply place the product image as a rigid, flat cutout with hard artificial edges. Seamlessly integrate the product into the scene with matching lighting, exposure, contrast, color temperature, and realistic shadows. If a hand is holding a product in the reference layout, the fingers must grip and wrap around the new product naturally, with realistic occlusion and contact shadows. Place the product on any surfaces with realistic contact shadows and oclusions.
  - PRODUCT ORIENTATION (CRITICAL): if the product has a front, back or side, preserve the real orientation shown in all supplied photos and verified facts. Never mirror or turn a garment inside out, and never move a print, embroidery, patch or label from the back to the front. If a detail belongs to a hidden side, do not invent or relocate it.
  - PRODUCT CONSISTENCY (CRITICAL): when multiple product photos are supplied manually, they are different views of ONE SAME real product/SKU. Reconcile them as a single identity: preserve the exact silhouette, dimensions, proportions, construction, seams, materials, finish, colors, texture, packaging, labels and distinctive details. Never average views into a hybrid, mix variants, add components or remove real components.
${input.products.length === 0 && !input.hasUploadedProduct ? '- Build a brand-level promotion without inventing a specific packaged product.' : ''}
${input.imageType === 'lifestyle' ? '- Create a believable lifestyle scene. Every real product must remain commercially prominent.' : ''}
${input.imageType === 'catalog' ? '- Use a clean ecommerce catalog treatment: controlled lighting, precise product edges, minimal environment and premium spacing.' : ''}
${input.imageType === 'promotion' ? '- Prioritize the verified offer and brand message. Do not invent a product-specific claim.' : ''}
${input.hasLogo ? '- LOGO PERMISSION: the user selected INCLUDE LOGO. Use the image identified as the brand logo in the input map, preserve it accurately and place it once with comfortable clear space.' : '- LOGO PERMISSION: the user selected NO ADDED LOGO. Do not add any separate logo, wordmark, emblem, monogram, badge, seal, watermark or invented brand symbol to the layout. Preserve only branding physically printed on the real product packaging.'}
- Render the supplied winning-ad copy inside the same visible text zones when copy is provided above. If no copy is provided, keep text minimal and only use verified facts.
- TEXT RENDERING QUALITY: use opaque, flat and crisp letterforms with clean anti-aliasing. Do not add a white halo, ghost copy, blurred outline, glow, bevel, extrusion, duplicated offset, feathering or fuzzy bloom behind text. Do not invent a text shadow; preserve one only when it is clearly present in the winning reference, subtly and with the same direction and colour.
- Do not add URLs, domains, social handles or QR codes. Preserve text physically printed on the supplied product packaging or the official logo exactly.
- Do not invent prices, percentages, reviews, certifications, deadlines, product features or legal claims.
- Do not include platform UI, watermarks, mock browser chrome or explanatory labels.
- Make the result feel designed by a senior performance creative team, not like generic AI art.

USER DIRECTION
${input.brief || (input.hasSourceGeneration ? 'No specific edit was requested. Produce another version using the selected variation strength.' : 'No extra direction. Choose the strongest visual treatment for the selected angle.')}`;
}



async function fileToOpenAI(file: File, fallbackName: string) {
	const bytes = Buffer.from(await file.arrayBuffer());
	return toFile(bytes, file.name || fallbackName, { type: file.type || 'image/png' });
}




export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const openAIKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
	const googleKey = import.meta.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
	if (!openAIKey && !googleKey) return json({ error: 'Falta configurar GOOGLE_AI_API_KEY u OPENAI_API_KEY.', requiresConfiguration: true }, 503);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	// Se lee antes de tocar el formulario: `request.formData()` consume el cuerpo,
	// pero las cabeceras siguen ahí y la generación puede tardar minutos.
	const navegador = datosDelNavegador(request);

	let generationIds: string[] = [];
	const completedIds = new Set<string>();
	let reservedCount = 0;
	// Una imagen = un crédito, sin excepciones.
	const creditsPerImage = 1;

	try {
		const form = await request.formData();
		const templateId = Number(clean(form.get('templateId'), 4));
		const requestedTemplateName = clean(form.get('templateName'), 80);
		const preset = clean(form.get('preset'), 40) || 'Fiel al ganador';
		const brief = clean(form.get('brief'), 600);
		const requestedFormat = clean(form.get('format'), 20) || 'square';
		const format = supportedFormats.has(requestedFormat) ? requestedFormat as keyof typeof formatSizes : 'square';
		const requestedImageType = clean(form.get('imageType'), 30) || 'product';
		const imageType = imageTypes.has(requestedImageType) ? requestedImageType : 'product';
		const referenceId = clean(form.get('referenceId'), 60);
		let referencePath = clean(form.get('referencePath'), 300);
		const sourceGenerationId = clean(form.get('sourceGenerationId'), 60);
		const requestedFidelity = Number(clean(form.get('fidelity'), 2) || 1);
		const fidelity = [1, 2, 3].includes(requestedFidelity) ? requestedFidelity : 1;
		let approvedPlan: LayoutAnalysis | null = null;
		try {
			const rawPlan = clean(form.get('plan'), 30000);
			if (rawPlan) {
				const parsed = JSON.parse(rawPlan);
				if (parsed && typeof parsed === 'object' && (
					Array.isArray(parsed.people)
					|| Array.isArray(parsed.comparisonItems)
					|| Array.isArray(parsed.creativeDecisions)
					|| Array.isArray(parsed.textZones)
					|| typeof parsed.messageStrategy === 'string'
					|| parsed.adCopy
				)) approvedPlan = parsed;
			}
		} catch { /* plan inválido: se analiza normalmente */ }
		const styleModes = new Set(['winner', 'url', 'brand']);
		const requestedColorMode = clean(form.get('colorMode'), 10);
		const requestedTypoMode = clean(form.get('typoMode'), 10);
		const colorMode = (styleModes.has(requestedColorMode) ? requestedColorMode : 'winner') as 'winner' | 'url' | 'brand';
		const typoMode = (styleModes.has(requestedTypoMode) ? requestedTypoMode : 'winner') as 'winner' | 'url' | 'brand';
		// Por defecto NO se agrega logo ni marca si el caller no lo pide de
		// forma explícita — antes el default era "sí" y varios flujos (revisión
		// desde el lightbox, modal de la biblioteca, wizard de Studio) nunca
		// mandaban estos campos, así que terminaban agregando el logo guardado
		// del usuario sin que nadie lo pidiera.
		const includeLogo = clean(form.get('includeLogo'), 2) === '1';
		// Con qué se firma. Puede no venir —el rehacer del historial manda solo el
		// sí/no— y en ese caso se deja sin resolver a propósito, para que decida el
		// prompt con el ganador ya analizado.
		const logoMode = parseLogoMode(form.get('logoMode'));
		const subjectModeParam = clean(form.get('subjectMode'), 12);
		// 'catalog' faltaba en esta lista: el flujo lo mandaba al detectar una
		// tienda, no matcheaba, y caía al valor por defecto 'product'. Por eso un
		// anuncio de la tienda terminaba hablando de un solo artículo.
		const requestedSubjectMode = SUBJECT_MODES.includes(subjectModeParam as SubjectMode)
			? subjectModeParam as SubjectMode
			: null;
		const avatarId = clean(form.get('avatarId'), 80);
		/**
		 * Quién aparece en el anuncio.
		 *
		 * El fallback mira `avatarId` porque las generaciones que se rehacen desde
		 * el historial son anteriores a este campo: ahí un avatarId guardado era,
		 * por definición, una carga de fotos, y resolverlo como 'ai' habría hecho
		 * desaparecer al avatar sin que nada fallara.
		 */
		const personMode = parsePersonMode(form.get('personMode'), avatarId ? 'upload' : 'ai');
		const personaEscrita = personMode === 'described' ? clean(form.get('avatarDescription'), 600) : '';
		// Dónde pasa la escena, si el usuario lo pidió. Sustituye la cláusula del
		// recasteo en el prompt; vacío no agrega ni cambia nada.
		const lugarEscena = clean(form.get('lugarEscena'), 200);
		/**
		 * Que hacer con la fila de medios del ganador ("As seen on: Forbes, NBC").
		 *
		 * Por defecto se saca, y es lo correcto: reproducir esos logos afirma una
		 * cobertura de prensa que el anunciante no tiene, sobre empresas reales.
		 * 'texto' es para el negocio que SI tiene prensa o certificaciones propias y
		 * las escribe: eso es legitimo y hasta ahora no habia forma de mostrarlo.
		 */
		// La fila de medios solo se dibuja con lo que el anunciante declara: la app
		// nunca la rellena sola ni arrastra los medios que traía el ganador, que
		// son de otra empresa. Sin nombres declarados no hay fila, sea cual sea el
		// modo — 'texto' y 'logos' cambian cómo se dibuja, no de dónde sale.
		const pressRowPedido = clean(form.get('pressRowMode'), 10);
		const pressRowItems = pressRowPedido === 'texto' || pressRowPedido === 'logos'
			? clean(form.get('pressRowItems'), 300).split(',').map((valor) => valor.trim()).filter(Boolean).slice(0, 8)
			: [];
		const pressRowMode = pressRowItems.length && (pressRowPedido === 'texto' || pressRowPedido === 'logos')
			? pressRowPedido as 'texto' | 'logos'
			: 'quitar' as const;
		const effectiveBrief = stripWebReferences(brief);
		const brandSourceParam = clean(form.get('brandSource'), 10);
		// 'url'  → la marca del sitio de donde salió el producto
		// 'mine' → la que el usuario tiene guardada en Mi marca
		// 'none' → ninguna: el anuncio habla solo del producto
		const brandSource = ['url', 'mine', 'none'].includes(brandSourceParam) ? brandSourceParam : 'none';
		// Identidad tomada de una URL que el usuario pegó al regenerar: pisa el
		// nombre, el logo, los colores y la tipografía de la fuente elegida.
		const brandOverride = parseBrandOverride(clean(form.get('brandOverride'), 1200));
		const requestedVariationStrength = clean(form.get('variationStrength'), 20) || 'exact';
		const variationStrength = variationStrengths.has(requestedVariationStrength) ? requestedVariationStrength : 'exact';
		const requestedLanguage = clean(form.get('language'), 5);
		const language = LANGUAGE_NAMES[requestedLanguage] ? requestedLanguage : '';
		let productIds = uniqueIds([
			...form.getAll('productIds').filter((value): value is string => typeof value === 'string'),
			clean(form.get('productId'), 60),
		]);
		/**
		 * Qué fotos del producto viajan, elegidas en la revisión.
		 *
		 * `null` —el campo no vino— es "todas las que tenga", que es lo que hacía
		 * la app desde siempre. Una lista limita a esas rutas, y la lista vacía es
		 * una decisión, no un error: no se adjunta ninguna foto y el aviso lo
		 * resuelve el modelo con los datos del producto, el mismo camino que ya
		 * existe para un sitio que no publica fotos.
		 */
		let fotosPedidas: string[] | null = (() => {
			const crudo = clean(form.get('productPhotoPaths'), 6000);
			if (!crudo) return null;
			try {
				const parseado = JSON.parse(crudo);
				if (!Array.isArray(parseado)) return null;
				return parseado.filter((value: unknown): value is string => typeof value === 'string');
			} catch { return null; }
		})();
		// Cuántas versiones del mismo aviso. El techo es real: cada una es una
		// imagen que se cobra y que se paga, así que un número absurdo llegado del
		// cliente no puede convertirse en veinte renders. Un valor roto cae en 1,
		// que es lo único seguro cuando no se entiende lo que pidieron.
		const pedido = Math.floor(Number(clean(form.get('count'), 2) || 1));
		const requestedCount = Number.isFinite(pedido) ? Math.min(4, Math.max(1, pedido)) : 1;
		// Rehacer una generación existente devuelve UNA, no un abanico nuevo.
		const count = sourceGenerationId ? 1 : requestedCount;
		// Todas las imágenes salen en el mismo nivel de calidad: lo decide
		// quality-router (medium por defecto, IMAGE_QUALITY_TIER para cambiarlo en
		// toda la app). El cliente ya no elige nivel, así que una imagen siempre
		// cuesta 1 crédito.
		const product = form.get('product');
		const logo = form.get('logo');

		if (!Number.isInteger(templateId) || templateId < 1) return json({ error: 'El creativo elegido no es válido.' }, 400);
		if (!Number.isInteger(count) || count < 1 || count > 4) return json({ error: 'Elegí entre 1 y 4 imágenes.' }, 400);
		if (productIds.length > 5) return json({ error: 'Podés usar hasta 5 productos en una imagen.' }, 400);
		if (product instanceof File && product.size > 15 * 1024 * 1024) return json({ error: 'La imagen del producto supera los 15 MB.' }, 413);
		if (logo instanceof File && logo.size > 10 * 1024 * 1024) return json({ error: 'El logo supera los 10 MB.' }, 413);
		if (product instanceof File && product.size > 0 && !acceptedInputTypes.has(product.type)) return json({ error: 'La foto del producto debe ser PNG, JPG, WebP o AVIF.' }, 415);
		if (logo instanceof File && logo.size > 0 && !acceptedInputTypes.has(logo.type)) return json({ error: 'El logo debe ser PNG, JPG, WebP o AVIF.' }, 415);

		const { data: template, error: templateError } = await admin.from('creative_templates')
			.select('id,name,purpose,usage_hint').eq('id', templateId).eq('is_active', true).maybeSingle();
		if (templateError) throw templateError;
		// Fall back gracefully when template is from the winners library (not in Supabase catalog)
		const templateName = template?.name || requestedTemplateName || 'Anuncio Ganador';
		const templatePurpose = template?.purpose || 'Crear un anuncio de alto rendimiento inspirado en el diseño de referencia';
		const templateUsageHint = template?.usage_hint || 'Usar cuando se quiere replicar el estilo de un anuncio probado';

		const { data: profile, error: profileError } = await admin.from('creative_profiles')
			.select('brand_name,website_url,instagram_handle,brand_colors,logo_path,brand_summary,brand_voice,target_audience,brand_style')
			.eq('user_id', auth.user.id).maybeSingle();
		if (profileError) throw profileError;
		const brandStyle: any = profile?.brand_style || null;

		let storedProducts: any[] = [];
		const productImagesById = new Map<string, Array<{ storage_path: string; sort_order: number }>>();
		if (productIds.length) {
			const { data, error } = await admin.from('creative_products')
				.select('id,name,description,price_text,currency,image_path,source_image_url,analysis,metadata')
				.in('id', productIds).eq('user_id', auth.user.id).eq('is_active', true);
			if (error) throw error;
			if ((data || []).length !== productIds.length) return json({ error: 'Uno de los productos ya no existe o no pertenece a tu cuenta.' }, 400);
			const byId = new Map((data || []).map((item) => [item.id, item]));
			storedProducts = productIds.map((id) => byId.get(id));
			const productImageRows = await listProductImageRows(admin, auth.user.id, productIds);
			for (const row of productImageRows) {
				const current = productImagesById.get(row.product_id) || [];
				current.push(row); productImagesById.set(row.product_id, current);
			}
		}

		let sourceGeneration: { id: string; output_path: string; product_id: string | null } | null = null;
		if (sourceGenerationId) {
			const { data, error } = await admin.from('creative_generations').select('id,output_path,product_id,settings_snapshot')
				.eq('id', sourceGenerationId).eq('user_id', auth.user.id).eq('status', 'completed').maybeSingle();
			if (error) throw error;
			if (!data?.output_path) return json({ error: 'La imagen de referencia no está disponible.' }, 400);
			sourceGeneration = data;
		}

	/**
	 * Pedir otra versión SIN escribir un cambio no es revisar: es querer otro tiro
	 * del mismo trabajo.
	 *
	 * Las dos intenciones compartían camino y la segunda salía mal: se le pasaba al
	 * modelo la imagen YA generada como referencia y se armaba el prompt genérico
	 * viejo, así que la nueva versión no pasaba por el clon libre en ningún momento
	 * y se notaba. Con el snapshot de la generación original —que guarda el ganador,
	 * los productos y las elecciones de estilo— se vuelve a correr exactamente el
	 * camino que la produjo, y lo que cambia es lo único que tiene que cambiar: el
	 * tiro del modelo.
	 *
	 * Con un cambio escrito se sigue como antes: ahí sí lo que se quiere es ESA
	 * imagen con una corrección, y la referencia correcta es ella misma.
	 */
	const rehacerDeCero = Boolean(sourceGeneration) && !brief;
	const snapshotOriginal: any = rehacerDeCero ? ((sourceGeneration as any)?.settings_snapshot || {}) : {};
	if (rehacerDeCero && typeof snapshotOriginal.referencePath === 'string') {
		referencePath = snapshotOriginal.referencePath;
	}
	// El historial no reenvía los productos de la generación original: sin esto el
	// aviso se rehacía sin producto y el clon no tenía qué mostrar.
	if (rehacerDeCero && !productIds.length && Array.isArray(snapshotOriginal.productIds)) {
		productIds = uniqueIds(snapshotOriginal.productIds.filter((id: unknown) => typeof id === 'string'));
	}
	// Lo mismo con las fotos elegidas en la revisión: sin esto, rehacer un aviso
	// que se pidió con una sola foto lo devolvía con las ocho de la URL.
	if (rehacerDeCero && !fotosPedidas && Array.isArray(snapshotOriginal.productPhotoPaths)) {
		fotosPedidas = snapshotOriginal.productPhotoPaths.filter((path: unknown) => typeof path === 'string');
	}

		const manualProductName = clean(form.get('productName'), 120);
		const manualProductFacts = clean(form.get('productFacts'), 1200);
		if (!storedProducts.length && manualProductName) {
			storedProducts = [{
				id: 'manual',
				name: manualProductName,
				description: manualProductFacts,
				price_text: '',
				currency: '',
				image_path: null,
				source_image_url: null,
				analysis: { category: '' }
			}];
		}
		// De qué habla el anuncio. Al regenerar se hereda de la imagen original
		// salvo que se pida otro: sin esto, una imagen de la tienda se rehacía
		// como si hablara de un solo producto, porque el default es 'product'.
		const heredado = String((sourceGeneration as any)?.settings_snapshot?.subjectMode || '');
		// `let` porque puede degradarse más abajo: si al final ningún producto
		// tiene foto, el anuncio pasa a hablar del negocio en vez de fallar.
		let subjectMode: SubjectMode = requestedSubjectMode
			|| (SUBJECT_MODES.includes(heredado as SubjectMode) ? heredado as SubjectMode : 'product');
		let usesRealProducts = usesRealProductPhotos(subjectMode);

		// ── De quién es el anuncio: la marca del sitio del producto, la guardada
		// en "Mi marca", o ninguna. Se resuelve acá para no repetir profile?.x
		// en cada uso del prompt más abajo.
		const urlBrand = (storedProducts[0] as any)?.metadata?.brandFromUrl || null;
		// Un catálogo se apoya en productos reales igual que una ficha: lo que
		// cambia es de qué habla el texto, no si hay fotos. Colapsarlo en una sola
		// entrada sintética le sacaba las fotos y lo volvía un anuncio de marca.
		if (!usesRealProducts) {
			const serviceName = manualProductName || (brandSourceParam === 'mine' ? profile?.brand_name : brandSourceParam === 'url' ? urlBrand?.name : '') || 'el servicio o la marca';
			/**
			 * Qué sabe el modelo del servicio.
			 *
			 * Acá se pisaba la descripción real con `styleSummary`, que es el
			 * resumen del ESTILO VISUAL de la marca —"la voz es directa,
			 * profesional y confiada"— y no dice absolutamente nada de qué hace el
			 * servicio. O sea que al elegir "servicio" se tiraba todo lo que el
			 * escaneo había extraído de la página: la descripción, los beneficios,
			 * para quién es y la promesa del H1.
			 *
			 * Sin fotos de producto —que en este modo no las hay— y sin datos, al
			 * modelo no le queda nada concreto y termina inventando: por eso salía
			 * más genérico, con esa cara de "hecho con IA".
			 *
			 * Ahora manda lo que el usuario escribió, después lo que se leyó de la
			 * página, y el resumen de estilo queda como último recurso.
			 */
			const serviceFacts = manualProductFacts
				|| storedProducts[0]?.description
				|| urlBrand?.styleSummary
				|| '';
			if (storedProducts.length) {
				storedProducts = [{ ...storedProducts[0], name: serviceName, description: serviceFacts, price_text: '', currency: '' }];
			} else {
				storedProducts = [{ id: 'manual', name: serviceName, description: serviceFacts, price_text: '', currency: '', image_path: null, source_image_url: null, analysis: { category: '' } }];
			}
		}
		const effectiveBrandName = brandOverride?.name || (brandSource === 'mine' ? (profile?.brand_name || '') : brandSource === 'url' ? (urlBrand?.name || '') : '');
		const myBrandColors = Array.isArray(profile?.brand_colors) ? profile.brand_colors : [];
		const urlBrandColors = Array.isArray(urlBrand?.colors) ? urlBrand.colors : [];
		const effectiveBrandColors = colorMode === 'brand' ? myBrandColors : colorMode === 'url' ? urlBrandColors : [];
		const detectedPalette = colorMode === 'url' ? urlBrand?.palette : colorMode === 'brand' ? brandStyle?.palette : undefined;
		// La detección de colores se puede equivocar: el usuario corrige y su
		// corrección pisa lo detectado.
		const effectiveBrandPalette = mergePaletteOverride(brandOverride?.palette || detectedPalette, parsePaletteOverride(clean(form.get('paletteOverride'), 400)));
		const myBrandTypography = brandStyle?.typography;
		const urlBrandTypography = urlBrand?.typography || undefined;
		const tipografiaElegida = parseTipografiaElegida(form.get('tipografiaOverride'));
		const effectiveBrandTypography = tipografiaElegida || brandOverride?.typography || (typoMode === 'brand' ? myBrandTypography : typoMode === 'url' ? urlBrandTypography : undefined);
		const effectiveBrandSummary = brandSource === 'mine' ? (profile?.brand_summary || '') : brandSource === 'url' ? (urlBrand?.styleSummary || '') : '';
		const effectiveBrandVoice = brandSource === 'mine' ? (profile?.brand_voice || '') : '';
		const effectiveStyleSummary = brandSource === 'mine' ? (brandStyle?.styleSummary || '') : brandSource === 'url' ? (urlBrand?.styleSummary || '') : '';
		const effectiveBrandPersonality = brandSource === 'mine' ? (brandStyle?.brandPersonality || '') : '';
		const urlLogoUrl = brandOverride?.logoUrl || (brandSource === 'url' ? (urlBrand?.logoUrl || '') : '');

		// Allow generation without product when a reference image is provided (winner library mode)
		const hasReferenceOrSource = !!(referencePath || sourceGenerationId);
		if (imageType !== 'promotion' && !hasReferenceOrSource && !storedProducts.length && !(product instanceof File && product.size > 0)) {
			return json({ error: 'Elegí al menos un producto para este tipo de imagen, o seleccioná un anuncio de referencia.' }, 400);
		}

		const access = await getEffectiveAccess(admin, auth.user.id, auth.user.email);
		const isUnlimited = access.isUnlimited;
		let remaining = 99999;

		// La ruta de referencia llega del cliente: antes alcanzaba con que
		// matcheara una regex de forma, así que cualquier cuenta podía generar
		// con la biblioteca paga completa. Ahora tiene que existir de verdad en
		// el manifiesto y estar habilitada para el plan de la cuenta.
		let storedReference: { id: string | null; image_path: string } | null = null;
		if (referencePath && (!sourceGeneration || rehacerDeCero)) {
			const verdict = await checkReferencePath(referencePath, access, new URL(request.url).origin);
			if (!verdict.ok) return json({ error: verdict.error, ...(verdict.code ? { code: verdict.code } : {}) }, verdict.status);
			storedReference = { id: null, image_path: verdict.path };
		}
		if (referenceId && !sourceGeneration) {
			// Acá el cliente manda un id, no una ruta: la ruta sale de la tabla
			// curada, con derechos verificados. No se contrasta contra el
			// manifiesto de ganadores —son dos catálogos distintos— porque hacerlo
			// rechazaba referencias perfectamente válidas.
			const { data, error } = await admin.from('creative_references').select('id,image_path')
				.eq('id', referenceId).eq('template_id', templateId).eq('is_active', true)
				.in('rights_status', ['owned', 'licensed', 'public_domain']).maybeSingle();
			if (error) throw error;
			if (!data) return json({ error: 'La referencia no está disponible o todavía no tiene derechos verificados.' }, 400);
			storedReference = data;
		}

		// Techo de uso por hora: los créditos frenan el gasto de imágenes, pero
		// el análisis de layout con visión corre igual y cuesta plata. Las
		// cuentas ilimitadas (admin) quedan afuera del tope.
		if (!isUnlimited) {
			const withinLimit = await checkRateLimit(admin, auth.user.id, 'generate', 120, 3600, true);
			if (!withinLimit) return json({ error: 'Generaste muchas imágenes en poco tiempo. Esperá unos minutos.' }, 429);
		}

		const creditsNeeded = count * creditsPerImage;
		if (!isUnlimited) {
			const { data: reserveRes, error: creditError } = await admin.rpc('reserve_creative_credits', {
				p_user_id: auth.user.id,
				p_amount: creditsNeeded,
			});
			if (creditError) throw creditError;
			if (reserveRes === -1) return json({ error: `Necesitás ${creditsNeeded} ${creditsNeeded === 1 ? 'crédito' : 'créditos'} para esta generación.`, code: 'NO_CREDITS' }, 402);
			remaining = Number(reserveRes);
			reservedCount = creditsNeeded;
		}

		const batchId = crypto.randomUUID();
		// Título visible en el historial: el nombre del producto manda; si no hay,
		// el nombre del anuncio ganador elegido; recién después el de la plantilla.
		const generationTitle = storedProducts.length
			? storedProducts.map((item) => item.name).join(' + ')
			: (requestedTemplateName || templateName);
		const generationSettingsSnapshot = {
			format, language, imageType, preset, productIds, productNames: storedProducts.map((item) => item.name),
			// Qué fotos se eligieron: al rehacer desde el historial se vuelven a
			// mandar esas, y no todas las del producto.
			productPhotoPaths: fotosPedidas,
			colorMode, typoMode, brandSource,
			includeLogo,
			logoMode: logoMode || null,
			subjectMode,
			// De dónde salió el contenido: al regenerar se vuelve a la misma
			// fuente en vez de pedirla otra vez.
			sourceUrl: (storedProducts[0] as any)?.metadata?.sourceUrl
				|| (storedProducts[0] as any)?.product_url
				|| (sourceGeneration as any)?.settings_snapshot?.sourceUrl
				|| null,
			avatarId: avatarId || null,
			// La elección de persona queda guardada con la generación: al rehacerla
			// desde el historial se vuelve a armar el mismo aviso, y sin esto un
			// creativo pedido sin gente volvía con gente.
			personMode,
			lugarEscena: lugarEscena || null,
			pressRowMode,
			pressRowItems,
			avatarDescription: personaEscrita,
			// Las revisiones heredan el anuncio ganador de la imagen original.
			referencePath: storedReference?.image_path || (sourceGeneration as any)?.settings_snapshot?.referencePath || null,
			sourceGenerationId: sourceGeneration?.id || null,
			variationStrength: sourceGeneration ? variationStrength : null,
		};
		const generationRows = Array.from({ length: count }, (_, index) => ({
			user_id: auth.user!.id,
			template_id: templateId,
			reference_id: storedReference?.id || null,
			title: generationTitle,
			format,
			image_type: imageType,
			variant_key: preset,
			product_id: storedProducts[0]?.id && storedProducts[0].id !== 'manual' ? storedProducts[0].id : null,
			user_brief: brief || null,
			batch_id: batchId,
			output_index: index + 1,
			requested_outputs: count,
			settings_snapshot: generationSettingsSnapshot,
			status: 'processing',
		}));
		const { data: generations, error: insertError } = await admin.from('creative_generations')
			.insert(generationRows).select('id,output_index');
		if (insertError) throw insertError;
		const orderedGenerations = (generations || []).sort((a, b) => a.output_index - b.output_index);
		generationIds = orderedGenerations.map((item) => item.id);
		if (generationIds.length !== count) throw new Error('No se pudo preparar el lote completo.');

		const dbProducts = storedProducts.filter(p => p.id !== 'manual');
		if (dbProducts.length) {
			const joinRows = generationIds.flatMap((generationId) => dbProducts.map((item, index) => ({
				generation_id: generationId,
				product_id: item.id,
				user_id: auth.user!.id,
				sort_order: index,
			})));
			const { error } = await admin.from('creative_generation_products').insert(joinRows);
			if (error) throw error;
		}

		// ── Pipeline asíncrono ──────────────────────────────────────────────
		// La respuesta vuelve al instante con el batchId; el trabajo pesado
		// (análisis, copy, generación, upload) sigue en background con waitUntil.
		// El frontend sigue el progreso leyendo creative_generations por batch_id.
		const runPipeline = async () => {
		const pipelineStart = Date.now();
		const stamp = (label: string) => console.log(`[gen ${batchId}] ${label} +${Date.now() - pipelineStart}ms`);
		// inputBuffers alimenta a Gemini (inline_data); inputs a OpenAI (toFile).
		const inputBuffers: Array<{ buffer: Buffer; type: string }> = [];
		const inputs: Awaited<ReturnType<typeof fileToOpenAI>>[] = [];
		const inputImageMap: string[] = [];
		const pushInput = async (buffer: Buffer, type: string, name: string, label: string) => {
			inputBuffers.push({ buffer, type });
			inputs.push(await toFile(buffer, name, { type }));
			inputImageMap.push(label);
		};
		let hasReference = false;
		let hasSourceGeneration = false;
		let referenceBuffer: Buffer | null = null;
		let referenceMime = 'image/png';
		if (sourceGeneration?.output_path && !rehacerDeCero) {
			const { data: sourceBlob, error } = await admin.storage.from('creative-assets').download(sourceGeneration.output_path);
			if (error || !sourceBlob) throw error || new Error('No se pudo recuperar la imagen de referencia.');
			const sourceBuf = Buffer.from(await sourceBlob.arrayBuffer());
			await pushInput(sourceBuf, sourceBlob.type || 'image/png', 'source-generation.png', 'the previously generated ad to revise; this is the master composition reference');
			referenceBuffer = sourceBuf;
			referenceMime = sourceBlob.type || 'image/png';
			hasReference = true;
			hasSourceGeneration = true;
		} else if (storedReference?.image_path) {
			const { data: referenceBlob, error } = await admin.storage.from('creative-references').download(storedReference.image_path);
			if (error || !referenceBlob) throw error || new Error('No se pudo recuperar la referencia.');
			const normalizedReference = await normalizeImageInput(Buffer.from(await referenceBlob.arrayBuffer()));
			if (!normalizedReference) throw new Error('La imagen de referencia no se pudo procesar.');
			referenceBuffer = normalizedReference.buffer;
			referenceMime = normalizedReference.type;
			await pushInput(referenceBuffer, referenceMime, 'reference.png', 'the curated ad reference; use its selling structure and composition, never its original product identity');
			hasReference = true;
		}

		/** Las fotos guardadas de un producto, ya filtradas por lo que se eligió. */
		const fotosGuardadasDe = (storedProduct: any): string[] => {
			const todas = [...new Set([
				storedProduct.image_path,
				...(productImagesById.get(storedProduct.id) || []).map((row) => row.storage_path),
			].filter(Boolean) as string[])];
			return fotosPedidas ? todas.filter((path) => fotosPedidas.includes(path)) : todas;
		};

		const productInputPlan: Array<{ product: any; path: string; photoIndex: number }> = [];
		const productsUploaded = form.getAll('product').filter(p => p instanceof File && p.size > 0) as File[];
		const productVisionInputs: Array<{ buffer: Buffer; type: string }> = [];
		const indicesDeFotosDeProducto: number[] = [];
		// La identidad de cada foto, alineada con productVisionInputs: la ruta de
		// storage para las guardadas, `upload:N` para las subidas a mano. Es lo que
		// la pantalla usa para decir "estas viajaron" y para elegir otras.
		const clavesDeFotos: string[] = [];
		if (usesRealProducts) for (const storedProduct of storedProducts) {
			if (storedProduct.id === 'manual') continue;
			const paths = fotosGuardadasDe(storedProduct);
			// Un producto sin foto ya no corta la generación: se lo saltea. Lo que
			// se hace después depende de si quedó alguno con foto o ninguno.
			if (!paths.length) continue;
			productInputPlan.push({ product: storedProduct, path: paths[0], photoIndex: 1 });
		}

		/**
		 * Sin una sola foto, el anuncio habla del negocio.
		 *
		 * Pegar la URL de un sitio que no publica fotos de producto —una empresa
		 * de servicios, una fábrica, un estudio— terminaba en "todavía no tiene
		 * una foto disponible" y la generación se caía entera. Pero eso no es un
		 * error del usuario: es un sitio del que se puede hacer un aviso perfecto,
		 * solo que hablando del negocio y no de un artículo.
		 *
		 * Se conserva el ALCANCE que había elegido —si pidió algo general sigue
		 * siendo general— y solo se cambia lo que depende de tener fotos.
		 */
		if (usesRealProducts && !productInputPlan.length) {
			const degradado = subjectModeDesde(alcanceDesde(subjectMode), false);
			const motivo = fotosPedidas?.length === 0 ? 'se pidió sin ninguna foto' : 'ningún producto tiene foto';
			console.log(`[generate] ${motivo}: el anuncio pasa de ${subjectMode} a ${degradado}`);
			subjectMode = degradado;
			usesRealProducts = false;
		}
		if (usesRealProducts) for (const storedProduct of storedProducts) {
			if (storedProduct.id === 'manual') continue;
			if (productInputPlan.length >= 8) break;
			const paths = fotosGuardadasDe(storedProduct);
			// Todas las fotos que tenga el producto, hasta llenar el cupo. El tope por
			// producto era 5 mientras el total es 8: con UN solo producto sobraban
			// tres lugares y se tiraban fotos suyas que el escaneo ya había traído
			// —la url guarda hasta 24—. Cada vista que falta es una parte de la
			// prenda que el modelo tiene que suponer, y suponer es de donde salen
			// las capuchas que el producto no tiene. Con varios productos no cambia
			// nada: ahí el que corta es el total, no este tope.
			for (let index = 1; index < Math.min(paths.length, 8) && productInputPlan.length < 8; index += 1) {
				productInputPlan.push({ product: storedProduct, path: paths[index], photoIndex: index + 1 });
			}
		}
		// Revisión sutil: el usuario pidió un cambio puntual sobre una imagen ya
		// generada. Solo se manda la imagen original + el pedido; re-adjuntar
		// producto/logo/contexto hace que el modelo rediseñe todo.
		const hasNewProductInput = productIds.length > 0 || productsUploaded.length > 0 || Boolean(manualProductName);
		const isExactRevision = hasSourceGeneration && variationStrength === 'exact' && Boolean(brief) && !hasNewProductInput;

		let primaryProductBuffer: Buffer | null = null;
		let primaryProductMime = 'image/png';
		if (!isExactRevision && productInputPlan.length) {
			// Las fotos de producto son independientes entre sí: bajarlas y
			// normalizarlas en paralelo en vez de una por una ahorra segundos
			// reales cuando hay varias fotos (varios productos o varios ángulos).
			const normalizedPhotos = await Promise.all(productInputPlan.map(async (item) => {
				const { data: productBlob, error } = await admin.storage.from('creative-assets').download(item.path);
				if (error || !productBlob) throw error || new Error(`No se pudo recuperar una foto de ${item.product.name}.`);
				const normalized = await normalizeImageInput(Buffer.from(await productBlob.arrayBuffer()));
				return { item, normalized };
			}));
			for (const { item, normalized } of normalizedPhotos) {
				if (!normalized) continue; // foto ilegible: no puede tumbar la generación
				if (normalized) productVisionInputs.push(normalized);
				clavesDeFotos.push(item.path);
				if (!primaryProductBuffer) {
					primaryProductBuffer = normalized.buffer;
					primaryProductMime = normalized.type;
				}
				indicesDeFotosDeProducto.push(inputBuffers.length);
				await pushInput(normalized.buffer, normalized.type, `product-${item.product.id}-${item.photoIndex}.png`, `verified photo ${item.photoIndex} of the SAME real product SKU “${item.product.name}”; preserve exact geometry, proportions, construction, packaging, label, material, texture, color and physical side orientation`);
			}
		}
		if (!isExactRevision && !productIds.length && productsUploaded.length > 0) {
			for (let idx = 0; idx < productsUploaded.length; idx++) {
				const fileObj = productsUploaded[idx];
				const normalized = await normalizeImageInput(Buffer.from(await fileObj.arrayBuffer()));
				if (normalized) { productVisionInputs.push(normalized); clavesDeFotos.push(`upload:${idx}`); }
				if (!normalized) throw new Error('La foto del producto no se pudo procesar. Probá con otra imagen.');
				if (!primaryProductBuffer) {
					primaryProductBuffer = normalized.buffer;
					primaryProductMime = normalized.type;
				}
				indicesDeFotosDeProducto.push(inputBuffers.length);
				await pushInput(normalized.buffer, normalized.type, `product-${idx}.png`, `verified photo ${idx + 1} of the SAME real product supplied by the user; preserve exact geometry, proportions, construction, packaging, label, material, texture, color and physical side orientation`);
			}
		}

		const hasUploadedProduct = productsUploaded.length > 0;

		let hasLogo = false;
		// El archivo se adjunta SOLO si se va a dibujar. Con la firma escrita el
		// logo llegaba igual "como referencia de color", y el modelo lo terminaba
		// pegando: si no está entre las imágenes de entrada, no hay nada que pegar.
		if (!(logoMode ? logoMode === 'imagen' : includeLogo) || isExactRevision || brandSource === 'none') {
			// El usuario pidió firma escrita o sin firma: no se adjunta ningún archivo.
		} else if (logo instanceof File && logo.size > 0) {
			const normalized = await normalizeImageInput(Buffer.from(await logo.arrayBuffer()));
			if (normalized) {
				await pushInput(normalized.buffer, normalized.type, 'logo.png', 'the official brand logo; reproduce it accurately once');
				hasLogo = true;
			}
		} else if (urlLogoUrl && (brandOverride?.logoUrl || brandSource === 'url')) {
			// El logo del sitio viene como URL sacada del HTML de un sitio que
			// elige el usuario: es una URL hostil por definición. Va por
			// safeExternalFetch, que bloquea redes privadas y metadata de la
			// nube, y con lectura acotada. Si sale sucio se sigue sin logo antes
			// que arruinar el aviso.
			try {
				const logoResponse = await safeExternalFetch(urlLogoUrl, { headers: { accept: 'image/*' } });
				if (logoResponse.ok) {
					const raw = Buffer.from(await readLimited(logoResponse, 4_000_000));
					if (raw.length > 500 && raw.length < 4_000_000) {
						const normalized = await normalizeImageInput(raw);
						if (normalized) {
							await pushInput(normalized.buffer, normalized.type, 'logo.png', 'the official brand logo; reproduce it accurately once');
							hasLogo = true;
						}
					}
				}
			} catch (logoError) {
				console.warn('No se pudo bajar el logo del sitio:', logoError);
			}
		} else if (brandSource === 'mine' && profile?.logo_path) {
			const { data: logoBlob } = await admin.storage.from('creative-assets').download(profile.logo_path);
			const normalized = logoBlob ? await normalizeImageInput(Buffer.from(await logoBlob.arrayBuffer())) : null;
			// Un logo ilegible se omite: nunca puede tumbar la generación entera.
			if (normalized) {
				await pushInput(normalized.buffer, normalized.type, 'logo.png', 'the official brand logo; reproduce it accurately once');
				hasLogo = true;
			}
		}

		let avatarReferenceImages: Array<{ buffer: Buffer; type: string }> = [];
		// "Yo la describo" no adjunta ninguna foto: lo único que viaja al prompt es
		// el texto que escribió el usuario, por el mismo campo que ya usaba el
		// avatar guardado para pasar su descripción.
		let avatarDescription = personaEscrita;
		if (personMode === 'upload' && avatarId) {
			const avatar = await resolveAvatarReferences({ admin, userId: auth.user!.id, mode: 'saved', avatarId });
			avatarReferenceImages = avatar.images;
			avatarDescription = avatar.description || avatar.name;
			for (const [index, image] of avatarReferenceImages.entries()) {
				await pushInput(image.buffer, image.type, `avatar-${index + 1}.png`, `reference photo ${index + 1} of the same selected person/avatar; preserve identity consistently`);
			}
		}

		stamp(`inputs listos (${inputBuffers.length} imágenes)`);

		// Formato 'original': tomar la proporción real del anuncio de referencia.
		let effectiveFormat = format;
		if (format === 'original') {
			effectiveFormat = '1:1';
			if (referenceBuffer) {
				try {
					const sharp = (await import('sharp')).default;
					const metadata = await sharp(referenceBuffer).metadata();
					if (metadata.width && metadata.height) effectiveFormat = closestFormat(metadata.width / metadata.height);
				} catch { /* sin metadata: cuadrado */ }
			}
		}

		// Análisis de layout + copy con visión: lee el ganador completo antes de
		// generar. Incluye estrategia, zonas de texto, idioma, personas, producto y
		// composición. Si el usuario ya aprobó/editó el plan, se usa ese resultado.
		const urlDelProducto: string | null = (storedProducts[0] as any)?.metadata?.sourceUrl
			|| (storedProducts[0] as any)?.product_url
			|| (sourceGeneration as any)?.settings_snapshot?.sourceUrl
			|| null;
		let layoutAnalysis: LayoutAnalysis | null = approvedPlan;
		// Cómo se ve el producto y a quién le habla: los dos análisis no dependen
		// entre sí, así que este arranca antes y se espera junto con el otro.
		const lecturaPendiente = (!isExactRevision && productVisionInputs.length)
			? leerElProducto({ openAIKey, googleKey }, {
				fotos: productVisionInputs.map((foto) => ({ buffer: foto.buffer, type: foto.type })),
				nombre: storedProducts.map((item) => item.name).filter(Boolean).join(' + '),
				datos: storedProducts.map((item) => item.description).filter(Boolean).join('\n') || brief,
				url: urlDelProducto || undefined,
			})
			: Promise.resolve(null);
		const verifiedProductFacts = storedProducts.map((item) => [
			item.description,
			item.price_text && `${item.price_text} ${item.currency || ''}`,
			item.analysis?.category,
		].filter(Boolean).join(' · '));
		if (!layoutAnalysis && hasReference && referenceBuffer && (!isExactRevision)) {
			try {
				const productFacts = verifiedProductFacts.join('\n') || brief;
				layoutAnalysis = await analyzeReferenceLayout({ openAIKey, googleKey }, {
					referenceB64: referenceBuffer.toString('base64'),
					referenceMime,
					productB64: primaryProductBuffer?.toString('base64'),
					productMime: primaryProductBuffer ? primaryProductMime : undefined,
					productName: storedProducts[0]?.name || 'the product in the supplied photo',
					productFacts,
					productImages: productVisionInputs.map((photo) => ({ b64: photo.buffer.toString('base64'), mime: photo.type })),
					brandName: effectiveBrandName || clean(form.get('brandName'), 80),
					language,
					subjectMode,
					avatarImages: avatarReferenceImages.map((photo) => ({ b64: photo.buffer.toString('base64'), mime: photo.type })),
					avatarDescription,
					brandPalette: effectiveBrandPalette,
				});
			} catch (analysisErr) {
				console.error('Layout analysis failed, continuing with visual generation:', analysisErr);
			}
		}
		stamp(`análisis visual ${approvedPlan ? 'aprobado por el usuario' : layoutAnalysis ? 'ok' : 'sin resultado'}`);

		const lectura = await lecturaPendiente;
		/**
		 * Qué fotos del producto llegan al motor.
		 *
		 * El default es el de b8ded8c: TODAS. Quedan afuera solo las que muestran
		 * una persona —OpenAI rechaza el pedido ENTERO si sospecha un cuerpo en
		 * ropa interior— y la única excepción es la galería que es 100% placas de
		 * diseño, que no manda ninguna y se rehace como packshot (ver clon-libre).
		 *
		 * Si el usuario eligió fotos a mano, su elección REEMPLAZA al default —
		 * mismo patrón que la persona y el logo. El filtro de persona se aplica
		 * igual sobre lo elegido, porque protege al pedido entero y no a una foto;
		 * si la elección queda vacía después de eso, rige el default: nadie se
		 * queda sin fotos por un checkbox.
		 */
		// Lo elegido en la revisión ya limitó QUÉ se descargó; acá vuelve a entrar
		// para que el filtro automático no vuelva a sacar una foto que el usuario
		// pidió expresamente. `fotosElegidas` queda como estaba para quien lo mande.
		const eleccionManual = fotosPedidas?.length ? fotosPedidas : parseFotosElegidas(form.get('fotosElegidas'));
		const porEleccion = eleccionManual
			? productVisionInputs.map((_, i) => i).filter((i) =>
				eleccionManual.includes(clavesDeFotos[i]) && !(lectura?.conPersona || []).includes(i))
			: null;
		const fotosQueSeQuedan = porEleccion?.length
			? new Set(porEleccion)
			: new Set(
				fotosParaElMotor(productVisionInputs.map((f) => ({ buffer: f.buffer, type: f.type })), lectura || { mejores: [], graficas: [], conPersona: [] })
					.map((elegida) => productVisionInputs.findIndex((f) => f.buffer === elegida.buffer)),
			);
		if (porEleccion?.length) stamp(`el usuario eligió ${porEleccion.length} foto(s) del producto a mano`);
		const aCortar = indicesDeFotosDeProducto
			.map((posicion, i) => (fotosQueSeQuedan.has(i) ? -1 : posicion))
			.filter((posicion) => posicion >= 0);
		if (aCortar.length) {
			for (const i of [...aCortar].sort((a, b) => b - a)) {
				inputBuffers.splice(i, 1);
				inputs.splice(i, 1);
				inputImageMap.splice(i, 1);
			}
			stamp(`${aCortar.length} foto(s) del producto quedaron fuera del render`);
		}
		/**
		 * Sin una sola foto limpia se fabrica una.
		 *
		 * Es el caso de las tiendas cuya galería son todas placas promocionales:
		 * mandarlas es peor que no mandar nada, porque el motor clona el diseño de la
		 * tienda. `refotografiarProducto` re-fotografía el objeto solo sobre fondo
		 * neutro y sin una letra encima.
		 */
		let packshotPath: string | null = null;
		if (!fotosQueSeQuedan.size && productVisionInputs.length && !isExactRevision
			&& lectura && todasSonPlacas(productVisionInputs.map((f) => ({ buffer: f.buffer, type: f.type })), lectura)) {
			const packshot = await refotografiarProducto({ openAIKey, googleKey }, productVisionInputs[0], lectura?.aspecto);
			if (packshot) {
				await pushInput(packshot.buffer, packshot.type, 'producto-en-estudio.png', 'the product re-photographed on its own, clean, with no text or graphics: this is the product to show');
				stamp('ninguna foto limpia del producto: se rehízo una en estudio');
				// Se guarda para poder MOSTRARLA: sin esto el aviso sale con un
				// objeto que el usuario nunca subió y no hay forma de ver de dónde
				// salió. Si el upload falla, la generación sigue igual.
				try {
					const ruta = `${auth.user!.id}/packshots/${batchId}.png`;
					const { error: packshotUploadError } = await admin.storage.from('creative-assets')
						.upload(ruta, packshot.buffer, { contentType: 'image/png', upsert: true });
					if (!packshotUploadError) packshotPath = ruta;
					else console.error('[generate] no se pudo guardar el packshot:', packshotUploadError);
				} catch (packshotError) {
					console.error('[generate] no se pudo guardar el packshot:', packshotError);
				}
			}
		}
		/**
		 * Qué viajó al motor, dicho con las claves que la pantalla conoce. Va al
		 * snapshot de la generación para que "estas fotos se usaron" y "el
		 * producto se recreó por IA" se puedan mostrar tal cual, sin adivinar.
		 */
		const fotosDelProducto = {
			total: productVisionInputs.length,
			viajaron: [...fotosQueSeQuedan].sort((a, b) => a - b).map((i) => clavesDeFotos[i]).filter(Boolean),
			eleccionManual: Boolean(porEleccion?.length),
			packshotPath,
		};

		const hasTargetProductInput = storedProducts.length > 0 || hasUploadedProduct || productVisionInputs.length > 0;
		const useClonePrompt = hasReference && (!hasSourceGeneration || hasNewProductInput) && fidelity === 1
			&& (hasTargetProductInput || layoutAnalysis?.referenceHasProduct === false);

		const revisionPrompt = `The input image is a FINISHED advertisement. Reproduce it EXACTLY — same layout, same texts, same colors, same product, same typography, same background, every single detail identical — applying ONLY this modification:

${brief}

Rules:
- Change ONLY what the modification asks. Everything else must remain pixel-faithful to the input image.
- Do not add publication copy, CTA buttons, offers, prices, URLs or social handles.
The result must look like the same image with only that one adjustment applied.`;

		// El prompt clon lo arma el módulo compartido con los lotes y carruseles:
		// una sola definición para las tres formas de generar.
		const cloneInput = {
			productNames: storedProducts.map((item) => item.name),
			productFacts: verifiedProductFacts,
			brandName: effectiveBrandName || clean(form.get('brandName'), 80),
			brief: effectiveBrief,
			language,
			subjectMode,
			colorMode,
			typoMode,
			brandColors: effectiveBrandColors,
			brandTypography: effectiveBrandTypography,
			brandPalette: effectiveBrandPalette,
			personMode,
			logoMode,
			lugarElegido: lugarEscena || undefined,
			pressRowMode,
			pressRowItems,
			avatarDescription,
			avatarImageCount: avatarReferenceImages.length,
			productUrl: urlDelProducto || undefined,
			rolesDeColor: parseRolesDeColor(form.get('rolesDeColor')) || undefined,
			logoUrl: urlLogoUrl || undefined,
			storeDescription: effectiveBrandSummary || undefined,
			productCategory: storedProducts[0]?.analysis?.category || undefined,
			lectura,
		};
		const prompt = isExactRevision ? revisionPrompt : useClonePrompt
			? buildClonePrompt(cloneInput, layoutAnalysis, hasLogo)
			: buildPrompt({
			templateName,
			purpose: templatePurpose,
			usageHint: templateUsageHint,
			preset,
			brandName: effectiveBrandName || clean(form.get('brandName'), 80),
			colors: effectiveBrandColors.length ? effectiveBrandColors.join(', ') : clean(form.get('colors'), 80),
			brandSummary: effectiveBrandSummary,
			brandVoice: effectiveBrandVoice,
			targetAudience: profile?.target_audience || '',
			typography: effectiveBrandTypography
				? [effectiveBrandTypography.headings && `Headings: ${effectiveBrandTypography.headings}`, effectiveBrandTypography.body && `Body: ${effectiveBrandTypography.body}`].filter(Boolean).join(' · ')
				: '',
			styleSummary: effectiveStyleSummary,
			brandPersonality: effectiveBrandPersonality,
			products: storedProducts.map((item) => ({
				name: item.name,
				description: [item.description, item.price_text && `${item.price_text} ${item.currency || ''}`, item.analysis?.category].filter(Boolean).join(' · '),
			})),
			imageType,
			brief: effectiveBrief,
			format,
			hasLogo,
			hasReference,
			hasSourceGeneration,
			hasUploadedProduct,
			variationStrength,
			replaceProduct: Boolean(hasSourceGeneration && sourceGeneration?.product_id !== (storedProducts[0]?.id || null)),
			inputImageMap,
			adCopy: layoutAnalysis?.adCopy,
		});
		// Junto con el prompt se guarda qué fotos viajaron (y el packshot si se
		// fabricó): el snapshot se insertó antes de armar las imágenes, así que
		// esto lo completa con lo que efectivamente pasó.
		const { error: promptUpdateError } = await admin.from('creative_generations')
			.update({ prompt, settings_snapshot: { ...generationSettingsSnapshot, fotosDelProducto } }).in('id', generationIds);
		if (promptUpdateError) throw promptUpdateError;
		stamp('prompt construido y guardado');

		// ── Generación ──────────────────────────────────────────────────────
		// Mismo motor que el generador por lote: gpt-image-2 medium, con Gemini de
		// respaldo. Antes el Studio tenía su propia cadena — Gemini primero y
		// gpt-image-1 después — así que la misma referencia daba peor texto acá que
		// en el lote. Ahora las dos pantallas generan igual.
		// Cada imagen del lote es independiente (mismo prompt/insumos, sin
		// estado compartido): generarlas en paralelo en vez de una por una es
		// la diferencia entre esperar N veces el tiempo de una sola imagen o
		// esperar solo una vez.
		const tier = pickQualityTier(layoutAnalysis).tier;
		// Se deja constancia de lo que se pidió ANTES de pedirlo: si el motor se
		// cuelga o el proceso muere, el intento igual quedó registrado. Midiendo
		// solo los finales, un problema del motor se ve como menos demanda.
		void trackEvent(admin, 'generacion_pedida', auth.user!.id, { cantidad: count, formato: effectiveFormat, tier, sujeto: subjectMode }, {}, navegador);
		/**
		 * Una imagen que falla no se lleva puestas a las que sí salieron.
		 *
		 * Esto era `Promise.all`: alcanzaba con que UNA de las cinco diera error
		 * —un 500 del motor, un filtro de contenido, un corte de red— para que la
		 * promesa entera se rechazara, se descartaran las cuatro imágenes que ya
		 * estaban generadas y el lote completo quedara marcado como fallido. El
		 * usuario esperaba dos minutos para no recibir nada, y las cuatro
		 * generaciones buenas se pagaron igual en la API.
		 *
		 * Con `allSettled` se conserva lo que salió bien. Las que faltan las cierra
		 * y las reembolsa el bloque de `missingCount` de más abajo, que ya existía
		 * para este caso y hasta ahora era inalcanzable.
		 */
		const resultados = await Promise.allSettled(Array.from({ length: count }, async (_, index) => {
			const { buffer, engine, usage } = await generateAdImage({
				googleKey,
				openAIKey,
				prompt,
				// Cuando OpenAI rechaza el pedido por su filtro, el motor reintenta con
				// esta versión antes de cambiar de motor. Es null si no hay nada que
				// sacar, y entonces el reintento ni se intenta.
				promptDeRespaldo: (isExactRevision || !useClonePrompt)
					? undefined
					: buildClonePromptDeRespaldo({ ...cloneInput, lectura }, hasLogo) || undefined,
				images: inputBuffers,
				format: effectiveFormat,
				tier,
			});
			stamp(`imagen ${index + 1}/${count} generada con ${engine}${usage ? ` (${usage.salida} tokens de salida)` : ''}`);
			// El consumo que informa el motor es lo único que permite costear un
			// creativo sin ir al panel de OpenAI. Venía en cada respuesta y se
			// descartaba, así que no había forma de saber cuánto cuesta una imagen.
			void trackEvent(admin, 'generacion_lista', auth.user!.id, {
				motor: engine,
				formato: effectiveFormat,
				tier,
				promptCaracteres: prompt.length,
				...(usage ? { tokensEntrada: usage.entrada, tokensSalida: usage.salida, tokensEntradaImagen: usage.entradaImagen, tokensEntradaTexto: usage.entradaTexto } : {}),
			}, {}, navegador);
			return buffer;
		}));
		const outputBuffers: Buffer[] = [];
		for (const resultado of resultados) {
			if (resultado.status === 'fulfilled') outputBuffers.push(resultado.value);
			else console.error(`[gen ${batchId}] una imagen del lote falló:`, resultado.reason);
		}

		// Si no salió ninguna sí es una falla del lote entero: la maneja el catch,
		// que cierra todo y devuelve los créditos. Se propaga el motivo real del
		// primer intento en vez de un mensaje genérico.
		if (!outputBuffers.length) {
			const primerFallo = resultados.find((resultado) => resultado.status === 'rejected');
			throw primerFallo && primerFallo.status === 'rejected'
				? (primerFallo.reason instanceof Error ? primerFallo.reason : new Error(String(primerFallo.reason)))
				: new Error('No se generaron imágenes.');
		}

		// Subida + firma + update de cada imagen tampoco depende de las demás:
		// en paralelo también, y con el mismo criterio — si una subida falla, las
		// otras se entregan igual.
		const uploadCount = Math.min(outputBuffers.length, generationIds.length);
		const uploadResults = await Promise.allSettled(Array.from({ length: uploadCount }, async (_, index) => {
			const generationId = generationIds[index];
			const outputPath = `${auth.user!.id}/generations/${batchId}/${index + 1}.png`;
			const { error: uploadError } = await admin.storage.from('creative-assets').upload(
				outputPath,
				outputBuffers[index],
				{ contentType: 'image/png', upsert: false },
			);
			if (uploadError) throw uploadError;
			const { data: signed, error: signedError } = await admin.storage.from('creative-assets').createSignedUrl(outputPath, 60 * 60);
			if (signedError || !signed?.signedUrl) {
				await admin.storage.from('creative-assets').remove([outputPath]);
				throw signedError || new Error('No se pudo firmar la imagen generada.');
			}
			const { error: completionError } = await admin.from('creative_generations').update({
				status: 'completed',
				output_path: outputPath,
				settings_snapshot: {
					...generationSettingsSnapshot,
					creative: layoutAnalysis?.creative || null,
				},
				completed_at: new Date().toISOString(),
			}).eq('id', generationId);
			if (completionError) {
				await admin.storage.from('creative-assets').remove([outputPath]);
				throw completionError;
			}
			completedIds.add(generationId);
			return { id: generationId, imageUrl: signed.signedUrl, outputIndex: index + 1, batchId };
		}));
		const responseGenerations: Array<{ id: string; imageUrl: string; outputIndex: number; batchId: string }> = [];
		for (const resultado of uploadResults) {
			if (resultado.status === 'fulfilled') responseGenerations.push(resultado.value);
			else console.error(`[gen ${batchId}] una imagen no se pudo guardar:`, resultado.reason);
		}
		stamp(`completado: ${responseGenerations.length}/${count} imágenes subidas`);

		const missingCount = count - responseGenerations.length;
		if (missingCount > 0) {
			const missingIds = generationIds.filter((id) => !completedIds.has(id));
			// Solo se reembolsa lo que este llamado logró cerrar: si el barrido de
			// colgadas ya cerró alguna de estas filas, ya devolvió ese crédito.
			const closed = await closeGenerationsAndCountRefunds(
				admin, auth.user!.id, missingIds, 'La API devolvió menos imágenes de las solicitadas.',
			);
			if (reservedCount > 0 && closed.length) {
				const missingRefund = Math.min(reservedCount, closed.length * creditsPerImage);
				const { error: missingRefundError } = await admin.rpc('refund_creative_credits', { p_user_id: auth.user!.id, p_amount: missingRefund });
				if (missingRefundError) throw missingRefundError;
				reservedCount -= missingRefund;
			}
		}
		};

		const pipelinePromise = runPipeline().catch(async (error) => {
			const message = error instanceof Error ? error.message : 'No se pudo generar el creativo.';
			console.error('Generation pipeline failed:', error);
			const failedIds = generationIds.filter((id) => !completedIds.has(id));
			const closed = await closeGenerationsAndCountRefunds(admin, auth.user!.id, failedIds, message);
			const refundAmount = Math.min(
				Math.max(0, reservedCount - completedIds.size * creditsPerImage),
				closed.length * creditsPerImage,
			);
			if (refundAmount > 0) {
				const { error: refundError } = await admin.rpc('refund_creative_credits', { p_user_id: auth.user!.id, p_amount: refundAmount });
				if (refundError) console.error('Credit refund also failed:', refundError);
			}
		});
		try { waitUntil(pipelinePromise); } catch { /* dev local: el server queda vivo y la promesa continúa */ }

		return json({
			async: true,
			batchId,
			generations: orderedGenerations.map((item) => ({ id: item.id, outputIndex: item.output_index, batchId })),
			creditsRemaining: isUnlimited ? 99999 : remaining,
		}, 202);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'No se pudo generar el creativo.';
		console.error('[generate]', error);
		const failedIds = generationIds.filter((id) => !completedIds.has(id));
		// Las fallas se contaban solas en la tabla de generaciones, pero no en la
		// serie de eventos, así que en las métricas una caída del motor se veía
		// como un bajón de demanda y no como lo que era.
		void trackEvent(admin, 'generacion_fallida', auth.user.id, { motivo: message.slice(0, 300), cantidad: failedIds.length }, {}, navegador);
		const closed = await closeGenerationsAndCountRefunds(admin, auth.user.id, failedIds, message);
		const refundAmount = Math.min(
			Math.max(0, reservedCount - completedIds.size * creditsPerImage),
			closed.length * creditsPerImage,
		);
		const { error: refundError } = refundAmount > 0
			? await admin.rpc('refund_creative_credits', { p_user_id: auth.user.id, p_amount: refundAmount })
			: { error: null };
		if (refundError) console.error('[generate] refund falló', refundError);
		return json({
			error: refundError
				? 'No pudimos terminar la generación ni devolver los créditos automáticamente. Contactá a soporte.'
				: 'No pudimos terminar esta generación. Los créditos no usados fueron devueltos.',
		}, 500);
	}
};
