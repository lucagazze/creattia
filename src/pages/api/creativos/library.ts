import type { APIRoute } from 'astro';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { buildDiscoverDeck, freePreviewAngleFor } from '../../../lib/creattia/library-access';

export const prerender = false;

const BUCKET = 'creative-references';
const MANIFEST_PATH = 'manifests/starter-static-50.json';
const PREVIEW_PER_ANGLE = 5;

/**
 * Tarjetas que arranca mostrando el descubridor.
 *
 * No es un tope de lo que la cuenta puede ver: apenas cargue el catálogo
 * completo, el front reemplaza este mazo por todo lo permitido. Es cuántas
 * necesita para que la sección tenga sentido desde el primer segundo sin
 * demorar la carga del inicio. Con 50 cubre la muestra gratuita entera.
 */
const DISCOVER_DECK = 50;
const STATIC_MEDIA_TYPES = new Set(['static_image', 'carousel']);

/**
 * El manifiesto, cacheado en el proceso.
 *
 * Son 3.182 anuncios que se bajaban de Storage y se parseaban en CADA carga de
 * la app y de CADA usuario, aunque el arranque solo necesite cuatro para el
 * panel. Era la petición más lenta del arranque (~580 ms) y la que retrasaba
 * que el menú fuera tocable.
 *
 * El contenido cambia solo cuando se republica la biblioteca, así que un TTL
 * corto es suficiente: la primera petición de cada instancia lo baja y el resto
 * lo reusa. No se cachea por usuario —el filtrado por plan sigue ocurriendo en
 * cada pedido—, solo el archivo.
 */
const MANIFEST_TTL_MS = 5 * 60 * 1000;
let manifestCache: { items: any[]; expira: number } | null = null;
let manifestEnVuelo: Promise<any[]> | null = null;

async function loadManifestItems(admin: ReturnType<typeof getAdminClient>): Promise<any[]> {
	if (manifestCache && manifestCache.expira > Date.now()) return manifestCache.items;
	// Si varias peticiones entran a la vez, una sola baja el archivo.
	if (manifestEnVuelo) return manifestEnVuelo;
	manifestEnVuelo = (async () => {
		const { data, error } = await admin!.storage.from(BUCKET).download(MANIFEST_PATH);
		if (error || !data) throw new Error('manifiesto no disponible');
		const parsed = JSON.parse(await data.text());
		const items = (parsed.items || []).filter((item: any) => {
			const mediaType = item.metadata?.mediaType || 'static_image';
			return item.imagePath && STATIC_MEDIA_TYPES.has(mediaType);
		});
		manifestCache = { items, expira: Date.now() + MANIFEST_TTL_MS };
		return items;
	})();
	try {
		return await manifestEnVuelo;
	} finally {
		manifestEnVuelo = null;
	}
}
const ANGLES = new Set([
	'producto',
	'competencia',
	'resenas',
	'precio',
	'razones-porque',
	'caracteristicas',
	'antes-despues',
	'noticias',
	'estadisticas',
	'estacional',
]);

function angleFor(item: any) {
	const leaf = String(item.categoryLeaf || item.category || '').toLowerCase().trim();
	const legacy: Record<string, string> = {
		hero: 'producto',
		mitos: 'razones-porque',
		urgencia: 'precio',
		envio: 'precio',
		garantia: 'razones-porque',
	};
	const normalized = legacy[leaf] || leaf;
	return ANGLES.has(normalized) ? normalized : 'producto';
}

function sortForPreview(left: any, right: any) {
	const quality = (Number(right.qualityScore) || Number(right.metadata?.qualityScore) || 0)
		- (Number(left.qualityScore) || Number(left.metadata?.qualityScore) || 0);
	if (quality) return quality;
	const curated = (Number(right.metadata?.curationScore) || 0) - (Number(left.metadata?.curationScore) || 0);
	if (curated) return curated;
	const order = (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0);
	if (order) return order;
	return String(left.imagePath || '').localeCompare(String(right.imagePath || ''));
}

/**
 * Firma en lote todas las rutas de una tanda.
 *
 * Antes se firmaba de a una: para una cuenta paga eso son más de 3.000 llamadas
 * a Storage en un solo request, que lo dejaban colgado. `createSignedUrls` firma
 * hasta cientos por llamada; se trocea para no mandar un cuerpo gigante.
 */
const SIGN_BATCH = 200;
/** Hasta acá se firma en el mismo request; más arriba lo hace el front por tanda. */
const SIGN_INLINE_LIMIT = 120;

async function signAll(admin: NonNullable<ReturnType<typeof getAdminClient>>, paths: string[]) {
	const signed = new Map<string, string>();
	const pending = [...new Set(paths.filter((path) => path && !path.startsWith('http')))];
	for (let index = 0; index < pending.length; index += SIGN_BATCH) {
		const chunk = pending.slice(index, index + SIGN_BATCH);
		const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(chunk, 60 * 60);
		if (error) {
			console.error('[library] no se pudieron firmar referencias:', error);
			continue;
		}
		(data || []).forEach((row, position) => {
			const path = row.path || chunk[position];
			if (row.signedUrl) signed.set(path, row.signedUrl);
		});
	}
	return signed;
}

async function addAccessUrls(admin: NonNullable<ReturnType<typeof getAdminClient>>, items: any[]) {
	const paths = items.flatMap((item) => [
		item.imagePath,
		...(Array.isArray(item.metadata?.carouselImages) ? item.metadata.carouselImages : []),
	]);
	const signed = await signAll(admin, paths);
	const resolve = (path: string) => (path?.startsWith('http') ? path : signed.get(path) || '');

	return items.map((item) => {
		const metadata = item.metadata || {};
		const carouselImages = Array.isArray(metadata.carouselImages)
			? metadata.carouselImages.map(resolve)
			: undefined;
		return {
			...item,
			imageUrl: resolve(item.imagePath),
			metadata: carouselImages ? { ...metadata, carouselImages } : metadata,
		};
	});
}

export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user?.id) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const access = await getEffectiveAccess(admin, auth.user.id, auth.user.email);
	// Una sola definición de "esta cuenta ve la biblioteca completa", la de
	// `getEffectiveAccess`. La copia que había acá repetía la regla vieja
	// —`status === 'authorized'`— y podía quedar desincronizada de la real.
	const isPaid = access.isPaidLibrary;
	const isDiscoverPreview = new URL(request.url).searchParams.get('discover') === '1';
	let allItems: any[];
	try {
		allItems = await loadManifestItems(admin);
	} catch {
		return json({ error: 'No se pudo cargar la biblioteca de ganadores.' }, 502);
	}

	if (isDiscoverPreview) {
		/**
		 * El mazo del descubridor.
		 *
		 * Devolvía UN anuncio por ángulo y solo de cuatro ángulos: cuatro tarjetas
		 * para todo el mundo, pagara o no. En una cuenta gratuita eso dejaba fuera
		 * 46 de los 50 creativos que sí puede usar, y en una paga escondía la
		 * biblioteca entera detrás de cuatro imágenes. Ahora entra todo lo que la
		 * cuenta tiene permitido, repartido por ángulo para que las primeras
		 * tarjetas no sean todas del mismo tipo.
		 */
		const candidates = (isPaid ? allItems : allItems.filter((item: any) => freePreviewAngleFor(item)))
			.map((item: any) => ({ ...item, category: isPaid ? angleFor(item) : (freePreviewAngleFor(item) || angleFor(item)) }));
		const discoverItems = buildDiscoverDeck([...candidates].sort(sortForPreview), DISCOVER_DECK);
		const accessibleItems = await addAccessUrls(admin, discoverItems);
		return json({
			items: accessibleItems,
			access: {
				isPaid,
				planCode: access.planCode,
				previewPerAngle: PREVIEW_PER_ANGLE,
				totalCount: allItems.length,
				accessibleCount: accessibleItems.length,
				lockedCount: isPaid ? 0 : Math.max(0, allItems.length - accessibleItems.length),
			},
		});
	}

	const groups = new Map<string, any[]>();
	for (const item of allItems) {
		const angle = freePreviewAngleFor(item) || angleFor(item);
		const group = groups.get(angle) || [];
		group.push({ ...item, category: angle });
		groups.set(angle, group);
	}

	const previewItems: any[] = [];
	const previewPaths = new Set<string>();
	const lockedByAngle: Record<string, number> = {};
	for (const [angle, group] of groups.entries()) {
		const sorted = group.sort(sortForPreview);
		const selected = sorted.filter((item) => freePreviewAngleFor(item) === angle).slice(0, PREVIEW_PER_ANGLE);
		selected.forEach((item) => {
			previewItems.push(item);
			previewPaths.add(item.imagePath);
		});
		lockedByAngle[angle] = Math.max(0, sorted.length - selected.length);
	}

	const items = isPaid ? allItems.map((item: any) => ({ ...item, category: angleFor(item) })) : previewItems;
	// El preview gratuito son ~50 items y se firman acá. El catálogo completo son
	// más de 6.500 rutas: firmarlas todas tardaba 20 segundos para mostrar 20
	// imágenes. Las cuentas pagas reciben la lista sin firmar y el front pide las
	// URLs de lo que realmente se ve, por tanda, a /api/creativos/reference-urls.
	const accessibleItems = items.length <= SIGN_INLINE_LIMIT
		? await addAccessUrls(admin, items)
		: items;
	const lockedCount = isPaid ? 0 : Math.max(0, allItems.length - previewPaths.size);

	return json({
		items: accessibleItems,
		access: {
			isPaid,
			planCode: access.planCode,
			previewPerAngle: PREVIEW_PER_ANGLE,
			totalCount: allItems.length,
			accessibleCount: isPaid ? allItems.length : previewPaths.size,
			lockedCount,
			lockedByAngle,
		},
	});
};
