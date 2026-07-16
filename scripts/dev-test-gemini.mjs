// Prueba Gemini (nano-banana) con el mismo caso Flings + Double Shoulder.
// Uso: node --env-file=.env.local scripts/dev-test-gemini.mjs <iterName> <model>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_ROOT = 'C:/Users/lucag/AppData/Local/Temp/claude/c--Users-lucag--claude/cb479755-6686-449e-a4ae-4f1dc08e42b5/scratchpad/iters';
const iteration = process.argv[2] || 'gemini1';
const model = process.argv[3] || 'gemini-3-pro-image-preview';
const outDir = join(OUT_ROOT, iteration);
mkdirSync(outDir, { recursive: true });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function downloadStorage(path) {
	const res = await fetch(`${SUPABASE_URL}/storage/v1/object/creative-assets/${path}`, {
		headers: { authorization: `Bearer ${SERVICE_KEY}` },
	});
	if (!res.ok) throw new Error(`storage ${res.status} for ${path}`);
	return Buffer.from(await res.arrayBuffer());
}

// Mismo análisis cacheado y mismo prompt que la iteración ganadora de gpt-image-2
const analysis = JSON.parse(readFileSync(join(OUT_ROOT, 'analysis.json'), 'utf8'));
const keepText = analysis.productHasPackaging ? analysis.textZones : analysis.textZones.filter((z) => !z.onProduct);
const zones = keepText.map((z, i) => `${i + 1}. [${z.where}] Replace "${z.original}" with "${z.replacement}"`).join('\n');
const prompt = `The first input image is a WINNING AD TEMPLATE. Recreate this exact advertisement — identical layout, background, color palette, graphic devices (stars, review card, badges, pills, wavy divider, buttons), text positions and typographic hierarchy. Apply ONLY these replacements:

PRODUCT SWAP — Remove the template's original product completely. In its place — same position, same generous scale, same dynamic angle and prominence described here: ${analysis.productPlacement} — render the real product from the other input photo(s): Double Shoulder, a premium leather double shoulder hide. RE-RENDER the product as a dramatic professional studio hero shot fully integrated into the scene: give it real volume and dimension (soft drape, natural folds, catching light), tilt it at the same dynamic angle as the template's product, ground it with a soft contact shadow. Never show it as a flat cut-out. Match the product photo's exact color and grain texture.
CRITICAL: the real product has NO printed packaging. Its surface must stay completely clean — do NOT print any words, logos, badges or graphics on the product itself. The template's on-package texts are intentionally omitted.

TEXT SWAP — Replace every text zone with the exact copy below, keeping each in the same position, size and style as the original. Every zone listed MUST contain its text — never leave a badge, pill or button empty:
${zones}
Render all text sharp, correctly spelled, no gibberish.

BRAND SWAP — Remove the template's brand names and logos. If the layout needs a brand mark, place the provided logo image (last input) EXACTLY as it is, once, small and discreet. Never redraw the logo, never invent badges, seals, flags or emblems.

STRICT FIDELITY — Copy the template's layout structure 1:1: same background (flat color, no added waves, gradients or decorative shapes), same divider style, same pill/badge arrangement and count, same positions. Do not add ANY element that is not in the template. No watermarks. The result must look like the same winning campaign, now selling Double Shoulder leather.`;

const ref = readFileSync('C:/Users/lucag/Downloads/1b76d7e89d46ac25.webp');
const uid = 'c9cff993-01d3-4523-b6ea-105d57d048d5';
const prod1 = await downloadStorage(`${uid}/products/d7ddd6f4-413f-4e8c-883e-2234433578cc/primary.jpg`);
const prod2 = await downloadStorage(`${uid}/products/d7ddd6f4-413f-4e8c-883e-2234433578cc/angle-2.jpg`);
const logo = await downloadStorage(`${uid}/brand/logo.png`);

const parts = [
	{ text: prompt },
	{ inline_data: { mime_type: 'image/webp', data: ref.toString('base64') } },
	{ inline_data: { mime_type: 'image/jpeg', data: prod1.toString('base64') } },
	{ inline_data: { mime_type: 'image/jpeg', data: prod2.toString('base64') } },
	{ inline_data: { mime_type: 'image/png', data: logo.toString('base64') } },
];

const started = Date.now();
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({
		contents: [{ parts }],
		generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
	}),
});
const data = await res.json().catch(() => ({}));
const img = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data || p.inline_data?.data);
if (!img) {
	console.log('FAIL', res.status, JSON.stringify(data).slice(0, 400));
	process.exit(1);
}
const b64 = img.inlineData?.data || img.inline_data?.data;
writeFileSync(join(outDir, 'result.png'), Buffer.from(b64, 'base64'));
console.log(`DONE model=${model} ${(Date.now() - started) / 1000}s → ${join(outDir, 'result.png')}`);
