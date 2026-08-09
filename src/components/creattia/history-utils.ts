import type { Generation, HistoryGroup } from './app-types';

/**
 * Una fila de `creative_generations` convertida en lo que muestra la pantalla.
 *
 * Existía tres veces escrita a mano —la carga inicial del historial, el polling
 * global y el polling del lote activo— y las tres se fueron separando. Cada
 * diferencia era un defecto:
 *
 * · Los dos pollings no leían `batch_id` ni `variant_key`, y sin esos dos campos
 *   `groupCarouselHistory` no puede agrupar: un carrusel recién generado se veía
 *   partido en tarjetas sueltas hasta recargar la página.
 * · Ninguno de los dos guardaba `output_path`. Esa es la ruta del archivo, o sea
 *   lo único con lo que se puede volver a firmar la imagen: sin ella la vista
 *   grande se quedaba con la miniatura, la descarga bajaba la miniatura en vez
 *   del original, y una firma vencida ya no se podía renovar. Todo lo recién
 *   generado quedaba así hasta la próxima recarga.
 *
 * Con una sola función, una fila nace igual venga por donde venga.
 */
export function generacionDesdeFila(fila: any, opciones?: { imageUrl?: string; categoria?: string }): Generation {
	const snapshot = fila?.settings_snapshot || {};
	return {
		id: fila.id,
		title: fila.title,
		imageUrl: opciones?.imageUrl || '',
		outputPath: fila.output_path || null,
		format: fila.format,
		createdAt: fila.created_at || new Date().toISOString(),
		category: opciones?.categoria || 'Creativo',
		templateId: fila.template_id,
		preset: fila.variant_key || snapshot.preset || 'fiel',
		imageType: fila.image_type || snapshot.imageType || 'product',
		productId: fila.product_id || snapshot.productId || '',
		productIds: snapshot.productIds || (fila.product_id ? [fila.product_id] : []),
		// Sin lote, la imagen es su propio grupo: así una suelta nunca se mezcla
		// con otra por tener las dos el lote vacío.
		batchId: fila.batch_id || fila.id,
		outputIndex: fila.output_index || 1,
		referencePath: snapshot.referencePath || '',
		referenceName: snapshot.referenceName || '',
		subjectMode: snapshot.subjectMode || 'product',
		sourceUrl: snapshot.sourceUrl || '',
		error: fila.error_code || '',
		status: fila.status || (opciones?.imageUrl ? 'completed' : 'processing'),
	} as Generation;
}

/** Agrupa las imágenes de un mismo carrusel en una sola tarjeta del historial. */

export function groupCarouselHistory(history: Generation[]): HistoryGroup[] {
	const carouselSlides = new Map<string, Generation[]>();
	const singles: Generation[] = [];
	history.forEach((item) => {
		if (item.preset === 'carrusel' && item.batchId) {
			const arr = carouselSlides.get(item.batchId) || [];
			arr.push(item);
			carouselSlides.set(item.batchId, arr);
		} else {
			singles.push(item);
		}
	});
	const groups: HistoryGroup[] = singles.map((item) => ({ key: item.id, createdAt: item.createdAt, item }));
	carouselSlides.forEach((slides, batchId) => {
		const sorted = [...slides].sort((a, b) => (a.outputIndex || 0) - (b.outputIndex || 0));
		groups.push({ key: batchId, createdAt: sorted[0].createdAt, item: sorted[0], slides: sorted });
	});
	groups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
	return groups;
}
