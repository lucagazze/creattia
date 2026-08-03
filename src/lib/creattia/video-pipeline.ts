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

export const VIDEO_OUTPUT_DURATIONS = ['4', '8', '10', '20', '30'] as const;
export const VIDEO_SEGMENT_MAX_SECONDS = 10;
export const VIDEO_CREDITS_PER_SEGMENT = 4;

export function videoSegmentsForDuration(value: string | number): VideoSegment[] {
	const total = Number(value);
	if (!Number.isFinite(total) || total <= 0 || total > 30) throw new Error('Duración de video inválida.');
	const segments: VideoSegment[] = [];
	let start = 0;
	while (start < total) {
		const duration = Math.min(VIDEO_SEGMENT_MAX_SECONDS, total - start);
		segments.push({ index: segments.length, start, end: start + duration, duration });
		start += duration;
	}
	return segments;
}

export function videoCreditCost(value: string | number) {
	return videoSegmentsForDuration(value).length * VIDEO_CREDITS_PER_SEGMENT;
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
