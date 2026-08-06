import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { creativeCatalog, mapTemplateRecord, ringMeta } from '../../lib/creattia/catalog';
import { isSupabaseConfigured, supabase } from '../../lib/creattia/supabase-browser';
import { isAdminEmail } from '../../lib/creattia/admin';
import { canAccessVideoFeature } from '../../lib/creattia/video-access';
import type { Creativo } from '../../data/creativos50';
import './creative-app.css';
import WinnersLibrary from './WinnersLibrary';
import AvatarManager from './AvatarManager';
import { driveBatchWorkers } from './UrlBatchSection';
import { signGenerationPaths } from '../../lib/creattia/generation-image';
import AdminDashboard from './AdminDashboard';
import { fetchLibraryItems, fetchReferenceUrls, useReferenceUrl, useReferenceUrls } from '../../lib/creattia/reference-urls';
import type { ActiveBatch, AppProfile, AppSession, DemoSession, Generation, LightboxState, Product, View } from './app-types';
import { ACTIVE_BATCH_KEY, FAVORITES_KEY, HISTORY_KEY, PRODUCTS_KEY, PROFILE_KEY, SESSION_KEY, defaultProfile, loadLocal, saveLocal, scopedKey } from './app-storage';
import { firstName, getSessionEmail, getSessionId, getSessionToken, planLabel } from './app-session';
import { fileAsDataUrl, mapProduct } from './app-products';
import { demoProducts } from './demo-mode';
import { Icon } from './Icon';
import { AccountSetupError, AuthScreen } from './screens/AuthScreen';
import { BrandsManager } from './screens/Brands';
import { Dashboard } from './screens/Dashboard';
import { DiscoverPage } from './screens/Discover';
import { ImageLightbox } from './screens/History';
import { Library } from './screens/Library';
import { Plans } from './screens/Plans';
import { SavedAds } from './screens/SavedAds';
import { GenerationView, Studio } from './screens/Studio';
import { History } from './screens/History';


export default function CreativeApp() {
	const [booting, setBooting] = useState(true);
	const [accountLoading, setAccountLoading] = useState(true);
	const [accountError, setAccountError] = useState('');
	const [session, setSession] = useState<AppSession | null>(null);
	const [profile, setProfile] = useState<AppProfile>(defaultProfile);
	const canUseVideos = canAccessVideoFeature(getSessionEmail(session));

	// Presencia liviana para que el Centro admin pueda distinguir usuarios
	// conectados ahora de quienes simplemente iniciaron sesión alguna vez.
	useEffect(() => {
		const token = getSessionToken(session);
		if (!token || !isSupabaseConfigured) return undefined;
		let stopped = false;
		const ping = () => {
			if (stopped || document.visibilityState !== 'visible') return;
			void fetch('/api/creativos/presence', { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
		};
		ping();
		const interval = window.setInterval(ping, 60_000);
		window.addEventListener('focus', ping);
		document.addEventListener('visibilitychange', ping);
		return () => {
			stopped = true;
			window.clearInterval(interval);
			window.removeEventListener('focus', ping);
			document.removeEventListener('visibilitychange', ping);
		};
	}, [session]);
	const [view, setView] = useState<View>(() => {
		if (typeof window === 'undefined') return 'home';
		const params = new URLSearchParams(window.location.search);
		return params.has('plan') || params.get('subscription') === 'return' ? 'plans' : 'home';
	});
	const [viewHistory, setViewHistory] = useState<View[]>([]);
	const [openedFromView, setOpenedFromView] = useState<View | null>(null);

	// URL de producto pegada en la landing: si hace falta confirmar el email o
	// entrar con Google, la vuelta pisa el ?batchUrl= de la URL. Se guarda en
	// localStorage ANTES de que eso pase, así sobrevive al viaje de ida y
	// vuelta y el usuario cae directo con su producto ya cargado.
	const [pendingProductUrl, setPendingProductUrl] = useState('');
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const params = new URLSearchParams(window.location.search);
		const fromQuery = params.get('batchUrl') || params.get('url');
		if (fromQuery) {
			try { localStorage.setItem('creattia_pending_url', fromQuery); } catch { /* storage bloqueado */ }
			setPendingProductUrl(fromQuery);
			return;
		}
		try {
			const stored = localStorage.getItem('creattia_pending_url');
			if (stored) setPendingProductUrl(stored);
		} catch { /* storage bloqueado */ }
	}, []);

	// Favoritos y carpetas se guardan en localStorage, pero SIEMPRE con el id de
	// la cuenta activa en la clave (ver sessionUserIdRef más abajo): sin eso, dos
	// cuentas distintas en el mismo navegador terminan viendo lo del otro.
	const [likedImageIds, setLikedImageIds] = useState<string[]>([]);
	const [folders, setFolders] = useState<Array<{ id: string; name: string; imageIds: string[] }>>([]);

	useEffect(() => {
		localStorage.setItem(`creattia_liked_images:${sessionUserIdRef.current || 'anon'}`, JSON.stringify(likedImageIds));
	}, [likedImageIds]);

	useEffect(() => {
		localStorage.setItem(`creattia_folders:${sessionUserIdRef.current || 'anon'}`, JSON.stringify(folders));
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

	const [stuckCount, setStuckCount] = useState(0);

	// Al entrar se consulta si quedaron generaciones colgadas de una sesión previa
	// (pestaña cerrada a mitad del lote, worker cortado) para ofrecer limpiarlas.
	useEffect(() => {
		if (!session) return;
		const token = getSessionToken(session);
		if (!token) return;
		let active = true;
		void fetch('/api/creativos/cleanup-stuck', { headers: { authorization: `Bearer ${token}` } })
			.then((response) => response.json())
			.then((payload) => { if (active && typeof payload?.stuck === 'number') setStuckCount(payload.stuck); })
			.catch(() => { /* no es crítico */ });
		return () => { active = false; };
	}, [session]);

	/**
	 * Borra una o varias generaciones de una sola vez (un carrusel entero, o una
	 * selección múltiple). Un solo confirm y un solo delete en lote — antes se
	 * llamaba una vez por imagen, así que borrar un carrusel de 6 páginas
	 * disparaba 6 confirms seguidos y, si el usuario no los aceptaba todos,
	 * quedaban páginas sueltas sin borrar.
	 */
	async function deleteImage(imgIds: string | string[]) {
		const ids = Array.isArray(imgIds) ? imgIds : [imgIds];
		if (!ids.length) return;
		const confirmDelete = window.confirm(ids.length > 1 ? `¿Eliminar estas ${ids.length} imágenes?` : '¿Estás seguro de que quieres eliminar esta imagen?');
		if (!confirmDelete) return;

		try {
			if (isSupabaseConfigured && supabase) {
				const { error } = await supabase.from('creative_generations').delete().in('id', ids);
				if (error) throw error;
			}
			const idSet = new Set(ids);
			const nextHistory = history.filter(item => !idSet.has(item.id));
			setHistory(nextHistory);
			if (!isSupabaseConfigured) {
				saveLocal(HISTORY_KEY, nextHistory);
			}
			setToast(ids.length > 1 ? `${ids.length} imágenes eliminadas.` : "Imagen eliminada correctamente.");
		} catch (err) {
			alert(err instanceof Error ? err.message : "Error al eliminar la imagen.");
		}
	}

	/**
	 * Cierra las generaciones que quedaron colgadas en 'processing' y devuelve los
	 * créditos. Pasa a 'failed', que ya no se muestra en la grilla.
	 */
	async function cleanupStuck(generationId?: string) {
		const token = getSessionToken(session);
		if (!token) return;
		try {
			const response = await fetch('/api/creativos/cleanup-stuck', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
				// remove: se borran de verdad, no quedan como fallidas ocupando lugar.
				body: JSON.stringify(generationId ? { generationId, remove: true } : { remove: true }),
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || 'No se pudo limpiar.');
			const closed: string[] = payload.ids || [];
			if (closed.length) {
				setHistory((prev) => prev.filter((item) => !closed.includes(item.id)));
				setStuckCount(0);
				if (supabase) {
					const { data: profileRow } = await supabase.from('creative_profiles').select('credits_remaining').maybeSingle();
					if (profileRow) setProfile((prev) => ({ ...prev, credits: profileRow.credits_remaining ?? prev.credits }));
				}
				setToast(closed.length === 1
					? 'Generación eliminada.'
					: `${closed.length} generaciones sin imagen eliminadas.`);
			} else {
				setToast('No hay generaciones pendientes para cerrar.');
			}
		} catch (error) {
			setToast(error instanceof Error ? error.message : 'No se pudo limpiar.');
		}
	}

	function navigateTo(nextView: View) {
		setViewHistory((prev) => [...prev, view]);
		setView(nextView);
		import('../../lib/creattia/sfx').then(({ sfx }) => sfx.playClick());
	}

	function goBack() {
		import('../../lib/creattia/sfx').then(({ sfx }) => sfx.playClick());
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
	const [lightbox, setLightbox] = useState<LightboxState | null>(null);
	const openLightbox = (item: Generation, slides?: Generation[]) => setLightbox({ item, slides });

	// Bloquear el scroll del fondo cuando hay un modal abierto
	useEffect(() => {
		const locked = Boolean(lightbox) || mobileMenu;
		document.body.style.overflow = locked ? 'hidden' : '';
		return () => { document.body.style.overflow = ''; };
	}, [lightbox, mobileMenu]);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [favorites, setFavorites] = useState<Set<number>>(new Set());
	const [products, setProducts] = useState<Product[]>([]);
	const [creationProductIds, setCreationProductIds] = useState<string[]>([]);
	const [toast, setToast] = useState('');
	const [preselectedTemplateId, setPreselectedTemplateId] = useState<number | null>(null);
	const [sidebarMinimized, setSidebarMinimized] = useState(false);
	const [randomWinners, setRandomWinners] = useState<any[]>([]);
	const [swipePool, setSwipePool] = useState<any[]>([]);
	const [discoverSeen, setDiscoverSeen] = useState<Set<string>>(() => new Set(loadLocal<string[]>('creattia-discover-seen-v1', [])));
	const markDiscoverSeen = (path: string) => {
		setDiscoverSeen((previous) => {
			const next = new Set(previous);
			next.add(path);
			const asArray = [...next].slice(-400);
			saveLocal('creattia-discover-seen-v1', asArray);
			return new Set(asArray);
		});
	};
	const [scrapedWinners, setScrapedWinners] = useState<any[]>([]);
	const [likedScrapedPaths, setLikedScrapedPaths] = useState<Set<string>>(new Set());
	const [preselectedWinnerPath, setPreselectedWinnerPath] = useState<string | null>(null);

	// Carga únicamente la muestra autorizada por el endpoint de biblioteca. Los
	// usuarios gratuitos nunca reciben el manifiesto completo en el navegador.
	// se cargan aparte, por cuenta, en el efecto que reacciona a `session`.
	useEffect(() => {
		if (!session && isSupabaseConfigured) return;
		async function loadRandomWinners() {
			try {
				const headers = getSessionToken(session) ? { authorization: `Bearer ${getSessionToken(session)}` } : undefined;
				const res = isSupabaseConfigured ? await fetch('/api/creativos/library?discover=1', { headers }) : await fetch('/scraped_ads/manifest.json');
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
				setSwipePool(shuffled.slice(0, 120));
			} catch {
				// silent fail — winners are optional on dashboard
			}
		}
		void loadRandomWinners();
	}, [session]);

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
			setLikedImageIds([]);
			setFolders([]);
			setLikedScrapedPaths(new Set());
			return;
		}
		const activeSession = session;
		const profileId = getSessionId(activeSession) || 'anon';
		let active = true;
		// Favoritos, carpetas y guardados de la biblioteca son locales al
		// navegador, pero por cuenta: se recargan con la clave de ESTE usuario
		// cada vez que cambia la sesión, para no arrastrar datos de otra cuenta.
		setLikedImageIds(loadLocal<string[]>(`creattia_liked_images:${profileId}`, []));
		setFolders(loadLocal<Array<{ id: string; name: string; imageIds: string[] }>>(`creattia_folders:${profileId}`, []));
		// Primero la caché local (respuesta inmediata) y después lo que hay en la
		// cuenta, que es lo que sobrevive a limpiar el navegador o cambiar de
		// dispositivo. Se unen: un like hecho offline no se pierde.
		const cachedLikes = loadLocal<string[]>(`creattia-liked-scraped-v1:${profileId}`, []);
		setLikedScrapedPaths(new Set(cachedLikes));
		if (isSupabaseConfigured && supabase) {
			void (async () => {
				const { data, error } = await supabase.from('creative_winner_favorites')
					.select('image_path').eq('user_id', profileId);
				if (error) { console.error('No se pudieron leer los guardados de la cuenta:', error); return; }
				const remote = (data || []).map((row) => row.image_path as string);
				const merged = [...new Set([...cachedLikes, ...remote])];
				setLikedScrapedPaths(new Set(merged));
				saveLocal(`creattia-liked-scraped-v1:${profileId}`, merged);
				// Lo que estaba solo en el navegador sube a la cuenta una vez.
				const missing = cachedLikes.filter((path) => !remote.includes(path));
				if (missing.length) {
					await supabase.from('creative_winner_favorites')
						.upsert(missing.map((path) => ({ user_id: profileId, image_path: path })), { onConflict: 'user_id,image_path' });
				}
			})();
		}
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
					// Catálogo y perfil en paralelo: son lo único que bloquea la UI.
					const [templatesResult, profileResult, overrideResult] = await Promise.all([
						client.from('creative_templates').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
						client.from('creative_profiles').select('*').eq('user_id', profileId).maybeSingle(),
						client.from('creative_admin_access_overrides').select('access_mode,plan_code,credits_override').eq('user_id', profileId).maybeSingle(),
					]);
					const { data: templateRecords, error: templateError } = templatesResult;
					if (templateError) {
						// El catálogo local es un fallback válido: una tabla opcional
						// ausente o con una migración pendiente no debe bloquear el login.
						console.warn('No se pudo cargar el catálogo de plantillas:', templateError.message);
					} else if (templateRecords?.length) {
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
					const isUserAdmin = isAdminEmail(activeSession?.user?.email);
					const accessOverride = overrideResult.error ? null : overrideResult.data;
					const isUnlimited = isUserAdmin || accessOverride?.access_mode === 'unlimited';
					const effectiveCredits = isUnlimited ? 99999 : (accessOverride?.credits_override ?? data.credits_remaining ?? 0);
					const effectiveMonthlyCredits = isUnlimited ? 99999 : (accessOverride?.credits_override ?? data.credits_monthly ?? 0);
					setProfile({
						fullName: data.full_name || '',
						brandName: data.brand_name || '',
						website: data.website_url || '',
						instagram: data.instagram_handle || '',
						primaryColor: data.brand_colors?.[0] || '#18181b',
						secondaryColor: data.brand_colors?.[1] || '#f4f0ff',
						credits: effectiveCredits,
						monthlyCredits: effectiveMonthlyCredits,
						subscriptionStatus: isUnlimited || accessOverride?.access_mode === 'plan' ? 'authorized' : (data.subscription_status || 'trial'),
						planCode: isUserAdmin ? 'admin' : (accessOverride?.plan_code || data.plan_code || 'trial'),
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

				// Estas consultas son secundarias. Un fallo de esquema, permisos o red
				// no debe impedir que la persona entre a su cuenta.
				try {
					const { data: favoriteRecords, error: favoritesError } = await supabase.from('creative_template_favorites').select('template_id');
					if (favoritesError) console.warn('No se pudieron cargar los favoritos:', favoritesError.message);
					else if (favoriteRecords) setFavorites(new Set(favoriteRecords.map((item) => Number(item.template_id))));
				} catch (error) {
					console.warn('No se pudieron cargar los favoritos:', error);
				}

				try {
					const { data: records, error: generationsError } = await supabase.from('creative_generations')
						.select('id,title,output_path,format,created_at,template_id,variant_key,image_type,product_id,batch_id,output_index,settings_snapshot,status')
						.in('status', ['completed', 'processing'])
						.order('created_at', { ascending: false }).limit(150);

					if (generationsError) {
						console.warn('No se pudo cargar el historial:', generationsError.message);
					} else if (records?.length) {
						const signedByPath = await signGenerationPaths(client, records.map((record: any) => record.output_path), { thumb: true });
						const mapped = records.map((record: any) => {
							const imgUrl = record.output_path ? signedByPath.get(record.output_path) || '' : '';

							const creative = loadedCatalog.find((item) => item.id === record.template_id);
							return {
								id: record.id,
								title: record.title,
								imageUrl: imgUrl,
								outputPath: record.output_path || null,
								format: record.format,
								createdAt: record.created_at || new Date().toISOString(),
								category: creative ? ringMeta[creative.ring]?.label : 'Creativo',
								templateId: record.template_id,
								preset: record.variant_key || record.settings_snapshot?.preset || 'fiel',
								imageType: record.image_type || record.settings_snapshot?.imageType || 'product',
								productId: record.product_id || record.settings_snapshot?.productId || '',
								productIds: record.settings_snapshot?.productIds || (record.product_id ? [record.product_id] : []),
								batchId: record.batch_id || record.id,
								outputIndex: record.output_index || 1,
								referencePath: record.settings_snapshot?.referencePath || '',
								referenceName: record.settings_snapshot?.referenceName || '',
								status: record.status || (imgUrl ? 'completed' : 'processing'),
							};
						});
						setHistory(mapped);
					}
				} catch (error) {
					console.warn('No se pudo cargar el historial:', error);
				}

				const token = getSessionToken(activeSession);
				if (token) {
					try {
						const response = await fetch('/api/creativos/products', { headers: { authorization: `Bearer ${token}` } });
						const payload = await response.json().catch(() => ({}));
						if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el catálogo.');
						setProducts((payload.products || []).map(mapProduct));
					} catch (error) {
						console.warn('No se pudo cargar el catálogo:', error);
					}
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

	// Polling global continuo: mantiene actualizadas las imágenes en Mis Imágenes (History) sin importar en qué pantalla esté el usuario
	useEffect(() => {
		if (!session || !isSupabaseConfigured || !supabase) return;
		const client = supabase;
		let active = true;

		// Reanudación: filas que quedaron en 'processing' sin nadie generándolas
		// (recarga de página, pestaña cerrada, worker cortado). Se les vuelve a
		// disparar el worker una sola vez por sesión de app.
		const resumed = new Set<string>();
		const resumeStuck = async (rows: Array<{ id: string; status: string; created_at: string | null }>) => {
			const token = getSessionToken(session);
			if (!token) return;
			const stuck = rows
				.filter((row) => row.status === 'processing' && !resumed.has(row.id))
				// Una generación normal tarda ~60s y en calidad alta ~180s: con el
				// umbral en 60s se relanzaba trabajo sano y dos workers escribían la
				// misma imagen. Se espera bastante más que el peor caso.
				.filter((row) => Date.now() - new Date(row.created_at || Date.now()).getTime() > 6 * 60_000);
			if (!stuck.length) return;
			stuck.forEach((row) => resumed.add(row.id));
			void driveBatchWorkers(stuck.map((row) => row.id), token);
		};

		const interval = setInterval(async () => {
			try {
				const { data: records } = await client.from('creative_generations')
					.select('id,title,output_path,format,created_at,template_id,status,error_code,settings_snapshot')
					// Las fallidas no se muestran: cerrar una pendiente la marca
					// 'failed' y así desaparece de la grilla.
					.in('status', ['completed', 'processing'])
					.order('created_at', { ascending: false })
					.limit(50);

				if (!active || !records || records.length === 0) return;

				void resumeStuck(records as any);
				const signedByPath = await signGenerationPaths(client, records.map((record: any) => record.output_path), { thumb: true });
				if (!active) return;

				setHistory((prev) => {
					const map = new Map(prev.map(item => [item.id, item]));
					let changed = false;

					for (const r of records) {
						const imgUrl = r.output_path ? signedByPath.get(r.output_path) || '' : '';

						const existing = map.get(r.id);
						if (!existing) {
							changed = true;
							map.set(r.id, {
								id: r.id,
								title: r.title,
								imageUrl: imgUrl,
								format: r.format,
								createdAt: r.created_at || new Date().toISOString(),
								category: 'Creativo',
								templateId: r.template_id,
								referencePath: (r as any).settings_snapshot?.referencePath || '',
								referenceName: (r as any).settings_snapshot?.referenceName || '',
								status: imgUrl ? 'completed' : r.status,
							} as any);
						} else if ((existing as any).status !== r.status || (!existing.imageUrl && imgUrl)) {
							// La URL firmada cambia en cada poll: comparar por URL haría
							// re-renderizar (y recargar la imagen) cada 2,5 segundos.
							changed = true;
							map.set(r.id, {
								...existing,
								imageUrl: imgUrl || existing.imageUrl,
								status: imgUrl ? 'completed' : r.status,
							} as any);
						}
					}

					if (!changed) return prev;
					return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
				});
			} catch (e) {
				console.warn('Global history poll err:', e);
			}
		}, 2500);

		return () => {
			active = false;
			clearInterval(interval);
		};
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
		// El localStorage queda como caché para que la grilla no parpadee al
		// recargar, pero la fuente de verdad es la cuenta.
		saveLocal(`creattia-liked-scraped-v1:${sessionUserIdRef.current || 'anon'}`, Array.from(next));
		setToast(wasLiked ? 'Quitado de guardados.' : 'Guardado en tu biblioteca.');

		const userId = sessionUserIdRef.current;
		if (!isSupabaseConfigured || !supabase || !userId) return;
		void (async () => {
			const result = wasLiked
				? await supabase.from('creative_winner_favorites').delete().eq('user_id', userId).eq('image_path', path)
				: await supabase.from('creative_winner_favorites').upsert({ user_id: userId, image_path: path }, { onConflict: 'user_id,image_path' });
			if (result.error) {
				console.error('No se pudo guardar el favorito en la cuenta:', result.error);
				setToast('Se guardó en este dispositivo, pero no pudimos sincronizarlo con tu cuenta.');
			}
		})();
	};

	// `scrapedWinners` es la muestra de descubrimiento: cuatro anuncios, uno por
	// ángulo. Alcanza para el panel de inicio, pero no para los guardados, donde
	// puede estar guardado cualquiera de los cientos del catálogo. Cuando hay algo
	// guardado se trae el catálogo completo una sola vez, para poder mostrar el
	// nombre y la categoría de cada uno.
	const [winnerCatalog, setWinnerCatalog] = useState<any[]>([]);
	const winnerCatalogRequested = useRef(false);
	useEffect(() => {
		if (!likedScrapedPaths.size || winnerCatalogRequested.current) return;
		if (!isSupabaseConfigured || !supabase) return;
		winnerCatalogRequested.current = true;
		void (async () => {
			const items = await fetchLibraryItems(supabase!);
			if (items.length) setWinnerCatalog(items as any[]);
		})();
	}, [likedScrapedPaths.size]);

	const winnerPool = useMemo(() => {
		if (!winnerCatalog.length) return scrapedWinners;
		const byPath = new Map<string, any>();
		for (const item of [...scrapedWinners, ...winnerCatalog]) {
			if (item?.imagePath && !byPath.has(item.imagePath)) byPath.set(item.imagePath, item);
		}
		return Array.from(byPath.values());
	}, [scrapedWinners, winnerCatalog]);

	const likedWinners = useMemo(() => {
		const seen = new Set();
		return winnerPool.filter(item => {
			if (!item.imagePath || !likedScrapedPaths.has(item.imagePath)) return false;
			if (seen.has(item.imagePath)) return false;
			seen.add(item.imagePath);
			return true;
		});
	}, [winnerPool, likedScrapedPaths]);

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
			// Persistir también la marca del formulario en creative_brands evita que
			// quede únicamente en creative_profiles y permite reutilizarla o
			// reemplazarla desde "Mis marcas" sin perder sus datos.
			if (finalProfile.brandName.trim()) {
				const response = await fetch('/api/creativos/brands', {
					method: 'PATCH',
					headers: { authorization: `Bearer ${getSessionToken(session)}`, 'content-type': 'application/json' },
					body: JSON.stringify({
						action: 'sync_profile',
						name: finalProfile.brandName,
						website_url: finalProfile.website,
						brand_colors: [finalProfile.primaryColor, finalProfile.secondaryColor],
						...(logoPath ? { logo_path: logoPath } : {}),
						brand_style: { styleSummary: finalProfile.brandSummary },
					}),
				});
				const payload = await response.json().catch(() => ({}));
				if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la marca en tu cuenta.');
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
	async function startBatchTracking(
		batch: { batchId: string; title: string; referenceUrl?: string; count: number },
		options?: { stay?: boolean },
	) {
		const record: ActiveBatch = { ...batch, startedAt: Date.now(), status: 'processing', results: [] };
		setActiveBatch(record);
		// Siempre a "Mis imágenes": es donde el usuario espera encontrar lo que se
		// está generando, y ahí está la barra del lote más el progreso por imagen.
		if (!options?.stay) setView('history');
		try {
			window.localStorage.setItem(scopedKey(ACTIVE_BATCH_KEY, sessionUserIdRef.current), JSON.stringify({
				batchId: batch.batchId, title: batch.title, referenceUrl: batch.referenceUrl || '', count: batch.count, startedAt: record.startedAt,
			}));
		} catch { /* almacenamiento lleno o bloqueado: solo perdemos la reanudación */ }
		if (supabase) {
			try {
				const { data: rows } = await supabase
					.from('creative_generations')
					.select('id,title,format,created_at,template_id,batch_id,output_index,status,settings_snapshot')
					.eq('batch_id', batch.batchId)
					.order('output_index');
				if (rows?.length) {
					const placeholders: Generation[] = rows.map((row: any) => ({
						id: row.id,
						title: row.title || batch.title,
						imageUrl: '',
						format: row.format || 'square',
						createdAt: row.created_at || new Date().toISOString(),
						category: 'Creativo',
						templateId: row.template_id,
						batchId: row.batch_id || batch.batchId,
						outputIndex: row.output_index,
						status: row.status || 'processing',
						referencePath: row.settings_snapshot?.referencePath || '',
						referenceName: row.settings_snapshot?.referenceName || '',
					} as Generation));
					setHistory((previous) => {
						const byId = new Map(previous.map((item) => [item.id, item]));
						for (const placeholder of placeholders) {
							const existing = byId.get(placeholder.id);
							byId.set(placeholder.id, existing ? { ...placeholder, ...existing } : placeholder);
						}
						return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
					});
				}
			} catch (error) {
				console.warn('No se pudieron precargar las tarjetas del lote:', error);
			}
		}
	}

	// Reanudar un lote pendiente al volver a la app (otro tab, recarga, etc.)
	useEffect(() => {
		if (!session || !isSupabaseConfigured || !supabase) return;
		const batchKey = scopedKey(ACTIVE_BATCH_KEY, getSessionId(session));
		const raw = window.localStorage.getItem(batchKey);
		if (!raw) return;
		try {
			const saved = JSON.parse(raw);
			if (!saved?.batchId || Date.now() - (saved.startedAt || 0) > 20 * 60 * 1000) {
				window.localStorage.removeItem(batchKey);
				return;
			}
			setActiveBatch({ ...saved, status: 'processing', results: [] });
		} catch {
			window.localStorage.removeItem(batchKey);
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
				.select('id,status,output_path,error_code,title,format,template_id,batch_id,output_index,created_at,image_type,variant_key,product_id,settings_snapshot')
				.eq('batch_id', batch.batchId).order('output_index');
			if (cancelled || error || !data?.length) return;

			const signedByPath = await signGenerationPaths(client, data.map((row: any) => row.output_path), { thumb: true });
			if (cancelled) return;

			// Actualizar en tiempo real los items en el historial (history)
			const updatedGenerations: Generation[] = [];
			for (const row of data) {
				const imgUrl = row.output_path ? signedByPath.get(row.output_path) || '' : '';

				updatedGenerations.push({
					id: row.id,
					title: row.title,
					imageUrl: imgUrl,
					format: row.format,
					createdAt: row.created_at || new Date().toISOString(),
					category: 'Creativo',
					templateId: row.template_id,
					preset: row.variant_key || '',
					imageType: row.image_type || 'product',
					productId: row.product_id || '',
					productIds: row.settings_snapshot?.productIds || [],
					batchId: row.batch_id,
					outputIndex: row.output_index,
					referencePath: row.settings_snapshot?.referencePath || '',
					referenceName: row.settings_snapshot?.referenceName || '',
					error: row.error_code || '',
					status: row.status,
				} as any);
			}

			if (updatedGenerations.length) {
				setHistory((prev) => {
					const existingMap = new Map(prev.map(item => [item.id, item]));
					for (const item of updatedGenerations) {
						const existing = existingMap.get(item.id);
						// Se conserva la URL firmada anterior: al re-firmar en cada poll
						// el <img> se recargaría y la tarjeta parpadearía.
						existingMap.set(item.id, existing?.imageUrl && item.imageUrl
							? { ...item, imageUrl: existing.imageUrl }
							: item);
					}
					return Array.from(existingMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
				});
			}

			if (data.some((row) => row.status === 'processing')) return;

			const failedRows = data.filter((row) => row.status === 'failed');
			const completedRows = updatedGenerations.filter((item) => item.imageUrl && (item as any).status === 'completed');

			const { data: profileRow } = await client.from('creative_profiles').select('credits_remaining').maybeSingle();
			if (profileRow) setProfile((prev) => ({ ...prev, credits: profileRow.credits_remaining ?? prev.credits }));
			
			const nextStatus = completedRows.length ? 'completed' : 'failed';
			setActiveBatch({
				...batch,
				status: nextStatus,
				results: completedRows,
				error: completedRows.length ? '' : (failedRows[0]?.error_code || 'No se pudo generar la imagen.'),
			});
			window.localStorage.removeItem(scopedKey(ACTIVE_BATCH_KEY, sessionUserIdRef.current));
			setToast(completedRows.length ? '¡Tu lote de anuncios está listo en Mis imágenes!' : 'La generación falló.');

			if (completedRows.length) {
				import('../../lib/creattia/confetti').then(({ triggerConfetti }) => triggerConfetti());
				window.setTimeout(() => {
					setActiveBatch(curr => curr && curr.batchId === batch.batchId && curr.status === 'completed' ? null : curr);
				}, 5000);
			}
		};
		void poll();
		const interval = window.setInterval(() => { void poll(); }, 5000);
		return () => { cancelled = true; window.clearInterval(interval); };
	}, [activeBatch?.batchId, activeBatch?.status]);
	if (booting || (session && accountLoading)) return <div className="studio-boot"><span className="studio-spinner" style={{ width: '40px', height: '40px', borderWidth: '4px' }} aria-hidden="true" /><p>Preparando tu estudio…</p></div>;
	if (!session) return <AuthScreen onSession={(nextSession) => { setAccountLoading(true); setSession(nextSession); }} />;
	if (accountError) return <AccountSetupError message={accountError} onRetry={() => window.location.reload()} onLogout={logout} />;
		const navItems: Array<{ id: View; label: string; icon: string }> = [
			{ id: 'home', label: 'Inicio', icon: 'home' },
			{ id: 'winners', label: 'Biblioteca de ganadores', icon: 'spark' },
			{ id: 'saved', label: 'Anuncios guardados', icon: 'heart' },
			{ id: 'history', label: 'Mis imágenes', icon: 'history' },
			...(isAdminEmail(getSessionEmail(session)) ? [{ id: 'admin' as View, label: 'Centro admin', icon: 'settings' }] : []),
		];

	return (
		<div className={`creative-app-shell ${sidebarMinimized ? 'sidebar-minimized' : ''}`}>
			{toast && <div className="studio-toast"><span><Icon name="check" size={16}/></span>{toast}</div>}
			{lightbox && <ImageLightbox
				item={lightbox.item}
				slides={lightbox.slides}
				session={session}
				onClose={() => setLightbox(null)}
				onStarted={startBatchTracking}
				onGenerationRequested={() => { setLightbox(null); setView('history'); }}
				products={products}
				onProductsChanged={refreshProducts}
				isReferenceLiked={Boolean(lightbox.item.referencePath && likedScrapedPaths.has(lightbox.item.referencePath))}
				onToggleReferenceLike={toggleLikedScraped}
				onUseReference={(path) => {
					setLightbox(null);
					setPreselectedWinnerPath(path);
					setOpenedFromView('history');
					navigateTo('winners');
					window.scrollTo({ top: 0, behavior: 'smooth' });
				}}
			/>}
			{activeBatch && view !== 'generation' && activeBatch.status !== 'failed' && (
				<div className="active-batch-notice" style={{ position: 'fixed', bottom: '18px', right: '18px', zIndex: 80, display: 'flex', alignItems: 'center', gap: '8px' }}>
					<button
						onClick={() => navigateTo('generation')}
						style={{
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
					<button
						onClick={() => setActiveBatch(null)}
						style={{
							width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #dcd5e4',
							background: '#fff', color: '#19171d', fontWeight: 'bold',
							cursor: 'pointer', display: 'grid', placeItems: 'center',
							boxShadow: '0 10px 28px rgba(0,0,0,0.2)', fontSize: '12px',
							transition: 'all 0.2s'
						}}
						title="Cerrar aviso"
					>
						✕
					</button>
				</div>
			)}
			<div className={`studio-mobile-scrim ${mobileMenu ? 'is-open' : ''}`} onClick={() => setMobileMenu(false)} />
			<aside className={`studio-sidebar ${mobileMenu ? 'is-open' : ''}`}>
				<div style={{ display: 'flex', flexDirection: sidebarMinimized ? 'column' : 'row', alignItems: 'center', justifyContent: sidebarMinimized ? 'center' : 'space-between', gap: sidebarMinimized ? '6px' : 0, paddingRight: sidebarMinimized ? 0 : '10px', marginBottom: '10px' }}>
					<button 
						className="studio-logo" 
						onClick={() => navigateTo('home')} 
						aria-label="Volver a Inicio" 
						style={{ marginBottom: 0, border: 0, background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
					>
						<span><img src="/images/creattia/avatar-nobg.webp" alt=""/></span>
						{!sidebarMinimized && <div><strong>Creattia</strong></div>}
					</button>
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
					<button
						className="studio-brand-nav-btn"
						onClick={() => setSettingsOpen(!settingsOpen)}
						style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '10px 14px', background: settingsOpen ? '#ece9f1' : 'transparent', border: 0, borderRadius: '10px', cursor: 'pointer', color: '#5b5561', fontWeight: 700, fontSize: '14px', textAlign: 'left', marginBottom: '10px' }}
					>
						<Icon name="settings"/>
						{!sidebarMinimized && <>
							<span>Configuración</span>
							<i style={{ marginLeft: 'auto', display: 'inline-flex', transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .18s ease', color: '#9d97a6' }}>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
							</i>
						</>}
					</button>
					{settingsOpen && !sidebarMinimized && (
						<div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '2px 0 10px', paddingLeft: '12px' }}>
							<button className="studio-settings-item" onClick={() => { navigateTo('plans'); setSettingsOpen(false); }}>
								<Icon name="card" size={15}/>Planes y suscripción
							</button>
							<button className="studio-settings-item" onClick={() => { alert('Historial de pagos: no tenés facturas todavía.'); }}>
								<Icon name="history" size={15}/>Historial de pagos
							</button>
							<div style={{ height: '1px', background: '#e7e2ec', margin: '4px 10px' }} />
							<button className="studio-settings-item danger" onClick={() => { void logout(); }}>
								<Icon name="logout" size={15}/>Cerrar sesión
							</button>
						</div>
					)}
					{!sidebarMinimized && (
						<div className="studio-plan-card">
							<div><span className="studio-plan-orb"><Icon name="spark" size={15}/></span><small>PLAN ACTUAL</small></div>
							<strong>{planLabel(profile)}</strong>
					<p><span style={{ width: `${Math.min(100, profile.credits / (profile.monthlyCredits || 1) * 100)}%` }}/></p>
							<footer><span>{profile.credits} {profile.credits === 1 ? 'generación' : 'generaciones'}</span><button onClick={() => navigateTo('plans')}>Ver planes</button></footer>
						</div>
					)}
					

					<div 
						className="studio-user" 
						onClick={() => setSettingsOpen(!settingsOpen)} 
						style={{ cursor: 'pointer', position: 'relative' }}
					>
						<span>{firstName(profile, getSessionEmail(session)).slice(0, 1).toUpperCase()}</span>
						{!sidebarMinimized && (
							<>
								<div style={{ flex: 1, minWidth: 0, paddingRight: '10px' }}>
									<strong style={{ display: 'flex', alignItems: 'center', gap: '7px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
										{profile.fullName || 'Mi cuenta'}
										{isAdminEmail(getSessionEmail(session)) && <span style={{ padding: '2px 7px', borderRadius: '6px', background: '#19171d', color: '#fff', fontSize: '9.5px', fontWeight: 900, letterSpacing: '.08em' }}>ADMIN</span>}
									</strong>
									<small style={{ display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{getSessionEmail(session)}</small>
								</div>

							</>
						)}
					</div>
				</div>
			</aside>

			<main className="studio-main">
				<header className="studio-topbar">
					<button className="studio-menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menú"><Icon name="menu"/></button>
					<div className="studio-top-brand"><img src="/images/creattia/avatar-nobg.webp" alt=""/><strong>Creattia</strong></div>
					{!isSupabaseConfigured && <div className="studio-mode-badge"><span />Demo local</div>}
					<button className="studio-credit-pill" onClick={() => setView('plans')}><Icon name="spark" size={16}/><b>{profile.credits}</b><span>{profile.credits === 1 ? 'crédito' : 'créditos'}</span></button>
				</header>

				<div className="studio-content">
					{view === 'home' && (
						<Dashboard
							profile={profile}
							session={session}
							email={getSessionEmail(session)}
							pendingProductUrl={pendingProductUrl}
							onPendingProductUrlUsed={() => {
								setPendingProductUrl('');
								try { localStorage.removeItem('creattia_pending_url'); } catch { /* storage bloqueado */ }
							}}
							history={history}
							catalog={catalog} 
							onView={navigateTo} 
							onChoose={chooseCreative} 
							onReuse={reuseGeneration} 
							 onBatchCreated={(generations, batchId) => {
								const newItems: Generation[] = generations.map((g: any) => ({
									id: g.id,
									title: g.title || 'Anuncio desde URL',
									// Recién insertadas: todavía no tienen imagen. La tarjeta
									// arranca en 'processing' y el polling le pone la URL firmada.
									imageUrl: '',
									format: g.format || 'square',
									createdAt: new Date().toISOString(),
									category: 'producto',
									templateId: g.template_id,
									batchId: batchId,
									status: 'processing',
								}));

								setHistory((prev) => [...newItems, ...prev]);

								startBatchTracking({
									batchId,
									title: 'Generación por URL',
									referenceUrl: '',
									count: generations.length,
								});
							}}
							onGenerationRequested={() => setView('history')}
							randomWinners={randomWinners}
							swipePool={(swipePool.filter((item) => !discoverSeen.has(item.imagePath)).length >= 8 ? swipePool.filter((item) => !discoverSeen.has(item.imagePath)) : swipePool).slice(0, 40)}
							onDiscoverSeen={markDiscoverSeen}
							
							likedWinners={likedWinners}
							likedScrapedPaths={likedScrapedPaths}
							onToggleLikedScraped={toggleLikedScraped}
							onExpand={openLightbox}
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
							onGenerationRequested={() => setView('history')}
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
												onOpenPlans={() => setView('plans')}
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
							scrapedWinners={winnerPool}
							likedScrapedPaths={likedScrapedPaths}
							toggleLikedScraped={toggleLikedScraped}
							onUseScrapedWinner={(path) => {
								setPreselectedWinnerPath(path);
								setOpenedFromView('saved');
								navigateTo('winners');
							}}
							onExpand={openLightbox}
							onReuse={reuseGeneration}
						/>
					)}
					{view === 'studio' && <Studio creative={selected} reuseSeed={reuseSeed} initialProductIds={creationProductIds} onSeedConsumed={() => setCreationProductIds([])} profile={profile} session={session} products={products} onProductsChanged={refreshProducts} onChooseLibrary={goBack} onGenerated={addGenerations} onToast={setToast} onGenerationStarted={startBatchTracking} onGenerationRequested={() => setView('history')} />}
					{view === 'generation' && activeBatch && (
						<GenerationView
							batch={activeBatch}
							onBack={() => { goBack(); if (activeBatch.status !== 'processing') setActiveBatch(null); }}
							onReuse={(generation) => openLightbox(generation)}
							onHistory={() => { setActiveBatch(null); navigateTo('history'); }}
						/>
					)}
					{view === 'discover' && (
						<DiscoverPage
							pool={swipePool}
							likedPaths={likedScrapedPaths}
							onLike={toggleLikedScraped}
							onUse={(path) => { setPreselectedWinnerPath(path); setView('winners'); }}
							onBack={() => setView('home')}
							onSaved={() => setView('winners')}
						/>
					)}
					{view === 'history' && (
						<History 
							history={history} 
							onCreate={() => navigateTo('winners')} 
							onReuse={reuseGeneration} 
							onExpand={openLightbox}
							// Sin tarjetas sintéticas: las filas en 'processing' de la base ya
							// se dibujan como placeholder, con su id real y sobreviven a un
							// refresh. Pasar las dos cosas mostraba cada imagen dos veces.
							pending={activeBatch?.status === 'processing' ? { count: activeBatch.count, title: activeBatch.title, referenceUrl: activeBatch.referenceUrl, startedAt: activeBatch.startedAt } : null}
							onViewProgress={() => navigateTo('generation')}
							likedImageIds={likedImageIds}
							onToggleLike={toggleLike}
							likedReferencePaths={likedScrapedPaths}
							onToggleReferenceLike={toggleLikedScraped}
							onUseReference={(path) => {
								setPreselectedWinnerPath(path);
								setOpenedFromView('history');
								navigateTo('winners');
								window.scrollTo({ top: 0, behavior: 'smooth' });
							}}
							onDeleteImage={deleteImage}
							activeBatch={activeBatch}
							stuckCount={stuckCount}
							onCleanupStuck={cleanupStuck}
						/>
					)}
					{view === 'plans' && <Plans profile={profile} session={session} />}
					{view === 'brand' && (
						<div className="brand-workspace-stack">
							<BrandsManager session={session} planCode={profile.planCode} onPlans={() => navigateTo('plans')} />
							{canUseVideos && <AvatarManager session={session} />}
						</div>
					)}
					{view === 'admin' && isAdminEmail(getSessionEmail(session)) && <AdminDashboard session={session} />}
				</div>
			</main>
		</div>
	);
}
