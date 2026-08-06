import React, { useEffect, useState, useRef } from 'react';
import { subjectModeDesde, alcanceDesde, type Alcance } from '../../lib/creattia/generation-pipeline';
import UrlInput from './UrlInput';
import { signGenerationPaths } from '../../lib/creattia/generation-image';
import { supabase } from '../../lib/creattia/supabase-browser';
import ProductAssetReview, { type ProductReviewMedia } from './ProductAssetReview';
import { useReferenceUrls } from '../../lib/creattia/reference-urls';

// Cuántos anuncios se generan a la vez. Cada uno es una request independiente:
// si una falla o se corta, las demás siguen y esa se puede reintentar sola.
// 5 verificado contra OpenAI sin toparse con límites de tasa.
const WORKER_CONCURRENCY = 5;

/** Dispara un worker por generación pendiente, con concurrencia limitada. */
async function driveBatchWorkers(
	generationIds: string[],
	accessToken: string,
	onSettled?: (id: string, ok: boolean) => void,
	onStart?: (id: string) => void,
) {
	const queue = [...generationIds];
	const runNext = async (): Promise<void> => {
		const id = queue.shift();
		if (!id) return;
		if (onStart) onStart(id);
		try {
			const response = await fetch('/api/creativos/batch-worker', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
				body: JSON.stringify({ generationId: id }),
			});
			if (onSettled) onSettled(id, response.ok);
		} catch {
			if (onSettled) onSettled(id, false);
		}
		return runNext();
	};
	await Promise.all(Array.from({ length: Math.min(WORKER_CONCURRENCY, queue.length) }, runNext));
}

export { driveBatchWorkers };


/**
 * Desplegable propio. El <select> nativo no sirve acá: en Windows los emoji de
 * bandera dentro de un <option> se dibujan como las dos letras del código
 * ("AR Español" en vez de "🇦🇷 Español"), porque el sistema no trae los glifos.
 */
export const BatchSelect: React.FC<{
	label: string;
	value: string;
	options: Array<{ value: string; label: string; cc?: string; emoji?: string; hint?: string }>;
	onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => {
	const [open, setOpen] = useState(false);
	const boxRef = useRef<HTMLDivElement | null>(null);
	const current = options.find((option) => option.value === value) || options[0];

	useEffect(() => {
		if (!open) return;
		const close = (event: MouseEvent) => {
			if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, [open]);

	const face = (option: { cc?: string; emoji?: string }) => option.cc
		? <img className="bsel-flag" src={`https://flagcdn.com/w40/${option.cc}.png`} alt="" width={22} height={16} loading="lazy" />
		: <span className="bsel-emoji" aria-hidden>{option.emoji}</span>;

	return (
		<div className="batch-select-field" ref={boxRef}>
			<span className="picker-label">{label}</span>
			<div className="bsel">
				<button type="button" className={`bsel-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
					{face(current)}
					<span className="bsel-value">{current.label}</span>
					<svg className="bsel-arrow" width="11" height="7" viewBox="0 0 12 8" aria-hidden>
						<path d="M1 1.5 6 6.5l5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
					</svg>
				</button>
				{open && (
					<div className="bsel-menu" role="listbox">
						{options.map((option) => (
							<button
								key={option.value}
								type="button"
								role="option"
								aria-selected={option.value === value}
								className={`bsel-option ${option.value === value ? 'active' : ''}`}
								onClick={() => { onChange(option.value); setOpen(false); }}
							>
								{face(option)}
								<span className="bsel-option-text">
									<span>{option.label}</span>
									{option.hint && <small>{option.hint}</small>}
								</span>
								{option.value === value && <span className="bsel-check" aria-hidden>✓</span>}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

type UrlBatchSectionProps = {
	onSelectRemodel?: (generation: any, templateId?: number) => void;
	userCredits?: number;
	onRefreshCredits?: () => void;
	onNavigateToPlans?: () => void;
	initialUrl?: string;
	session?: any;
	onBatchCreated?: (generations: any[], batchId: string) => void;
	onGenerationRequested?: () => void;
};

type BatchItem = {
	id: string;
	templateId?: number;
	title: string;
	imageUrl?: string;
	status: 'processing' | 'completed' | 'failed';
	error?: string;
	// Anuncio ganador de la biblioteca que este creativo está clonando.
	referenceUrl?: string;
	referenceName?: string;
	referenceLeaf?: string;
};

// Nombre legible del tipo de anuncio ganador.


// Referencia ganadora propuesta para el lote (paso de revisión).
type WinnerRef = {
	imagePath: string;
	name: string;
	notes?: string;
	leaf?: string;
	niches?: string[];
	templateId?: number | null;
	domain?: string;
};

type BatchPreview = {
	product: { id: string; name: string; description?: string; priceText?: string; imageUrl?: string; imageUrls?: string[]; videoUrls?: string[]; media?: ProductReviewMedia[]; productUrl?: string };
	count: number;
	wearable?: boolean;
	hasImage?: boolean;
	/** La página entera: permite ofrecer "la tienda" igual que en el individual. */
	page?: {
		pageType?: 'product' | 'service' | 'catalog';
		store?: { name?: string; evidence?: string; palette?: Record<string, string> } | null;
		products?: Array<{ name: string; priceText?: string; imageUrls?: string[]; productUrl?: string }>;
	} | null;
};

// Formatos visuales del paso final, alineados con el generador individual.
// Se mantienen los alias que ya entiende el worker para no romper lotes existentes.
const FORMAT_CARDS = [
	{ value: 'original', title: 'Original', label: 'Igual al ganador', ratio: 'Original', shape: 'original' },
	{ value: 'square', title: '1:1', label: 'Feed cuadrado', ratio: '1:1', shape: 'square' },
	{ value: 'portrait', title: '3:4', label: 'Feed vertical', ratio: '3:4', shape: 'portrait' },
	{ value: 'story', title: '9:16', label: 'Historia / Reel', ratio: '9:16', shape: 'story' },
	{ value: 'landscape', title: '4:3', label: 'Horizontal', ratio: '4:3', shape: 'landscape' },
	{ value: '16:9', title: '16:9', label: 'Panoramico', ratio: '16:9', shape: 'wide' },
];

export const BRAND_OPTIONS = [
	{ value: 'url', label: 'Marca de la URL', icon: 'link', hint: 'Usa el nombre, logo y estilo detectados en la URL del producto' },
	{ value: 'mine', label: 'Mi marca', icon: 'brand', hint: 'Usa la identidad guardada en Mi marca' },
	{ value: 'none', label: 'Solo producto', icon: 'none', hint: 'Sin nombre, logo ni redes de marca' },
];

// Idioma de los textos que se adaptan dentro del creativo ganador.
export const LANGUAGE_OPTIONS = [
	{ value: 'es', label: 'Español', cc: 'ar' },
	{ value: 'en', label: 'Inglés', cc: 'us' },
	{ value: 'pt', label: 'Portugués', cc: 'br' },
	{ value: 'it', label: 'Italiano', cc: 'it' },
	{ value: 'fr', label: 'Francés', cc: 'fr' },
	{ value: 'de', label: 'Alemán', cc: 'de' },
];

export const STYLE_OPTIONS = [
	{ value: 'winner', label: 'Del anuncio ganador', emoji: '🏆', hint: 'Conserva lo que hizo funcionar al original' },
	{ value: 'url', label: 'De la URL', emoji: '🔗', hint: 'Usa los colores y la tipografía detectados en la URL' },
	{ value: 'brand', label: 'De mi marca', emoji: '🎨', hint: 'Usa los colores y la tipografía de tu marca' },
];

export const brandSourceDescription = (source: string) => {
	if (source === 'mine') return 'Usa nombre, logo, colores y estilo guardados en Mi marca.';
	if (source === 'none') return 'No agrega nombre, logo ni redes: el foco queda únicamente en el producto.';
	return 'Toma de la URL el nombre y la identidad que encuentre.';
};

export function BrandOptionIcon({ icon, size = 19 }: { icon: string; size?: number }) {
	const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
	if (icon === 'link') return <svg {...common}><path d="M10 13.5a4 4 0 0 0 5.7.2l2.1-2.1a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10.5a4 4 0 0 0-5.7-.2l-2.1 2.1a4 4 0 0 0 5.7 5.7l1.2-1.2"/></svg>;
	if (icon === 'brand') return <svg {...common}><path d="M4 20h16"/><path d="M5.5 20V8.5L12 4l6.5 4.5V20"/><path d="M8.5 11h7M8.5 14h7M8.5 17h3"/></svg>;
	return <svg {...common}><circle cx="12" cy="12" r="8.5"/><path d="m5.8 5.8 12.4 12.4"/></svg>;
}



export const UrlBatchSection: React.FC<UrlBatchSectionProps> = ({
	onSelectRemodel,
	userCredits = 0,
	onRefreshCredits,
	onNavigateToPlans,
	initialUrl = '',
	session,
	onBatchCreated,
	onGenerationRequested,
}) => {
	const [url, setUrl] = useState(initialUrl);
	// Dos formas de arrancar: URL o carga manual (con imágenes opcionales).
	const [mode, setMode] = useState<'url' | 'manual'>('url');
	const [manualName, setManualName] = useState('');
	const [manualDescription, setManualDescription] = useState('');
	const [manualPrice, setManualPrice] = useState('');
	const [count, setCount] = useState(5);
	const [format, setFormat] = useState('original');
	const [language, setLanguage] = useState('es');
	const [colorMode, setColorMode] = useState('winner');
	/**
	 * De qué habla el lote y con qué colores, igual que en la generación
	 * individual. Antes el flujo múltiple no preguntaba ninguna de las dos cosas:
	 * la revisión mostraba un solo producto sin opciones, así que no había forma
	 * de decir "esto habla de la tienda" ni de corregir un color mal detectado.
	 */
	const [alcanceOverride, setAlcanceOverride] = useState<Alcance | null>(null);
	const [paletteOverride, setPaletteOverride] = useState<Record<string, string>>({});
	const [typoMode, setTypoMode] = useState('winner');
	const [brandSource, setBrandSource] = useState('url');
	const [includeLogo, setIncludeLogo] = useState(false);
	const [extraImages, setExtraImages] = useState<File[]>([]);
	const [extraImagePreviews, setExtraImagePreviews] = useState<string[]>([]);

	const [isGenerating, setIsGenerating] = useState(false);
	const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
	const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
	const [productName, setProductName] = useState<string>('');
	const [error, setError] = useState<string | null>(null);
	const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

	// Paso 2: revisión de las referencias ganadoras antes de gastar créditos.
	const [step, setStep] = useState<'form' | 'review' | 'results'>('form');
	// El formulario es secuencial: primero la cantidad, después el producto.
	// La revisión tiene dos pantallas: elegir referencias y después cómo salen.
	const [reviewStep, setReviewStep] = useState<1 | 2>(1);
	// El formulario vuelve a tener dos pasos: primero la cantidad, después qué
	// se promociona. Son decisiones distintas y mezclarlas cargaba la pantalla.
	const [formStep, setFormStep] = useState<1 | 2>(1);
	const [isScanning, setIsScanning] = useState(false);
	const [preview, setPreview] = useState<BatchPreview | null>(null);
	const [selected, setSelected] = useState<WinnerRef[]>([]);
	// El bucket de referencias es privado: el servidor firma cada miniatura.
	const winnerUrls = useReferenceUrls(selected.map((winner) => winner.imagePath));

	/** Los colores que se detectaron en la web de la marca, si los hubo. */
	const paletaDetectada: Record<string, string> | null = (preview?.page?.store as any)?.palette || null;

	/**
	 * De qué habla el lote. La persona elige el alcance —todo el negocio o algo
	 * puntual— y si eso se puede fotografiar lo deduce el sistema.
	 */
	const sujeto = (() => {
		const detectado = (preview?.page?.pageType as any) || 'product';
		if (!alcanceOverride) return detectado;
		const conFotos = Boolean(preview?.product?.media?.length || preview?.page?.products?.length);
		return subjectModeDesde(alcanceOverride, conFotos);
	})();

	/**
	 * Lo que se muestra al revisar.
	 *
	 * Con una ficha es el producto y sus fotos. Con una tienda son los productos
	 * que se encontraron, para que se vea de qué se va a hablar: antes se mostraba
	 * uno solo aunque la página tuviera veinte.
	 */
	const productosDetectados = (() => {
		const delCatalogo = preview?.page?.products || [];
		if (sujeto === 'catalog' && delCatalogo.length > 1) {
			return delCatalogo.map((item, index) => ({
				id: `catalogo-${index}`,
				name: item.name,
				price_text: item.priceText || '',
				product_url: item.productUrl || '',
				imageUrls: item.imageUrls || [],
			}));
		}
		return preview?.product ? [preview.product as any] : [];
	})();
	const [spares, setSpares] = useState<WinnerRef[]>([]);
	// Todo lo que el usuario ya vio en esta sesión de revisión: ninguna referencia
	// se repite, ni siquiera después de descartarla.
	const seenPathsRef = useRef<Set<string>>(new Set());
	// Bloqueo por tarjeta, no global: antes una sola en curso dejaba muertos los
	// botones de todas las demás, y parecía que había que hacer doble clic.
	const [replacing, setReplacing] = useState<Set<string>>(new Set());
	const refillingRef = useRef(false);

	const pollRef = useRef<NodeJS.Timeout | null>(null);
	// Momento en que arrancó cada imagen: la barra avanza con el tiempo real de
	// cada una, no a saltos de 1/N cuando alguna termina.

	useEffect(() => {
		if (initialUrl && !url) {
			setUrl(initialUrl);
		}
	}, [initialUrl]);

	// Manejo de carga de fotos extra
	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!e.target.files?.length) return;
		const files = Array.from(e.target.files).slice(0, 4);
		setExtraImages((prev) => [...prev, ...files].slice(0, 5));

		const newPreviews = files.map((f) => URL.createObjectURL(f));
		setExtraImagePreviews((prev) => [...prev, ...newPreviews].slice(0, 5));
	};

	const removeExtraImage = (index: number) => {
		setExtraImages((prev) => prev.filter((_, i) => i !== index));
		setExtraImagePreviews((prev) => prev.filter((_, i) => i !== index));
	};

	const getAccessToken = async () => {
		let accessToken = session?.access_token || '';
		if (!accessToken && supabase) {
			try {
				const { data: sessData } = await supabase.auth.getSession();
				accessToken = sessData.session?.access_token || '';
			} catch { /* ignore */ }
		}
		return accessToken;
	};

	// PASO 1 — Analizar el producto y proponer las referencias ganadoras.
	// No cobra créditos: solo devuelve los ganadores para que el usuario revise.
	const handleScan = async (e: React.FormEvent) => {
		e.preventDefault();
		if (mode === 'url' && !url.trim()) {
			setError('Ingresá la URL del producto para continuar.');
			return;
		}
		if (mode !== 'url' && !manualName.trim()) {
			setError('Escribí al menos el nombre de lo que querés promocionar.');
			return;
		}
		if (userCredits < count) {
			setError(`No tenés créditos suficientes (${userCredits} disponible, ${count} requeridos). Comprá un paquete de créditos o elegí un plan para generar tus anuncios.`);
			return;
		}

		setError(null);
		setIsScanning(true);
		setBatchItems([]);
		setProductName('');

		try {
			const formData = new FormData();
			formData.append('mode', mode);
			formData.append('count', String(count));
			if (mode === 'url') formData.append('productUrl', url.trim());
			else {
				formData.append('productName', manualName.trim());
				formData.append('productDescription', manualDescription.trim());
				if (manualPrice.trim()) formData.append('productPriceText', manualPrice.trim());
			}
			extraImages.forEach((file) => formData.append('extraImages', file));

			const accessToken = await getAccessToken();
			const response = await fetch('/api/creativos/batch-url', {
				method: 'POST',
				headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
				body: formData,
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'No se pudo analizar el producto.');

			setPreview({ product: data.product, count: data.count, wearable: data.wearable, hasImage: data.hasImage, page: data.page || null });
			// Lo detectado manda, pero se puede corregir en la revisión.
			setAlcanceOverride(null);
			setPaletteOverride({});
			seenPathsRef.current = new Set<string>([
				...(data.winners || []).map((w: WinnerRef) => w.imagePath),
				...(data.spares || []).map((w: WinnerRef) => w.imagePath),
			]);
			setSelected(data.winners || []);
			setSpares(data.spares || []);
			setProductName(data.product?.name || 'Producto');
			setStep('review');
			setReviewStep(1);
			// Se precargan suplentes de fondo para que el primer Reemplazar sea
			// instantáneo en vez de esperar 5s al servidor.
			void refillSpares(6);
		} catch (err: any) {
			console.error('Error analizando el producto:', err);
			setError(err.message || 'Ocurrió un error al conectar con el servidor.');
		} finally {
			setIsScanning(false);
		}
	};

	/**
	 * Reemplaza una referencia por otra al azar de TODA la biblioteca.
	 *
	 * Se pide al servidor en el momento en vez de tirar de un banco precalculado:
	 * ese banco se agotaba enseguida y limitaba las opciones. Los anuncios que
	 * guardaste tienen prioridad, y nada se repite dentro de la misma revisión.
	 */
	/** Trae más suplentes en segundo plano para que el reemplazo sea instantáneo. */
	const refillSpares = async (want = 6) => {
		if (refillingRef.current) return;
		refillingRef.current = true;
		try {
			const accessToken = await getAccessToken();
			const savedPaths = (() => {
				try { return JSON.parse(window.localStorage.getItem(`creattia-liked-scraped-v1:${session?.user?.id || 'anon'}`) || '[]'); }
				catch { return []; }
			})();
			const response = await fetch('/api/creativos/next-reference', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
				body: JSON.stringify({
					exclude: Array.from(seenPathsRef.current),
					savedPaths,
					wearable: preview?.wearable !== false,
					hasImage: preview?.hasImage !== false,
					count: want,
				}),
			});
			const data = await response.json();
			const fresh: WinnerRef[] = data.winners || [];
			fresh.forEach((winner) => seenPathsRef.current.add(winner.imagePath));
			if (fresh.length) setSpares((prev) => [...prev, ...fresh]);
		} catch { /* si falla, el próximo reemplazo lo pide igual */ }
		finally { refillingRef.current = false; }
	};

	/**
	 * Reemplaza una referencia por otra al azar de toda la biblioteca.
	 *
	 * Es instantáneo mientras haya suplentes en memoria, y el banco se rellena
	 * solo en segundo plano. Solo se espera al servidor si el banco quedó vacío.
	 */
	const discardWinner = async (imagePath: string) => {
		const index = selected.findIndex((winner) => winner.imagePath === imagePath);
		if (index === -1 || replacing.has(imagePath)) return;

		// Camino rápido: hay suplente, se cambia en el acto.
		if (spares.length) {
			const [next, ...rest] = spares;
			setSelected((prev) => prev.map((winner) => (winner.imagePath === imagePath ? next : winner)));
			setSpares(rest);
			seenPathsRef.current.add(next.imagePath);
			if (rest.length < 4) void refillSpares();
			return;
		}

		// Banco vacío: se pide al momento y se muestra que está buscando.
		setReplacing((prev) => new Set(prev).add(imagePath));
		try {
			const accessToken = await getAccessToken();
			const savedPaths = (() => {
				try { return JSON.parse(window.localStorage.getItem(`creattia-liked-scraped-v1:${session?.user?.id || 'anon'}`) || '[]'); }
				catch { return []; }
			})();
			const response = await fetch('/api/creativos/next-reference', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
				body: JSON.stringify({
					exclude: Array.from(seenPathsRef.current),
					savedPaths,
					wearable: preview?.wearable !== false,
					hasImage: preview?.hasImage !== false,
					count: 5,
				}),
			});
			const data = await response.json();
			const fresh: WinnerRef[] = data.winners || [];
			fresh.forEach((winner) => seenPathsRef.current.add(winner.imagePath));
			if (!fresh.length) {
				setError('No quedan más referencias compatibles en la biblioteca.');
				return;
			}
			setSelected((prev) => prev.map((winner) => (winner.imagePath === imagePath ? fresh[0] : winner)));
			setSpares((prev) => [...prev, ...fresh.slice(1)]);
		} catch {
			setError('No se pudo buscar otra referencia. Probá de nuevo.');
		} finally {
			setReplacing((prev) => { const next = new Set(prev); next.delete(imagePath); return next; });
		}
	};

	// PASO 2 — Confirmar: acá se cobran los créditos y arranca la generación.
	const handleConfirmGeneration = async () => {
		if (!preview || !selected.length) return;
		if (userCredits < selected.length) {
			setError(`Necesitás ${selected.length} créditos para generar este lote. Comprá un paquete o elegí un plan para continuar.`);
			return;
		}
		setError(null);
		setIsGenerating(true);
		onGenerationRequested?.();

		try {
			const accessToken = await getAccessToken();
			const response = await fetch('/api/creativos/batch-start', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
				},
				body: JSON.stringify({
					mode,
					productId: preview.product.id,
					productName: preview.product.name,
					productDescription: preview.product.description,
					winnerPaths: selected.map((winner) => winner.imagePath),
					format,
					language,
					colorMode,
					typoMode,
					brandSource,
					includeLogo,
					subjectMode: sujeto,
					...(Object.keys(paletteOverride).length ? { paletteOverride } : {}),
				}),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || 'No se pudo iniciar la generación del lote.');

			setCurrentBatchId(data.batchId);
			const initialItems: BatchItem[] = (data.generations || []).map((gen: any) => ({
				id: gen.id,
				templateId: gen.template_id,
				title: gen.title,
				status: 'processing',
				referenceUrl: undefined,
				referenceName: gen.settings_snapshot?.referenceName,
				referenceLeaf: gen.settings_snapshot?.referenceLeaf,
			}));
			setBatchItems(initialItems);
			setStep('results');

			if (onRefreshCredits) onRefreshCredits();
			if (onBatchCreated && data.generations?.length) onBatchCreated(data.generations, data.batchId);

			startPollingBatch(data.batchId, initialItems);

			// Un worker por anuncio, de a 4 en paralelo. Si el usuario recarga la
			// página, la barrida de reanudación de la app retoma las que falten.
			void driveBatchWorkers(
				initialItems.map((item) => item.id),
				accessToken,
				undefined,
			);
		} catch (err: any) {
			console.error('Error al generar lote por URL:', err);
			setError(err.message || 'Ocurrió un error al conectar con el servidor.');
			setIsGenerating(false);
		}
	};

	const startPollingBatch = (batchId: string, initialItems: BatchItem[]) => {
		if (pollRef.current) clearInterval(pollRef.current);

		let attempts = 0;

		pollRef.current = setInterval(async () => {
			attempts += 1;
			try {
				if (!supabase) return;

				const client = supabase;
				const { data: rows, error: fetchErr } = await client
					.from('creative_generations')
					.select('id,template_id,title,status,output_path,error_code,output_index,settings_snapshot')
					.eq('batch_id', batchId)
					.order('output_index');

				if (fetchErr || !rows || rows.length === 0) return;

				const signed = await signGenerationPaths(client, rows.map((row: any) => row.output_path));

				const updatedItems: BatchItem[] = rows.map((row: any) => {
					const snapshot = row.settings_snapshot || {};
					return {
						id: row.id,
						templateId: row.template_id,
						title: row.title,
						status: row.status as any,
						imageUrl: row.output_path ? signed.get(row.output_path) : undefined,
						error: row.error_code,
						referenceUrl: undefined,
						referenceName: snapshot.referenceName,
						referenceLeaf: snapshot.referenceLeaf,
					};
				});

				setBatchItems(updatedItems);

				const allFinished = updatedItems.length >= initialItems.length && updatedItems.every((item) => item.status === 'completed' || item.status === 'failed');
				if (allFinished || attempts > 120) {
					if (pollRef.current) clearInterval(pollRef.current);
					setIsGenerating(false);
					if (onRefreshCredits) onRefreshCredits();
				}
			} catch (err) {
				console.error('Polling error:', err);
			}
		}, 3000);
	};

	const completedCount = batchItems.filter((i) => i.status === 'completed').length;
	const failedCount = batchItems.filter((i) => i.status === 'failed').length;
	const totalCount = batchItems.length || count;
	/**
	 * Progreso real y continuo.
	 *
	 * Lo terminado cuenta entero; lo que está en curso aporta una fracción según
	 * cuánto lleva corriendo contra lo que suele tardar, con tope en 0.92 para que
	 * una imagen nunca se muestre como lista antes de estarlo. Así la barra se
	 * mueve todo el tiempo en vez de saltar de 0 a 50 a 100.
	 */
	const ESPERADO_MS = 50_000;
	// Estimación de lo que falta, para no dejar al usuario sin referencia.
	const restantes = totalCount - completedCount - failedCount;
	const tandas = Math.ceil(restantes / WORKER_CONCURRENCY);
	const segundosRestantes = Math.max(0, Math.round((tandas * ESPERADO_MS) / 1000));

	// Reloj que redibuja la barra mientras haya algo generándose.
	return (
		<div className="url-batch-container">
			{/* Banner / Header */}
			<div className="url-batch-header">
				<h2 className="url-batch-title">Creá anuncios que ya funcionan, con tu producto</h2>
			</div>

			{/* Formulario Principal */}
			{/* PASO 1 — Cuántos anuncios y qué vas a promocionar. Nada más:
			    formato, idioma y estilo no influyen en qué referencias se traen,
			    así que se piden recién en el paso 2. */}
			{/* Indicador de progreso: siempre visible, marca dónde estás. */}
			<ol className="wiz-progress" aria-label="Progreso">
				{[
					{ n: 1, label: 'Cantidad', active: step === 'form' && formStep === 1, done: step !== 'form' || formStep > 1 },
					{ n: 2, label: 'Tu producto', active: step === 'form' && formStep === 2, done: step !== 'form' },
					{ n: 3, label: 'Referencias', active: step === 'review' && reviewStep === 1, done: step === 'results' || (step === 'review' && reviewStep === 2) },
					{ n: 4, label: 'Cómo salen', active: step === 'review' && reviewStep === 2, done: step === 'results' },
				].map((item) => (
					<li key={item.n} className={`wiz-progress-item ${item.active ? 'active' : ''} ${item.done ? 'done' : ''}`}>
						<span className="wiz-progress-dot">{item.done ? '✓' : item.n}</span>
						<span className="wiz-progress-label">{item.label}</span>
					</li>
				))}
			</ol>

			{step === 'form' && (
			<form onSubmit={handleScan} className="url-batch-form">
				<div className="wiz-step" hidden={formStep !== 1}>
					<div className="wiz-body">
						<label className="picker-label">¿Cuántos anuncios querés crear?</label>
						<div className="picker-options">
							{[3, 5, 10, 15].map((num) => (
								<button
									key={num}
									type="button"
									className={`picker-pill ${count === num ? 'active' : ''}`}
									onClick={() => setCount(num)}
								>
									<span className="pill-count">{num} Anuncios</span>
									<span className="pill-sub">{num} créditos</span>
								</button>
							))}
						</div>
					</div>
				</div>

				<div className="wiz-step" hidden={formStep !== 2}>
					<div className="wiz-body">
						<label className="picker-label">¿Qué vas a promocionar?</label>
						<p className="wiz-help">
							Lo más rápido es pegar el link de tu producto: leemos la página sola y sacamos foto,
							precio y descripción.
						</p>
						<div className="wiz-tabs">
							{([
								['url', '🔗', 'URL', 'Analizamos tu página'],
								['manual', '✍️', 'A mano', 'Cargás los datos'],
							] as const).map(([value, icon, label, hint]) => (
								<button
									key={value}
									type="button"
									className={`wiz-tab ${mode === value ? 'active' : ''}`}
									onClick={() => setMode(value)}
								>
									<span className="wiz-tab-icon">{icon}</span>
									<span className="wiz-tab-label">{label}</span>
									<small>{hint}</small>
								</button>
							))}
						</div>

						{mode === 'url' && (
							<UrlInput
								value={url}
								onChange={setUrl}
								placeholder="Pegá acá el link de tu producto"
								ariaLabel="Link del producto"
							/>
						)}

						{mode === 'manual' && (
							<div className="wiz-fields">
								<input
									className="wiz-input"
									placeholder="¿Qué vendés? Ej: Zapatillas de running Nova"
									value={manualName}
									onChange={(e) => setManualName(e.target.value)}
								/>
								<textarea
									className="wiz-input"
									rows={3}
									placeholder="Descripción del producto: materiales, medidas, beneficios reales."
									value={manualDescription}
									onChange={(e) => setManualDescription(e.target.value)}
								/>
								{mode === 'manual' && (
									<>
										<input
											className="wiz-input"
											placeholder="Precio (opcional). Ej: $38.50"
											value={manualPrice}
											onChange={(e) => setManualPrice(e.target.value)}
										/>
										<div className="image-uploader-box">
											<input
												type="file"
												accept="image/png, image/jpeg, image/webp"
												multiple
												onChange={handleImageChange}
												id="wiz-manual-imgs"
												className="hidden-file-input"
											/>
											<label htmlFor="wiz-manual-imgs" className="uploader-label">
													<span>📷 Imágenes del producto (opcional · podés subir varias)</span>
											</label>
										</div>
									</>
								)}
							</div>
						)}

						{mode === 'manual' && extraImagePreviews.length > 0 && (
							<p className="wiz-hint">Podés subir una o varias imágenes; también podés continuar sin ninguna.</p>
						)}

						{extraImagePreviews.length > 0 && (
							<div className="extra-previews-grid">
								{extraImagePreviews.map((src, idx) => (
									<div key={idx} className="preview-thumb">
										<img src={src} alt="Foto del producto" />
										<button type="button" className="remove-img-btn" onClick={() => removeExtraImage(idx)}>✕</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{error && (
					<div className="url-batch-error" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
						<span>{error}</span>
						{onNavigateToPlans && userCredits < count && (
							<button
								type="button"
								onClick={onNavigateToPlans}
								style={{
									alignSelf: 'flex-start', padding: '9px 18px', borderRadius: '10px', border: 0,
									background: '#744bde', color: '#ffffff', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
								}}
							>
								💳 Comprar Créditos / Ver Planes
							</button>
						)}
					</div>
				)}

				{formStep === 1 && (
					<button type="button" className="url-batch-submit-btn wiz-continue-btn" onClick={() => { setError(null); setFormStep(2); }}>
						<span>Continuar</span>
					</button>
				)}

				{formStep === 2 && (
				<div className="wiz-actions">
						<button type="button" className="wiz-back" onClick={() => { setError(null); setFormStep(1); }} disabled={isScanning}>
							← Atrás
						</button>
						<button
							type="submit"
							className="url-batch-submit-btn"
							disabled={isScanning || (mode === 'url' ? !url.trim() : !manualName.trim())}
						>
							{isScanning ? (
								<><span className="studio-spinner small" aria-hidden="true" /> Buscando anuncios…</>
							) : (
								<>
									<span>Buscar {count} anuncios</span>
									<span className="btn-credits-badge">Gratis</span>
								</>
							)}
						</button>
					</div>
				)}
			</form>
			)}

			{/* PASO 2 — Revisión de las referencias ganadoras elegidas */}
			{step === 'review' && preview && (
				<div className="active-batch-results">
					<div className="batch-status-header">
						<div className="batch-status-info">
							<h3>{reviewStep === 1
								? `Estos ${selected.length} anuncios le funcionaron a otras marcas`
								: 'Últimos detalles antes de generar'}</h3>
							<p className="product-tag">
								Producto: <strong>{preview.product?.name}</strong>
							</p>
							{reviewStep === 1 && (
								<p style={{ fontSize: '12.5px', color: '#6b6478', marginTop: '6px', maxWidth: '62ch' }}>
									Vamos a rehacer cada uno con tu producto: se mantiene el diseño y cambia todo lo demás.
									No importa que sean de otro rubro. Si alguno no te convence, tocá <strong>Reemplazar</strong> y
									entra otro al instante.
								</p>
							)}
						</div>
						<div className="batch-counter">
							<span>{selected.length} referencias</span>
						</div>
					</div>

					{reviewStep === 1 && mode === 'url' && (Boolean(preview.product?.media?.length) || Boolean(preview.page?.products?.length)) && (
						<ProductAssetReview
							products={productosDetectados}
							isCatalog={sujeto === 'catalog'}
							storeName={preview.page?.store?.name}
							detectionReason={(preview.page?.store as any)?.evidence}
							subject={alcanceDesde(sujeto)}
							detectedSubject={alcanceDesde(preview.page?.pageType)}
						/>
					)}

					{reviewStep === 1 && (
					<div className="ref-grid">
						{selected.map((winner, index) => (
							<div key={winner.imagePath} className="ref-card">
								<button
									type="button"
									className="ref-thumb"
									onClick={() => setPreviewModalUrl(winnerUrls[winner.imagePath] || '')}
									title="Ver el anuncio ganador en grande"
								>
									<img src={winnerUrls[winner.imagePath] || ''} alt={winner.name} loading="lazy" />
									<span className="ref-index">{index + 1}</span>
								</button>
								<div className="ref-foot single">
									<button
										type="button"
										className="ref-replace"
										onClick={() => discardWinner(winner.imagePath)}
										disabled={replacing.has(winner.imagePath)}
										title="Cambiar por otro anuncio ganador al azar de la biblioteca"
									>
										{replacing.has(winner.imagePath) ? <><span className="studio-spinner small" aria-hidden="true" /> Buscando…</> : 'Reemplazar'}
									</button>
								</div>
							</div>
						))}
					</div>
					)}

					{/* Los ajustes de generación viven acá: no cambian qué referencias se
				    eligen, solo cómo se construye cada anuncio. */}
				{reviewStep === 2 && (
				<div className="wiz-step" style={{ marginTop: '20px' }}>
					<div className="wiz-body">
						<label className="picker-label">Últimos detalles</label>
						<p className="wiz-help">Todo esto ya viene elegido. Cambialo solo si querés algo distinto.</p>
						<div className="batch-details-layout">
							<div className="batch-format-block">
								<span className="picker-label">Formato</span>
								<p className="batch-detail-help">Elegí dónde se va a publicar el anuncio.</p>
								<div className="batch-format-grid">
									{FORMAT_CARDS.map((item) => (
										<button key={item.value} type="button" className={`batch-format-card ${format === item.value ? 'active' : ''}`} onClick={() => setFormat(item.value)} aria-pressed={format === item.value}>
											<span className={`batch-format-shape shape-${item.shape}`} aria-hidden="true"><i /></span>
											<span className="batch-format-copy"><strong>{item.title}</strong><small>{item.label}</small></span>
											<em>{item.ratio}</em>
											{format === item.value && <b aria-hidden="true">✓</b>}
										</button>
									))}
								</div>
							</div>
							<BatchSelect label="Idioma de los textos" value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
							<div className="batch-brand-block">
								<span className="picker-label">¿De quién es el anuncio?</span>
								<p className="batch-detail-help">Elegí de dónde tomar el nombre y el logo. Los colores y la tipografía se eligen por separado.</p>
								<div className="batch-brand-options">
									{BRAND_OPTIONS.map((option) => (
										<button key={option.value} type="button" className={`batch-brand-option ${brandSource === option.value ? 'active' : ''}`} onClick={() => setBrandSource(option.value)} aria-pressed={brandSource === option.value}>
											<span className="batch-brand-icon" aria-hidden="true"><BrandOptionIcon icon={option.icon} /></span>
											<span><strong>{option.label}</strong><small>{option.hint}</small></span>
											{brandSource === option.value && <b aria-hidden="true">✓</b>}
										</button>
									))}
								</div>
								<small className="batch-brand-note">{brandSourceDescription(brandSource)}</small>
								{brandSource !== 'none' && (
									<div className="batch-style-group" style={{ marginTop: '12px' }}>
										<span className="picker-label">Logo en el anuncio</span>
										<div className="batch-style-options">
											<button type="button" className={!includeLogo ? 'active' : ''} onClick={() => setIncludeLogo(false)} aria-pressed={!includeLogo}>Sin logo</button>
										<button type="button" className={includeLogo ? 'active' : ''} onClick={() => setIncludeLogo(true)} aria-pressed={includeLogo}>Con logo de {brandSource === 'mine' ? 'Mi marca' : 'la URL'}</button>
										</div>
										<small className="batch-brand-note">{includeLogo ? 'Lo agregamos en el espacio del diseño cuando el anuncio tenga lugar para él.' : 'El anuncio sale solo con tu producto, sin logo ni marca de agua.'}</small>
									</div>
								)}
							</div>
							{/* De qué habla el lote. Va acá, con el idioma y los colores,
							    porque es la misma clase de decisión: primero se eligen las
							    referencias y después cómo salen. */}
							<div className="batch-style-group">
								<span className="picker-label">¿De qué habla?</span>
								<div className="batch-style-options">
									{([
										{ value: 'general', label: 'En general' },
										{ value: 'especifico', label: 'De algo puntual' },
									] as const).map((option) => (
										<button
											key={option.value}
											type="button"
											className={alcanceDesde(sujeto) === option.value ? 'active' : ''}
											aria-pressed={alcanceDesde(sujeto) === option.value}
											onClick={() => setAlcanceOverride(option.value)}
										>
											{option.label}
											{alcanceDesde(preview?.page?.pageType as any) === option.value && <em className="batch-detected-tag">detectado</em>}
										</button>
									))}
								</div>
								<small className="batch-brand-note">
									{alcanceDesde(sujeto) === 'general'
										? 'Los textos hablan del negocio completo: lo que ofrecés, para quién es y por qué elegirte.'
										: 'Los textos se centran en un producto o servicio concreto, con su nombre y sus datos.'}
								</small>
							</div>

							<div className="batch-style-group">
								<span className="picker-label">Colores</span>
								<div className="batch-style-options">{STYLE_OPTIONS.map((option) => <button key={option.value} type="button" className={colorMode === option.value ? 'active' : ''} onClick={() => setColorMode(option.value)} aria-pressed={colorMode === option.value}>{option.label}</button>)}</div>
								{/* Los colores detectados también se corrigen acá: el flujo
								    múltiple no los mostraba y salía con la identidad que la
								    detección hubiera agarrado, sin forma de revisarla. */}
								{colorMode !== 'winner' && paletaDetectada && (
									<div className="palette-editor">
										<small className="batch-brand-note">Estos son los colores que detectamos. Si alguno no es el de tu marca, tocalo y cambialo.</small>
										<div className="palette-swatches">
											{([['background', 'Fondo'], ['accent', 'Principal'], ['secondary', 'Secundario'], ['text', 'Texto']] as const).map(([role, roleLabel]) => {
												const value = paletteOverride[role] || paletaDetectada[role] || '';
												if (!value) return null;
												return (
													<label key={role} className={`palette-swatch${paletteOverride[role] ? ' is-edited' : ''}`}>
														<input type="color" value={value} onChange={(event) => setPaletteOverride((prev) => ({ ...prev, [role]: event.target.value }))} aria-label={`Color ${roleLabel}`} />
														<span>{roleLabel}</span>
														<em>{value}</em>
													</label>
												);
											})}
										</div>
										{Object.keys(paletteOverride).length > 0 && (
											<button type="button" className="palette-reset" onClick={() => setPaletteOverride({})}>Volver a los detectados</button>
										)}
									</div>
								)}
							</div>
							<div className="batch-style-group"><span className="picker-label">Tipografía</span><div className="batch-style-options">{STYLE_OPTIONS.map((option) => <button key={option.value} type="button" className={typoMode === option.value ? 'active' : ''} onClick={() => setTypoMode(option.value)} aria-pressed={typoMode === option.value}>{option.label}</button>)}</div></div>
						</div>

					</div>
				</div>
				)}

				<div className="wiz-actions" style={{ marginTop: '18px' }}>
					{reviewStep === 1 ? (
						<>
							<button
								type="button"
								className="wiz-back"
								onClick={() => { setStep('form'); setFormStep(1); setReviewStep(1); }}
								disabled={isGenerating}
							>
								← Cambiar producto
							</button>
							<div className="batch-continue-wrap">
								<button
									type="button"
									className="url-batch-submit-btn"
									onClick={() => setReviewStep(2)}
									disabled={!selected.length}
								>
									Continuar
								</button>
								<span className="batch-credit-note">Todavía no gastás créditos</span>
							</div>
						</>
					) : (
						<>
							<button type="button" className="wiz-back" onClick={() => setReviewStep(1)} disabled={isGenerating}>
								← Ver referencias
							</button>
							<div className="batch-continue-wrap">
								<button
									type="button"
									className="url-batch-submit-btn"
									onClick={handleConfirmGeneration}
									disabled={isGenerating || !selected.length}
								>
									{isGenerating ? <><span className="studio-spinner small" aria-hidden="true" /> Iniciando la generación…</> : `Generar ${selected.length} anuncios`}
								</button>
								{!isGenerating && <span className="batch-credit-note">{selected.length} {selected.length === 1 ? 'crédito' : 'créditos'}</span>}
							</div>
						</>
					)}
				</div>

					{error && (
						<div className="url-batch-error" style={{ marginTop: '14px' }}>
							<span>{error}</span>
							{onNavigateToPlans && userCredits < selected.length && (
								<button type="button" className="batch-credit-link" onClick={onNavigateToPlans}>Comprar créditos / Ver planes</button>
							)}
						</div>
					)}
				</div>
			)}

			{/* Barra de Progreso y Visualización del Lote Activo */}
			{batchItems.length > 0 && (
				<div className="active-batch-results">
					<div className="batch-status-header">
						<div className="batch-status-info">
							<h3>
								{isGenerating ? '⏳ Clonando anuncios ganadores…' : '✅ Lote de creativos completado'}
							</h3>
							{productName && <p className="product-tag">Producto: <strong>{productName}</strong></p>}
						</div>
						<div className="batch-counter" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
							<span>
								{completedCount} de {totalCount} listos
								{isGenerating && segundosRestantes > 0 && (
									<em style={{ fontStyle: 'normal', color: '#8b8496', fontWeight: 600 }}>
										{' '}· quedan ~{segundosRestantes < 60 ? `${segundosRestantes}s` : `${Math.ceil(segundosRestantes / 60)} min`}
									</em>
								)}
							</span>
							{!isGenerating && (
								<button
									type="button"
									onClick={() => {
										if (pollRef.current) clearInterval(pollRef.current);
										setStep('form');
										setFormStep(1);
										setReviewStep(1);
										setPreview(null);
										setSelected([]);
										setSpares([]);
										setBatchItems([]);
									}}
									style={{
										padding: '6px 12px', borderRadius: '9px', border: '2px solid #e6e0f2',
										background: '#fff', color: '#5f32cf', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
									}}
								>
									＋ Nuevo lote
								</button>
							)}
						</div>
					</div>

					{isGenerating && (
						<div className="batch-generating-status" role="status" aria-live="polite">
							<span className="studio-spinner small" aria-hidden="true" />
							<span>Generando tus anuncios…</span>
						</div>
					)}

					{/* Grilla de Anuncios Generados */}
					<div className="batch-grid">
						{batchItems.map((item, index) => (
								<div key={item.id || index} className="batch-card">
									<div className="batch-card-header">
										<span className="template-badge">Anuncio #{index + 1}</span>
									</div>

									<div className="batch-card-body">
										{item.status === 'processing' && (
											<div className="card-skeleton" style={{ position: 'relative', overflow: 'hidden' }}>
												{/* Se muestra el ganador que se está clonando, así se ve de dónde sale el anuncio */}
												{item.referenceUrl && (
													<img
														src={item.referenceUrl}
														alt=""
														loading="lazy"
															style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, filter: 'blur(1px)' }}
														/>
													)}
													<span className="studio-spinner" style={{ position: 'relative', width: '28px', height: '28px' }} aria-label="Generando anuncio" />
													<span style={{ position: 'relative' }}>Generando anuncio…</span>
											</div>
										)}

										{item.status === 'failed' && (
											<div className="card-error">
												<span>⚠️ Error en generación</span>
												<small>{item.error || 'Intentalo nuevamente'}</small>
											</div>
										)}

										{item.status === 'completed' && item.imageUrl && (
											<div className="card-image-wrap">
												<img
													src={item.imageUrl}
													alt={item.title}
													loading="lazy"
													onClick={() => setPreviewModalUrl(item.imageUrl || null)}
												/>
												<div className="card-overlay-actions">
													<button
														className="overlay-action-btn remodel"
														onClick={() => {
															if (onSelectRemodel) onSelectRemodel(item, item.templateId);
														}}
														title="Modelar / Rehacer en el Studio"
													>
														✨ Modelar / Rehacer
													</button>
													<a
														href={item.imageUrl}
														download={`creattia-anuncio-${item.id}.${item.imageUrl?.includes('.png') ? 'png' : 'jpg'}`}
														target="_blank"
														rel="noreferrer"
														className="overlay-action-btn download"
														title="Descargar imagen"
													>
														⬇️
													</a>
												</div>
											</div>
										)}
									</div>
								</div>
						))}
					</div>
				</div>
			)}

			{/* Modal de vista previa rápida */}
			{previewModalUrl && (
				<div className="image-preview-modal" onClick={() => setPreviewModalUrl(null)}>
					<div className="modal-content" onClick={(e) => e.stopPropagation()}>
						<button className="modal-close" onClick={() => setPreviewModalUrl(null)}>✕</button>
						<img src={previewModalUrl} alt="Vista previa del anuncio" />
					</div>
				</div>
			)}
		</div>
	);
};
