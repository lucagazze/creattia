/**
 * Banco de pruebas de FIDELIDAD del clon.
 *
 * Corre el pipeline real —el mismo que usan el Studio y los lotes— sobre varios
 * anuncios ganadores y varios productos, y deja el ganador y el resultado uno al
 * lado del otro para poder juzgarlos mirando.
 *
 * Uso: npx vitest run scripts/qa-fidelidad-clon.test.ts  (con las claves en el entorno)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import sharp from 'sharp';
import { test } from 'vitest';
import { renderReferenceClone } from '../src/lib/creattia/generation-pipeline';

const BANCO = process.env.BANCO_DIR;
const SALIDA = process.env.SALIDA_DIR;
mkdirSync(SALIDA, { recursive: true });

const claves = {
	openAIKey: process.env.OPENAI_API_KEY || '',
	googleKey: process.env.GOOGLE_AI_API_KEY || '',
};

function imagen(ruta) {
	const buffer = readFileSync(ruta);
	const type = ruta.endsWith('.webp') ? 'image/webp' : ruta.endsWith('.png') ? 'image/png' : 'image/jpeg';
	return { buffer, type };
}

const P = (n) => join(BANCO, 'productos', n);
const R = (n) => join(BANCO, 'refs', n);

/** Cinco combinaciones distintas: distinto ganador, distinto sujeto, distinto modo. */
const CASOS = [
	{
		id: '1-comparativa-suplemento',
		referencia: R('ref1_competencia.jpg'),
		nota: 'Ganador: comparativa partida 50/50 (maquinita vs afeitadora), con listas de tildes y cruces a cada lado.',
		entrada: {
			productNames: ['Creatina 9 en 1 ZaneLabs'],
			productFacts: ['Suplemento femenino en polvo, 9 activos en una sola toma. Envase blanco con tapa negra. Sabor neutro. Marca: ZaneLabs.'],
			brandName: 'ZaneLabs',
			brief: '',
			language: 'es',
			subjectMode: 'product',
			colorMode: 'winner',
			typoMode: 'winner',
		},
		productImages: [P('zanelabs-creatina.webp')],
	},
	{
		id: '2-antes-despues-crema',
		referencia: R('ref2_antes-despues.jpg'),
		nota: 'Ganador: antes/después con dos fotos de cara, degradé azul, titular centrado en tres bloques.',
		entrada: {
			productNames: ['Medicube Red Cream'],
			productFacts: ['Crema coreana para piel con rojeces y textura despareja. Envase blanco con tapa. Uso diario, mañana y noche. Tienda: Selka.'],
			brandName: 'Selka',
			brief: '',
			language: 'es',
			subjectMode: 'product',
			colorMode: 'winner',
			typoMode: 'winner',
		},
		productImages: [P('medicube-crema.webp')],
	},
	{
		id: '3-resena-tonico',
		referencia: R('ref3_resenas.webp'),
		nota: 'Ganador: tarjeta de reseña con 5 estrellas sobre una mano sosteniendo el producto, fondo bordó.',
		entrada: {
			productNames: ['Medicube Zero Pore Pad'],
			productFacts: ['Tónico exfoliante coreano en pads. Envase cilíndrico blanco. Para poros y textura. Tienda: Selka.'],
			brandName: 'Selka',
			brief: '',
			language: 'es',
			subjectMode: 'product',
			colorMode: 'winner',
			typoMode: 'winner',
		},
		productImages: [P('medicube-tonico.webp')],
	},
	{
		id: '4-tienda-catalogo',
		referencia: R('ref4_precio.jpg'),
		nota: 'Ganador: producto único sobre pedestal, fondo verde oscuro, titular grande a la derecha.',
		entrada: {
			productNames: ['Medicube Red Cream', 'Medicube Zero Pore Pad', 'Medicube Peptide Serum', 'Medicube Mascarilla PDRN'],
			productFacts: ['Selka es una tienda de skincare coreano. Vende cremas, tónicos, serums y mascarillas de Medicube. Envíos a todo el país.'],
			brandName: 'Selka',
			brief: '',
			language: 'es',
			subjectMode: 'catalog',
			colorMode: 'winner',
			typoMode: 'winner',
		},
		productImages: [P('medicube-crema.webp'), P('medicube-tonico.webp'), P('medicube-peptide-serum.webp'), P('medicube-mascarilla-pdrn.webp')],
	},
	{
		id: '5-servicio-sin-producto',
		referencia: R('ref5_caracteristicas.jpg'),
		nota: 'Ganador: clínica, foto de persona a la derecha, píldoras de texto a la izquierda, rosa.',
		entrada: {
			productNames: ['Urbania3D'],
			productFacts: ['Software B2B de showrooms virtuales para inmobiliarias. Se recorre la propiedad desde el navegador, sin apps. Clientes en 4 países.'],
			brandName: 'Urbania3D',
			brief: '',
			language: 'es',
			subjectMode: 'brand',
			colorMode: 'winner',
			typoMode: 'winner',
		},
		productImages: [],
	},
];

async function comparativa(referencia, generada, destino, titulo) {
	const ALTO = 900;
	const cuadro = async (ruta) => sharp(ruta).resize({ height: ALTO, fit: 'contain', background: '#ffffff' }).toBuffer();
	const [a, b] = await Promise.all([cuadro(referencia), cuadro(generada)]);
	const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
	const W = ma.width + mb.width + 30;
	await sharp({ create: { width: W, height: ALTO + 44, channels: 3, background: '#ffffff' } })
		.composite([
			{ input: a, left: 0, top: 44 },
			{ input: b, left: ma.width + 30, top: 44 },
			{
				input: Buffer.from(`<svg width="${W}" height="44"><rect width="${W}" height="44" fill="#1d1d1f"/>
				<text x="12" y="28" font-family="Arial" font-size="17" fill="#fff">GANADOR  ·  ${titulo}</text>
				<text x="${ma.width + 42}" y="28" font-family="Arial" font-size="17" fill="#7bd88f">GENERADO</text></svg>`),
				left: 0, top: 0,
			},
		])
		.jpeg({ quality: 82 }).toFile(destino);
}

test('fidelidad del clon sobre 5 ganadores distintos', { timeout: 20 * 60 * 1000 }, async () => {
const resumen = [];
for (const caso of CASOS) {
	const t0 = Date.now();
	try {
		const resultado = await renderReferenceClone({
			...caso.entrada,
			keys: claves,
			reference: imagen(caso.referencia),
			productImages: caso.productImages.map(imagen),
			requestedFormat: 'original',
			tier: 'high',
			logLabel: `[qa:${caso.id}]`,
		});
		const salida = join(SALIDA, `${caso.id}.png`);
		writeFileSync(salida, resultado.buffer);
		writeFileSync(join(SALIDA, `${caso.id}.prompt.txt`), resultado.prompt);
		writeFileSync(join(SALIDA, `${caso.id}.analisis.json`), JSON.stringify(resultado.analysis, null, 1));
		await comparativa(caso.referencia, salida, join(SALIDA, `${caso.id}.comparativa.jpg`), caso.id);
		const a = resultado.analysis || {};
		resumen.push({
			caso: caso.id,
			ok: true,
			segundos: Math.round((Date.now() - t0) / 1000),
			motor: resultado.engine,
			formato: resultado.format,
			medio: a.renderingMedium || '(vacío)',
			geometria: (a.compositionGeometry || '(vacío)').slice(0, 110),
			wordmark: a.logoIsWordmark,
			comparacion: a.comparison?.detected,
		});
		console.log(`OK  ${caso.id}  ${Math.round((Date.now() - t0) / 1000)}s  medio="${(a.renderingMedium || '').slice(0, 60)}"`);
	} catch (error) {
		resumen.push({ caso: caso.id, ok: false, error: String(error).slice(0, 300) });
		console.log(`FALLO ${caso.id}: ${String(error).slice(0, 200)}`);
	}
}
writeFileSync(join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 1));
console.log('\n' + JSON.stringify(resumen, null, 1));
});
