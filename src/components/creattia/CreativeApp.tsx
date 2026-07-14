import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { catalogTaxonomy, creativeCatalog, creativeNumber, mapTemplateRecord, referencePresets, ringMeta, templatePath } from '../../lib/creattia/catalog';
import { isSupabaseConfigured, supabase } from '../../lib/creattia/supabase-browser';
import type { Creativo } from '../../data/creativos50';
import './creative-app.css';

type View = 'home' | 'library' | 'products' | 'studio' | 'history' | 'plans' | 'brand';
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
};
type Product = {
	id: string;
	name: string;
	description: string;
	priceText: string;
	currency: string;
	productUrl: string;
	imageUrl: string;
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
	{ id: 'demo-1', name: 'Producto estrella', description: 'El producto principal de tu tienda.', priceText: '$89.900', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('01', '#7c3aed'), source: 'website' },
	{ id: 'demo-2', name: 'Nueva colección', description: 'Una segunda opción para probar otro enfoque.', priceText: '$64.500', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('02', '#ea580c'), source: 'website' },
	{ id: 'demo-3', name: 'Best seller', description: 'Producto con buena respuesta comercial.', priceText: '$112.000', currency: 'ARS', productUrl: '', imageUrl: demoProductArt('03', '#059669'), source: 'website' },
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
		source: record.source || 'manual',
	};
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
		const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
		return () => { active = false; listener.subscription.unsubscribe(); };
	}, []);

	useEffect(() => {
		if (!session) return;
		async function loadAccount() {
			if (isSupabaseConfigured && supabase) {
				const client = supabase;
				let loadedCatalog = creativeCatalog;
				const { data: templateRecords } = await client.from('creative_templates').select('*').eq('is_active', true).order('sort_order', { ascending: true });
				if (templateRecords?.length) {
					loadedCatalog = templateRecords.map(mapTemplateRecord);
					setCatalog(loadedCatalog);
				}
				const { data } = await supabase.from('creative_profiles').select('*').eq('user_id', getSessionId(session)).maybeSingle();
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

				const { data: favoriteRecords } = await supabase.from('creative_template_favorites').select('template_id');
				if (favoriteRecords) setFavorites(new Set(favoriteRecords.map((item) => Number(item.template_id))));

					const { data: records } = await supabase.from('creative_generations')
						.select('id,title,output_path,format,created_at,template_id,user_brief,variant_key,image_type,product_id,batch_id,output_index,settings_snapshot')
					.eq('status', 'completed').order('created_at', { ascending: false }).limit(24);
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
				const token = getSessionToken(session);
				if (token) {
					const response = await fetch('/api/creativos/products', { headers: { authorization: `Bearer ${token}` } });
					if (response.ok) {
						const payload = await response.json();
						setProducts((payload.products || []).map(mapProduct));
					}
				}
			} else {
				setProfile({ ...defaultProfile, ...loadLocal(PROFILE_KEY, defaultProfile) });
				setHistory(loadLocal(HISTORY_KEY, []));
				setFavorites(new Set(loadLocal<number[]>(FAVORITES_KEY, [])));
				setProducts(loadLocal(PRODUCTS_KEY, demoProducts));
			}
		}
		loadAccount();
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
			const { error } = await supabase.from('creative_profiles').update({
				full_name: finalProfile.fullName,
				brand_name: finalProfile.brandName,
				website_url: finalProfile.website,
				instagram_handle: finalProfile.instagram,
				brand_colors: [finalProfile.primaryColor, finalProfile.secondaryColor],
				onboarding_completed: true,
				...(logoPath ? { logo_path: logoPath } : {}),
				updated_at: new Date().toISOString(),
			}).eq('user_id', getSessionId(session));
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

	if (booting) return <div className="studio-boot"><span className="studio-spinner"/><p>Preparando tu estudio…</p></div>;
	if (!session) return <AuthScreen onSession={setSession} />;
	if (!profile.onboardingCompleted) return <Onboarding profile={profile} email={getSessionEmail(session)} onSave={updateProfile} />;

		const navItems: Array<{ id: View; label: string; icon: string }> = [
			{ id: 'home', label: 'Inicio', icon: 'home' },
			{ id: 'library', label: 'Biblioteca', icon: 'grid' },
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
						<button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => { setView(item.id); setMobileMenu(false); }}>
							<Icon name={item.icon}/><span>{item.label}</span>
						</button>
					))}
				</nav>
				<div className="studio-sidebar-bottom">
					<div className="studio-plan-card">
						<div><span className="studio-plan-orb"><Icon name="spark" size={15}/></span><small>PLAN ACTUAL</small></div>
						<strong>{profile.subscriptionStatus === 'authorized' ? profile.planCode.charAt(0).toUpperCase() + profile.planCode.slice(1) : 'Prueba gratuita'}</strong>
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
					<div className="studio-mode-badge"><span />{isSupabaseConfigured ? 'Producción' : 'Demo local'}</div>
					<button className="studio-credit-pill" onClick={() => setView('plans')}><Icon name="spark" size={16}/><b>{profile.credits}</b><span>{profile.credits === 1 ? 'crédito' : 'créditos'}</span></button>
				</header>

				<div className="studio-content">
					{view === 'home' && <Dashboard profile={profile} email={getSessionEmail(session)} history={history} catalog={catalog} favorites={favorites} onView={setView} onChoose={chooseCreative} onReuse={reuseGeneration} />}
					{view === 'library' && <Library items={catalog} favorites={favorites} onChoose={chooseCreative} onToggleFavorite={toggleFavorite} />}
					{view === 'products' && <ProductCatalog products={products} profile={profile} session={session} onRefresh={refreshProducts} onSync={syncBrandSources} onCreate={() => setView('library')} />}
					{view === 'studio' && <Studio creative={selected} reuseSeed={reuseSeed} profile={profile} session={session} products={products} onProductsChanged={refreshProducts} onChooseLibrary={() => setView('library')} onGenerated={addGenerations} onToast={setToast} />}
					{view === 'history' && <History history={history} onCreate={() => setView('library')} onReuse={reuseGeneration} />}
					{view === 'plans' && <Plans profile={profile} session={session} />}
					{view === 'brand' && <BrandSettings profile={profile} onSave={async (next, logo) => { await updateProfile(next, logo); setToast('Tu marca quedó actualizada.'); }} session={session} onPlans={() => setView('plans')} />}
				</div>
			</main>
		</div>
	);
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
					const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/app/` } });
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
				options: { redirectTo: `${window.location.origin}/app/` },
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
			<div className="studio-onboarding-visual"><Moki className="studio-onboarding-moki"/><div><span><i/> ANALIZANDO TU NEGOCIO</span><strong>Tu catálogo se carga solo.</strong><small>Detectamos productos y la identidad de tu marca.</small><div className="onboarding-source-flow"><b>tumarca.com</b><i/><b>24 productos listos</b></div></div></div>
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

function Dashboard({ profile, email, history, catalog, favorites, onView, onChoose, onReuse }: { profile: AppProfile; email: string; history: Generation[]; catalog: Creativo[]; favorites: Set<number>; onView: (view: View) => void; onChoose: (creative: Creativo) => void; onReuse: (generation: Generation) => void }) {
	const popular = [18, 22, 1].map((id) => catalog.find((item) => item.id === id)!).filter(Boolean);
	return <>
		<div className="studio-page-heading"><div><p>INICIO</p><h1>Buen día, {firstName(profile, email)}.</h1><span>¿Qué querés crear hoy?</span></div><button className="studio-primary-button compact" onClick={() => onView('library')}><Icon name="plus" size={17}/>Crear imagen</button></div>
		<section className="studio-hero-card">
			<div className="studio-hero-copy"><span className="studio-eyebrow light"><i/><span>TU MARCA YA ESTÁ LISTA</span></span><h2>Elegí una idea.<br/>Generá una imagen <em>que vende.</em></h2><p>Tu marca y tus productos ya están cargados. Solo elegí qué querés comunicar.</p><button onClick={() => onView('library')}>Elegir una idea <Icon name="arrow" size={17}/></button></div>
			<div className="studio-hero-visual studio-hero-render"><Moki className="studio-dashboard-moki"/><span className="hero-render-chip top"><i/>Moki te guía</span><span className="hero-render-chip bottom"><b>Nuevas</b> ideas cada semana</span><span className="hero-render-chip middle">{favorites.size} {favorites.size === 1 ? 'guardada' : 'guardadas'}</span><div className="hero-spark"><Icon name="spark"/></div></div>
		</section>
		<div className="studio-section-title"><div><h2>Ideas recomendadas</h2><p>Empezá con una opción probada.</p></div><button onClick={() => onView('library')}>Ver biblioteca <Icon name="arrow" size={15}/></button></div>
		<div className="studio-popular-grid">{popular.map((creative, index) => <CreativeFeatureCard key={creative.id} creative={creative} index={index} onClick={() => onChoose(creative)} />)}</div>
		<section className="studio-flow-strip"><div><span>1</span><p><strong>Elegí el objetivo</strong><small>Qué querés comunicar</small></p></div><i/><div><span>2</span><p><strong>Seleccioná el producto</strong><small>De tu catálogo o una foto</small></p></div><i/><div><span>3</span><p><strong>Generá y descargá</strong><small>Lista para publicar</small></p></div></section>
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
	const activeGroup = catalogTaxonomy.find((group) => group.id === groupId);
	const activeBranch = activeGroup?.branches.find((branch) => branch.id === branchId);
	const activeLeaf = activeBranch?.leaves.find((leaf) => leaf.id === leafId);

	const filtered = useMemo(() => items.filter((creative) => {
		const path = templatePath(creative);
		const matchesFavorite = scope === 'all' || favorites.has(creative.id);
		const matchesGroup = !groupId || creative.categoryGroup === groupId || path?.group.id === groupId;
		const matchesBranch = !branchId || creative.categoryBranch === activeBranch?.label.toLowerCase() || path?.branch.id === branchId;
		const matchesLeaf = !leafId || creative.categoryLeaf === activeLeaf?.label.toLowerCase() || activeLeaf?.templateIds.includes(creative.id);
		const haystack = `${creative.nombre} ${creative.sirve} ${creative.cuando} ${(creative.keywords || []).join(' ')} ${path?.group.label || ''} ${path?.branch.label || ''} ${path?.leaf.label || ''}`.toLowerCase();
		return matchesFavorite && matchesGroup && matchesBranch && matchesLeaf && haystack.includes(query.toLowerCase().trim());
	}), [items, favorites, scope, groupId, branchId, leafId, activeBranch, activeLeaf, query]);

	function chooseGroup(id: string) {
		setGroupId(id); setBranchId(''); setLeafId(''); setScope('all');
	}

	return <>
		<div className="studio-page-heading"><div><p>BIBLIOTECA DE IDEAS</p><h1>Encontrá la idea exacta.</h1><span>Elegí un objetivo, filtrá por categoría o buscá por palabra.</span></div></div>
		<div className="studio-library-tools"><label><Icon name="search" size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar oferta, lifestyle, reseña, cuotas…"/></label><span>{filtered.length} {filtered.length === 1 ? 'idea disponible' : 'ideas disponibles'}</span></div>
		<div className="library-explorer">
			<aside className="library-category-tree">
				<button className={!groupId && scope === 'all' ? 'active' : ''} onClick={() => { setScope('all'); setGroupId(''); setBranchId(''); setLeafId(''); }}><Icon name="grid" size={17}/><span><strong>Explorar todo</strong><small>{items.length} ideas</small></span></button>
				<button className={scope === 'favorites' ? 'active favorite' : 'favorite'} onClick={() => { setScope('favorites'); setGroupId(''); setBranchId(''); setLeafId(''); }}><Icon name="heart" size={17}/><span><strong>Mis guardados</strong><small>{favorites.size} {favorites.size === 1 ? 'favorito' : 'favoritos'}</small></span></button>
				<p>POR OBJETIVO</p>
				{catalogTaxonomy.map((group) => <button key={group.id} className={groupId === group.id ? 'active' : ''} onClick={() => chooseGroup(group.id)} style={{ '--tree-accent': group.accent } as React.CSSProperties}><i/><span><strong>{group.label}</strong><small>{group.description}</small></span></button>)}
			</aside>
			<div className="library-results">
				{activeGroup && <div className="library-path-picker">
					<div className="path-level"><small>2 · ELEGÍ UNA CATEGORÍA</small><div>{activeGroup.branches.map((branch) => <button key={branch.id} className={branchId === branch.id ? 'active' : ''} onClick={() => { setBranchId(branch.id); setLeafId(''); }}>{branch.label}</button>)}</div></div>
					{activeBranch && <div className="path-level"><small>3 · AFINÁ EL TIPO</small><div>{activeBranch.leaves.map((leaf) => <button key={leaf.id} className={leafId === leaf.id ? 'active' : ''} onClick={() => setLeafId(leaf.id)}>{leaf.label}</button>)}</div></div>}
				</div>}
				<div className="library-results-heading"><div><strong>{scope === 'favorites' ? 'Tus ideas guardadas' : activeLeaf?.label || activeBranch?.label || activeGroup?.label || 'Todas las ideas'}</strong><small>{filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}</small></div>{(groupId || scope === 'favorites') && <button onClick={() => { setScope('all'); setGroupId(''); setBranchId(''); setLeafId(''); }}>Limpiar filtros</button>}</div>
				<div className="studio-library-grid">{filtered.map((creative) => {
					const meta = ringMeta[creative.ring] || ringMeta.demo;
					const path = templatePath(creative);
					return <article className="studio-library-card catalog-card-shell" key={creative.id} style={{ '--card-accent': path?.group.accent || meta?.accent } as React.CSSProperties}>
						<button className={`catalog-favorite ${favorites.has(creative.id) ? 'active' : ''}`} onClick={() => onToggleFavorite(creative.id)} aria-label={favorites.has(creative.id) ? `Quitar ${creative.nombre} de guardados` : `Guardar ${creative.nombre}`}><Icon name="heart" size={15}/></button>
						<button className="catalog-card-open" onClick={() => onChoose(creative)}>
							<div className="library-card-top"><span>{creative.featured ? 'DESTACADO' : `IDEA ${creativeNumber(creative.id)}`}</span><b>{creative.n}</b></div>
							<div className="library-card-art"><i/><span/><b>{creative.nombre.split(' ').slice(0, 3).join(' ')}</b></div>
						<div className="library-card-copy"><small>{path?.leaf.label || meta?.label}</small><h3>{creative.nombre}</h3><p>{conciseText(creative.sirve)}</p><footer><span>Usar esta idea</span><Icon name="arrow" size={15}/></footer></div>
						</button>
					</article>;
				})}</div>
				{filtered.length === 0 && <div className="studio-empty"><span><Icon name={scope === 'favorites' ? 'heart' : 'search'}/></span><h3>{scope === 'favorites' ? 'Todavía no guardaste ideas' : 'No encontramos ese tipo'}</h3><p>{scope === 'favorites' ? 'Tocá el corazón de cualquier idea para encontrarla acá.' : 'Probá otra búsqueda o limpiá los filtros.'}</p><button onClick={() => { setScope('all'); setQuery(''); setGroupId(''); setBranchId(''); setLeafId(''); }}>Explorar toda la biblioteca</button></div>}
			</div>
		</div>
	</>;
}

function ProductCatalog({ products, profile, session, onRefresh, onSync, onCreate }: { products: Product[]; profile: AppProfile; session: AppSession; onRefresh: () => Promise<Product[]>; onSync: () => Promise<void>; onCreate: () => void }) {
	const [query, setQuery] = useState('');
	const [syncing, setSyncing] = useState(false);
	const [importing, setImporting] = useState(false);
	const [productUrls, setProductUrls] = useState('');
	const [importNotice, setImportNotice] = useState('');
	const [error, setError] = useState('');
	const filtered = useMemo(() => products.filter((product) => `${product.name} ${product.description} ${product.priceText}`.toLowerCase().includes(query.toLowerCase().trim())), [products, query]);
	async function sync() {
		setSyncing(true); setError('');
		try { await onSync(); await onRefresh(); }
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo sincronizar.'); }
		finally { setSyncing(false); }
	}
	async function importUrls() {
		const urls = [...new Set(productUrls.split(/[\n,]/).map((value) => value.trim()).filter(Boolean))];
		if (!urls.length) { setError('Pegá al menos una URL de producto.'); return; }
		if (urls.length > 10) { setError('Podés importar hasta 10 URLs por vez.'); return; }
		setImporting(true); setError(''); setImportNotice('');
		try {
			if (!isSupabaseConfigured) {
				const current = loadLocal<Product[]>(PRODUCTS_KEY, demoProducts);
				const imported = urls.map((url, index): Product => {
					let label = `Producto ${current.length + index + 1}`;
					try { label = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).pathname.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ') || label; } catch { /* demo label */ }
					return { id: crypto.randomUUID(), name: label, description: 'Producto importado desde una URL individual.', priceText: '', currency: '', productUrl: url, imageUrl: demoProductArt(String(current.length + index + 1).padStart(2, '0'), '#6d35e8'), source: 'website' };
				});
				saveLocal(PRODUCTS_KEY, [...imported, ...current]);
				setImportNotice(`${imported.length} ${imported.length === 1 ? 'producto importado' : 'productos importados'} en la demo.`);
			} else {
				const response = await fetch('/api/creativos/products', {
					method: 'POST',
					headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
					body: JSON.stringify({ urls }),
				});
				const payload = await response.json();
				if (!response.ok && !payload.importedIds?.length) throw new Error(payload.error || payload.errors?.[0]?.error || 'No se pudieron importar los productos.');
				const importedCount = payload.importedIds?.length || 0;
				setImportNotice(`${importedCount} ${importedCount === 1 ? 'producto quedó listo' : 'productos quedaron listos'}${payload.errors?.length ? ` · ${payload.errors.length} URL no se pudo leer` : ''}.`);
			}
			setProductUrls('');
			await onRefresh();
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron importar los productos.'); }
		finally { setImporting(false); }
	}
	const statusLabel = profile.catalogStatus === 'ready' ? 'Catálogo sincronizado' : profile.catalogStatus === 'partial' ? 'Sincronización parcial' : profile.catalogStatus === 'failed' ? 'Revisar fuentes' : 'Catálogo pendiente';
	return <>
		<div className="studio-page-heading"><div><p>MIS PRODUCTOS</p><h1>Tus productos, listos para usar.</h1><span>La IA toma fotos y datos de tu negocio para crear cada imagen.</span></div><button className="studio-primary-button compact" onClick={onCreate}><Icon name="plus" size={17}/>Crear imagen</button></div>
		<section className={`product-sync-card status-${profile.catalogStatus}`}><Moki className="product-sync-moki"/><div><span><Icon name={profile.catalogStatus === 'ready' ? 'check' : 'spark'} size={18}/></span><p><small>{statusLabel}</small><strong>{products.length} productos disponibles</strong><em>{profile.website || profile.instagram || 'Conectá tu web o Instagram en Mi marca'}</em></p></div><button onClick={sync} disabled={syncing || (!profile.website && !profile.instagram)}>{syncing ? <><span className="studio-spinner small"/> Analizando…</> : 'Actualizar catálogo'}</button></section>
		<section className="product-url-importer"><div><span><Icon name="external" size={19}/></span><p><small>PRODUCTOS ESPECÍFICOS</small><strong>Pegá una o varias URLs.</strong><em>Una por línea. Analizamos y guardamos cada producto en tu cuenta.</em></p></div><textarea value={productUrls} onChange={(event) => setProductUrls(event.target.value)} placeholder={'https://tutienda.com/producto-uno\nhttps://tutienda.com/producto-dos'} aria-label="URLs de productos"/><button onClick={importUrls} disabled={importing || !productUrls.trim()}>{importing ? <><span className="studio-spinner small"/> Importando…</> : <><Icon name="plus" size={16}/>Importar productos</>}</button></section>
		{importNotice && <p className="studio-form-notice product-import-notice"><Icon name="check" size={14}/>{importNotice}</p>}
		{error && <p className="studio-form-error catalog-error">{error}</p>}
		<div className="studio-library-tools product-tools"><label><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, descripción o precio…"/></label><span>{filtered.length} productos</span></div>
		{filtered.length ? <div className="product-catalog-grid">{filtered.map((product) => <article key={product.id}><div>{product.imageUrl ? <img src={product.imageUrl} alt={product.name}/> : <span><Icon name="bag" size={30}/></span>}<small>{product.source === 'manual' ? 'Cargado por vos' : 'Desde tu tienda'}</small></div><footer><h3>{product.name}</h3><p>{conciseText(product.description || 'Listo para usar en una imagen.')}</p><span>{product.priceText ? `${product.priceText} ${product.currency}` : 'Sin precio público'}</span></footer></article>)}</div> : <div className="studio-empty large"><span><Icon name="bag"/></span><h3>Todavía no hay productos</h3><p>Conectá tu web o subí una foto al crear una imagen.</p><button onClick={sync}>Analizar mi negocio</button></div>}
	</>;
}

function Studio({ creative, reuseSeed, profile, session, products, onProductsChanged, onChooseLibrary, onGenerated, onToast }: { creative: Creativo; reuseSeed: Generation | null; profile: AppProfile; session: AppSession; products: Product[]; onProductsChanged: () => Promise<Product[]>; onChooseLibrary: () => void; onGenerated: (generations: Generation[], credits: number) => void; onToast: (message: string) => void }) {
	const [wizardOpen, setWizardOpen] = useState(true);
	const [step, setStep] = useState(1);
	const [imageType, setImageType] = useState('product');
	const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
	const [productQuery, setProductQuery] = useState('');
	const [uploadFile, setUploadFile] = useState<File | null>(null);
	const [uploadPreview, setUploadPreview] = useState('');
	const [uploadName, setUploadName] = useState('');
	const [uploading, setUploading] = useState(false);
	const [preset, setPreset] = useState('fiel');
	const [references, setReferences] = useState<CreativeReference[]>([]);
	const [referenceId, setReferenceId] = useState('');
	const [format, setFormat] = useState('square');
	const [count, setCount] = useState(1);
	const [brief, setBrief] = useState('');
	const [revisionBrief, setRevisionBrief] = useState('');
	const [variationStrength, setVariationStrength] = useState<VariationStrength>('exact');
	const [generating, setGenerating] = useState(false);
	const [results, setResults] = useState<Generation[]>([]);
	const [result, setResult] = useState<Generation | null>(null);
	const [error, setError] = useState('');
	const uploadInput = useRef<HTMLInputElement>(null);

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
		{ id: 'square', title: 'Feed cuadrado', ratio: '1:1', copy: '1080 × 1080' },
		{ id: 'portrait', title: 'Feed vertical', ratio: '4:5', copy: '1080 × 1350' },
		{ id: 'story', title: 'Stories / Reels', ratio: '9:16', copy: '1080 × 1920' },
		{ id: 'landscape', title: 'Horizontal', ratio: '5:4', copy: '1350 × 1080' },
	];

	useEffect(() => {
		setWizardOpen(true); setStep(reuseSeed ? 5 : 1); setResults([]); setResult(null); setError(''); setRevisionBrief(''); setVariationStrength('exact'); setCount(1);
		const reusableIds = reuseSeed?.productIds?.length ? reuseSeed.productIds : reuseSeed?.productId ? [reuseSeed.productId] : [];
		setSelectedProductIds(reusableIds.filter((id) => products.some((item) => item.id === id)).slice(0, 5));
		setBrief(reuseSeed?.brief || ''); setImageType(reuseSeed?.imageType || 'product'); setPreset(reuseSeed?.preset || 'fiel'); setFormat(reuseSeed?.format || 'square');
	}, [creative.id, reuseSeed?.id]);
	useEffect(() => {
		if (!wizardOpen) return;
		const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = previous; };
	}, [wizardOpen]);
	useEffect(() => {
		if (!uploadFile) { setUploadPreview(''); return; }
		const url = URL.createObjectURL(uploadFile); setUploadPreview(url); setUploadName((current) => current || uploadFile.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
		return () => URL.revokeObjectURL(url);
	}, [uploadFile]);
	useEffect(() => {
		let cancelled = false; setReferences([]); setReferenceId('');
		if (!isSupabaseConfigured || !supabase) return;
		const client = supabase;
		void (async () => {
			const { data } = await client.from('creative_references').select('id,name,image_path,prompt_notes').eq('template_id', creative.id).eq('is_active', true).in('rights_status', ['owned', 'licensed', 'public_domain']).order('sort_order').limit(5);
			if (!data?.length || cancelled) return;
			const loaded = (await Promise.all(data.map(async (item) => {
				const { data: signed } = await client.storage.from('creative-references').createSignedUrl(item.image_path, 3600);
				return signed?.signedUrl ? { id: item.id, name: item.name, description: item.prompt_notes || 'Composición ganadora validada.', imageUrl: signed.signedUrl } : null;
			}))).filter((item): item is CreativeReference => Boolean(item));
			if (!cancelled) { setReferences(loaded); setReferenceId(loaded[0]?.id || ''); }
		})();
		return () => { cancelled = true; };
	}, [creative.id]);

	async function saveUploadedProduct() {
		if (!uploadFile || !uploadName.trim()) { setError('Elegí una foto y poné el nombre del producto.'); return; }
		setUploading(true); setError('');
		try {
			if (!isSupabaseConfigured) {
				const newProduct: Product = { id: crypto.randomUUID(), name: uploadName.trim(), description: 'Producto cargado manualmente.', priceText: '', currency: '', productUrl: '', imageUrl: await fileAsDataUrl(uploadFile), source: 'manual' };
				saveLocal(PRODUCTS_KEY, [newProduct, ...products]); setSelectedProductIds((current) => [...current, newProduct.id].slice(-5)); await onProductsChanged();
			} else {
				const form = new FormData(); form.set('name', uploadName.trim()); form.set('image', uploadFile);
				const response = await fetch('/api/creativos/products', { method: 'POST', headers: { authorization: `Bearer ${getSessionToken(session)}` }, body: form });
				const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'No se pudo guardar el producto.');
				setSelectedProductIds((current) => [...current, payload.product.id].slice(-5)); await onProductsChanged();
			}
			setUploadFile(null); setUploadName(''); onToast('Producto guardado en tu catálogo privado.');
		} catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el producto.'); }
		finally { setUploading(false); }
	}

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
				if (referenceId) form.set('referenceId', referenceId); selectedProductIds.forEach((id) => form.append('productIds', id)); form.set('count', String(effectiveCount));
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
		<section className="wizard-launch-card"><div className="wizard-launch-copy"><span><Icon name="spark"/> PASO A PASO</span><h2>Hacé tu imagen<br/><em>en 5 pasos.</em></h2><p>Elegí tipo, producto, referencia y formato. Al final podés sumar una indicación opcional.</p><button onClick={() => { setWizardOpen(true); if (result) setStep(6); }}>{result ? 'Ver resultado' : 'Empezar'} <Icon name="arrow" size={17}/></button></div><div className="wizard-launch-stack"><article><small>01 · IDEA</small><strong>{creative.nombre}</strong><span>{meta?.label}</span></article><article><small>02 · PRODUCTOS</small><strong>{products.length} listos para usar</strong><span>{profile.catalogStatus === 'ready' ? 'Catálogo actualizado' : 'También podés subir una foto'}</span></article><article><small>03 · FORMATOS</small><strong>4 tamaños</strong><span>Feed, Stories y horizontal</span></article></div></section>
		<div className="studio-flow-strip wizard-flow"><div><span>1</span><p><strong>Elegí el estilo</strong><small>Cómo querés mostrarlo</small></p></div><i/><div><span>2</span><p><strong>Sumá el producto</strong><small>De tu catálogo o una foto</small></p></div><i/><div><span>3</span><p><strong>Generá la imagen</strong><small>Lista para publicar</small></p></div></div>

		{wizardOpen && <div className="creative-wizard-overlay" role="dialog" aria-modal="true" aria-label="Generador guiado de imágenes"><div className="creative-wizard-modal">
			<header className="wizard-header"><div><span className="wizard-brand-mark"><Icon name="spark" size={17}/></span><p><small>CREATTIA</small><strong>{step === 6 ? 'Tu imagen está lista' : `Crear · ${creative.nombre}`}</strong></p></div><button onClick={() => setWizardOpen(false)} aria-label="Cerrar generador"><Icon name="close"/></button></header>
			{step <= 5 && <div className="wizard-progress">{['Tipo', 'Producto', 'Estilo', 'Formato', 'Indicación'].map((label, index) => <button key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''} onClick={() => index + 1 < step && setStep(index + 1)}><span>{step > index + 1 ? <Icon name="check" size={11}/> : index + 1}</span><b>{label}</b></button>)}</div>}
			<div className="wizard-body"><main>
				{step === 1 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 1 DE 5</span><h2>¿Qué tipo de imagen querés?</h2><p>Elegí cómo mostrar tu producto o promoción.</p></div><div className="wizard-type-grid">{typeOptions.map((item) => <button key={item.id} className={imageType === item.id ? 'active' : ''} onClick={() => setImageType(item.id)}><span><Icon name={item.icon}/></span><em>{item.badge}</em><h3>{item.title}</h3><p>{item.copy}</p>{imageType === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div></section>}
				{step === 2 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 2 DE 5 · HASTA 5</span><h2>{imageType === 'promotion' ? '¿Querés sumar productos?' : 'Elegí uno o varios productos'}</h2><p>Podés crear una pieza individual o una composición con varios productos.</p></div><label className="wizard-product-search"><Icon name="search" size={18}/><input aria-label="Buscar producto" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto…"/><span>{selectedProductIds.length}/5</span></label>{imageType === 'promotion' && <button className={`wizard-no-product ${!selectedProductIds.length ? 'active' : ''}`} onClick={() => setSelectedProductIds([])}><span><Icon name="spark"/></span><p><strong>Promoción sin producto</strong><small>Creá una oferta general de tu marca</small></p>{!selectedProductIds.length && <b><Icon name="check" size={13}/></b>}</button>}<div className="wizard-product-grid">{filteredProducts.map((product) => { const selectedIndex = selectedProductIds.indexOf(product.id); return <button key={product.id} className={selectedIndex >= 0 ? 'active' : ''} onClick={() => toggleProduct(product.id)}><div>{product.imageUrl ? <img src={product.imageUrl} alt={product.name}/> : <span><Icon name="bag"/></span>}{selectedIndex >= 0 && <b>{selectedIndex + 1}</b>}</div><strong>{product.name}</strong><small>{product.priceText ? `${product.priceText} ${product.currency}` : product.source === 'manual' ? 'Cargado por vos' : 'Desde tu tienda'}</small></button>; })}</div><div className="wizard-upload-product"><input ref={uploadInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={(event) => setUploadFile(event.target.files?.[0] || null)}/>{uploadFile ? <><img src={uploadPreview} alt="Producto nuevo"/><label>Nombre del producto<input value={uploadName} onChange={(event) => setUploadName(event.target.value)} placeholder="Ej. Zapatilla Urban White"/></label><button onClick={saveUploadedProduct} disabled={uploading}>{uploading ? 'Guardando…' : 'Guardar producto'}</button></> : <button onClick={() => uploadInput.current?.click()}><span><Icon name="upload"/></span><p><strong>¿No aparece?</strong><small>Subí una foto y guardala para la próxima.</small></p><b>Subir producto</b></button>}</div></section>}
				{step === 3 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 3 DE 5</span><h2>¿Cómo querés que se vea?</h2><p>{references.length ? 'Elegí una referencia para conservar su composición.' : 'Elegí una versión visual para esta idea.'}</p></div>{references.length ? <div className="wizard-reference-grid">{references.map((item, index) => <button key={item.id} className={referenceId === item.id ? 'active' : ''} onClick={() => setReferenceId(item.id)}><div><img src={item.imageUrl} alt={item.name}/><span>OPCIÓN {String(index + 1).padStart(2, '0')}</span></div><strong>{item.name}</strong><small>{item.description}</small>{referenceId === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div> : <div className="wizard-variant-grid">{referencePresets.map((item, index) => <button key={item.id} className={preset === item.id ? 'active' : ''} onClick={() => setPreset(item.id)}><div className={`preset-preview preset-${index + 1}`}><i/><b/><span/><small/></div><em>{item.label}</em><strong>{item.name}</strong><p>{item.description}</p>{preset === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div>}</section>}
				{step === 4 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 4 DE 5</span><h2>Formato y cantidad</h2><p>Elegí dónde vas a publicar y cuántas variantes querés comparar.</p></div><div className="wizard-format-grid">{formatOptions.map((item) => <button key={item.id} className={format === item.id ? 'active' : ''} onClick={() => setFormat(item.id)}><span className={`format-shape shape-${item.id}`}><i/></span><p><strong>{item.title}</strong><small>{item.copy}</small></p><em>{item.ratio}</em>{format === item.id && <b><Icon name="check" size={13}/></b>}</button>)}</div><div className="wizard-output-count"><div><strong>Variantes a generar</strong><small>Cada imagen usa 1 crédito y se guarda por separado.</small></div><div>{[1, 2, 3, 4].map((value) => <button key={value} className={count === value ? 'active' : ''} onClick={() => setCount(value)} disabled={value > profile.credits}>{value}</button>)}</div><p><span>{count} {count === 1 ? 'imagen' : 'imágenes'}</span><b>{count} {count === 1 ? 'crédito' : 'créditos'}</b></p></div></section>}
				{step === 5 && <section className="wizard-step"><div className="wizard-step-heading"><span>PASO 5 DE 5 · OPCIONAL</span><h2>¿Querés pedir algo puntual?</h2><p>Podés dejarlo vacío. La IA ya conoce tu marca y el producto elegido.</p></div><label className="wizard-brief"><textarea value={brief} maxLength={500} onChange={(event) => setBrief(event.target.value)} placeholder="Ej: destacar el envío gratis, usar un tono premium o dejar más aire."/><span>{brief.length}/500</span></label><div className="wizard-final-check"><span><Icon name="check" size={14}/></span><p><strong>Tu información ya está cargada</strong><small>Usamos tu web, Instagram y catálogo. Nunca inventamos precios ni beneficios.</small></p></div></section>}
				{step === 6 && <section className="wizard-result"><div className="wizard-result-visual"><div className={`wizard-result-image result-${format}`}>{generating ? <div><span className="studio-spinner"/><h3>Creando tu imagen…</h3></div> : result && <img src={result.imageUrl} alt={`Imagen ${result.title}`}/>}</div>{results.length > 1 && <div className="wizard-result-gallery">{results.map((item, index) => <button key={item.id} className={result?.id === item.id ? 'active' : ''} onClick={() => setResult(item)}><img src={item.imageUrl} alt={`Variante ${index + 1}`}/><span>{index + 1}</span></button>)}</div>}</div>{result && <div className="wizard-result-copy"><span><Icon name="check" size={14}/> {results.length > 1 ? `${results.length} VARIANTES GENERADAS` : 'IMAGEN GENERADA'}</span><h2>Lista para publicar.</h2><p>La guardamos en “Mis imágenes”. Elegí una variante, descargala o pedí un cambio.</p><div className="wizard-result-actions"><a href={result.imageUrl} download={`creattia-${creative.id}-${result.outputIndex || 1}.png`}><Icon name="download" size={18}/>Descargar elegida</a><button onClick={() => { setResults([]); setResult(null); setRevisionBrief(''); setStep(1); }}><Icon name="plus" size={17}/>Crear otra</button></div><div className="wizard-revision"><header><span><Icon name="spark" size={16}/></span><p><strong>¿Querés hacer un cambio?</strong><small>Usaremos la variante elegida como referencia.</small></p></header><label>Describí el cambio (opcional)<textarea value={revisionBrief} maxLength={500} onChange={(event) => setRevisionBrief(event.target.value)} placeholder="Ej: cambiar el fondo, reemplazar un producto o destacar más el beneficio."/></label><div className="wizard-selected-products-note"><Icon name="bag" size={15}/><span><strong>{selectedProducts.length || 0} {selectedProducts.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}</strong><small>Para cambiarlos, empezá otra creación y volvé al paso 2.</small></span></div><div className="wizard-revision-strength">{([{ id: 'exact', title: 'Conservar todo', copy: 'Cambia solo lo que pedís.' }, { id: 'light', title: 'Variar detalles', copy: 'Mantiene el diseño base.' }, { id: 'strong', title: 'Reinterpretar', copy: 'Mismo enfoque, nueva composición.' }] as { id: VariationStrength; title: string; copy: string }[]).map((option) => <button key={option.id} className={variationStrength === option.id ? 'active' : ''} onClick={() => setVariationStrength(option.id)}><span>{variationStrength === option.id && <Icon name="check" size={11}/>}</span><p><strong>{option.title}</strong><small>{option.copy}</small></p></button>)}</div><button className="wizard-revision-generate" onClick={() => void generate(result)} disabled={generating}><Icon name="spark" size={17}/>Generar nueva versión <span>1 crédito</span></button></div></div>}</section>}
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
	const [error, setError] = useState('');

	async function subscribe(planCode: string) {
		if (!isSupabaseConfigured || !supabase) { setError('Para activar pagos faltan las credenciales de Supabase y Mercado Pago.'); return; }
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

	return <><div className="studio-page-heading"><div><p>PLANES</p><h1>Elegí cuántas imágenes querés crear.</h1><span>Todos los planes incluyen las mismas herramientas. Solo cambia la cantidad mensual.</span></div></div>
		<div className="studio-current-credits"><span><Icon name="spark"/></span><p><small>TU SALDO ACTUAL</small><strong>{profile.credits} {profile.credits === 1 ? 'generación disponible' : 'generaciones disponibles'}</strong></p><em>{profile.subscriptionStatus === 'authorized' ? `Plan ${profile.planCode}` : 'Prueba gratuita'}</em></div>
		{error && <p className="studio-form-error">{error}</p>}
		<div className="studio-plans-grid">{subscriptionPlans.map((plan) => <article key={plan.code} className={plan.featured ? 'featured' : ''}>{plan.featured && <span>MÁS ELEGIDO</span>}<small>PLAN {plan.name.toUpperCase()}</small><h2><b>USD</b>{plan.price}<em>/mes</em></h2><p>{plan.description}</p><strong>{plan.credits} generaciones por mes</strong><ul><li><Icon name="check" size={14}/>Todas las ideas y actualizaciones</li><li><Icon name="check" size={14}/>Marca y catálogo siempre listos</li><li><Icon name="check" size={14}/>Historial, favoritos y ajustes</li></ul><button onClick={() => subscribe(plan.code)} disabled={Boolean(billing) || (profile.subscriptionStatus === 'authorized' && profile.planCode === plan.code)}>{profile.subscriptionStatus === 'authorized' && profile.planCode === plan.code ? 'Plan actual' : billing === plan.code ? 'Abriendo pago…' : `Elegir ${plan.name}`}</button></article>)}</div>
		<p className="studio-plan-note">Los créditos se renuevan cada mes. Podés cambiar o cancelar tu plan desde tu cuenta.</p>
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

	return <><div className="studio-page-heading"><div><p>MI MARCA</p><h1>Tu marca, lista en cada imagen.</h1><span>Guardá tu web, Instagram, colores y logo una sola vez.</span></div></div><div className="studio-settings-layout"><form className="studio-settings-card" onSubmit={save}><header><span>{(draft.brandName || 'M').slice(0, 1).toUpperCase()}</span><div><h2>Datos de tu marca</h2><p>La IA usa esta información para crear mejor.</p></div></header><div className="studio-form-grid"><label className="wide">Nombre de la marca<input value={draft.brandName} onChange={(e) => setDraft({ ...draft, brandName: e.target.value })} required/></label><label>Tu nombre<input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}/></label><label>Email<input value={getSessionEmail(session)} disabled/></label><label>Sitio web (opcional)<input type="url" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })}/></label><label>Instagram (opcional)<input value={draft.instagram} onChange={(e) => setDraft({ ...draft, instagram: e.target.value })}/></label><label>Color principal<span className="studio-color-input"><input type="color" value={draft.primaryColor} onChange={(e) => setDraft({ ...draft, primaryColor: e.target.value })}/><b>{draft.primaryColor}</b></span></label><label>Color de apoyo<span className="studio-color-input"><input type="color" value={draft.secondaryColor} onChange={(e) => setDraft({ ...draft, secondaryColor: e.target.value })}/><b>{draft.secondaryColor}</b></span></label><label className="wide studio-logo-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogo(e.target.files?.[0] || null)}/><span><Icon name="upload"/></span><div><strong>{logo ? logo.name : 'Actualizar logo'}</strong><small>Queda guardado en tu cuenta privada.</small></div><b>Elegir archivo</b></label></div>{error && <p className="studio-form-error">{error}</p>}<button className="studio-primary-button compact" disabled={saving}>{saving ? <span className="studio-spinner small"/> : 'Guardar cambios'}</button></form><aside className="studio-billing-card"><span className="studio-plan-orb"><Icon name="spark"/></span><small>{profile.subscriptionStatus === 'authorized' ? `PLAN ${profile.planCode.toUpperCase()}` : 'PRUEBA GRATUITA'}</small><h2>{profile.credits} {profile.credits === 1 ? 'generación disponible' : 'generaciones disponibles'}</h2><p>{profile.subscriptionStatus === 'authorized' ? `Tu plan incluye ${profile.monthlyCredits} generaciones mensuales.` : 'Tus 3 pruebas no vencen. Elegí un plan cuando quieras seguir creando.'}</p><ul><li><Icon name="check" size={14}/>Nuevas ideas cada semana</li><li><Icon name="check" size={14}/>Favoritos e imágenes guardadas</li><li><Icon name="check" size={14}/>Marca y productos privados</li></ul><button onClick={onPlans}>Ver los tres planes<Icon name="arrow" size={16}/></button><footer>Pago seguro con Mercado Pago.</footer></aside></div></>;
}
