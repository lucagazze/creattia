// Compara el prompt de hoy contra el de ayer, sobre el MISMO anuncio.
//
// Los cambios de hoy —la tipografía observada del ganador, el largo exacto de
// cada texto, y las razones por las que el anuncio gana— se verificaron con
// tests: sabemos que las instrucciones llegan al prompt. Lo que no sabemos es si
// mejoran la imagen, y eso solo se ve generando las dos y mirándolas.
//
// Genera dos veces el mismo anuncio: una con el prompt completo y otra con las
// reglas nuevas quitadas. Gasta plata real: dos imágenes, unos 16 centavos.
//
//   node --env-file=.env.deploy scripts/ab-prompt.mjs [rutaDelGanador]
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { analyzeReferenceLayout, normalizeImageInput } from '../src/lib/creattia/ad-analysis.ts';
import { buildClonePrompt } from '../src/lib/creattia/generation-pipeline.ts';

const RUTA = process.argv[2] || '40/f34af74755fde658.webp';
const OUT = 'comparacion-prompt';
const openAIKey = process.env.OPENAI_API_KEY;
if (!openAIKey) { console.error('Falta OPENAI_API_KEY en .env.deploy'); process.exit(1); }

const admin = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: blob } = await admin.storage.from('creative-references').download(RUTA);
if (!blob) { console.error('No se pudo bajar la referencia', RUTA); process.exit(1); }
const referencia = await normalizeImageInput(Buffer.from(await blob.arrayBuffer()));
console.log(`referencia: ${RUTA}\n`);

const producto = {
	productNames: ['Creattia'],
	productFacts: ['Herramienta de IA que clona anuncios ganadores con el producto y la marca de cada negocio. Genera imágenes listas para publicar en minutos, sin diseñar ni escribir prompts.'],
	brandName: 'Creattia',
	brief: '',
	language: 'es',
	subjectMode: 'service',
	colorMode: 'winner',
	typoMode: 'winner',
};

console.log('analizando el ganador…');
const analisis = await analyzeReferenceLayout({ openAIKey }, {
	referenceB64: referencia.buffer.toString('base64'),
	referenceMime: referencia.type,
	productName: producto.productNames[0],
	productFacts: producto.productFacts[0],
	brandName: producto.brandName,
	language: 'es',
	subjectMode: 'service',
});
if (!analisis) { console.error('el análisis no devolvió nada'); process.exit(1); }
console.log(`  tipo de anuncio: ${analisis.creative?.adType || '—'}`);
console.log(`  tipografía observada: ${(analisis.styleNotes || '—').slice(0, 90)}`);
console.log(`  zonas de texto: ${(analisis.textZones || []).length}\n`);

/** El análisis sin lo que se agregó hoy: así era ayer. */
const analisisViejo = {
	...analisis,
	styleNotes: '',
	creative: analisis.creative ? { ...analisis.creative, adType: undefined, styleFamily: undefined, scoreReasons: [] } : undefined,
	// Sin el largo del original, que es lo que fuerza el encaje.
	textZones: (analisis.textZones || []).map((zona) => ({ ...zona, original: '' })),
};

fs.mkdirSync(OUT, { recursive: true });

async function generar(etiqueta, prompt) {
	const inicio = Date.now();
	const { toFile, default: OpenAI } = await import('openai').then((m) => ({ default: m.default, toFile: m.toFile }));
	const openai = new OpenAI({ apiKey: openAIKey });
	const sharp = (await import('sharp')).default;
	const png = await sharp(referencia.buffer).flatten({ background: '#ffffff' }).toColorspace('srgb').png().toBuffer();
	const result = await openai.images.edit({
		model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
		image: [await toFile(png, 'ref.png', { type: 'image/png' })],
		prompt,
		size: '1536x1536',
		quality: 'medium',
		n: 1,
	});
	const buffer = Buffer.from(result.data[0].b64_json, 'base64');
	const archivo = `${OUT}/${etiqueta}.png`;
	fs.writeFileSync(archivo, buffer);
	console.log(`  ${etiqueta.padEnd(8)} ${Math.round((Date.now() - inicio) / 1000)}s · ${(buffer.length / 1024).toFixed(0)} KB → ${archivo}`);
}

const promptNuevo = buildClonePrompt(producto, analisis, false);
const promptViejo = buildClonePrompt(producto, analisisViejo, false)
	// Se quitan también las dos reglas nuevas de encaje y tipografía detallada.
	.replace(/\nTEXT FIT \(CRITICAL\)[^\n]*/g, '')
	.replace(/TYPOGRAPHY \(CRITICAL\)[^.]*\./g, "Match the template's typographic style, weight and case exactly.");

console.log(`prompt de ayer: ${promptViejo.length} caracteres`);
console.log(`prompt de hoy:  ${promptNuevo.length} caracteres\n`);
console.log('generando…');
await generar('ayer', promptViejo);
await generar('hoy', promptNuevo);
console.log(`\nMiralas al 100%: lo que cambia es la letra y si los textos entran en una línea.\n`);
