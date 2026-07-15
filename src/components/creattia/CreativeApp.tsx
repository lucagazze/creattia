import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { catalogTaxonomy, creativeCatalog, creativeNumber, mapTemplateRecord, referenceImagePath, referencePresets, ringMeta, templatePath } from '../../lib/creattia/catalog';
import { isSupabaseConfigured, supabase } from '../../lib/creattia/supabase-browser';
import type { Creativo } from '../../data/creativos50';
import './creative-app.css';
import WinnersLibrary from './WinnersLibrary';

type View = 'home' | 'library' | 'products' | 'studio' | 'history' | 'plans' | 'brand' | 'winners';
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
	{ id: 'demo-1', name: 'Producto estrella', description: 'El producto principal de tu tienda.', priceText: '$89.900', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('01', '#7c3aed'), imageUrls: [demoProductArt('01', '#7c3aed')], imageCount: 1, source: 'website' },
	{ id: 'demo-2', name: 'Nueva colección', description: 'Una segunda opción para probar otro enfoque.', priceText: '$64.500', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('02', '#ea580c'), imageUrls: [demoProductArt('02', '#ea580c')], imageCount: 1, source: 'website' },
	{ id: 'demo-3', name: 'Best seller', description: 'Producto con buena respuesta comercial.', priceText: '$112.000', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('03', '#059669'), imageUrls: [demoProductArt('03', '#059669')], imageCount: 1, source: 'website' },
];

const subscriptionPlans = [
	{ code: 'creator', name: 'Creator', price: 19, credits: 40, description: 'Para crear contenido todas las semanas.', featured: false },
	{ code: 'pro', name: 'Pro', price: 39, credits: 120, description: 'Para probar más ideas y anuncios.', featured: true },
	{ code: 'scale', name: 'Scale', price: 79, credits: 300, description: 'Para equipos que producen a diario.', featured: false },
];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
	const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
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
	ctx.fillStyle = impact ? '#a78bfa' : '#6d28d9';
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
		ctx.fillStyle = '#7c3aed';
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
	const [mobileMenu, setMobileMenu] = useState(false);
	const [catalog, setCatalog] = useState<Creativo[]>(creativeCatalog);
	const [selected, setSelected] = useState<Creativo>(creativeCatalog.find((c) => c.id === 18) || creativeCatalog[0]);
	const [reuseSeed, setReuseSeed] = useState<Generation | null>(null);
	const [history, setHistory] = useState<Generation[]>([]);
	const [favorites, setFavorites] = useState<Set<number>>(new Set());
	const [products, setProducts] = useState<Product[]>([]);
	const [creationProductIds, setCreationProductIds] = useState<string[]>([]);
	const [toast, setToast] = useState('');

	useEffect(() => {
		let active = true;
		async function boot() {
			if (isSupabaseConfigured && supabase) {
				const { data } = await supabase.auth.getSession();
				if (active) setSession(data.session);
			} else {
				const localSession = loadLocal<DemoSession | null>(SESSION_KEY, null);
				if (active) setSession(localSession);
			}
			if (active) setBooting(false);
		}
		boot();
		if (!supabase) return () => { active = false; };
		const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
			setAccountLoading(Boolean(nextSession));
			setSession(nextSession);
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
					const { data: templateRecords, error: templateError } = await client.from('creative_templates').select('*').eq('is_active', true).order('sort_order', { ascending: true });
					if (templateError) throw templateError;
				if (templateRecords?.length) {
					loadedCatalog = templateRecords.map(mapTemplateRecord);
					setCatalog(loadedCatalog);
				}
				const profileId = getSessionId(activeSession);
				let { data, error: profileError } = await supabase.from('creative_profiles').select('*').eq('user_id', profileId).maybeSingle();
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
		setSelected(creative);
		setReuseSeed(null);
		setView('studio');
		setMobileMenu(false);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function startWithProduct(productId: string) {
		setCreationProductIds([productId]);
		setView('library');
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
		setView('studio');
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

	if (booting || (session && accountLoading)) return <div className="studio-boot"><span className="studio-spinner"/><p>Preparando tu estudio…</p></div>;
	if (!session) return <AuthScreen onSession={(nextSession) => { setAccountLoading(true); setSession(nextSession); }} />;
	if (accountError) return <AccountSetupError message={accountError} onRetry={() => window.location.reload()} onLogout={logout} />;
	if (!profile.onboardingCompleted) return <Onboarding profile={profile} email={getSessionEmail(session)} onSave={updateProfile} />;

		const navItems: Array<{ id: View; label: string; icon: string }> = [
			{ id: 'home', label: 'Inicio', icon: 'home' },
			{ id: 'library', label: 'Biblioteca', icon: 'grid' },
			{ id: 'winners', label: 'Biblioteca de ganadores', icon: 'spark' },
			{ id: 'products', label: 'Mis productos', icon: 'bag' },
			{ id: 'studio', label: 'Crear imagen', icon: 'spark' },
			{ id: 'history', label: 'Mis imágenes', icon: 'history' },
			{ id: 'plans', label: 'Planes', icon: 'layers' },
			{ id: 'brand', label: 'Mi marca', icon: 'brand' },
		];

	return (
		<div className="creative-app-shell">
			{toast && <div className="studio-toast"><span><Icon name="check" size={16}/></span>{toast}</div>}
			<div className={`studio-mobile-scrim ${mobileMenu ? 'is-open' : ''}`} onClick={() => setMobileMenu(false)} />
			<aside className={`studio-sidebar ${mobileMenu ? 'is-open' : ''}`}>
				<a className="studio-logo" href="/" aria-label="Volver a Creattia">
					<span><img src="/images/creattia/moki-mascot.webp" alt=""/></span>
					<div><strong>Creattia</strong></div>
				</a>
				<button className="studio-close-menu" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú"><Icon name="close"/></button>
				<nav className="studio-nav">
					<p>ESPACIO DE TRABAJO</p>
					{navItems.map((item) => (
						<button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { setView(item.id); setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
							<Icon name={item.icon}/><span>{item.label}</span>
						</button>
					))}
				</nav>
				<div className="studio-sidebar-bottom">
					<div className="studio-plan-card">
						<div><span className="studio-plan-orb"><Icon name="spark" size={15}/></span><small>PLAN ACTUAL</small></div>
					<strong>{planLabel(profile)}</strong>
						<p><span style={{ width: `${Math.min(100, profile.credits / (profile.monthlyCredits || 3) * 100)}%` }}/></p>
						<footer><span>{profile.credits} {profile.credits === 1 ? 'generación' : 'generaciones'}</span><button onClick={() => setView('plans')}>Ver planes</button></footer>
					</div>
					<div className="studio-user">
						<span>{firstName(profile, getSessionEmail(session)).slice(0, 1).toUpperCase()}</span>
						<div><strong>{profile.fullName || 'Mi cuenta'}</strong><small>{getSessionEmail(session)}</small></div>
						<button onClick={logout} aria-label="Cerrar sesión"><Icon name="logout" size={18}/></button>
					</div>
				</div>
			</aside>

			<main className="studio-main">
				<header className="studio-topbar">
					<button className="studio-menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menú"><Icon name="menu"/></button>
					<div className="studio-top-brand"><img src="/images/creattia/moki-mascot.webp" alt=""/><strong>Creattia</strong></div>
					<div className="studio-mode-badge"><span />{isSupabaseConfigured ? 'Cuenta conectada' : 'Demo local'}</div>
					<button className="studio-credit-pill" onClick={() => setView('plans')}><Icon name="spark" size={16}/><b>{profile.credits}</b><span>{profile.credits === 1 ? 'crédito' : 'créditos'}</span></button>
				</header>

				<div className="studio-content">
					{view === 'home' && <Dashboard profile={profile} email={getSessionEmail(session)} productCount={products.length} history={history} catalog={catalog} favorites={favorites} onView={setView} onChoose={chooseCreative} onReuse={reuseGeneration} />}
					{view === 'library' && <Library items={catalog} favorites={favorites} onChoose={chooseCreative} onToggleFavorite={toggleFavorite} />}
					{view === 'winners' && <WinnersLibrary session={session} onChoose={chooseCreative} onView={setView} />}
					{view === 'products' && <ProductCatalog products={products} profile={profile} session={session} onRefresh={refreshProducts} onSync={syncBrandSources} onRemove={removeProduct} onCreate={(productId) => productId ? startWithProduct(productId) : setView('library')} />}
					{view === 'studio' && <Studio creative={selected} reuseSeed={reuseSeed} initialProductIds={creationProductIds} onSeedConsumed={() => setCreationProductIds([])} profile={profile} session={session} products={products} onProductsChanged={refreshProducts} onChooseLibrary={() => setView('library')} onGenerated={addGenerations} onToast={setToast} />}
					{view === 'history' && <History history={history} onCreate={() => setView('library')} onReuse={reuseGeneration} />}
					{view === 'plans' && <Plans profile={profile} session={session} />}
					{view === 'brand' && <BrandSettings profile={profile} onSave={async (next, logo) => { await updateProfile(next, logo); setToast('Tu marca quedó actualizada.'); }} session={session} onPlans={() => setView('plans')} />}
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

function Onboarding({ profile, email, onSave }: { profile: AppProfile; email: string; onSave: (profile: AppProfile, logo?: File | null) => Promise<void> }) {
	const [draft, setDraft] = useState({ ...profile, fullName: profile.fullName || email.split('@')[0] });
	const [logo, setLogo] = useState<File | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	async function submit(event: FormEvent) {
		event.preventDefault(); setSaving(true); setError('');
		try { await onSave({ ...draft, onboardingCompleted: true }, logo); }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
		finally { setSaving(false); }
	}

	return <div className="studio-onboarding">
		<header><a href="/"><img src="/images/creattia/moki-mascot.webp" alt=""/><strong>Creattia</strong></a><span>Paso 1 de 1</span></header>
		<main>
			<div className="studio-onboarding-intro"><span><Icon name="spark"/></span><p>PREPARÁ TU MARCA</p><h1>Conectá tu negocio.<br/>La IA hace el resto.</h1><small>Usamos tu web e Instagram para detectar productos, colores y contexto.</small></div>
			<form onSubmit={submit}>
				<div className="studio-form-grid">
					<label className="wide">Nombre de tu marca<input value={draft.brandName} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} placeholder="Ej. Vitta" required /></label>
					<label>Sitio web (opcional)<input type="url" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://tumarca.com" /></label>
					<label>Instagram (opcional)<input value={draft.instagram} onChange={(e) => setDraft({ ...draft, instagram: e.target.value })} placeholder="https://instagram.com/tumarca" /></label>
					<label>Color principal<span className="studio-color-input"><input type="color" value={draft.primaryColor} onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}/><b>{draft.primaryColor}</b></span></label>
					<label>Color de apoyo<span className="studio-color-input"><input type="color" value={draft.secondaryColor} onChange={(e) => setDraft({ ...draft, secondaryColor: e.target.value })}/><b>{draft.secondaryColor}</b></span></label>
					<label className="wide studio-logo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] || null)}/><span><Icon name="upload"/></span><div><strong>{logo ? logo.name : 'Subí tu logo'}</strong><small>PNG o WebP con fondo transparente. También podés hacerlo después.</small></div><b>{logo ? 'Cambiar' : 'Elegir archivo'}</b></label>
				</div>
				{error && <p className="studio-form-error">{error}</p>}
				<button className="studio-primary-button" disabled={saving}>{saving ? <><span className="studio-spinner small"/>Preparando tu marca…</> : <>Guardar y empezar a crear<Icon name="arrow" size={18}/></>}</button>
			</form>
		</main>
	</div>;
}

function Dashboard({ profile, email, productCount, history, catalog, favorites, onView, onChoose, onReuse }: { profile: AppProfile; email: string; productCount: number; history: Generation[]; catalog: Creativo[]; favorites: Set<number>; onView: (view: View) => void; onChoose: (creative: Creativo) => void; onReuse: (generation: Generation) => void }) {
	const popular = [18, 22, 1].map((id) => catalog.find((item) => item.id === id)!).filter(Boolean);
	const hasProducts = productCount > 0;
	return <>
		<div className="studio-page-heading"><div><p>INICIO</p><h1>Buen día, {firstName(profile, email)}.</h1><span>¿Qué querés crear hoy?</span></div><button className="studio-primary-button compact" onClick={() => onView('library')}><Icon name="plus" size={17}/>Crear imagen</button></div>
		<section className="studio-hero-card">
			<div className="studio-hero-copy"><span className="studio-eyebrow light"><i/><span>{hasProducts ? 'TODO LISTO PARA CREAR' : 'EMPEZÁ POR TU PRODUCTO'}</span></span><h2>{hasProducts ? <>Elegí una idea.<br/>Generá una imagen <em>que vende.</em></> : <>Cargá tu producto.<br/>Usalo en <em>cualquier idea.</em></>}</h2><p>{hasProducts ? `Tenés ${productCount} ${productCount === 1 ? 'producto listo' : 'productos listos'} para combinar con una referencia.` : 'Pegá su URL o subí entre una y seis fotos. Después Creattia te guía.'}</p><button onClick={() => onView(hasProducts ? 'library' : 'products')}>{hasProducts ? 'Elegir una idea' : 'Agregar producto'} <Icon name="arrow" size={17}/></button></div>
			<div className="studio-hero-visual studio-hero-render"><Moki className="studio-dashboard-moki"/><span className="hero-render-chip top"><i/>Moki te guía</span><span className="hero-render-chip bottom"><b>Nuevas</b> ideas cada semana</span><span className="hero-render-chip middle">{favorites.size} {favorites.size === 1 ? 'guardada' : 'guardadas'}</span><div className="hero-spark"><Icon name="spark"/></div></div>
		</section>
		<div className="studio-section-title"><div><h2>Ideas recomendadas</h2><p>Empezá con una opción probada.</p></div><button onClick={() => onView('library')}>Ver biblioteca <Icon name="arrow" size={15}/></button></div>
		<div className="studio-popular-grid">{popular.map((creative, index) => <CreativeFeatureCard key={creative.id} creative={creative} index={index} onClick={() => onChoose(creative)} />)}</div>
		{history.length > 0 && <><div className="studio-section-title"><div><h2>Últimas imágenes</h2><p>Descargalas o creá otra versión.</p></div><button onClick={() => onView('history')}>Ver todas <Icon name="arrow" size={15}/></button></div><div className="studio-recent-row">{history.slice(0, 4).map((item) => <GenerationCard key={item.id} item={item} onReuse={() => onReuse(item)}/>)}</div></>}
	</>;
}

function CreativeFeatureCard({ creative, index, onClick }: { creative: Creativo; index: number; onClick: () => void }) {
	return <button className={`studio-feature-card variant-${index + 1}`} onClick={onClick}>
		<div className="studio-feature-preview"><span className="feature-tag">{ringMeta[creative.ring]?.short}</span><div className="feature-art"><i/><b>{index === 0 ? 'ENVÍO\nGRATIS' : index === 1 ? '3 CUOTAS' : '“LO AMO”'}</b><small>{index === 0 ? 'en compras seleccionadas' : index === 1 ? 'sin interés' : '— Cliente verificado'}</small></div></div>
		<div className="studio-feature-info"><span>#{creativeNumber(creative.id)} · {creative.n}</span><h3>{creative.nombre}</h3><p>{conciseText(creative.cuando)}</p><footer>Usar esta idea <Icon name="arrow" size={15}/></footer></div>
	</button>;
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
				const artwork = demoProductArt(String(products.length + 1).padStart(2, '0'), '#6d35e8');
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

function Studio({ creative, reuseSeed, initialProductIds, onSeedConsumed, profile, session, products, onProductsChanged, onChooseLibrary, onGenerated, onToast }: { creative: Creativo; reuseSeed: Generation | null; initialProductIds: string[]; onSeedConsumed: () => void; profile: AppProfile; session: AppSession; products: Product[]; onProductsChanged: () => Promise<Product[]>; onChooseLibrary: () => void; onGenerated: (generations: Generation[], credits: number) => void; onToast: (message: string) => void }) {
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
				const artwork = demoProductArt(String(products.length + 1).padStart(2, '0'), '#6d35e8');
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
								style={{ height: '36px', padding: '0 16px', background: '#6d35e8', border: 0, borderRadius: '8px', color: '#fff', fontSize: '10.5px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
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

function History({ history, onCreate, onReuse }: { history: Generation[]; onCreate: () => void; onReuse: (item: Generation) => void }) {
	return <><div className="studio-page-heading"><div><p>MIS IMÁGENES</p><h1>Todo lo que creaste.</h1><span>Descargá una imagen o usala como base para crear otra.</span></div><button className="studio-primary-button compact" onClick={onCreate}><Icon name="plus" size={17}/>Crear imagen</button></div>{history.length ? <div className="studio-history-grid">{history.map((item) => <GenerationCard key={item.id} item={item} onReuse={() => onReuse(item)}/>)}</div> : <div className="studio-empty large"><span><Icon name="history"/></span><h3>Todavía no creaste imágenes</h3><p>Elegí una idea de la biblioteca para empezar.</p><button onClick={onCreate}>Elegir una idea</button></div>}</>;
}

function GenerationCard({ item, onReuse }: { item: Generation; onReuse?: () => void }) {
	return <article className="studio-generation-card"><div><img src={item.imageUrl} alt={item.title}/><a href={item.imageUrl} download aria-label={`Descargar ${item.title}`}><Icon name="download" size={17}/></a></div><footer><small>{item.category}</small><h3>{item.title}</h3><span>{new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(new Date(item.createdAt))}</span>{onReuse && <button onClick={onReuse}><Icon name="history" size={14}/>Crear otra versión</button>}</footer></article>;
}

function Plans({ profile, session }: { profile: AppProfile; session: AppSession }) {
	const [billing, setBilling] = useState('');
	const [cancelling, setCancelling] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');

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
				body: JSON.stringify({ planCode }),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar la suscripción.');
			window.location.href = payload.checkoutUrl;
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el pago.'); setBilling(''); }
	}

	async function cancelSubscription() {
		if (!window.confirm('¿Cancelar la renovación mensual? Conservás tus créditos actuales, pero no se renovarán el próximo mes.')) return;
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
		{error && <p className="studio-form-error">{error}</p>}
		{notice && <p className="studio-form-notice">{notice}</p>}
		<div className="studio-plans-grid">{subscriptionPlans.map((plan) => { const currentPlan = ['authorized', 'pending', 'paused'].includes(profile.subscriptionStatus) && profile.planCode === plan.code; return <article key={plan.code} className={plan.featured ? 'featured' : ''}>{plan.featured && <span>MÁS ELEGIDO</span>}<small>PLAN {plan.name.toUpperCase()}</small><h2><b>USD</b>{plan.price}<em>/mes</em></h2><p>{plan.description}</p><strong>{plan.credits} generaciones por mes</strong><ul><li><Icon name="check" size={14}/>Todas las ideas y actualizaciones</li><li><Icon name="check" size={14}/>Marca y catálogo siempre listos</li><li><Icon name="check" size={14}/>Historial, favoritos y ajustes</li></ul><button onClick={() => subscribe(plan.code)} disabled={Boolean(billing) || currentPlan}>{currentPlan ? profile.subscriptionStatus === 'authorized' ? 'Plan actual' : planLabel(profile) : billing === plan.code ? 'Abriendo pago…' : `Elegir ${plan.name}`}</button></article>; })}</div>
		<p className="studio-plan-note">Los créditos se renuevan cada mes. Podés cambiar o cancelar tu plan desde tu cuenta.</p>
		{['authorized', 'pending', 'paused'].includes(profile.subscriptionStatus) && <button className="studio-cancel-subscription" onClick={() => void cancelSubscription()} disabled={cancelling}>{cancelling ? 'Cancelando…' : 'Cancelar renovación'}</button>}
	</>;
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
