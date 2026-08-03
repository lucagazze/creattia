import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	dialogueForSegment,
	fallbackScenesForDuration,
	isVideoOutputDuration,
	referenceSegmentForOutput,
	scenesForSegment,
	videoCreditCost,
	videoCreditCostForAccount,
	videoSegmentsForDuration,
} from '../src/lib/creattia/video-pipeline.ts';
import { normalizeVideoSetupSuggestions } from '../src/lib/creattia/video-suggestions.ts';
import { naturalFallbackDialogue, normalizeVideoProductName, sanitizeDialogueLine, stripVideoUrls } from '../src/lib/creattia/video-copy.ts';
import { isAdminEmail } from '../src/lib/creattia/admin.ts';
import { adCopyToText, fallbackAdCopy, normalizeAdCopy, normalizeDisplayWebsite, stripWebReferences } from '../src/lib/creattia/ad-copy.ts';

assert.deepEqual(videoSegmentsForDuration(4), [{ index: 0, start: 0, end: 4, duration: 4 }]);
assert.deepEqual(videoSegmentsForDuration(10), [{ index: 0, start: 0, end: 10, duration: 10 }]);
assert.deepEqual(videoSegmentsForDuration(20).map(({ start, end }) => [start, end]), [[0, 10], [10, 20]]);
assert.deepEqual(videoSegmentsForDuration(30).map(({ start, end }) => [start, end]), [[0, 10], [10, 20], [20, 30]]);
assert.deepEqual(videoSegmentsForDuration(11).map(({ start, end }) => [start, end]), [[0, 6], [6, 11]]);
assert.deepEqual(videoSegmentsForDuration(23).map(({ start, end }) => [start, end]), [[0, 8], [8, 16], [16, 23]]);
assert.equal(isVideoOutputDuration(7), true);
assert.equal(isVideoOutputDuration(29), true);
assert.equal(isVideoOutputDuration(3), false);
assert.equal(isVideoOutputDuration(31), false);
assert.equal(videoCreditCost(4), 4);
assert.equal(videoCreditCost(11), 8);
assert.equal(videoCreditCost(20), 8);
assert.equal(videoCreditCost(30), 12);
assert.equal(videoCreditCostForAccount(30, true), 0);
assert.equal(videoCreditCostForAccount(30, false), 12);
assert.equal(isAdminEmail('ALGORITMIADESARROLLOS@GMAIL.COM'), true);

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
	formatMode: 'vertical',
	durationSeconds: 13,
	durationReason: 'La demostración necesita algunos segundos extra.',
}, { productName: 'Hydra 10', brandName: 'Creattia', productFacts: 'Hidratación ligera para piel sensible', hasSpeakingPerson: true });
assert.equal(normalizedSuggestions.objective, 'UGC / Testimonial');
assert.equal(normalizedSuggestions.tone, 'Premium');
assert.match(normalizedSuggestions.audience, /Hydra 10/);
assert.match(normalizedSuggestions.offer, /Sin oferta específica/);
assert.equal(normalizedSuggestions.formatMode, 'vertical');
assert.equal(normalizedSuggestions.durationSeconds, 13);
assert.ok(normalizedSuggestions.audienceAlternatives.length >= 2);
assert.ok(normalizedSuggestions.audienceAlternatives.every((item) => item.ageRange && item.insight && item.angle));
assert.match(normalizedSuggestions.hookIdea, /Hydra 10/i);
assert.match(normalizedSuggestions.realismDirection, /natural/i);
assert.match(normalizedSuggestions.durationReason, /demostración/);
assert.equal(normalizeVideoProductName('cuero https://theskirtingfactoryllc.com/products/rose-skirting-leather?variant=42'), 'Rose Skirting Leather');
assert.equal(stripVideoUrls('Conocé https://example.com/producto ahora'), 'Conocé ahora');
const fallbackDialogue = naturalFallbackDialogue({ productName: 'Hydra 10', benefit: 'Hidratación ligera para piel sensible', cta: 'Conocelo hoy', duration: 8 });
assert.doesNotMatch(fallbackDialogue, /https?:|www\./i);
assert.equal(sanitizeDialogueLine('Nombrar Hydra 10 y cerrar con https://example.com', fallbackDialogue), fallbackDialogue);

const publicationCopy = fallbackAdCopy({ productName: 'Hydra 10 https://example.com', productFacts: 'Hidratación ligera para piel sensible', cta: 'Conocelo hoy' });
assert.doesNotMatch(adCopyToText(publicationCopy), /https?:|www\./i);
assert.ok(publicationCopy.headline.length <= 60);
assert.ok(publicationCopy.description.length <= 90);
const normalizedCopy = normalizeAdCopy({ primaryText: 'Un hook concreto', headline: 'Hydra 10', description: '', cta: '' }, { productName: 'Hydra 10', productFacts: 'Hidratación ligera' });
assert.equal(normalizedCopy.primaryText, 'Un hook concreto');
assert.ok(normalizedCopy.description.length > 0);
assert.match(adCopyToText(normalizedCopy), /Título: Hydra 10/);

assert.equal(normalizeDisplayWebsite('https://www.example.com/producto?variant=2'), 'example.com');
assert.equal(stripWebReferences('Visitá example.com/producto para conocerlo'), 'Visitá para conocerlo');

const staticPromptSource = readFileSync(new URL('../src/lib/creattia/ad-analysis.ts', import.meta.url), 'utf8');
assert.match(staticPromptSource, /selected NO ADDED LOGO/i);
assert.match(staticPromptSource, /selected NO WEBSITE/i);
assert.match(staticPromptSource, /explicitly selected INCLUDE LOGO/i);
assert.match(staticPromptSource, /Render exactly.*ONCE/i);

const videoPromptSource = readFileSync(new URL('../src/lib/creattia/video-engines.ts', import.meta.url), 'utf8');
assert.match(videoPromptSource, /selected NO ADDED LOGO/i);
assert.match(videoPromptSource, /selected NO WEBSITE/i);
assert.match(videoPromptSource, /LOGO PERMISSION: show the supplied official logo/i);
assert.match(videoPromptSource, /show exactly.*once/i);

console.log('video-pipeline: 55 assertions passed');
