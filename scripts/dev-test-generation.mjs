// Harness local para iterar la calidad de generación SIN deployar.
// Uso: node --env-file=.env.local scripts/dev-test-generation.mjs <iterationName> [imageModel]
// Guarda prompt + resultado en la carpeta de iteración.
import OpenAI, { toFile } from 'openai';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT_ROOT = 'C:/Users/lucag/AppData/Local/Temp/claude/c--Users-lucag--claude/cb479755-6686-449e-a4ae-4f1dc08e42b5/scratchpad/iters';
const iteration = process.argv[2] || 'iter1';
const imageModel = process.argv[3] || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const outDir = join(OUT_ROOT, iteration);
mkdirSync(outDir, { recursive: true });

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const REFERENCE_LOCAL = 'C:/Users/lucag/Downloads/1b76d7e89d46ac25.webp';
const PRODUCT_PATHS = [
	'c9cff993-01d3-4523-b6ea-105d57d048d5/products/d7ddd6f4-413f-4e8c-883e-2234433578cc/primary.jpg',
	'c9cff993-01d3-4523-b6ea-105d57d048d5/products/d7ddd6f4-413f-4e8c-883e-2234433578cc/angle-2.jpg',
];
const PRODUCT = {
	name: 'Double Shoulder',
	facts: 'Piel de cuero doble hombro de 7-8 oz (2.8-3.2mm), 6-9 sqft. Cuero de primera calidad, superficie limpia y uniforme, estructura excelente. Ideal para monederos, bolsos, cinturones y talabartería premium. $38.50 USD. Marca: The Skirting Factory.',
	language: 'es',
};

async function downloadStorage(path) {
	const res = await fetch(`${SUPABASE_URL}/storage/v1/object/creative-assets/${path}`, {
		headers: { authorization: `Bearer ${SERVICE_KEY}` },
	});
	if (!res.ok) throw new Error(`storage ${res.status} for ${path}`);
	return Buffer.from(await res.arrayBuffer());
}

// ── Paso A: análisis de layout + copy por zona (cacheado por corrida) ──
const analysisCache = join(OUT_ROOT, 'analysis.json');
async function analyzeReference(refB64, productB64) {
	if (existsSync(analysisCache)) return JSON.parse(readFileSync(analysisCache, 'utf8'));
	const model = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o';
	const res = await openai.chat.completions.create({
		model,
		response_format: { type: 'json_object' },
		messages: [
			{
				role: 'system',
				content: `You are a senior performance ad designer. You receive: (1) a winning static ad TEMPLATE image, (2) a real product photo, (3) verified product facts.

Return STRICT JSON:
{
  "textZones": [
    { "where": "short position description (e.g. 'main headline, top center, two lines')",
      "onProduct": true|false,
      "original": "exact original text in the template",
      "replacement": "new text for the target product, same language as requested, similar length so it fits the same space, honest (no invented prices/claims beyond the provided facts)" }
  ],
  "productHasPackaging": true|false,
  "productPlacement": "precise description of where/how the template's product sits: position, scale relative to canvas, angle, cropping, lighting, shadow",
  "styleNotes": "background color(s), palette, typography feel, graphic devices worth preserving"
}

Rules:
- Enumerate EVERY visible text zone in the template (headline, subcopy, review, badges, pills, CTA, small print). None may be missed.
- "onProduct": true when the text is printed ON the product/packaging itself (label, box copy, brand on the package); false when it belongs to the ad layout (headline, cards, pills, buttons).
- "productHasPackaging": look at the REAL product photo — true only if the real product has printed packaging/labels of its own.
- Replacements: natural ${PRODUCT.language === 'es' ? 'Argentine Spanish' : 'American English'}, punchy direct-response copy, keep roughly the same character count as the original so the layout doesn't break.
- If a zone shows a spec/number (e.g. "10G PROTEIN"), replace with a REAL fact of the target product (from the provided facts) formatted the same way.
- Do not include the template's brand name anywhere in replacements.`,
			},
			{
				role: 'user',
				content: [
					{ type: 'text', text: `Target product: ${PRODUCT.name}. Verified facts: ${PRODUCT.facts}` },
					{ type: 'text', text: 'TEMPLATE:' },
					{ type: 'image_url', image_url: { url: `data:image/webp;base64,${refB64}` } },
					{ type: 'text', text: 'REAL PRODUCT PHOTO:' },
					{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${productB64}` } },
				],
			},
		],
	});
	const parsed = JSON.parse(res.choices[0].message.content);
	writeFileSync(analysisCache, JSON.stringify(parsed, null, 2));
	return parsed;
}

// ── Paso B: prompt clon con reemplazos por zona ──
function buildPrompt(analysis) {
	const keepText = analysis.productHasPackaging
		? analysis.textZones
		: analysis.textZones.filter((z) => !z.onProduct);
	const droppedOnProduct = analysis.textZones.length - keepText.length;
	const zones = keepText
		.map((z, i) => `${i + 1}. [${z.where}] Replace "${z.original}" with "${z.replacement}"`)
		.join('\n');
	return `The first input image is a WINNING AD TEMPLATE. Recreate this exact advertisement — identical layout, background, color palette, graphic devices (stars, review card, badges, pills, wavy divider, buttons), text positions and typographic hierarchy. Apply ONLY these replacements:

PRODUCT SWAP — Remove the template's original product completely. In its place — same position, same generous scale, same dynamic angle and prominence described here: ${analysis.productPlacement} — render the real product from the other input photo(s): ${PRODUCT.name}. RE-RENDER the product as a dramatic professional studio hero shot fully integrated into the scene: give it real volume and dimension (soft drape, natural folds, catching light), tilt it at the same dynamic angle as the template's product, ground it with a soft contact shadow, and let it overlap behind the foreground card exactly like the template does. Never show it as a flat cut-out pasted on top. Match the product photo's exact color, grain texture and identity. It must look premium, tactile and desirable — the unmistakable hero of the image.
${analysis.productHasPackaging ? '' : `CRITICAL: the real product has NO printed packaging. Its surface must stay completely clean — do NOT print any words, logos, badges, spec bubbles or graphics on the product itself. ${droppedOnProduct > 0 ? "The template's on-package texts are intentionally omitted; do not recreate or relocate them." : ''} All copy lives only in the ad layout's text zones.`}

TEXT SWAP — Replace every text zone with the exact copy below, keeping each in the same position, size and style as the original it replaces. Every zone listed MUST contain its text — never leave a badge, pill or button empty:
${zones}
Render all text sharp, correctly spelled, no gibberish.

BRAND SWAP — Remove the template's brand names and logos. If the template shows a brand wordmark, replace it with "The Skirting Factory" in a simple clean wordmark.

Do not change the background or palette. Do not add or remove layout elements. No watermarks. The result must look like the same winning campaign, now selling ${PRODUCT.name}.`;
}

// ── Paso C: generación ──
async function main() {
	const refBuffer = readFileSync(REFERENCE_LOCAL);
	const productBuffers = [];
	for (const p of PRODUCT_PATHS) productBuffers.push(await downloadStorage(p));
	console.log(`inputs ok (ref ${refBuffer.length}b, products ${productBuffers.map(b => b.length).join('/')}b)`);

	const analysis = await analyzeReference(refBuffer.toString('base64'), productBuffers[0].toString('base64'));
	console.log(`analysis ok: ${analysis.textZones.length} text zones`);

	const prompt = buildPrompt(analysis);
	writeFileSync(join(outDir, 'prompt.txt'), prompt);

	const inputs = [
		await toFile(refBuffer, 'reference.webp', { type: 'image/webp' }),
		await toFile(productBuffers[0], 'product-1.jpg', { type: 'image/jpeg' }),
		await toFile(productBuffers[1], 'product-2.jpg', { type: 'image/jpeg' }),
	];

	const started = Date.now();
	const params = {
		model: imageModel,
		image: inputs,
		prompt,
		size: '1024x1024',
		quality: 'high',
		n: 1,
	};
	if (imageModel === 'gpt-image-1') params.input_fidelity = 'high';
	const result = await openai.images.edit(params);
	const b64 = result.data?.[0]?.b64_json;
	if (!b64) throw new Error('sin imagen en la respuesta');
	const outPath = join(outDir, 'result.png');
	writeFileSync(outPath, Buffer.from(b64, 'base64'));
	console.log(`DONE model=${imageModel} ${(Date.now() - started) / 1000}s → ${outPath}`);
}

main().catch((e) => { console.error('FAIL:', e?.message || e); process.exit(1); });
