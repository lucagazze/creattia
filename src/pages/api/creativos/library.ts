import type { APIRoute } from 'astro';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

const BUCKET = 'creative-references';
const MANIFEST_PATH = 'manifests/starter-static-50.json';
const PREVIEW_PER_ANGLE = 5;
const PAID_PLAN_CODES = new Set(['creator', 'pro', 'scale', 'agency']);
const FREE_PREVIEW_FILES: Record<string, string[]> = {
	'antes-despues': ['antes y despues (1).png', 'antes y despues (11).jpg', 'antes y despues (12).jpg', 'antes y despues (2).png', 'antes y despues (25).jpg'],
	estadisticas: ['Factos y Estadisticas (3).jpg', 'Factos y Estadisticas (15).jpg', 'Factos y Estadisticas (34).jpg', 'Factos y Estadisticas (30).jpg', 'Factos y Estadisticas (26).jpg'],
	caracteristicas: ['caracteristicas y beneficios (10).jpg', 'caracteristicas y beneficios (13).jpg', 'caracteristicas y beneficios (19).jpg', 'caracteristicas y beneficios (34).jpg', 'caracteristicas y beneficios (48).jpg'],
	estacional: ['Vacaciones - Estacional (3).jpg', 'Vacaciones - Estacional (5).jpg', 'Vacaciones - Estacional (8).jpg', 'Vacaciones - Estacional (18).jpg', 'Vacaciones - Estacional (21).jpg'],
	noticias: ['Noticias (4).png', 'Noticias (19).jpg', 'Noticias (22).jpg', 'Noticias (26).jpg', 'Noticias (27).jpg'],
	precio: ['Promociones y Descuentos (13).jpg', 'Promociones y Descuentos (18).jpg', 'Promociones y Descuentos (24).jpg', 'Promociones y Descuentos (32).jpg', 'Promociones y Descuentos (36).jpg'],
	'razones-porque': ['Razones porque (44).jpg', 'Razones porque (49).jpg', 'Razones porque (51).jpg', 'Razones porque (54).jpg', 'Razones porque (1).png'],
	resenas: ['Testimonios (66).jpg', 'Testimonios (18).png', 'Testimonios (71).jpg', 'Testimonios (85).jpg', 'Testimonios (87).jpg'],
	competencia: ['Nosotros vs Ellos (77).jpg', 'Nosotros vs Ellos (94).jpg', 'Nosotros vs Ellos (97).jpg', 'Nosotros vs Ellos (103).jpg', 'Nosotros vs Ellos (1).jpg'],
	producto: [
		'producto-presentacion-gratis-01.png',
		'producto-presentacion-gratis-02.png',
		'producto-presentacion-gratis-03.png',
		'producto-presentacion-gratis-04.png',
		'producto-presentacion-gratis-05.png',
	],
};
const FREE_PREVIEW_PRODUCT_PATHS = [
	'40/2fb666571bf2802e.png',
	'40/55596501e64f813b.png',
	'40/174faa5c6ab2a671.png',
	'40/8640d4617f2e692d.png',
	'40/b3aaaa6a8d580a1a.png',
];
const FREE_PREVIEW_FILE_TO_ANGLE = new Map(
	Object.entries(FREE_PREVIEW_FILES).flatMap(([angle, files]) => files.map((file) => [file.toLowerCase(), angle] as const))
);
const FREE_PREVIEW_PATH_TO_ANGLE = new Map(FREE_PREVIEW_PRODUCT_PATHS.map((path) => [path, 'producto'] as const));
const STATIC_MEDIA_TYPES = new Set(['static_image', 'carousel']);
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

function freePreviewAngleFor(item: any) {
	const sourceFile = String(item.metadata?.originalFileName || '').toLowerCase().trim();
	return FREE_PREVIEW_FILE_TO_ANGLE.get(sourceFile) || FREE_PREVIEW_PATH_TO_ANGLE.get(String(item.imagePath || '')) || null;
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

async function signReference(admin: NonNullable<ReturnType<typeof getAdminClient>>, path: string) {
	if (!path || path.startsWith('http')) return path;
	const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
	return error || !data?.signedUrl ? '' : data.signedUrl;
}

async function addAccessUrls(admin: NonNullable<ReturnType<typeof getAdminClient>>, items: any[]) {
	return Promise.all(items.map(async (item) => {
		const imageUrl = await signReference(admin, item.imagePath);
		const metadata = item.metadata || {};
		const carouselImages = Array.isArray(metadata.carouselImages)
			? await Promise.all(metadata.carouselImages.map((path: string) => signReference(admin, path)))
			: undefined;
		return {
			...item,
			imageUrl,
			metadata: carouselImages ? { ...metadata, carouselImages } : metadata,
		};
	}));
}

export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user?.id) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const access = await getEffectiveAccess(admin, auth.user.id, auth.user.email);
	const isPaid = access.isPaidLibrary || (PAID_PLAN_CODES.has(access.planCode) && access.subscriptionStatus === 'authorized');
	const isDiscoverPreview = new URL(request.url).searchParams.get('discover') === '1';
	const { data: manifestFile, error: manifestError } = await admin.storage.from(BUCKET).download(MANIFEST_PATH);
	if (manifestError || !manifestFile) return json({ error: 'No se pudo cargar la biblioteca de ganadores.' }, 502);

	const manifest = JSON.parse(await manifestFile.text());
	const allItems = (manifest.items || []).filter((item: any) => {
		const mediaType = item.metadata?.mediaType || 'static_image';
		return item.imagePath && STATIC_MEDIA_TYPES.has(mediaType);
	});

	if (isDiscoverPreview) {
		const discoverAngles = ['producto', 'competencia', 'resenas', 'precio'];
		const candidates = (isPaid ? allItems : allItems.filter((item: any) => freePreviewAngleFor(item)))
			.map((item: any) => ({ ...item, category: isPaid ? angleFor(item) : (freePreviewAngleFor(item) || angleFor(item)) }));
		const discoverItems = discoverAngles
			.map((angle) => candidates.filter((item: any) => item.category === angle).sort(sortForPreview)[0])
			.filter(Boolean);
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
	const accessibleItems = isPaid ? items : await addAccessUrls(admin, items);
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
