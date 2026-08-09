import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeftRight, BadgePercent, BarChart3, Image as ImageIcon, Layers3, Lightbulb, ListChecks, Newspaper, Play, Sparkles, Star, SunMedium, Swords } from 'lucide-react';
import { supabase } from '../../lib/creattia/supabase-browser';
import { creativeCatalog } from '../../lib/creattia/catalog';
import { isAdminEmail } from '../../lib/creattia/admin';
import { canAccessVideoFeature } from '../../lib/creattia/video-access';
import CreationFlow from './CreationFlow';
import VideoCreationFlow from './VideoCreationFlow';
import { useReferenceUrls } from '../../lib/creattia/reference-urls';
import { imagenFallada, precargarImagenes } from '../../lib/creattia/image-ready';
import { ImagenDeTarjeta } from './carga-por-pantalla';
import { useMasonry } from './use-masonry';

/**
 * Tamaño del bloque de la grilla.
 *
 * Es a la vez cuántas tarjetas entran de una y cuántas se preparan por delante:
 * las dos cosas tienen que ir juntas para que al llegar al final del scroll el
 * bloque siguiente ya esté decodificado y entre sin espera.
 */
const BLOQUE = 20;

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
	{ id: 'producto', label: 'Producto / presentación', icon: ImageIcon },
	{ id: 'competencia', label: 'Nosotros vs Ellos', icon: Swords },
	{ id: 'resenas', label: 'Testimonios', icon: Star },
	{ id: 'precio', label: 'Promociones y descuentos', icon: BadgePercent },
	{ id: 'razones-porque', label: 'Razones por qué', icon: Lightbulb },
	{ id: 'caracteristicas', label: 'Características y beneficios', icon: ListChecks },
	{ id: 'antes-despues', label: 'Antes y después', icon: ArrowLeftRight },
	{ id: 'noticias', label: 'Noticias', icon: Newspaper },
	{ id: 'estadisticas', label: 'Datos y estadísticas', icon: BarChart3 },
	{ id: 'estacional', label: 'Vacaciones / Estacional', icon: SunMedium },
];

const formatOptions: Array<{ id: 'static_image' | 'carousel' | 'video'; label: string; icon: LucideIcon }> = [
	{ id: 'static_image', label: 'Estático', icon: ImageIcon },
	{ id: 'carousel', label: 'Carrusel', icon: Layers3 },
	{ id: 'video', label: 'Video', icon: Play },
];
const formatLabels: Record<string, string> = Object.fromEntries(formatOptions.map((f) => [f.id, f.label]));
const categoryIcons: Record<string, LucideIcon> = Object.fromEntries(winnersCategories.map((c) => [c.id, c.icon]));
const categoryLabels: Record<string, string> = Object.fromEntries(winnersCategories.map((c) => [c.id, c.label]));

function FilterIcon({ icon: IconComponent, size = 15 }: { icon: LucideIcon; size?: number }) {
	return <IconComponent size={size} strokeWidth={2.1} aria-hidden="true" />;
}

// Use categoryLeaf from manifest (set by Foreplay's own classification) as primary source
function classifyItem(item: any): string {
	// Primary: use categoryLeaf from the manifest scraper
	const leaf = (item.categoryLeaf || '').toLowerCase().trim();
	if (leaf) {
		const legacyAngles: Record<string, string> = {
			hero: 'producto',
			mitos: 'razones-porque',
			urgencia: 'precio',
			envio: 'precio',
			garantia: 'razones-porque',
		};
		return legacyAngles[leaf] || (categoryLabels[leaf] ? leaf : 'producto');
	}

	// Fallback: text-based heuristics when categoryLeaf is missing
	const tid = item.templateId;

	if (tid === 23) {
		return 'competencia';
	}
	if (tid === 22) {
		return 'resenas';
	}
	if (tid === 17) {
		return 'razones-porque';
	}
	if (tid === 15) {
		return 'precio';
	}
	if (tid === 18) {
		return 'precio';
	}
	return 'producto';
}

function getTags(item: any, category: string): string[] {
	const name = (item.name || '').toLowerCase();
	const ind = ((item.metadata && item.metadata.industry) || '').toLowerCase();
	const tags = new Set<string>();

	if (category === 'competencia') tags.add('Comparación').add('VS');
	if (category === 'resenas') tags.add('Testimonial').add('Opinión').add('Social Proof');
	if (category === 'precio') tags.add('Oferta').add('Descuento').add('Promo');
	if (category === 'producto') tags.add('Producto').add('Presentación');
	if (category === 'caracteristicas') tags.add('Producto').add('Beneficios');
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

	if (name.includes('bold')) tags.add('Llamativo').add('Bold');
	if (name.includes('simple') || name.includes('minimal')) tags.add('Minimalista');
	if (name.includes('premium') || name.includes('luxury')) tags.add('Premium');
	if (name.includes('modern') || name.includes('next-gen')) tags.add('Moderno');

	return Array.from(tags);
}

// Masonry con orden horizontal: reparte round-robin en N columnas flex,
// así las tarjetas se compactan sin huecos y el orden sigue siendo por filas.
type WinnerItem = {
	templateId: number;
	name: string;
	imagePath: string;
	imageUrl?: string;
	isLocked?: boolean;
	lockedCount?: number;
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
		// Solo para mediaType === 'video': imagePath queda como el poster.
		videoPath?: string;
		durationSec?: number;
		likes?: number;
	};
};

const VIDEOS_BASE = 'https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-videos';
const winnersLibraryCache: Record<'free' | 'paid' | 'admin', WinnerItem[] | null> = { free: null, paid: null, admin: null };
const defaultLibraryAccess = {
	isPaid: false,
	planCode: 'trial',
	previewPerAngle: 5,
	totalCount: 0,
	accessibleCount: 0,
	lockedCount: 0,
	lockedByAngle: {} as Record<string, number>,
};

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
	onOpenPlans,
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
	onOpenPlans?: () => void;
	onBackToPreviousView?: () => void;
}) {
	const [items, setItems] = useState<WinnerItem[]>([]);
	const [libraryAccess, setLibraryAccess] = useState<typeof defaultLibraryAccess>(defaultLibraryAccess);
	const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState('');
	const [error, setError] = useState('');
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

	const [savedOnly, setSavedOnly] = useState(false);
	const [selectedFormat, setSelectedFormat] = useState<'todos' | 'static_image' | 'carousel' | 'video'>('todos');
	const [selectedCategories, setSelectedCategories] = useState<string[]>(['todos']);
	const [showCategoryMenu, setShowCategoryMenu] = useState(false);
	const [showFormatMenu, setShowFormatMenu] = useState(false);

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

	// Admin form states
	const [showAddModal, setShowAddModal] = useState(false);
	const [newAdName, setNewAdName] = useState('');
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
	

	
	// Output results
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
	const isPaidLibraryUser = isAdmin || (['creator', 'pro', 'scale', 'agency'].includes(profile?.planCode) && profile?.subscriptionStatus === 'authorized');
	const libraryCacheKey = isAdmin ? 'admin' : isPaidLibraryUser ? 'paid' : 'free';
	const availableFormatOptions = canUseVideos ? formatOptions : formatOptions.filter((option) => option.id !== 'video');

	const getSessionToken = (sess: any) => sess?.access_token || '';

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
	const restoreScrollPending = useRef(false);
	const handleUseIdea = (item: WinnerItem) => {
		savedScrollY.current = window.scrollY;
		restoreScrollPending.current = true;
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
		restoreScrollPending.current = true;
		void loadSavedProducts();
		setCardContextMenu(null);
		setPlayingVideoPath(null);
		setVideoCreationRef(item);
	};




	const loadWinners = async () => {
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
				const token = getSessionToken(session);
				const res = await fetch('/api/creativos/library', {
					headers: token ? { authorization: `Bearer ${token}` } : undefined,
				});
				if (!res.ok) throw new Error('No se pudo cargar tu acceso a la biblioteca.');
				const data = await res.json();
				rawItems = data.items || [];
				if (data.access) setLibraryAccess({ ...defaultLibraryAccess, ...data.access });
			} else {
				const res = await fetch('/scraped_ads/manifest.json');
				if (!res.ok) throw new Error('No se pudo cargar el catálogo local.');
				const data = await res.json();
				rawItems = data.items || [];
				setLibraryAccess({ ...defaultLibraryAccess, isPaid: true, totalCount: rawItems.length, accessibleCount: rawItems.length });
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
						categoryLeaf: v.category || null,
						metadata: {
							mediaType: 'video',
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
	// El filtro de guardados muestra su propio total, igual que Ángulo y Formato.
	const savedCount = useMemo(() => items.filter(isSavedItem).length, [items, likedScrapedPaths, favorites]);
	const matchesSaved = (item: WinnerItem) => !savedOnly || isSavedItem(item);
	const itemFormat = (item: WinnerItem): 'static_image' | 'carousel' | 'video' =>
		item.metadata?.mediaType === 'carousel' ? 'carousel' : item.metadata?.mediaType === 'video' ? 'video' : 'static_image';
	const matchesFormat = (item: WinnerItem) => selectedFormat === 'todos' || itemFormat(item) === selectedFormat;
	const matchesCategory = (item: WinnerItem) =>
		selectedCategories.includes('todos') || selectedCategories.length === 0 || selectedCategories.includes((item as any).category || 'producto');
	const searchTerm = query.toLowerCase().trim();
	const matchesSearch = (item: WinnerItem) => !searchTerm ||
		item.name.toLowerCase().includes(searchTerm) ||
		((item as any).tags || []).some((t: string) => t.toLowerCase().includes(searchTerm));

	// Cuántos ganadores hay de cada formato, ya filtrados por guardados/
	// ángulo/búsqueda (todo menos el formato en sí).
	const formatCounts = useMemo(() => {
		let staticCount = 0;
		let carouselCount = 0;
		let videoCount = 0;
		items.forEach((item) => {
			if (!matchesSaved(item) || !matchesCategory(item) || !matchesSearch(item)) return;
			const f = itemFormat(item);
			if (f === 'carousel') carouselCount += 1;
			else if (f === 'video') videoCount += 1;
			else staticCount += 1;
		});
		return { static_image: staticCount, carousel: carouselCount, video: videoCount };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, savedOnly, selectedCategories, query, likedScrapedPaths, favorites]);
	const formatAllCount = formatCounts.static_image + formatCounts.carousel + formatCounts.video;

	// Cuántos ganadores hay de cada ángulo (precio, testimonios, etc.), ya
	// filtrados por guardados/formato/búsqueda (todo menos el ángulo).
	const categoryCounts = useMemo(() => {
		const m: Record<string, number> = {};
		items.forEach((item) => {
			if (!matchesSaved(item) || !matchesFormat(item) || !matchesSearch(item)) return;
			const c = (item as any).category || 'producto';
			m[c] = (m[c] || 0) + 1;
		});
		return m;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, savedOnly, selectedFormat, query, likedScrapedPaths, favorites]);
	// El ángulo es un solo valor por anuncio: sumar los buckets da el total real.
	const categoryAllCount = useMemo(() => Object.values(categoryCounts).reduce((a, b) => a + b, 0), [categoryCounts]);

	// Filtros combinados para lo que realmente se ve en la grilla.
	const filteredItems = useMemo(() => {
		return items.filter((item) =>
			matchesSaved(item) && matchesFormat(item) && matchesCategory(item) && matchesSearch(item)
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, savedOnly, selectedFormat, selectedCategories, query, likedScrapedPaths, favorites]);

	// Lazy load: primer bloque de tarjetas y otro más al acercarse al final.
	const [visibleCount, setVisibleCount] = useState(BLOQUE);
	const [lockedVisibleCount, setLockedVisibleCount] = useState(8);
	const selectedLockedAngles = useMemo(() => {
		if (libraryAccess.isPaid || savedOnly || query.trim()) return [];
		return selectedCategories.includes('todos') ? winnersCategories.map((angle) => angle.id) : selectedCategories;
	}, [libraryAccess.isPaid, query, savedOnly, selectedCategories]);
	const lockedTotalForSelection = useMemo(
		() => selectedLockedAngles.reduce((total, angle) => total + (libraryAccess.lockedByAngle[angle] || 0), 0),
		[selectedLockedAngles, libraryAccess.lockedByAngle]
	);
	const hasMoreItems = visibleCount < filteredItems.length || lockedVisibleCount < lockedTotalForSelection;
	/**
	 * Lo que se PIDE, con un tramo de adelanto.
	 *
	 * Se firmaba y se bajaba exactamente lo que estaba en pantalla, así que al
	 * llegar al final del scroll no había nada preparado: recién ahí arrancaba el
	 * pedido de firmas y después la bajada de las imágenes, y hasta que terminaba
	 * la grilla se quedaba quieta. Pidiendo un bloque por delante, cuando llegás
	 * abajo las imágenes del bloque siguiente ya están decodificadas y entran de
	 * inmediato.
	 */
	const pedidoItems = useMemo(
		() => filteredItems.slice(0, Math.min(visibleCount + BLOQUE, filteredItems.length)),
		[filteredItems, visibleCount],
	);
	// El catálogo completo llega sin firmar (son más de 6.500 rutas): se piden
	// las URLs de las tarjetas que se están viendo, y del carrusel abierto.
	/**
	 * Qué URLs se piden firmadas, y en qué orden.
	 *
	 * El servidor firma como mucho 250 rutas por pedido. Al empezar a firmar las
	 * doce páginas de cada carrusel, veinte tarjetas visibles llegaban a pedir 260
	 * y las últimas quedaban fuera del corte: tarjetas en blanco, sin siquiera su
	 * portada, porque los carruseles del principio se comían todo el presupuesto.
	 *
	 * Ahora van PRIMERO todas las portadas —sin portada no hay tarjeta— y recién
	 * después las páginas para precargar, que son una mejora y no un requisito.
	 * Si el presupuesto no alcanza, se pierde fluidez al pasar páginas, nunca una
	 * imagen visible.
	 */
	/**
	 * Solo lo que se ve, y las páginas del que está abierto.
	 *
	 * Acá se pedían además hasta 12 páginas de CADA carrusel visible: con 20
	 * tarjetas en pantalla eso son 260 firmas para mostrar 20 imágenes. De ahí
	 * salía la espera larga al entrar a la biblioteca y al cambiar un filtro,
	 * porque hasta que no volvía toda esa tanda no aparecía ninguna portada.
	 *
	 * Precargar las páginas de carruseles que nadie abrió es una comodidad —que
	 * las flechas respondan al instante— y se estaba pagando con el tiempo de
	 * carga de todos. Ahora las páginas se firman cuando el anuncio se abre, que
	 * son unas pocas y llegan enseguida.
	 */
	const signedUrls = useReferenceUrls(useMemo(() => {
		const portadas = pedidoItems.map((item: any) => item.imagePath);
		const abierto = activeAd ? [activeAd.imagePath, ...((activeAd as any).metadata?.carouselImages || [])] : [];
		return [...portadas, ...abierto];
	}, [pedidoItems, activeAd]));

	/**
	 * Primero lo que se ve, y el resto a medida que bajás.
	 *
	 * Antes la grilla esperaba a que un tramo entero estuviera DECODIFICADO antes
	 * de dibujar nada: se entraba a la biblioteca y la pantalla quedaba en
	 * esqueletos hasta que terminaban de bajar veinte imágenes, aunque en pantalla
	 * entraran seis. Y al scrollear volvía a pasar lo mismo con cada bloque.
	 *
	 * Ahora las tarjetas se dibujan enseguida y cada imagen se pide cuando su
	 * tarjeta entra en la zona cercana a la pantalla, con un observador por tarjeta
	 * (`ImagenDeTarjeta`). Las de la primera pantalla, además, con prioridad alta.
	 *
	 * Que no salte nada se resuelve reservando el lugar de cada imagen con su
	 * proporción antes de que baje, y midiendo la altura real cuando entra.
	 *
	 * Las que fallaron quedan fuera del render: una imagen rota no deja un hueco.
	 */
	const urlDeItem = useCallback(
		(item: any) => (item?.imageUrl || (item?.imagePath?.startsWith('http') ? item.imagePath : signedUrls[item?.imagePath] || '')),
		[signedUrls],
	);
	const visibleItems = useMemo(
		() => pedidoItems.slice(0, visibleCount).filter((item: any) => !imagenFallada(urlDeItem(item))),
		[pedidoItems, visibleCount, urlDeItem],
	);
	/**
	 * Lo único que se sigue esperando son las URL firmadas: sin ellas no hay nada
	 * que pedirle al navegador. Las imágenes ya no frenan el dibujado.
	 */
	const cargandoImagenes = visibleItems.length === 0 && filteredItems.length > 0;

	/**
	 * Pedir el bloque siguiente, nunca antes de que entre el actual.
	 *
	 * El centinela vive al final de lo que está renderizado. Mientras un bloque
	 * todavía se está bajando, lo renderizado es corto y el centinela queda a la
	 * vista, así que sin este freno el scroll infinito seguiría pidiendo bloques
	 * en cadena hasta encolar la biblioteca entera —miles de firmas y miles de
	 * imágenes— para mostrar veinte.
	 */
	const loadMore = useCallback(() => {
		if (loadMoreLock.current || cargandoImagenes) return;
		if (visibleCount < filteredItems.length) {
			loadMoreLock.current = true;
			setVisibleCount((current) => Math.min(current + BLOQUE, filteredItems.length));
			return;
		}
		if (lockedVisibleCount < lockedTotalForSelection) {
			loadMoreLock.current = true;
			setLockedVisibleCount((current) => Math.min(current + BLOQUE, lockedTotalForSelection));
		}
	}, [cargandoImagenes, filteredItems.length, lockedTotalForSelection, lockedVisibleCount, visibleCount]);
	// Precarga las páginas de cada carrusel visible: así las flechas cambian de
	// imagen al instante en vez de esperar a que baje cada foto de a una.
	//
	// Faltaba `signedUrls` en las dependencias, y ese era el problema de fondo:
	// el efecto corría antes de que llegaran las firmas, no encontraba ninguna
	// URL y no volvía a intentarlo nunca. Ahora se ejecuta también cuando las
	// firmas aparecen, que es cuando realmente se puede precargar algo.
	useEffect(() => {
		// Solo el anuncio abierto: es el único cuyas páginas se firman ahora, y el
		// único cuyas flechas alguien puede llegar a tocar.
		const slides = (activeAd as any)?.metadata?.carouselImages;
		if (!Array.isArray(slides) || slides.length < 2) return;
		// El bucket es privado: las URLs las firma el servidor.
		const urlFor = (path: string) => (path.startsWith('http') ? path : signedUrls[path] || '');
		// Urgentes: el usuario ya tiene ese anuncio abierto y puede tocar la flecha
		// en cualquier momento. Pasan adelante de la cola de la grilla.
		precargarImagenes(slides.slice(1).map(urlFor), true);
	}, [activeAd, signedUrls]);
	const lockedItems = useMemo<WinnerItem[]>(() => {
		if (!selectedLockedAngles.length || !lockedVisibleCount) return [];
		const selectedAngles = selectedLockedAngles;
		const result: WinnerItem[] = [];
		selectedAngles.forEach((angle) => {
			const remaining = libraryAccess.lockedByAngle[angle] || 0;
			if (!remaining || result.length >= lockedVisibleCount) return;
			for (let position = 0; position < remaining && result.length < lockedVisibleCount; position += 1) {
			result.push({
				templateId: -1000 - result.length,
				name: categoryLabels[angle] || 'Ángulo premium',
				imagePath: `locked-${angle}-${result.length}`,
				categoryGroup: null,
				categoryBranch: null,
				categoryLeaf: angle,
				category: angle,
				metadata: { mediaType: 'static_image' },
				isLocked: true,
				lockedCount: remaining,
			});
			}
		});
		return result;
	}, [libraryAccess, lockedVisibleCount, selectedLockedAngles]);
	const displayItems = useMemo(() => [...visibleItems, ...lockedItems], [visibleItems, lockedItems]);

	/**
	 * Evita pedir dos bloques a la vez mientras React todavía no renderizó.
	 *
	 * Se trababa y no se soltaba nunca: solo se liberaba al cambiar un filtro. O
	 * sea que el scroll infinito cargaba UN bloque y se moría — bajabas hasta el
	 * final, no aparecían más imágenes, y la única forma de destrabarlo era tocar
	 * un filtro. Ahora se libera en cuanto entra el bloque nuevo, que es el
	 * momento en que de verdad se puede volver a pedir.
	 */
	const loadMoreLock = useRef(false);
	useEffect(() => {
		loadMoreLock.current = false;
	}, [visibleCount, lockedVisibleCount]);
	useEffect(() => {
		loadMoreLock.current = false;
		setVisibleCount(BLOQUE);
		setLockedVisibleCount(8);
	}, [selectedCategories, selectedFormat, savedOnly, query]);

	// Al abrir un creador la grilla sale del DOM y vuelve con otro nodo, así que
	// además del conjunto de tarjetas hay que avisarle de esos idas y vueltas:
	// con la referencia vieja el masonry no volvería a medir nada.
	const { grillaRef, columnas, estiloDeGrilla } = useMasonry([activeAd, videoCreationRef, loading, displayItems, cargandoImagenes]);
	const loadMoreRef = React.useRef<HTMLDivElement | null>(null);
	// Al volver de "Crear con este diseño" a la grilla, restaura el scroll
	// guardado en handleUseIdea en vez de dejar la página arriba de todo.
	useEffect(() => {
		if (activeAd || videoCreationRef || !restoreScrollPending.current) return;
		const y = savedScrollY.current;
		restoreScrollPending.current = false;
		if (!y) return;
		requestAnimationFrame(() => requestAnimationFrame(() => {
			window.scrollTo(0, y);
			requestAnimationFrame(() => {
				const sentinel = loadMoreRef.current;
				if (sentinel && sentinel.getBoundingClientRect().top <= window.innerHeight + 900) loadMore();
			});
		}));
	}, [activeAd, loadMore, videoCreationRef]);
	useEffect(() => {
		const sentinel = loadMoreRef.current;
		if (!sentinel || !hasMoreItems) return;
		const maybeLoadMore = () => {
			if (sentinel.getBoundingClientRect().top <= window.innerHeight + 900) loadMore();
		};
		const observer = new IntersectionObserver((entries) => {
			if (entries[0]?.isIntersecting) loadMore();
		}, { rootMargin: '600px' });
		observer.observe(sentinel);
		window.addEventListener('resize', maybeLoadMore);
		const frame = requestAnimationFrame(maybeLoadMore);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', maybeLoadMore);
			cancelAnimationFrame(frame);
		};
	}, [activeAd, hasMoreItems, loadMore]);

	// Delete winner handler
	const handleDelete = async (imagePath: string, relatedPaths: string[] = []) => {
		if (!window.confirm('¿Seguro que querés eliminar este anuncio de la biblioteca de ganadores?')) return;
		try {
			const imagePaths = [...new Set([imagePath, ...relatedPaths].filter(Boolean))];
			const res = await fetch('/api/creativos/references', {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${session?.access_token || ''}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ imagePaths }),
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Error al eliminar.');
			
			// Update local state
			winnersLibraryCache.free = null;
			winnersLibraryCache.paid = null;
			winnersLibraryCache.admin = null;
			setItems(prev => prev.filter(item => item.imagePath !== imagePath));
			setSelectedImagePaths(prev => prev.filter(p => p !== imagePath));
		} catch (err: any) {
			alert(err.message);
		}
	};

	const handleDeleteVideo = async (item: WinnerItem) => {
		if (!window.confirm('¿Seguro que querés eliminar este video de la biblioteca de ganadores?')) return;
		try {
			const res = await fetch('/api/creativos/videos', {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${session?.access_token || ''}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					videoPath: item.metadata?.videoPath,
					thumbnailPath: item.imagePath,
				}),
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload.error || 'Error al eliminar el video.');

			winnersLibraryCache.free = null;
			winnersLibraryCache.paid = null;
			winnersLibraryCache.admin = null;
			setPlayingVideoPath((current) => current === item.imagePath ? null : current);
			setItems((prev) => prev.filter((current) => current.imagePath !== item.imagePath));
			setSelectedImagePaths((prev) => prev.filter((path) => path !== item.imagePath));
		} catch (err: any) {
			alert(err.message || 'Error al eliminar el video.');
		}
	};

	const handleDeleteItem = (item: WinnerItem) => {
		if (item.metadata?.mediaType === 'video') void handleDeleteVideo(item);
		else void handleDelete(item.imagePath, item.metadata?.mediaType === 'carousel' && Array.isArray(item.metadata.carouselImages) ? item.metadata.carouselImages : []);
	};

	// Bulk delete winner handler for admin
	const handleBulkDelete = async () => {
		if (!selectedImagePaths.length) return;
		if (!window.confirm(`¿Seguro que querés eliminar los ${selectedImagePaths.length} anuncios seleccionados de la biblioteca de ganadores?`)) return;

		try {
			const selectedItems = items.filter((item) => selectedImagePaths.includes(item.imagePath));
			const staticPaths = selectedItems.filter((item) => item.metadata?.mediaType !== 'video').flatMap((item) => [item.imagePath, ...(item.metadata?.mediaType === 'carousel' && Array.isArray(item.metadata.carouselImages) ? item.metadata.carouselImages : [])]);
			const videoItems = selectedItems.filter((item) => item.metadata?.mediaType === 'video');
			let deletedCount = 0;

			if (staticPaths.length) {
				const res = await fetch('/api/creativos/references', {
					method: 'DELETE',
					headers: {
						'Authorization': `Bearer ${session?.access_token || ''}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ imagePaths: staticPaths })
				});
				const payload = await res.json();
				if (!res.ok) throw new Error(payload.error || 'Error al eliminar selección.');
				deletedCount += payload.deletedCount || staticPaths.length;
			}

			if (videoItems.length) {
				const res = await fetch('/api/creativos/videos', {
					method: 'DELETE',
					headers: {
						'Authorization': `Bearer ${session?.access_token || ''}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ items: videoItems.map((item) => ({ videoPath: item.metadata?.videoPath, thumbnailPath: item.imagePath })) })
				});
				const payload = await res.json();
				if (!res.ok) throw new Error(payload.error || 'Error al eliminar los videos seleccionados.');
				deletedCount += payload.deletedCount || videoItems.length;
			}

			const removeSet = new Set(selectedImagePaths);
			winnersLibraryCache.free = null;
			winnersLibraryCache.paid = null;
			winnersLibraryCache.admin = null;
			setItems(prev => prev.filter(item => !removeSet.has(item.imagePath)));
			setSelectedImagePaths([]);
			if (onToast) onToast(`¡${deletedCount || selectedImagePaths.length} anuncios eliminados con éxito!`);
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
				formData.append('categoryLeaf', temp.categoryLeaf || 'producto');
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
			setNewAdFile(null);
			setNewAdMediaType('static_image');
			setNewAdCarouselFiles([]);
			void loadWinners();
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
				onToast={onToast}
				onGenerationStarted={onGenerationStarted}
				onBack={(opciones) => {
					setActiveAd(null);
					// Tras generar, el usuario ya está en "Mis imágenes" viendo cómo se
					// crean sus creativos: devolverlo a la pantalla de la que venía
					// —guardados, inicio— lo sacaba justo de donde quería estar.
					if (onBackToPreviousView && !opciones?.trasGenerar) {
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
					<span>{libraryAccess.isPaid ? `Explorá los ${libraryAccess.totalCount.toLocaleString('es-AR')} anuncios ganadores y usalos como plantilla.` : `Explorá ${libraryAccess.accessibleCount} selecciones gratis y desbloqueá ${libraryAccess.totalCount.toLocaleString('es-AR')} anuncios ganadores.`}</span>
				</div>
			</div>

			{!libraryAccess.isPaid && !isAdmin && !loading && (
				<section className="library-access-banner">
					<div className="library-access-banner-icon"><Icon name="spark" size={20} /></div>
					<div className="library-access-banner-copy"><strong>Estás viendo una selección gratuita</strong><span>{libraryAccess.accessibleCount} creativos seleccionados · <b>{libraryAccess.lockedCount.toLocaleString('es-AR')} más</b> esperan ser desbloqueados</span></div>
					<button type="button" className="library-access-banner-cta" onClick={() => setShowUpgradePrompt(true)}>Ver biblioteca completa <Icon name="arrow" size={15} /></button>
				</section>
			)}

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
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Buscar por marca o palabra clave..."
					/>
				</label>
			</div>

			{/* Ángulo, Formato y Guardados: un solo contenedor.
			    En computadora se acomodan en una fila; en mobile, al no entrar,
			    el propio wrap los acomoda de a 2 (gracias al ancho fijo/50% de
			    cada .niche-dd) sin necesidad de filas separadas a mano. */}
			<div className="library-filters-row library-filter-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
				<div className="niche-dd" onClick={(e) => e.stopPropagation()}>
					<button type="button" className="niche-dd-trigger" onClick={() => { setShowCategoryMenu((v) => !v); setShowFormatMenu(false); }}>
						<span className="niche-dd-label">{(() => { const a = selectedCategories.filter((x) => x !== 'todos'); return a.length === 0 ? 'Ángulo' : a.length === 1 ? (categoryLabels[a[0]] || a[0]) : `${a.length} ángulos`; })()}</span>
						<span className="niche-dd-badge">{(() => { const a = selectedCategories.filter((x) => x !== 'todos'); return a.length === 0 ? categoryAllCount : a.reduce((s, x) => s + (categoryCounts[x] || 0), 0); })()}</span>
						<span className={`niche-dd-caret${showCategoryMenu ? ' is-open' : ''}`}>▾</span>
					</button>
					{showCategoryMenu && (
						<div className="niche-dd-menu">
							<button type="button" className={`niche-dd-item${selectedCategories.includes('todos') || !selectedCategories.length ? ' is-active' : ''}`} onClick={() => setSelectedCategories(['todos'])}>
									<span className="niche-dd-icon"><FilterIcon icon={Sparkles} /></span>
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
										<span className="niche-dd-icon"><FilterIcon icon={cat.icon} /></span>
										<span className="niche-dd-name">{cat.label}</span><span className="niche-dd-count">{categoryCounts[cat.id] || 0}</span>
										<span className="niche-dd-check">{active ? '✓' : ''}</span>
									</button>
								);
							})}
						</div>
					)}
				</div>

				<div className="niche-dd" onClick={(e) => e.stopPropagation()}>
					<button type="button" className="niche-dd-trigger" onClick={() => { setShowFormatMenu((v) => !v); setShowCategoryMenu(false); }}>
						<span className="niche-dd-label">{selectedFormat === 'todos' ? 'Formato' : formatLabels[selectedFormat]}</span>
						<span className="niche-dd-badge">{selectedFormat === 'todos' ? formatAllCount : formatCounts[selectedFormat]}</span>
						<span className={`niche-dd-caret${showFormatMenu ? ' is-open' : ''}`}>▾</span>
					</button>
					{showFormatMenu && (
						<div className="niche-dd-menu">
							<button type="button" className={`niche-dd-item${selectedFormat === 'todos' ? ' is-active' : ''}`} onClick={() => { setSelectedFormat('todos'); setShowFormatMenu(false); }}>
									<span className="niche-dd-icon"><FilterIcon icon={Layers3} /></span>
								<span className="niche-dd-name">Todos los formatos</span><span className="niche-dd-count">{formatAllCount}</span>
								<span className="niche-dd-check">{selectedFormat === 'todos' ? '✓' : ''}</span>
							</button>
							{availableFormatOptions.map((opt) => {
								const active = selectedFormat === opt.id;
								return (
									<button type="button" key={opt.id} className={`niche-dd-item${active ? ' is-active' : ''}`} onClick={() => { setSelectedFormat(opt.id); setShowFormatMenu(false); }}>
										<span className="niche-dd-icon"><FilterIcon icon={opt.icon} /></span>
										<span className="niche-dd-name">{opt.label}</span><span className="niche-dd-count">{formatCounts[opt.id] || 0}</span>
										<span className="niche-dd-check">{active ? '✓' : ''}</span>
									</button>
								);
							})}
						</div>
					)}
				</div>

				{/* Misma estructura que los otros dos filtros: icono, etiqueta y
				    contador. Antes era un botón suelto con el corazón y el texto
				    a secas, y como el trigger es una grilla de 3 columnas, el
				    corazón caía en la columna del label y el texto en la del
				    contador: por eso se veía de otro tamaño y desalineado. */}
				<div className="niche-dd">
					<button
						type="button"
						onClick={() => setSavedOnly((value) => !value)}
						className={`niche-dd-trigger is-toggle${savedOnly ? ' is-on' : ''}`}
						aria-pressed={savedOnly}
					>
						<span className="niche-dd-lead" aria-hidden="true">♥</span>
						<span className="niche-dd-label">Guardados</span>
						<span className="niche-dd-badge">{savedCount}</span>
					</button>
				</div>
			</div>

			{/* Filtros activos: se ven abajo como chips para saber de un vistazo qué está aplicado, y sacar uno sin abrir la lista de nuevo. */}
			{(() => {
				const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
				selectedCategories.filter((x) => x !== 'todos').forEach((c) => chips.push({
									key: `c-${c}`, label: categoryLabels[c] || c,
					onRemove: () => setSelectedCategories((prev) => { const next = prev.filter((x) => x !== c); return next.length ? next : ['todos']; }),
				}));
				if (selectedFormat !== 'todos') chips.push({
					key: 'format', label: formatLabels[selectedFormat],
					onRemove: () => setSelectedFormat('todos'),
				});
				if (savedOnly) chips.push({ key: 'saved', label: '❤️ Guardados', onRemove: () => setSavedOnly(false) });
				if (!chips.length) return null;
				return (
					<div className="library-active-filters" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
						{chips.map((chip) => (
							<button
								key={chip.key}
								type="button"
								onClick={chip.onRemove}
								style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 8px 0 12px', borderRadius: '15px', border: '1px solid #e7dffa', background: '#f8f5fe', color: '#5b2fc9', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
							>
													{chip.key.startsWith('c-') && categoryIcons[chip.key.slice(2)] ? <FilterIcon icon={categoryIcons[chip.key.slice(2)]} size={13} /> : null}
													{chip.key === 'format' && availableFormatOptions.find((option) => option.id === selectedFormat)?.icon ? <FilterIcon icon={availableFormatOptions.find((option) => option.id === selectedFormat)!.icon} size={13} /> : null}
													{chip.label}
								<span style={{ display: 'grid', placeItems: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#e7dffa', fontSize: '10px', fontWeight: 900 }}>✕</span>
							</button>
						))}
						<button
							type="button"
							onClick={() => { setSelectedCategories(['todos']); setSelectedFormat('todos'); setSavedOnly(false); }}
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
					<button onClick={() => void loadWinners()}>Reintentar</button>
				</div>
			) : filteredItems.length === 0 ? (
				<div className="studio-empty large">
					<Icon name="search" size={40} />
					<h3>No encontramos anuncios</h3>
					<p>Probá cambiando el ángulo, el formato o la palabra clave.</p>
					<button onClick={() => { setSelectedCategories(['todos']); setSelectedFormat('todos'); setSavedOnly(false); setQuery(''); }}>Limpiar filtros</button>
				</div>
			) : (<>
				{/* Grilla real, recorrida por filas.
				    Con columnas CSS el navegador llena una columna completa antes de
				    empezar la siguiente: la segunda tarjeta caía DEBAJO de la primera y
				    no al lado, así que lo nuevo aparecía bajando en vertical en vez de
				    completar la fila de arriba. Acá cada tarjeta ocupa tantas filas de
				    1px como mide (lo calcula `useMasonry`), que conserva el escalonado
				    del masonry sin perder el orden de lectura. */}
				<div
					ref={grillaRef}
					className="library-masonry"
					style={estiloDeGrilla}
				>
					{[displayItems].map((columnItems, columnIndex) => (
					<React.Fragment key={columnIndex}>
					{columnItems.map((item, idx) => {
						if (item.isLocked) return (
							<article key={item.imagePath} className="library-locked-card" onClick={() => setShowUpgradePrompt(true)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setShowUpgradePrompt(true); }}>
								{/* Decía "570 referencias en este ángulo" en TODAS las tarjetas
								    bloqueadas del mismo ángulo: el número es el total del ángulo, no
								    el de esa tarjeta, así que repetido pierde sentido y confunde.
								    Y el botón quedaba abajo, fuera de la vista en responsive. Ahora
								    la tarjeta entera es el botón y dice lo único que importa. */}
								<div className="library-locked-art">
									<span className="library-locked-noise" />
									<span className="library-locked-lock"><Icon name="spark" size={22} /></span>
									<strong>Desbloquear</strong>
									<small>{categoryLabels[item.category || 'producto'] || 'Ángulo premium'}</small>
								</div>
							</article>
						);
						const hasFailed = item.imagePath ? failedImages.has(item.imagePath) : false;
						if (hasFailed) return null; // imagen rota: no mostrar placeholder genérico
						const isVideo = item.metadata?.mediaType === 'video';
						const urlFor = (path: string) => (path.startsWith('http') ? path : signedUrls[path] || '');
						const imageUrl = item.imageUrl || urlFor(item.imagePath);
						// Sin URL firmada no hay nada que mostrar todavía: la tarjeta aparece
						// en cuanto el servidor devuelve la firma de su portada.
						if (!imageUrl) return null;

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
								{/* El encabezado mostraba el nombre del archivo del ganador —"Nosotros vs
								    ellos (9)"— que es un nombre interno de la biblioteca y no le dice
								    nada a nadie. Ocupaba lugar arriba de cada tarjeta y ensuciaba la
								    grilla. Lo único que valía la pena de esa fila era el borrar del
								    admin, que ahora vive sobre la imagen. */}
								{isAdmin && (
									<button
										onClick={(e) => { e.stopPropagation(); handleDeleteItem(item); }}
										className="library-card-admin-delete"
										title="Eliminar ganador"
									>
										<Icon name="close" size={14} />
									</button>
								)}

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

									{/* La foto se pide cuando la tarjeta se acerca a la pantalla, no
									    por su número de orden: `loading="lazy"` hacía casi lo mismo,
									    pero acá la cercanía tiene que decidir además qué rutas se
									    mandan a firmar, así que manda un solo mecanismo para las dos
									    cosas. El fundido y el lugar reservado los maneja el propio
									    componente. */}
									<ImagenDeTarjeta
										url={slideUrl}
										alt={item.name}
										className="library-card-imagen"
										style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
										prioritaria={idx < 6}
										onFalla={(event) => {
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

								{/* Acciones de la tarjeta; el dominio de la fuente no se muestra. */}
								<div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
									<button
										onClick={(e) => {
											e.stopPropagation();
											if (isVideo) handleCreateVideo(item); else handleUseIdea(item);
										}}
										style={{
											width: '100%',
											// Es la acción principal de cada tarjeta: tenía el alto y la
											// letra de un detalle secundario.
											minHeight: '40px',
											background: '#f2ecfc',
											border: 0,
											borderRadius: '9px',
											color: '#19171d',
											fontWeight: 'bold',
											fontSize: '12.5px',
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
					</React.Fragment>
					))}
					{/* Los esqueletos van al final de la grilla, que es el único lugar
					    donde crecer no empuja nada de lo que ya estás mirando: cuando el
					    bloque termina de bajar, las tarjetas ocupan ese espacio ya con su
					    imagen y con su altura final. */}
					{cargandoImagenes && Array.from({ length: columnas }, (_, hueco) => (
						<article key={`esqueleto-${hueco}`} className="library-card-esqueleto" aria-hidden="true" />
					))}
				</div>
				{cargandoImagenes && (
					<p className="library-cargando-aviso" role="status">
						<span className="studio-spinner" style={{ width: '15px', height: '15px', borderWidth: '2px' }} />
						Preparando las imágenes…
					</p>
				)}
				{hasMoreItems && (
					<div ref={loadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
						{!cargandoImagenes && <span className="studio-spinner" style={{ width: '22px', height: '22px' }} />}
					</div>
				)}
			</>
		)}

			{showUpgradePrompt && !libraryAccess.isPaid && (
				<div className="library-upgrade-overlay" role="dialog" aria-modal="true" aria-labelledby="library-upgrade-title">
					<div className="library-upgrade-modal">
						<button type="button" className="library-upgrade-close" onClick={() => setShowUpgradePrompt(false)} aria-label="Cerrar">×</button>
						<div className="library-upgrade-kicker"><span>✦</span> ACCESO BÁSICO</div>
						<h2 id="library-upgrade-title">Tu próximo anuncio ganador está acá.</h2>
						<p className="library-upgrade-lead">Desbloqueá toda la biblioteca y dejá de trabajar con referencias al azar. Encontrá el ángulo exacto para cada producto.</p>
						<div className="library-upgrade-value-list">
							<div><span>✓</span><p><strong>Biblioteca completa</strong><small>Todos los estáticos y carruseles, organizados por ángulo.</small></p></div>
							<div><span>✓</span><p><strong>5 tokens incluidos cada mes</strong><small>Generá tus primeras ideas sin comprar nada extra.</small></p></div>
							<div><span>✓</span><p><strong>Cancelá cuando quieras</strong><small>Sin permanencia y con pago seguro.</small></p></div>
						</div>
						<div className="library-upgrade-price"><strong>USD 9,99</strong><span>/mes · incluye 5 tokens</span></div>
						<button type="button" className="library-upgrade-cta" onClick={() => { setShowUpgradePrompt(false); onOpenPlans?.(); }}>Desbloquear biblioteca <Icon name="arrow" size={16} /></button>
						<button type="button" className="library-upgrade-later" onClick={() => setShowUpgradePrompt(false)}>Seguir explorando gratis</button>
					</div>
				</div>
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
						{categoryLabels[cardContextMenu.item.category || 'producto'] || 'Anuncio ganador'}
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
							<button
								type="button"
								onClick={() => handleCreateVideo(cardContextMenu.item)}
								style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f4edff', border: 0, borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#6333c9', fontWeight: 700, textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
							>
								<Icon name="spark" size={13} /> Usar este diseño
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
					{isAdmin && (
						<button
							type="button"
							onClick={() => { handleDeleteItem(cardContextMenu.item); setCardContextMenu(null); }}
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
