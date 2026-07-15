import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

const allowedMime: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/avif': 'avif',
};

// Admin email verification helper
function isAdmin(email = '') {
	return email.toLowerCase().trim() === 'lucagazze1@gmail.com';
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user || !isAdmin(auth.user.email)) {
		return json({ error: 'Acceso denegado. Solo administradores autorizados.' }, 403);
	}

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const form = await request.formData();
		const name = String(form.get('name') || '').trim().slice(0, 180);
		const promptNotes = String(form.get('promptNotes') || '').trim().slice(0, 2000);
		const templateId = Number(form.get('templateId'));
		const categoryGroup = String(form.get('categoryGroup') || '').trim().slice(0, 120);
		const categoryBranch = String(form.get('categoryBranch') || '').trim().slice(0, 120);
		const categoryLeaf = String(form.get('categoryLeaf') || '').trim().slice(0, 120);
		
		const image = form.get('image');
		if (!name) return json({ error: 'Falta el nombre.' }, 400);
		if (!templateId || isNaN(templateId)) return json({ error: 'templateId inválido.' }, 400);
		if (!(image instanceof File) || !image.size) return json({ error: 'Falta subir el archivo de imagen.' }, 400);
		if (!allowedMime[image.type]) return json({ error: 'Formato de imagen no permitido.' }, 415);

		// Read bytes and hash
		const imageBytes = new Uint8Array(await image.arrayBuffer());
		const fingerprint = createHash('sha256').update(imageBytes).digest('hex').slice(0, 16);
		const extension = allowedMime[image.type];
		const storagePath = `${templateId}/${fingerprint}.${extension}`;

		// 1. Upload Ad Image to Storage bucket 'creative-references'
		const { error: uploadError } = await admin.storage.from('creative-references').upload(storagePath, imageBytes, {
			contentType: image.type,
			upsert: true
		});
		if (uploadError) throw uploadError;

		// 2. Fetch and update the starter manifest file in Storage
		const manifestFileName = 'manifests/starter-static-50.json';
		let manifestData = { version: 1, collection: 'scraped-ads-library', items: [] as any[] };
		try {
			const { data: fileData, error: downloadError } = await admin.storage.from('creative-references').download(manifestFileName);
			if (!downloadError && fileData) {
				const text = await fileData.text();
				manifestData = JSON.parse(text);
			}
		} catch (e) {
			console.warn('No se pudo descargar el manifiesto existente; se creará uno nuevo.');
		}

		const newItem = {
			templateId,
			name,
			imagePath: storagePath,
			promptNotes: promptNotes || null,
			sortOrder: 10,
			rightsStatus: 'public_domain',
			categoryGroup: categoryGroup || null,
			categoryBranch: categoryBranch || null,
			categoryLeaf: categoryLeaf || null,
			metadata: {
				scrapedAt: new Date().toISOString(),
				mediaType: 'static_image',
				addedBy: auth.user.email
			}
		};

		// Avoid duplicate item insertions
		manifestData.items = manifestData.items.filter((item: any) => item.imagePath !== storagePath);
		manifestData.items.push(newItem);

		const updatedManifestBytes = Buffer.from(JSON.stringify(manifestData, null, 2));
		const { error: manifestUploadError } = await admin.storage.from('creative-references').upload(manifestFileName, updatedManifestBytes, {
			contentType: 'application/json',
			upsert: true
		});
		if (manifestUploadError) throw manifestUploadError;

		// 3. Try database insertion as fallback
		const row = {
			template_id: templateId,
			name,
			image_path: storagePath,
			prompt_notes: promptNotes || null,
			sort_order: 10,
			is_active: true,
			source_url: 'https://www.creattia.app',
			source_platform: 'Manual Admin Upload',
			rights_status: 'public_domain',
			license_notes: `Manual upload by Admin: ${auth.user.email}`,
			category_group: categoryGroup || null,
			category_branch: categoryBranch || null,
			category_leaf: categoryLeaf || null,
			metadata: newItem.metadata,
			updated_at: new Date().toISOString()
		};

		try {
			const { data: existing } = await admin.from('creative_references')
				.select('id')
				.eq('template_id', templateId)
				.eq('image_path', storagePath)
				.maybeSingle();

			if (existing) {
				await admin.from('creative_references').update(row).eq('id', existing.id);
			} else {
				await admin.from('creative_references').insert(row);
			}
		} catch (dbError) {
			console.warn('La tabla de base de datos no existe; se ignoró la inserción directa en DB.', dbError);
		}

		return json({ ok: true, item: newItem }, 201);
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Error interno al procesar el archivo.' }, 500);
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user || !isAdmin(auth.user.email)) {
		return json({ error: 'Acceso denegado. Solo administradores autorizados.' }, 403);
	}

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const urlParams = new URL(request.url).searchParams;
		const imagePath = urlParams.get('imagePath') || '';
		if (!imagePath) return json({ error: 'imagePath inválida.' }, 400);

		// 1. Delete image file from Storage
		await admin.storage.from('creative-references').remove([imagePath]);

		// 2. Fetch, filter out, and update the starter manifest file in Storage
		const manifestFileName = 'manifests/starter-static-50.json';
		try {
			const { data: fileData, error: downloadError } = await admin.storage.from('creative-references').download(manifestFileName);
			if (!downloadError && fileData) {
				const text = await fileData.text();
				const manifestData = JSON.parse(text);
				
				manifestData.items = (manifestData.items || []).filter((item: any) => item.imagePath !== imagePath);
				
				const updatedManifestBytes = Buffer.from(JSON.stringify(manifestData, null, 2));
				await admin.storage.from('creative-references').upload(manifestFileName, updatedManifestBytes, {
					contentType: 'application/json',
					upsert: true
				});
			}
		} catch (e) {
			console.warn('Error al actualizar el manifiesto remoto en la eliminación.');
		}

		// 3. Remove row from DB if available
		try {
			await admin.from('creative_references').delete().eq('image_path', imagePath);
		} catch (dbError) {
			// ignore if table doesn't exist
		}

		return json({ ok: true });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Error al eliminar la referencia.' }, 500);
	}
};
