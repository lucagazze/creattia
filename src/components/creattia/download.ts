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
