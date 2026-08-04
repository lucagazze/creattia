import type { APIRoute } from 'astro';
import { isAdminEmail } from '../../../lib/creattia/admin';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

const BUCKET = 'creative-references';
const MANIFEST_PATH = 'manifests/starter-static-50.json';
const PREVIEW_PER_ANGLE = 5;
const PAID_PLAN_CODES = new Set(['creator', 'pro', 'scale', 'agency']);
const FREE_PREVIEW_FILES: Record<string, string[]> = {
	'antes-despues': ['antes y despues (1).png', 'antes y despues (11).jpg', 'antes y despues (12).jpg', 'antes y despues (2).png', 'antes y despues (25).jpg'],
	estadisticas: ['Factos y Estadisticas (3).jpg', 'Factos y Estadisticas (15).jpg', 'Factos y Estadisticas (19).jpg', 'Factos y Estadisticas (30).jpg', 'Factos y Estadisticas (26).jpg'],
	caracteristicas: ['caracteristicas y beneficios (10).jpg', 'caracteristicas y beneficios (13).jpg', 'caracteristicas y beneficios (19).jpg', 'caracteristicas y beneficios (22).jpg', 'caracteristicas y beneficios (48).jpg'],
	estacional: ['Vacaciones - Estacional (3).jpg', 'Vacaciones - Estacional (5).jpg', 'Vacaciones - Estacional (8).jpg', 'Vacaciones - Estacional (18).jpg', 'Vacaciones - Estacional (21).jpg'],
	noticias: ['Noticias (4).png', 'Noticias (19).jpg', 'Noticias (22).jpg', 'Noticias (26).jpg', 'Noticias (27).jpg'],
	precio: ['Promociones y Descuentos (13).jpg', 'Promociones y Descuentos (18).jpg', 'Promociones y Descuentos (24).jpg', 'Promociones y Descuentos (32).jpg', 'Promociones y Descuentos (36).jpg'],
	'razones-porque': ['Razones porque (44).jpg', 'Razones porque (49).jpg', 'Razones porque (51).jpg', 'Razones porque (54).jpg', 'Razones porque (1).png'],
	resenas: ['Testimonios (66).jpg', 'Testimonios (18).png', 'Testimonios (71).jpg', 'Testimonios (85).jpg', 'Testimonios (87).jpg'],
	competencia: ['Nosotros vs Ellos (77).jpg', 'Nosotros vs Ellos (94).jpg', 'Nosotros vs Ellos (97).jpg', 'Nosotros vs Ellos (103).jpg', 'Nosotros vs Ellos (1).jpg'],
	producto: [],
};
const FREE_PREVIEW_PRODUCT_PATHS = [
	'40/4d6d5660fe89d4f3.jpg',
	'40/ce0269cb8ff87f27.webp',
	'40/2243b89949e5b992.jpg',
	'40/2755146251e14012.jpg',
	'40/96a1f1fd34c3f0b6.jpg',
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

	const { data: profile, error: profileError } = await admin.from('creative_profiles')
		.select('plan_code,subscription_status')
		.eq('user_id', auth.user.id)
		.maybeSingle();
	if (profileError) return json({ error: profileError.message }, 500);

	const isAdmin = isAdminEmail(auth.user.email || '');
	const isPaid = isAdmin || (PAID_PLAN_CODES.has(String(profile?.plan_code || '')) && profile?.subscription_status === 'authorized');
	const { data: manifestFile, error: manifestError } = await admin.storage.from(BUCKET).download(MANIFEST_PATH);
	if (manifestError || !manifestFile) return json({ error: 'No se pudo cargar la biblioteca de ganadores.' }, 502);

	const manifest = JSON.parse(await manifestFile.text());
	const allItems = (manifest.items || []).filter((item: any) => {
		const mediaType = item.metadata?.mediaType || 'static_image';
		return item.imagePath && STATIC_MEDIA_TYPES.has(mediaType);
	});

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
			planCode: isAdmin ? 'admin' : (profile?.plan_code || 'trial'),
			previewPerAngle: PREVIEW_PER_ANGLE,
			totalCount: allItems.length,
			accessibleCount: isPaid ? allItems.length : previewPaths.size,
			lockedCount,
			lockedByAngle,
		},
	});
};
