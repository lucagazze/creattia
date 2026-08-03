const MAX_REFERENCE_SIDE = 1280;
const JPEG_QUALITY = 0.82;

async function optimizeReferenceImage(file: File, index: number): Promise<File> {
	if (!file.type.startsWith('image/')) return file;

	let bitmap: ImageBitmap | null = null;
	try {
		bitmap = await createImageBitmap(file);
		const scale = Math.min(1, MAX_REFERENCE_SIDE / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		const context = canvas.getContext('2d');
		if (!context) return file;
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
		if (!blob || blob.size >= file.size) return file;
		const baseName = file.name.replace(/\.[^.]+$/, '') || `avatar-${index + 1}`;
		return new File([blob], `${baseName}-optimizada.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
	} catch {
		return file;
	} finally {
		bitmap?.close();
	}
}

export async function prepareReferenceImages(input: FileList | File[], maxFiles = 12): Promise<File[]> {
	const files = Array.from(input).slice(0, maxFiles);
	return Promise.all(files.map(optimizeReferenceImage));
}
