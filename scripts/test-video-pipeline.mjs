import assert from 'node:assert/strict';
import {
	dialogueForSegment,
	fallbackScenesForDuration,
	referenceSegmentForOutput,
	scenesForSegment,
	videoCreditCost,
	videoSegmentsForDuration,
} from '../src/lib/creattia/video-pipeline.ts';
import { normalizeVideoSetupSuggestions } from '../src/lib/creattia/video-suggestions.ts';

assert.deepEqual(videoSegmentsForDuration(4), [{ index: 0, start: 0, end: 4, duration: 4 }]);
assert.deepEqual(videoSegmentsForDuration(10), [{ index: 0, start: 0, end: 10, duration: 10 }]);
assert.deepEqual(videoSegmentsForDuration(20).map(({ start, end }) => [start, end]), [[0, 10], [10, 20]]);
assert.deepEqual(videoSegmentsForDuration(30).map(({ start, end }) => [start, end]), [[0, 10], [10, 20], [20, 30]]);
assert.equal(videoCreditCost(4), 4);
assert.equal(videoCreditCost(20), 8);
assert.equal(videoCreditCost(30), 12);

const second = videoSegmentsForDuration(20)[1];
assert.deepEqual(dialogueForSegment([
	{ start: 1, end: 4, speaker: 'Creadora', line: 'Primera línea' },
	{ start: 11, end: 14, speaker: 'Creadora', line: 'Segunda línea' },
], second), [{ start: 1, end: 4, speaker: 'Creadora', line: 'Segunda línea' }]);
assert.deepEqual(scenesForSegment(['0–4s: Hook', '10–16s: Demostración'], second), ['10–16s: Demostración']);
assert.deepEqual(referenceSegmentForOutput(second, 30), { index: 1, start: 10, end: 20, duration: 10 });
assert.deepEqual(referenceSegmentForOutput(videoSegmentsForDuration(30)[2], 8), { index: 2, start: 0, end: 8, duration: 8 });

const fallbackThirty = fallbackScenesForDuration(30, 'Hydra 10');
assert.equal(fallbackThirty.length, 6);
assert.match(fallbackThirty.at(-1) || '', /30s/);
assert.match(fallbackThirty[2], /Hydra 10/);

const normalizedSuggestions = normalizeVideoSetupSuggestions({
	objective: 'not-valid',
	tone: 'Premium',
	audience: '',
	offer: '',
	speechMode: 'adapt',
}, { productName: 'Hydra 10', brandName: 'Creattia', productFacts: 'Hidratación ligera para piel sensible', hasSpeakingPerson: true });
assert.equal(normalizedSuggestions.objective, 'UGC / Testimonial');
assert.equal(normalizedSuggestions.tone, 'Premium');
assert.match(normalizedSuggestions.audience, /Hydra 10/);
assert.match(normalizedSuggestions.offer, /Sin oferta específica/);

console.log('video-pipeline: 22 assertions passed');
