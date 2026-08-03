export type VideoDialogueLine = {
	start: number;
	end: number;
	speaker: string;
	line: string;
	delivery?: string;
};

export type VideoSegment = {
	index: number;
	start: number;
	end: number;
	duration: number;
};

export const VIDEO_OUTPUT_DURATION_MIN = 4;
export const VIDEO_OUTPUT_DURATION_MAX = 30;
export const VIDEO_SEGMENT_MAX_SECONDS = 10;
export const VIDEO_CREDITS_PER_SEGMENT = 4;

export function isVideoOutputDuration(value: string | number) {
	const duration = Number(value);
	return Number.isInteger(duration) && duration >= VIDEO_OUTPUT_DURATION_MIN && duration <= VIDEO_OUTPUT_DURATION_MAX;
}

export function videoSegmentsForDuration(value: string | number): VideoSegment[] {
	const total = Number(value);
	if (!isVideoOutputDuration(total)) throw new Error('La duración debe ser un número entero entre 4 y 30 segundos.');
	const segments: VideoSegment[] = [];
	const segmentCount = Math.ceil(total / VIDEO_SEGMENT_MAX_SECONDS);
	const baseDuration = Math.floor(total / segmentCount);
	let remainder = total % segmentCount;
	let start = 0;
	for (let index = 0; index < segmentCount; index += 1) {
		const duration = baseDuration + (remainder > 0 ? 1 : 0);
		remainder = Math.max(0, remainder - 1);
		segments.push({ index: segments.length, start, end: start + duration, duration });
		start += duration;
	}
	return segments;
}

export function videoCreditCost(value: string | number) {
	return videoSegmentsForDuration(value).length * VIDEO_CREDITS_PER_SEGMENT;
}

export function videoCreditCostForAccount(value: string | number, isAdmin: boolean) {
	return isAdmin ? 0 : videoCreditCost(value);
}

export function fallbackScenesForDuration(rawDuration: string | number, productName: string) {
	const duration = Math.max(4, Number(rawDuration) || 8);
	if (duration <= 4) return [
		`0–1s: Hook visual inmediato con ${productName} y el problema principal.`,
		`1–3s: Demostración rápida del uso o del beneficio con el producto visible.`,
		`3–${duration}s: Resultado, marca y CTA claro.`,
	];
	if (duration <= 10) {
		const hookEnd = Math.min(2, duration * .2);
		const problemEnd = Math.min(duration - 3, duration * .42);
		const demoEnd = Math.min(duration - 2, duration * .7);
		const proofEnd = Math.min(duration - 1, duration * .86);
		return [
			`0–${hookEnd}s: Hook visual y verbal con el beneficio principal.`,
			`${hookEnd}–${problemEnd}s: Problema cotidiano que vive la audiencia.`,
			`${problemEnd}–${demoEnd}s: ${productName} en uso, con envase y acción claramente visibles.`,
			`${demoEnd}–${proofEnd}s: Resultado o prueba visual verificable.`,
			`${proofEnd}–${duration}s: Producto, marca y CTA final.`,
		];
	}
	const marks = [0, .1, .25, .45, .65, .82, 1].map((ratio) => Math.round(duration * ratio * 10) / 10);
	return [
		`${marks[0]}–${marks[1]}s: Hook que detiene el scroll y presenta el problema.`,
		`${marks[1]}–${marks[2]}s: Situación reconocible y promesa de solución.`,
		`${marks[2]}–${marks[3]}s: Presentación de ${productName} con detalle fiel del envase.`,
		`${marks[3]}–${marks[4]}s: Demostración paso a paso y diálogo adaptado a la marca.`,
		`${marks[4]}–${marks[5]}s: Beneficio, prueba o resultado visual verificable.`,
		`${marks[5]}–${marks[6]}s: Resumen, marca, oferta válida y CTA final.`,
	];
}

export function dialogueForSegment(lines: VideoDialogueLine[] | undefined, segment: VideoSegment) {
	return (lines || [])
		.filter((line) => Number(line.end) > segment.start && Number(line.start) < segment.end)
		.map((line) => ({
			...line,
			start: Math.max(0, Number(line.start) - segment.start),
			end: Math.min(segment.duration, Number(line.end) - segment.start),
		}));
}

export function scenesForSegment(scenes: string[] | undefined, segment: VideoSegment) {
	const selected = (scenes || []).filter((scene) => {
		const match = scene.match(/(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)\s*s/i);
		if (!match) return false;
		const start = Number(match[1].replace(',', '.'));
		const end = Number(match[2].replace(',', '.'));
		return end > segment.start && start < segment.end;
	});
	return selected.length ? selected : (scenes || []);
}

export function referenceSegmentForOutput(segment: VideoSegment, referenceDuration?: number): VideoSegment {
	const available = Number(referenceDuration || 0);
	if (!Number.isFinite(available) || available <= 0) return { ...segment, start: 0, end: segment.duration };
	const duration = Math.min(segment.duration, available, VIDEO_SEGMENT_MAX_SECONDS);
	const latestStart = Math.max(0, available - duration);
	const start = Math.min(segment.start, latestStart);
	return { index: segment.index, start, end: start + duration, duration };
}
