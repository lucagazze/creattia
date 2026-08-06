import { useReferenceUrls } from '../../lib/creattia/reference-urls';
import React, { useState, useEffect } from 'react';
import { BatchSelect, LANGUAGE_OPTIONS, STYLE_OPTIONS, BRAND_OPTIONS, BrandOptionIcon, driveBatchWorkers } from './UrlBatchSection';
import ProductAssetReview, { type ProductReviewItem } from './ProductAssetReview';

// ─────────────────────────────────────────────────────────────────────────────
// Página completa de creación fiel al ganador (reemplaza el modal). Mismo
// wizard paso a paso que el generador por lote (UrlBatchSection): un tema por
// pantalla, con la misma barra de progreso, tabs, pills y botones.
// Pasos: 1) producto  2) formato  3) estilo visual → analizar referencia → generar.
// ─────────────────────────────────────────────────────────────────────────────

// Formatos visuales del paso 2, mismos valores que ya entiende el backend de
// generación individual (distintos de los alias del lote, pero mismo diseño).
const FORMAT_ITEMS = [
	{ id: 'original', text: 'Original', desc: 'Igual al ganador', shape: 'original' },
	{ id: '1:1', text: '1:1', desc: 'Feed', shape: 'square' },
	{ id: '3:4', text: '3:4', desc: 'Vertical', shape: 'portrait' },
	{ id: '9:16', text: '9:16', desc: 'Historia', shape: 'story' },
	{ id: '4:3', text: '4:3', desc: 'Horizontal', shape: 'landscape' },
	{ id: '16:9', text: '16:9', desc: 'Panorámico', shape: 'wide' },
];

export default function CreationFlow({ ad, session, onToast, onGenerationStarted, onGenerationRequested, onBack }: {
	ad: any;
	session: any;
	onToast?: (message: string) => void;
	onGenerationStarted?: (batch: { batchId: string; title: string; referenceUrl?: string; count: number }) => void;
	onGenerationRequested?: () => void;
	onBack: () => void;
}) {
	const token = session?.access_token || '';

	// Al entrar a este flujo (p.ej. desde la mitad de la grilla en mobile) hay
	// que verse a uno mismo arriba de todo, no quedar scrolleado donde estaba
	// la tarjeta que se tocó.
	useEffect(() => {
		window.scrollTo(0, 0);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// El bucket de referencias es privado: las URLs las firma el servidor.
	// Se piden juntas la portada y todas las páginas del carrusel.
	const signedReferenceUrls = useReferenceUrls([
		ad.imagePath,
		...(Array.isArray(ad.metadata?.carouselImages) ? ad.metadata.carouselImages : []),
	]);
	const referenceUrlFor = (path: string) => (path.startsWith('http') ? path : signedReferenceUrls[path] || '');
	const referenceUrl = referenceUrlFor(ad.imagePath);

	// Carrusel ganador: varias páginas para elegir cómo generar.
	const carouselSlides: string[] = ad.metadata?.mediaType === 'carousel' && Array.isArray(ad.metadata?.carouselImages) && ad.metadata.carouselImages.length > 1
		? ad.metadata.carouselImages
		: [];
	const isCarouselAd = carouselSlides.length > 0;
	const [carouselMode, setCarouselMode] = useState<'full' | 'single'>('full');
	const [carouselSameProduct, setCarouselSameProduct] = useState(true);
	const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
	const [carouselStarting, setCarouselStarting] = useState(false);
	const wantsFullCarousel = isCarouselAd && carouselMode === 'full';
	// La página que se clona cuando se elige "solo una página": el resto del
	// flujo de revisión visual funciona exactamente igual que un anuncio suelto.
	const effectiveReferencePath = isCarouselAd && carouselMode === 'single' ? carouselSlides[selectedSlideIndex] : ad.imagePath;
	// La vista grande de la izquierda: en un carrusel siempre muestra la
	// página que se está mirando (se puede pasar de página para verlas
	// todas), sea cual sea el modo elegido.
	const previewSlidePath = isCarouselAd ? carouselSlides[selectedSlideIndex] : ad.imagePath;
	const previewUrl = referenceUrlFor(previewSlidePath);
	const goToPreviewSlide = (delta: number) => {
		if (!isCarouselAd) return;
		setSelectedSlideIndex((prev) => (prev + delta + carouselSlides.length) % carouselSlides.length);
	};

	// Precarga todas las páginas del carrusel apenas se entra a este flujo,
	// para que pasar de página con las flechas sea instantáneo.
	useEffect(() => {
		if (!isCarouselAd) return;
		carouselSlides.forEach((slide) => { const img = new Image(); img.src = referenceUrlFor(slide); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isCarouselAd]);

	// Cómo cargar el producto: por URL(s), a mano (con archivos), o sin producto.
	const [productMode, setProductMode] = useState<'url' | 'manual'>('url');
	/**
	 * Producto físico o servicio/SaaS. Ya no se pregunta: lo detecta la IA al
	 * analizar la URL. Preguntarlo obligaba al usuario a clasificar algo que la
	 * página ya dice sola, y si se equivocaba el creativo terminaba pidiendo una
	 * foto de producto que no existe.
	 */
	const [detectedOffering, setDetectedOffering] = useState<'product' | 'service' | 'catalog'>('product');
	const isService = detectedOffering === 'service';
	/** La URL era la home de la tienda o una categoría: el anuncio habla del negocio. */
	const isCatalog = detectedOffering === 'catalog';
	const [urls, setUrls] = useState<string[]>(['']);
	const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
	const [importedProducts, setImportedProducts] = useState<ProductReviewItem[]>([]);
	const [uploadFiles, setUploadFiles] = useState<File[]>([]);
	const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);
	const [parsingDoc, setParsingDoc] = useState(false);

	const [format, setFormat] = useState('original');
	const [language, setLanguage] = useState('es');
	const [colorMode, setColorMode] = useState<'winner' | 'url' | 'brand'>('winner');
	/**
	 * Corrección manual de los colores detectados. La detección se confunde
	 * —agarra el gris de un banner o el color del aviso de cookies— y sin esto
	 * el creativo salía con una identidad que no era la de la marca.
	 */
	const [paletteOverride, setPaletteOverride] = useState<Record<string, string>>({});
	const detectedPalette: Record<string, string> | null = (() => {
		if (colorMode === 'winner') return null;
		const fromUrl = (importedProducts[0] as any)?.metadata?.brandFromUrl?.palette;
		return fromUrl || null;
	})();
	const [typoMode, setTypoMode] = useState<'winner' | 'url' | 'brand'>('winner');
	const [brandSource, setBrandSource] = useState('url');
	const [includeLogo, setIncludeLogo] = useState(false);
	// Carrusel completo: en cuáles páginas va el logo. Vacío = en ninguna.
	const [logoCarouselPages, setLogoCarouselPages] = useState<Set<number>>(new Set());
	const count = wantsFullCarousel ? carouselSlides.length : 1;
	const [manualProductName, setManualProductName] = useState('');
	const [manualProductFacts, setManualProductFacts] = useState('');
	type SavedAvatarOption = { id: string; name: string; description?: string | null; imageCount?: number; coverUrl?: string; images?: Array<{ url: string }> };
	const [savedAvatars, setSavedAvatars] = useState<SavedAvatarOption[]>([]);
	const [avatarMode, setAvatarMode] = useState<'none' | 'saved' | 'upload'>('none');
	const [selectedAvatarId, setSelectedAvatarId] = useState('');
	const [avatarFiles, setAvatarFiles] = useState<File[]>([]);
	const [avatarPreviews, setAvatarPreviews] = useState<string[]>([]);
	const [avatarConsent, setAvatarConsent] = useState(false);

	// El armado es secuencial, como en el lote: 1 producto, 2 formato, 3 estilo.
	const [formStep, setFormStep] = useState<1 | 2 | 3>(1);
	const [phase, setPhase] = useState<'setup' | 'planning' | 'review' | 'starting'>('setup');
	const [copyMode, setCopyMode] = useState<'auto' | 'edit'>('auto');
	useEffect(() => {
		if (phase !== 'review' || !token) return;
		let cancelled = false;
		void fetch('/api/creativos/avatars', { headers: { authorization: `Bearer ${token}` } })
			.then((response) => response.ok ? response.json() : null)
			.then((payload) => { if (!cancelled && Array.isArray(payload?.avatars)) setSavedAvatars(payload.avatars); })
			.catch(() => { /* la generación sigue funcionando sin avatares */ });
		return () => { cancelled = true; };
	}, [phase, token]);
	const [plan, setPlan] = useState<any>(null);
	const [zones, setZones] = useState<Array<{ where?: string; messageRole?: string; original?: string; replacement?: string; onProduct?: boolean }>>([]);
	const [people, setPeople] = useState<Array<{ where?: string; role?: string; description?: string; directive?: string }>>([]);
	const [comparisons, setComparisons] = useState<Array<{ where?: string; role?: string; description?: string; directive?: string }>>([]);
	const [creativeDecisions, setCreativeDecisions] = useState<Array<{ type?: string; title?: string; where?: string; description?: string; question?: string; defaultStrategy?: string; confidence?: string; directive?: string }>>([]);
	const [comparisonGuidance, setComparisonGuidance] = useState('');
	const [error, setError] = useState('');
	const chip = (active: boolean) => ({
		padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
		border: active ? '2px solid #744bde' : '1px solid #e2dde9', background: active ? '#f4f2f6' : '#fff', color: active ? '#744bde' : '#3f3a48',
	} as const);

	const label = { display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '9px', letterSpacing: '.01em' } as const;
	// Carrusel completo con productos distintos: 1 URL por página, en orden.
	// El resto de los casos (mismo producto, o solo una página) piden 1 solo.
	const urlsNeeded = wantsFullCarousel && !carouselSameProduct ? carouselSlides.length : 1;
	const filledUrls = urls.map((u) => u.trim()).filter(Boolean).length;
	const step1Ready = (productMode === 'url' && filledUrls >= urlsNeeded)
		
		|| (productMode === 'manual' && manualProductName.trim() && !(wantsFullCarousel && !carouselSameProduct));
	const comparisonInfo = plan?.comparison || {};
	const comparisonDetected = comparisons.length > 0 || comparisonInfo.detected === true;
	const comparisonTitle = comparisonInfo.type === 'us-vs-them'
		? 'Detectamos un “Nosotros vs. Ellos”'
		: comparisonInfo.type === 'before-after'
			? 'Detectamos una comparación antes y después'
			: comparisonInfo.type === 'comparison-grid'
				? 'Detectamos una comparación entre varias opciones'
			: 'Detectamos una comparación en el diseño';
	const creativeDecisionIcon = (type?: string) => ({
		person: '👤',
		scene: '◫',
		styling: '✦',
		object: '◆',
		comparison: '⇄',
		'product-handling': '◉',
		other: '✧',
	}[type || 'other'] || '✧');

	// Escanea una o varias URLs → devuelve los IDs de producto importados.
	async function scanUrls(list: string[]): Promise<string[]> {
		setError('');
		const ids: string[] = [];
		const productsById = new Map<string, ProductReviewItem>();
		try {
			for (const raw of list) {
				const response = await fetch('/api/creativos/products', {
					method: 'POST',
					headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
					body: JSON.stringify({ url: raw }),
				});
				const payload = await response.json();
				if (response.ok && payload.importedIds?.length) {
					ids.push(...payload.importedIds);
					if (Array.isArray(payload.products)) {
						// Lo que detectó la IA al leer la página manda sobre el default.
						const pageType = payload.products.find((item: any) => item?.metadata?.pageType)?.metadata?.pageType;
						if (pageType === 'service' || pageType === 'product' || pageType === 'catalog') setDetectedOffering(pageType);
						payload.products.forEach((product: ProductReviewItem) => {
							if (product?.id && payload.importedIds.includes(product.id)) productsById.set(product.id, product);
						});
					}
				}
				else if (list.length === 1) throw new Error(payload.errors?.[0]?.error || payload.error || 'No pudimos analizar esa URL.');
			}
			if (!ids.length) throw new Error('No pudimos analizar ninguna de las URLs.');
			const uniqueIds = [...new Set(ids)];
			setImportedProducts([...productsById.values()]);
			// Por defecto usamos todos los productos que el usuario pidió
			// explícitamente; después puede dejar solo uno desde el carrusel.
			setSelectedProductIds(uniqueIds);
			return uniqueIds;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo escanear la URL.');
			setImportedProducts([]);
			setSelectedProductIds([]);
			return [];
		}
	}

	// Lee un PDF / Word / Excel y precarga nombre + descripción + imágenes.
	async function parseDoc(file: File | null) {
		if (!file) return;
		setParsingDoc(true); setError('');
		try {
			const form = new FormData();
			form.set('file', file);
			const res = await fetch('/api/creativos/parse-doc', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'No pudimos leer el archivo.');
			if (payload.name) setManualProductName(payload.name);
			if (payload.facts) setManualProductFacts(payload.facts);
			if (Array.isArray(payload.images) && payload.images.length) {
				const files: File[] = [];
				const previews: string[] = [];
				for (let i = 0; i < payload.images.length; i++) {
					try {
						const blob = await (await fetch(payload.images[i])).blob();
						files.push(new File([blob], `doc-img-${i}.png`, { type: blob.type || 'image/png' }));
						previews.push(payload.images[i]);
					} catch { /* imagen inválida */ }
				}
				if (files.length) { setUploadFiles((prev) => [...prev, ...files]); setUploadPreviews((prev) => [...prev, ...previews]); }
			}
			if (onToast) onToast('Archivo analizado: revisá el nombre y la descripción.');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No pudimos leer el archivo.');
		} finally { setParsingDoc(false); }
	}

	async function requestPlan() {
		setPhase('planning'); setError('');
		try {
			let productIds: string[] = [];
			let offeringForSubmit: 'product' | 'service' | 'catalog' = detectedOffering;
			let isCatalogSubmit = false;
			if (productMode === 'url') {
				const list = urls.map((u) => u.trim()).filter(Boolean);
				if (!list.length && productMode === 'url') { setError('Pegá al menos una URL.'); setPhase('setup'); return; }
				if (list.length) productIds = await scanUrls(list);
				if (productMode === 'url' && !productIds.length) { setPhase('setup'); return; }
				// setState no se refleja en este mismo handler: se relee del producto.
				const scanned = importedProducts.find((item: any) => productIds.includes(item.id));
				const scannedType = (scanned as any)?.metadata?.pageType;
				if (scannedType === 'service' || scannedType === 'catalog') offeringForSubmit = scannedType;
				// De un catálogo se importan varios productos: entran todos como
				// referencia para que el anuncio muestre una selección de la tienda.
				if (scannedType === 'catalog' && productIds.length > 1) isCatalogSubmit = true;
			}
			const form = new FormData();
			form.set('referencePath', effectiveReferencePath);
			if (wantsFullCarousel) form.set('referencePaths', JSON.stringify(carouselSlides));
			form.set('language', language);
			form.set('brandSource', brandSource);
			form.set('subjectMode', offeringForSubmit);
			if (productMode === 'url' && productIds.length) {
				form.set('productId', productIds[0]); // contexto de análisis
				if (isCatalogSubmit) productIds.slice(0, 5).forEach((id) => form.append('productIds', id));
			} else if (productMode === 'manual') {
				if (uploadFiles.length > 0) uploadFiles.forEach((file) => form.append('product', file));
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			if (isService) {
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			const response = await fetch('/api/creativos/plan', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo analizar la referencia.');
			const analysis = payload.analysis || {};
			setPlan(analysis);
			setZones((analysis.textZones || []).filter((zone: any) => analysis.productHasPackaging ? true : !zone.onProduct));
			setPeople(Array.isArray(analysis.people) ? analysis.people.map((p: any) => ({ ...p, directive: '' })) : []);
			setComparisons(Array.isArray(analysis.comparisonItems) ? analysis.comparisonItems.map((c: any) => ({ ...c, directive: '' })) : []);
			setCreativeDecisions(Array.isArray(analysis.creativeDecisions) ? analysis.creativeDecisions.map((decision: any) => ({ ...decision, directive: '' })) : []);
			setComparisonGuidance('');
			setPhase('review');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo analizar la referencia.');
			setPhase('setup');
		}
	}

	async function approveAndGenerate() {
		setPhase('starting'); setError('');
		onGenerationRequested?.();
		try {
			if (productMode === 'url' && selectedProductIds.length === 0) {
				throw new Error('Elegí al menos un producto para generar la imagen.');
			}
			const pathPrefixId = parseInt(ad.imagePath.split('/')[0], 10);
			const form = new FormData();
			form.set('templateId', String(!isNaN(pathPrefixId) ? pathPrefixId : 40));
			form.set('templateName', ad.name || 'Anuncio Ganador');
			form.set('referencePath', effectiveReferencePath);
			form.set('imageType', 'promotion');
			form.set('fidelity', '1');
			form.set('preset', 'Fiel al ganador');
			form.set('count', String(count));
			form.set('format', format);
			form.set('language', language);
			form.set('colorMode', colorMode);
			if (Object.keys(paletteOverride).length) form.set('paletteOverride', JSON.stringify(paletteOverride));
			form.set('typoMode', typoMode);
			form.set('brandSource', brandSource);
			form.set('subjectMode', detectedOffering);
			form.set('includeLogo', includeLogo ? '1' : '0');
			if ((productMode === 'url' || isService) && selectedProductIds.length) {
				selectedProductIds.forEach((id) => form.append('productIds', id));
			} else if (productMode === 'manual') {
				if (uploadFiles.length > 0) uploadFiles.forEach((file) => form.append('product', file));
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			}
			if (avatarMode === 'saved' && selectedAvatarId) form.set('avatarId', selectedAvatarId);
			if (avatarMode === 'upload') {
				if (avatarFiles.length < 4) throw new Error('Subí al menos 4 imágenes del avatar para mantener su identidad.');
				if (!avatarConsent) throw new Error('Confirmá que tenés permiso para usar esas imágenes.');
				const avatarForm = new FormData();
				avatarForm.set('name', 'Avatar de esta generación');
				avatarForm.set('description', 'Referencias visuales guardadas desde el flujo de generación.');
				avatarForm.set('consentConfirmed', 'true');
				avatarFiles.slice(0, 12).forEach((file) => avatarForm.append('images', file));
				const avatarResponse = await fetch('/api/creativos/avatars', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: avatarForm });
				const avatarPayload = await avatarResponse.json();
				if (!avatarResponse.ok || !avatarPayload.avatar?.id) throw new Error(avatarPayload.error || 'No se pudo guardar el avatar.');
				setSavedAvatars(Array.isArray(avatarPayload.avatars) ? avatarPayload.avatars : savedAvatars);
				form.set('avatarId', avatarPayload.avatar.id);
			}
			form.set('plan', JSON.stringify({ ...plan, textZones: zones, people, comparisonItems: comparisons, creativeDecisions, comparison: { ...(plan.comparison || {}), userGuidance: comparisonGuidance.trim() } }));

			const response = await fetch('/api/creativos/generate', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la generación.');
			if (payload.async && payload.batchId && onGenerationStarted) {
				onGenerationStarted({
					batchId: payload.batchId,
					title: manualProductName.trim() ? `${manualProductName.trim()} · ${ad.name}` : ad.name,
					referenceUrl,
					count,
				});
				onBack();
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la generación.');
			setPhase('review');
		}
	}

	async function regenerateCopy(index: number) {
		const zone = zones[index];
		if (!zone) return;
		try {
			const response = await fetch('/api/creativos/rewrite', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
				body: JSON.stringify({
					original: zone.original,
					current: zone.replacement,
					messageRole: zone.messageRole,
					productName: manualProductName || 'producto',
					productFacts: manualProductFacts,
					language,
				}),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo reescribir el texto.');
			setZones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: payload.replacement } : item));
			onToast?.('Texto regenerado con éxito.');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo reescribir el texto.');
		}
	}

	async function regenerateAllCopies() {
		if (!zones.length) return;
		if (!window.confirm('¿Seguro que querés volver a escribir todos los textos con IA? Se perderán las ediciones manuales actuales.')) return;
		setError('');
		setPhase('planning');
		await requestPlan();
		onToast?.('Todos los textos fueron regenerados.');
	}

	// Carrusel completo: sin revisión de textos (igual que el lote) — se resuelven
	// los productos (uno o uno por página) y se arrancan todas las páginas juntas,
	// agrupadas bajo el mismo batch_id que ya sabe trackear "Mis imágenes".
	async function approveAndGenerateCarousel() {
		if (!plan) {
			await requestPlan();
			return;
		}
		setCarouselStarting(true); setError('');
		onGenerationRequested?.();
		try {
			let productIds: string[] = [];
			let offeringForSubmit: 'product' | 'service' | 'catalog' = detectedOffering;
			let isCatalogSubmit = false;
			if (productMode === 'url' || (isService && urls.some((url) => url.trim()))) {
				const list = urls.map((u) => u.trim()).filter(Boolean);
				if (carouselSameProduct) {
					const ids = await scanUrls([list[0]]);
					if (!ids.length) return;
					productIds = [ids[0]];
				} else {
					if (list.length < carouselSlides.length) {
						setError(`Necesitás ${carouselSlides.length} URLs, una por página (tenés ${list.length}).`);
						return;
					}
					const needed = list.slice(0, carouselSlides.length);
					const ids = await scanUrls(needed);
					if (ids.length !== needed.length) {
						setError('No pudimos analizar alguna de las URLs. Revisalas e intentá de nuevo.');
						return;
					}
					productIds = ids;
				}
			} else if (productMode === 'manual') {
				// Carga a mano: solo válida cuando es el mismo producto en todas las páginas.
				if (!uploadFiles.length) { setError('Subí al menos una foto del producto.'); return; }
				const productForm = new FormData();
				productForm.set('name', manualProductName.trim());
				productForm.set('description', manualProductFacts.trim());
				uploadFiles.slice(0, 5).forEach((file) => productForm.append('image', file));
				const productRes = await fetch('/api/creativos/products', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: productForm });
				const productPayload = await productRes.json();
				if (!productRes.ok || !productPayload.product?.id) throw new Error(productPayload.error || 'No se pudo guardar el producto.');
				productIds = [productPayload.product.id];
			}

			let carouselAvatarId = avatarMode === 'saved' ? selectedAvatarId : '';
			if (avatarMode === 'upload') {
				if (avatarFiles.length < 4) throw new Error('Subí al menos 4 imágenes del avatar para mantener su identidad.');
				if (!avatarConsent) throw new Error('Confirmá que tenés permiso para usar esas imágenes.');
				const avatarForm = new FormData();
				avatarForm.set('name', 'Avatar de esta generación');
				avatarForm.set('description', 'Referencias visuales guardadas desde el flujo de generación.');
				avatarForm.set('consentConfirmed', 'true');
				avatarFiles.slice(0, 12).forEach((file) => avatarForm.append('images', file));
				const avatarRes = await fetch('/api/creativos/avatars', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: avatarForm });
				const avatarPayload = await avatarRes.json();
				if (!avatarRes.ok || !avatarPayload.avatar?.id) throw new Error(avatarPayload.error || 'No se pudo guardar el avatar.');
				carouselAvatarId = avatarPayload.avatar.id;
			}

			const pathPrefixId = parseInt(ad.imagePath.split('/')[0], 10);
			const response = await fetch('/api/creativos/carousel-start', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
				body: JSON.stringify({
					referenceSlidePaths: carouselSlides,
					referenceName: ad.name || 'Carrusel ganador',
					templateId: !isNaN(pathPrefixId) ? pathPrefixId : 40,
					productIds,
					subjectMode: offeringForSubmit,
					productName: manualProductName.trim(),
					productDescription: manualProductFacts.trim(),
					avatarId: carouselAvatarId || null,
					format, language, colorMode, typoMode, brandSource,
					logoSlideIndexes: [...logoCarouselPages],
					approvedPlan: { ...plan, textZones: zones, people, comparisonItems: comparisons, creativeDecisions, comparison: { ...(plan?.comparison || {}), userGuidance: comparisonGuidance.trim() } },
				}),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la generación del carrusel.');

			if (onGenerationStarted) {
				onGenerationStarted({
					batchId: payload.batchId,
					title: `${ad.name} · carrusel`,
					referenceUrl,
					count: payload.count,
				});
			}
			onBack();
			void driveBatchWorkers((payload.generations || []).map((g: any) => g.id), token);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la generación del carrusel.');
		} finally {
			setCarouselStarting(false);
		}
	}

	async function approveReviewedGeneration() {
		if (wantsFullCarousel) await approveAndGenerateCarousel();
		else await approveAndGenerate();
	}

	return (
		<div style={{ width: '100%' }}>
			<button onClick={onBack} style={{ border: 0, background: 'transparent', color: '#716d79', cursor: 'pointer', fontSize: '14px', padding: 0, marginBottom: '16px' }}>← Volver a la biblioteca</button>
			<div className="creation-flow-layout">

				{/* Referencia a la izquierda: en un carrusel se puede pasar de página
				    para verlas todas, y la que se mira es la que queda elegida
				    cuando el modo es "solo una página". */}
				<aside className="creation-flow-aside">
					<div style={{ position: 'relative' }}>
						<img key={previewSlidePath} src={previewUrl} alt={ad.name} style={{ width: '100%', borderRadius: '14px', boxShadow: '0 14px 40px rgba(25,23,29,0.16)', display: 'block' }} />
						{isCarouselAd && carouselSlides.length > 1 && (
							<>
								<button type="button" className="carousel-arrow carousel-arrow-prev" onClick={() => goToPreviewSlide(-1)} aria-label="Página anterior">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
								</button>
								<button type="button" className="carousel-arrow carousel-arrow-next" onClick={() => goToPreviewSlide(1)} aria-label="Página siguiente">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
								</button>
								<span style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 4, background: 'rgba(25,23,29,0.75)', backdropFilter: 'blur(4px)', color: '#fff', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
									{selectedSlideIndex + 1} / {carouselSlides.length}
								</span>
							</>
						)}
					</div>
					<p style={{ margin: '12px 0 0', fontSize: '14px', color: '#716d79' }}>Anuncio ganador: <b style={{ color: '#19171d' }}>{ad.name}</b></p>
					{isCarouselAd && carouselMode === 'single' && (
						<p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#744bde', fontWeight: 700 }}>✓ Vas a clonar esta página</p>
					)}
				</aside>

				<section className="creation-flow-main">
					<h1 style={{ margin: '0 0 5px', fontSize: '23px', color: '#19171d', letterSpacing: '-.02em' }}>Crear con este diseño</h1>
					<p style={{ margin: '0 0 18px', fontSize: '13.5px', color: '#716d79', lineHeight: 1.5 }}>
						{wantsFullCarousel
							? `Se replica el carrusel completo (${carouselSlides.length} páginas) con tu producto.`
							: 'Se replica la composición visual del ganador con tu producto. Antes de generar podés ajustar la identidad y las personas.'}
					</p>

					{/* Misma barra de progreso que el generador por lote. */}
					<ol className="wiz-progress" aria-label="Progreso">
						{[
							{ n: 1, label: 'Tu producto', active: phase === 'setup' && formStep === 1, done: phase !== 'setup' || formStep > 1 },
							{ n: 2, label: 'Formato', active: phase === 'setup' && formStep === 2, done: phase !== 'setup' || formStep > 2 },
							{ n: 3, label: 'Estilo', active: phase === 'setup' && formStep === 3, done: phase !== 'setup' },
							{ n: 4, label: wantsFullCarousel ? 'Generar' : 'Revisar', active: phase === 'planning' || phase === 'review' || phase === 'starting' || carouselStarting, done: false },
						].map((item) => (
							<li key={item.n} className={`wiz-progress-item ${item.active ? 'active' : ''} ${item.done ? 'done' : ''}`}>
								<span className="wiz-progress-dot">{item.done ? '✓' : item.n}</span>
								<span className="wiz-progress-label">{item.label}</span>
							</li>
						))}
					</ol>

					{(phase === 'setup' || phase === 'planning') && <>
						{/* 1 · Tu producto / Servicio */}
						<div className="wiz-step" hidden={formStep !== 1}>
							<div className="wiz-body">
								{isCarouselAd && (
									<div style={{ marginBottom: '4px' }}>
										<label className="picker-label">Este ganador es un carrusel de {carouselSlides.length} páginas</label>
										<div className="wiz-tabs">
											{([
												['full', '🗂️', 'Carrusel completo', `Las ${carouselSlides.length} páginas`],
												['single', '🖼️', 'Solo una página', 'Elegís cuál'],
											] as const).map(([value, icon, text, hint]) => (
												<button key={value} type="button" className={`wiz-tab ${carouselMode === value ? 'active' : ''}`} onClick={() => setCarouselMode(value)}>
													<span className="wiz-tab-icon">{icon}</span>
													<span className="wiz-tab-label">{text}</span>
													<small>{hint}</small>
												</button>
											))}
										</div>

										{carouselMode === 'single' && (
											<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
												{carouselSlides.map((slide, index) => (
													<button
														key={slide}
														type="button"
														onClick={() => setSelectedSlideIndex(index)}
														title={`Página ${index + 1}`}
														style={{
															padding: 0, width: '64px', height: '64px', borderRadius: '9px', overflow: 'hidden', cursor: 'pointer',
															border: selectedSlideIndex === index ? '2.5px solid #744bde' : '1.5px solid #e2dde9',
															background: '#f6f4f9',
														}}
													>
														<img src={referenceUrlFor(slide)} alt={`Página ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
													</button>
												))}
											</div>
										)}

										{carouselMode === 'full' && (
											<div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
												{([
													[true, '📦 Mismo producto en todas'],
													[false, '🎁 Producto distinto por página'],
												] as const).map(([value, text]) => (
													<button
														key={String(value)}
														type="button"
														onClick={() => { setCarouselSameProduct(value); if (!value) setProductMode('url'); }}
														style={{
															padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700,
															border: carouselSameProduct === value ? '2px solid #744bde' : '1px solid #e2dde9',
															background: carouselSameProduct === value ? '#f4f2f6' : '#fff',
															color: carouselSameProduct === value ? '#744bde' : '#3f3a48',
														}}
													>
														{text}
													</button>
												))}
											</div>
										)}
										<div style={{ height: '1px', background: '#eee6f2', margin: '16px 0' }} />
									</div>
								)}

								<label className="picker-label">¿Qué vas a promocionar?</label>
								<div className="wiz-tabs">
									{([
						['url', '🔗', 'Con URL', 'Detectamos qué ofrecés'],
										...(wantsFullCarousel && !carouselSameProduct ? [] : [['manual', '✍️', 'Cargar a mano', 'Cargás los datos'] as const]),
									] as const).map(([value, icon, text, hint]) => (
										<button key={value} type="button" className={`wiz-tab ${productMode === value ? 'active' : ''}`} onClick={() => setProductMode(value)}>
											<span className="wiz-tab-icon">{icon}</span>
											<span className="wiz-tab-label">{text}</span>
											<small>{hint}</small>
										</button>
									))}
								</div>
								{wantsFullCarousel && !carouselSameProduct && (
									<p className="wiz-hint">
										Necesitás {carouselSlides.length} URLs, una por página y en orden ({filledUrls}/{carouselSlides.length} cargadas). La carga a mano no está disponible para productos distintos por página.
									</p>
								)}

								{(productMode === 'url' || isService) && (
									<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
										{urls.map((u, i) => (
											<div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
												{wantsFullCarousel && !carouselSameProduct && (
													<span style={{ flexShrink: 0, width: '22px', fontSize: '12px', fontWeight: 800, color: '#8b8490', textAlign: 'center' }}>{i + 1}</span>
												)}
												<input value={u}
													onChange={(e) => setUrls((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
													placeholder={wantsFullCarousel && !carouselSameProduct ? `URL del producto de la página ${i + 1}` : 'Pegá la URL de tu producto o servicio a analizar'}
													className="wiz-input"
													style={{ flex: 1 }} />
												{urls.length > 1 && (
													<button type="button" aria-label="Quitar URL" onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))}
														style={{ width: '38px', height: '38px', borderRadius: '9px', border: '1px solid #e2dde9', background: '#fff', color: '#b0a8b8', cursor: 'pointer', fontSize: '17px', flexShrink: 0 }}>×</button>
												)}
											</div>
										))}
										{!(wantsFullCarousel && carouselSameProduct) && (
											<button type="button" onClick={() => setUrls((prev) => [...prev, ''])}
												style={{ alignSelf: 'flex-start', padding: '7px 13px', borderRadius: '9px', border: '1px dashed #cbb8f0', background: '#faf8ff', color: '#5b3fc4', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
												+ Agregar otra URL {wantsFullCarousel && !carouselSameProduct ? '(otra página)' : '(otro producto)'}
											</button>
										)}
										{isService && (
											<div className="wiz-fields" style={{ marginTop: '12px' }}>
												<input className="wiz-input" value={manualProductName} onChange={(e) => setManualProductName(e.target.value)} placeholder="Nombre del servicio, SaaS o marca..." />
												<textarea className="wiz-input" value={manualProductFacts} onChange={(e) => setManualProductFacts(e.target.value)} rows={3} placeholder="Qué hace, para quién es y qué resultado promete..." />
											</div>
										)}
									</div>
								)}

								{productMode === 'manual' && (
									<div className="wiz-fields">
										<div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
											<span style={{ fontSize: '12.5px', fontWeight: 700, color: '#716d79' }}>Fotos del producto:</span>
											<div className="image-uploader-box">
												<input type="file" accept="image/png,image/jpeg,image/webp" multiple id="creation-manual-imgs" className="hidden-file-input"
													onChange={(event) => {
														const files = event.target.files ? Array.from(event.target.files) : [];
														setUploadFiles((prev) => [...prev, ...files]);
														setUploadPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
														event.target.value = '';
													}} />
												<label htmlFor="creation-manual-imgs" className="uploader-label">
													<span>📸 Cargar fotos del producto (opcional · podés subir varias)</span>
												</label>
											</div>
											<label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', border: '1px dashed #cbb8f0', background: '#faf8ff', fontSize: '12.5px', fontWeight: 700, cursor: parsingDoc ? 'wait' : 'pointer', color: '#5b3fc4', width: 'fit-content', marginTop: '2px', opacity: parsingDoc ? 0.6 : 1 }}>
												{parsingDoc ? <><span className="studio-spinner small" aria-hidden="true" /> Analizando archivo…</> : '📄 Subir PDF / Word / Excel'}
												<input type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,application/pdf" style={{ display: 'none' }} disabled={parsingDoc}
													onChange={(event) => { void parseDoc(event.target.files?.[0] || null); event.target.value = ''; }} />
											</label>
											{uploadPreviews.length > 0 && (
												<div className="extra-previews-grid">
													{uploadPreviews.map((preview, idx) => (
														<div key={idx} className="preview-thumb">
															<img src={preview} alt="" />
															<button type="button" className="remove-img-btn" onClick={() => { setUploadFiles((prev) => prev.filter((_, j) => j !== idx)); setUploadPreviews((prev) => prev.filter((_, j) => j !== idx)); }}>✕</button>
														</div>
													))}
												</div>
											)}
										</div>
										<input className="wiz-input" value={manualProductName} onChange={(e) => setManualProductName(e.target.value)} placeholder="Nombre del servicio o producto..." />
										<textarea className="wiz-input" value={manualProductFacts} onChange={(e) => setManualProductFacts(e.target.value)} rows={3}
											placeholder="Descripción de tu producto, servicio, beneficios o características especiales..." />
									</div>
								)}
							</div>
						</div>

						{/* 2 · Formato */}
						<div className="wiz-step" hidden={formStep !== 2}>
							<div className="wiz-body">
								<label className="picker-label">Formato</label>
								<p className="batch-detail-help">Elegí dónde se va a publicar el anuncio.</p>
								<div className="batch-format-grid">
									{FORMAT_ITEMS.map((item) => (
										<button key={item.id} type="button" className={`batch-format-card ${format === item.id ? 'active' : ''}`} onClick={() => setFormat(item.id)} aria-pressed={format === item.id}>
											<span className={`batch-format-shape shape-${item.shape}`} aria-hidden="true"><i /></span>
											<span className="batch-format-copy"><strong>{item.text}</strong><small>{item.desc}</small></span>
											{format === item.id && <b aria-hidden="true">✓</b>}
										</button>
									))}
								</div>
							</div>
						</div>

						{/* 3 · Estilo (idioma, de quién es el anuncio, colores, tipografía, cantidad) */}
					<div className="wiz-step" hidden={formStep !== 3}>
						<div className="wiz-body">
							<div className="creation-language-select">
								<BatchSelect label="Idioma del anuncio" value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
							</div>
							<div className="batch-brand-block">
									<span className="picker-label">¿Qué identidad querés usar?</span>
									<p className="batch-detail-help">Elegí de dónde tomar el nombre y el logo. Los colores y la tipografía se eligen por separado.</p>
									<div className="batch-brand-options">
										{BRAND_OPTIONS.map((option) => (
											<button key={option.value} type="button" className={`batch-brand-option ${brandSource === option.value ? 'active' : ''}`} onClick={() => { setBrandSource(option.value); if (option.value === 'none') { setIncludeLogo(false); setLogoCarouselPages(new Set()); } }} aria-pressed={brandSource === option.value}>
												<span className="batch-brand-icon" aria-hidden="true"><BrandOptionIcon icon={option.icon} /></span>
												<span><strong>{option.label}</strong><small>{option.hint}</small></span>
												{brandSource === option.value && <b aria-hidden="true">✓</b>}
											</button>
										))}
									</div>
								</div>

								{wantsFullCarousel && brandSource !== 'none' && (
									<div className="batch-style-group" style={{ marginBottom: '4px' }}>
										<span className="picker-label">Logo en el carrusel</span>
										<div className="batch-style-options">
											<button type="button" className={logoCarouselPages.size === 0 ? 'active' : ''} onClick={() => setLogoCarouselPages(new Set())}>Sin logo</button>
											<button type="button" className={logoCarouselPages.size > 0 ? 'active' : ''} onClick={() => setLogoCarouselPages(new Set(carouselSlides.map((_, i) => i)))}>Con logo de {brandSource === 'mine' ? 'Mi marca' : 'la URL'}</button>
										</div>
										{logoCarouselPages.size > 0 && (
											<>
												<small className="batch-brand-note">Tocá una página para sacarle el logo — por defecto va en todas.</small>
												<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
													{carouselSlides.map((slide, index) => {
														const on = logoCarouselPages.has(index);
														return (
															<button
																key={slide}
																type="button"
																onClick={() => setLogoCarouselPages((prev) => {
																	const next = new Set(prev);
																	if (next.has(index)) next.delete(index); else next.add(index);
																	return next;
																})}
																title={`Página ${index + 1} — ${on ? 'con logo' : 'sin logo'}`}
																style={{
																	position: 'relative', padding: 0, width: '58px', height: '58px', borderRadius: '9px', overflow: 'hidden', cursor: 'pointer',
																	border: on ? '2.5px solid #744bde' : '1.5px solid #e2dde9',
																	background: '#f6f4f9', opacity: on ? 1 : 0.5,
																}}
															>
																<img src={referenceUrlFor(slide)} alt={`Página ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
																<span style={{ position: 'absolute', bottom: '2px', right: '2px', fontSize: '11px', lineHeight: 1, filter: on ? 'none' : 'grayscale(1)' }}>{on ? '🏷️' : '🚫'}</span>
															</button>
														);
													})}
												</div>
											</>
										)}
									</div>
								)}

								{!wantsFullCarousel && brandSource !== 'none' && (
									<div className="batch-style-group" style={{ marginBottom: '4px' }}>
										<span className="picker-label">¿Incluir el logo?</span>
										<div className="batch-style-options">
											<button type="button" className={!includeLogo ? 'active' : ''} onClick={() => setIncludeLogo(false)}>Sin logo</button>
										<button type="button" className={includeLogo ? 'active' : ''} onClick={() => setIncludeLogo(true)}>Con logo de {brandSource === 'mine' ? 'Mi marca' : 'la URL'}</button>
										</div>
										<small className="batch-brand-note">Usamos el logo oficial de la marca elegida. Por defecto no se agrega.</small>
									</div>
								)}

								<div className="batch-style-groups creation-style-source-groups">
									<div className="batch-style-group">
										<span className="picker-label">Colores</span>
										<div className="batch-style-options">
											{STYLE_OPTIONS.map((option) => (
												<button key={option.value} type="button" className={colorMode === option.value ? 'active' : ''} onClick={() => setColorMode(option.value as 'winner' | 'url' | 'brand')} aria-pressed={colorMode === option.value}>{option.label}</button>
											))}
										</div>
										{detectedPalette && (
											<div className="palette-editor">
												<small className="batch-brand-note">Estos son los colores que detectamos. Si alguno no es el de tu marca, cambialo.</small>
												<div className="palette-swatches">
													{([['background', 'Fondo'], ['accent', 'Principal'], ['secondary', 'Secundario'], ['text', 'Texto']] as const).map(([role, label]) => {
														const value = paletteOverride[role] || detectedPalette[role] || '';
														if (!value) return null;
														const corregido = Boolean(paletteOverride[role]);
														return (
															<label key={role} className={`palette-swatch${corregido ? ' is-edited' : ''}`}>
																<input
																	type="color"
																	value={value}
																	onChange={(event) => setPaletteOverride((prev) => ({ ...prev, [role]: event.target.value }))}
																	aria-label={`Color ${label}`}
																/>
																<span>{label}</span>
																<em>{value}</em>
															</label>
														);
													})}
												</div>
												{Object.keys(paletteOverride).length > 0 && (
													<button type="button" className="palette-reset" onClick={() => setPaletteOverride({})}>
														Volver a los detectados
													</button>
												)}
											</div>
										)}
									</div>
									<div className="batch-style-group">
										<span className="picker-label">Tipografía</span>
										<div className="batch-style-options">
											{STYLE_OPTIONS.map((option) => (
												<button key={option.value} type="button" className={typoMode === option.value ? 'active' : ''} onClick={() => setTypoMode(option.value as 'winner' | 'url' | 'brand')} aria-pressed={typoMode === option.value}>{option.label}</button>
											))}
										</div>
									</div>
								</div>

								{wantsFullCarousel && (
									<p className="wiz-hint">Se generan las {carouselSlides.length} páginas del carrusel — la cantidad la define el diseño original.</p>
								)}
							</div>
						</div>

						{error && <p style={{ margin: '14px 0 0', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						{formStep === 1 && (
							<div className="wiz-actions" style={{ marginTop: '16px' }}>
								<button type="button" className="url-batch-submit-btn wiz-continue-btn" onClick={() => { if (!step1Ready) { setError('Contanos qué vas a promocionar antes de continuar.'); return; } setError(''); setFormStep(2); }}>
									<span>Continuar</span>
								</button>
							</div>
						)}

						{formStep === 2 && (
							<div className="wiz-actions" style={{ marginTop: '16px' }}>
								<button type="button" className="wiz-back" onClick={() => setFormStep(1)}>← Atrás</button>
								<button type="button" className="url-batch-submit-btn" onClick={() => setFormStep(3)}>
									<span>Continuar</span>
								</button>
							</div>
						)}

						{formStep === 3 && (
							<div className="wiz-actions" style={{ marginTop: '16px' }}>
								<button type="button" className="wiz-back" onClick={() => setFormStep(2)} disabled={phase === 'planning' || carouselStarting}>← Atrás</button>
								{wantsFullCarousel ? (
									<div className="batch-continue-wrap">
										<button
											type="button"
											onClick={() => { if (!step1Ready) { setError('Completá los productos antes de generar.'); setFormStep(1); return; } void approveAndGenerateCarousel(); }}
											disabled={phase === 'planning'}
											className="url-batch-submit-btn"
										>
											{carouselStarting ? <><span className="studio-spinner small" aria-hidden="true" /> Preparando carrusel…</> : `Generar ${carouselSlides.length} imágenes`}
										</button>
										{!carouselStarting && <span className="batch-credit-note">{carouselSlides.length} {carouselSlides.length === 1 ? 'crédito' : 'créditos'}</span>}
									</div>
								) : (
									<div className="batch-continue-wrap">
										<button
											type="button"
											onClick={() => void requestPlan()}
											disabled={phase === 'planning'}
											className="url-batch-submit-btn"
										>
							{phase === 'planning' ? <><span className="studio-spinner small" aria-hidden="true" /> Analizando referencia…</> : 'Analizar referencia'}
										</button>
										{phase !== 'planning' && <span className="batch-credit-note">Todavía no gastás créditos</span>}
									</div>
								)}
							</div>
						)}
					</>}

					{(phase === 'review' || phase === 'starting') && plan && <>
						{productMode === 'url' && importedProducts.length > 0 && (
							<ProductAssetReview
								products={importedProducts}
								selectedProductIds={selectedProductIds}
								onToggleProduct={(productId) => setSelectedProductIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId])}
							/>
						)}
						<section style={{ marginBottom: '18px', padding: '16px', border: '1px solid #e6ddf5', borderRadius: '12px', background: '#fcfaff' }} aria-label="Identidad visual">
							<strong style={label}>{isService ? '¿Qué querés mostrar como protagonista?' : '¿Querés mostrar una persona o avatar?'}</strong>
							<p style={{ margin: '-3px 0 12px', fontSize: '12px', color: '#716d79', lineHeight: 1.45 }}>
								{isService ? 'Podés usar un avatar, o dejar que la IA decida entre logo, interfaz, resultado, persona contextual o una escena de marca según el anuncio ganador.' : 'Para mantener una persona consistente podés usar tu avatar. Si no elegís ninguno, la IA mantiene la dirección del anuncio ganador sin inventar una identidad recurrente.'}
							</p>
							<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
								<button type="button" style={chip(avatarMode === 'none')} onClick={() => setAvatarMode('none')}>Sin persona / avatar</button>
								{savedAvatars.map((avatar) => (
									<button key={avatar.id} type="button" style={{ ...chip(avatarMode === 'saved' && selectedAvatarId === avatar.id), display: 'inline-flex', alignItems: 'center', gap: '7px' }} onClick={() => { setAvatarMode('saved'); setSelectedAvatarId(avatar.id); }}>
										{avatar.coverUrl && <img src={avatar.coverUrl} alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }} />}
										{avatar.name} <small>({avatar.imageCount || 0})</small>
									</button>
								))}
								<button type="button" style={chip(avatarMode === 'upload')} onClick={() => setAvatarMode('upload')}>Cargar referencias</button>
							</div>
							{avatarMode === 'upload' && (
								<div>
									<input type="file" id="creation-avatar-files" accept="image/png,image/jpeg,image/webp" multiple className="hidden-file-input" onChange={(event) => {
										const files = event.target.files ? Array.from(event.target.files).slice(0, 12) : [];
										setAvatarFiles(files); setAvatarPreviews(files.map((file) => URL.createObjectURL(file))); event.target.value = '';
									}} />
									<label htmlFor="creation-avatar-files" className="uploader-label" style={{ display: 'inline-flex', width: 'auto' }}>Subir 4–12 imágenes de la misma persona/avatar</label>
									{avatarPreviews.length > 0 && <div className="extra-previews-grid" style={{ marginTop: '10px' }}>{avatarPreviews.map((preview) => <div className="preview-thumb" key={preview}><img src={preview} alt="Referencia de avatar" /></div>)}</div>}
									<label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '10px', fontSize: '12px', color: '#5f5a67' }}><input type="checkbox" checked={avatarConsent} onChange={(event) => setAvatarConsent(event.target.checked)} /> Confirmo que tengo permiso para usar estas imágenes.</label>
								</div>
							)}
						</section>
						{plan.brandPalette && (
							<section style={{ marginBottom: '18px', padding: '14px 16px', border: '1px solid #eee9f2', borderRadius: '12px', background: '#fff' }} aria-label="Paleta detectada">
								<strong style={label}>Colores que se van a usar</strong>
								<p style={{ margin: '-3px 0 10px', fontSize: '12px', color: '#716d79' }}>Extraídos de la identidad seleccionada: fondo, acento y texto. La IA los aplica por rol para mantener contraste.</p>
								<div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
									{(['background', 'accent', 'text', 'secondary'] as const).filter((key) => plan.brandPalette[key]).map((key) => (
										<div key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#4c4654' }}><span style={{ width: '22px', height: '22px', borderRadius: '6px', background: plan.brandPalette[key], border: '1px solid #ddd5e6', display: 'inline-block' }} /> <span>{key === 'background' ? 'Fondo' : key === 'accent' ? 'Acento' : key === 'text' ? 'Texto' : 'Secundario'} <small style={{ color: '#8b8490' }}>{plan.brandPalette[key]}</small></span></div>
									))}
								</div>
							</section>
						)}
						{plan.templateHasLogoSlot && includeLogo && (
							<div style={{
								display: 'flex',
								alignItems: 'center',
								gap: '8px',
								padding: '12px 16px',
								background: '#e8f9f0',
								border: '1px solid #c1eed6',
								borderRadius: '11px',
								marginBottom: '16px',
								fontSize: '13.5px',
								color: '#1e7e4a',
								fontWeight: 600
							}}>
								<span>✓ Incluiremos el logo de tu marca en el espacio del diseño.</span>
							</div>
						)}

						<div className="detected-copy-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
							<strong style={{ ...label, marginBottom: 0 }}>Textos detectados del anuncio</strong>
							<div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
								{zones.length > 0 && <button type="button" onClick={regenerateAllCopies} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>✨ Rehacer todos</button>}
								<button type="button" onClick={() => setCopyMode('auto')} style={chip(copyMode === 'auto')}>✨ Automáticos</button>
								<button type="button" onClick={() => setCopyMode('edit')} style={chip(copyMode === 'edit')}>✏️ Editarlos yo</button>
							</div>
						</div>

						{zones.length > 0 ? (
							<div className="detected-copy-table" style={{ background: '#fff', border: '1px solid #eee9f2', borderRadius: '12px', marginBottom: '22px', overflow: 'hidden' }}>
								{zones.map((zone, index) => (
									<div className="detected-copy-row" key={index} title={`${zone.where || ''}${zone.messageRole ? ` · ${zone.messageRole}` : ''}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, .8fr) minmax(220px, 1.2fr)', gap: '12px', alignItems: 'center', padding: '12px 14px', borderBottom: index < zones.length - 1 ? '1px solid #f4f0f8' : 'none' }}>
										<div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
											<span style={{ fontSize: '12px', fontWeight: 600, color: '#8b8490', lineHeight: 1.35, fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>“{zone.original || 'Texto detectado'}”</span>
											{zone.messageRole && <span style={{ fontSize: '9.5px', color: '#744bde', fontWeight: 700 }}>{zone.messageRole}</span>}
										</div>
										<div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 }}>
											{copyMode === 'edit' ? (
												<textarea value={zone.replacement || ''} rows={1} onChange={(event) => setZones((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, replacement: event.target.value } : item))} style={{ flex: 1, minHeight: '38px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e6e0ee', background: '#faf8fc', fontSize: '13.5px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
											) : (
												<span style={{ flex: 1, fontSize: '13.5px', color: '#19171d', lineHeight: 1.4 }}>{zone.replacement || 'Sin reemplazo detectado'}</span>
											)}
											<button type="button" onClick={() => void regenerateCopy(index)} style={{ border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }} title="Rehacer este texto con IA">✨ Rehacer</button>
										</div>
									</div>
								))}
							</div>
						) : (
							<div style={{ padding: '14px 16px', marginBottom: '18px', border: '1px solid #eee9f2', borderRadius: '12px', background: '#fcfbfe', color: '#716d79', fontSize: '13px' }}>No detectamos textos de publicación fuera del producto. Se conservarán únicamente los textos y detalles que ya pertenecen al producto real.</div>
						)}

						{/* Decisiones contextuales: no se limita a comparaciones. */}
						{creativeDecisions.length > 0 && (
							<section className="creative-decisions-review" aria-label="Decisiones contextuales del anuncio" style={{ marginBottom: '18px', padding: '16px', border: '1px solid #e6ddf5', borderRadius: '12px', background: 'linear-gradient(135deg, #fcfaff, #fff)' }}>
								<div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '12px' }}>
									<span aria-hidden="true" style={{ width: '30px', height: '30px', borderRadius: '9px', display: 'grid', placeItems: 'center', background: '#eee7ff', color: '#744bde', fontSize: '16px' }}>✦</span>
									<div>
										<strong style={label}>Decisiones para clonar mejor</strong>
										<p style={{ margin: '-4px 0 0', fontSize: '12px', lineHeight: 1.45, color: '#716d79' }}>La IA detectó elementos importantes del anuncio. Podés orientar cada uno o dejarlo vacío para que elija la opción más coherente.</p>
									</div>
								</div>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
									{creativeDecisions.map((decision, index) => (
										<div key={index} style={{ padding: '12px 14px', border: '1px solid #eee6f2', borderRadius: '11px', background: '#fff' }}>
											<strong style={{ display: 'block', fontSize: '13px', color: '#3f3560', marginBottom: '3px' }}>{creativeDecisionIcon(decision.type)} {decision.title || 'Elemento visual detectado'}</strong>
											{(decision.where || decision.description) && <p style={{ margin: '0 0 7px', fontSize: '12px', lineHeight: 1.4, color: '#5f5a67' }}>{decision.where ? `${decision.where}${decision.description ? ' · ' : ''}` : ''}{decision.description || ''}</p>}
											<p style={{ margin: '0 0 8px', fontSize: '12px', lineHeight: 1.4, color: '#744bde', fontWeight: 600 }}>{decision.question || `¿Cómo querés resolver ${decision.title?.toLowerCase() || 'este elemento'}?`}</p>
											<input value={decision.directive || ''} onChange={(event) => setCreativeDecisions(creativeDecisions.map((current, decisionIndex) => decisionIndex === index ? { ...current, directive: event.target.value } : current))} placeholder={decision.defaultStrategy ? `Vacío = ${decision.defaultStrategy}` : 'Dejalo vacío para que la IA decida'} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '9px', border: '1px solid #e2dde9', fontSize: '13px' }} />
										</div>
									))}
								</div>
							</section>
						)}

						{/* Personas detectadas en el anuncio: fallback para análisis antiguos */}
						{people.length > 0 && creativeDecisions.length === 0 && (
							<div style={{ marginBottom: '18px' }}>
								<strong style={label}>👤 {people.length === 1 ? 'Persona en el anuncio' : 'Personas en el anuncio'}</strong>
								<p style={{ margin: '-4px 0 10px', fontSize: '12px', color: '#8b8490' }}>Detectamos {people.length === 1 ? 'una persona' : `${people.length} personas`}. Decinos cómo querés que se vea (o dejalo vacío para mantenerla parecida).</p>
								<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
									{people.map((person, index) => (
										<div key={index} style={{ padding: '12px 14px', border: '1px solid #eee6f2', borderRadius: '11px', background: '#fcfbfe' }}>
											<p style={{ margin: '0 0 7px', fontSize: '12.5px', color: '#5f5a67' }}>{person.description || person.where || 'Persona'}{person.role ? ` · ${person.role}` : ''}</p>
											<input value={person.directive || ''} onChange={(e) => setPeople(people.map((pp, i) => i === index ? { ...pp, directive: e.target.value } : pp))} placeholder="Ej: mujer 30 años, pelo castaño, sonriendo en cocina luminosa…" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '9px', border: '1px solid #e2dde9', fontSize: '13px' }} />
										</div>
									))}
								</div>
							</div>
						)}

						{comparisonDetected && creativeDecisions.length === 0 && (
							<section className="comparison-review" aria-label="Decisión sobre la comparación del anuncio">
								<div className="comparison-review-heading">
									<span className="comparison-review-icon" aria-hidden="true">⇄</span>
									<div>
										<strong>{comparisonTitle}</strong>
										<p>{comparisonInfo.summary || 'La composición parece contrastar tu producto con otra opción.'}</p>
									</div>
								</div>
								<p className="comparison-review-guidance">
									{comparisonInfo.confidence === 'low' && comparisonInfo.question
										? comparisonInfo.question
										: '¿Qué querés mostrar del otro lado? Podés aclararlo o dejarlo vacío: la IA va a elegir una alternativa coherente, de la misma categoría y sin marcas ajenas.'}
								</p>
								{comparisonInfo.confidence === 'low' && (
									<textarea
										className="comparison-guidance-input"
										value={comparisonGuidance}
										onChange={(event) => setComparisonGuidance(event.target.value)}
										placeholder="Respondé la duda de la IA o dejalo vacío para que decida"
										rows={2}
									/>
								)}
								{comparisons.length > 0 ? (
									<div className="comparison-list">
										{comparisons.map((item, index) => (
											<div key={index} className="comparison-item">
												<div className="comparison-item-copy">
													<strong>{comparisons.length === 1 ? 'La alternativa' : `Alternativa ${index + 1}`}</strong>
													<span>{item.description || item.role || item.where || 'Elemento que aparece del otro lado'}</span>
												</div>
												<input
													className="comparison-input"
													value={item.directive || ''}
													onChange={(event) => setComparisons(comparisons.map((current, itemIndex) => itemIndex === index ? { ...current, directive: event.target.value } : current))}
													placeholder="Dejalo vacío para que la IA decida"
												/>
											</div>
										))}
									</div>
								) : comparisonInfo.confidence !== 'low' ? (
									<textarea
										className="comparison-guidance-input"
										value={comparisonGuidance}
										onChange={(event) => setComparisonGuidance(event.target.value)}
										placeholder="Ej.: comparalo con un rack fijo que requiere agujerear la pared"
										rows={2}
									/>
								) : null}
							</section>
						)}

						{error && <p style={{ margin: '0 0 14px', padding: '12px 14px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '14px' }}>{error}</p>}

						<div className="wiz-actions">
							<button type="button" className="wiz-back" onClick={() => { setPhase('setup'); setFormStep(3); }} disabled={phase === 'starting'}>← Ajustes</button>
							<button
								type="button"
								onClick={() => void approveReviewedGeneration()}
								disabled={phase === 'starting'}
								className="url-batch-submit-btn"
							>
								{phase === 'starting' ? <><span className="studio-spinner small" aria-hidden="true" /> Generando imagen…</> : <span>Aprobar y generar ✓ · {count} {count === 1 ? 'crédito' : 'créditos'}</span>}
							</button>
						</div>
					</>}
				</section>
			</div>
		</div>
	);
}
