import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { catalogTaxonomy, creativeCatalog, creativeNumber, mapTemplateRecord, referenceImagePath, referencePresets, ringMeta, templatePath } from '../../lib/creattia/catalog';
import { isSupabaseConfigured, supabase } from '../../lib/creattia/supabase-browser';
import type { Creativo } from '../../data/creativos50';
import './creative-app.css';
import WinnersLibrary from './WinnersLibrary';

type View = 'home' | 'library' | 'products' | 'studio' | 'history' | 'plans' | 'brand' | 'winners' | 'generation' | 'saved';

// Lote de generación en curso: la API responde al instante y el trabajo pesado
// sigue en el servidor; el front lo sigue por batch_id en creative_generations.
type ActiveBatch = {
	batchId: string;
	title: string;
	referenceUrl?: string;
	count: number;
	startedAt: number;
	status: 'processing' | 'completed' | 'failed';
	results: Generation[];
	error?: string;
};
type AppProfile = {
	fullName: string;
	brandName: string;
	website: string;
	instagram: string;
	primaryColor: string;
	secondaryColor: string;
	credits: number;
	monthlyCredits: number;
	subscriptionStatus: string;
	planCode: string;
	subscriptionPeriodEnd: string;
	onboardingCompleted: boolean;
	brandSummary: string;
	catalogStatus: string;
	catalogLastSyncedAt: string;
	catalogError: string;
	logoDataUrl?: string;
};
type DemoSession = { user: { id: string; email: string } };
type AppSession = Session | DemoSession;
type Generation = {
	id: string;
	title: string;
	imageUrl: string;
	format: string;
	createdAt: string;
	category: string;
	templateId?: number;
	brief?: string;
	preset?: string;
	imageType?: string;
	productId?: string;
	productIds?: string[];
	batchId?: string;
	outputIndex?: number;
	referenceUrl?: string;
};
type VariationStrength = 'exact' | 'light' | 'strong';
type CreativeReference = {
	id: string;
	name: string;
	description: string;
	imageUrl: string;
	storagePath?: string;
};
type Product = {
	id: string;
	name: string;
	description: string;
	priceText: string;
	currency: string;
	productUrl: string;
	imageUrl: string;
	imageUrls: string[];
	imageCount: number;
	source: string;
};

const PROFILE_KEY = 'creattia-profile-v1';
const SESSION_KEY = 'creattia-session-v1';
const HISTORY_KEY = 'creattia-history-v1';
const ACTIVE_BATCH_KEY = 'creattia-active-batch-v1';
const PRODUCTS_KEY = 'creattia-products-v1';
const FAVORITES_KEY = 'creattia-favorites-v1';

const defaultProfile: AppProfile = {
	fullName: '',
	brandName: '',
	website: '',
	instagram: '',
	primaryColor: '#18181b',
	secondaryColor: '#f4f0ff',
	credits: 3,
	monthlyCredits: 0,
	subscriptionStatus: 'trial',
	planCode: 'trial',
	subscriptionPeriodEnd: '',
	onboardingCompleted: false,
	brandSummary: '',
	catalogStatus: 'not_scanned',
	catalogLastSyncedAt: '',
	catalogError: '',
};

function demoProductArt(label: string, color: string) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720"><rect width="720" height="720" rx="60" fill="#f7f5fb"/><circle cx="520" cy="170" r="190" fill="${color}" opacity=".18"/><rect x="218" y="120" width="284" height="450" rx="64" fill="white" stroke="#e6e0ef" stroke-width="5"/><rect x="258" y="170" width="204" height="250" rx="38" fill="${color}"/><text x="360" y="470" text-anchor="middle" font-family="Arial" font-size="31" font-weight="700" fill="#201a27">${label}</text><text x="360" y="515" text-anchor="middle" font-family="Arial" font-size="20" fill="#8d8495">TU PRODUCTO</text></svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const demoProducts: Product[] = [
	{ id: 'demo-1', name: 'Producto estrella', description: 'El producto principal de tu tienda.', priceText: '$89.900', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('01', '#19171d'), imageUrls: [demoProductArt('01', '#19171d')], imageCount: 1, source: 'website' },
	{ id: 'demo-2', name: 'Nueva colección', description: 'Una segunda opción para probar otro enfoque.', priceText: '$64.500', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('02', '#ea580c'), imageUrls: [demoProductArt('02', '#ea580c')], imageCount: 1, source: 'website' },
	{ id: 'demo-3', name: 'Best seller', description: 'Producto con buena respuesta comercial.', priceText: '$112.000', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('03', '#059669'), imageUrls: [demoProductArt('03', '#059669')], imageCount: 1, source: 'website' },
];

const subscriptionPlans = [
	{
		code: 'free',
		name: 'Gratis / Pago por uso',
		price: 0,
		description: 'Probá gratis y comprá packs sueltos por imagen.',
		featured: false,
		features: [
			{ name: '3 créditos de regalo al registrarte', active: true },
			{ name: 'Págs de destino y biblioteca de ganadores', active: true },
			{ name: 'Comprá packs individuales por imagen', active: true },
			{ name: '1 marca activa', active: true },
			{ name: 'Soporte por email estándar', active: true },
		]
	},
	{ 
		code: 'creator', 
		name: 'Starter', 
		price: 29, 
		oldPrice: 48, 
		saving: 'Save $19 / yr',
		credits: 40, 
		description: 'Para creadores de contenido que recién empiezan.', 
		featured: false,
		features: [
			{ name: '40 imágenes al mes', active: true },
			{ name: '≈ $0.72 por imagen', active: true },
			{ name: 'Hasta 2 generaciones simultáneas', active: true },
			{ name: '1 marca activa', active: true },
			{ name: 'Soporte estándar por email', active: true },
		]
	},
	{ 
		code: 'pro', 
		name: 'Pro', 
		price: 59, 
		oldPrice: 98, 
		saving: 'Save $39 / yr',
		credits: 120, 
		description: 'Para marcas en crecimiento y e-commerce activos.', 
		featured: true,
		features: [
			{ name: '120 imágenes al mes', active: true },
			{ name: '≈ $0.49 por imagen — el más elegido', active: true },
			{ name: 'Hasta 6 generaciones simultáneas', active: true },
			{ name: 'Hasta 3 marcas activas', active: true },
			{ name: 'Soporte prioritario por email', active: true },
		]
	},
	{ 
		code: 'scale', 
		name: 'Scale', 
		price: 99, 
		oldPrice: 165, 
		saving: 'Save $66 / yr',
		credits: 300, 
		description: 'Para agencias y equipos que escalan contenido.', 
		featured: false,
		features: [
			{ name: '300 imágenes al mes', active: true },
			{ name: '≈ $0.33 por imagen — menor costo', active: true },
			{ name: 'Generaciones simultáneas ilimitadas', active: true },
			{ name: 'Hasta 5 marcas activas', active: true },
			{ name: 'Soporte prioritario y acceso anticipado', active: true },
		]
	}
];

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
	if (name === 'heart') return <svg {...common}><path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/></svg>;
	if (name === 'layers') return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg>;
	return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function Moki({ className = '', label = 'Moki, el asistente creativo de Creattia' }: { className?: string; label?: string }) {
	return <span className={`moki-character ${className}`} role="img" aria-label={label}>
		<img className="moki-character-open" src="/images/creattia/moki-mascot.webp" alt="" aria-hidden="true"/>
		<img className="moki-character-blink" src="/images/creattia/moki-mascot-blink.webp" alt="" aria-hidden="true"/>
	</span>;
}

function loadLocal<T>(key: string, fallback: T): T {
	try {
		const value = localStorage.getItem(key);
		return value ? JSON.parse(value) : fallback;
	} catch {
		return fallback;
	}
}

function saveLocal(key: string, value: unknown) {
	try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be blocked */ }
}

function firstName(profile: AppProfile, email = '') {
	return profile.fullName.trim().split(' ')[0] || email.split('@')[0] || 'hola';
}

function planLabel(profile: AppProfile) {
	if (profile.subscriptionStatus === 'authorized') return `Plan ${profile.planCode.charAt(0).toUpperCase()}${profile.planCode.slice(1)}`;
	if (profile.subscriptionStatus === 'pending') return 'Activación pendiente';
	if (profile.subscriptionStatus === 'paused') return 'Plan pausado';
	if (profile.subscriptionStatus === 'cancelled') return 'Plan cancelado';
	return 'Prueba gratuita';
}

function conciseText(value: string, maxLength = 105) {
	const clean = value.replace(/\s+/g, ' ').trim();
	const firstSentence = clean.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || clean;
	if (firstSentence.length <= maxLength) return firstSentence;
	const shortened = firstSentence.slice(0, maxLength + 1).replace(/\s+\S*$/, '').replace(/[,:;.!?]+$/, '');
	return `${shortened}.`;
}

function getSessionEmail(session: AppSession | null) {
	return session?.user?.email || '';
}

function getSessionId(session: AppSession | null) {
	return session?.user?.id || '';
}

function getSessionToken(session: AppSession | null) {
	return session && 'access_token' in session ? session.access_token : '';
}

function mapProduct(record: any): Product {
	return {
		id: record.id,
		name: record.name || 'Producto',
		description: record.description || '',
		priceText: record.price_text || record.priceText || '',
		currency: record.currency || '',
		productUrl: record.product_url || record.productUrl || '',
		imageUrl: record.imageUrl || '',
		imageUrls: Array.isArray(record.imageUrls) && record.imageUrls.length ? record.imageUrls : record.imageUrl ? [record.imageUrl] : [],
		imageCount: Number(record.imageCount || record.imageUrls?.length || (record.imageUrl ? 1 : 0)),
		source: record.source || 'manual',
	};
}

function normalizeProductUrlInput(value: string) {
	const clean = value.trim();
	if (!clean) return '';
	try {
		const url = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`);
		if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
		return url.toString();
	} catch { throw new Error('Ingresá una URL válida del producto.'); }
}

async function fileAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ''));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, radius);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
	const words = text.split(/\s+/);
	const lines: string[] = [];
	let line = '';
	words.forEach((word) => {
		const test = line ? `${line} ${word}` : word;
		if (ctx.measureText(test).width > maxWidth && line) {
			lines.push(line);
			line = word;
		} else line = test;
	});
	if (line) lines.push(line);
	return lines;
}

async function createDemoCreative(options: {
	creative: Creativo;
	profile: AppProfile;
	preset: string;
	format: string;
	brief: string;
	product: File | null;
}) {
	const dims = options.format === 'story' ? [1080, 1920] : options.format === 'portrait' ? [1080, 1350] : options.format === 'landscape' ? [1350, 1080] : [1080, 1080];
	const [width, height] = dims;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas no disponible');

	const impact = options.preset === 'impacto';
	const brandFirst = options.preset === 'marca';
	const bg = impact ? '#17131f' : brandFirst ? options.profile.secondaryColor : '#f3efe7';
	const ink = impact ? '#ffffff' : options.profile.primaryColor;
	ctx.fillStyle = bg;
	ctx.fillRect(0, 0, width, height);

	const glow = ctx.createRadialGradient(width * .82, height * .18, 10, width * .82, height * .18, width * .65);
	glow.addColorStop(0, impact ? 'rgba(139,92,246,.42)' : 'rgba(139,92,246,.18)');
	glow.addColorStop(1, 'rgba(139,92,246,0)');
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, width, height);

	const margin = Math.round(width * .075);
	ctx.fillStyle = impact ? '#a78bfa' : '#19171d';
	ctx.font = `700 ${Math.round(width * .022)}px Inter, Arial`;
	ctx.letterSpacing = '2px';
	ctx.fillText(`MODO DEMO  •  ${ringMeta[options.creative.ring]?.label.toUpperCase()}`, margin, margin + 10);
	ctx.letterSpacing = '0px';

	ctx.fillStyle = ink;
	ctx.font = `800 ${Math.round(width * (impact ? .084 : .073))}px Inter, Arial`;
	const headline = options.brief.trim() || options.creative.nombre;
	const headlineLines = wrapText(ctx, headline.toUpperCase(), width * .7).slice(0, 3);
	const headlineY = margin + Math.round(height * .115);
	const lineHeight = Math.round(width * (impact ? .088 : .078));
	headlineLines.forEach((line, index) => ctx.fillText(line, margin, headlineY + index * lineHeight));

	ctx.font = `500 ${Math.round(width * .027)}px Inter, Arial`;
	ctx.fillStyle = impact ? 'rgba(255,255,255,.66)' : 'rgba(24,24,27,.6)';
	const subtitle = options.creative.cuando.split('.')[0] + '.';
	wrapText(ctx, subtitle, width * .57).slice(0, 2).forEach((line, index) => {
		ctx.fillText(line, margin, headlineY + headlineLines.length * lineHeight + 30 + index * Math.round(width * .036));
	});

	const cardW = width * .54;
	const cardH = height * .44;
	const cardX = width - cardW - margin;
	const cardY = height - cardH - margin * .95;
	ctx.save();
	roundedRect(ctx, cardX, cardY, cardW, cardH, 36);
	ctx.fillStyle = impact ? '#f6f3ff' : '#ffffff';
	ctx.shadowColor = 'rgba(20,15,30,.18)';
	ctx.shadowBlur = 38;
	ctx.shadowOffsetY = 18;
	ctx.fill();
	ctx.restore();

	if (options.product) {
		const src = await fileAsDataUrl(options.product);
		const image = new Image();
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error('No se pudo leer el producto'));
			image.src = src;
		});
		const scale = Math.min((cardW * .78) / image.width, (cardH * .76) / image.height);
		const dw = image.width * scale;
		const dh = image.height * scale;
		ctx.drawImage(image, cardX + (cardW - dw) / 2, cardY + (cardH - dh) / 2, dw, dh);
	} else {
		ctx.fillStyle = impact ? '#ddd6fe' : '#ede9fe';
		roundedRect(ctx, cardX + cardW * .18, cardY + cardH * .14, cardW * .64, cardH * .62, 28);
		ctx.fill();
		ctx.fillStyle = '#19171d';
		ctx.font = `700 ${Math.round(width * .032)}px Inter, Arial`;
		ctx.textAlign = 'center';
		ctx.fillText('TU PRODUCTO', cardX + cardW / 2, cardY + cardH * .49);
		ctx.font = `500 ${Math.round(width * .018)}px Inter, Arial`;
		ctx.fillText('o una oferta general', cardX + cardW / 2, cardY + cardH * .58);
		ctx.textAlign = 'left';
	}

	ctx.fillStyle = impact ? '#ffffff' : options.profile.primaryColor;
	ctx.font = `800 ${Math.round(width * .032)}px Inter, Arial`;
	ctx.fillText(options.profile.brandName || 'TU MARCA', margin, height - margin * 1.1);
	ctx.font = `500 ${Math.round(width * .018)}px Inter, Arial`;
	ctx.fillStyle = impact ? 'rgba(255,255,255,.55)' : 'rgba(24,24,27,.5)';
	ctx.fillText('Vista previa local · conectá la IA para producir el anuncio final', margin, height - margin * .62);

	return canvas.toDataURL('image/jpeg', .9);
}

export default function CreativeApp() {
	const [booting, setBooting] = useState(true);
	const [accountLoading, setAccountLoading] = useState(true);
	const [accountError, setAccountError] = useState('');
	const [session, setSession] = useState<AppSession | null>(null);
	const [profile, setProfile] = useState<AppProfile>(defaultProfile);
	const [view, setView] = useState<View>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('plan') ? 'plans' : 'home');
	const [viewHistory, setViewHistory] = useState<View[]>([]);
	const [openedFromView, setOpenedFromView] = useState<View | null>(null);

	const [likedImageIds, setLikedImageIds] = useState<string[]>(() => {
		try {
			return JSON.parse(localStorage.getItem('creattia_liked_images') || '[]');
		} catch {
			return [];
		}
	});

	const [folders, setFolders] = useState<Array<{ id: string; name: string; imageIds: string[] }>>(() => {
		try {
			return JSON.parse(localStorage.getItem('creattia_folders') || '[]');
		} catch {
			return [];
		}
	});

	useEffect(() => {
		localStorage.setItem('creattia_liked_images', JSON.stringify(likedImageIds));
	}, [likedImageIds]);

	useEffect(() => {
		localStorage.setItem('creattia_folders', JSON.stringify(folders));
	}, [folders]);

	function toggleLike(id: string) {
		setLikedImageIds((prev) => 
			prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
		);
	}

	function toggleFolder(imgId: string, folderId: string) {
		setFolders((prev) => 
			prev.map((f) => {
				if (f.id === folderId) {
					const exists = f.imageIds.includes(imgId);
					return {
						...f,
						imageIds: exists ? f.imageIds.filter(id => id !== imgId) : [...f.imageIds, imgId]
					};
				}
				return f;
			})
		);
	}

	function navigateTo(nextView: View) {
		setViewHistory((prev) => [...prev, view]);
		setView(nextView);
	}

	function goBack() {
		setViewHistory((prev) => {
			if (prev.length === 0) {
				setView('home');
				return [];
			}
			const last = prev[prev.length - 1];
			setView(last);
			return prev.slice(0, -1);
		});
	}

	const [mobileMenu, setMobileMenu] = useState(false);
	const [catalog, setCatalog] = useState<Creativo[]>(creativeCatalog);
	const [selected, setSelected] = useState<Creativo>(creativeCatalog.find((c) => c.id === 18) || creativeCatalog[0]);
	const [reuseSeed, setReuseSeed] = useState<Generation | null>(null);
	const [history, setHistory] = useState<Generation[]>([]);
	const [activeBatch, setActiveBatch] = useState<ActiveBatch | null>(null);
	const [lightbox, setLightbox] = useState<Generation | null>(null);
	const [favorites, setFavorites] = useState<Set<number>>(new Set());
	const [products, setProducts] = useState<Product[]>([]);
	const [creationProductIds, setCreationProductIds] = useState<string[]>([]);
	const [toast, setToast] = useState('');
	const [preselectedTemplateId, setPreselectedTemplateId] = useState<number | null>(null);
	const [sidebarMinimized, setSidebarMinimized] = useState(false);
	const [manualOpen, setManualOpen] = useState(false);
	const [profileMenuOpen, setProfileMenuOpen] = useState(false);
	const [randomWinners, setRandomWinners] = useState<any[]>([]);
	const [scrapedWinners, setScrapedWinners] = useState<any[]>([]);
	const [likedScrapedPaths, setLikedScrapedPaths] = useState<Set<string>>(new Set());
	const [preselectedWinnerPath, setPreselectedWinnerPath] = useState<string | null>(null);

	// Load 5 random winners from manifest and initialize liked scraped ads
	useEffect(() => {
		const loadedLikes = loadLocal<string[]>('creattia-liked-scraped-v1', []);
		setLikedScrapedPaths(new Set(loadedLikes));

		async function loadRandomWinners() {
			try {
				const res = await fetch('/scraped_ads/manifest.json');
				if (!res.ok) return;
				const data = await res.json();
				const items: any[] = data.items || [];
				setScrapedWinners(items);
				// Pick 5 random static image items with valid imagePath
				const staticItems = items.filter((i: any) => i.imagePath && (i.metadata?.mediaType === 'static_image' || !i.metadata?.mediaType));
				// Deduplicate first to make sure randomWinners doesn't get duplicate images
				const seen = new Set();
				const uniqueStatic = staticItems.filter((i: any) => {
					if (!i.imagePath || seen.has(i.imagePath)) return false;
					seen.add(i.imagePath);
					return true;
				});
				const shuffled = [...uniqueStatic].sort(() => Math.random() - 0.5);
				setRandomWinners(shuffled.slice(0, 4));
			} catch {
				// silent fail — winners are optional on dashboard
			}
		}
		void loadRandomWinners();
	}, []);

	const sessionUserIdRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		sessionUserIdRef.current = session?.user?.id;
	}, [session]);

	useEffect(() => {
		let active = true;
		async function boot() {
			try {
				if (isSupabaseConfigured && supabase) {
					const { data } = await supabase.auth.getSession();
					if (active) {
						sessionUserIdRef.current = data.session?.user?.id;
						setSession(data.session);
					}
				} else {
					const localSession = loadLocal<DemoSession | null>(SESSION_KEY, null);
					if (active) {
						sessionUserIdRef.current = localSession?.user?.id;
						setSession(localSession);
					}
				}
			} catch (err) {
				console.error('Error during boot:', err);
			} finally {
				if (active) setBooting(false);
			}
		}
		boot();
		if (!supabase) return () => { active = false; };
		const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
			const nextUserId = nextSession?.user?.id;
			if (sessionUserIdRef.current !== nextUserId) {
				setAccountLoading(Boolean(nextSession));
				setSession(nextSession);
			}
		});
		return () => { active = false; listener.subscription.unsubscribe(); };
	}, []);

	useEffect(() => {
		if (!session) {
			setAccountLoading(false);
			setAccountError('');
			return;
		}
		const activeSession = session;
		let active = true;
		async function loadAccount() {
			setAccountLoading(true);
			setAccountError('');
			setProfile(defaultProfile);
			setHistory([]);
			setFavorites(new Set());
			setProducts([]);
			try {
				if (isSupabaseConfigured && supabase) {
					const client = supabase;
					let loadedCatalog = creativeCatalog;
					const profileId = getSessionId(activeSession);
					// Catálogo y perfil en paralelo: son lo único que bloquea la UI.
					const [templatesResult, profileResult] = await Promise.all([
						client.from('creative_templates').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
						client.from('creative_profiles').select('*').eq('user_id', profileId).maybeSingle(),
					]);
					const { data: templateRecords, error: templateError } = templatesResult;
					if (templateError) throw templateError;
				if (templateRecords?.length) {
					loadedCatalog = templateRecords.map(mapTemplateRecord);
					setCatalog(loadedCatalog);
				}
				let { data, error: profileError } = profileResult;
				if (profileError) throw profileError;
				if (!data) {
					const created = await supabase.from('creative_profiles').upsert({
						user_id: profileId,
						full_name: ('user_metadata' in activeSession.user ? String(activeSession.user.user_metadata?.full_name || '') : ''),
					}, { onConflict: 'user_id' }).select('*').single();
					if (created.error) throw created.error;
					data = created.data;
				}
				if (data) {
					setProfile({
						fullName: data.full_name || '',
						brandName: data.brand_name || '',
						website: data.website_url || '',
						instagram: data.instagram_handle || '',
						primaryColor: data.brand_colors?.[0] || '#18181b',
						secondaryColor: data.brand_colors?.[1] || '#f4f0ff',
						credits: data.credits_remaining ?? 3,
						monthlyCredits: data.credits_monthly ?? 0,
						subscriptionStatus: data.subscription_status || 'trial',
						planCode: data.plan_code || 'trial',
						subscriptionPeriodEnd: data.subscription_period_end || '',
						onboardingCompleted: Boolean(data.onboarding_completed),
						brandSummary: data.brand_summary || '',
						catalogStatus: data.catalog_status || 'not_scanned',
						catalogLastSyncedAt: data.catalog_last_synced_at || '',
						catalogError: data.catalog_error || '',
					});
				}

				// La UI ya puede mostrarse: historial, favoritos y productos siguen
				// cargando de fondo y aparecen apenas llegan.
				if (active) setAccountLoading(false);

				const { data: favoriteRecords, error: favoritesError } = await supabase.from('creative_template_favorites').select('template_id');
				if (favoritesError) throw favoritesError;
				if (favoriteRecords) setFavorites(new Set(favoriteRecords.map((item) => Number(item.template_id))));

					const { data: records, error: generationsError } = await supabase.from('creative_generations')
						.select('id,title,output_path,format,created_at,template_id,user_brief,variant_key,image_type,product_id,batch_id,output_index,settings_snapshot')
					.eq('status', 'completed').order('created_at', { ascending: false }).limit(24);
				if (generationsError) throw generationsError;
				if (records?.length) {
					const signed = await Promise.all(records.map(async (record) => {
						const { data: url } = await client.storage.from('creative-assets').createSignedUrl(record.output_path, 3600);
						const creative = loadedCatalog.find((item) => item.id === record.template_id);
						return {
							id: record.id,
							title: record.title,
							imageUrl: url?.signedUrl || '',
							format: record.format,
							createdAt: record.created_at,
							category: creative ? ringMeta[creative.ring]?.label : 'Creativo',
							templateId: record.template_id,
							brief: record.user_brief || '',
							preset: record.variant_key || record.settings_snapshot?.preset || 'fiel',
								imageType: record.image_type || record.settings_snapshot?.imageType || 'product',
								productId: record.product_id || record.settings_snapshot?.productId || '',
								productIds: record.settings_snapshot?.productIds || (record.product_id ? [record.product_id] : []),
								batchId: record.batch_id || record.id,
								outputIndex: record.output_index || 1,
								referenceUrl: record.settings_snapshot?.referencePath
									? `https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/${record.settings_snapshot.referencePath}`
									: '',
						};
					}));
					setHistory(signed.filter((item) => item.imageUrl));
				}
				const token = getSessionToken(activeSession);
				if (token) {
					const response = await fetch('/api/creativos/products', { headers: { authorization: `Bearer ${token}` } });
					const payload = await response.json();
					if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el catálogo.');
					setProducts((payload.products || []).map(mapProduct));
				}
				} else {
					setProfile({ ...defaultProfile, ...loadLocal(PROFILE_KEY, defaultProfile) });
					setHistory(loadLocal(HISTORY_KEY, []));
					setFavorites(new Set(loadLocal<number[]>(FAVORITES_KEY, [])));
					setProducts(loadLocal(PRODUCTS_KEY, demoProducts));
				}
			} catch (cause) {
				if (active) setAccountError(cause instanceof Error ? cause.message : 'No se pudo preparar tu cuenta.');
			} finally {
				if (active) setAccountLoading(false);
			}
		}
		void loadAccount();
		return () => { active = false; };
	}, [session]);

	useEffect(() => {
		if (!toast) return;
		const timeout = window.setTimeout(() => setToast(''), 3800);
		return () => window.clearTimeout(timeout);
	}, [toast]);

	function chooseCreative(creative: Creativo) {
		setReuseSeed(null);
		setPreselectedTemplateId(creative.id);
		navigateTo('winners');
		setMobileMenu(false);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function startWithProduct(productId: string) {
		setCreationProductIds([productId]);
		navigateTo('library');
		setMobileMenu(false);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function reuseGeneration(generation: Generation) {
		const creative = catalog.find((item) => item.id === generation.templateId)
			|| catalog.find((item) => item.nombre === generation.title)
			|| catalog[0];
		if (!creative) return;
		setSelected(creative);
		setReuseSeed(generation);
		navigateTo('studio');
		setMobileMenu(false);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	async function toggleFavorite(templateId: number) {
		const wasFavorite = favorites.has(templateId);
		const next = new Set(favorites);
		if (wasFavorite) next.delete(templateId); else next.add(templateId);
		setFavorites(next);
		try {
			if (isSupabaseConfigured && supabase && session) {
				const request = wasFavorite
					? supabase.from('creative_template_favorites').delete().eq('user_id', getSessionId(session)).eq('template_id', templateId)
					: supabase.from('creative_template_favorites').insert({ user_id: getSessionId(session), template_id: templateId });
				const { error } = await request;
				if (error) throw error;
			} else saveLocal(FAVORITES_KEY, [...next]);
			setToast(wasFavorite ? 'Quitado de guardados.' : 'Guardado en tu biblioteca.');
		} catch (cause) {
			setFavorites(favorites);
			setToast(cause instanceof Error ? cause.message : 'No se pudo actualizar el guardado.');
		}
	}

	const toggleLikedScraped = (path: string) => {
		const next = new Set(likedScrapedPaths);
		const wasLiked = next.has(path);
		if (wasLiked) {
			next.delete(path);
		} else {
			next.add(path);
		}
		setLikedScrapedPaths(next);
		saveLocal('creattia-liked-scraped-v1', Array.from(next));
		setToast(wasLiked ? 'Quitado de guardados.' : 'Guardado en tu biblioteca.');
	};

	const likedWinners = useMemo(() => {
		const seen = new Set();
		return scrapedWinners.filter(item => {
			if (!item.imagePath || !likedScrapedPaths.has(item.imagePath)) return false;
			if (seen.has(item.imagePath)) return false;
			seen.add(item.imagePath);
			return true;
		});
	}, [scrapedWinners, likedScrapedPaths]);

	async function logout() {
		if (supabase) await supabase.auth.signOut();
		else localStorage.removeItem(SESSION_KEY);
		setSession(null);
		setMobileMenu(false);
	}

	async function updateProfile(next: AppProfile, logo?: File | null) {
		let finalProfile = next;
		const shouldSync = Boolean(next.website || next.instagram) && (
			next.website !== profile.website || next.instagram !== profile.instagram || profile.catalogStatus === 'not_scanned'
		);
		if (logo && !isSupabaseConfigured) {
			finalProfile = { ...next, logoDataUrl: await fileAsDataUrl(logo) };
		}
		if (isSupabaseConfigured && supabase && session) {
			let logoPath: string | undefined;
			if (logo) {
				const extension = logo.name.split('.').pop() || 'png';
				logoPath = `${getSessionId(session)}/brand/logo.${extension}`;
				const { error } = await supabase.storage.from('creative-assets').upload(logoPath, logo, { upsert: true });
				if (error) throw error;
			}
			const { error } = await supabase.from('creative_profiles').upsert({
				user_id: getSessionId(session),
				full_name: finalProfile.fullName,
				brand_name: finalProfile.brandName,
				website_url: finalProfile.website,
				instagram_handle: finalProfile.instagram,
				brand_colors: [finalProfile.primaryColor, finalProfile.secondaryColor],
				onboarding_completed: true,
				...(logoPath ? { logo_path: logoPath } : {}),
				updated_at: new Date().toISOString(),
			}, { onConflict: 'user_id' });
			if (error) throw error;
			if (shouldSync) {
				const token = getSessionToken(session);
				const response = await fetch('/api/creativos/analyze-brand', {
					method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
					body: JSON.stringify({ website: finalProfile.website, instagram: finalProfile.instagram }),
				});
				const payload = await response.json();
				if (response.ok) {
					finalProfile = { ...finalProfile, brandSummary: payload.brandSummary || '', catalogStatus: payload.status || 'ready', catalogLastSyncedAt: new Date().toISOString(), catalogError: payload.warnings?.join(' · ') || '' };
					await refreshProducts();
				} else {
					finalProfile = { ...finalProfile, catalogStatus: 'failed', catalogError: payload.error || 'No se pudieron analizar las fuentes.' };
				}
			}
		} else saveLocal(PROFILE_KEY, finalProfile);
		setProfile(finalProfile);
	}

	async function refreshProducts() {
		if (!isSupabaseConfigured) {
			const local = loadLocal(PRODUCTS_KEY, demoProducts); setProducts(local); return local;
		}
		const token = getSessionToken(session);
		if (!token) return [];
		const response = await fetch('/api/creativos/products', { headers: { authorization: `Bearer ${token}` } });
		const payload = await response.json();
		if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el catálogo.');
		const mapped = (payload.products || []).map(mapProduct);
		setProducts(mapped); return mapped;
	}

	async function removeProduct(productId: string) {
		if (!isSupabaseConfigured) {
			const next = products.filter((product) => product.id !== productId);
			saveLocal(PRODUCTS_KEY, next);
			setProducts(next);
			setToast('Producto quitado del catálogo.');
			return;
		}
		const response = await fetch(`/api/creativos/products?id=${encodeURIComponent(productId)}`, {
			method: 'DELETE',
			headers: { authorization: `Bearer ${getSessionToken(session)}` },
		});
		const payload = await response.json();
		if (!response.ok) throw new Error(payload.error || 'No se pudo quitar el producto.');
		setProducts((current) => current.filter((product) => product.id !== productId));
		setToast('Producto quitado del catálogo.');
	}

	async function syncBrandSources() {
		if (!isSupabaseConfigured) {
			setProfile({ ...profile, catalogStatus: 'ready', catalogLastSyncedAt: new Date().toISOString() });
			setToast('Catálogo demo sincronizado.'); return;
		}
		const token = getSessionToken(session);
		const response = await fetch('/api/creativos/analyze-brand', {
			method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ website: profile.website, instagram: profile.instagram }),
		});
		const payload = await response.json();
		if (!response.ok) throw new Error(payload.error || 'No se pudo sincronizar el catálogo.');
		await refreshProducts();
		setProfile({ ...profile, brandSummary: payload.brandSummary || profile.brandSummary, catalogStatus: payload.status || 'ready', catalogLastSyncedAt: new Date().toISOString(), catalogError: payload.warnings?.join(' · ') || '' });
		setToast(`${payload.productsFound || 0} productos analizados y guardados.`);
	}

	function addGenerations(generations: Generation[], credits: number) {
		const nextHistory = [...generations, ...history].slice(0, 24);
		const nextProfile = { ...profile, credits };
		setHistory(nextHistory);
		setProfile(nextProfile);
		if (!isSupabaseConfigured) {
			saveLocal(HISTORY_KEY, nextHistory);
			saveLocal(PROFILE_KEY, nextProfile);
		}
	}

	// ── Generación en segundo plano ─────────────────────────────────────
	function startBatchTracking(batch: { batchId: string; title: string; referenceUrl?: string; count: number }) {
		const record: ActiveBatch = { ...batch, startedAt: Date.now(), status: 'processing', results: [] };
		setActiveBatch(record);
		setView('history');
		try {
			window.localStorage.setItem(ACTIVE_BATCH_KEY, JSON.stringify({
				batchId: batch.batchId, title: batch.title, referenceUrl: batch.referenceUrl || '', count: batch.count, startedAt: record.startedAt,
			}));
		} catch { /* almacenamiento lleno o bloqueado: solo perdemos la reanudación */ }
	}

	// Reanudar un lote pendiente al volver a la app (otro tab, recarga, etc.)
	useEffect(() => {
		if (!session || !isSupabaseConfigured || !supabase) return;
		const raw = window.localStorage.getItem(ACTIVE_BATCH_KEY);
		if (!raw) return;
		try {
			const saved = JSON.parse(raw);
			if (!saved?.batchId || Date.now() - (saved.startedAt || 0) > 20 * 60 * 1000) {
				window.localStorage.removeItem(ACTIVE_BATCH_KEY);
				return;
			}
			setActiveBatch({ ...saved, status: 'processing', results: [] });
		} catch {
			window.localStorage.removeItem(ACTIVE_BATCH_KEY);
		}
	}, [session]);

	// Polling del lote activo hasta que el servidor lo complete o falle.
	useEffect(() => {
		if (!activeBatch || activeBatch.status !== 'processing' || !isSupabaseConfigured || !supabase) return;
		const client = supabase;
		const batch = activeBatch;
		let cancelled = false;
		const poll = async () => {
			const { data, error } = await client.from('creative_generations')
				.select('id,status,output_path,error_code,title,format,template_id,batch_id,output_index,created_at,image_type,user_brief,variant_key,product_id,settings_snapshot')
				.eq('batch_id', batch.batchId).order('output_index');
			if (cancelled || error || !data?.length) return;
			if (data.some((row) => row.status === 'processing')) return;
			const failedRows = data.filter((row) => row.status === 'failed');
			const completedRows = data.filter((row) => row.status === 'completed' && row.output_path);
			const generations: Generation[] = [];
			for (const row of completedRows) {
				const { data: signed } = await client.storage.from('creative-assets').createSignedUrl(row.output_path, 3600);
				if (!signed?.signedUrl) continue;
				generations.push({
					id: row.id, title: row.title, imageUrl: signed.signedUrl, format: row.format, createdAt: row.created_at,
					category: 'Creativo', templateId: row.template_id, brief: row.user_brief || '', preset: row.variant_key || '',
					imageType: row.image_type || 'product', productId: row.product_id || '',
					productIds: row.settings_snapshot?.productIds || [], batchId: row.batch_id, outputIndex: row.output_index,
				});
			}
			if (cancelled) return;
			const { data: profileRow } = await client.from('creative_profiles').select('credits_remaining').maybeSingle();
			if (generations.length) setHistory((prev) => [...generations.filter((item) => !prev.some((existing) => existing.id === item.id)), ...prev].slice(0, 24));
			if (profileRow) setProfile((prev) => ({ ...prev, credits: profileRow.credits_remaining ?? prev.credits }));
			setActiveBatch({
				...batch,
				status: generations.length ? 'completed' : 'failed',
				results: generations,
				error: generations.length ? '' : (failedRows[0]?.error_code || 'No se pudo generar la imagen.'),
			});
			window.localStorage.removeItem(ACTIVE_BATCH_KEY);
			setToast(generations.length ? '¡Tu anuncio está listo!' : 'La generación falló y tus créditos fueron devueltos.');
		};
		void poll();
		const interval = window.setInterval(() => { void poll(); }, 5000);
		return () => { cancelled = true; window.clearInterval(interval); };
	}, [activeBatch?.batchId, activeBatch?.status]);

	if (booting || (session && accountLoading)) return <div className="studio-boot"><span className="studio-spinner"/><p>Preparando tu estudio…</p></div>;
	if (!session) return <AuthScreen onSession={(nextSession) => { setAccountLoading(true); setSession(nextSession); }} />;
	if (accountError) return <AccountSetupError message={accountError} onRetry={() => window.location.reload()} onLogout={logout} />;
		const navItems: Array<{ id: View; label: string; icon: string }> = [
			{ id: 'home', label: 'Inicio', icon: 'home' },
			{ id: 'winners', label: 'Biblioteca de ganadores', icon: 'spark' },
			{ id: 'saved', label: 'Anuncios guardados', icon: 'heart' },
			{ id: 'history', label: 'Mis imágenes', icon: 'history' },
		];

	return (
		<div className={`creative-app-shell ${sidebarMinimized ? 'sidebar-minimized' : ''}`}>
			{toast && <div className="studio-toast"><span><Icon name="check" size={16}/></span>{toast}</div>}
			{lightbox && <ImageLightbox item={lightbox} session={session} onClose={() => setLightbox(null)} onStarted={startBatchTracking} products={products} />}
			{activeBatch && view !== 'generation' && activeBatch.status !== 'failed' && (
				<button
					onClick={() => navigateTo('generation')}
					style={{
						position: 'fixed', bottom: '18px', right: '18px', zIndex: 80,
						display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 18px',
						borderRadius: '999px', border: 0, cursor: 'pointer',
						background: activeBatch.status === 'completed' ? '#128a51' : '#19171d', color: '#fff',
						fontSize: '13px', fontWeight: 700, boxShadow: '0 10px 28px rgba(0,0,0,0.3)',
					}}
				>
					{activeBatch.status === 'processing'
						? <><span className="studio-spinner" style={{ width: '14px', height: '14px' }} /> Generando tu anuncio… <u>Ver progreso</u></>
						: <>✓ Tu anuncio está listo — <u>Verlo</u></>}
				</button>
			)}
			<div className={`studio-mobile-scrim ${mobileMenu ? 'is-open' : ''}`} onClick={() => setMobileMenu(false)} />
			<aside className={`studio-sidebar ${mobileMenu ? 'is-open' : ''}`}>
				<div style={{ display: 'flex', flexDirection: sidebarMinimized ? 'column' : 'row', alignItems: 'center', justifyContent: sidebarMinimized ? 'center' : 'space-between', gap: sidebarMinimized ? '6px' : 0, paddingRight: sidebarMinimized ? 0 : '10px', marginBottom: '10px' }}>
					<a className="studio-logo" href="/" aria-label="Volver a Creattia" style={{ marginBottom: 0 }}>
						<span><img src="/images/creattia/moki-mascot.webp" alt=""/></span>
						{!sidebarMinimized && <div><strong>Creattia</strong></div>}
					</a>
					<button 
						onClick={() => setSidebarMinimized(!sidebarMinimized)}
						style={{
							border: 0,
							background: 'transparent',
							cursor: 'pointer',
							color: '#716d79',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							padding: '6px'
						}}
						title={sidebarMinimized ? "Expandir menú" : "Colapsar menú"}
					>
						<span style={{ display: 'inline-flex', transform: sidebarMinimized ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}><Icon name="arrow" size={16} /></span>
					</button>
				</div>
				<button className="studio-close-menu" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú"><Icon name="close"/></button>
				<nav className="studio-nav">
					{!sidebarMinimized && <p>ESPACIO DE TRABAJO</p>}
					{navItems.map((item) => (
						<button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { navigateTo(item.id); setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
							<Icon name={item.icon}/>{!sidebarMinimized && <span>{item.label}</span>}
						</button>
					))}
				</nav>
				<div className="studio-sidebar-bottom">
					<button 
						className={`studio-brand-nav-btn ${view === 'brand' ? 'active' : ''}`}
						onClick={() => { navigateTo('brand'); setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '12px',
							width: '100%',
							padding: '10px 14px',
							background: view === 'brand' ? '#ece9f1' : 'transparent',
							border: 0,
							borderRadius: '10px',
							cursor: 'pointer',
							color: view === 'brand' ? '#744bde' : '#5b5561',
							fontWeight: 700,
							fontSize: '14px',
							marginBottom: '10px',
							textAlign: 'left'
						}}
					>
						<Icon name="brand"/>
						{!sidebarMinimized && <span>Mi marca</span>}
					</button>
					{!sidebarMinimized && (
						<div className="studio-plan-card">
							<div><span className="studio-plan-orb"><Icon name="spark" size={15}/></span><small>PLAN ACTUAL</small></div>
							<strong>{planLabel(profile)}</strong>
							<p><span style={{ width: `${Math.min(100, profile.credits / (profile.monthlyCredits || 3) * 100)}%` }}/></p>
							<footer><span>{profile.credits} {profile.credits === 1 ? 'generación' : 'generaciones'}</span><button onClick={() => navigateTo('plans')}>Ver planes</button></footer>
						</div>
					)}
					
					{profileMenuOpen && (
						<div 
							style={{
								position: 'fixed',
								bottom: '70px',
								left: sidebarMinimized ? '72px' : '190px',
								background: '#fff',
								border: '1px solid #e9e6ed',
								borderRadius: '12px',
								boxShadow: '0 10px 30px rgba(52, 40, 79, 0.15)',
								padding: '8px',
								zIndex: 200,
								display: 'flex',
								flexDirection: 'column',
								gap: '4px',
								minWidth: '200px',
							}}
						>
							<button 
								onClick={() => { navigateTo('plans'); setProfileMenuOpen(false); }}
								style={{ padding: '10px 14px', border: 0, background: 'transparent', borderRadius: '8px', textAlign: 'left', cursor: 'pointer', fontSize: '13px', color: '#19171d', fontWeight: 700, whiteSpace: 'nowrap' }}
							>
								💳 Planes y Suscripción
							</button>
							<button 
								onClick={() => { alert('Historial de pagos: No tenés facturas pendientes en tu demo.'); setProfileMenuOpen(false); }}
								style={{ padding: '10px 14px', border: 0, background: 'transparent', borderRadius: '8px', textAlign: 'left', cursor: 'pointer', fontSize: '13px', color: '#19171d', fontWeight: 700, whiteSpace: 'nowrap' }}
							>
								📄 Historial de Pagos
							</button>
							<div style={{ height: '1px', background: '#f3eff6', margin: '4px 0' }} />
							<button 
								onClick={() => { logout(); setProfileMenuOpen(false); }}
								style={{ padding: '10px 14px', border: 0, background: 'transparent', borderRadius: '8px', textAlign: 'left', cursor: 'pointer', fontSize: '13px', color: '#dc2626', fontWeight: 700, whiteSpace: 'nowrap' }}
							>
								🚪 Cerrar sesión
							</button>
						</div>
					)}

					<div 
						className="studio-user" 
						onClick={() => setProfileMenuOpen(!profileMenuOpen)} 
						style={{ cursor: 'pointer', position: 'relative' }}
					>
						<span>{firstName(profile, getSessionEmail(session)).slice(0, 1).toUpperCase()}</span>
						{!sidebarMinimized && (
							<>
								<div style={{ flex: 1, minWidth: 0, paddingRight: '10px' }}>
									<strong style={{ display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{profile.fullName || 'Mi cuenta'}</strong>
									<small style={{ display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{getSessionEmail(session)}</small>
								</div>
								<span style={{ display: 'inline-flex', transform: 'rotate(90deg)', color: '#716d79' }}><Icon name="arrow" size={12} /></span>
							</>
						)}
					</div>
				</div>
			</aside>

			<main className="studio-main">
				<header className="studio-topbar">
					<button className="studio-menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menú"><Icon name="menu"/></button>
					<div className="studio-top-brand"><img src="/images/creattia/moki-mascot.webp" alt=""/><strong>Creattia</strong></div>
					{!isSupabaseConfigured && <div className="studio-mode-badge"><span />Demo local</div>}
					<button className="studio-credit-pill" onClick={() => setView('plans')}><Icon name="spark" size={16}/><b>{profile.credits}</b><span>{profile.credits === 1 ? 'crédito' : 'créditos'}</span></button>
				</header>

				<div className="studio-content">
					{view === 'home' && (
						<Dashboard 
							profile={profile} 
							email={getSessionEmail(session)} 
							history={history} 
							catalog={catalog} 
							onView={navigateTo} 
							onChoose={chooseCreative} 
							onReuse={reuseGeneration} 
							randomWinners={randomWinners} 
							likedWinners={likedWinners}
							likedScrapedPaths={likedScrapedPaths}
							onToggleLikedScraped={toggleLikedScraped}
							onExpand={setLightbox}
							onUseScrapedWinner={(path) => {
								setPreselectedWinnerPath(path);
								setOpenedFromView('home');
								navigateTo('winners');
							}}
						/>
					)}
					{view === 'library' && <Library items={catalog} favorites={favorites} onChoose={chooseCreative} onToggleFavorite={toggleFavorite} />}
					{view === 'winners' && (
						<WinnersLibrary 
							session={session} 
							profile={profile} 
							onGenerated={addGenerations}
							onGenerationStarted={startBatchTracking}
							isSupabaseConfigured={isSupabaseConfigured}
							onToast={setToast} 
							preselectedTemplateId={preselectedTemplateId}
							onClearPreselected={() => setPreselectedTemplateId(null)}
							preselectedWinnerPath={preselectedWinnerPath}
							onClearPreselectedWinner={() => setPreselectedWinnerPath(null)}
							likedScrapedPaths={likedScrapedPaths}
							onToggleLikedScraped={toggleLikedScraped}
							onUpdateProfile={updateProfile}
							historyCount={history.length}
							favorites={favorites}
							onToggleFavorite={toggleFavorite}
							onBackToPreviousView={() => {
								if (openedFromView) {
									setView(openedFromView);
									setOpenedFromView(null);
								}
							}}
						/>
					)}
					{view === 'saved' && (
						<SavedAds 
							history={history}
							likedImageIds={likedImageIds}
							toggleLike={toggleLike}
							folders={folders}
							toggleFolder={toggleFolder}
							scrapedWinners={scrapedWinners}
							likedScrapedPaths={likedScrapedPaths}
							toggleLikedScraped={toggleLikedScraped}
							onUseScrapedWinner={(path) => {
								setPreselectedWinnerPath(path);
								setOpenedFromView('saved');
								navigateTo('winners');
							}}
							onExpand={setLightbox}
							onReuse={reuseGeneration}
						/>
					)}
					{view === 'studio' && <Studio creative={selected} reuseSeed={reuseSeed} initialProductIds={creationProductIds} onSeedConsumed={() => setCreationProductIds([])} profile={profile} session={session} products={products} onProductsChanged={refreshProducts} onChooseLibrary={goBack} onGenerated={addGenerations} onToast={setToast} onGenerationStarted={startBatchTracking} />}
					{view === 'generation' && activeBatch && (
						<GenerationView
							batch={activeBatch}
							onBack={() => { goBack(); if (activeBatch.status !== 'processing') setActiveBatch(null); }}
							onReuse={(generation) => setLightbox(generation)}
							onHistory={() => { setActiveBatch(null); navigateTo('history'); }}
						/>
					)}
					{view === 'history' && (
						<History 
							history={history} 
							onCreate={() => navigateTo('winners')} 
							onReuse={reuseGeneration} 
							onExpand={setLightbox} 
							pending={activeBatch?.status === 'processing' ? { count: activeBatch.count, title: activeBatch.title, referenceUrl: activeBatch.referenceUrl } : null} 
							onViewProgress={() => navigateTo('generation')}
							likedImageIds={likedImageIds}
							onToggleLike={toggleLike}
							folders={folders}
							onToggleFolder={toggleFolder}
							onRemoveFolder={(fid) => {
								if (window.confirm('¿Seguro que querés eliminar esta carpeta? Las imágenes seguirán en "Mis imágenes".')) {
									setFolders((prev) => prev.filter(f => f.id !== fid));
								}
							}}
							onCreateFolder={(name) => {
								setFolders((prev) => [...prev, { id: crypto.randomUUID(), name, imageIds: [] }]);
							}}
						/>
					)}
					{view === 'plans' && <Plans profile={profile} session={session} />}
					{view === 'brand' && (
						<BrandsManager session={session} planCode={profile.planCode} onPlans={() => navigateTo('plans')} />
					)}
				</div>
			</main>
		</div>
	);
}

function authRedirectUrl() {
	const productionSite = import.meta.env.PROD ? String(import.meta.env.PUBLIC_SITE_URL || '').trim() : '';
	return new URL('/app/', productionSite || window.location.origin).toString();
}

function AuthScreen({ onSession }: { onSession: (session: AppSession) => void }) {
	const [mode, setMode] = useState<'signup' | 'login'>('signup');
	const [authStep, setAuthStep] = useState<'email' | 'credentials'>('email');
	const [fullName, setFullName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (authStep === 'email') {
			setError(''); setNotice('');
			setAuthStep('credentials');
			return;
		}
		setError(''); setNotice(''); setLoading(true);
		try {
			if (isSupabaseConfigured && supabase) {
				if (mode === 'signup') {
					const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: authRedirectUrl() } });
					if (authError) throw authError;
					if (data.session) onSession(data.session);
					else setNotice('Revisá tu email para confirmar la cuenta y después ingresá.');
				} else {
					const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
					if (authError) throw authError;
					onSession(data.session);
				}
			} else {
				const demoSession: DemoSession = { user: { id: 'demo-user', email: email || 'demo@creattia.app' } };
				saveLocal(SESSION_KEY, demoSession);
				if (mode === 'signup') {
					const current = loadLocal(PROFILE_KEY, defaultProfile);
					saveLocal(PROFILE_KEY, { ...current, fullName });
				}
				onSession(demoSession);
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo ingresar.');
		} finally { setLoading(false); }
	}

	function enterDemo() {
		const demoSession: DemoSession = { user: { id: 'demo-user', email: 'demo@creattia.app' } };
		saveLocal(SESSION_KEY, demoSession);
		onSession(demoSession);
	}

	function changeMode(nextMode: 'signup' | 'login') {
		setMode(nextMode);
		setAuthStep('email');
		setPassword('');
		setError('');
		setNotice('');
	}

	async function signInWithGoogle() {
		setError(''); setNotice('');
		if (!isSupabaseConfigured || !supabase) {
			setError('El acceso con Google todavía no está disponible en esta demo.');
			return;
		}
		setLoading(true);
		try {
			const { error: authError } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: { redirectTo: authRedirectUrl() },
			});
			if (authError) throw authError;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo continuar con Google.');
			setLoading(false);
		}
	}

	return (
		<div className="studio-auth">
			<a href="/" className="studio-auth-logo"><span><img src="/images/creattia/moki-mascot.webp" alt=""/></span><strong>Creattia</strong></a>
			<section className="studio-auth-panel">
				<div className="studio-auth-card">
					<div className="studio-auth-heading">
						{!isSupabaseConfigured && <span className="studio-demo-label"><i/> Modo demo local</span>}
						<h2>{authStep === 'email' ? (mode === 'signup' ? 'Creá imágenes que venden en minutos' : 'Volvé a tu espacio creativo') : (mode === 'signup' ? 'Creá tu cuenta gratis' : 'Ingresá tu contraseña')}</h2>
						<p>{authStep === 'email' ? (mode === 'signup' ? 'Tus primeras 3 imágenes son gratis. Sin tarjeta.' : 'Ingresá para seguir creando con tu marca.') : <><strong>{email}</strong> · <button type="button" onClick={() => setAuthStep('email')}>Cambiar email</button></>}</p>
					</div>
					{authStep === 'email' && <><button className="studio-google-button" type="button" onClick={signInWithGoogle} disabled={loading}><img src="/images/creattia/google-g.svg" alt=""/>Continuar con Google</button><div className="studio-auth-divider"><span>o</span></div></>}
					<form onSubmit={submit}>
						{authStep === 'email' ? <label>Correo electrónico<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@tumarca.com" autoComplete="email" autoFocus required /></label> : <>{mode === 'signup' && <label>Tu nombre<input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="¿Cómo te llamás?" autoComplete="name" autoFocus required /></label>}<label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} autoFocus={mode === 'login'} required /></label></>}
						{error && <p className="studio-form-error">{error}</p>}
						{notice && <p className="studio-form-notice">{notice}</p>}
						<button className="studio-primary-button" disabled={loading || (authStep === 'email' && !email.trim())}>{loading ? <span className="studio-spinner small"/> : <>{authStep === 'email' ? 'Continuar' : mode === 'signup' ? 'Crear cuenta gratis' : 'Ingresar'}<Icon name="arrow" size={18}/></>}</button>
					</form>
					{!isSupabaseConfigured && <button className="studio-demo-entry" onClick={enterDemo}>Entrar directo con la cuenta demo</button>}
					<small className="studio-terms">Al continuar aceptás los <a href="/legal/terminos/">términos</a> y la <a href="/legal/privacidad/">política de privacidad</a>.</small>
				</div>
				<p className="studio-auth-switch">{mode === 'signup' ? '¿Ya tenés una cuenta?' : '¿Todavía no tenés cuenta?'} <button onClick={() => changeMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'Ingresar' : 'Crear cuenta gratis'}</button></p>
			</section>
			<div className="studio-auth-moki" aria-hidden="true"><span>Te guío paso a paso.</span><img src="/images/creattia/moki-mascot.webp" alt=""/></div>
		</div>
	);
}

function AccountSetupError({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
	const missingSchema = /creative_|schema cache|does not exist|relation/i.test(message);
	return <div className="studio-account-error">
		<a href="/" className="studio-auth-logo"><span><img src="/images/creattia/moki-mascot.webp" alt=""/></span><strong>Creattia</strong></a>
		<section>
			<Moki className="studio-account-error-moki" label="Moki esperando que el espacio esté listo"/>
			<span><Icon name="spark" size={18}/></span>
			<h1>{missingSchema ? 'Estamos preparando tu espacio.' : 'No pudimos cargar tu cuenta.'}</h1>
			<p>{missingSchema ? 'Tu acceso ya funciona. Falta terminar la configuración segura de tu espacio antes de guardar productos e imágenes.' : 'Reintentá en unos segundos. Si el problema continúa, volvé a ingresar.'}</p>
			<div><button onClick={onRetry}>Reintentar</button><button onClick={onLogout}>Cerrar sesión</button></div>
		</section>
	</div>;
}

function Dashboard({
	profile,
	email,
	history,
	catalog,
	onView,
	onChoose,
	onReuse,
	randomWinners = [],
	likedWinners = [],
	likedScrapedPaths,
	onToggleLikedScraped,
	onUseScrapedWinner,
	onExpand
}: {
	profile: AppProfile;
	email: string;
	history: Generation[];
	catalog: Creativo[];
	onView: (view: View) => void;
	onChoose: (creative: Creativo) => void;
	onReuse: (generation: Generation) => void;
	randomWinners?: any[];
	likedWinners?: any[];
	likedScrapedPaths: Set<string>;
	onToggleLikedScraped: (path: string) => void;
	onUseScrapedWinner: (path: string) => void;
	onExpand?: (generation: Generation) => void;
}) {
	return (
		<>
			<div className="studio-page-heading">
				<div>
					<p>INICIO</p>
					<h1>Buen día, {firstName(profile, email)}.</h1>
					<span>¿Qué querés crear hoy?</span>
				</div>
				<button className="studio-primary-button compact" onClick={() => onView('winners')}>
					<Icon name="plus" size={17} />
					Crear imagen
				</button>
			</div>

			{/* ── User's generated history ── */}
			{history.length > 0 && (
				<>
					<div className="studio-section-title">
						<div>
							<h2>Últimas imágenes</h2>
							<p>Descargalas o creá otra versión.</p>
						</div>
						<button onClick={() => onView('history')}>
							Ver todas <Icon name="arrow" size={15} />
						</button>
					</div>
					<div className="studio-recent-row" style={{ marginBottom: '40px' }}>
						{history.slice(0, 4).map((item) => (
							<GenerationCard key={item.id} item={item} onExpand={onExpand ? () => onExpand(item) : undefined} onReuse={() => onReuse(item)} />
						))}
					</div>
				</>
			)}

			{/* ── Random winners inspiration ── */}
			{randomWinners.length > 0 && (
				<>
					<div className="studio-section-title">
						<div>
							<h2>Inspiración del día</h2>
							<p>Anuncios ganadores en tamaño real para inspirar tus diseños.</p>
						</div>
						<button onClick={() => onView('winners')}>
							Ver biblioteca <Icon name="arrow" size={15} />
						</button>
					</div>
					<div className="library-ad-grid-masonry dashboard-masonry" style={{ columnGap: '16px', marginBottom: '40px' }}>
						{randomWinners.slice(0, 4).map((winner, idx) => {
							const supabaseUrl = 'https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/';
							const imageUrl = winner.imagePath?.startsWith('http') ? winner.imagePath : supabaseUrl + winner.imagePath;
							const isLiked = likedScrapedPaths.has(winner.imagePath);

							return (
								<article
									className="library-ad-card-masonry"
									key={winner.imagePath || idx}
									style={{
										display: 'flex',
										flexDirection: 'column',
										position: 'relative',
										cursor: 'pointer'
									}}
									onClick={() => onUseScrapedWinner(winner.imagePath)}
								>
									{/* Card header */}
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
											{winner.metadata?.logoUrl ? (
												<img src={winner.metadata.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
											) : (
												(winner.name || 'F').slice(0, 1).toUpperCase()
											)}
										</span>
										<div style={{ flex: 1, minWidth: 0 }}>
											<strong style={{ display: 'block', fontSize: '11.5px', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
												{winner.name || 'Foreplay Ad'}
											</strong>
											<span style={{ fontSize: '9px', color: '#918b95' }}>Patrocinado</span>
										</div>
									</div>

									{/* Image Container with Heart */}
									<div style={{ background: '#f8f6fb', position: 'relative', overflow: 'hidden' }}>
										{/* Protection overlay */}
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
										
										{/* Heart Button */}
										<button
											onClick={(e) => {
												e.stopPropagation();
												onToggleLikedScraped(winner.imagePath);
											}}
											style={{
												position: 'absolute',
												top: '10px',
												right: '10px',
												zIndex: 4,
												border: 0,
												background: 'rgba(255,255,255,0.85)',
												color: isLiked ? '#ff4185' : '#716d79',
												borderRadius: '50%',
												width: '30px',
												height: '30px',
												display: 'grid',
												placeItems: 'center',
												cursor: 'pointer',
												boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
												outline: 0
											}}
											title={isLiked ? "Quitar de guardados" : "Guardar idea"}
										>
											<Icon name="heart" size={15} fill={isLiked ? '#ff4185' : 'none'} />
										</button>

										<img
											src={imageUrl}
											alt={winner.name}
											style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
											loading="lazy"
											onContextMenu={(e) => e.preventDefault()}
											onDragStart={(e) => e.preventDefault()}
										/>
									</div>

									{/* Footer with prompt details */}
									<div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
										<p
											style={{
												fontSize: '11px',
												color: '#4a444f',
												margin: '0 0 12px 0',
												lineHeight: '1.45',
												maxHeight: '44px',
												overflow: 'hidden',
												display: '-webkit-box',
												WebkitLineClamp: 2,
												WebkitBoxOrient: 'vertical'
											}}
										>
											{winner.promptNotes || 'Inspiración publicitaria ganadora.'}
										</p>
										<button
											onClick={(e) => {
												e.stopPropagation();
												onUseScrapedWinner(winner.imagePath);
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
				</>
			)}

			{/* ── Liked scraped ads from library ── */}
			{likedWinners.length > 0 && (
				<>
					<div className="studio-section-title">
						<div>
							<h2>Anuncios guardados de la biblioteca</h2>
							<p>Tus ideas ganadoras favoritas para tener a mano.</p>
						</div>
						<button onClick={() => onView('winners')}>
							Biblioteca completa <Icon name="arrow" size={15} />
						</button>
					</div>
					<div className="library-ad-grid-masonry dashboard-masonry" style={{ columnGap: '16px' }}>
						{likedWinners.map((winner, idx) => {
							const supabaseUrl = 'https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/';
							const imageUrl = winner.imagePath?.startsWith('http') ? winner.imagePath : supabaseUrl + winner.imagePath;
							const isLiked = likedScrapedPaths.has(winner.imagePath);

							return (
								<article
									className="library-ad-card-masonry"
									key={winner.imagePath || idx}
									style={{
										display: 'flex',
										flexDirection: 'column',
										position: 'relative',
										cursor: 'pointer'
									}}
									onClick={() => onUseScrapedWinner(winner.imagePath)}
								>
									{/* Card header */}
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
											{winner.metadata?.logoUrl ? (
												<img src={winner.metadata.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
											) : (
												(winner.name || 'F').slice(0, 1).toUpperCase()
											)}
										</span>
										<div style={{ flex: 1, minWidth: 0 }}>
											<strong style={{ display: 'block', fontSize: '11.5px', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
												{winner.name || 'Foreplay Ad'}
											</strong>
											<span style={{ fontSize: '9px', color: '#918b95' }}>Patrocinado</span>
										</div>
									</div>

									{/* Image Container with Heart */}
									<div style={{ background: '#f8f6fb', position: 'relative', overflow: 'hidden' }}>
										{/* Protection overlay */}
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
										
										{/* Heart Button */}
										<button
											onClick={(e) => {
												e.stopPropagation();
												onToggleLikedScraped(winner.imagePath);
											}}
											style={{
												position: 'absolute',
												top: '10px',
												right: '10px',
												zIndex: 4,
												border: 0,
												background: 'rgba(255,255,255,0.85)',
												color: isLiked ? '#ff4185' : '#716d79',
												borderRadius: '50%',
												width: '30px',
												height: '30px',
												display: 'grid',
												placeItems: 'center',
												cursor: 'pointer',
												boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
												outline: 0
											}}
											title={isLiked ? "Quitar de guardados" : "Guardar idea"}
										>
											<Icon name="heart" size={15} fill={isLiked ? '#ff4185' : 'none'} />
										</button>

										<img
											src={imageUrl}
											alt={winner.name}
											style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
											loading="lazy"
											onContextMenu={(e) => e.preventDefault()}
											onDragStart={(e) => e.preventDefault()}
										/>
									</div>

									{/* Footer with prompt details */}
									<div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
										<p
											style={{
												fontSize: '11px',
												color: '#4a444f',
												margin: '0 0 12px 0',
												lineHeight: '1.45',
												maxHeight: '44px',
												overflow: 'hidden',
												display: '-webkit-box',
												WebkitLineClamp: 2,
												WebkitBoxOrient: 'vertical'
											}}
										>
											{winner.promptNotes || 'Inspiración publicitaria ganadora.'}
										</p>
										<button
											onClick={(e) => {
												e.stopPropagation();
												onUseScrapedWinner(winner.imagePath);
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
				</>
			)}
		</>
	);
}

function CreativeFeatureCard({ creative, index, onClick }: { creative: Creativo; index: number; onClick: () => void }) {
	return null;
}

function Library({ items, favorites, onChoose, onToggleFavorite }: { items: Creativo[]; favorites: Set<number>; onChoose: (creative: Creativo) => void; onToggleFavorite: (id: number) => void }) {
	const [query, setQuery] = useState('');
	const [scope, setScope] = useState<'all' | 'favorites'>('all');
	const [groupId, setGroupId] = useState('');
	const [branchId, setBranchId] = useState('');
	const [leafId, setLeafId] = useState('');
	const [sort, setSort] = useState<'relevant' | 'newest'>('relevant');
	const [referenceImages, setReferenceImages] = useState<Record<number, string>>({});
	const activeGroup = catalogTaxonomy.find((group) => group.id === groupId);
	const activeBranch = activeGroup?.branches.find((branch) => branch.id === branchId);
	const activeLeaf = activeBranch?.leaves.find((leaf) => leaf.id === leafId);

	useEffect(() => {
		if (!isSupabaseConfigured || !supabase) return;
		let active = true;
		async function loadReferenceImages() {
			const client = supabase;
			if (!client) return;
			const { data } = await client.from('creative_references')
				.select('template_id,image_path,metadata,sort_order')
				.eq('is_active', true)
				.in('rights_status', ['owned', 'licensed', 'public_domain'])
				.order('sort_order', { ascending: true })
				.limit(250);
			const firstStaticByTemplate = new Map<number, string>();
			for (const item of data || []) {
				const isStatic = item.metadata?.mediaType === 'static_image' || /\.(png|jpe?g|webp|avif)$/i.test(item.image_path || '');
				if (isStatic && !firstStaticByTemplate.has(Number(item.template_id))) firstStaticByTemplate.set(Number(item.template_id), item.image_path);
			}
			if (!firstStaticByTemplate.size) {
				const { data: manifestUrl } = client.storage.from('creative-references').getPublicUrl('manifests/starter-static-50.json');
				const response = await fetch(manifestUrl.publicUrl);
				if (response.ok) {
					const remoteManifest = await response.json();
					for (const item of remoteManifest.items || []) if (!firstStaticByTemplate.has(Number(item.templateId))) firstStaticByTemplate.set(Number(item.templateId), item.imagePath);
				}
			}
			const publicEntries = [...firstStaticByTemplate.entries()].map(([templateId, imagePath]) => [templateId, client.storage.from('creative-references').getPublicUrl(imagePath).data.publicUrl] as const);
			if (active) setReferenceImages(Object.fromEntries(publicEntries));
		}
		void loadReferenceImages();
		return () => { active = false; };
	}, []);

	const filtered = useMemo(() => items.filter((creative) => {
		const path = templatePath(creative);
		const matchesFavorite = scope === 'all' || favorites.has(creative.id);
		const matchesGroup = !groupId || creative.categoryGroup === groupId || path?.group.id === groupId;
		const matchesBranch = !branchId || creative.categoryBranch === activeBranch?.label.toLowerCase() || path?.branch.id === branchId;
		const matchesLeaf = !leafId || creative.categoryLeaf === activeLeaf?.label.toLowerCase() || activeLeaf?.templateIds.includes(creative.id);
		const haystack = `${creative.nombre} ${creative.sirve} ${creative.cuando} ${(creative.keywords || []).join(' ')} ${path?.group.label || ''} ${path?.branch.label || ''} ${path?.leaf.label || ''}`.toLowerCase();
		return matchesFavorite && matchesGroup && matchesBranch && matchesLeaf && haystack.includes(query.toLowerCase().trim());
	}).sort((a, b) => sort === 'newest' ? b.id - a.id : Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id)), [items, favorites, scope, groupId, branchId, leafId, activeBranch, activeLeaf, query, sort]);

	function chooseGroup(id: string) {
		setGroupId(id); setBranchId(''); setLeafId(''); setScope('all');
	}

	function clearFilters() {
		setScope('all'); setGroupId(''); setBranchId(''); setLeafId(''); setQuery('');
	}

	return <>
		<section className="library-discovery-hero">
			<div><span><i/> BIBLIOTECA CURADA</span><h1>Anuncios estáticos<br/><em>para crear mejor.</em></h1><p>Explorá estructuras visuales probadas, guardá tus favoritas y adaptalas a tu marca en minutos.</p></div>
		</section>
		<div className="library-search-tools">
			<label><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por ángulo, oferta o formato…"/>{query && <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda">×</button>}</label>
			<select value={sort} onChange={(event) => setSort(event.target.value as 'relevant' | 'newest')} aria-label="Ordenar biblioteca"><option value="relevant">Más relevantes</option><option value="newest">Más nuevas</option></select>
		</div>
		<nav className="library-category-rail" aria-label="Filtrar anuncios por objetivo">
			<button className={!groupId && scope === 'all' ? 'active' : ''} onClick={() => { setScope('all'); setGroupId(''); setBranchId(''); setLeafId(''); }}><Icon name="grid" size={15}/><span>Todos</span><b>{items.length}</b></button>
			{catalogTaxonomy.map((group) => {
				const count = items.filter((creative) => templatePath(creative)?.group.id === group.id).length;
				return <button key={group.id} className={groupId === group.id ? 'active' : ''} onClick={() => chooseGroup(group.id)} style={{ '--category-accent': group.accent } as React.CSSProperties}><i/><span>{group.label}</span><b>{count}</b></button>;
			})}
			<button className={scope === 'favorites' ? 'active saved' : 'saved'} onClick={() => { setScope('favorites'); setGroupId(''); setBranchId(''); setLeafId(''); }}><Icon name="heart" size={15}/><span>Guardados</span><b>{favorites.size}</b></button>
		</nav>
		{activeGroup && <div className="library-subfilters">
			<div><small>CATEGORÍA</small>{activeGroup.branches.map((branch) => <button key={branch.id} className={branchId === branch.id ? 'active' : ''} onClick={() => { setBranchId(branch.id); setLeafId(''); }}>{branch.label}</button>)}</div>
			{activeBranch && <div><small>TIPO</small>{activeBranch.leaves.map((leaf) => <button key={leaf.id} className={leafId === leaf.id ? 'active' : ''} onClick={() => setLeafId(leaf.id)}>{leaf.label}</button>)}</div>}
		</div>}
		<div className="library-results-heading new-library-heading"><div><strong>{scope === 'favorites' ? 'Tus anuncios guardados' : activeLeaf?.label || activeBranch?.label || activeGroup?.label || 'Todos los anuncios'}</strong><small>Elegí una referencia para abrir el generador paso a paso.</small></div>{(groupId || scope === 'favorites' || query) && <button onClick={clearFilters}>Limpiar filtros</button>}</div>
		<div className="library-ad-grid">{filtered.map((creative) => {
			const meta = ringMeta[creative.ring] || ringMeta.demo;
			const path = templatePath(creative);
			const imageUrl = referenceImages[creative.id] || referenceImagePath(creative);
			return <article className="library-ad-card" key={creative.id} style={{ '--card-accent': path?.group.accent || meta?.accent } as React.CSSProperties}>
				<div className="library-ad-visual">
					<button className="library-ad-open" onClick={() => onChoose(creative)} aria-label={`Usar ${creative.nombre} como referencia`}><img src={imageUrl} alt={`Referencia estática: ${creative.nombre}`} loading="lazy"/><span className="library-ad-overlay"><b>Usar esta referencia</b><Icon name="arrow" size={17}/></span></button>
					<span className="library-media-badge"><i/> IMAGEN · 4:5</span>
					<button className={`library-ad-save ${favorites.has(creative.id) ? 'active' : ''}`} onClick={() => onToggleFavorite(creative.id)} aria-label={favorites.has(creative.id) ? `Quitar ${creative.nombre} de guardados` : `Guardar ${creative.nombre}`}><Icon name="heart" size={17}/></button>
				</div>
				<div className="library-ad-info">
					<div className="library-ad-source"><span>{creativeNumber(creative.id)}</span><p><strong>Creattia reference</strong><small>{path?.group.label || meta?.label} · {path?.leaf.label || creative.n}</small></p><b>{creative.featured ? 'DESTACADO' : creative.n}</b></div>
					<button onClick={() => onChoose(creative)}><h3>{creative.nombre}</h3><p>{conciseText(creative.sirve)}</p><footer><span>Crear con esta idea</span><Icon name="arrow" size={15}/></footer></button>
				</div>
			</article>;
		})}</div>
		{filtered.length === 0 && <div className="studio-empty library-empty"><span><Icon name={scope === 'favorites' ? 'heart' : 'search'}/></span><h3>{scope === 'favorites' ? 'Todavía no guardaste anuncios' : 'No encontramos ese tipo'}</h3><p>{scope === 'favorites' ? 'Tocá el corazón de una referencia para encontrarla acá.' : 'Probá otra búsqueda o limpiá los filtros.'}</p><button onClick={clearFilters}>Explorar toda la biblioteca</button></div>}
	</>;
}

function ProductIntake({ session, products, onProductsChanged, onCreated, compact = false }: { session: AppSession; products: Product[]; onProductsChanged: () => Promise<Product[]>; onCreated: (productIds: string[]) => void; compact?: boolean }) {
	const [mode, setMode] = useState<'url' | 'manual'>('url');
	const [productUrl, setProductUrl] = useState('');
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [priceText, setPriceText] = useState('');
	const [currency, setCurrency] = useState('ARS');
	const [files, setFiles] = useState<File[]>([]);
	const [previews, setPreviews] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const manualInput = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const urls = files.map((file) => URL.createObjectURL(file));
		setPreviews(urls);
		return () => urls.forEach((url) => URL.revokeObjectURL(url));
	}, [files]);

	function resetManual() {
		setName(''); setDescription(''); setPriceText(''); setCurrency('ARS'); setProductUrl(''); setFiles([]);
	}

	async function importUrl() {
		if (!productUrl.trim()) { setError('Pegá la URL exacta del producto.'); return; }
		setSaving(true); setError(''); setNotice('');
		try {
			const normalizedUrl = normalizeProductUrlInput(productUrl);
			let ids: string[] = [];
			if (!isSupabaseConfigured) {
				const id = crypto.randomUUID();
				let label = `Producto ${products.length + 1}`;
				try { label = new URL(normalizedUrl).pathname.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ') || label; } catch { /* demo label */ }
				const artwork = demoProductArt(String(products.length + 1).padStart(2, '0'), '#19171d');
				const item: Product = { id, name: label, description: 'Producto importado desde su URL.', priceText: '', currency: '', productUrl: normalizedUrl, imageUrl: artwork, imageUrls: [artwork], imageCount: 1, source: 'website' };
				saveLocal(PRODUCTS_KEY, [item, ...products]); ids = [id];
			} else {
				const response = await fetch('/api/creativos/products', {
					method: 'POST', headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
					body: JSON.stringify({ url: normalizedUrl }),
				});
				const payload = await response.json();
				if (!response.ok || !payload.importedIds?.length) throw new Error(payload.error || payload.errors?.[0]?.error || 'No pudimos leer ese producto. Probá cargar sus fotos.');
				ids = payload.importedIds;
			}
			await onProductsChanged(); onCreated(ids); setProductUrl('');
			setNotice('Producto listo. Guardamos sus datos y las fotos disponibles.');
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo importar el producto.'); }
		finally { setSaving(false); }
	}

	async function saveManual() {
		if (!name.trim()) { setError('Poné el nombre del producto.'); return; }
		if (!files.length) { setError('Subí al menos una foto del producto.'); return; }
		if (files.some((file) => !['image/png', 'image/jpeg', 'image/webp', 'image/avif'].includes(file.type))) { setError('Usá imágenes PNG, JPG, WebP o AVIF.'); return; }
		if (files.some((file) => file.size > 15 * 1024 * 1024)) { setError('Cada imagen debe pesar menos de 15 MB.'); return; }
		setSaving(true); setError(''); setNotice('');
		let createdId = '';
		const uploadedPaths: string[] = [];
		try {
			createdId = crypto.randomUUID();
			const normalizedUrl = normalizeProductUrlInput(productUrl);
			if (!isSupabaseConfigured) {
				const imageUrls = await Promise.all(files.map(fileAsDataUrl));
				const item: Product = { id: createdId, name: name.trim(), description: description.trim(), priceText: priceText.trim(), currency: currency.trim(), productUrl: normalizedUrl, imageUrl: imageUrls[0], imageUrls, imageCount: imageUrls.length, source: 'manual' };
				saveLocal(PRODUCTS_KEY, [item, ...products]);
			} else {
				if (!supabase) throw new Error('Supabase no está disponible.');
				const { error: insertError } = await supabase.from('creative_products').insert({
					id: createdId, user_id: getSessionId(session), name: name.trim(), description: description.trim() || null,
					price_text: priceText.trim() || null, currency: currency.trim() || null, product_url: normalizedUrl || null,
					source: 'manual', external_id: crypto.randomUUID(), synced_at: new Date().toISOString(),
				});
				if (insertError) throw insertError;
				const imageRows = [];
				for (let index = 0; index < files.length; index += 1) {
					const file = files[index];
					const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif' }[file.type] || 'png';
					const path = `${getSessionId(session)}/products/${createdId}/${index === 0 ? 'primary' : `angle-${index + 1}`}.${extension}`;
					const { error: uploadError } = await supabase.storage.from('creative-assets').upload(path, file, { contentType: file.type, upsert: false });
					if (uploadError) throw uploadError;
					uploadedPaths.push(path);
					imageRows.push({ user_id: getSessionId(session), product_id: createdId, storage_path: path, sort_order: index, is_primary: index === 0 });
				}
				const { error: imageError } = await supabase.from('creative_product_images').insert(imageRows);
				if (imageError) throw imageError;
				const { error: updateError } = await supabase.from('creative_products').update({ image_path: uploadedPaths[0], updated_at: new Date().toISOString() }).eq('id', createdId).eq('user_id', getSessionId(session));
				if (updateError) throw updateError;
			}
			await onProductsChanged(); onCreated([createdId]); resetManual();
			setNotice(`${files.length} ${files.length === 1 ? 'foto guardada' : 'fotos guardadas'}. El producto ya se puede usar.`);
		} catch (cause) {
			if (isSupabaseConfigured && supabase && createdId) {
				if (uploadedPaths.length) await supabase.storage.from('creative-assets').remove(uploadedPaths);
				await supabase.from('creative_products').delete().eq('id', createdId).eq('user_id', getSessionId(session));
			}
			setError(cause instanceof Error ? cause.message : 'No se pudo guardar el producto.');
		} finally { setSaving(false); }
	}

	return <section className={`product-intake ${compact ? 'compact' : ''}`}>
		<header><div><small>AGREGAR PRODUCTO</small><strong>Elegí la forma más rápida.</strong></div><nav><button className={mode === 'url' ? 'active' : ''} onClick={() => { setMode('url'); setError(''); }}>Desde una URL</button><button className={mode === 'manual' ? 'active' : ''} onClick={() => { setMode('manual'); setError(''); }}>Con fotos</button></nav></header>
		{mode === 'url' ? <div className="product-intake-url"><label>URL exacta del producto<input value={productUrl} onChange={(event) => setProductUrl(event.target.value)} placeholder="https://mitienda.com/productos/..."/></label><p>Leemos nombre, descripción, precio y hasta 6 imágenes públicas del producto.</p><button onClick={() => void importUrl()} disabled={saving || !productUrl.trim()}>{saving ? <><span className="studio-spinner small"/> Analizando…</> : <><Icon name="external" size={16}/>Analizar y guardar</>}</button></div> : <div className="product-intake-manual">
			<input ref={manualInput} hidden multiple type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 6))}/>
			<button className="product-photo-drop" onClick={() => manualInput.current?.click()}><span><Icon name="upload"/></span><strong>{files.length ? `${files.length} ${files.length === 1 ? 'foto elegida' : 'fotos elegidas'}` : 'Subir entre 1 y 6 fotos'}</strong><small>Frente, dorso, detalle o distintos ángulos.</small></button>
			{previews.length > 0 && <div className="product-photo-previews">{previews.map((url, index) => <span key={url}><img src={url} alt={`Foto ${index + 1}`}/>{index === 0 && <b>Principal</b>}</span>)}</div>}
			<div className="product-manual-fields"><label>Nombre *<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Zapatilla Urban White"/></label><label>URL (opcional)<input value={productUrl} onChange={(event) => setProductUrl(event.target.value)} placeholder="Link del producto"/></label><label className="wide">Descripción útil para el anuncio<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Material, beneficio real, variante, tamaño o cualquier dato que la IA deba respetar."/></label><label>Precio (opcional)<input value={priceText} onChange={(event) => setPriceText(event.target.value)} placeholder="89.900"/></label><label>Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="ARS">ARS</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="">Sin moneda</option></select></label></div>
			<button className="product-save-manual" onClick={() => void saveManual()} disabled={saving || !name.trim() || !files.length}>{saving ? <><span className="studio-spinner small"/> Guardando…</> : <><Icon name="check" size={16}/>Guardar producto</>}</button>
		</div>}
		{notice && <p className="studio-form-notice product-intake-message"><Icon name="check" size={14}/>{notice}</p>}
		{error && <p className="studio-form-error product-intake-message">{error}</p>}
	</section>;
}

function ProductCatalog({ products, profile, session, onRefresh, onSync, onRemove, onCreate }: { products: Product[]; profile: AppProfile; session: AppSession; onRefresh: () => Promise<Product[]>; onSync: () => Promise<void>; onRemove: (productId: string) => Promise<void>; onCreate: (productId?: string) => void }) {
	const [query, setQuery] = useState('');
	const [syncing, setSyncing] = useState(false);
	const [removing, setRemoving] = useState('');
	const [error, setError] = useState('');
	const filtered = useMemo(() => products.filter((product) => `${product.name} ${product.description} ${product.priceText}`.toLowerCase().includes(query.toLowerCase().trim())), [products, query]);
	async function sync() {
		setSyncing(true); setError('');
		try { await onSync(); await onRefresh(); }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo sincronizar.'); }
		finally { setSyncing(false); }
	}
	async function remove(product: Product) {
		if (!window.confirm(`¿Quitar “${product.name}” de tu catálogo? Tus imágenes anteriores no se borran.`)) return;
		setRemoving(product.id); setError('');
		try { await onRemove(product.id); }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo quitar el producto.'); }
		finally { setRemoving(''); }
	}
	return <>
		<div className="studio-page-heading"><div><p>MIS PRODUCTOS</p><h1>Tu catálogo de trabajo.</h1><span>Guardá fotos y datos reales para reutilizarlos en cualquier creativo.</span></div><button className="studio-primary-button compact" onClick={() => onCreate()}><Icon name="plus" size={17}/>Crear imagen</button></div>
		<ProductIntake session={session} products={products} onProductsChanged={onRefresh} onCreated={() => { /* stays in catalog */ }}/>
		{(profile.website || profile.instagram) && <section className="catalog-sync-row"><div><span><Icon name={profile.catalogStatus === 'ready' ? 'check' : 'external'} size={16}/></span><p><strong>Sincronización de tienda</strong><small>{profile.website || profile.instagram}</small></p></div><button onClick={sync} disabled={syncing}>{syncing ? <><span className="studio-spinner small"/> Actualizando…</> : 'Actualizar todos'}</button></section>}
		{error && <p className="studio-form-error catalog-error">{error}</p>}
		<div className="studio-library-tools product-tools"><label><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, descripción o precio…"/></label><span>{filtered.length} productos</span></div>
		{filtered.length ? <div className="product-catalog-grid">{filtered.map((product) => <article key={product.id}><div>{product.imageUrl ? <img src={product.imageUrl} alt={product.name}/> : <span><Icon name="bag" size={30}/></span>}<small>{product.imageCount || 1} {(product.imageCount || 1) === 1 ? 'foto' : 'fotos'}</small><button className="product-remove-button" onClick={() => void remove(product)} disabled={removing === product.id} aria-label={`Quitar ${product.name}`}>{removing === product.id ? <span className="studio-spinner small"/> : <Icon name="close" size={15}/>}</button></div><footer><h3>{product.name}</h3><p>{conciseText(product.description || 'Listo para usar en una imagen.')}</p><span>{product.priceText ? `${product.priceText} ${product.currency}` : product.source === 'manual' ? 'Cargado por vos' : 'Desde tu tienda'}</span><nav><button onClick={() => onCreate(product.id)}>Crear con este producto <Icon name="arrow" size={14}/></button>{product.productUrl && <a href={product.productUrl} target="_blank" rel="noreferrer" aria-label={`Abrir ${product.name}`}><Icon name="external" size={14}/></a>}</nav></footer></article>)}</div> : <div className="studio-empty large"><span><Icon name="bag"/></span><h3>Agregá tu primer producto</h3><p>Pegá su URL o subí sus fotos y datos en el formulario de arriba.</p></div>}
	</>;
}

// Página dedicada a la creación en curso: progreso en vivo, se puede navegar
// a otras secciones o cerrar la pestaña — la generación sigue en el servidor.
function GenerationView({ batch, onBack, onReuse, onHistory }: { batch: ActiveBatch; onBack: () => void; onReuse: (generation: Generation) => void; onHistory: () => void }) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (batch.status !== 'processing') return;
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [batch.status]);
	const elapsed = Math.max(0, Math.floor((now - batch.startedAt) / 1000));
	const minutes = Math.floor(elapsed / 60);
	const seconds = String(elapsed % 60).padStart(2, '0');
	const stage = elapsed < 25
		? 'Analizando el anuncio ganador y tu producto…'
		: elapsed < 55
			? 'Escribiendo el copy y planificando cada zona del diseño…'
			: 'Generando tu imagen en alta calidad…';

	return (
		<section style={{ width: '100%', padding: '30px 10px' }}>
			<button onClick={onBack} style={{ border: 0, background: 'transparent', color: '#716d79', cursor: 'pointer', fontSize: '13px', marginBottom: '18px', padding: 0 }}>← Volver a la biblioteca</button>

			{batch.status === 'processing' && (
				<div style={{ background: '#fff', border: '1px solid #eee9f2', borderRadius: '18px', padding: '46px 30px', textAlign: 'center', maxWidth: '680px', margin: '0 auto' }}>
					{batch.referenceUrl && (
						<img src={batch.referenceUrl} alt="" style={{ width: '92px', height: '92px', objectFit: 'cover', borderRadius: '14px', marginBottom: '20px', boxShadow: '0 10px 26px rgba(0,0,0,0.14)' }} />
					)}
					<h1 style={{ margin: '0 0 8px', fontSize: '22px', color: '#19171d' }}>Creando “{batch.title}”</h1>
					<p style={{ margin: '0 0 26px', color: '#716d79', fontSize: '14px' }}>{stage}</p>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '26px' }}>
						<span className="studio-spinner" style={{ width: '22px', height: '22px' }} />
						<b style={{ fontSize: '15px', color: '#19171d', fontVariantNumeric: 'tabular-nums' }}>{minutes}:{seconds}</b>
					</div>
					<p style={{ margin: 0, fontSize: '12px', color: '#8b8490', lineHeight: 1.6 }}>
						Suele tardar alrededor de un minuto.<br/>
						Podés seguir usando la app o cerrar esta pestaña: el anuncio se guarda solo en <b>Mis imágenes</b>.
					</p>
				</div>
			)}

			{batch.status === 'completed' && (
				<div>
					<h1 style={{ margin: '0 0 6px', fontSize: '24px', color: '#19171d' }}>¡Tu anuncio está listo!</h1>
					<p style={{ margin: '0 0 22px', color: '#716d79', fontSize: '14px' }}>Basado en “{batch.title}”. También quedó guardado en Mis imágenes.</p>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 460px))', justifyContent: 'center', gap: '18px' }}>
						{batch.results.map((generation) => (
							<figure key={generation.id} style={{ margin: 0, background: '#fff', border: '1px solid #eee9f2', borderRadius: '16px', padding: '14px' }}>
								<img src={generation.imageUrl} alt={generation.title} style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
								<figcaption style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
									<button onClick={() => void downloadImage(generation.imageUrl, `creattia-${generation.id}.png`)} style={{ flex: 1, padding: '11px 0', borderRadius: '10px', border: 0, background: '#19171d', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Descargar</button>
									<button onClick={() => onReuse(generation)} style={{ flex: 1, padding: '11px 0', borderRadius: '10px', border: '1px solid #dcd5e4', background: '#fff', color: '#19171d', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>Nueva versión</button>
								</figcaption>
							</figure>
						))}
					</div>
					<button onClick={onHistory} style={{ marginTop: '20px', border: 0, background: 'transparent', color: '#7a4fd3', cursor: 'pointer', fontSize: '13px', fontWeight: 700, padding: 0 }}>Ver todas mis imágenes →</button>
				</div>
			)}

			{batch.status === 'failed' && (
				<div style={{ background: '#fff5f5', border: '1px solid #f3dada', borderRadius: '18px', padding: '38px 30px', textAlign: 'center' }}>
					<h1 style={{ margin: '0 0 10px', fontSize: '20px', color: '#a43f3f' }}>No pudimos generar este anuncio</h1>
					<p style={{ margin: '0 0 6px', color: '#8a5555', fontSize: '13px' }}>{batch.error}</p>
					<p style={{ margin: '0 0 22px', color: '#8a5555', fontSize: '12px' }}>Tus créditos no usados fueron devueltos automáticamente.</p>
					<button onClick={onBack} style={{ padding: '11px 22px', borderRadius: '10px', border: 0, background: '#19171d', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Probar de nuevo</button>
				</div>
			)}
		</section>
	);
}

function Studio({ creative, reuseSeed, initialProductIds, onSeedConsumed, profile, session, products, onProductsChanged, onChooseLibrary, onGenerated, onToast, onGenerationStarted }: { creative: Creativo; reuseSeed: Generation | null; initialProductIds: string[]; onSeedConsumed: () => void; profile: AppProfile; session: AppSession; products: Product[]; onProductsChanged: () => Promise<Product[]>; onChooseLibrary: () => void; onGenerated: (generations: Generation[], credits: number) => void; onToast: (message: string) => void; onGenerationStarted?: (batch: { batchId: string; title: string; referenceUrl?: string; count: number }) => void }) {
	const [wizardOpen, setWizardOpen] = useState(true);
	const [step, setStep] = useState(1);
	const [imageType, setImageType] = useState('product');
	const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
	const [productQuery, setProductQuery] = useState('');
	const [showProductIntake, setShowProductIntake] = useState(false);
	const [preset, setPreset] = useState('fiel');
	const [references, setReferences] = useState<CreativeReference[]>([]);
	const [referenceId, setReferenceId] = useState('');
	const [format, setFormat] = useState('square');
	const [count, setCount] = useState(1);
	const [brief, setBrief] = useState('');
	const [revisionBrief, setRevisionBrief] = useState('');
	const [showRevisionProducts, setShowRevisionProducts] = useState(false);
	const [variationStrength, setVariationStrength] = useState<VariationStrength>('exact');
	const [generating, setGenerating] = useState(false);
	const [results, setResults] = useState<Generation[]>([]);
	const [result, setResult] = useState<Generation | null>(null);
	const [error, setError] = useState('');
	const [fastUrl, setFastUrl] = useState('');
	const [fastImporting, setFastImporting] = useState(false);

	const selectedProducts = selectedProductIds.flatMap((id) => {
		const product = products.find((item) => item.id === id);
		return product ? [product] : [];
	});
	const filteredProducts = useMemo(() => products.filter((product) => `${product.name} ${product.description}`.toLowerCase().includes(productQuery.toLowerCase().trim())).slice(0, 30), [products, productQuery]);
	const typeOptions = [
		{ id: 'product', title: 'Producto protagonista', copy: 'Tu producto ocupa el centro de la imagen.', badge: 'Más usado', icon: 'bag' },
		{ id: 'promotion', title: 'Promoción de marca', copy: 'Comunicá una oferta con o sin producto.', badge: 'Flexible', icon: 'spark' },
		{ id: 'lifestyle', title: 'Producto en contexto', copy: 'Mostralo dentro de una escena real.', badge: 'Lifestyle', icon: 'brand' },
		{ id: 'catalog', title: 'Foto de catálogo', copy: 'Fondo limpio y foco total en el producto.', badge: 'E-commerce', icon: 'grid' },
	];
	const formatOptions = [
		{ id: 'square', title: 'Feed cuadrado', ratio: '1:1', copy: '1024 × 1024' },
		{ id: 'portrait', title: 'Feed vertical', ratio: '4:5', copy: '1024 × 1280' },
		{ id: 'story', title: 'Stories / Reels', ratio: '9:16', copy: '1008 × 1792' },
		{ id: 'landscape', title: 'Horizontal', ratio: '5:4', copy: '1280 × 1024' },
	];

	useEffect(() => {
		setWizardOpen(true); setStep(reuseSeed ? 5 : 1); setResults([]); setResult(null); setError(''); setRevisionBrief(''); setShowRevisionProducts(false); setVariationStrength('exact'); setCount(1);
		const reusableIds = reuseSeed?.productIds?.length ? reuseSeed.productIds : reuseSeed?.productId ? [reuseSeed.productId] : initialProductIds;
		setSelectedProductIds(reusableIds.filter((id) => products.some((item) => item.id === id)).slice(0, 5));
		if (!reuseSeed && initialProductIds.length) onSeedConsumed();
		setBrief(reuseSeed?.brief || ''); setImageType(reuseSeed?.imageType || 'product'); setPreset(reuseSeed?.preset || 'fiel'); setFormat(reuseSeed?.format || 'square');
	}, [creative.id, reuseSeed?.id]);
	useEffect(() => {
		if (!wizardOpen) return;
		const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = previous; };
	}, [wizardOpen]);
	useEffect(() => {
		let cancelled = false; setReferences([]); setReferenceId('');
		if (!isSupabaseConfigured || !supabase) return;
		const client = supabase;
		void (async () => {
			const { data } = await client.from('creative_references').select('id,name,image_path,prompt_notes').eq('template_id', creative.id).eq('is_active', true).in('rights_status', ['owned', 'licensed', 'public_domain']).order('sort_order').limit(5);
			let loaded: CreativeReference[] = (data || []).map((item) => ({
				id: item.id,
				name: item.name,
				description: item.prompt_notes || 'Composición ganadora validada.',
				imageUrl: client.storage.from('creative-references').getPublicUrl(item.image_path).data.publicUrl,
				storagePath: item.image_path,
			}));
			if (!loaded.length) {
				const { data: manifestUrl } = client.storage.from('creative-references').getPublicUrl('manifests/starter-static-50.json');
				const response = await fetch(manifestUrl.publicUrl);
				if (response.ok) {
					const remoteManifest = await response.json();
					loaded = (remoteManifest.items || []).filter((item: any) => Number(item.templateId) === creative.id).slice(0, 5).map((item: any) => ({
						id: `storage:${item.imagePath}`,
						name: item.name,
						description: item.promptNotes || 'Composición estática original.',
						imageUrl: client.storage.from('creative-references').getPublicUrl(item.imagePath).data.publicUrl,
						storagePath: item.imagePath,
					}));
				}
			}
			if (cancelled) return;
			if (!cancelled) { setReferences(loaded); setReferenceId(loaded[0]?.id || ''); }
		})();
		return () => { cancelled = true; };
	}, [creative.id]);

	function nextStep() {
		setError('');
		if (step === 2 && imageType !== 'promotion' && !selectedProductIds.length) { setError('Elegí al menos un producto o cargá una foto para continuar.'); return; }
		setStep((current) => Math.min(5, current + 1));
	}

	function toggleProduct(productId: string) {
		setError('');
		setSelectedProductIds((current) => {
			if (current.includes(productId)) return current.filter((id) => id !== productId);
			if (current.length >= 5) { setError('Podés combinar hasta 5 productos en una imagen.'); return current; }
			return [...current, productId];
		});
	}

	async function handleFastImport() {
		if (!fastUrl.trim()) return;
		setFastImporting(true); setError('');
		try {
			const normalizedUrl = normalizeProductUrlInput(fastUrl);
			let ids: string[] = [];
			if (!isSupabaseConfigured) {
				const id = crypto.randomUUID();
				let label = `Producto ${products.length + 1}`;
				try { label = new URL(normalizedUrl).pathname.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ') || label; } catch {}
				const artwork = demoProductArt(String(products.length + 1).padStart(2, '0'), '#19171d');
				const item: Product = { id, name: label, description: 'Producto importado desde su URL.', priceText: '', currency: '', productUrl: normalizedUrl, imageUrl: artwork, imageUrls: [artwork], imageCount: 1, source: 'website' };
				saveLocal(PRODUCTS_KEY, [item, ...products]); ids = [id];
			} else {
				const response = await fetch('/api/creativos/products', {
					method: 'POST', headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
					body: JSON.stringify({ url: normalizedUrl }),
				});
				const payload = await response.json();
				if (!response.ok || !payload.importedIds?.length) throw new Error(payload.error || payload.errors?.[0]?.error || 'No pudimos analizar ese producto. Probá cargarlo con fotos.');
				ids = payload.importedIds;
			}
			await onProductsChanged();
			setSelectedProductIds((current) => [...new Set([...current, ...ids])].slice(-5));
			setFastUrl('');
			onToast('Producto importado y seleccionado con éxito.');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo importar.');
		} finally {
			setFastImporting(false);
		}
	}

	async function generate(sourceGeneration: Generation | null = null) {
		setError('');
		const effectiveCount = sourceGeneration ? 1 : count;
		if (profile.credits < effectiveCount) { setError(`Necesitás ${effectiveCount} ${effectiveCount === 1 ? 'crédito' : 'créditos'} para generar este lote.`); return; }
		if (imageType !== 'promotion' && !selectedProducts.length) { setError('Elegí al menos un producto para generar esta imagen.'); return; }
		const effectiveBrief = sourceGeneration ? revisionBrief.trim() : brief.trim();
		setGenerating(true); if (!sourceGeneration) { setResults([]); setResult(null); }
		try {
			let generations: Generation[]; let credits = profile.credits - effectiveCount;
			if (!isSupabaseConfigured) {
				await new Promise((resolve) => window.setTimeout(resolve, 1350));
				let demoFile: File | null = null;
				const firstProduct = selectedProducts[0];
				if (firstProduct?.imageUrl.startsWith('data:')) { const blob = await (await fetch(firstProduct.imageUrl)).blob(); demoFile = new File([blob], `${firstProduct.name}.svg`, { type: blob.type }); }
				const batchId = crypto.randomUUID();
				generations = await Promise.all(Array.from({ length: effectiveCount }, async (_, index) => ({
					id: crypto.randomUUID(),
					title: creative.nombre,
					imageUrl: await createDemoCreative({ creative, profile, preset, format, brief: `${effectiveBrief}${effectiveCount > 1 ? ` · Variante ${index + 1}` : ''}`, product: demoFile }),
					format,
					createdAt: new Date().toISOString(),
					category: ringMeta[creative.ring]?.label || 'Creativo',
					templateId: creative.id,
					brief: effectiveBrief,
					preset,
					imageType,
					productId: selectedProductIds[0],
					productIds: selectedProductIds,
					batchId,
					outputIndex: index + 1,
				})));
			} else {
				const form = new FormData();
				form.set('templateId', String(creative.id)); form.set('templateName', creative.nombre); form.set('purpose', creative.sirve); form.set('usageHint', creative.cuando);
				form.set('preset', referencePresets.find((item) => item.id === preset)?.name || preset); form.set('imageType', imageType); form.set('format', format); form.set('brief', effectiveBrief);
				const chosenReference = references.find((item) => item.id === referenceId);
				if (referenceId.startsWith('storage:') && chosenReference?.storagePath) form.set('referencePath', chosenReference.storagePath);
				else if (referenceId) form.set('referenceId', referenceId);
				selectedProductIds.forEach((id) => form.append('productIds', id)); form.set('count', String(effectiveCount));
				if (sourceGeneration) { form.set('sourceGenerationId', sourceGeneration.id); form.set('variationStrength', variationStrength); }
				const response = await fetch('/api/creativos/generate', { method: 'POST', headers: { authorization: `Bearer ${getSessionToken(session)}` }, body: form });
				const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'No se pudo generar.');
				if (payload.async && payload.batchId && onGenerationStarted) {
					// La generación sigue en el servidor: pasamos a la página dedicada.
					setGenerating(false);
					setWizardOpen(false);
					onGenerated([], payload.creditsRemaining);
					onGenerationStarted({ batchId: payload.batchId, title: creative.nombre, count: effectiveCount });
					return;
				}
				credits = payload.creditsRemaining;
				generations = (payload.generations || [{ id: payload.id, imageUrl: payload.imageUrl, outputIndex: 1 }]).map((item: any) => ({
					id: item.id, title: creative.nombre, imageUrl: item.imageUrl, format, createdAt: new Date().toISOString(), category: ringMeta[creative.ring]?.label || 'Creativo', templateId: creative.id, brief: effectiveBrief, preset, imageType, productId: selectedProductIds[0], productIds: selectedProductIds, batchId: item.batchId, outputIndex: item.outputIndex,
				}));
			}
			const nextResults = sourceGeneration ? [generations[0]] : generations;
			setResults(nextResults); setResult(nextResults[0]); setStep(6); setRevisionBrief(''); onGenerated(generations, credits);
			onToast(isSupabaseConfigured ? `${generations.length === 1 ? 'Tu imagen está lista' : `Tus ${generations.length} imágenes están listas`} y guardada${generations.length === 1 ? '' : 's'}.` : 'Vista demo creada.');
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo generar la imagen.'); }
		finally { setGenerating(false); }
	}

	const meta = ringMeta[creative.ring] || ringMeta.demo;
	const currentVariant = references.length ? references.find((item) => item.id === referenceId)?.name : referencePresets.find((item) => item.id === preset)?.name;
	return <>
		<div className="studio-page-heading studio-editor-heading"><div><button onClick={onChooseLibrary}>Biblioteca</button><span>/</span><p>Crear imagen</p><h1>{creative.nombre}</h1></div><div className="studio-angle-meta"><span style={{ background: meta?.accent }}>{meta?.short}</span><b>#{creativeNumber(creative.id)}</b><b>{creative.n}</b></div></div>
		<section className="studio-resume-card">
			<div><span style={{ background: meta?.accent }}>{creativeNumber(creative.id)}</span><p><small>IDEA ELEGIDA</small><strong>{creative.nombre}</strong><em>{selectedProducts.length ? `${selectedProducts.length} ${selectedProducts.length === 1 ? 'producto elegido' : 'productos elegidos'}` : 'Elegí producto, formato y estilo dentro del generador'}</em></p></div>
			<button onClick={() => { setWizardOpen(true); if (result) setStep(6); }}>{result ? 'Volver al resultado' : 'Abrir generador'} <Icon name="arrow" size={17}/></button>
		</section>

		{wizardOpen && <div className="creative-wizard-overlay" role="dialog" aria-modal="true" aria-label="Generador guiado de imágenes"><div className="creative-wizard-modal">
			<header className="wizard-header"><div><span className="wizard-brand-mark"><Icon name="spark" size={17}/></span><p><small>CREATTIA</small><strong>{step === 6 ? 'Tu imagen está lista' : `Crear · ${creative.nombre}`}</strong></p></div><button onClick={() => setWizardOpen(false)} aria-label="Cerrar generador"><Icon name="close"/></button></header>
			{step <= 5 && <div className="wizard-progress">{['Tipo', 'Producto', 'Estilo', 'Formato', 'Indicación'].map((label, index) => <button key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''} onClick={() => index + 1 < step && setStep(index + 1)}><span>{step > index + 1 ? <Icon name="check" size={11}/> : index + 1}</span><b>{label}</b></button>)}</div>}
			<div className="wizard-body"><main>
				{step === 1 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 1 DE 5</span><h2>¿Qué tipo de imagen querés?</h2><p>Elegí cómo mostrar tu producto o promoción.</p></div><div className="wizard-type-grid">{typeOptions.map((item) => <button key={item.id} className={imageType === item.id ? 'active' : ''} onClick={() => setImageType(item.id)}><span><Icon name={item.icon}/></span><em>{item.badge}</em><h3>{item.title}</h3><p>{item.copy}</p>{imageType === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div></section>}
				{step === 2 && <section className="wizard-step">
					<div className="wizard-step-heading"><span>PASO 2 DE 5 · HASTA 5</span><h2>{imageType === 'promotion' ? '¿Querés sumar productos?' : 'Elegí uno o varios productos'}</h2><p>Elegí los que ya guardaste o agregá uno nuevo sin salir del generador.</p></div>
					
					{/* Fast Product URL Import Box */}
					<div className="fast-url-import-box" style={{ background: '#110d17', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
						<strong style={{ fontSize: '11px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}><Icon name="spark" size={13} /> ¿Querés crear con un producto nuevo?</strong>
						<p style={{ margin: 0, fontSize: '9px', color: '#8b8490', lineHeight: 1.4 }}>Pegá la URL del producto de tu tienda. Analizaremos las imágenes, el copy y los estilos automáticamente para la generación.</p>
						<div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
							<input 
								type="text" 
								placeholder="https://mitienda.com/productos/zapato-urban" 
								value={fastUrl}
								onChange={(e) => setFastUrl(e.target.value)}
								style={{ flex: 1, height: '36px', background: '#15121c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', padding: '0 10px', fontSize: '10.5px', outline: 'none' }}
							/>
							<button 
								type="button"
								onClick={handleFastImport}
								disabled={fastImporting || !fastUrl.trim()}
								style={{ height: '36px', padding: '0 16px', background: '#19171d', border: 0, borderRadius: '8px', color: '#fff', fontSize: '10.5px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
							>
								{fastImporting ? <span className="studio-spinner small" /> : <><Icon name="external" size={14}/> Analizar</>}
							</button>
						</div>
					</div>

					<div className="wizard-product-toolbar"><label className="wizard-product-search"><Icon name="search" size={18}/><input aria-label="Buscar producto" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto…"/><span>{selectedProductIds.length}/5</span></label><button className={showProductIntake ? 'active' : ''} onClick={() => setShowProductIntake((current) => !current)}><Icon name="plus" size={15}/>{showProductIntake ? 'Cerrar carga' : 'Agregar producto'}</button></div>
					{showProductIntake && <ProductIntake
						compact
						session={session}
						products={products}
						onProductsChanged={onProductsChanged}
						onCreated={(ids) => {
							setSelectedProductIds((current) => [...new Set([...current, ...ids])].slice(-5));
							setShowProductIntake(false);
							onToast('Producto guardado y seleccionado.');
						}}
					/>}
					{imageType === 'promotion' && <button className={`wizard-no-product ${!selectedProductIds.length ? 'active' : ''}`} onClick={() => setSelectedProductIds([])}><span><Icon name="spark"/></span><p><strong>Promoción sin producto</strong><small>Creá una oferta general de tu marca</small></p>{!selectedProductIds.length && <b><Icon name="check" size={13}/></b>}</button>}
					{filteredProducts.length ? <div className="wizard-product-grid">{filteredProducts.map((product) => { const selectedIndex = selectedProductIds.indexOf(product.id); return <button key={product.id} className={selectedIndex >= 0 ? 'active' : ''} onClick={() => toggleProduct(product.id)}><div>{product.imageUrl ? <img src={product.imageUrl} alt={product.name}/> : <span><Icon name="bag"/></span>}{selectedIndex >= 0 && <b>{selectedIndex + 1}</b>}{product.imageCount > 1 && <em>{product.imageCount} fotos</em>}</div><strong>{product.name}</strong><small>{product.priceText ? `${product.priceText} ${product.currency}` : product.source === 'manual' ? 'Cargado por vos' : 'Desde tu tienda'}</small></button>; })}</div> : !showProductIntake && <div className="wizard-products-empty"><Icon name="bag"/><strong>No hay productos guardados</strong><p>Agregá uno por URL o subiendo sus fotos.</p><button onClick={() => setShowProductIntake(true)}>Agregar mi producto</button></div>}
				</section>}
				{step === 3 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 3 DE 5</span><h2>¿Cómo querés que se vea?</h2><p>{references.length ? 'Elegí una referencia para conservar su composición.' : 'Elegí una versión visual para esta idea.'}</p></div>{references.length ? <div className="wizard-reference-grid">{references.map((item, index) => <button key={item.id} className={referenceId === item.id ? 'active' : ''} onClick={() => setReferenceId(item.id)}><div><img src={item.imageUrl} alt={item.name}/><span>OPCIÓN {String(index + 1).padStart(2, '0')}</span></div><strong>{item.name}</strong><small>{item.description}</small>{referenceId === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div> : <div className="wizard-variant-grid">{referencePresets.map((item, index) => <button key={item.id} className={preset === item.id ? 'active' : ''} onClick={() => setPreset(item.id)}><div className={`preset-preview preset-${index + 1}`}><i/><b/><span/><small/></div><em>{item.label}</em><strong>{item.name}</strong><p>{item.description}</p>{preset === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div>}</section>}
				{step === 4 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 4 DE 5</span><h2>Formato y cantidad</h2><p>Elegí dónde vas a publicar y cuántas variantes querés comparar.</p></div><div className="wizard-format-grid">{formatOptions.map((item) => <button key={item.id} className={format === item.id ? 'active' : ''} onClick={() => setFormat(item.id)}><span className={`format-shape shape-${item.id}`}><i/></span><p><strong>{item.title}</strong><small>{item.copy}</small></p><em>{item.ratio}</em>{format === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div><div className="wizard-output-count"><div><strong>Variantes a generar</strong><small>Cada imagen usa 1 crédito y se guarda por separado.</small></div><div>{[1, 2, 3, 4].map((value) => <button key={value} className={count === value ? 'active' : ''} onClick={() => setCount(value)} disabled={value > profile.credits}>{value}</button>)}</div><p><span>{count} {count === 1 ? 'imagen' : 'imágenes'}</span><b>{count} {count === 1 ? 'crédito' : 'créditos'}</b></p></div></section>}
				{step === 5 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 5 DE 5 · OPCIONAL</span><h2>¿Querés pedir algo puntual?</h2><p>Podés dejarlo vacío. La IA ya conoce tu marca y el producto elegido.</p></div><label className="wizard-brief"><textarea value={brief} maxLength={500} onChange={(event) => setBrief(event.target.value)} placeholder="Ej: destacar el envío gratis, usar un tono premium o dejar más aire."/><span>{brief.length}/500</span></label><div className="wizard-final-check"><span><Icon name="check" size={14}/></span><p><strong>Tu información ya está cargada</strong><small>Usamos tu web, Instagram y catálogo. Nunca inventamos precios ni beneficios.</small></p></div></section>}
				{step === 6 && <section className="wizard-result"><div className="wizard-result-visual"><div className={`wizard-result-image result-${format}`}>{generating ? <div><span className="studio-spinner"/><h3>Creando tu imagen…</h3></div> : result && <img src={result.imageUrl} alt={`Imagen ${result.title}`}/>}</div>{results.length > 1 && <div className="wizard-result-gallery">{results.map((item, index) => <button key={item.id} className={result?.id === item.id ? 'active' : ''} onClick={() => setResult(item)}><img src={item.imageUrl} alt={`Variante ${index + 1}`}/><span>{index + 1}</span></button>)}</div>}</div>{result && <div className="wizard-result-copy"><span><Icon name="check" size={14}/> {results.length > 1 ? `${results.length} VARIANTES GENERADAS` : 'IMAGEN GENERADA'}</span><h2>Lista para publicar.</h2><p>La guardamos en “Mis imágenes”. Elegí una variante, descargala o pedí un cambio.</p><div className="wizard-result-actions"><a href={result.imageUrl} download={`creattia-${creative.id}-${result.outputIndex || 1}.png`}><Icon name="download" size={18}/>Descargar elegida</a><button onClick={() => { setResults([]); setResult(null); setRevisionBrief(''); setStep(1); }}><Icon name="plus" size={17}/>Crear otra</button></div><div className="wizard-revision"><header><span><Icon name="spark" size={16}/></span><p><strong>¿Querés hacer un cambio?</strong><small>Usaremos la variante elegida como referencia.</small></p></header><label>Describí el cambio (opcional)<textarea value={revisionBrief} maxLength={500} onChange={(event) => setRevisionBrief(event.target.value)} placeholder="Ej: cambiar el fondo, reemplazar un producto o destacar más el beneficio."/></label><div className="wizard-selected-products-note"><Icon name="bag" size={15}/><span><strong>{selectedProducts.length || 0} {selectedProducts.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}</strong><small>Podés reemplazarlos antes de generar la nueva versión.</small></span><button onClick={() => setShowRevisionProducts((current) => !current)}>{showRevisionProducts ? 'Listo' : 'Cambiar'}</button></div>{showRevisionProducts && <div className="wizard-revision-products">{products.map((product) => <button key={product.id} className={selectedProductIds.includes(product.id) ? 'active' : ''} onClick={() => toggleProduct(product.id)}>{product.imageUrl ? <img src={product.imageUrl} alt=""/> : <Icon name="bag"/>}<span>{product.name}</span>{selectedProductIds.includes(product.id) && <b><Icon name="check" size={10}/></b>}</button>)}</div>}<div className="wizard-revision-strength">{([{ id: 'exact', title: 'Conservar todo', copy: 'Cambia solo lo que pedís.' }, { id: 'light', title: 'Variar detalles', copy: 'Mantiene el diseño base.' }, { id: 'strong', title: 'Reinterpretar', copy: 'Mismo enfoque, nueva composición.' }] as { id: VariationStrength; title: string; copy: string }[]).map((option) => <button key={option.id} className={variationStrength === option.id ? 'active' : ''} onClick={() => setVariationStrength(option.id)}><span>{variationStrength === option.id && <Icon name="check" size={11}/>}</span><p><strong>{option.title}</strong><small>{option.copy}</small></p></button>)}</div><button className="wizard-revision-generate" onClick={() => void generate(result)} disabled={generating}><Icon name="spark" size={17}/>Generar nueva versión <span>1 crédito</span></button></div></div>}</section>}
				{error && <p className="wizard-error">{error}</p>}
			</main>{step <= 5 && <aside className="wizard-summary"><small>RESUMEN</small><div><span style={{ background: meta?.accent }}>{creativeNumber(creative.id)}</span><p><strong>{creative.nombre}</strong><small>{meta?.label} · {creative.n}</small></p></div><ul><li><span>Tipo</span><b>{typeOptions.find((item) => item.id === imageType)?.title}</b></li><li><span>Productos</span><b>{selectedProducts.length ? `${selectedProducts.length} elegidos` : imageType === 'promotion' ? 'Sin producto' : 'Sin elegir'}</b></li><li><span>Estilo</span><b>{currentVariant || 'Fiel a la referencia'}</b></li><li><span>Formato</span><b>{formatOptions.find((item) => item.id === format)?.ratio}</b></li><li><span>Resultado</span><b>{count} {count === 1 ? 'imagen' : 'variantes'}</b></li></ul><footer><span><Icon name="brand" size={15}/></span><p><strong>{profile.brandName}</strong><small>Marca y catálogo listos</small></p></footer></aside>}</div>
			{step <= 5 && <footer className="wizard-footer"><button onClick={() => step === 1 ? setWizardOpen(false) : setStep(step - 1)}>{step === 1 ? 'Cancelar' : 'Atrás'}</button>{step < 5 ? <button className="primary" onClick={nextStep}>Continuar <Icon name="arrow" size={17}/></button> : <button className="primary generate" onClick={() => void generate()} disabled={generating || profile.credits < count}>{generating ? <><span className="studio-spinner small"/> Generando…</> : <><Icon name="spark" size={17}/>Generar {count === 1 ? 'imagen' : `${count} imágenes`} <span>{count} {count === 1 ? 'crédito' : 'créditos'}</span></>}</button>}</footer>}
		</div></div>}
	</>;
}

function History({ 
	history, 
	onCreate, 
	onReuse, 
	onExpand, 
	pending, 
	onViewProgress,
	likedImageIds = [],
	onToggleLike,
	folders = [],
	onToggleFolder,
	onRemoveFolder,
	onCreateFolder
}: { 
	history: Generation[]; 
	onCreate: () => void; 
	onReuse: (item: Generation) => void; 
	onExpand?: (item: Generation) => void; 
	pending?: { count: number; title: string; referenceUrl?: string; startedAt?: number } | null; 
	onViewProgress?: () => void;
	likedImageIds?: string[];
	onToggleLike?: (id: string) => void;
	folders?: Array<{ id: string; name: string; imageIds: string[] }>;
	onToggleFolder?: (imgId: string, folderId: string) => void;
	onRemoveFolder?: (folderId: string) => void;
	onCreateFolder?: (name: string) => void;
}) {
	const [currentFolderId, setCurrentFolderId] = useState<string>('all');
	const [showCreateFolder, setShowCreateFolder] = useState(false);
	const [newFolderName, setNewFolderName] = useState('');

	function handleCreateFolder() {
		if (newFolderName.trim() && onCreateFolder) {
			onCreateFolder(newFolderName.trim());
			setNewFolderName('');
			setShowCreateFolder(false);
		}
	}

	const filteredHistory = history.filter((item) => {
		if (currentFolderId === 'all') return true;
		if (currentFolderId === 'liked') return likedImageIds.includes(item.id);
		const folder = folders.find(f => f.id === currentFolderId);
		return folder ? folder.imageIds.includes(item.id) : true;
	});

	const hasContent = filteredHistory.length > 0 || Boolean(pending);

	return (
		<>
			<div className="studio-page-heading">
				<div>
					<p>MIS IMÁGENES</p>
					<h1>Todo lo que creaste.</h1>
					<span>Tocá una imagen para verla grande, descargarla o crear otra versión.</span>
				</div>
				<button className="studio-primary-button compact" onClick={onCreate} style={{ background: '#744bde' }}>
					<Icon name="plus" size={17}/>
					Crear imagen
				</button>
			</div>

			{/* Folders navigation bar */}
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px', alignItems: 'center', background: '#fcfbfe', padding: '10px 14px', borderRadius: '12px', border: '1px solid #eee9f3' }}>
				<button 
					onClick={() => setCurrentFolderId('all')} 
					style={{
						padding: '6px 12px', borderRadius: '8px', border: 0,
						background: currentFolderId === 'all' ? '#744bde' : '#f0eef4',
						color: currentFolderId === 'all' ? '#fff' : '#5b5561',
						fontSize: '13px', fontWeight: 700, cursor: 'pointer'
					}}
				>
					📁 Todas ({history.length})
				</button>
				<button 
					onClick={() => setCurrentFolderId('liked')} 
					style={{
						padding: '6px 12px', borderRadius: '8px', border: 0,
						background: currentFolderId === 'liked' ? '#ff4185' : '#f0eef4',
						color: currentFolderId === 'liked' ? '#fff' : '#5b5561',
						fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
					}}
				>
					❤️ Favoritas ({history.filter(h => likedImageIds.includes(h.id)).length})
				</button>

				{folders.map(folder => (
					<div key={folder.id} style={{ display: 'flex', alignItems: 'center', background: currentFolderId === folder.id ? '#744bde' : '#f0eef4', borderRadius: '8px', overflow: 'hidden' }}>
						<button 
							onClick={() => setCurrentFolderId(folder.id)}
							style={{
								padding: '6px 10px 6px 12px', border: 0,
								background: 'transparent',
								color: currentFolderId === folder.id ? '#fff' : '#5b5561',
								fontSize: '13px', fontWeight: 700, cursor: 'pointer'
							}}
						>
							📁 {folder.name} ({folder.imageIds.length})
						</button>
						<button 
							onClick={() => onRemoveFolder && onRemoveFolder(folder.id)}
							style={{
								padding: '6px 8px', border: 0, background: 'transparent',
								color: currentFolderId === folder.id ? 'rgba(255,255,255,0.7)' : '#8b8490',
								fontSize: '11px', cursor: 'pointer', borderLeft: '1px solid rgba(0,0,0,0.06)'
							}}
							title="Eliminar carpeta"
						>
							✕
						</button>
					</div>
				))}

				{showCreateFolder ? (
					<div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
						<input 
							value={newFolderName}
							onChange={(e) => setNewFolderName(e.target.value)}
							placeholder="Nombre..."
							style={{ height: '30px', padding: '0 8px', borderRadius: '6px', border: '1px solid #dcd5e4', fontSize: '12.5px', outline: 'none' }}
							onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
						/>
						<button onClick={handleCreateFolder} style={{ height: '30px', padding: '0 10px', borderRadius: '6px', border: 0, background: '#744bde', color: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>Crear</button>
						<button onClick={() => setShowCreateFolder(false)} style={{ height: '30px', padding: '0 8px', borderRadius: '6px', border: 0, background: '#f2eef6', color: '#4b4452', fontSize: '12px', cursor: 'pointer' }}>Cancelar</button>
					</div>
				) : (
					<button 
						onClick={() => setShowCreateFolder(true)} 
						style={{
							padding: '6px 12px', borderRadius: '8px', border: '1px dashed #744bde',
							background: 'transparent',
							color: '#744bde',
							fontSize: '13px', fontWeight: 700, cursor: 'pointer'
						}}
					>
						+ Nueva carpeta
					</button>
				)}
			</div>

			{hasContent ? (
				<div className="studio-history-grid">
					{pending && currentFolderId === 'all' && (
						Array.from({ length: pending.count }, (_, index) => (
							<PendingGenerationCard 
								key={`pending-${index}`} 
								title={pending.title} 
								referenceUrl={pending.referenceUrl} 
								startedAt={pending.startedAt} 
								onClick={onViewProgress} 
							/>
						))
					)}
					{filteredHistory.map((item) => (
						<GenerationCard 
							key={item.id} 
							item={item} 
							isLiked={likedImageIds.includes(item.id)} 
							onToggleLike={onToggleLike ? () => onToggleLike(item.id) : undefined} 
							folders={folders} 
							onToggleFolder={onToggleFolder ? (fid) => onToggleFolder(item.id, fid) : undefined} 
							onExpand={onExpand ? () => onExpand(item) : undefined} 
							onReuse={() => onReuse(item)}
						/>
					))}
				</div>
			) : (
				<div className="studio-empty large">
					<span>📁</span>
					<h3>Carpeta vacía</h3>
					<p>Asigná tus creaciones a esta carpeta usando el icono 📁 en cada imagen.</p>
				</div>
			)}
		</>
	);
}

// Tarjeta placeholder mientras una imagen se está generando en el servidor.
function PendingGenerationCard({ title, referenceUrl, startedAt, onClick }: { title: string; referenceUrl?: string; startedAt?: number; onClick?: () => void }) {
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		if (!startedAt) {
			setProgress(10);
			return;
		}
		const interval = setInterval(() => {
			const elapsedMs = Date.now() - startedAt;
			const estimatedDurationMs = 30000; // 30 seconds estimated
			const pct = Math.min(95, Math.round((elapsedMs / estimatedDurationMs) * 100));
			setProgress(pct);
		}, 300);
		return () => clearInterval(interval);
	}, [startedAt]);

	return (
		<article className="studio-generation-card" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
			<div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#f4f0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
				{referenceUrl && <img src={referenceUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, filter: 'blur(4px)' }} />}
				<div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
					<span className="studio-spinner" style={{ width: '30px', height: '30px' }} />
					<b style={{ fontSize: '13px', color: '#5c5568', letterSpacing: '.02em' }}>Creando tu anuncio…</b>
				</div>
			</div>
			<div style={{ padding: '13px 14px 14px' }}>
				<span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px', background: '#eceaef', color: '#744bde', fontSize: '11px', fontWeight: 800, letterSpacing: '.06em' }}>
					<span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#744bde', animation: 'pulse 1.4s ease-in-out infinite' }} />
					EN PROCESO
				</span>
				<h3 style={{ margin: '9px 0 0', fontSize: '15px', color: '#19171d', lineHeight: 1.3 }}>{title}</h3>
				
				{/* Simulated premium progress bar */}
				<div style={{ marginTop: '16px', background: '#eceaef', borderRadius: '999px', height: '6px', overflow: 'hidden', position: 'relative' }}>
					<div style={{
						background: 'linear-gradient(90deg, #744bde 0%, #ec4492 100%)',
						height: '100%',
						width: `${progress}%`,
						borderRadius: '999px',
						transition: 'width 0.3s ease-out'
					}} />
				</div>
				<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#716d79', marginTop: '6px', fontWeight: 600 }}>
					<span>Generando imagen...</span>
					<span>{progress}%</span>
				</div>

				{onClick && (
					<button onClick={(event) => { event.stopPropagation(); onClick(); }} style={{ marginTop: '12px', width: '100%', height: '38px', borderRadius: '10px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
						<Icon name="spark" size={14}/>Ver progreso en vivo
					</button>
				)}
			</div>
		</article>
	);
}

// Descarga sin abrir pestaña nueva (las URLs firmadas de Supabase son cross-origin
// y el atributo download solo no alcanza).
async function downloadImage(url: string, name: string) {
	try {
		const response = await fetch(url);
		const blob = await response.blob();
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = name;
		anchor.click();
		URL.revokeObjectURL(objectUrl);
	} catch {
		window.open(url, '_blank');
	}
}

function GenerationCard({ 
	item, 
	onReuse, 
	onExpand,
	isLiked,
	onToggleLike,
	folders = [],
	onToggleFolder
}: { 
	item: Generation; 
	onReuse?: () => void; 
	onExpand?: () => void;
	isLiked?: boolean;
	onToggleLike?: () => void;
	folders?: Array<{ id: string; name: string; imageIds: string[] }>;
	onToggleFolder?: (folderId: string) => void;
}) {
	const [showFolderDropdown, setShowFolderDropdown] = useState(false);

	useEffect(() => {
		if (!showFolderDropdown) return;
		const close = () => setShowFolderDropdown(false);
		window.addEventListener('click', close);
		return () => window.removeEventListener('click', close);
	}, [showFolderDropdown]);

	return (
		<article className="studio-generation-card">
			<div style={{ cursor: onExpand ? 'zoom-in' : 'default', position: 'relative' }} onClick={onExpand}>
				{onToggleLike && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onToggleLike();
						}}
						style={{
							position: 'absolute',
							top: '8px',
							left: '8px',
							zIndex: 10,
							border: 0,
							background: 'rgba(255,255,255,0.9)',
							color: isLiked ? '#ff4185' : '#716d79',
							borderRadius: '50%',
							width: '28px',
							height: '28px',
							display: 'grid',
							placeItems: 'center',
							cursor: 'pointer',
							boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
						}}
						title={isLiked ? "Quitar de favoritos" : "Añadir a favoritos"}
					>
						<Icon name="heart" size={13} fill={isLiked ? '#ff4185' : 'none'} />
					</button>
				)}

				{onToggleFolder && folders.length > 0 && (
					<div style={{ position: 'absolute', top: '8px', right: '40px', zIndex: 10 }}>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setShowFolderDropdown(!showFolderDropdown);
							}}
							style={{
								border: 0,
								background: 'rgba(255,255,255,0.9)',
								color: '#716d79',
								borderRadius: '50%',
								width: '28px',
								height: '28px',
								display: 'grid',
								placeItems: 'center',
								cursor: 'pointer',
								boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
							}}
							title="Organizar en carpeta"
						>
							📁
						</button>
						{showFolderDropdown && (
							<div 
								onClick={(e) => e.stopPropagation()}
								style={{
									position: 'absolute',
									top: '32px',
									right: 0,
									background: '#fff',
									border: '1px solid #e9e6ed',
									borderRadius: '8px',
									boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
									padding: '6px',
									minWidth: '150px',
									zIndex: 100
								}}
							>
								<p style={{ margin: '4px 6px 6px', fontSize: '11px', color: '#8b8490', fontWeight: 'bold' }}>CARPETAS:</p>
								{folders.map(f => {
									const inFolder = f.imageIds.includes(item.id);
									return (
										<label 
											key={f.id} 
											style={{
												display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px',
												borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: '#19171d',
												fontWeight: 500, userSelect: 'none'
											}}
										>
											<input 
												type="checkbox" 
												checked={inFolder} 
												onChange={() => onToggleFolder(f.id)} 
												style={{ cursor: 'pointer' }}
											/>
											<span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{f.name}</span>
										</label>
									);
								})}
							</div>
						)}
					</div>
				)}

				<img src={item.imageUrl} alt={item.title} loading="lazy"/>
				<a href={item.imageUrl} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void downloadImage(item.imageUrl, `creattia-${item.id}.png`); }} aria-label={`Descargar ${item.title}`}><Icon name="download" size={17}/></a>
			</div>
			<footer>
				<h3>{item.title}</h3>
				<span>{new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(new Date(item.createdAt))}</span>
				{(onExpand || onReuse) && <button onClick={onExpand || onReuse}><Icon name="history" size={14}/>Crear otra versión</button>}
			</footer>
		</article>
	);
}

// Lightbox: expande la imagen dentro de la app (nunca una página nueva) y
// permite pedir una nueva versión con una indicación directa.
function ImageLightbox({ item, session, onClose, onStarted, products }: {
	item: Generation;
	session: AppSession;
	onClose: () => void;
	onStarted: (batch: { batchId: string; title: string; referenceUrl?: string; count: number }) => void;
	products: Product[];
}) {
	const [revision, setRevision] = useState('');
	const [starting, setStarting] = useState(false);
	const [error, setError] = useState('');
	const [showReference, setShowReference] = useState(false);

	// Product overrides
	const originalProductId = item.productId || item.productIds?.[0] || '';
	const [selectedProductId, setSelectedProductId] = useState(originalProductId);
	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [uploadPreview, setUploadPreview] = useState('');
	const [manualProductName, setManualProductName] = useState('');
	const [manualProductFacts, setManualProductFacts] = useState('');

	// Auto-resize textarea
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto';
			textarea.style.height = `${textarea.scrollHeight}px`;
		}
	}, [revision]);

	async function requestRevision() {
		setStarting(true); setError('');
		try {
			const form = new FormData();
			form.set('templateId', String(item.templateId || 40));
			form.set('templateName', item.title);
			form.set('sourceGenerationId', item.id);
			form.set('variationStrength', revision.trim() ? 'exact' : 'light');
			form.set('imageType', item.imageType || 'promotion');
			form.set('format', item.format || '1:1');
			form.set('fidelity', '1');
			form.set('preset', 'Nueva versión');
			form.set('count', '1');
			form.set('brief', revision.trim());
			
			// Handle product override
			if (selectedProductId === 'upload') {
				if (uploadFile) {
					form.append('product', uploadFile);
				} else {
					throw new Error('Por favor, selecciona una foto de producto.');
				}
			} else if (selectedProductId === 'manual') {
				if (!manualProductName.trim()) {
					throw new Error('Por favor, ingresa el nombre de tu producto o servicio.');
				}
				form.set('productName', manualProductName.trim());
				form.set('productFacts', manualProductFacts.trim());
			} else if (selectedProductId) {
				form.append('productIds', selectedProductId);
			}

			const response = await fetch('/api/creativos/generate', { method: 'POST', headers: { authorization: `Bearer ${getSessionToken(session)}` }, body: form });
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la nueva versión.');
			if (payload.async && payload.batchId) {
				onStarted({ batchId: payload.batchId, title: item.title, referenceUrl: item.imageUrl, count: 1 });
				onClose();
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la nueva versión.');
		} finally { setStarting(false); }
	}

	return (
		<div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(12,10,16,0.78)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: '24px' }}>
			<div className="studio-lightbox-panel" onClick={(event) => event.stopPropagation()} style={{ display: 'flex', gap: '22px', alignItems: 'stretch', maxWidth: '1100px', width: '100%', maxHeight: '90vh' }}>
				<div style={{ flex: '1 1 auto', display: 'grid', placeItems: 'center', minWidth: 0, position: 'relative' }}>
					<img src={showReference && item.referenceUrl ? item.referenceUrl : item.imageUrl} alt={item.title} style={{ maxWidth: '100%', maxHeight: '86vh', borderRadius: '14px', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }} />
					{showReference && (
						<button onClick={() => setShowReference(false)} style={{ position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)', padding: '9px 18px', borderRadius: '999px', border: 0, background: 'rgba(12,10,16,0.85)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', backdropFilter: 'blur(6px)' }}>
							Viendo el anuncio ganador — Volver a tu imagen
						</button>
					)}
				</div>
				<aside style={{ flex: '0 0 350px', background: '#fff', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
						<div>
							<h3 style={{ margin: 0, fontSize: '17px', color: '#19171d' }}>{item.title}</h3>
							<p style={{ margin: '4px 0 0', fontSize: '12px', color: '#8b8490' }}>{new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long' }).format(new Date(item.createdAt))}</p>
						</div>
						<button onClick={onClose} aria-label="Cerrar" style={{ border: 0, background: '#f2eef6', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', color: '#4b4452', fontSize: '15px' }}>✕</button>
					</div>
					<button onClick={() => void downloadImage(item.imageUrl, `creattia-${item.id}.png`)} style={{ width: '100%', height: '46px', borderRadius: '11px', border: 0, background: '#19171d', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>Descargar imagen</button>
					{item.referenceUrl && (
						<button onClick={() => setShowReference(!showReference)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: showReference ? '#eceaef' : '#f8f6fb', border: showReference ? '1px solid #cfc9d8' : '1px solid transparent', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}>
							<img src={item.referenceUrl} alt="Anuncio ganador usado" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px' }} />
							<div>
								<strong style={{ display: 'block', fontSize: '12px', color: '#19171d' }}>Anuncio ganador usado</strong>
								<span style={{ fontSize: '11.5px', color: '#8b8490' }}>{showReference ? 'Tocá para volver a tu imagen.' : 'Tocá para verlo grande.'}</span>
							</div>
						</button>
					)}
					<div style={{ borderTop: '1px solid #eee9f2', paddingTop: '14px' }}>
						<strong style={{ display: 'block', fontSize: '14px', color: '#19171d', marginBottom: '8px' }}>Crear otra versión</strong>
						<p style={{ margin: '0 0 10px', fontSize: '12.5px', color: '#8b8490', lineHeight: 1.5 }}>Contale a la IA qué cambiar. Si lo dejás vacío genera una variante manteniendo el diseño.</p>
						
						{/* Product/Service Switcher */}
						<div style={{ marginBottom: '12px' }}>
							<label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#716d79', marginBottom: '6px' }}>
								🛍️ CAMBIAR PRODUCTO O FOTO (OPCIONAL):
							</label>
							<select
								value={selectedProductId}
								onChange={(e) => {
									setSelectedProductId(e.target.value);
									setUploadFile(null);
									setUploadPreview('');
									setManualProductName('');
									setManualProductFacts('');
								}}
								style={{ width: '100%', height: '38px', borderRadius: '8px', border: '1px solid #dcd5e4', padding: '0 8px', fontSize: '13px', marginBottom: '8px', fontFamily: 'inherit', background: '#fff', color: '#19171d' }}
							>
								<option value="">-- Sin producto (Solo texto) --</option>
								{products.map(p => (
									<option key={p.id} value={p.id}>{p.name} {p.id === originalProductId ? '(Original)' : ''}</option>
								))}
								<option value="upload">-- Subir nueva foto de producto --</option>
								<option value="manual">-- Describir manualmente --</option>
							</select>

							{selectedProductId === 'upload' && (
								<div style={{ margin: '8px 0' }}>
									<label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #dcd5e4', background: '#fcfbfe', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', color: '#744bde' }}>
										{uploadFile ? `Foto: ${uploadFile.name.slice(0, 16)}` : '📸 Seleccionar foto de producto'}
										<input 
											type="file" 
											accept="image/png,image/jpeg,image/webp" 
											style={{ display: 'none' }} 
											onChange={(event) => {
												const file = event.target.files?.[0] || null;
												setUploadFile(file);
												if (file) setUploadPreview(URL.createObjectURL(file));
											}} 
										/>
									</label>
									{uploadPreview && (
										<img src={uploadPreview} alt="Vista previa" style={{ marginTop: '8px', display: 'block', width: '84px', height: '84px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2dde9' }} />
									)}
								</div>
							)}

							{selectedProductId === 'manual' && (
								<div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0' }}>
									<input
										value={manualProductName}
										onChange={(e) => setManualProductName(e.target.value)}
										placeholder="Nombre del servicio o producto..."
										style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2dde9', fontSize: '13px' }}
									/>
									<textarea
										value={manualProductFacts}
										onChange={(e) => setManualProductFacts(e.target.value)}
										placeholder="Descripción, beneficios clave..."
										rows={2}
										style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2dde9', fontSize: '12.5px', resize: 'vertical', fontFamily: 'inherit' }}
									/>
								</div>
							)}
						</div>

						<textarea
							ref={textareaRef}
							value={revision}
							onChange={(event) => setRevision(event.target.value)}
							placeholder="Ej: usá fondo azul, agrandá el titular, agregá el precio $99…"
							style={{ width: '100%', minHeight: '90px', padding: '11px 12px', borderRadius: '10px', border: '1px solid #dcd5e4', fontSize: '14px', resize: 'none', fontFamily: 'inherit', overflowY: 'hidden', boxSizing: 'border-box' }}
						/>
						{error && <p style={{ margin: '10px 0 0', fontSize: '12.5px', color: '#a43f3f' }}>{error}</p>}
						<button
							onClick={() => void requestRevision()}
							disabled={starting}
							style={{ width: '100%', height: '46px', marginTop: '10px', borderRadius: '11px', border: 0, background: '#19171d', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', opacity: starting ? 0.6 : 1 }}
						>
							{starting ? 'Iniciando…' : 'Generar nueva versión'}
						</button>
					</div>
				</aside>
			</div>
		</div>
	);
}

function BuyCreditsSection({ session }: { session: AppSession }) {
	const [config, setConfig] = useState<any>(null);
	const [buying, setBuying] = useState<number | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		let active = true;
		fetch('/api/creativos/buy-credits', {
			headers: { authorization: `Bearer ${getSessionToken(session)}` }
		})
		.then(r => r.json())
		.then(data => {
			if (active) setConfig(data);
		})
		.catch(() => null);
		return () => { active = false; };
	}, [session]);

	async function buy(quantity: number) {
		setBuying(quantity); setError('');
		try {
			const response = await fetch('/api/creativos/buy-credits', {
				method: 'POST',
				headers: { 
					authorization: `Bearer ${getSessionToken(session)}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ quantity })
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la compra.');
			window.location.href = payload.checkoutUrl;
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Error al conectar con Mercado Pago.');
			setBuying(null);
		}
	}

	if (!config || !config.configured) return null;

	const symbol = config.currency === 'USD' ? 'u$s' : '$';

	return (
		<div id="buy-credits-section" style={{ marginTop: '36px', padding: '24px', background: '#f5f2f9', border: '1px solid #e2dee8', borderRadius: '16px' }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
				<span style={{ fontSize: '20px' }}>⚡</span>
				<h2 style={{ margin: 0, fontSize: '18px', color: '#19171d' }}>Pago único (Sin suscripción)</h2>
			</div>
			<p style={{ margin: '0 0 16px', fontSize: '13.5px', color: '#716d79', lineHeight: 1.5 }}>
				¿Querés probar una imagen rápida o no querés una membresía mensual? Comprá créditos individuales y usalos cuando quieras. 
				<strong> El precio unitario es de {symbol}{config.unitPrice} {config.currency}</strong> (el doble de lo que sale en la suscripción, ¡ideal para empezar!).
			</p>
			
			{error && <p style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 12px', fontWeight: 600 }}>{error}</p>}

			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
				{config.packs.map((qty: number) => (
					<div 
						key={qty} 
						style={{ 
							background: '#fff', 
							border: '1px solid #e9e6ed', 
							borderRadius: '12px', 
							padding: '16px', 
							display: 'flex', 
							flexDirection: 'column', 
							alignItems: 'center',
							boxShadow: '0 4px 12px rgba(25, 23, 29, 0.03)'
						}}
					>
						<strong style={{ fontSize: '18px', color: '#19171d', marginBottom: '4px' }}>
							{qty} {qty === 1 ? 'Imagen' : 'Imágenes'}
						</strong>
						<span style={{ fontSize: '12px', color: '#716d79', marginBottom: '12px' }}>
							{qty === 1 ? '1 crédito' : `${qty} créditos`}
						</span>
						<div style={{ fontSize: '22px', fontWeight: 800, color: '#744bde', marginBottom: '16px' }}>
							{symbol}{config.unitPrice * qty}
						</div>
						<button 
							onClick={() => void buy(qty)}
							disabled={buying !== null}
							style={{ 
								width: '100%', 
								height: '38px', 
								borderRadius: '8px', 
								border: 0, 
								background: '#744bde', 
								color: '#fff', 
								fontWeight: 700, 
								fontSize: '13px', 
								cursor: 'pointer',
								opacity: buying === qty ? 0.6 : 1
							}}
						>
							{buying === qty ? 'Abriendo Mercado Pago...' : 'Comprar ahora'}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}

function Plans({ profile, session }: { profile: AppProfile; session: AppSession }) {
	const [billing, setBilling] = useState('');
	const [cancelling, setCancelling] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

	async function subscribe(planCode: string) {
		if (!isSupabaseConfigured || !supabase) { setError('Para activar pagos faltan las credenciales de Supabase y Mercado Pago.'); return; }
		if (['authorized', 'pending', 'paused'].includes(profile.subscriptionStatus)) {
			setError('Primero cancelá la renovación actual. Después vas a poder elegir otro plan sin riesgo de duplicar el cobro.');
			return;
		}
		setBilling(planCode); setError('');
		try {
			const response = await fetch('/api/creativos/subscribe', {
				method: 'POST',
				headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
				body: JSON.stringify({ planCode, billingCycle }),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la suscripción.');
			window.location.href = payload.checkoutUrl;
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el pago.'); setBilling(''); }
	}

	async function cancelSubscription() {
		if (!window.confirm('¿Cancelar la renovación? Conservás tus créditos actuales, pero no se renovarán el próximo período.')) return;
		setCancelling(true); setError(''); setNotice('');
		try {
			const response = await fetch('/api/creativos/subscribe', {
				method: 'DELETE',
				headers: { authorization: `Bearer ${getSessionToken(session)}` },
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo cancelar la suscripción.');
			setNotice('Renovación cancelada. Tus créditos actuales siguen disponibles.');
			window.setTimeout(() => window.location.reload(), 700);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo cancelar la suscripción.');
			setCancelling(false);
		}
	}

	return <><div className="studio-page-heading"><div><p>PLANES</p><h1>Elegí cuántas imágenes querés crear.</h1><span>Todos los planes incluyen las mismas herramientas. Solo cambia la cantidad mensual.</span></div></div>
		<div className="studio-current-credits"><span><Icon name="spark"/></span><p><small>TU SALDO ACTUAL</small><strong>{profile.credits} {profile.credits === 1 ? 'generación disponible' : 'generaciones disponibles'}</strong></p><em>{planLabel(profile)}</em></div>
		
		{/* Toggle Facturación Mensual / Anual */}
		<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '28px', marginTop: '16px' }}>
			<span style={{ fontSize: '14px', fontWeight: billingCycle === 'monthly' ? 700 : 500, color: billingCycle === 'monthly' ? '#744bde' : '#716d79' }}>Mensual</span>
			<button 
				type="button" 
				onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')} 
				style={{
					width: '50px',
					height: '26px',
					borderRadius: '999px',
					background: '#744bde',
					border: 0,
					cursor: 'pointer',
					position: 'relative',
					padding: '2px'
				}}
			>
				<span style={{
					display: 'block',
					width: '22px',
					height: '22px',
					borderRadius: '50%',
					background: '#fff',
					transition: 'transform 0.2s',
					transform: billingCycle === 'yearly' ? 'translateX(24px)' : 'translateX(0)'
				}} />
			</button>
			<span style={{ fontSize: '14px', fontWeight: billingCycle === 'yearly' ? 700 : 500, color: billingCycle === 'yearly' ? '#744bde' : '#716d79', display: 'flex', alignItems: 'center', gap: '6px' }}>
				Anual <span style={{ background: '#e8f9f0', color: '#1e7e4a', fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '999px' }}>Ahorrá 20%</span>
			</span>
		</div>

		{error && <p className="studio-form-error">{error}</p>}
		{notice && <p className="studio-form-notice">{notice}</p>}
		<div className="studio-plans-grid">{subscriptionPlans.map((plan) => { 
			const isFreePlan = plan.code === 'free';
			const currentPlan = isFreePlan 
				? (!profile.planCode || profile.planCode === 'trial' || profile.planCode === 'free') && !['authorized', 'pending', 'paused'].includes(profile.subscriptionStatus)
				: ['authorized', 'pending', 'paused'].includes(profile.subscriptionStatus) && profile.planCode === plan.code; 
			const price = isFreePlan ? 0 : (billingCycle === 'monthly' ? plan.price : Math.round(plan.price * 0.8));
			const frequencyText = isFreePlan ? '' : (billingCycle === 'monthly' ? '/mes' : '/mes (anual)');
			const savingLabel = isFreePlan ? '' : (billingCycle === 'yearly' ? plan.saving : '');

			const handleButtonClick = () => {
				if (isFreePlan) {
					const el = document.getElementById('buy-credits-section');
					if (el) el.scrollIntoView({ behavior: 'smooth' });
				} else {
					subscribe(plan.code);
				}
			};

			return <article key={plan.code} className={plan.featured ? 'featured' : ''}>{plan.featured && <span className="most-popular-badge">MOST POPULAR</span>}<h3>{plan.name}</h3><small className="plan-description">{plan.description}</small><div className="plan-price-row">{plan.oldPrice && <span className="plan-old-price">${plan.oldPrice}</span>}<span className="plan-price-val"><b>$</b>{price}</span><span className="plan-price-freq">{frequencyText}</span>{savingLabel && <span className="plan-save-badge">{savingLabel}</span>}</div><button className="plan-subscribe-btn" style={{ background: plan.featured ? 'linear-gradient(104deg, rgb(62, 134, 198) 0%, rgb(166, 102, 170) 22%, rgb(236, 68, 146) 50%, rgb(238, 68, 84) 76%, rgb(240, 84, 39) 100%)' : '#744bde' }} onClick={handleButtonClick} disabled={Boolean(billing) || currentPlan}>{currentPlan ? (isFreePlan ? 'Plan actual' : (profile.subscriptionStatus === 'authorized' ? 'Plan actual' : planLabel(profile))) : (isFreePlan ? 'Pagar por imagen' : (billing === plan.code ? 'Abriendo pago…' : `Elegir ${plan.name}`))}</button><ul>{plan.features.map((f, i) => <li key={i} className={f.active ? 'active-feature' : 'inactive-feature'}>{f.active ? <Icon name="check" size={14}/> : <Icon name="close" size={14}/>}{f.name}</li>)}</ul></article>; 
		})}</div>
		<p className="studio-plan-note">Los créditos se renuevan cada mes. Podés cambiar o cancelar tu plan desde tu cuenta.</p>
		{['authorized', 'pending', 'paused'].includes(profile.subscriptionStatus) && <button className="studio-cancel-subscription" onClick={() => void cancelSubscription()} disabled={cancelling}>{cancelling ? 'Cancelando…' : 'Cancelar renovación'}</button>}
		
		<BuyCreditsSection session={session} />
	</>;
}

// Escáner de marcas: pegás la URL principal y la IA completa todo
// (colores, tipografía, voz, botones, logo). Límite de marcas según plan.
function BrandsManager({ session, planCode, onPlans }: { session: AppSession; planCode: string; onPlans: () => void }) {
	const [brands, setBrands] = useState<any[]>([]);
	const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
	const [limit, setLimit] = useState(1);
	const [url, setUrl] = useState('');
	const [scanning, setScanning] = useState(false);
	const [error, setError] = useState('');
	const [loaded, setLoaded] = useState(false);
	const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);

	const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
	const [editName, setEditName] = useState('');
	const [editStyleSummary, setEditStyleSummary] = useState('');
	const [editPersonality, setEditPersonality] = useState('');
	const [editVoice, setEditVoice] = useState('');
	const [editButtonStyle, setEditButtonStyle] = useState('');
	const [editColors, setEditColors] = useState<string[]>([]);
	const [newColorInput, setNewColorInput] = useState('#744bde');
	const [savingBrandId, setSavingBrandId] = useState<string | null>(null);

	function startEditing(brand: any) {
		setEditingBrandId(brand.id);
		setEditName(brand.name || '');
		setEditStyleSummary(brand.brand_style?.styleSummary || '');
		setEditPersonality(brand.brand_style?.brandPersonality || '');
		setEditVoice(brand.brand_style?.brandVoice || '');
		setEditButtonStyle(brand.brand_style?.buttonStyle || '');
		setEditColors(brand.brand_colors || []);
	}

	async function saveBrand(brandId: string) {
		setSavingBrandId(brandId);
		try {
			const response = await fetch('/api/creativos/brands', {
				method: 'PATCH',
				headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
				body: JSON.stringify({
					action: 'update',
					brandId,
					name: editName,
					brand_colors: editColors,
					brand_style: {
						styleSummary: editStyleSummary,
						brandPersonality: editPersonality,
						brandVoice: editVoice,
						buttonStyle: editButtonStyle,
					}
				})
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la marca.');
			
			setBrands(brands.map((b) => b.id === brandId ? { 
				...b, 
				name: editName, 
				brand_colors: editColors,
				brand_style: {
					...b.brand_style,
					styleSummary: editStyleSummary,
					brandPersonality: editPersonality,
					brandVoice: editVoice,
					buttonStyle: editButtonStyle,
				}
			} : b));
			setEditingBrandId(null);
			if (brandId === activeBrandId) {
				window.location.reload();
			}
		} catch (cause) {
			alert(cause instanceof Error ? cause.message : 'Error al guardar la marca.');
		} finally {
			setSavingBrandId(null);
		}
	}

	useEffect(() => {
		let active = true;
		(async () => {
			try {
				const response = await fetch('/api/creativos/brands', { headers: { authorization: `Bearer ${getSessionToken(session)}` } });
				const payload = await response.json();
				if (!active || !response.ok) return;
				setBrands(payload.brands || []);
				setActiveBrandId(payload.activeBrandId);
				setLimit(payload.limit || 1);
			} catch { /* red caída: la vista queda vacía */ }
			finally { if (active) setLoaded(true); }
		})();
		return () => { active = false; };
	}, [session]);

	async function scan() {
		if (!url.trim()) return;
		setScanning(true); setError('');
		try {
			const response = await fetch('/api/creativos/brands', {
				method: 'POST',
				headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
				body: JSON.stringify({ url: url.trim() }),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo analizar la marca.');
			setBrands((previous) => [...previous, payload.brand]);
			if (!activeBrandId) setActiveBrandId(payload.brand.id);
			setUrl('');
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo analizar la marca.');
		} finally { setScanning(false); }
	}

	async function activate(brandId: string) {
		setActiveBrandId(brandId);
		await fetch('/api/creativos/brands', {
			method: 'PATCH',
			headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
			body: JSON.stringify({ brandId }),
		}).catch(() => null);
	}

	async function remove(brandId: string) {
		setBrands((previous) => previous.filter((brand) => brand.id !== brandId));
		if (activeBrandId === brandId) setActiveBrandId(null);
		await fetch(`/api/creativos/brands?id=${encodeURIComponent(brandId)}`, {
			method: 'DELETE',
			headers: { authorization: `Bearer ${getSessionToken(session)}` },
		}).catch(() => null);
	}

	return (
		<section style={{ background: '#fff', border: '1px solid #e5e1e8', borderRadius: '16px', padding: '24px' }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
				<h2 style={{ margin: 0, fontSize: '18px', color: '#744bde' }}>Tus negocios</h2>
				<span style={{ fontSize: '13px', color: '#716d79' }}>
					{brands.length}/{limit} {limit === 1 ? 'marca' : 'marcas'} del plan
					{brands.length >= limit && <button onClick={onPlans} style={{ marginLeft: '8px', border: 0, background: 'transparent', color: '#744bde', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline', fontSize: '13px' }}>Mejorar plan</button>}
				</span>
			</div>
			<p style={{ margin: '0 0 16px', fontSize: '13.5px', color: '#716d79', lineHeight: 1.5 }}>
				Pegá la URL principal de tu negocio y la IA analiza todo sola: diseño, colores, tipografía, cómo habla la marca, estilo de botones y logo.
			</p>

			<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
				<input
					value={url}
					onChange={(event) => setUrl(event.target.value)}
					placeholder="https://tunegocio.com"
					style={{ flex: '1 1 280px', padding: '11px 14px', borderRadius: '10px', border: '1px solid #e2dde9', fontSize: '14px' }}
				/>
				<button
					onClick={() => void scan()}
					disabled={scanning || !url.trim() || brands.length >= limit}
					style={{ padding: '0 20px', height: '44px', borderRadius: '10px', border: 0, background: '#744bde', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', opacity: scanning || brands.length >= limit ? 0.55 : 1 }}
				>
					{scanning ? 'Analizando tu negocio…' : 'Analizar con IA'}
				</button>
			</div>
			{error && <p style={{ margin: '0 0 14px', padding: '11px 13px', background: '#fff0f0', border: '1px solid #f5dcdc', borderRadius: '10px', color: '#a43f3f', fontSize: '13px' }}>{error}</p>}

			{!loaded ? (
				<div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><span className="studio-spinner" style={{ width: '22px', height: '22px' }} /></div>
			) : brands.length === 0 ? (
				<p style={{ margin: 0, fontSize: '13px', color: '#8b8490' }}>Todavía no agregaste ningún negocio.</p>
			) : (
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px' }}>
					{brands.map((brand) => {
						const isActive = brand.id === activeBrandId;
						const style = brand.brand_style || {};
						const isExpanded = expandedBrandId === brand.id;
						return (
							<article key={brand.id} style={{ position: 'relative', border: isActive ? '2px solid #744bde' : '1px solid #e5e1e8', borderRadius: '14px', padding: '16px', background: isActive ? '#faf9fb' : '#fff' }}>
								<button onClick={() => void remove(brand.id)} aria-label="Eliminar marca" style={{ position: 'absolute', top: '10px', right: '10px', width: '22px', height: '22px', border: 0, borderRadius: '50%', background: 'transparent', color: '#b0a8b8', fontSize: '15px', cursor: 'pointer' }}>×</button>
								<div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
									{brand.logoUrl
										? <img src={brand.logoUrl} alt="" style={{ width: '44px', height: '44px', objectFit: 'contain', borderRadius: '10px', background: '#f4f2f6', padding: '4px' }} />
										: <span style={{ width: '44px', height: '44px', display: 'grid', placeItems: 'center', borderRadius: '10px', background: '#f4f2f6', fontWeight: 800, color: '#744bde' }}>{(brand.name || '?').slice(0, 1).toUpperCase()}</span>}
									<div style={{ minWidth: 0, flex: 1 }}>
										{editingBrandId === brand.id ? (
											<input
												value={editName}
												onChange={(e) => setEditName(e.target.value)}
												style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: '6px', border: '1px solid #e5e1e8', fontSize: '13px', fontWeight: 700 }}
											/>
										) : (
											<>
												<strong style={{ display: 'block', fontSize: '15px', color: '#19171d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</strong>
												<span style={{ fontSize: '12px', color: '#8b8490' }}>{String(brand.website_url || '').replace(/^https?:[/][/]/, '').replace(/[/]$/, '')}</span>
											</>
										)}
									</div>
								</div>
								<div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
									{(brand.brand_colors || []).slice(0, 5).map((color: string) => (
										<span key={color} title={color} style={{ width: '18px', height: '18px', borderRadius: '50%', background: color, border: '1px solid rgba(0,0,0,0.08)' }} />
									))}
									{style.typography?.headings && <span style={{ marginLeft: '6px', fontSize: '12px', color: '#716d79' }}>{style.typography.headings}{style.typography.body ? ` · ${style.typography.body}` : ''}</span>}
								</div>
								
								{style.brandVoice && <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: '#716d79', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{style.brandVoice}</p>}
								
								<div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
									<button 
										onClick={() => {
											setExpandedBrandId(isExpanded ? null : brand.id);
											if (isExpanded && editingBrandId === brand.id) {
												setEditingBrandId(null);
											}
										}}
										style={{
											background: 'transparent',
											border: 0,
											color: '#744bde',
											fontSize: '12.5px',
											fontWeight: 700,
											cursor: 'pointer',
											display: 'flex',
											alignItems: 'center',
											gap: '4px',
											marginTop: '10px',
											marginBottom: '12px',
											padding: '4px 0'
										}}
									>
										{isExpanded ? 'Ocultar detalles ▲' : 'Ver detalles de diseño ▼'}
									</button>

									{isExpanded && (
										editingBrandId === brand.id ? (
											<div style={{ display: 'flex', gap: '6px', marginTop: '10px', marginBottom: '12px' }}>
												<button
													type="button"
													onClick={() => void saveBrand(brand.id)}
													disabled={savingBrandId === brand.id}
													style={{ padding: '4px 10px', borderRadius: '6px', border: 0, background: '#744bde', color: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
												>
													{savingBrandId === brand.id ? 'Guardando...' : 'Guardar'}
												</button>
												<button
													type="button"
													onClick={() => setEditingBrandId(null)}
													style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #dcd5e4', background: '#fff', color: '#716d79', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
												>
													Cancelar
												</button>
											</div>
										) : (
											<button
												type="button"
												onClick={() => startEditing(brand)}
												style={{
													background: 'transparent',
													border: 0,
													color: '#716d79',
													fontSize: '12.5px',
													fontWeight: 700,
													cursor: 'pointer',
													display: 'flex',
													alignItems: 'center',
													gap: '4px',
													marginTop: '10px',
													marginBottom: '12px',
													padding: '4px 0'
												}}
											>
												✏️ Editar detalles
											</button>
										)
									)}
								</div>

								{isExpanded && (
									<div style={{
										marginTop: '4px',
										marginBottom: '14px',
										padding: '12px',
										background: '#fcfbfe',
										border: '1px dashed #dcd2ff',
										borderRadius: '10px',
										fontSize: '12.5px',
										color: '#5b5561',
										display: 'flex',
										flexDirection: 'column',
										gap: '10px'
									}}>
										<div>
											<strong style={{ color: '#744bde', display: 'block', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.03em' }}>✨ Estilo General</strong>
											<p style={{ margin: 0, lineHeight: 1.5 }}>{style.styleSummary || 'No especificado'}</p>
										</div>
										<div>
											<strong style={{ color: '#744bde', display: 'block', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.03em' }}>🧠 Personalidad</strong>
											<p style={{ margin: 0, lineHeight: 1.5 }}>{style.brandPersonality || 'No especificado'}</p>
										</div>
										<div>
											<strong style={{ color: '#744bde', display: 'block', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.03em' }}>🗣️ Voz y Tono</strong>
											<p style={{ margin: 0, lineHeight: 1.5 }}>{style.brandVoice || 'No especificado'}</p>
										</div>
										<div>
											<strong style={{ color: '#744bde', display: 'block', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.03em' }}>🖱️ Estilo de Botones</strong>
											<p style={{ margin: 0, lineHeight: 1.5 }}>{style.buttonStyle || 'No especificado'}</p>
										</div>
										<div>
											<strong style={{ color: '#744bde', display: 'block', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.03em' }}>🎨 Paleta de colores</strong>
											<div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
												{(brand.brand_colors || []).map((color: string, idx: number) => (
													<span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #e5e1e8', padding: '2px 6px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
														<span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
														{color}
													</span>
												))}
											</div>
										</div>
									</div>
								)}

								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
									{isActive
										? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#128a51' }}>● Marca activa</span>
										: <button onClick={() => void activate(brand.id)} style={{ padding: '8px 14px', borderRadius: '9px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>Usar esta marca</button>}
								</div>
							</article>
						);
					})}
				</div>
			)}

			{/* Modal overlay for fullscreen premium editing */}
			{editingBrandId !== null && (() => {
				const brandToEdit = brands.find(b => b.id === editingBrandId);
				if (!brandToEdit) return null;
				return (
					<div onClick={() => setEditingBrandId(null)} style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(12,10,16,0.7)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: '24px' }}>
						<div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '24px', maxWidth: '700px', width: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
							<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee9f2', paddingBottom: '14px' }}>
								<h3 style={{ margin: 0, fontSize: '18px', color: '#19171d', fontWeight: 800 }}>Editar detalles de diseño: {brandToEdit.name}</h3>
								<button onClick={() => setEditingBrandId(null)} style={{ border: 0, background: '#f2eef6', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', color: '#4b4452', fontSize: '15px' }}>✕</button>
							</div>

							<div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
								<div>
									<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#716d79', marginBottom: '6px' }}>Nombre del negocio:</label>
									<input
										value={editName}
										onChange={(e) => setEditName(e.target.value)}
										style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '14px', fontWeight: 600 }}
									/>
								</div>

								<div>
									<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>✨ ESTILO GENERAL:</label>
									<textarea
										value={editStyleSummary}
										onChange={(e) => setEditStyleSummary(e.target.value)}
										rows={4}
										style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
									/>
								</div>

								<div>
									<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>🧠 PERSONALIDAD:</label>
									<textarea
										value={editPersonality}
										onChange={(e) => setEditPersonality(e.target.value)}
										rows={4}
										style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
									/>
								</div>

								<div>
									<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>🗣️ VOZ Y TONO:</label>
									<textarea
										value={editVoice}
										onChange={(e) => setEditVoice(e.target.value)}
										rows={4}
										style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
									/>
								</div>

								<div>
									<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>🖱️ ESTILO DE BOTONES:</label>
									<input
										value={editButtonStyle}
										onChange={(e) => setEditButtonStyle(e.target.value)}
										placeholder="Ej: Bordes redondeados con sombra..."
										style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e1e8', fontSize: '13.5px' }}
									/>
								</div>

								<div>
									<label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#744bde', marginBottom: '6px' }}>🎨 PALETA DE COLORES:</label>
									<div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
										{editColors.map((color, idx) => (
											<span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f5f2f9', border: '1px solid #e5e1e8', padding: '4px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
												<span style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }} />
												{color}
												<button
													type="button"
													onClick={() => setEditColors(editColors.filter((_, i) => i !== idx))}
													style={{ border: 0, background: 'transparent', color: '#a43f3f', fontSize: '14px', cursor: 'pointer', padding: '0 2px', marginLeft: '4px' }}
												>
													×
												</button>
											</span>
										))}
									</div>
									<div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
										<input
											type="color"
											value={newColorInput}
											onChange={(e) => setNewColorInput(e.target.value)}
											style={{ width: '40px', height: '36px', padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}
										/>
										<button
											type="button"
											onClick={() => {
												if (newColorInput && !editColors.includes(newColorInput)) {
													setEditColors([...editColors, newColorInput]);
												}
											}}
											style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #dcd5e4', background: '#fff', color: '#744bde', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
										>
											+ Agregar color
										</button>
									</div>
								</div>
							</div>

							<div style={{ display: 'flex', gap: '12px', marginTop: '14px', borderTop: '1px solid #eee9f2', paddingTop: '16px' }}>
								<button
									type="button"
									onClick={() => void saveBrand(brandToEdit.id)}
									disabled={savingBrandId === brandToEdit.id}
									style={{ flex: 1, height: '46px', borderRadius: '10px', border: 0, background: '#744bde', color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer', opacity: savingBrandId === brandToEdit.id ? 0.6 : 1 }}
								>
									{savingBrandId === brandToEdit.id ? 'Guardando cambios...' : 'Guardar todo'}
								</button>
								<button
									type="button"
									onClick={() => setEditingBrandId(null)}
									style={{ height: '46px', padding: '0 20px', borderRadius: '10px', border: '1px solid #dcd5e4', background: '#fff', color: '#716d79', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
								>
									Cancelar
								</button>
							</div>
						</div>
					</div>
				);
			})()}
		</section>
	);
}

function SavedAds({ 
	history, 
	likedImageIds, 
	toggleLike, 
	folders, 
	toggleFolder, 
	scrapedWinners, 
	likedScrapedPaths, 
	toggleLikedScraped, 
	onUseScrapedWinner,
	onExpand,
	onReuse
}: { 
	history: Generation[]; 
	likedImageIds: string[]; 
	toggleLike: (id: string) => void;
	folders: any[];
	toggleFolder: (imgId: string, folderId: string) => void;
	scrapedWinners: any[]; 
	likedScrapedPaths: Set<string>; 
	toggleLikedScraped: (path: string) => void; 
	onUseScrapedWinner: (path: string) => void;
	onExpand?: (item: Generation) => void;
	onReuse?: (item: Generation) => void;
}) {
	const likedGenerations = history.filter(item => likedImageIds.includes(item.id));
	const likedScrapedItems = scrapedWinners.filter(winner => likedScrapedPaths.has(winner.imagePath));
	const hasContent = likedGenerations.length > 0 || likedScrapedItems.length > 0;

	return (
		<>
			<div className="studio-page-heading">
				<div>
					<p>GUARDADOS</p>
					<h1>Tus anuncios guardados.</h1>
					<span>Ideas y creaciones que marcaste como favoritas.</span>
				</div>
			</div>

			{hasContent ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
					{likedGenerations.length > 0 && (
						<div>
							<h2 style={{ fontSize: '18px', fontWeight: 800, color: '#744bde', marginBottom: '14px' }}>Tus creaciones favoritas</h2>
							<div className="studio-history-grid">
								{likedGenerations.map((item) => (
									<GenerationCard 
										key={item.id} 
										item={item} 
										isLiked={true} 
										onToggleLike={() => toggleLike(item.id)} 
										folders={folders} 
										onToggleFolder={(fid) => toggleFolder(item.id, fid)} 
										onExpand={onExpand ? () => onExpand(item) : undefined} 
										onReuse={onReuse ? () => onReuse(item) : undefined} 
									/>
								))}
							</div>
						</div>
					)}

					{likedScrapedItems.length > 0 && (
						<div>
							<h2 style={{ fontSize: '18px', fontWeight: 800, color: '#744bde', marginBottom: '14px' }}>Ideas de la biblioteca guardadas</h2>
							<div className="studio-history-grid">
								{likedScrapedItems.map((winner, idx) => {
									const supabaseUrl = 'https://czocbnyoenjbpxmcqobn.supabase.co/storage/v1/object/public/creative-references/';
									const imageUrl = winner.imagePath?.startsWith('http') ? winner.imagePath : supabaseUrl + winner.imagePath;
									return (
										<article
											className="studio-generation-card"
											key={winner.imagePath || idx}
											style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer', border: '1px solid #e9e6ed', borderRadius: '14px', overflow: 'hidden' }}
											onClick={() => onUseScrapedWinner(winner.imagePath)}
										>
											<div style={{ position: 'relative' }}>
												<button
													onClick={(e) => {
														e.stopPropagation();
														toggleLikedScraped(winner.imagePath);
													}}
													style={{
														position: 'absolute',
														top: '8px',
														right: '8px',
														zIndex: 10,
														border: 0,
														background: 'rgba(255,255,255,0.9)',
														color: '#ff4185',
														borderRadius: '50%',
														width: '28px',
														height: '28px',
														display: 'grid',
														placeItems: 'center',
														cursor: 'pointer',
														boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
													}}
												>
													<Icon name="heart" size={13} fill="#ff4185" />
												</button>
												<img src={imageUrl} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
											</div>
											<footer style={{ padding: '12px' }}>
												<h3 style={{ fontSize: '14.5px', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
													{winner.name || 'Idea Guardada'}
												</h3>
												<span style={{ fontSize: '11px', color: '#8b8490' }}>Patrocinado</span>
											</footer>
										</article>
									);
								})}
							</div>
						</div>
					)}
				</div>
			) : (
				<div className="studio-empty large">
					<span>❤️</span>
					<h3>No tenés anuncios guardados</h3>
					<p>Hacé clic en el corazón de tus creaciones o de la biblioteca para guardarlas acá.</p>
				</div>
			)}
		</>
	);
}

function BrandSettings({ profile, onSave, session, onPlans }: { profile: AppProfile; onSave: (profile: AppProfile, logo?: File | null) => Promise<void>; session: AppSession; onPlans: () => void }) {
	const [draft, setDraft] = useState(profile);
	const [logo, setLogo] = useState<File | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	async function save(event: FormEvent) {
		event.preventDefault(); setSaving(true); setError('');
		try { await onSave({ ...draft, onboardingCompleted: true }, logo); }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
		finally { setSaving(false); }
	}

	return <><div className="studio-page-heading"><div><p>MI MARCA</p><h1>Tu marca, lista en cada imagen.</h1><span>Guardá tu web, Instagram, colores y logo una sola vez.</span></div></div><div className="studio-settings-layout"><form className="studio-settings-card" onSubmit={save}><header><span>{(draft.brandName || 'M').slice(0, 1).toUpperCase()}</span><div><h2>Datos de tu marca</h2><p>La IA usa esta información para crear mejor.</p></div></header><div className="studio-form-grid"><label className="wide">Nombre de la marca<input value={draft.brandName} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} required/></label><label>Tu nombre<input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}/></label><label>Email<input value={getSessionEmail(session)} disabled/></label><label>Sitio web (opcional)<input type="url" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })}/></label><label>Instagram (opcional)<input value={draft.instagram} onChange={(e) => setDraft({ ...draft, instagram: e.target.value })}/></label><label>Color principal<span className="studio-color-input"><input type="color" value={draft.primaryColor} onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}/><b>{draft.primaryColor}</b></span></label><label>Color de apoyo<span className="studio-color-input"><input type="color" value={draft.secondaryColor} onChange={(e) => setDraft({ ...draft, secondaryColor: e.target.value })}/><b>{draft.secondaryColor}</b></span></label><label className="wide studio-logo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] || null)}/><span><Icon name="upload"/></span><div><strong>{logo ? logo.name : 'Actualizar logo'}</strong><small>Queda guardado en tu cuenta privada.</small></div><b>Elegir archivo</b></label></div>{error && <p className="studio-form-error">{error}</p>}<button className="studio-primary-button compact" disabled={saving}>{saving ? <span className="studio-spinner small"/> : 'Guardar cambios'}</button></form><aside className="studio-billing-card"><span className="studio-plan-orb"><Icon name="spark"/></span><small>{planLabel(profile).toUpperCase()}</small><h2>{profile.credits} {profile.credits === 1 ? 'generación disponible' : 'generaciones disponibles'}</h2><p>{profile.subscriptionStatus === 'authorized' ? `Tu plan incluye ${profile.monthlyCredits} generaciones mensuales.` : profile.subscriptionStatus === 'cancelled' ? 'La renovación está cancelada. Tus créditos actuales siguen disponibles.' : 'Tus 3 pruebas no vencen. Elegí un plan cuando quieras seguir creando.'}</p><ul><li><Icon name="check" size={14}/>Nuevas ideas cada semana</li><li><Icon name="check" size={14}/>Favoritos e imágenes guardadas</li><li><Icon name="check" size={14}/>Marca y productos privados</li></ul><button onClick={onPlans}>Ver los tres planes<Icon name="arrow" size={16}/></button><footer>Pago seguro con Mercado Pago.</footer></aside></div></>;
}
