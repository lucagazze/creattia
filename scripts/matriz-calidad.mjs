/**
 * La matriz: el mismo pipeline contra los casos que la app tiene que resolver.
 *
 * Mirar un anuncio y ajustar el prompt para que ese salga bien es la forma más
 * rápida de romper los otros siete. Cada cambio de prompt se paga en todos los
 * casos a la vez, y hasta ahora se validaba en uno solo.
 *
 * Cada caso cruza un TIPO de ganador (testimonial, comparativa, antes/después,
 * grilla de precio, lista de razones, ficha de características, dato duro) con
 * un TIPO de sujeto (producto físico, catálogo de tienda, servicio sin fotos,
 * marca sin fotos), y varios están elegidos para que choquen a propósito: un
 * ganador de una cartera puesta al hombro con un mueble que no se puede usar
 * puesto, una comparativa de sobrecitos con un cuero entero.
 *
 *   node --env-file=.env.deploy scripts/matriz-calidad.mjs            # todos
 *   node --env-file=.env.deploy scripts/matriz-calidad.mjs 02 06      # algunos
 *
 * Deja en ./matriz/ la imagen de cada caso, el prompt, el análisis y un
 * lado-a-lado con el ganador para poder juzgar sin abrir dos archivos.
 * Gasta plata real: unos 8 centavos por caso.
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { analyzeReferenceLayout, normalizeImageInput } from '../src/lib/creattia/ad-analysis.ts';
import { buildClonePrompt } from '../src/lib/creattia/generation-pipeline.ts';

const OUT = 'matriz';
const CONCURRENCIA = 4;
const openAIKey = process.env.OPENAI_API_KEY;
if (!openAIKey) { console.error('Falta OPENAI_API_KEY en .env.deploy'); process.exit(1); }

const admin = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** Los productos reales de la base, por prefijo de id. */
const PRODUCTOS = {
	cubos: '43990c00',
	remera: '3c39dd45',
	cueroNegro: '3ce2e198',
	cueroRosa: '684d7396',
	cueroHombro: '54ac9f86',
	viajes: '6ef0ba86',
	creattia: '7560542c',
	ps5: '27886f86',
	algoritmia: '8e37da0c',
};

const CASOS = [
	{
		id: '01', nombre: 'lifestyle-a-mueble',
		porque: 'El ganador muestra el producto colgado del hombro de una persona; un cubo modular no se puede usar puesto. Prueba el conflicto de wearability.',
		ref: '13/e221afd88336a373.webp', modo: 'product', marca: 'Camelot', productos: ['cubos'],
	},
	{
		id: '02', nombre: 'testimonial-con-prenda',
		porque: 'Testimonial con foto de persona y cita. El texto es casi todo el anuncio y la cita tiene que seguir siendo creíble para esa misma persona.',
		ref: '40/97bd607c78ab3037.webp', modo: 'product', marca: 'Farniente', productos: ['remera'],
	},
	{
		id: '03', nombre: 'comparativa-escala',
		porque: 'Comparativa de sobrecitos de colágeno contra un cuero entero: si copia la escala del ganador queda un recorte diminuto de cuero.',
		ref: '40/173d5af0643a2a60.webp', modo: 'product', marca: 'The Skirting Factory', productos: ['cueroNegro'],
	},
	{
		id: '04', nombre: 'antes-despues-servicio',
		porque: 'Antes/después de piel aplicado a un servicio sin nada que fotografiar. Es donde el modelo suele inventar un producto.',
		ref: '40/66030978328364b3.webp', modo: 'service', marca: 'Vía Libre Viajes', productos: ['viajes'], sinFotos: true,
	},
	{
		id: '05', nombre: 'grilla-precio-catalogo',
		porque: 'Grilla de relojes en oferta con una tienda de cueros: los productos van como conjunto, ninguno de héroe, y el mensaje habla del negocio.',
		ref: '13/4db1059d4aa4cd61.webp', modo: 'catalog', marca: 'The Skirting Factory', productos: ['cueroNegro', 'cueroRosa', 'cueroHombro'],
	},
	{
		id: '06', nombre: 'razones-marca-sin-fotos',
		porque: 'Lista de razones con una marca de software. Es el caso que ayer dejó la mitad de abajo vacía.',
		ref: '1/289955287ff3bf76.webp', modo: 'brand', marca: 'Creattia', productos: ['creattia'], sinFotos: true,
	},
	{
		id: '07', nombre: 'caracteristicas-dispositivo',
		porque: 'Ficha de características con líneas guía. Prueba que los rótulos apunten a partes reales del producto nuevo.',
		ref: '40/79869aa0f6735478.webp', modo: 'product', marca: 'Mercado Libre', productos: ['ps5'],
	},
	{
		id: '08', nombre: 'dato-duro-saas',
		porque: 'Anuncio de dato duro con captura de interfaz para una agencia. Prueba el modo servicio cuando el ganador sí muestra pantalla.',
		ref: '40/e099f54ca0fd425a.webp', modo: 'saas', marca: 'Algoritmia', productos: ['algoritmia'], sinFotos: true,
	},
	{
		id: '09', nombre: 'enfasis-parcial',
		porque: 'Lista de beneficios con palabras sueltas en negrita y un resaltado. El énfasis parcial es lo que dirige el ojo, y era lo que se venía perdiendo.',
		ref: '1/4d90175f50495299.webp', modo: 'product', marca: 'Camelot', productos: ['cubos'],
	},
	{
		id: '10', nombre: 'prenda-sobre-el-cuerpo',
		porque: 'El ganador muestra el producto puesto y el nuevo TAMBIÉN se puede usar puesto. La regla de wearability tiene que dejarlo pasar, no forzar un packshot.',
		ref: '13/752d9347314f7a19.webp', modo: 'product', marca: 'Farniente', productos: ['remera'],
	},
	{
		id: '11', nombre: 'cuadrado-a-vertical',
		porque: 'Un ganador cuadrado pedido en 9:16, que es lo que pasa cuando alguien elige formato de historia. Hay que rearmar la composición, no recortarla.',
		ref: '40/9805bc99ac9bd675.webp', modo: 'product', marca: 'Camelot', productos: ['cubos'], formato: '1024x1536',
	},
	{
		id: '12', nombre: 'carrusel-tres-paginas',
		porque: 'Tres páginas del mismo carrusel: el producto tiene que ser idéntico entre páginas y cada una conservar su propia maqueta.',
		ref: '40/ff3e7cde644121e0.webp', modo: 'product', marca: 'Mercado Libre', productos: ['ps5'], carrusel: 3,
	},
];

const pedidos = process.argv.slice(2);
const seleccion = pedidos.length ? CASOS.filter((caso) => pedidos.includes(caso.id)) : CASOS;
fs.mkdirSync(OUT, { recursive: true });

const { data: productos } = await admin.from('creative_products').select('id,name,description,image_path').limit(1000);
const buscarProducto = (clave) => {
	const prefijo = PRODUCTOS[clave];
	const fila = productos.find((producto) => producto.id.startsWith(prefijo));
	if (!fila) throw new Error(`no está el producto ${clave} (${prefijo})`);
	return fila;
};

const bajar = async (bucket, ruta) => {
	const { data } = await admin.storage.from(bucket).download(ruta);
	if (!data) throw new Error(`no se pudo bajar ${bucket}/${ruta}`);
	return normalizeImageInput(Buffer.from(await data.arrayBuffer()));
};

/** Ganador y resultado uno al lado del otro, que es como se juzga de verdad. */
async function ladoALado(ganador, generada, archivo) {
	const sharp = (await import('sharp')).default;
	const ALTO = 900;
	const escalar = async (buffer) => sharp(buffer).resize({ height: ALTO, fit: 'contain', background: '#ffffff' }).png().toBuffer();
	const [izq, der] = await Promise.all([escalar(ganador), escalar(generada)]);
	const [mIzq, mDer] = await Promise.all([sharp(izq).metadata(), sharp(der).metadata()]);
	await sharp({ create: { width: mIzq.width + mDer.width + 24, height: ALTO, channels: 3, background: '#e5e5e5' } })
		.composite([{ input: izq, left: 0, top: 0 }, { input: der, left: mIzq.width + 24, top: 0 }])
		.png()
		.toFile(archivo);
}

async function correr(caso) {
	const inicio = Date.now();
	const filas = caso.productos.map(buscarProducto);
	const referencia = await bajar('creative-references', caso.ref);
	// Un servicio o una marca no manda fotos de producto: es justo lo que
	// distingue esos modos, y mandarlas igual cambiaría lo que se está probando.
	const fotos = caso.sinFotos ? [] : await Promise.all(filas.map((fila) => bajar('creative-assets', fila.image_path)));

	const producto = {
		productNames: filas.map((fila) => fila.name),
		productFacts: filas.map((fila) => fila.description || ''),
		brandName: caso.marca,
		brief: '',
		language: 'es',
		subjectMode: caso.modo,
		colorMode: 'winner',
		typoMode: 'winner',
	};

	const analisis = await analyzeReferenceLayout({ openAIKey }, {
		referenceB64: referencia.buffer.toString('base64'),
		referenceMime: referencia.type,
		productB64: fotos[0]?.buffer.toString('base64'),
		productMime: fotos[0]?.type,
		productImages: fotos.map((foto) => ({ b64: foto.buffer.toString('base64'), mime: foto.type })),
		productName: producto.productNames[0],
		productFacts: producto.productFacts.filter(Boolean).join('\n'),
		brandName: caso.marca,
		language: 'es',
		subjectMode: caso.modo,
	});
	if (!analisis) throw new Error('el análisis no devolvió nada');

	const prompt = buildClonePrompt(producto, analisis, false);
	fs.writeFileSync(`${OUT}/${caso.id}-${caso.nombre}.prompt.txt`, prompt);
	fs.writeFileSync(`${OUT}/${caso.id}-${caso.nombre}.analisis.json`, JSON.stringify(analisis, null, 1));

	const { toFile, default: OpenAI } = await import('openai').then((m) => ({ default: m.default, toFile: m.toFile }));
	const openai = new OpenAI({ apiKey: openAIKey, timeout: 600000 });
	const sharp = (await import('sharp')).default;
	const aPng = async (imagen) => sharp(imagen.buffer).flatten({ background: '#ffffff' }).toColorspace('srgb').png().toBuffer();
	const entradas = [referencia, ...fotos];
	const archivos = await Promise.all(entradas.map(async (imagen, indice) => toFile(await aPng(imagen), `in${indice}.png`, { type: 'image/png' })));

	const metadata = await sharp(referencia.buffer).metadata();
	const proporcion = metadata.width / metadata.height;
	const size = caso.formato || (proporcion > 1.2 ? '1536x1024' : proporcion < 0.85 ? '1024x1536' : '1536x1536');

	// Un carrusel se genera página por página con el MISMO producto: lo que se
	// mira acá es si el producto se mantiene idéntico de una página a la otra.
	const paginas = caso.carrusel || 1;
	const buffers = [];
	for (let pagina = 1; pagina <= paginas; pagina += 1) {
		const promptPagina = paginas > 1
			? buildClonePrompt({ ...producto, carousel: { index: pagina, total: paginas } }, analisis, false)
			: prompt;
		const resultado = await openai.images.edit({
			model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
			image: archivos,
			prompt: promptPagina,
			size,
			quality: 'medium',
			n: 1,
		});
		buffers.push(Buffer.from(resultado.data[0].b64_json, 'base64'));
	}
	const buffer = buffers[0];
	const archivo = `${OUT}/${caso.id}-${caso.nombre}.png`;
	buffers.forEach((datos, indice) => fs.writeFileSync(paginas > 1 ? `${OUT}/${caso.id}-${caso.nombre}.p${indice + 1}.png` : archivo, datos));
	await ladoALado(referencia.buffer, buffer, `${OUT}/${caso.id}-${caso.nombre}.comparado.png`);
	// Las páginas del carrusel se miran entre sí, no contra el ganador: el punto
	// es si el producto sobrevive igual de una a la otra.
	if (paginas > 1) await ladoALado(buffers[0], buffers[1], `${OUT}/${caso.id}-${caso.nombre}.paginas.png`);

	return {
		caso,
		segundos: Math.round((Date.now() - inicio) / 1000),
		size,
		zonas: (analisis.textZones || []).length,
		slots: (analisis.imageSlots || []).length,
		tipo: analisis.creative?.adType || '—',
		prompt: prompt.length,
	};
}

console.log(`\n${seleccion.length} casos · concurrencia ${CONCURRENCIA}\n`);
const resultados = [];
const cola = [...seleccion];
await Promise.all(Array.from({ length: CONCURRENCIA }, async () => {
	while (cola.length) {
		const caso = cola.shift();
		try {
			const resultado = await correr(caso);
			resultados.push(resultado);
			console.log(`  ✓ ${caso.id} ${caso.nombre.padEnd(28)} ${String(resultado.segundos).padStart(3)}s · ${resultado.size} · ${resultado.zonas} zonas · ${resultado.slots} áreas · ${resultado.tipo.slice(0, 30)}`);
		} catch (error) {
			console.log(`  ✗ ${caso.id} ${caso.nombre.padEnd(28)} ${String(error.message).slice(0, 110)}`);
		}
	}
}));

console.log(`\nListo. Miralas en ./${OUT}/*.comparado.png — izquierda el ganador, derecha lo generado.\n`);
