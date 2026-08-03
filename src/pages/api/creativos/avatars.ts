import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

const ASSETS = 'creative-assets';
const MIN_IMAGES = 4;
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const mimeExtensions: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
};

async function listAvatars(userId: string) {
	const admin = getAdminClient();
	if (!admin) throw new Error('Supabase no está configurado.');
	const { data: avatars, error } = await admin.from('creative_avatars')
		.select('id,name,description,consent_confirmed,created_at,updated_at')
		.eq('user_id', userId).order('updated_at', { ascending: false }).limit(30);
	if (error) throw error;
	const ids = (avatars || []).map((avatar) => avatar.id);
	const { data: imageRows, error: imagesError } = ids.length
		? await admin.from('creative_avatar_images').select('avatar_id,storage_path,sort_order').eq('user_id', userId).in('avatar_id', ids).order('sort_order')
		: { data: [], error: null };
	if (imagesError) throw imagesError;
	const paths = (imageRows || []).map((row) => row.storage_path);
	const signedByPath = new Map<string, string>();
	if (paths.length) {
		const { data: signedRows } = await admin.storage.from(ASSETS).createSignedUrls(paths, 60 * 60);
		(signedRows || []).forEach((row, index) => { if (row.signedUrl) signedByPath.set(paths[index], row.signedUrl); });
	}
	return (avatars || []).map((avatar) => {
		const images = (imageRows || []).filter((row) => row.avatar_id === avatar.id).map((row) => ({
			path: row.storage_path,
			url: signedByPath.get(row.storage_path) || '',
		})).filter((image) => image.url);
		return { ...avatar, images, imageCount: images.length, coverUrl: images[0]?.url || '' };
	});
}

export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	try {
		return json({ avatars: await listAvatars(auth.user.id), minImages: MIN_IMAGES, maxImages: MAX_IMAGES });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudieron cargar los avatares.' }, 500);
	}
};

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	let avatarId = '';
	const uploadedPaths: string[] = [];
	try {
		const form = await request.formData();
		const name = String(form.get('name') || '').trim().slice(0, 120);
		const description = String(form.get('description') || '').trim().slice(0, 1200);
		const consentConfirmed = String(form.get('consentConfirmed') || '') === 'true';
		const files = form.getAll('images').filter((file): file is File => file instanceof File && file.size > 0).slice(0, MAX_IMAGES + 1);
		if (!name) return json({ error: 'Poné un nombre para reconocer a este avatar.' }, 400);
		if (!consentConfirmed) return json({ error: 'Necesitamos confirmar que tenés permiso para usar la imagen de esta persona.' }, 400);
		if (files.length < MIN_IMAGES) return json({ error: `Subí al menos ${MIN_IMAGES} fotos diferentes de la persona.` }, 400);
		if (files.length > MAX_IMAGES) return json({ error: `Podés guardar hasta ${MAX_IMAGES} fotos por avatar.` }, 400);
		for (const file of files) {
			if (!mimeExtensions[file.type]) return json({ error: 'Usá imágenes PNG, JPG o WebP.' }, 415);
			if (file.size > MAX_IMAGE_BYTES) return json({ error: 'Cada imagen puede pesar hasta 10 MB.' }, 413);
		}

		const { data: avatar, error: insertError } = await admin.from('creative_avatars').insert({
			user_id: auth.user.id,
			name,
			description: description || null,
			consent_confirmed: true,
		}).select('id').single();
		if (insertError || !avatar) throw insertError || new Error('No se pudo crear el avatar.');
		avatarId = avatar.id;

		for (const [index, file] of files.entries()) {
			const path = `${auth.user.id}/avatars/${avatar.id}/${String(index + 1).padStart(2, '0')}-${crypto.randomUUID()}.${mimeExtensions[file.type]}`;
			const { error: uploadError } = await admin.storage.from(ASSETS).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
			if (uploadError) throw uploadError;
			uploadedPaths.push(path);
			const { error: imageError } = await admin.from('creative_avatar_images').insert({
				avatar_id: avatar.id,
				user_id: auth.user.id,
				storage_path: path,
				sort_order: index,
			});
			if (imageError) throw imageError;
		}
		const avatars = await listAvatars(auth.user.id);
		return json({ avatar: avatars.find((item) => item.id === avatar.id), avatars }, 201);
	} catch (error) {
		if (uploadedPaths.length) await admin.storage.from(ASSETS).remove(uploadedPaths);
		if (avatarId) await admin.from('creative_avatars').delete().eq('id', avatarId).eq('user_id', auth.user.id);
		return json({ error: error instanceof Error ? error.message : 'No se pudo guardar el avatar.' }, 500);
	}
};

export const DELETE: APIRoute = async ({ request, url }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const id = url.searchParams.get('id')?.trim() || '';
	if (!id) return json({ error: 'Falta el avatar.' }, 400);
	try {
		const { data: avatar, error: avatarError } = await admin.from('creative_avatars').select('id').eq('id', id).eq('user_id', auth.user.id).maybeSingle();
		if (avatarError) throw avatarError;
		if (!avatar) return json({ error: 'El avatar no existe.' }, 404);
		const { data: rows, error: rowsError } = await admin.from('creative_avatar_images').select('storage_path').eq('avatar_id', id).eq('user_id', auth.user.id);
		if (rowsError) throw rowsError;
		const { error: deleteError } = await admin.from('creative_avatars').delete().eq('id', id).eq('user_id', auth.user.id);
		if (deleteError) throw deleteError;
		const paths = (rows || []).map((row) => row.storage_path);
		if (paths.length) await admin.storage.from(ASSETS).remove(paths);
		return json({ ok: true, avatars: await listAvatars(auth.user.id) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'No se pudo eliminar el avatar.' }, 500);
	}
};
