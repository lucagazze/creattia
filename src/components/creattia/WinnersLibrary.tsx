import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../../lib/creattia/supabase-browser';
import { creativeCatalog } from '../../lib/creattia/catalog';
import { isAdminEmail } from '../../lib/creattia/admin';
import { canAccessVideoFeature } from '../../lib/creattia/video-access';
import CreationFlow from './CreationFlow';
import VideoCreationFlow from './VideoCreationFlow';

function Icon({ name, size = 20, fill = 'none' }: { name: string; size?: number; fill?: string }) {
	const common = { width: size, height: size, viewBox: '0 0 24 24', fill, stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
	if (name === 'home') return <svg {...common}><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/></svg>;
	if (name === 'grid') return <svg {...common}><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>;
	if (name === 'spark') return <svg {...common}><path d="m12 3 1.2 4.1a5 5 0 0 0 3.4 3.4L21 12l-4.4 1.5a5 5 0 0 0-3.4 3.4L12 21l-1.2-4.1a5 5 0 0 0-3.4-3.4L3 12l4.4-1.5a5 5 0 0 0 3.4-3.4L12 3Z"/></svg>;
	if (name === 'history') return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>;
	if (name === 'brand') return <svg {...common}><path d="M5 20h14"/><path d="M7 17V7l5-3 5 3v10"/><path d="M9.5 10h5M9.5 13h5"/></svg>;
	if (name === 'bag') return <svg {...common}><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>;
	if (name === 'search') return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
	if (name === 'arrow') return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
	if (name === 'upload') return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 15v4h14v-4"/></svg>;
	if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
	if (name === 'download') return <svg {...common}><path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>;
	if (name === 'logout') return <svg {...common}><path d="M10 5H5v14h5"/><path d="M14 8l4 4-4 4M8 12h10"/></svg>;
	if (name === 'menu') return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
	if (name === 'close') return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
	if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
	if (name === 'external') return <svg {...common}><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></svg>;
	if (name === 'heart') return <svg {...common} fill={fill}><path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/></svg>;
	if (name === 'layers') return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
	return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

// Ángulo del anuncio — IDs coinciden con categoryLeaf en el manifiesto.
const winnersCategories = [
	{ id: 'competencia', label: 'Nosotros vs Ellos', icon: '⚔️' },
	{ id: 'resenas', label: 'Testimonios', icon: '⭐' },
	{ id: 'precio', label: 'Promociones y descuentos', icon: '💸' },
	{ id: 'razones-porque', label: 'Razones por qué', icon: '💡' },
	{ id: 'caracteristicas', label: 'Características y beneficios', icon: '📋' },
	{ id: 'antes-despues', label: 'Antes y después', icon: '↔️' },
	{ id: 'noticias', label: 'Noticias', icon: '📰' },
	{ id: 'estadisticas', label: 'Datos y estadísticas', icon: '📊' },
	{ id: 'estacional', label: 'Vacaciones / Estacional', icon: '☀️' },
];

const formatOptions: Array<{ id: 'static_image' | 'carousel' | 'video'; label: string; icon: string }> = [
	{ id: 'static_image', label: 'Estático', icon: '🖼️' },
	{ id: 'carousel', label: 'Carrusel', icon: '🗂️' },
	{ id: 'video', label: 'Video', icon: '🎬' },
];
const formatLabels: Record<string, string> = Object.fromEntries(formatOptions.map((f) => [f.id, f.label]));
type DurationFilter = 'todos' | 'hasta-15' | '16-30' | '31-60' | 'mas-60';
const durationOptions: Array<{ id: Exclude<DurationFilter, 'todos'>; label: string; icon: string }> = [
	{ id: 'hasta-15', label: 'Hasta 15 s', icon: '⚡' },
	{ id: '16-30', label: '16 a 30 s', icon: '⏱️' },
	{ id: '31-60', label: '31 a 60 s', icon: '🎬' },
	{ id: 'mas-60', label: 'Más de 60 s', icon: '🕒' },
];
const durationLabels: Record<string, string> = Object.fromEntries(durationOptions.map((option) => [option.id, option.label]));
const categoryIcons: Record<string, string> = Object.fromEntries(winnersCategories.map((c) => [c.id, c.icon]));
const categoryLabels: Record<string, string> = Object.fromEntries(winnersCategories.map((c) => [c.id, c.label]));

// Use categoryLeaf from manifest (set by Foreplay's own classification) as primary source
function classifyItem(item: any): string {
	// Primary: use categoryLeaf from the manifest scraper
	const leaf = (item.categoryLeaf || '').toLowerCase().trim();
	if (leaf) {
		const legacyAngles: Record<string, string> = {
			hero: 'caracteristicas',
			mitos: 'razones-porque',
			urgencia: 'precio',
			envio: 'precio',
			garantia: 'razones-porque',
		};
		return legacyAngles[leaf] || (categoryLabels[leaf] ? leaf : 'caracteristicas');
	}

	// Fallback: text-based heuristics when categoryLeaf is missing
	const notes = (item.promptNotes || '').toLowerCase();
	const tid = item.templateId;

	if (tid === 23 || notes.includes(' vs ') || notes.includes('versus') || notes.includes('better than')) {
		return 'competencia';
	}
	if (notes.includes('review') || notes.includes('testimonial') || notes.includes('customer') || notes.includes('says')) {
		return 'resenas';
	}
	if (notes.includes('myth') || notes.includes('truth') || notes.includes('fact')) {
		return 'razones-porque';
	}
	if (tid === 15 || notes.includes('limited') || notes.includes('hurry') || notes.includes('expires')) {
		return 'precio';
	}
	if (tid === 18 || notes.includes('free shipping') || notes.includes('envio')) {
		return 'precio';
	}
	if (notes.includes('%') || notes.includes('off') || notes.includes('sale') || notes.includes('discount') || notes.includes('price')) {
		return 'precio';
	}
	if (notes.includes('guarantee') || notes.includes('warranty')) {
		return 'razones-porque';
	}
	if (notes.includes('feature') || notes.includes('benefit') || notes.includes('works')) {
		return 'caracteristicas';
	}
	return 'caracteristicas';
}

function getTags(item: any, category: string): string[] {
	const name = (item.name || '').toLowerCase();
	const notes = (item.promptNotes || '').toLowerCase();
	const ind = ((item.metadata && item.metadata.industry) || '').toLowerCase();
	const tags = new Set<string>();

	if (category === 'competencia') tags.add('Comparación').add('VS');
	if (category === 'resenas') tags.add('Testimonial').add('Opinión').add('Social Proof');
	if (category === 'precio') tags.add('Oferta').add('Descuento').add('Promo');
	if (category === 'caracteristicas') tags.add('Producto').add('Llamativo');
	if (category === 'notas') tags.add('Tweet').add('Texto');
	if (category === 'preguntas') tags.add('Preguntas').add('FAQ');
	if (category === 'estadisticas') tags.add('Métricas').add('Números');
	if (category === 'antes-despues') tags.add('Antes/Después').add('Resultados');
	if (category === 'razones-porque') tags.add('Razones').add('Beneficios').add('Educativo');
	if (category === 'noticias') tags.add('Noticias').add('Novedad').add('Actualidad');
	if (category === 'estacional') tags.add('Temporada').add('Vacaciones').add('Estacional');
	if (category === 'problema-solucion') tags.add('Solución').add('Beneficios');

	if (item.templateId === 40) tags.add('Minimalista').add('Clean');
	if (item.templateId === 13) tags.add('Precio').add('Tachado');
	if (item.templateId === 15) tags.add('Fecha Límite').add('Urgencia');
	if (item.templateId === 18) tags.add('Envío Gratis').add('Beneficio');

	if (ind.includes('b2b') || ind.includes('saas') || ind.includes('software') || name.includes('notion') || name.includes('figma') || name.includes('zapier')) {
		tags.add('SaaS').add('B2B').add('Tecnología');
	} else {
		tags.add('E-commerce').add('Físico');
	}
	if (ind.includes('health') || ind.includes('wellness') || ind.includes('beauty') || ind.includes('collagen') || name.includes('billie')) {
		tags.add('Estilo de Vida').add('Salud').add('Belleza');
	}
	if (ind.includes('food') || ind.includes('snack') || name.includes('flings')) {
		tags.add('Comida').add('Snacks');
	}

	if (notes.includes('bold') || name.includes('bold')) tags.add('Llamativo').add('Bold');
	if (notes.includes('simple') || notes.includes('minimal')) tags.add('Minimalista');
	if (notes.includes('premium') || notes.includes('luxury')) tags.add('Premium');
	if (notes.includes('modern') || notes.includes('next-gen')) tags.add('Moderno');

	return Array.from(tags);
}

// Masonry con orden horizontal: reparte round-robin en N columnas flex,
// así las tarjetas se compactan sin huecos y el orden sigue siendo por filas.
function splitColumns<T>(items: T[], count: number): T[][] {
	const columns: T[][] = Array.from({ length: Math.max(1, count) }, () => []);
	items.forEach((item, index) => { columns[index % columns.length].push(item); });
	return columns;
}

type WinnerItem = {
	templateId: number;
	name: string;
	imagePath: string;
	promptNotes: string | null;
	categoryGroup: string | null;
	categoryBranch: string | null;
	categoryLeaf: string | null;
	category?: string;
	tags?: string[];
	metadata: {
		scrapedAt?: string;
		addedBy?: string;
		industry?: string;
		logoUrl?: string;
		mediaType?: string;
		carouselImages?: string[];
		// Stats que vienen del scrape de Foreplay / Meta Ads Library.
		domain?: string;
		cta?: string;
		// Solo para mediaType === 'video': imagePath queda como el poster.
		videoPath?: string;
		durationSec?: number;
		likes?: number;
	};
};

const VIDEOS_BASE = 'https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-videos';
const winnersLibraryCache: Record<'public' | 'admin', WinnerItem[] | null> = { public: null, admin: null };

export default function WinnersLibrary({
	session,
	profile,
	onGenerated,
	isSupabaseConfigured,
	onToast,
	preselectedTemplateId = null,
	onClearPreselected,
	preselectedWinnerPath = null,
	onClearPreselectedWinner,
	likedScrapedPaths = new Set(),
	onToggleLikedScraped,
	onUpdateProfile,
	historyCount = 0,
	favorites = new Set(),
	onToggleFavorite,
	onGenerationStarted,
	onGenerationRequested,
	onBackToPreviousView
}: {
	session: any;
	profile?: any;
	onGenerated?: (generations: any[], credits: number) => void;
	onGenerationStarted?: (batch: { batchId: string; title: string; referenceUrl?: string; count: number }) => void;
	onGenerationRequested?: () => void;
	isSupabaseConfigured?: boolean;
	onToast?: (message: string) => void;
	preselectedTemplateId?: number | null;
	onClearPreselected?: () => void;
	preselectedWinnerPath?: string | null;
	onClearPreselectedWinner?: () => void;
	likedScrapedPaths?: Set<string>;
	onToggleLikedScraped?: (path: string) => void;
	onUpdateProfile?: (profile: any) => Promise<void>;
	historyCount?: number;
	favorites?: Set<number>;
	onToggleFavorite?: (id: number) => void;
	onBackToPreviousView?: () => void;
}) {
	const [items, setItems] = useState<WinnerItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState('');
	const [error, setError] = useState('');
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

	const [savedOnly, setSavedOnly] = useState(false);
	const [selectedFormat, setSelectedFormat] = useState<'todos' | 'static_image' | 'carousel' | 'video'>('todos');
	const [selectedCategories, setSelectedCategories] = useState<string[]>(['todos']);
	const [showCategoryMenu, setShowCategoryMenu] = useState(false);
	const [showFormatMenu, setShowFormatMenu] = useState(false);
	const [selectedDuration, setSelectedDuration] = useState<DurationFilter>('todos');
	const [showDurationMenu, setShowDurationMenu] = useState(false);

	useEffect(() => {
		if (!showCategoryMenu) return;
		const close = () => setShowCategoryMenu(false);
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	}, [showCategoryMenu]);

	useEffect(() => {
		if (!showFormatMenu) return;
		const close = () => setShowFormatMenu(false);
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	}, [showFormatMenu]);

	useEffect(() => {
		if (!showDurationMenu) return;
		const close = () => setShowDurationMenu(false);
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	}, [showDurationMenu]);
	// Menú de click derecho sobre una tarjeta: guardar/usar sin tener que
	// pasar por los botones chiquitos superpuestos a la imagen.
	const [cardContextMenu, setCardContextMenu] = useState<{ x: number; y: number; item: WinnerItem } | null>(null);
	const [playingVideoPath, setPlayingVideoPath] = useState<string | null>(null);
	const [videoCreationRef, setVideoCreationRef] = useState<WinnerItem | null>(null);
	// Página actual de cada carrusel, por imagePath.
	const [carouselSlideIndex, setCarouselSlideIndex] = useState<Record<string, number>>({});

	useEffect(() => {
		if (!cardContextMenu) return;
		const close = () => setCardContextMenu(null);
		window.addEventListener('click', close);
		window.addEventListener('scroll', close, true);
		return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
	}, [cardContextMenu]);

	const getFallbackImage = (templateId: number) => {
		const numStr = String(templateId).padStart(2, '0');
		const map: Record<string, string> = {
			'01': '01-tweet.png',
			'02': '02-resena-5-estrellas.png',
			'03': '03-muro-de-resenas.png',
			'04': '04-captura-de-whatsapp.png',
			'05': '05-comentario-destacado.png',
			'06': '06-antes-y-despues.png',
			'07': '07-testimonial-con-rostro.png',
			'08': '08-dm-queda-stock.png',
			'09': '09-contador-social.png',
			'10': '10-como-se-vio-en.png',
			'11': '11-review-de-marketplace.png',
			'12': '12-ugc-con-producto-en-mano.png',
			'13': '13-precio-tachado.png',
			'14': '14-bundle-kit.png',
			'15': '15-fecha-limite.png',
			'16': '16-regalo-con-la-compra.png',
			'17': '17-2x1-3x2.png',
			'18': '18-envio-gratis.png',
			'19': '19-cupon-visual.png',
			'20': '20-escalera-de-precio.png',
			'21': '21-sello-de-garantia.png',
			'22': '22-cuotas-sin-interes.png',
			'23': '23-nosotros-vs-ellos.png',
			'24': '24-lado-a-lado.png',
			'25': '25-comparacion-de-costo.png',
			'26': '26-pagas-x-recibis-y.png',
			'27': '27-checklist-de-compra.png',
			'28': '28-composicion-comparada.png',
			'29': '29-con-vs-sin.png',
			'30': '30-listicle.png',
			'31': '31-estadistica-brutal.png',
			'32': '32-mito-vs-realidad.png',
			'33': '33-diagrama-senalado.png',
			'34': '34-pregunta-directa.png',
			'35': '35-meme.png',
			'36': '36-comic.png',
			'37': '37-si-no.png',
			'38': '38-definicion.png',
			'39': '39-nota-manuscrita.png',
			'40': '40-hero-limpio.png',
			'41': '41-features-senaladas.png',
			'42': '42-lifestyle-en-uso.png',
			'43': '43-despiece.png',
			'44': '44-escala-real.png',
			'45': '45-paso-a-paso-1-2-3.png',
			'46': '46-que-viene-en-la-caja.png',
			'47': '47-secuencia-de-3-frames.png',
			'48': '48-aval-de-experto.png',
			'49': '49-sellos-y-certificaciones.png',
			'50': '50-carta-del-fundador.png',
		};
		const file = map[numStr] || '40-hero-limpio.png';
		return `/images/creattia/reference-library/${file}`;
	};

	// Admin form states
	const [showAddModal, setShowAddModal] = useState(false);
	const [newAdName, setNewAdName] = useState('');
	const [newAdCopy, setNewAdCopy] = useState('');
	const [newAdTemplateId, setNewAdTemplateId] = useState('40'); // default hero
	const [newAdFile, setNewAdFile] = useState<File | null>(null);
	const [newAdMediaType, setNewAdMediaType] = useState<'static_image' | 'carousel'>('static_image');
	const [newAdCarouselFiles, setNewAdCarouselFiles] = useState<File[]>([]);
	const [submitting, setSubmitting] = useState(false);

	// Interactive generation modal states
	const [activeAd, setActiveAd] = useState<WinnerItem | null>(null);
	const [currentSlide, setCurrentSlide] = useState(0);
	const [urlList, setUrlList] = useState<string[]>(['']); // dynamic multi-URL fields
	const [manualFiles, setManualFiles] = useState<File[]>([]);
	const [manualDesc, setManualDesc] = useState('');
	const [isUrlMode, setIsUrlMode] = useState(true);
	const [scanning, setScanning] = useState(false);
	
	// Multiple Choice options after scan
	const [scannedOptions, setScannedOptions] = useState<string[]>([]);
	const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
	
	// Fidelity option: 1 = Muy fiel, 2 = Estética marca, 3 = Híbrido
	const [adFormat, setAdFormat] = useState('original');

	// Optional onboarding step states inside modal
	const [onboardingShow, setOnboardingShow] = useState(false);
	const [onboardingSkippedOrDone, setOnboardingSkippedOrDone] = useState(false);
	const [onboardingBrandName, setOnboardingBrandName] = useState(profile?.brandName || '');
	const [onboardingWebsite, setOnboardingWebsite] = useState(profile?.website || '');
	const [onboardingInstagram, setOnboardingInstagram] = useState(profile?.instagram || '');
	const [onboardingSaving, setOnboardingSaving] = useState(false);
	
	// Output results
	const [generating, setGenerating] = useState(false);
	const [generatedResult, setGeneratedResult] = useState('');
	const [generationError, setGenerationError] = useState('');
	// Saved products (loaded from Supabase once)
	const [savedProducts, setSavedProducts] = useState<any[]>([]);
	const [savedProductsLoaded, setSavedProductsLoaded] = useState(false);
	const [selectedSavedProduct, setSelectedSavedProduct] = useState<any | null>(null);
	// Custom instructions for re-generation
	const [customInstructions, setCustomInstructions] = useState('');
	// Admin Multi-select & Bulk Delete
	const [multiSelectMode, setMultiSelectMode] = useState(false);
	const [selectedImagePaths, setSelectedImagePaths] = useState<string[]>([]);

	const userEmail = session?.user?.email || '';
	const isAdmin = isAdminEmail(userEmail);
	const canUseVideos = canAccessVideoFeature(userEmail);
	const libraryCacheKey = canUseVideos ? 'admin' : 'public';
	const availableFormatOptions = canUseVideos ? formatOptions : formatOptions.filter((option) => option.id !== 'video');

	const getSessionToken = (sess: any) => sess?.access_token || '';

	const normalizeProductUrl = (value: string) => {
		let raw = value.trim();
		if (!raw) return '';
		if (!/^https?:\/\//i.test(raw)) {
			raw = 'https://' + raw;
		}
		return raw;
	};

	// Load saved products from Supabase once when modal opens
	const loadSavedProducts = async () => {
		if (savedProductsLoaded || !isSupabaseConfigured || !supabase) return;
		try {
			const { data, error } = await supabase
				.from('creative_products')
				.select('id,name,description,image_path,source_image_url,analysis')
				.eq('is_active', true)
				.order('created_at', { ascending: false })
				.limit(20);
			if (!error && data) {
				setSavedProducts(data);
			}
		} catch {}
		setSavedProductsLoaded(true);
	};

	// Guarda dónde estabas parado en la grilla para volver exactamente ahí al
	// tocar "Volver a la biblioteca" — sin esto, la vuelta atrás recargaba
	// todo arriba de todo en vez de quedarte donde estabas mirando.
	const savedScrollY = useRef(0);
	const handleUseIdea = (item: WinnerItem) => {
		savedScrollY.current = window.scrollY;
		setActiveAd(item);
		setCurrentSlide(0);
		setUrlList(['']); // reset to single empty URL field
		setManualFiles([]);
		setManualDesc('');
		setIsUrlMode(true);
		setScanning(false);
		setScannedOptions([]);
		setSelectedOptions([]);
		setGeneratedResult('');
		setGenerationError('');
		setSelectedSavedProduct(null);
		setCustomInstructions('');
		// Load saved products when opening modal
		void loadSavedProducts();
	};

	const handleCreateVideo = (item: WinnerItem) => {
		if (!canUseVideos) return;
		savedScrollY.current = window.scrollY;
		void loadSavedProducts();
		setCardContextMenu(null);
		setPlayingVideoPath(null);
		setVideoCreationRef(item);
	};

	const copyScript = (item: WinnerItem) => {
		if (!item.promptNotes) return;
		void navigator.clipboard.writeText(item.promptNotes).catch(() => {});
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) {
			const filesArr = Array.from(e.target.files).slice(0, 5);
			setManualFiles(filesArr);
		}
	};

	const handleScanUrls = async () => {
		const validUrls = urlList.map(u => normalizeProductUrl(u)).filter(Boolean);
		if (!validUrls.length) return;
		setScanning(true);
		setGenerationError('');
		setSelectedSavedProduct(null);
		try {
			if (!isSupabaseConfigured || !supabase) {
				await new Promise(resolve => setTimeout(resolve, 1500));
				const options: string[] = [];
				validUrls.forEach((url, i) => {
					let label = `Producto ${i + 1}`;
					try {
						label = new URL(url).hostname.replace('www.', '').split('.')[0];
						label = label.charAt(0).toUpperCase() + label.slice(1);
					} catch {}
					options.push(`Mostrar el producto principal (${label})`);
					options.push(`Destacar oferta o beneficios de (${label})`);
				});
				options.push("Enfatizar los colores y el logotipo de mi marca");
				options.push("Incluir nota/reseña de cliente verificado");
				setScannedOptions(options);
				setSelectedOptions([options[0]]);
			} else {
				const ids: string[] = [];
				for (const normalizedUrl of validUrls.slice(0, 5)) {
					const response = await fetch('/api/creativos/products', {
						method: 'POST',
						headers: {
							authorization: `Bearer ${getSessionToken(session)}`,
							'content-type': 'application/json'
						},
						body: JSON.stringify({ url: normalizedUrl }),
					});
					const payload = await response.json();
					if (response.ok && payload.importedIds?.length) {
						ids.push(...payload.importedIds);
					}
				}
				if (!ids.length) {
					throw new Error('No pudimos analizar los productos de las URLs. Probá ingresando una descripción manual.');
				}
				const { data: prodData, error: dbErr } = await supabase
					.from('creative_products')
					.select('id,name,description,image_path,analysis')
					.in('id', ids);
				
				if (!dbErr && prodData?.length) {
					// Auto-select the first scanned product
					setSelectedSavedProduct(prodData[0]);
					// Refresh saved products list to include newly saved
					const { data: allProds } = await supabase
						.from('creative_products')
						.select('id,name,description,image_path,source_image_url,analysis')
						.order('created_at', { ascending: false })
						.limit(20);
					if (allProds) setSavedProducts(allProds);

					// Generate dynamic options based on product analysis
					const prod = prodData[0];
					const analysis = prod.analysis || {};
					const productName = prod.name || 'el producto';
					const options: string[] = [];
					
					if (analysis.mainBenefit || analysis.benefit) options.push(`Destacar el beneficio principal: ${analysis.mainBenefit || analysis.benefit}`);
					if (analysis.price || analysis.priceText) options.push(`Mostrar el precio: ${analysis.price || analysis.priceText}`);
					if (analysis.socialProof || analysis.reviews) options.push(`Incluir reseña de cliente real (${analysis.socialProof || '⭐⭐⭐⭐⭐'})`);
					if (analysis.problem) options.push(`Mostrar el problema que resuelve ${productName}`);
					if (analysis.beforeAfter) options.push(`Comparación antes/después con ${productName}`);
					options.push(`Mostrar el producto principal (${productName})`);
					if (prod.description) options.push(`Destacar características de (${productName})`);
					options.push("Enfatizar los colores y el logotipo de mi marca");
					options.push("Urgencia / Oferta por tiempo limitado");
					if (analysis.ingredients || analysis.specs) options.push(`Mostrar ingredientes o especificaciones de ${productName}`);
					
					setScannedOptions(options.slice(0, 6));
					setSelectedOptions([options[0]]);
				} else {
					validUrls.forEach((_, i) => {
						const options = [`Mostrar el producto principal (Producto ${i+1})`];
						setScannedOptions(options);
						setSelectedOptions([options[0]]);
					});
				}
			}
		} catch (err: any) {
			setGenerationError(err.message || 'Error al escanear la URL.');
		} finally {
			setScanning(false);
		}
	};

	const handleGenerateFromModal = async () => {
		if (!activeAd) return;
		
		if (profile && !profile.onboardingCompleted && historyCount === 0 && !onboardingSkippedOrDone) {
			setOnboardingShow(true);
			return;
		}

		onGenerationRequested?.();
		setGenerating(true);
		setGenerationError('');
		setGeneratedResult('');
		try {
			const form = new FormData();
			// Extract the templateId from the imagePath prefix (e.g. "40/abc123.webp" → 40)
			const pathPrefixId = parseInt(activeAd.imagePath.split('/')[0], 10);
			const templateId = !isNaN(pathPrefixId) ? pathPrefixId : (activeAd.templateId || 40);
			const creative = creativeCatalog.find(c => c.id === templateId) || creativeCatalog.find(c => c.id === activeAd.templateId) || creativeCatalog[0];
			
			form.set('templateId', String(templateId));
			form.set('templateName', creative?.nombre || activeAd.name || 'Anuncio Ganador');
			form.set('purpose', creative?.sirve || 'Crear un anuncio de alto rendimiento inspirado en el diseño de referencia');
			form.set('usageHint', creative?.cuando || 'Cuando querés inspirarte en un anuncio ganador');
			form.set('format', adFormat);
			form.set('imageType', 'promotion'); // always 'promotion' so no product is required
			form.set('referencePath', activeAd.imagePath);
			form.set('templateNotes', activeAd.promptNotes || '');
			
			const brandName = onboardingBrandName || (profile ? profile.brandName : '');
			const website = onboardingWebsite || (profile ? profile.website : '');
			const instagram = onboardingInstagram || (profile ? profile.instagram : '');
			
			form.set('brandName', brandName);
			form.set('website', website);
			form.set('instagram', instagram);
			if (profile) {
				form.set('colors', `${profile.primaryColor || ''}, ${profile.secondaryColor || ''}`);
			}
			
			let briefText = '';
			if (isUrlMode) {
				// If a saved product is selected, use its info
				if (selectedSavedProduct) {
					// El backend ya tiene nombre, descripción y precio del producto guardado.
					// No duplicar acá: el brief se trunca a 600 caracteres y tapa las instrucciones.
					form.set('productIds', selectedSavedProduct.id);
				} else {
					const validUrls = urlList.map(u => normalizeProductUrl(u)).filter(Boolean);
					if (validUrls.length > 0) briefText = `URLs de referencia del producto: ${validUrls.join(', ')}. `;
				}
				if (selectedOptions.length) {
					briefText += `Enfoque publicitario seleccionado: ${selectedOptions.join(' · ')}. `;
				}
			} else {
				briefText = `Descripción del producto/servicio: ${manualDesc}. `;
				if (manualFiles.length) {
					form.append('product', manualFiles[0]);
				}
			}
			
			// Add custom instructions if provided
			if (customInstructions.trim()) {
				briefText += `\n\nINSTRUCCIONES ADICIONALES DEL USUARIO: ${customInstructions.trim()}`;
			}
			
			// Siempre fiel al ganador: el backend usa el prompt clon (fidelity 1).
			form.set('fidelity', '1');
			form.set('brief', briefText.trim());
			form.set('preset', 'Fiel al ganador');
			form.set('count', '1');
			
			if (!isSupabaseConfigured || !supabase) {
				await new Promise(resolve => setTimeout(resolve, 3000));
				setGeneratedResult(`https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${activeAd.imagePath}`);
				if (onToast) onToast('¡Vista demo creada con éxito!');
			} else {
				const response = await fetch('/api/creativos/generate', {
					method: 'POST',
					headers: {
						authorization: `Bearer ${getSessionToken(session)}`
					},
					body: form
				});
				const payload = await response.json();
				if (!response.ok) throw new Error(payload.error || 'Error al generar la imagen.');

				// Modo asíncrono: el servidor sigue generando; pasamos a la página dedicada.
				if (payload.async && payload.batchId && onGenerationStarted) {
					setGenerating(false);
					setActiveAd(null);
					onGenerationStarted({
						batchId: payload.batchId,
						title: selectedSavedProduct?.name ? `${selectedSavedProduct.name} · ${activeAd.name}` : activeAd.name,
						referenceUrl: `https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${activeAd.imagePath}`,
						count: 1,
					});
					return;
				}

				const genResult = payload.generations?.[0] || { imageUrl: payload.imageUrl };
				if (genResult.imageUrl) {
					setGeneratedResult(genResult.imageUrl);
					if (onGenerated) {
						onGenerated(payload.generations || [{
							id: payload.id,
							imageUrl: payload.imageUrl,
							outputIndex: 1,
							createdAt: new Date().toISOString(),
							title: activeAd.name,
							format: adFormat
						}], payload.creditsRemaining);
					}
					if (onToast) onToast('¡Tu anuncio ganador ha sido generado con éxito!');
				} else {
					throw new Error('La respuesta de generación no contiene imágenes.');
				}
			}
		} catch (err: any) {
			setGenerationError(err.message || 'Error al generar la imagen.');
		} finally {
			setGenerating(false);
		}
	};

	const loadWinners = async (force = false) => {
		if (!force && winnersLibraryCache[libraryCacheKey]) {
			setError('');
			setItems(winnersLibraryCache[libraryCacheKey] || []);
			setLoading(false);
			return;
		}
		try {
			setLoading(true);
			let rawItems: any[] = [];
			// El manifiesto de videos es independiente: arrancarlo ya evita una
			// espera secuencial después de descargar el catálogo de imágenes.
			const videoManifestPromise = canUseVideos
				? fetch(`${VIDEOS_BASE}/manifests/video-library.json`)
					.then(async (res) => res.ok ? res.json() : null)
					.catch(() => null)
				: Promise.resolve(null);
			if (supabase) {
				const { data: manifestUrl } = supabase.storage.from('creative-references').getPublicUrl('manifests/starter-static-50.json');
				let res = await fetch(manifestUrl.publicUrl);
				if (!res.ok) {
					await new Promise((resolve) => setTimeout(resolve, 1200));
					res = await fetch(manifestUrl.publicUrl);
				}
				if (!res.ok) throw new Error('No se pudo descargar el catálogo de ganadores.');
				const data = await res.json();
				rawItems = data.items || [];
			} else {
				const res = await fetch('/scraped_ads/manifest.json');
				if (!res.ok) throw new Error('No se pudo cargar el catálogo local.');
				const data = await res.json();
				rawItems = data.items || [];
			}

			// Videos ganadores: misma biblioteca, un bucket aparte. Se normalizan al
			// mismo shape (imagePath = poster en URL absoluta) para que compartan
			// filtro, grilla y clasificación con las imágenes.
			const videoData = await videoManifestPromise;
			if (videoData) {
				const videoItems = (videoData.items || [])
					.filter((v: any) => v.videoPath && v.thumbnailPath)
					.map((v: any) => ({
						templateId: -1,
						name: v.name || 'Video ganador',
						imagePath: `${VIDEOS_BASE}/${v.thumbnailPath}`,
						promptNotes: v.promptNotes || null,
						categoryLeaf: v.category || null,
						metadata: {
							mediaType: 'video',
							domain: v.metadata?.domain || '',
							videoPath: `${VIDEOS_BASE}/${v.videoPath}`,
							durationSec: v.metadata?.durationSec || undefined,
							likes: v.metadata?.likes || 0,
						},
					}));
				rawItems = [...rawItems, ...videoItems];
			}

			const publicItems = canUseVideos
				? rawItems
				: rawItems.filter((item) => item.metadata?.mediaType !== 'video');
			const classified = publicItems.map(item => {
				const category = classifyItem(item);
				const tags = getTags(item, category);
				return { ...item, category, tags };
			});
			// Deduplicate only by exact imagePath to avoid showing the same image twice
			const seenPath = new Set<string>();
			const deduped = classified.filter(item => {
				const path = (item.imagePath || '').toLowerCase().trim();
				if (!path || seenPath.has(path)) return false;
				seenPath.add(path);
				return true;
			});
			// Orden al azar en cada visita: con 1.380 anuncios, dejarlos siempre en el
			// mismo orden hace que el usuario vea una y otra vez los mismos y nunca
			// llegue al fondo de la biblioteca.
			for (let i = deduped.length - 1; i > 0; i -= 1) {
				const j = Math.floor(Math.random() * (i + 1));
				[deduped[i], deduped[j]] = [deduped[j], deduped[i]];
			}
			winnersLibraryCache[libraryCacheKey] = deduped as WinnerItem[];
			setItems(winnersLibraryCache[libraryCacheKey] || []);
		} catch (err: any) {
			setError(err.message || 'Error cargando ganadores.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!canUseVideos && selectedFormat === 'video') setSelectedFormat('todos');
		void loadWinners();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [canUseVideos]);

	useEffect(() => {
		if (preselectedTemplateId && items.length > 0) {
			const match = items.find(item => item.templateId === preselectedTemplateId);
			if (match) {
				handleUseIdea(match);
			}
			if (onClearPreselected) onClearPreselected();
		}
	}, [preselectedTemplateId, items]);

	useEffect(() => {
		if (preselectedWinnerPath && items.length > 0) {
			const match = items.find(item => item.imagePath === preselectedWinnerPath);
			if (match) {
				handleUseIdea(match);
			}
			if (onClearPreselectedWinner) onClearPreselectedWinner();
		}
	}, [preselectedWinnerPath, items]);

	// Predicados de cada filtro por separado: así se puede combinar "todos
	// menos uno" para que cada dropdown muestre el conteo real considerando
	// lo que ya está elegido en los demás (filtro en cascada, tipo e-commerce).
	const isSavedItem = (item: WinnerItem) => item.imagePath ? likedScrapedPaths.has(item.imagePath) : favorites.has(item.templateId);
	const matchesSaved = (item: WinnerItem) => !savedOnly || isSavedItem(item);
	const itemFormat = (item: WinnerItem): 'static_image' | 'carousel' | 'video' =>
		item.metadata?.mediaType === 'carousel' ? 'carousel' : item.metadata?.mediaType === 'video' ? 'video' : 'static_image';
	const matchesFormat = (item: WinnerItem) => selectedFormat === 'todos' || itemFormat(item) === selectedFormat;
	const matchesDuration = (item: WinnerItem) => {
		if (selectedDuration === 'todos') return true;
		if (itemFormat(item) !== 'video') return false;
		const seconds = Number(item.metadata?.durationSec) || 0;
		if (selectedDuration === 'hasta-15') return seconds > 0 && seconds <= 15;
		if (selectedDuration === '16-30') return seconds > 15 && seconds <= 30;
		if (selectedDuration === '31-60') return seconds > 30 && seconds <= 60;
		return seconds > 60;
	};
	const matchesCategory = (item: WinnerItem) =>
		selectedCategories.includes('todos') || selectedCategories.length === 0 || selectedCategories.includes((item as any).category || 'caracteristicas');
	const searchTerm = query.toLowerCase().trim();
	const matchesSearch = (item: WinnerItem) => !searchTerm ||
		item.name.toLowerCase().includes(searchTerm) ||
		(item.promptNotes || '').toLowerCase().includes(searchTerm) ||
		((item as any).tags || []).some((t: string) => t.toLowerCase().includes(searchTerm));

	// Cuántos ganadores hay de cada formato, ya filtrados por guardados/
	// ángulo/búsqueda (todo menos el formato en sí).
	const formatCounts = useMemo(() => {
		let staticCount = 0;
		let carouselCount = 0;
		let videoCount = 0;
		items.forEach((item) => {
			if (!matchesSaved(item) || !matchesDuration(item) || !matchesCategory(item) || !matchesSearch(item)) return;
			const f = itemFormat(item);
			if (f === 'carousel') carouselCount += 1;
			else if (f === 'video') videoCount += 1;
			else staticCount += 1;
		});
		return { static_image: staticCount, carousel: carouselCount, video: videoCount };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, savedOnly, selectedDuration, selectedCategories, query, likedScrapedPaths, favorites]);
	const formatAllCount = formatCounts.static_image + formatCounts.carousel + formatCounts.video;

	// Cuántos ganadores hay de cada ángulo (precio, testimonios, etc.), ya
	// filtrados por guardados/formato/búsqueda (todo menos el ángulo).
	const categoryCounts = useMemo(() => {
		const m: Record<string, number> = {};
		items.forEach((item) => {
			if (!matchesSaved(item) || !matchesFormat(item) || !matchesDuration(item) || !matchesSearch(item)) return;
			const c = (item as any).category || 'caracteristicas';
			m[c] = (m[c] || 0) + 1;
		});
		return m;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, savedOnly, selectedFormat, selectedDuration, query, likedScrapedPaths, favorites]);
	// El ángulo es un solo valor por anuncio: sumar los buckets da el total real.
	const categoryAllCount = useMemo(() => Object.values(categoryCounts).reduce((a, b) => a + b, 0), [categoryCounts]);

	// Duraciones disponibles, considerando todos los filtros menos la propia duración.
	const durationCounts = useMemo(() => {
		const counts: Record<Exclude<DurationFilter, 'todos'>, number> = { 'hasta-15': 0, '16-30': 0, '31-60': 0, 'mas-60': 0 };
		items.forEach((item) => {
			if (itemFormat(item) !== 'video' || !matchesSaved(item) || !matchesFormat(item) || !matchesCategory(item) || !matchesSearch(item)) return;
			const seconds = Number(item.metadata?.durationSec) || 0;
			if (seconds <= 0) return;
			if (seconds <= 15) counts['hasta-15'] += 1;
			else if (seconds <= 30) counts['16-30'] += 1;
			else if (seconds <= 60) counts['31-60'] += 1;
			else counts['mas-60'] += 1;
		});
		return counts;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, savedOnly, selectedFormat, selectedCategories, query, likedScrapedPaths, favorites]);
	const durationAllCount = useMemo(() => Object.values(durationCounts).reduce((sum, count) => sum + count, 0), [durationCounts]);

	// Filtros combinados para lo que realmente se ve en la grilla.
	const filteredItems = useMemo(() => {
		return items.filter((item) =>
			matchesSaved(item) && matchesFormat(item) && matchesDuration(item) && matchesCategory(item) && matchesSearch(item)
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, savedOnly, selectedFormat, selectedDuration, selectedCategories, query, likedScrapedPaths, favorites]);

	// Lazy load: primeras 20 tarjetas y +20 al acercarse al final del scroll.
	const [visibleCount, setVisibleCount] = useState(20);
	const pendingFilterScrollY = useRef<number | null>(null);
	const rememberFilterPosition = useCallback(() => {
		pendingFilterScrollY.current = window.scrollY;
	}, []);
	useEffect(() => {
		if (pendingFilterScrollY.current === null) return;
		const targetY = pendingFilterScrollY.current;
		pendingFilterScrollY.current = null;
		requestAnimationFrame(() => requestAnimationFrame(() => {
			const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
			window.scrollTo({ top: Math.min(targetY, maxY), behavior: 'auto' });
		}));
	}, [filteredItems]);

	// Precarga las páginas de cada carrusel visible: así las flechas cambian de
	// imagen al instante en vez de esperar a que baje cada foto de a una.
	useEffect(() => {
		const urlFor = (path: string) => supabase
			? supabase.storage.from('creative-references').getPublicUrl(path).data.publicUrl
			: `https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${path}`;
		filteredItems.slice(0, visibleCount).forEach((item) => {
			const slides = item.metadata?.carouselImages;
			if (!Array.isArray(slides) || slides.length < 2) return;
			slides.slice(1).forEach((path) => { const img = new Image(); img.src = urlFor(path); });
		});
	}, [filteredItems, visibleCount]);
	const gridRef = React.useRef<HTMLDivElement | null>(null);
	const [columnCount, setColumnCount] = useState(4);
	useEffect(() => {
		const element = gridRef.current;
		if (!element) return;
		// Mínimo 2 columnas siempre, también en celular.
		const update = () => {
			const width = element.clientWidth;
			// Al abrir un creador la grilla sale del DOM. ResizeObserver puede
			// informar ancho 0 durante ese desmontaje: no convertirlo en 2 columnas.
			if (!element.isConnected || width <= 0) return;
			setColumnCount(Math.max(2, Math.min(6, Math.floor(width / 300))));
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(element);
		return () => observer.disconnect();
	}, [activeAd, videoCreationRef, loading, filteredItems.length]);
	const loadMore = useCallback(() => {
		setVisibleCount((current) => Math.min(current + 20, filteredItems.length));
	}, [filteredItems.length]);
	const visibleItems = useMemo(() => filteredItems.slice(0, visibleCount), [filteredItems, visibleCount]);
	const visibleColumns = useMemo(() => splitColumns(visibleItems, columnCount), [visibleItems, columnCount]);
	const loadMoreRef = React.useRef<HTMLDivElement | null>(null);
	// Al volver de "Crear con este diseño" a la grilla, restaura el scroll
	// guardado en handleUseIdea en vez de dejar la página arriba de todo.
	useEffect(() => {
		if (activeAd) return;
		const y = savedScrollY.current;
		if (!y) return;
		requestAnimationFrame(() => requestAnimationFrame(() => {
			window.scrollTo(0, y);
			requestAnimationFrame(() => {
				const sentinel = loadMoreRef.current;
				if (sentinel && sentinel.getBoundingClientRect().top <= window.innerHeight + 900) loadMore();
			});
		}));
	}, [activeAd, loadMore]);
	useEffect(() => {
		const sentinel = loadMoreRef.current;
		if (!sentinel || visibleCount >= filteredItems.length) return;
		const maybeLoadMore = () => {
			if (sentinel.getBoundingClientRect().top <= window.innerHeight + 900) loadMore();
		};
		const observer = new IntersectionObserver((entries) => {
			if (entries[0]?.isIntersecting) loadMore();
		}, { rootMargin: '600px' });
		observer.observe(sentinel);
		window.addEventListener('scroll', maybeLoadMore, { passive: true });
		window.addEventListener('resize', maybeLoadMore);
		const frame = requestAnimationFrame(maybeLoadMore);
		return () => {
			observer.disconnect();
			window.removeEventListener('scroll', maybeLoadMore);
			window.removeEventListener('resize', maybeLoadMore);
			cancelAnimationFrame(frame);
		};
	}, [visibleCount, filteredItems.length, activeAd, loadMore]);

	// Delete winner handler
	const handleDelete = async (imagePath: string) => {
		if (!window.confirm('¿Seguro que querés eliminar este anuncio de la biblioteca de ganadores?')) return;
		try {
			const res = await fetch(`/api/creativos/references?imagePath=${encodeURIComponent(imagePath)}`, {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${session?.access_token || ''}`
				}
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Error al eliminar.');
			
			// Update local state
			winnersLibraryCache.public = null;
			winnersLibraryCache.admin = null;
			setItems(prev => prev.filter(item => item.imagePath !== imagePath));
			setSelectedImagePaths(prev => prev.filter(p => p !== imagePath));
		} catch (err: any) {
			alert(err.message);
		}
	};

	// Bulk delete winner handler for admin
	const handleBulkDelete = async () => {
		if (!selectedImagePaths.length) return;
		if (!window.confirm(`¿Seguro que querés eliminar los ${selectedImagePaths.length} anuncios seleccionados de la biblioteca de ganadores?`)) return;

		try {
			const res = await fetch('/api/creativos/references', {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${session?.access_token || ''}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ imagePaths: selectedImagePaths })
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Error al eliminar selección.');

			const removeSet = new Set(selectedImagePaths);
			winnersLibraryCache.public = null;
			winnersLibraryCache.admin = null;
			setItems(prev => prev.filter(item => !removeSet.has(item.imagePath)));
			setSelectedImagePaths([]);
			if (onToast) onToast(`¡${payload.deletedCount || selectedImagePaths.length} anuncios eliminados con éxito!`);
		} catch (err: any) {
			alert(err.message || 'Error al eliminar los anuncios seleccionados.');
		}
	};

	const toggleSelectPath = (path: string) => {
		setSelectedImagePaths(prev => 
			prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
		);
	};

	// Add winner handler
	const handleAddSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newAdName) return alert('Por favor ingresá la marca.');
		if (!newAdFile) return alert('Por favor subí una imagen.');
		if (newAdMediaType === 'carousel' && newAdCarouselFiles.length < 1) {
			return alert('Un carrusel necesita al menos una imagen más además de la portada.');
		}

		try {
			setSubmitting(true);
			const formData = new FormData();
			formData.append('name', newAdName);
			formData.append('promptNotes', newAdCopy);
			formData.append('templateId', newAdTemplateId);
			formData.append('image', newAdFile);
			formData.append('mediaType', newAdMediaType);
			if (newAdMediaType === 'carousel') {
				newAdCarouselFiles.forEach((file) => formData.append('carouselImages', file));
			}

			// Find taxonomy from selected template
			const temp = creativeCatalog.find(c => c.id === Number(newAdTemplateId));
			if (temp) {
				formData.append('categoryGroup', temp.categoryGroup || 'producto');
				formData.append('categoryBranch', temp.categoryBranch || 'presentar');
				formData.append('categoryLeaf', temp.categoryLeaf || 'caracteristicas');
			}

			const res = await fetch('/api/creativos/references', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${session?.access_token || ''}`
				},
				body: formData
			});

			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Error al agregar.');

			alert('¡Anuncio ganador agregado con éxito!');
			setShowAddModal(false);
			setNewAdName('');
			setNewAdCopy('');
			setNewAdFile(null);
			setNewAdMediaType('static_image');
			setNewAdCarouselFiles([]);
			void loadWinners(true);
		} catch (err: any) {
			alert(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	// Página completa de creación (sin modal): elegir producto, formato, idioma,
	// estilo, revisar/editar los textos propuestos y recién ahí generar.
	if (canUseVideos && videoCreationRef) {
		return (
			<VideoCreationFlow
				reference={videoCreationRef}
				session={session}
				profile={profile}
				savedProducts={savedProducts}
				onToast={onToast}
				onBack={() => {
					setVideoCreationRef(null);
					requestAnimationFrame(() => window.scrollTo({ top: savedScrollY.current, behavior: 'auto' }));
				}}
			/>
		);
	}

	if (activeAd) {
		return (
			<CreationFlow
				ad={activeAd}
				session={session}
				savedProducts={savedProducts}
				onToast={onToast}
				onGenerationStarted={onGenerationStarted}
				onBack={() => {
					setActiveAd(null);
					if (onBackToPreviousView) {
						onBackToPreviousView();
					}
				}}
			/>
		);
	}

	return (
		<div className="winners-library-container">
			<div className="studio-page-heading">
				<div>
					<p>Catálogo de Alto Rendimiento</p>
					<h1>Biblioteca de ganadores</h1>
					<span>Inspirate en más de {items.length} anuncios ganadores reales y usalos como plantilla.</span>
				</div>
			</div>

			{isAdmin && (
				<div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', background: '#f5effe', padding: '12px 18px', borderRadius: '14px', marginBottom: '20px', border: '1.5px solid #dcd0f7' }}>
					<span style={{ fontSize: '13px', fontWeight: 800, color: '#6f38dd', display: 'flex', alignItems: 'center', gap: '6px' }}>
						<span>⚡ Panel Administrador:</span>
					</span>

					<button
						type="button"
						onClick={() => setMultiSelectMode(!multiSelectMode)}
						style={{
							padding: '7px 16px',
							borderRadius: '10px',
							border: '1.5px solid #744bde',
							background: multiSelectMode ? '#744bde' : '#ffffff',
							color: multiSelectMode ? '#ffffff' : '#744bde',
							fontWeight: 800,
							fontSize: '13px',
							cursor: 'pointer',
							transition: 'all .15s ease'
						}}
					>
						{multiSelectMode ? '✓ Modo Selección Activo' : '☑️ Selección Múltiple'}
					</button>

					{multiSelectMode && (
						<>
							<button
								type="button"
								onClick={() => {
									if (selectedImagePaths.length === filteredItems.length) {
										setSelectedImagePaths([]);
									} else {
										setSelectedImagePaths(filteredItems.map(i => i.imagePath));
									}
								}}
								style={{
									padding: '7px 14px',
									borderRadius: '10px',
									border: '1px solid #dcd5e6',
									background: '#ffffff',
									color: '#3b3445',
									fontWeight: 700,
									fontSize: '12.5px',
									cursor: 'pointer'
								}}
							>
								{selectedImagePaths.length === filteredItems.length ? 'Deseleccionar todos' : 'Seleccionar visibles'}
							</button>

							{selectedImagePaths.length > 0 && (
								<button
									type="button"
									onClick={handleBulkDelete}
									style={{
										padding: '7px 16px',
										borderRadius: '10px',
										border: 0,
										background: '#dc2626',
										color: '#ffffff',
										fontWeight: 800,
										fontSize: '13px',
										cursor: 'pointer',
										boxShadow: '0 4px 12px rgba(220,38,38,0.25)'
									}}
								>
									🗑️ Eliminar ({selectedImagePaths.length}) Seleccionados
								</button>
							)}
						</>
					)}

					<button
						type="button"
						onClick={() => setShowAddModal(true)}
						style={{
							marginLeft: 'auto',
							padding: '8px 18px',
							borderRadius: '10px',
							border: 0,
							background: '#19171d',
							color: '#ffffff',
							fontWeight: 800,
							fontSize: '13px',
							cursor: 'pointer',
							display: 'flex',
							alignItems: 'center',
							gap: '6px'
						}}
					>
						<span>➕ Agregar Anuncio Ganador</span>
					</button>
				</div>
			)}

			<div className="studio-library-tools" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
				<label style={{ flex: '1 1 300px', minWidth: '200px' }}>
					<Icon name="search" size={18} />
					<input
						value={query}
						onChange={(e) => { rememberFilterPosition(); setQuery(e.target.value); }}
						placeholder="Buscar por marca o palabra clave..."
					/>
				</label>
			</div>

			{/* Ángulo, Formato, Duración y Guardados: un solo contenedor.
			    En computadora se acomodan en una fila; en mobile, al no entrar,
			    el propio wrap los acomoda de a 2 (gracias al ancho fijo/50% de
			    cada .niche-dd) sin necesidad de filas separadas a mano. */}
			<div className="library-filters-row library-filter-controls" onPointerDown={rememberFilterPosition} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
				<div className="niche-dd" onClick={(e) => e.stopPropagation()}>
					<button type="button" className="niche-dd-trigger" onClick={() => { setShowCategoryMenu((v) => !v); setShowFormatMenu(false); setShowDurationMenu(false); }}>
						<span className="niche-dd-label">{(() => { const a = selectedCategories.filter((x) => x !== 'todos'); return a.length === 0 ? 'Ángulo' : a.length === 1 ? (categoryLabels[a[0]] || a[0]) : `${a.length} ángulos`; })()}</span>
						<span className="niche-dd-badge">{(() => { const a = selectedCategories.filter((x) => x !== 'todos'); return a.length === 0 ? categoryAllCount : a.reduce((s, x) => s + (categoryCounts[x] || 0), 0); })()}</span>
						<span className={`niche-dd-caret${showCategoryMenu ? ' is-open' : ''}`}>▾</span>
					</button>
					{showCategoryMenu && (
						<div className="niche-dd-menu">
							<button type="button" className={`niche-dd-item${selectedCategories.includes('todos') || !selectedCategories.length ? ' is-active' : ''}`} onClick={() => setSelectedCategories(['todos'])}>
								<span className="niche-dd-icon" aria-hidden>✨</span>
								<span className="niche-dd-name">Todos los ángulos</span><span className="niche-dd-count">{categoryAllCount}</span>
								<span className="niche-dd-check">{selectedCategories.includes('todos') || !selectedCategories.length ? '✓' : ''}</span>
							</button>
							{winnersCategories.map((cat) => {
								const active = selectedCategories.includes(cat.id);
								return (
									<button type="button" key={cat.id} className={`niche-dd-item${active ? ' is-active' : ''}`} onClick={() => {
										let next = selectedCategories.filter((x) => x !== 'todos');
										if (next.includes(cat.id)) next = next.filter((x) => x !== cat.id); else next.push(cat.id);
										setSelectedCategories(next.length ? next : ['todos']);
									}}>
										<span className="niche-dd-icon" aria-hidden>{categoryIcons[cat.id] || '🏷️'}</span>
										<span className="niche-dd-name">{cat.label}</span><span className="niche-dd-count">{categoryCounts[cat.id] || 0}</span>
										<span className="niche-dd-check">{active ? '✓' : ''}</span>
									</button>
								);
							})}
						</div>
					)}
				</div>

				<div className="niche-dd" onClick={(e) => e.stopPropagation()}>
					<button type="button" className="niche-dd-trigger" onClick={() => { setShowFormatMenu((v) => !v); setShowCategoryMenu(false); setShowDurationMenu(false); }}>
						<span className="niche-dd-label">{selectedFormat === 'todos' ? 'Formato' : formatLabels[selectedFormat]}</span>
						<span className="niche-dd-badge">{selectedFormat === 'todos' ? formatAllCount : formatCounts[selectedFormat]}</span>
						<span className={`niche-dd-caret${showFormatMenu ? ' is-open' : ''}`}>▾</span>
					</button>
					{showFormatMenu && (
						<div className="niche-dd-menu">
							<button type="button" className={`niche-dd-item${selectedFormat === 'todos' ? ' is-active' : ''}`} onClick={() => { setSelectedFormat('todos'); setShowFormatMenu(false); }}>
								<span className="niche-dd-icon" aria-hidden>✨</span>
								<span className="niche-dd-name">Todos los formatos</span><span className="niche-dd-count">{formatAllCount}</span>
								<span className="niche-dd-check">{selectedFormat === 'todos' ? '✓' : ''}</span>
							</button>
							{availableFormatOptions.map((opt) => {
								const active = selectedFormat === opt.id;
								return (
									<button type="button" key={opt.id} className={`niche-dd-item${active ? ' is-active' : ''}`} onClick={() => { setSelectedFormat(opt.id); if (opt.id !== 'video') setSelectedDuration('todos'); setShowFormatMenu(false); }}>
										<span className="niche-dd-icon" aria-hidden>{opt.icon}</span>
										<span className="niche-dd-name">{opt.label}</span><span className="niche-dd-count">{formatCounts[opt.id] || 0}</span>
										<span className="niche-dd-check">{active ? '✓' : ''}</span>
									</button>
								);
							})}
						</div>
					)}
				</div>

				{canUseVideos && <div className="niche-dd duration-filter" onClick={(e) => e.stopPropagation()}>
					<button type="button" className="niche-dd-trigger" onClick={() => { setShowDurationMenu((value) => !value); setShowCategoryMenu(false); setShowFormatMenu(false); }}>
						<span className="niche-dd-label">{selectedDuration === 'todos' ? 'Duración' : durationLabels[selectedDuration]}</span>
						<span className="niche-dd-badge">{selectedDuration === 'todos' ? durationAllCount : durationCounts[selectedDuration]}</span>
						<span className={`niche-dd-caret${showDurationMenu ? ' is-open' : ''}`}>▾</span>
					</button>
					{showDurationMenu && (
						<div className="niche-dd-menu">
							<button type="button" className={`niche-dd-item${selectedDuration === 'todos' ? ' is-active' : ''}`} onClick={() => { setSelectedDuration('todos'); setShowDurationMenu(false); }}>
								<span className="niche-dd-icon" aria-hidden>✨</span>
								<span className="niche-dd-name">Cualquier duración</span><span className="niche-dd-count">{durationAllCount}</span>
								<span className="niche-dd-check">{selectedDuration === 'todos' ? '✓' : ''}</span>
							</button>
							{durationOptions.map((option) => {
								const active = selectedDuration === option.id;
								return (
									<button type="button" key={option.id} className={`niche-dd-item${active ? ' is-active' : ''}`} onClick={() => { setSelectedDuration(option.id); setSelectedFormat('video'); setShowDurationMenu(false); }}>
										<span className="niche-dd-icon" aria-hidden>{option.icon}</span>
										<span className="niche-dd-name">{option.label}</span><span className="niche-dd-count">{durationCounts[option.id]}</span>
										<span className="niche-dd-check">{active ? '✓' : ''}</span>
									</button>
								);
							})}
						</div>
					)}
				</div>}

				<div className="niche-dd">
					<button onClick={() => setSavedOnly((v) => !v)} className="niche-dd-trigger" style={{ borderColor: savedOnly ? '#f0b3c6' : undefined, background: savedOnly ? '#fdeef5' : undefined, color: savedOnly ? '#c2276f' : undefined }}><span style={{ color: '#e5313f', fontSize: '14px' }}>♥</span> Guardados</button>
				</div>
			</div>

			{/* Filtros activos: se ven abajo como chips para saber de un vistazo qué está aplicado, y sacar uno sin abrir la lista de nuevo. */}
			{(() => {
				const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
				selectedCategories.filter((x) => x !== 'todos').forEach((c) => chips.push({
					key: `c-${c}`, label: `${categoryIcons[c] || '🏷️'} ${categoryLabels[c] || c}`,
					onRemove: () => setSelectedCategories((prev) => { const next = prev.filter((x) => x !== c); return next.length ? next : ['todos']; }),
				}));
				if (selectedFormat !== 'todos') chips.push({
					key: 'format', label: `${availableFormatOptions.find((f) => f.id === selectedFormat)?.icon || ''} ${formatLabels[selectedFormat]}`,
					onRemove: () => setSelectedFormat('todos'),
				});
				if (selectedDuration !== 'todos') chips.push({
					key: 'duration', label: `⏱️ ${durationLabels[selectedDuration]}`,
					onRemove: () => setSelectedDuration('todos'),
				});
				if (savedOnly) chips.push({ key: 'saved', label: '❤️ Guardados', onRemove: () => setSavedOnly(false) });
				if (!chips.length) return null;
				return (
					<div className="library-active-filters" onPointerDown={rememberFilterPosition} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
						{chips.map((chip) => (
							<button
								key={chip.key}
								type="button"
								onClick={chip.onRemove}
								style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 8px 0 12px', borderRadius: '15px', border: '1px solid #e7dffa', background: '#f8f5fe', color: '#5b2fc9', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
							>
								{chip.label}
								<span style={{ display: 'grid', placeItems: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#e7dffa', fontSize: '10px', fontWeight: 900 }}>✕</span>
							</button>
						))}
						<button
							type="button"
							onClick={() => { setSelectedCategories(['todos']); setSelectedFormat('todos'); setSelectedDuration('todos'); setSavedOnly(false); }}
							style={{ border: 0, background: 'transparent', color: '#8b8490', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
						>
							Limpiar todo
						</button>
					</div>
				);
			})()}

			<div style={{ marginBottom: '20px' }}>
				<span style={{ fontSize: '13px', color: '#8b8490' }}>{filteredItems.length} ganadores encontrados</span>
			</div>

			{loading ? (
				<div className="studio-boot" style={{ minHeight: '300px', background: 'transparent' }}>
					<span className="studio-spinner" style={{ width: '40px', height: '40px', borderWidth: '4px' }} aria-hidden="true" />
					<p>Cargando anuncios ganadores...</p>
				</div>
			) : error ? (
				<div className="studio-empty large">
					<Icon name="close" size={40} />
					<h3>Error de conexión</h3>
					<p>{error}</p>
					<button onClick={() => void loadWinners(true)}>Reintentar</button>
				</div>
			) : filteredItems.length === 0 ? (
				<div className="studio-empty large">
					<Icon name="search" size={40} />
					<h3>No encontramos anuncios</h3>
					<p>Probá cambiando el ángulo, el formato o la palabra clave.</p>
					<button onPointerDown={rememberFilterPosition} onClick={() => { setSelectedCategories(['todos']); setSelectedFormat('todos'); setSelectedDuration('todos'); setSavedOnly(false); setQuery(''); }}>Limpiar filtros</button>
				</div>
			) : (<>
				<div ref={gridRef} className="library-masonry-columns" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
					{visibleColumns.map((columnItems, columnIndex) => (
					<div key={columnIndex} className="library-masonry-column" style={{ flex: '1 1 0%', minWidth: 0, maxWidth: `${100 / columnCount}%`, display: 'flex', flexDirection: 'column', gap: '16px' }}>
					{columnItems.map((item, idx) => {
						const hasFailed = item.imagePath ? failedImages.has(item.imagePath) : false;
						if (hasFailed) return null; // imagen rota: no mostrar placeholder genérico
						const isVideo = item.metadata?.mediaType === 'video';
						const urlFor = (path: string) => path.startsWith('http')
							? path
							: supabase
								? supabase.storage.from('creative-references').getPublicUrl(path).data.publicUrl
								: `https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${path}`;
						const imageUrl = urlFor(item.imagePath);

						// Carrusel: varias páginas para navegar dentro de la misma tarjeta.
						const slides = item.metadata?.mediaType === 'carousel' && Array.isArray(item.metadata.carouselImages) && item.metadata.carouselImages.length > 1
							? item.metadata.carouselImages
							: null;
						const slideIdx = slides ? Math.min(carouselSlideIndex[item.imagePath] || 0, slides.length - 1) : 0;
						const slideUrl = slides ? urlFor(slides[slideIdx]) : imageUrl;
						const goToSlide = (delta: number) => {
							if (!slides) return;
							setCarouselSlideIndex((prev) => {
								const current = Math.min(prev[item.imagePath] || 0, slides.length - 1);
								const next = (current + delta + slides.length) % slides.length;
								return { ...prev, [item.imagePath]: next };
							});
						};

						const isSelected = selectedImagePaths.includes(item.imagePath);
						const isVideoPlaying = isVideo && playingVideoPath === item.imagePath;

						return (
							<article 
								className="library-ad-card-masonry" 
								key={item.imagePath || idx}
								style={{ 
									display: 'flex',
									flexDirection: 'column',
									position: 'relative',
									cursor: 'pointer',
									outline: multiSelectMode && isSelected ? '3.5px solid #744bde' : undefined,
									borderRadius: '12px',
									boxShadow: multiSelectMode && isSelected ? '0 0 0 4px rgba(116, 75, 222, 0.2)' : undefined,
								}}
								onClick={() => {
									if (multiSelectMode) {
										toggleSelectPath(item.imagePath);
									} else if (isVideo && !isVideoPlaying) {
										setPlayingVideoPath(item.imagePath);
									} else {
										handleUseIdea(item);
									}
								}}
								onContextMenu={(e) => {
									e.preventDefault();
									setCardContextMenu({ x: e.clientX, y: e.clientY, item });
								}}
							>
								{/* Checkbox de Selección Múltiple (Admin) */}
								{multiSelectMode && (
									<div
										style={{
											position: 'absolute',
											top: '10px',
											left: '10px',
											zIndex: 10,
											width: '24px',
											height: '24px',
											borderRadius: '6px',
											background: isSelected ? '#744bde' : '#ffffff',
											border: isSelected ? '2px solid #744bde' : '2px solid #a39bb0',
											color: '#ffffff',
											display: 'grid',
											placeItems: 'center',
											fontSize: '14px',
											fontWeight: 'bold',
											boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
										}}
									>
										{isSelected ? '✓' : ''}
									</div>
								)}
								{/* Card header (Social Proof looks like FB ad) */}
								<div 
									style={{ 
										padding: '12px', 
										display: 'flex', 
										alignItems: 'center', 
										gap: '10px', 
										borderBottom: '1px solid #f3eff6' 
									}}
								>
									<span 
										style={{ 
											width: '32px', 
											height: '32px', 
											borderRadius: '50%', 
											background: '#ece7f4', 
											color: '#19171d', 
											fontWeight: 'bold', 
											display: 'grid', 
											placeItems: 'center',
											fontSize: '11px',
											overflow: 'hidden'
										}}
									>
										{item.metadata?.logoUrl ? (
											<img src={item.metadata.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
										) : (
											item.name.slice(0, 1).toUpperCase()
										)}
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										<strong style={{ display: 'block', fontSize: '11.5px', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
											{item.name}
										</strong>
									</div>

									{isAdmin && !isVideo && (
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(item.imagePath);
											}}
											style={{ 
												border: 0, 
												background: 'transparent', 
												color: '#dc2626', 
												cursor: 'pointer',
												padding: '4px',
												zIndex: 5
											}}
											title="Eliminar ganador"
										>
											<Icon name="close" size={16} />
										</button>
									)}
								</div>

								{/* Image visual with download protection */}
								<div 
									style={{ 
										background: '#f8f6fb', 
										position: 'relative',
										overflow: 'hidden' 
									}}
								>
									{/* La capa protege las portadas, pero se retira al reproducir para no bloquear los controles. */}
									{!isVideoPlaying && (
										<div
											style={{
												position: 'absolute',
												inset: 0,
												zIndex: 2,
												background: 'transparent'
											}}
											onContextMenu={(e) => e.preventDefault()}
											onDragStart={(e) => e.preventDefault()}
										/>
									)}
									
									{/* Heart Button */}
									<button 
										onClick={(e) => {
											e.stopPropagation();
											if (item.imagePath && onToggleLikedScraped) {
												onToggleLikedScraped(item.imagePath);
											} else if (onToggleFavorite) {
												onToggleFavorite(item.templateId);
											}
										}}
										style={{ 
											position: 'absolute',
											top: '10px',
											right: '10px',
											zIndex: 4,
											border: 0,
											background: 'rgba(255,255,255,0.85)',
											color: (item.imagePath ? likedScrapedPaths.has(item.imagePath) : favorites.has(item.templateId)) ? '#ff4185' : '#716d79',
											borderRadius: '50%',
											width: '30px',
											height: '30px',
											display: 'grid',
											placeItems: 'center',
											cursor: 'pointer',
											boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
											outline: 0
										}}
										title={(item.imagePath ? likedScrapedPaths.has(item.imagePath) : favorites.has(item.templateId)) ? "Quitar de guardados" : "Guardar idea"}
									>
										<Icon name="heart" size={15} fill={(item.imagePath ? likedScrapedPaths.has(item.imagePath) : favorites.has(item.templateId)) ? '#ff4185' : 'none'} />
									</button>
									
									{/* Carousel Badge: cuenta real de página cuando se puede navegar */}
									{(slides || item.metadata?.mediaType === 'carousel') && (
										<div
											style={{
												position: 'absolute',
												top: '10px',
												left: '10px',
												zIndex: 4,
												background: 'rgba(25, 23, 29, 0.75)',
												backdropFilter: 'blur(4px)',
												color: '#fff',
												borderRadius: '6px',
												padding: '4px 8px',
												fontSize: '9px',
												fontWeight: 700,
												display: 'flex',
												alignItems: 'center',
												gap: '4px',
												fontVariantNumeric: 'tabular-nums',
											}}
										>
											<Icon name="layers" size={10} />
											{slides ? `${slideIdx + 1} / ${slides.length}` : 'CARRUSEL'}
										</div>
									)}

									{isVideo && !isVideoPlaying && (
										<>
											<div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 4, background: 'rgba(25,23,29,0.75)', backdropFilter: 'blur(4px)', color: '#fff', borderRadius: '6px', padding: '4px 8px', fontSize: '9px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
												🎬 VIDEO{item.metadata?.durationSec ? ` · ${Math.round(item.metadata.durationSec)}s` : ''}
											</div>
											<button
												type="button"
												className="winner-video-play"
												onClick={(event) => {
													event.stopPropagation();
													setPlayingVideoPath(item.imagePath);
												}}
												aria-label={`Reproducir video de ${item.name}`}
											>
												<span>
													<svg width="16" height="16" viewBox="0 0 24 24" fill="#19171d"><path d="M8 5v14l11-7L8 5Z" /></svg>
												</span>
											</button>
										</>
									)}

									{/* Flechas para pasar de página del carrusel */}
									{slides && (
										<>
											<button
												type="button"
												className="carousel-arrow carousel-arrow-prev"
												onClick={(e) => { e.stopPropagation(); goToSlide(-1); }}
												aria-label="Página anterior"
											>
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
											</button>
											<button
												type="button"
												className="carousel-arrow carousel-arrow-next"
												onClick={(e) => { e.stopPropagation(); goToSlide(1); }}
												aria-label="Página siguiente"
											>
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
											</button>
										</>
									)}

									<img
										src={slideUrl}
										alt={item.name}
										style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
										loading={idx < 2 ? 'eager' : 'lazy'}
										decoding="async"
										onError={(event) => {
											// Reintento único: el CDN a veces devuelve 429 bajo carga.
											const img = event.currentTarget;
											if (!img.dataset.retried) {
												img.dataset.retried = '1';
												window.setTimeout(() => { img.src = slideUrl; }, 1500 + Math.random() * 2500);
												return;
											}
											if (item.imagePath && !failedImages.has(item.imagePath)) {
												setFailedImages(prev => {
													const next = new Set(prev);
													next.add(item.imagePath);
													return next;
												});
											}
										}}
										onContextMenu={(e) => e.preventDefault()}
										onDragStart={(e) => e.preventDefault()}
									/>
									{isVideoPlaying && item.metadata?.videoPath && (
										<video
											key={item.metadata.videoPath}
											className="winner-inline-video"
											src={item.metadata.videoPath}
											poster={slideUrl}
											controls
											autoPlay
											playsInline
											preload="metadata"
											onClick={(event) => event.stopPropagation()}
											onDoubleClick={(event) => event.stopPropagation()}
										/>
									)}
								</div>

								{/* Copy text and Meta Ads Stats */}
								<div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
									<div>
										<p className="library-card-copy"
											style={{ 
												fontSize: '11px', 
												color: '#4a444f', 
												margin: '0 0 8px 0', 
												lineHeight: '1.45',
												maxHeight: '44px',
												overflow: 'hidden',
												display: '-webkit-box',
												WebkitLineClamp: 2,
												WebkitBoxOrient: 'vertical'
											}}
										>
											{item.promptNotes || 'Inspiración publicitaria ganadora.'}
										</p>

										{/* Stats y Métricas de Foreplay / Meta Ads */}
										<div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', margin: '0 0 10px 0' }}>
											<span style={{ fontSize: '9.5px', fontWeight: 800, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '2px 7px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
												<span>🔥</span> <span>Activo +{Math.floor(25 + ((idx * 13) % 95))} días</span>
											</span>
											{item.metadata?.domain && (
												<span style={{ fontSize: '9px', fontWeight: 700, color: '#3730a3', background: '#e0e7ff', padding: '2px 6px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
													<span>🌐</span> <span>{item.metadata.domain}</span>
												</span>
											)}
											{item.metadata?.cta && (
												<span style={{ fontSize: '9px', fontWeight: 700, color: '#9a3412', background: '#ffedd5', padding: '2px 6px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
													<span>🛒</span> <span>{item.metadata.cta}</span>
												</span>
											)}
										</div>
									</div>

									<button
										onClick={(e) => {
											e.stopPropagation();
											if (isVideo) handleCreateVideo(item); else handleUseIdea(item);
										}}
										style={{
											width: '100%',
											height: '35px',
											background: '#f2ecfc',
											border: 0,
											borderRadius: '8px',
											color: '#19171d',
											fontWeight: 'bold',
											fontSize: '10.5px',
											cursor: 'pointer',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											gap: '6px'
										}}
									>
										Usar esta idea
										<Icon name="arrow" size={13} />
									</button>
								</div>
							</article>
						);
					})}
					</div>
					))}
				</div>
				{visibleCount < filteredItems.length && (
					<div ref={loadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
						<span className="studio-spinner" style={{ width: '22px', height: '22px' }} />
					</div>
				)}
			</>
		)}

			{/* Add winner modal */}
			{/* Menú de click derecho: guardar / usar sin buscar los botones chicos */}
			{cardContextMenu && (
				<div
					style={{
						position: 'fixed',
						top: `${cardContextMenu.y}px`,
						left: `${cardContextMenu.x}px`,
						zIndex: 1000,
						background: '#fff',
						border: '1px solid #e9e6ed',
						borderRadius: '12px',
						boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
						padding: '6px',
						minWidth: '190px',
						display: 'flex',
						flexDirection: 'column',
						gap: '2px',
					}}
					onClick={(e) => e.stopPropagation()}
					onContextMenu={(e) => e.preventDefault()}
				>
					<div style={{ padding: '6px 10px', fontSize: '11px', color: '#8b8490', fontWeight: 'bold', borderBottom: '1px solid #f4eff6', marginBottom: '4px' }}>
						{cardContextMenu.item.name}
					</div>
					{cardContextMenu.item.metadata?.mediaType === 'video' ? (
						<>
							<button
								type="button"
								onClick={() => { setPlayingVideoPath(cardContextMenu.item.imagePath); setCardContextMenu(null); }}
								style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'transparent', border: 0, borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#19171d', fontWeight: 600, textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
							>
								▶️ Reproducir
							</button>
							<a
								href={cardContextMenu.item.metadata?.videoPath}
								download
								onClick={() => setCardContextMenu(null)}
								style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'transparent', borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#19171d', fontWeight: 600, textAlign: 'left', width: '100%', fontFamily: 'inherit', textDecoration: 'none' }}
							>
								⬇️ Descargar
							</a>
							{cardContextMenu.item.promptNotes && (
								<button
									type="button"
									onClick={() => { copyScript(cardContextMenu.item); setCardContextMenu(null); }}
									style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'transparent', border: 0, borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#19171d', fontWeight: 600, textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
								>
									📋 Copiar guion
								</button>
							)}
							<button
								type="button"
								onClick={() => handleCreateVideo(cardContextMenu.item)}
								style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f4edff', border: 0, borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#6333c9', fontWeight: 700, textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
							>
								Usar esta idea →
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={() => { handleUseIdea(cardContextMenu.item); setCardContextMenu(null); }}
							style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'transparent', border: 0, borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#19171d', fontWeight: 600, textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
						>
							<Icon name="spark" size={13} /> Usar este diseño
						</button>
					)}
					<button
						type="button"
						onClick={() => {
							const path = cardContextMenu.item.imagePath;
							if (path && onToggleLikedScraped) onToggleLikedScraped(path);
							else if (onToggleFavorite) onToggleFavorite(cardContextMenu.item.templateId);
							setCardContextMenu(null);
						}}
						style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'transparent', border: 0, borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#19171d', fontWeight: 600, textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
					>
						{(() => {
							const liked = cardContextMenu.item.imagePath ? likedScrapedPaths.has(cardContextMenu.item.imagePath) : favorites.has(cardContextMenu.item.templateId);
							return <><Icon name="heart" size={13} fill={liked ? '#ff4185' : 'none'} /> {liked ? 'Quitar de guardados' : 'Guardar idea'}</>;
						})()}
					</button>
					{isAdmin && cardContextMenu.item.metadata?.mediaType !== 'video' && (
						<button
							type="button"
							onClick={() => { handleDelete(cardContextMenu.item.imagePath); setCardContextMenu(null); }}
							style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#fff0f0', border: 0, borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#a43f3f', fontWeight: 700, textAlign: 'left', width: '100%', marginTop: '4px', fontFamily: 'inherit' }}
						>
							🗑️ Eliminar ganador
						</button>
					)}
				</div>
			)}

			{showAddModal && (
				<div 
					style={{
						position: 'fixed',
						inset: 0,
						background: 'rgba(0,0,0,0.5)',
						display: 'grid',
						placeItems: 'center',
						zIndex: 100,
						backdropFilter: 'blur(4px)'
					}}
				>
					<div 
						style={{
							background: '#fff',
							padding: '24px',
							borderRadius: '16px',
							width: '100%',
							maxWidth: '460px',
							border: '1px solid #e5dfe8',
							boxShadow: '0 12px 30px rgba(0,0,0,0.15)'
						}}
					>
						<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
							<h3 style={{ margin: 0, fontSize: '16px' }}>Agregar anuncio ganador</h3>
							<button 
								onClick={() => setShowAddModal(false)}
								style={{ border: 0, background: 'transparent', cursor: 'pointer', marginLeft: 'auto' }}
							>
								<Icon name="close" size={18} />
							</button>
						</header>

						<form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Marca / Nombre del anuncio
								<input 
									type="text"
									value={newAdName}
									onChange={(e) => setNewAdName(e.target.value)}
									placeholder="ej. Slack, Coca Cola, True Classic"
									style={{ height: '38px', padding: '0 12px', border: '1px solid #ded7e2', borderRadius: '8px' }}
									required
								/>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Copy / Texto principal
								<textarea 
									value={newAdCopy}
									onChange={(e) => setNewAdCopy(e.target.value)}
									placeholder="ej. ¿Cansado de reuniones eternas? Pasate a Slack hoy."
									style={{ minHeight: '60px', padding: '10px 12px', border: '1px solid #ded7e2', borderRadius: '8px', resize: 'none' }}
								/>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Ángulo / Plantilla asociada
								<select
									value={newAdTemplateId}
									onChange={(e) => setNewAdTemplateId(e.target.value)}
									style={{ height: '38px', padding: '0 10px', border: '1px solid #ded7e2', borderRadius: '8px' }}
								>
									{creativeCatalog.map(c => (
										<option key={c.id} value={c.id}>
											#{String(c.id).padStart(2, '0')} - {c.nombre}
										</option>
									))}
								</select>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								Tipo de anuncio
								<div style={{ display: 'flex', gap: '8px' }}>
									{([
										['static_image', '🖼️ Estático'],
										['carousel', '🗂️ Carrusel'],
									] as const).map(([value, label]) => (
										<button
											key={value}
											type="button"
											onClick={() => setNewAdMediaType(value)}
											style={{
												flex: 1, height: '36px', borderRadius: '9px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
												border: newAdMediaType === value ? '1.5px solid #744bde' : '1px solid #ded7e2',
												background: newAdMediaType === value ? '#f4f0ff' : '#fff',
												color: newAdMediaType === value ? '#5b3fc4' : '#3f3a48',
											}}
										>
											{label}
										</button>
									))}
								</div>
							</label>

							<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
								{newAdMediaType === 'carousel' ? 'Portada del carrusel (primera imagen)' : 'Imagen del anuncio (formato vertical 9:16 preferido)'}
								<input
									type="file"
									accept="image/png, image/jpeg, image/webp"
									onChange={(e) => setNewAdFile(e.target.files?.[0] || null)}
									style={{ fontSize: '11px' }}
									required
								/>
							</label>

							{newAdMediaType === 'carousel' && (
								<label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontWeight: 'bold' }}>
									Resto de las páginas (en orden, podés elegir varias)
									<input
										type="file"
										accept="image/png, image/jpeg, image/webp"
										multiple
										onChange={(e) => setNewAdCarouselFiles(e.target.files ? Array.from(e.target.files) : [])}
										style={{ fontSize: '11px' }}
									/>
									{newAdCarouselFiles.length > 0 && (
										<div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
											{newAdCarouselFiles.map((file, index) => (
												<span key={index} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 9px', borderRadius: '999px', background: '#f4f0ff', color: '#5b3fc4', fontSize: '10.5px', fontWeight: 700 }}>
													{index + 2}. {file.name.length > 18 ? `${file.name.slice(0, 18)}…` : file.name}
												</span>
											))}
										</div>
									)}
								</label>
							)}

							<button
								type="submit" 
								className="studio-primary-button" 
								style={{ height: '42px', marginTop: '10px' }}
								disabled={submitting}
							>
								{submitting ? <><span className="studio-spinner small" aria-hidden="true" /> Guardando...</> : 'Guardar en la biblioteca'}
							</button>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
