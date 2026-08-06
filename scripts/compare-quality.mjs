/**
 * Genera el MISMO anuncio en varias combinaciones de tamaño y nivel de calidad,
 * para poder mirar el texto y decidir con evidencia en vez de con opiniones.
 *
 *   node --env-file=.env.deploy scripts/compare-quality.mjs
 *
 * Deja los archivos en ./comparacion-calidad/ y reporta tiempo y costo estimado
 * de cada uno. Gasta plata real: son 4 imágenes, menos de un dólar en total.
 */
import fs from 'node:fs';
import path from 'node:path';

const openAIKey = process.env.OPENAI_API_KEY;
if (!openAIKey) {
	console.error(`
Falta OPENAI_API_KEY. Agregala a .env.deploy (la misma que usa Vercel):

    OPENAI_API_KEY=sk-...
`);
	process.exit(1);
}

const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const OUT = 'comparacion-calidad';

// Un anuncio con los dos casos difíciles: titular grande y letra chica.
const prompt = `A clean, professional square advertising image for a modular black metal storage cube.

Light warm off-white background. The product photographed in the centre, studio lighting, soft realistic contact shadow on the floor.

TEXT TO RENDER EXACTLY:
- Headline, upper area, two lines, dark olive green: "CUBOS MODULARES:" on the first line in a light weight, "CREADOS PARA VOS" on the second line in a heavy bold weight.
- Small print, lower left corner, dark grey, small size: "34x31x34 CM · 8 COLORES · ARMADO EN 5 MINUTOS"

TEXT RENDERING QUALITY (CRITICAL): render every letter as clean, flat, vector-like graphic typography with opaque solid fill and razor-sharp edges, correct kerning and even anti-aliasing. Absolutely no drop shadow, no glow, no white halo, no ghost copy, no blurred outline, no bevel, no feathering and no bloom behind any letter. The text must look typed in a design tool and exported at full resolution, perfectly crisp at 100% zoom.`;

// tamaño, calidad, para qué sirve la comparación
const variants = [
	{ size: '1024x1024', quality: 'medium', nota: 'lo que salía antes' },
	{ size: '1536x1536', quality: 'medium', nota: 'solo más resolución (el cambio nuevo)' },
	{ size: '1024x1024', quality: 'high', nota: 'solo más calidad' },
	{ size: '1536x1536', quality: 'high', nota: 'las dos cosas' },
];

fs.mkdirSync(OUT, { recursive: true });
console.log(`\nModelo ${model} · 4 variantes del mismo anuncio\n`);

const results = [];
for (const variant of variants) {
	const label = `${variant.size}-${variant.quality}`;
	process.stdout.write(`→ ${label.padEnd(18)} ${variant.nota.padEnd(38)} `);
	const started = Date.now();
	try {
		const response = await fetch('https://api.openai.com/v1/images/generations', {
			method: 'POST',
			headers: { authorization: `Bearer ${openAIKey}`, 'content-type': 'application/json' },
			body: JSON.stringify({ model, prompt, size: variant.size, quality: variant.quality, n: 1 }),
		});
		const payload = await response.json();
		if (!response.ok) {
			console.log(`falló — ${(payload.error?.message || '').slice(0, 90)}`);
			continue;
		}
		const seconds = (Date.now() - started) / 1000;
		const b64 = payload.data?.[0]?.b64_json;
		if (!b64) { console.log('sin imagen'); continue; }
		const file = path.join(OUT, `${label}.png`);
		fs.writeFileSync(file, Buffer.from(b64, 'base64'));
		const usage = payload.usage || {};
		results.push({ label, nota: variant.nota, seconds, file, usage });
		console.log(`${seconds.toFixed(0)}s`);
	} catch (error) {
		console.log(`error — ${error.message.slice(0, 80)}`);
	}
}

if (!results.length) {
	console.log('\nNo se generó ninguna imagen.\n');
	process.exit(1);
}

console.log('\n┌─ resultados ─────────────────────────────────────────────────────');
for (const r of results) {
	const tokens = r.usage.output_tokens ? `  ${r.usage.output_tokens} tokens de salida` : '';
	console.log(`│ ${r.label.padEnd(18)} ${String(r.seconds.toFixed(0) + 's').padStart(5)}${tokens}`);
}
console.log('└──────────────────────────────────────────────────────────────────');
console.log(`\nAbrí la carpeta y mirá el texto de cerca:\n  open ${path.resolve(OUT)}\n`);
console.log('Lo que hay que mirar: el borde de las letras del titular y si la');
console.log('letra chica tiene sombra o halo. Elegí la variante más barata que');
console.log('se vea limpia — no hace falta la más cara si la diferencia no se nota.\n');
