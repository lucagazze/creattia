import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { isAdminEmail as isAdmin } from '../../../lib/creattia/admin';

export const prerender = false;

const VIDEO_BUCKET = 'creative-videos';
const VIDEO_MANIFEST_PATH = 'manifests/video-library.json';

function toStoragePath(value: unknown): string {
	const raw = String(value || '').trim();
	if (!raw) return '';
	if (!raw.startsWith('http')) return raw.replace(/^\/+/, '');

	try {
		const url = new URL(raw);
		const marker = `/storage/v1/object/public/${VIDEO_BUCKET}/`;
		const markerIndex = url.pathname.indexOf(marker);
		if (markerIndex < 0) return '';
		return decodeURIComponent(url.pathname.slice(markerIndex + marker.length)).replace(/^\/+/, '');
	} catch {
		return '';
	}
}

type VideoDeleteRequest = {
	videoPath?: string;
	thumbnailPath?: string;
	imagePath?: string;
	items?: Array<{ videoPath?: string; thumbnailPath?: string; imagePath?: string }>;
};

export const DELETE: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user || !isAdmin(auth.user.email)) {
		return json({ error: 'Acceso denegado. Solo administradores autorizados.' }, 403);
	}

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const parsedBody = await request.json().catch(() => ({}));
		const body: VideoDeleteRequest = parsedBody && typeof parsedBody === 'object' ? parsedBody as VideoDeleteRequest : {};
		const requests: Array<{ videoPath?: string; thumbnailPath?: string; imagePath?: string }> = Array.isArray(body.items) ? body.items : [body];
		const requestedVideoPaths = new Set(requests.map((item) => toStoragePath(item.videoPath)).filter(Boolean));
		const requestedThumbnailPaths = new Set(
			requests.map((item) => toStoragePath(item.thumbnailPath || item.imagePath)).filter(Boolean),
		);

		if (!requestedVideoPaths.size && !requestedThumbnailPaths.size) {
			return json({ error: 'videoPath o thumbnailPath inválido.' }, 400);
		}

		const { data: manifestFile, error: manifestDownloadError } = await admin.storage
			.from(VIDEO_BUCKET)
			.download(VIDEO_MANIFEST_PATH);
		if (manifestDownloadError || !manifestFile) {
			return json({ error: manifestDownloadError?.message || 'No se pudo leer el manifiesto de videos.' }, 503);
		}

		const manifest = JSON.parse(await manifestFile.text());
		const items = Array.isArray(manifest.items) ? manifest.items : [];
		const matchedItems = items.filter((item: any) => {
			const videoPath = toStoragePath(item.videoPath);
			const thumbnailPath = toStoragePath(item.thumbnailPath);
			return requestedVideoPaths.has(videoPath) || requestedThumbnailPaths.has(thumbnailPath);
		});

		if (!matchedItems.length) return json({ error: 'El video no existe en la biblioteca.' }, 404);

		const matchedVideoPaths = new Set<string>();
		const matchedThumbnailPaths = new Set<string>();
		for (const item of matchedItems) {
			const videoPath = toStoragePath(item.videoPath);
			const thumbnailPath = toStoragePath(item.thumbnailPath);
			if (videoPath) matchedVideoPaths.add(videoPath);
			if (thumbnailPath) matchedThumbnailPaths.add(thumbnailPath);
		}
		const nextManifest = {
			...manifest,
			items: items.filter((item: any) => !matchedVideoPaths.has(toStoragePath(item.videoPath))),
		};

		const { error: manifestUploadError } = await admin.storage.from(VIDEO_BUCKET).upload(
			VIDEO_MANIFEST_PATH,
			Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`),
			{ contentType: 'application/json', cacheControl: '60', upsert: true },
		);
		if (manifestUploadError) throw manifestUploadError;

		const { error: storageDeleteError } = await admin.storage
			.from(VIDEO_BUCKET)
			.remove([...matchedVideoPaths, ...matchedThumbnailPaths]);
		if (storageDeleteError) throw storageDeleteError;

		return json({ ok: true, deletedCount: matchedItems.length });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Error al eliminar los videos.' }, 500);
	}
};
