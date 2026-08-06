/**
 * Descarga una imagen generada con un nombre de archivo propio. Lo usan el
 * historial y el Studio, así que vive fuera de las dos pantallas.
 */
export async function downloadImage(url: string, name: string) {
	try {
		const response = await fetch(url);
		const blob = await response.blob();
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = name;
		anchor.click();
		URL.revokeObjectURL(objectUrl);
	} catch {
		window.open(url, '_blank');
	}
}


/**
 * Descarga un carrusel entero como un ZIP con una carpeta adentro.
 *
 * Antes bajaba solo la página que estabas mirando: para tener el carrusel
 * completo había que abrir una por una y descargarlas de a diez. El ZIP mantiene
 * el orden en el nombre de cada archivo, que es lo que después pide el
 * administrador de anuncios al armar el carrusel.
 *
 * JSZip se importa acá adentro a propósito: pesa, y solo hace falta cuando
 * alguien descarga un carrusel de verdad.
 */
export async function downloadCarousel(
	paginas: Array<{ url: string; indice: number }>,
	nombreCarpeta: string,
	onProgress?: (hechas: number, total: number) => void,
): Promise<void> {
	const limpio = (nombreCarpeta || 'carrusel').replace(/[^\w\sáéíóúñü-]/gi, '').trim().slice(0, 60) || 'carrusel';
	if (paginas.length <= 1) {
		if (paginas[0]) await downloadImage(paginas[0].url, `${limpio}.png`);
		return;
	}

	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	const carpeta = zip.folder(limpio) || zip;

	let hechas = 0;
	// En serie y no en paralelo: son URLs firmadas de Storage y diez descargas
	// simultáneas hacen que algunas fallen por límite de conexiones.
	for (const pagina of paginas) {
		try {
			const response = await fetch(pagina.url);
			if (response.ok) {
				const numero = String(pagina.indice).padStart(2, '0');
				carpeta.file(`${numero}-${limpio}.png`, await response.blob());
			}
		} catch { /* una página que falla no cancela el resto */ }
		hechas += 1;
		onProgress?.(hechas, paginas.length);
	}

	const blob = await zip.generateAsync({ type: 'blob' });
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = objectUrl;
	anchor.download = `${limpio}.zip`;
	anchor.click();
	URL.revokeObjectURL(objectUrl);
}
