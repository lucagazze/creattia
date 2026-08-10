import assert from 'node:assert/strict';
import { describe, test, beforeEach } from 'vitest';
import { guardarBorrador, leerBorrador, borrarBorrador, hace, resumenDelBorrador } from '../src/lib/creattia/borrador-de-creacion';

/**
 * El anuncio que quedó a punto de generarse.
 *
 * Llegar a la revisión cuesta un análisis de visión del ganador: ya se pagó y ya
 * se esperó. Cerrar la pestaña antes de apretar generar lo tiraba todo.
 *
 * Lo que se prueba acá es cuándo NO hay que ofrecerlo, que es lo que puede
 * hacer daño: un borrador de otra cuenta, uno viejo que apunta a productos que
 * quizás ya no existen, o uno de una versión anterior con otra forma.
 */

/** localStorage de mentira: los tests corren en node, sin navegador. */
function montarAlmacen(inicial: Record<string, string> = {}) {
	const datos = new Map(Object.entries(inicial));
	(globalThis as any).window = {
		localStorage: {
			getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
			setItem: (k: string, v: string) => { datos.set(k, v); },
			removeItem: (k: string) => { datos.delete(k); },
		},
	};
	return datos;
}

const estado = { plan: { textZones: [] }, variantes: 2, logoMode: 'texto' };
const ad = { imagePath: 'ganadores/spring-sale.png', name: 'Spring Sale' };

describe('el borrador de la revisión', () => {
	beforeEach(() => { montarAlmacen(); });

	test('se guarda y se recupera con el estado intacto', () => {
		guardarBorrador('usuario-1', ad, estado);
		const leido = leerBorrador('usuario-1');
		assert.equal(leido?.ad.imagePath, 'ganadores/spring-sale.png');
		assert.deepEqual(leido?.estado, estado);
	});

	/** Dos cuentas en la misma computadora no comparten borrador. */
	test('no se le ofrece a otra cuenta', () => {
		guardarBorrador('usuario-1', ad, estado);
		assert.equal(leerBorrador('usuario-2'), null);
	});

	/**
	 * Uno viejo apunta a productos que pueden haberse borrado y a un ganador que
	 * quizás ya no está en la biblioteca: ofrecer retomarlo es ofrecer un error.
	 */
	test('a los siete días deja de ofrecerse', () => {
		const datos = montarAlmacen();
		guardarBorrador('usuario-1', ad, estado);
		const guardado = JSON.parse(datos.get('creattia:borrador')!);
		guardado.guardadoEn = Date.now() - 8 * 24 * 60 * 60 * 1000;
		datos.set('creattia:borrador', JSON.stringify(guardado));
		assert.equal(leerBorrador('usuario-1'), null);
		// Y se tira, para no ocupar el único lugar que hay.
		assert.equal(datos.has('creattia:borrador'), false);
	});

	test('uno de otra versión se descarta solo', () => {
		const datos = montarAlmacen({
			'creattia:borrador': JSON.stringify({ version: 0, guardadoEn: Date.now(), usuarioId: 'usuario-1', ad, estado }),
		});
		assert.equal(leerBorrador('usuario-1'), null);
		assert.equal(datos.has('creattia:borrador'), false);
	});

	/** Un JSON roto no puede dejar la pantalla sin abrir. */
	test('un guardado ilegible no rompe nada', () => {
		montarAlmacen({ 'creattia:borrador': '{no es json' });
		assert.equal(leerBorrador('usuario-1'), null);
	});

	test('se guarda UNO solo: el último pisa al anterior', () => {
		guardarBorrador('usuario-1', ad, { variantes: 1 });
		guardarBorrador('usuario-1', ad, { variantes: 4 });
		assert.deepEqual(leerBorrador('usuario-1')?.estado, { variantes: 4 });
	});

	test('borrarlo lo saca de verdad', () => {
		guardarBorrador('usuario-1', ad, estado);
		borrarBorrador();
		assert.equal(leerBorrador('usuario-1'), null);
	});

	/** Sin sesión no se guarda nada: un borrador anónimo no es de nadie. */
	test('sin usuario no se guarda', () => {
		const datos = montarAlmacen();
		guardarBorrador('', ad, estado);
		assert.equal(datos.has('creattia:borrador'), false);
	});
});

describe('hace cuánto se dejó', () => {
	test('lo dice en palabras', () => {
		assert.equal(hace(Date.now()), 'recién');
		assert.equal(hace(Date.now() - 5 * 60000), 'hace 5 minutos');
		assert.equal(hace(Date.now() - 60 * 60000), 'hace 1 hora');
		assert.equal(hace(Date.now() - 30 * 60 * 60000), 'hace 1 día');
	});
});

/**
 * El aviso aparece en tres pantallas —Inicio, la biblioteca y el propio flujo—
 * y el texto lo arma este único lugar. Tres copias es como empiezan a decir
 * cosas distintas, y esta puede mentir: decir "listo para generar" cuando
 * todavía falta analizar la referencia manda a alguien a apretar un botón que
 * no está.
 */
describe('qué dice el aviso según hasta dónde se llegó', () => {
	const base = { version: 1, guardadoEn: Date.now(), usuarioId: 'u1', ad: { name: 'Spring Sale' } };

	test('con el análisis hecho, dice que solo falta generar', () => {
		const { titulo, detalle } = resumenDelBorrador({ ...base, estado: { plan: { textZones: [] } } } as any);
		assert.match(titulo, /listo para generar/);
		assert.match(detalle, /Solo queda apretar generar/);
	});

	test('sin analizar, NO dice que esté listo para generar', () => {
		const { titulo, detalle } = resumenDelBorrador({ ...base, estado: { selectedProductIds: ['p1'] } } as any);
		assert.match(titulo, /Estabas armando/);
		assert.doesNotMatch(titulo, /listo para generar/);
		assert.doesNotMatch(detalle, /apretar generar/);
	});

	test('siempre nombra el anuncio y hace cuánto se dejó', () => {
		const { titulo, detalle } = resumenDelBorrador({ ...base, guardadoEn: Date.now() - 3 * 60 * 60 * 1000, estado: {} } as any);
		assert.match(titulo, /Spring Sale/);
		assert.match(detalle, /hace 3 horas/);
	});

	/** Un borrador sin nombre de anuncio no puede quedar con un hueco. */
	test('sin nombre no deja un blanco', () => {
		const { titulo } = resumenDelBorrador({ ...base, ad: {}, estado: {} } as any);
		assert.match(titulo, /un anuncio/);
	});
});
