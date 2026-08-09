/**
 * Experimento: prompt de render LARGO (el actual, ~26k) contra prompt CORTO (~8k).
 *
 * La única variable es el prompt. Todo lo demás se comparte a propósito: el
 * mismo ganador, la misma foto de producto, el mismo formato, el mismo motor,
 * el mismo nivel de calidad y —lo más importante— EL MISMO ANÁLISIS, que se
 * pide una sola vez y se reutiliza. Si se analizara dos veces, cualquier
 * diferencia entre las dos imágenes podría venir del análisis y no del prompt,
 * y el experimento no mediría nada.
 *
 * Uso: npx vitest run scripts/experimento-prompt-corto.test.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { test } from 'vitest';
import { analyzeReferenceLayout, buildReferenceClonePrompt, type LayoutAnalysis } from '../src/lib/creattia/ad-analysis';
import { buildClonePrompt, resolveFormat, buildEngineImages, type ClonePromptInput, type ReferenceCloneInput } from '../src/lib/creattia/generation-pipeline';
import { generateAdImage, type EngineImage } from '../src/lib/creattia/image-engines';
import { buildPromptCorto } from '../src/lib/creattia/prompt-corto';

const RAIZ = 'C:/Users/lucag/Desktop/CLAUDE/creattia';
const SALIDA = join(RAIZ, 'work', 'experimento-prompt-corto');
const GANADOR = 'C:/Users/lucag/Downloads/Foreplay.co/1b76d7e89d46ac25.webp';
const PRODUCTO = 'C:/Users/lucag/AppData/Local/Temp/claude/c--Users-lucag--claude/0b940ae8-a5b1-44f6-bdf6-7da3ea02c2fd/scratchpad/producto/poang_principal.jpg';

mkdirSync(SALIDA, { recursive: true });

// Vitest no lee .env.local, y el pipeline saca el modelo de imagen y el de
// análisis de process.env: sin esto correría con los defaults del código y no
// con los que usa la app de verdad.
function cargarEnv(ruta: string) {
	if (!existsSync(ruta)) throw new Error(`falta ${ruta}`);
	for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
		const par = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linea);
		if (!par) continue;
		const valor = par[2].trim().replace(/^["'](.*)["']$/s, '$1');
		if (valor) process.env[par[1]] = valor;
	}
}
cargarEnv(join(RAIZ, '.env.local'));

const claves = {
	openAIKey: process.env.OPENAI_API_KEY || '',
	googleKey: process.env.GOOGLE_AI_API_KEY || '',
};

function imagen(ruta: string): EngineImage {
	const buffer = readFileSync(ruta);
	const type = ruta.endsWith('.webp') ? 'image/webp' : ruta.endsWith('.png') ? 'image/png' : 'image/jpeg';
	return { buffer, type };
}

/**
 * Datos del sillón IKEA POÄNG, todos verificados en la ficha oficial de IKEA US.
 * No se agrega nada que no esté ahí: cualquier cifra inventada acá terminaría
 * impresa dentro del anuncio y ensuciaría el experimento.
 */
const ENTRADA: ClonePromptInput = {
	productNames: ['Sillón POÄNG con otomana (abedul / Knisa beige claro)'],
	productFacts: [
		'Sillón POÄNG con otomana a juego, de IKEA. Estructura de chapa de abedul laminada con laca transparente y respaldo alto que sostiene el cuello. Funda Knisa beige claro, 100% poliéster (mínimo 90% reciclado), textura lisa con un pespunte lateral característico. Relleno de espuma de poliuretano (2,0 lb/ft³ el sillón, 1,5 lb/ft³ la otomana). Medidas: sillón 26¼" de ancho × 29" de largo; otomana 19" de ancho × 22½" de largo. Precio: USD 229.00.',
	],
	brandName: 'IKEA',
	brief: '',
	language: 'es',
	subjectMode: 'product',
	colorMode: 'winner',
	typoMode: 'winner',
};

const CLON: ReferenceCloneInput = {
	...ENTRADA,
	keys: claves,
	reference: imagen(GANADOR),
	productImages: [imagen(PRODUCTO)],
	logo: null,
	requestedFormat: 'original',
	tier: 'high',
	logLabel: '[experimento]',
};

/** Ganador | Actual | Corto, con rótulo arriba de cada panel. */
async function comparativa(rutas: [string, string, string], destino: string) {
	const ALTO = 900;
	const SEPARACION = 24;
	const BANDA = 46;
	const cuadros = await Promise.all(rutas.map((r) => sharp(r).resize({ height: ALTO, fit: 'contain', background: '#ffffff' }).toBuffer()));
	const metas = await Promise.all(cuadros.map((c) => sharp(c).metadata()));
	const anchos = metas.map((m) => m.width || ALTO);
	const izquierdas = [0, anchos[0] + SEPARACION, anchos[0] + anchos[1] + SEPARACION * 2];
	const W = anchos.reduce((a, b) => a + b, 0) + SEPARACION * 2;
	const rotulos = [
		{ texto: 'GANADOR (referencia)', color: '#ffffff' },
		{ texto: 'A · PROMPT ACTUAL (largo)', color: '#ffd479' },
		{ texto: 'B · PROMPT CORTO (nuevo)', color: '#7bd88f' },
	];
	const svg = `<svg width="${W}" height="${BANDA}"><rect width="${W}" height="${BANDA}" fill="#1d1d1f"/>${
		rotulos.map((r, i) => `<text x="${izquierdas[i] + 14}" y="30" font-family="Arial" font-size="19" font-weight="bold" fill="${r.color}">${r.texto}</text>`).join('')
	}</svg>`;
	await sharp({ create: { width: W, height: ALTO + BANDA, channels: 3, background: '#ffffff' } })
		.composite([
			...cuadros.map((input, i) => ({ input, left: izquierdas[i], top: BANDA })),
			{ input: Buffer.from(svg), left: 0, top: 0 },
		])
		.jpeg({ quality: 88 })
		.toFile(destino);
}

test('mismo caso con los dos prompts', { timeout: 40 * 60 * 1000 }, async () => {
	// ── 1. Análisis, UNA sola vez ──────────────────────────────────────────────
	const t0 = Date.now();
	const analisis: LayoutAnalysis | null = await analyzeReferenceLayout(claves, {
		referenceB64: CLON.reference.buffer.toString('base64'),
		referenceMime: CLON.reference.type,
		productB64: CLON.productImages[0].buffer.toString('base64'),
		productMime: CLON.productImages[0].type,
		productName: ENTRADA.productNames[0],
		productFacts: ENTRADA.productFacts.join('\n'),
		productImages: CLON.productImages.map((f) => ({ b64: f.buffer.toString('base64'), mime: f.type })),
		brandName: ENTRADA.brandName,
		language: ENTRADA.language,
		subjectMode: ENTRADA.subjectMode,
	});
	const segundosAnalisis = Math.round((Date.now() - t0) / 1000);
	writeFileSync(join(SALIDA, 'analisis.json'), JSON.stringify(analisis, null, 1));
	console.log(`analisis listo en ${segundosAnalisis}s`);

	// ── 2. Los dos prompts, desde el MISMO objeto de argumentos ────────────────
	// Se arma el objeto exacto que el pipeline le pasa a buildReferenceClonePrompt
	// y se le da a los dos constructores. Así no hay ninguna diferencia de entrada
	// entre A y B; la igualdad con buildClonePrompt se verifica abajo.
	const argumentos: Parameters<typeof buildReferenceClonePrompt>[0] = {
		productNames: ENTRADA.productNames,
		productFacts: ENTRADA.productFacts,
		brandName: ENTRADA.brandName,
		hasLogo: false,
		brief: ENTRADA.brief,
		analysis: analisis,
		languageCode: ENTRADA.language,
		adCopy: analisis?.adCopy ? {
			headline: analisis.adCopy.headline,
			subheadline: analisis.adCopy.description,
			cta: analisis.adCopy.cta,
			language: analisis.language,
		} : undefined,
		colorMode: ENTRADA.colorMode,
		typoMode: ENTRADA.typoMode,
		subjectMode: ENTRADA.subjectMode,
		hasAvatarReference: false,
		carousel: undefined,
	};

	const promptA = buildReferenceClonePrompt(argumentos);
	const promptB = buildPromptCorto(argumentos);

	// Control: el prompt A tiene que ser byte a byte el que arma el pipeline de
	// producción. Si no lo fuera, se estaría midiendo otra cosa.
	const promptProduccion = buildClonePrompt(ENTRADA, analisis, false);
	const mismoQueProduccion = promptProduccion === promptA;

	writeFileSync(join(SALIDA, 'A-prompt-actual.txt'), promptA);
	writeFileSync(join(SALIDA, 'B-prompt-corto.txt'), promptB);
	console.log(`prompt A ${promptA.length} chars · prompt B ${promptB.length} chars · A===producción: ${mismoQueProduccion}`);

	// ── 3. Las dos generaciones, todo igual salvo el prompt ────────────────────
	const formato = await resolveFormat(CLON.requestedFormat, CLON.reference);
	const imagenes = buildEngineImages(CLON, analisis);
	console.log(`formato ${formato} · ${imagenes.length} imágenes de entrada · tier ${CLON.tier}`);

	// En serie a propósito: dos generaciones en paralelo compiten por la misma
	// cuota y los tiempos dejarían de ser comparables entre sí.
	const resultados: Array<Record<string, unknown>> = [];
	for (const variante of [
		{ id: 'A-actual', prompt: promptA },
		{ id: 'B-corto', prompt: promptB },
	]) {
		const inicio = Date.now();
		try {
			const { buffer, engine, usage } = await generateAdImage({
				googleKey: claves.googleKey,
				openAIKey: claves.openAIKey,
				prompt: variante.prompt,
				images: imagenes,
				format: formato,
				tier: CLON.tier,
			});
			const esPng = buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50;
			const ruta = join(SALIDA, `${variante.id}.${esPng ? 'png' : 'jpg'}`);
			writeFileSync(ruta, buffer);
			resultados.push({
				variante: variante.id,
				ok: true,
				ruta,
				chars: variante.prompt.length,
				segundos: Math.round((Date.now() - inicio) / 1000),
				motor: engine,
				usage,
			});
			console.log(`OK ${variante.id} en ${Math.round((Date.now() - inicio) / 1000)}s con ${engine}`);
		} catch (error) {
			resultados.push({ variante: variante.id, ok: false, chars: variante.prompt.length, segundos: Math.round((Date.now() - inicio) / 1000), error: String(error).slice(0, 400) });
			console.log(`FALLO ${variante.id}: ${String(error).slice(0, 300)}`);
		}
	}

	// ── 4. Comparativa de tres paneles ────────────────────────────────────────
	const rutaA = resultados[0].ruta as string | undefined;
	const rutaB = resultados[1].ruta as string | undefined;
	let comparativaRuta = '';
	if (rutaA && rutaB) {
		comparativaRuta = join(SALIDA, 'comparativa.jpg');
		await comparativa([GANADOR, rutaA, rutaB], comparativaRuta);
	}

	const resumen = {
		formato,
		imagenesDeEntrada: imagenes.length,
		tier: CLON.tier,
		segundosAnalisis,
		promptActualChars: promptA.length,
		promptCortoChars: promptB.length,
		reduccion: `${Math.round((1 - promptB.length / promptA.length) * 100)}%`,
		promptAIgualAProduccion: mismoQueProduccion,
		resultados,
		comparativa: comparativaRuta,
	};
	writeFileSync(join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 1));
	console.log('\nRESUMEN\n' + JSON.stringify(resumen, null, 1));
});
