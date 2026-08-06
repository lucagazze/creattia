/**
 * Compara los motores de imagen sobre EL MISMO anuncio, a la resolución actual.
 *
 * La tabla que hay en image-engines.ts es de julio, se hizo con un solo anuncio
 * y cuando los cuadrados salían a 1024. Con eso se decidió que gpt-image-2 era el
 * primario, pero es muy poca evidencia para una decisión que afecta el costo, el
 * tiempo y la calidad de cada imagen que genera la app.
 *
 * Esto genera tres anuncios distintos con cada motor a 1536 y deja los archivos
 * para mirarlos. Lo que importa mirar es el texto chico: es donde los modelos se
 * diferencian y es lo que un anuncio clonado necesita bien.
 *
 *   node --env-file=.env.deploy scripts/compare-engines.mjs
 *
 * Gasta plata real: 9 imágenes, cerca de un dólar en total.
 */
import fs from 'node:fs';

const openAIKey = process.env.OPENAI_API_KEY;
const googleKey = process.env.GOOGLE_AI_API_KEY;
if (!openAIKey || !googleKey) {
	console.error(`
Faltan claves. Agregá a .env.deploy las mismas que usa Vercel:

    OPENAI_API_KEY=sk-...
    GOOGLE_AI_API_KEY=AIza...
`);
	process.exit(1);
}

const OUT = 'comparacion-motores';
const REGLA_TEXTO = `TEXT RENDERING QUALITY (CRITICAL): render every letter as clean, flat, vector-like graphic typography with opaque solid fill and razor-sharp edges, correct kerning and even anti-aliasing. Absolutely no drop shadow, no glow, no white halo, no ghost copy, no blurred outline, no bevel and no bloom behind any letter. The text must look typed in a design tool and exported at full resolution, perfectly crisp at 100% zoom.`;

// Tres anuncios con dificultades distintas. El texto chico es el que decide.
const anuncios = [
	{
		id: 'etiqueta',
		que: 'letra chica sobre el envase — el caso donde Pro falló en julio',
		prompt: `A square advertising image for a skincare serum bottle on a marble surface, soft studio light.
TEXT TO RENDER EXACTLY:
- On the bottle label, small but legible: "PDRN NIACINAMIDE 10%"
- Headline top: "PIEL NUEVA EN 14 DÍAS"
- Small print bottom left: "30 ML · USO NOCTURNO · DERMATOLÓGICAMENTE TESTEADO"
${REGLA_TEXTO}`,
	},
	{
		id: 'precio',
		que: 'números y símbolos, donde se nota cualquier deformación',
		prompt: `A square advertising image for a modular black metal storage cube on a warm off-white background.
TEXT TO RENDER EXACTLY:
- Headline, two lines: "CUBOS MODULARES:" light weight, "CREADOS PARA VOS" heavy bold
- Price badge, bottom right: "$38.500 x 3 CUOTAS SIN INTERÉS"
- Small print, lower left: "34x31x34 CM · 8 COLORES · ARMADO EN 5 MINUTOS"
${REGLA_TEXTO}`,
	},
	{
		id: 'testimonial',
		que: 'texto largo dentro de una tarjeta, con persona en escena',
		prompt: `A square advertising image: a woman in her 30s smiling, holding a coffee bag, kitchen background, natural light. A white review card overlaps the lower left of the photo.
TEXT TO RENDER EXACTLY:
- Inside the white card, small: "Llevo tres semanas tomándolo y no vuelvo al de antes. El aroma se siente apenas abrís el paquete."
- Under the quote, smaller: "Carolina M. · Compra verificada"
- Headline top right, bold: "+16.000 RESEÑAS"
${REGLA_TEXTO}`,
	},
];

const motores = [
	{
		id: 'gpt-image-2-medium',
		costo: 0.078,
		async generar(prompt) {
			const r = await fetch('https://api.openai.com/v1/images/generations', {
				method: 'POST',
				headers: { authorization: `Bearer ${openAIKey}`, 'content-type': 'application/json' },
				body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2', prompt, size: '1536x1536', quality: 'medium', n: 1 }),
			});
			const j = await r.json();
			if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
			return Buffer.from(j.data[0].b64_json, 'base64');
		},
	},
	{ id: 'gemini-flash', modelo: 'gemini-3.1-flash-image', costo: 0.067, generar: gemini },
	{ id: 'gemini-pro', modelo: 'gemini-3-pro-image', costo: 0.134, generar: gemini },
];

async function gemini(prompt) {
	const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.modelo}:generateContent?key=${googleKey}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			contents: [{ role: 'user', parts: [{ text: prompt }] }],
			generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
		}),
	});
	const j = await r.json();
	if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
	const parte = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
	if (!parte) throw new Error('sin imagen en la respuesta');
	return Buffer.from(parte.inlineData.data, 'base64');
}

fs.mkdirSync(OUT, { recursive: true });
console.log(`\n${anuncios.length} anuncios × ${motores.length} motores, todos a 1536\n`);

const filas = [];
for (const anuncio of anuncios) {
	console.log(`── ${anuncio.id}: ${anuncio.que}`);
	for (const motor of motores) {
		process.stdout.write(`   ${motor.id.padEnd(20)} `);
		const inicio = Date.now();
		try {
			const buffer = await motor.generar(anuncio.prompt);
			const segundos = Math.round((Date.now() - inicio) / 1000);
			const archivo = `${OUT}/${anuncio.id}--${motor.id}.png`;
			fs.writeFileSync(archivo, buffer);
			console.log(`${String(segundos).padStart(3)}s  ${(buffer.length / 1024).toFixed(0).padStart(5)} KB  → ${archivo}`);
			filas.push({ anuncio: anuncio.id, motor: motor.id, segundos, kb: Math.round(buffer.length / 1024), costo: motor.costo });
		} catch (error) {
			console.log(`falló: ${error.message.slice(0, 70)}`);
			filas.push({ anuncio: anuncio.id, motor: motor.id, error: error.message.slice(0, 70) });
		}
	}
}

console.log('\n════ RESUMEN ════');
for (const motor of motores) {
	const suyas = filas.filter((f) => f.motor === motor.id && !f.error);
	if (!suyas.length) { console.log(`${motor.id.padEnd(20)} todas fallaron`); continue; }
	const media = Math.round(suyas.reduce((t, f) => t + f.segundos, 0) / suyas.length);
	console.log(`${motor.id.padEnd(20)} ${suyas.length}/${anuncios.length} ok · ${String(media).padStart(3)}s promedio · USD ${(motor.costo * anuncios.length).toFixed(3)} el set`);
}
console.log(`\nLas ${filas.filter((f) => !f.error).length} imágenes están en ./${OUT}/`);
console.log('Miralas al 100%: lo que decide es el texto chico, no la foto.\n');
