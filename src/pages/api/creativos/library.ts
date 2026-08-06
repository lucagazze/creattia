import type { APIRoute } from 'astro';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { freePreviewAngleFor } from '../../../lib/creattia/library-access';

export const prerender = false;

const BUCKET = 'creative-references';
const MANIFEST_PATH = 'manifests/starter-static-50.json';
const PREVIEW_PER_ANGLE = 5;
const PAID_PLAN_CODES = new Set(['creator', 'pro', 'scale', 'agency']);
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
	// Se firman siempre, también para las cuentas pagas: el bucket
	// `creative-references` dejó de ser público, así que el front ya no puede
	// armar la URL por su cuenta.
	const accessibleItems = await addAccessUrls(admin, items);
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
