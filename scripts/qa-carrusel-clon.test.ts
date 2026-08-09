/**
 * QA del carrusel: reproduce el camino real de `plan.ts` + `batch-worker.ts`.
 *
 * Una llamada de análisis por página (como plan.ts), y cada página se renderiza
 * con SU propio análisis como `approvedPlan` (como el worker de lotes).
 *
 * Uso: npx vitest run scripts/qa-carrusel-clon.test.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { test } from 'vitest';
import { analyzeReferenceLayout, normalizeImageInput, type LayoutAnalysis } from '../src/lib/creattia/ad-analysis';
import { renderReferenceClone } from '../src/lib/creattia/generation-pipeline';
import { pickQualityTier } from '../src/lib/creattia/quality-router';

const RAIZ = 'C:/Users/lucag/Desktop/CLAUDE/creattia';
const SALIDA = join(RAIZ, 'work/qa-carrusel/out');
mkdirSync(SALIDA, { recursive: true });

// Las claves viven en .env.local, no en el entorno del shell.
for (const linea of readFileSync(join(RAIZ, '.env.local'), 'utf8').split('\n')) {
	const corte = linea.indexOf('=');
	if (corte < 1 || linea.trimStart().startsWith('#')) continue;
	const nombre = linea.slice(0, corte).trim();
	if (!process.env[nombre]) process.env[nombre] = linea.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
}
const claves = {
	openAIKey: process.env.OPENAI_API_KEY || '',
	googleKey: process.env.GOOGLE_AI_API_KEY || '',
};

/** Las 3 páginas reales del carrusel de World's Best Cat Litter. */
const PAGINAS = [
	'C:/Users/lucag/Downloads/Foreplay.co/5ebfc8e704cb8d2a.jpg',
	join(RAIZ, 'public/scraped_ads/images/40/55838572fda2ef81.jpg'),
	join(RAIZ, 'public/scraped_ads/images/40/a490e3f90591083b.jpg'),
];
const FOTO_PRODUCTO = join(RAIZ, 'work/qa-carrusel/in/pelota.jpg');

const ENTRADA = {
	productNames: ['Pelota adidas Argentum 24'],
	productFacts: ['Balón de juego oficial de la Liga Profesional argentina. Blanco con paneles celestes, azules y dorados, escudo de AFA. Sin costuras, cámara de butilo. Marca: adidas. Tienda: Dexter.'],
	brandName: 'Dexter',
	brief: '',
	language: 'es',
	subjectMode: 'product' as const,
	colorMode: 'winner' as const,
	typoMode: 'winner' as const,
};

async function comparativa(rutas: string[], destino: string, etiquetas: string[]) {
	const ALTO = 620;
	const cuadros = await Promise.all(rutas.map((ruta) => sharp(ruta).resize({ height: ALTO, fit: 'contain', background: '#ffffff' }).toBuffer()));
	const metas = await Promise.all(cuadros.map((buffer) => sharp(buffer).metadata()));
	const anchos = metas.map((meta) => meta.width || ALTO);
	const W = anchos.reduce((total, ancho) => total + ancho + 16, 0) + 16;
	let x = 16;
	const capas: sharp.OverlayOptions[] = [];
	let svg = `<svg width="${W}" height="34"><rect width="${W}" height="34" fill="#1d1d1f"/>`;
	cuadros.forEach((cuadro, indice) => {
		capas.push({ input: cuadro, left: x, top: 34 });
		svg += `<text x="${x + 6}" y="23" font-family="Arial" font-size="16" fill="${etiquetas[indice].startsWith('GEN') ? '#7bd88f' : '#ffffff'}">${etiquetas[indice]}</text>`;
		x += anchos[indice] + 16;
	});
	capas.push({ input: Buffer.from(svg + '</svg>'), left: 0, top: 0 });
	await sharp({ create: { width: W, height: ALTO + 34, channels: 3, background: '#ffffff' } })
		.composite(capas).jpeg({ quality: 84 }).toFile(destino);
}

test('carrusel de 3 páginas: cada página con su propio análisis', { timeout: 25 * 60 * 1000 }, async () => {
	const referencias = await Promise.all(PAGINAS.map(async (ruta) => {
		const normalizada = await normalizeImageInput(readFileSync(ruta));
		if (!normalizada) throw new Error(`no se pudo normalizar ${ruta}`);
		return normalizada;
	}));
	const producto = await normalizeImageInput(readFileSync(FOTO_PRODUCTO));
	if (!producto) throw new Error('no se pudo normalizar la foto del producto');
	const productImages = [{ b64: producto.buffer.toString('base64'), mime: producto.type }];

	// === Paso 1: igual que plan.ts — una llamada de análisis POR PÁGINA ===
	const analisis = await Promise.all(referencias.map((referencia) => analyzeReferenceLayout(claves, {
		referenceB64: referencia.buffer.toString('base64'),
		referenceMime: referencia.type,
		productB64: productImages[0].b64,
		productMime: productImages[0].mime,
		productImages,
		productName: ENTRADA.productNames[0],
		productFacts: ENTRADA.productFacts[0],
		brandName: ENTRADA.brandName,
		language: ENTRADA.language,
		subjectMode: ENTRADA.subjectMode,
	})));
	if (analisis.some((pagina) => !pagina)) throw new Error('una página no se pudo analizar (plan.ts devolvería 502)');
	const paginas = analisis as LayoutAnalysis[];
	paginas.forEach((pagina, indice) => {
		writeFileSync(join(SALIDA, `pagina${indice + 1}.analisis.json`), JSON.stringify(pagina, null, 1));
		console.log(`ANALISIS p${indice + 1}  referenceHasProduct=${pagina.referenceHasProduct}  imageSlots=${JSON.stringify((pagina as any).imageSlots)}`);
	});

	// === Paso 2: igual que batch-worker.ts — cada página con SU approvedPlan ===
	const resumen: any[] = [];
	for (let indice = 0; indice < referencias.length; indice++) {
		const t0 = Date.now();
		const decision = pickQualityTier(paginas[indice]);
		const resultado = await renderReferenceClone({
			...ENTRADA,
			keys: claves,
			reference: referencias[indice],
			productImages: [producto],
			approvedPlan: paginas[indice],
			carousel: { index: indice + 1, total: referencias.length },
			requestedFormat: 'original',
			tier: decision.tier,
			logLabel: `[qa:carrusel:p${indice + 1}]`,
		});
		const salida = join(SALIDA, `pagina${indice + 1}.png`);
		writeFileSync(salida, resultado.buffer);
		writeFileSync(join(SALIDA, `pagina${indice + 1}.prompt.txt`), resultado.prompt);
		await comparativa([PAGINAS[indice], salida], join(SALIDA, `pagina${indice + 1}.comparativa.jpg`), [`GANADOR p${indice + 1}`, `GENERADO p${indice + 1}`]);
		resumen.push({
			pagina: indice + 1,
			segundos: Math.round((Date.now() - t0) / 1000),
			motor: resultado.engine,
			formato: resultado.format,
			referenceHasProduct: paginas[indice].referenceHasProduct,
			promptCaracteres: resultado.prompt.length,
			// ¿El prompt de esta página habla de ESTA página o de otra?
			mencionaGato: /\bcat\b/i.test(resultado.prompt),
			mencionaSachet: /sachet|pouch|paws/i.test(resultado.prompt),
		});
		console.log(`OK p${indice + 1} ${Math.round((Date.now() - t0) / 1000)}s`);
	}
	await comparativa(PAGINAS, join(SALIDA, 'ganador-3paginas.jpg'), ['GANADOR p1', 'GANADOR p2', 'GANADOR p3']);
	await comparativa([1, 2, 3].map((n) => join(SALIDA, `pagina${n}.png`)), join(SALIDA, 'generado-3paginas.jpg'), ['GEN p1', 'GEN p2', 'GEN p3']);
	writeFileSync(join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 1));
	console.log('\n' + JSON.stringify(resumen, null, 1));
});
