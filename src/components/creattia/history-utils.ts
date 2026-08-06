import type { Generation, HistoryGroup } from './app-types';

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
