import { normalizeImageInput } from './ad-analysis';
import type { getAdminClient } from './server';

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>;
export type AvatarMode = 'original' | 'saved' | 'upload' | 'none';
export type VisualImage = { buffer: Buffer; type: string };

const MAX_BYTES = 10 * 1024 * 1024;
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function evenlySample<T>(items: T[], limit: number) {
	if (items.length <= limit) return items;
	return Array.from({ length: limit }, (_, index) => items[Math.round(index * (items.length - 1) / (limit - 1))]);
}

export async function resolveAvatarReferences(input: {
	admin: AdminClient;
	userId: string;
	mode: AvatarMode;
	avatarId?: string;
	directImages?: FormDataEntryValue[];
	directConsent?: boolean;
}): Promise<{ name: string; description: string; images: VisualImage[]; sourceImageCount: number }> {
	if (input.mode === 'original' || input.mode === 'none') return { name: '', description: '', images: [], sourceImageCount: 0 };
	if (input.mode === 'saved') {
		if (!input.avatarId) throw new Error('Elegí un avatar guardado.');
		const { data: avatar, error: avatarError } = await input.admin.from('creative_avatars')
			.select('id,name,description,consent_confirmed').eq('id', input.avatarId).eq('user_id', input.userId).maybeSingle();
		if (avatarError) throw avatarError;
		if (!avatar || !avatar.consent_confirmed) throw new Error('El avatar seleccionado no está disponible o no tiene autorización confirmada.');
		const { data: rows, error: rowsError } = await input.admin.from('creative_avatar_images')
			.select('storage_path,sort_order').eq('avatar_id', avatar.id).eq('user_id', input.userId).order('sort_order').limit(12);
		if (rowsError) throw rowsError;
		if ((rows || []).length < 4) throw new Error('El avatar necesita al menos 4 imágenes antes de poder usarse.');
		const images: VisualImage[] = [];
		for (const row of evenlySample(rows || [], 5)) {
			const { data: blob, error } = await input.admin.storage.from('creative-assets').download(row.storage_path);
			if (error) throw error;
			const normalized = blob ? await normalizeImageInput(Buffer.from(await blob.arrayBuffer())) : null;
			if (normalized) images.push(normalized);
		}
		return { name: avatar.name, description: avatar.description || '', images, sourceImageCount: (rows || []).length };
	}

	const files = (input.directImages || []).filter((entry): entry is File => entry instanceof File && entry.size > 0).slice(0, 13);
	if (!input.directConsent) throw new Error('Confirmá que tenés permiso para usar las imágenes del avatar.');
	if (files.length < 4) throw new Error('Subí al menos 4 fotos para usar una identidad consistente.');
	if (files.length > 12) throw new Error('Podés usar hasta 12 fotos por avatar.');
	for (const file of files) {
		if (!acceptedTypes.has(file.type)) throw new Error('Las fotos del avatar deben ser PNG, JPG o WebP.');
		if (file.size > MAX_BYTES) throw new Error('Cada foto del avatar puede pesar hasta 10 MB.');
	}
	const images: VisualImage[] = [];
	for (const file of evenlySample(files, 5)) {
		const normalized = await normalizeImageInput(Buffer.from(await file.arrayBuffer()));
		if (normalized) images.push(normalized);
	}
	return { name: 'Avatar cargado para este video', description: '', images, sourceImageCount: files.length };
}
