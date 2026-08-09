import assert from 'node:assert/strict';
import { afterEach, describe, test, vi } from 'vitest';

// El escáner resuelve el dominio antes de cada descarga. En las pruebas no hay
// red, así que se devuelve una IP pública fija: lo que se está probando es qué
// texto sale cuando la descarga falla, no el filtro de redes privadas.
vi.mock('node:dns/promises', () => ({
	lookup: async () => [{ address: '93.184.216.34', family: 4 }],
}));

import {
	detalleDeEscaneo,
	ErrorDeEscaneo,
	errorDeEstado,
	leerRespuestaDeEscaneo,
	MENSAJES_DE_ESCANEO,
	mensajeDeEscaneo,
	motivoDeEscaneo,
	type MotivoDeEscaneo,
} from '../src/lib/creattia/errores-de-escaneo';
import { extractProductPageWithAI, scanWebsite } from '../src/lib/creattia/catalog-scanner';

/**
 * Las palabras que delatan que se filtró un mensaje de librería.
 *
 * Los dos casos reales que llegaron a producción fueron "El sitio respondió con
 * estado 403." y "The operation was aborted due to timeout": uno con código de
 * estado, el otro en inglés. Esta lista es la red que impide que vuelvan.
 */
const PALABRAS_PRESTADAS = /\b(timeout|timed|aborted|abort|operation|failed|failure|fetch|error|invalid|unexpected|token|status|request|network|server|forbidden|denied|getaddrinfo|enotfound|econnreset|undefined|null)\b/i;

/** Un mensaje sin salida deja a la persona mirando la pantalla. */
const OFRECE_UNA_SALIDA = /(carg[áa]|peg[áa]|revis[áa]|fijate|prob[áa]|volv[ée]|esper[áa])/i;

function esPresentable(texto: string, contexto: string) {
	assert.ok(texto.trim(), `${contexto}: mensaje vacío`);
	assert.ok(!/\d{3}/.test(texto), `${contexto}: se filtró un código de estado → ${texto}`);
	assert.ok(!PALABRAS_PRESTADAS.test(texto), `${contexto}: hay una palabra prestada → ${texto}`);
	assert.ok(OFRECE_UNA_SALIDA.test(texto), `${contexto}: no dice cómo seguir → ${texto}`);
}

describe('los mensajes que se muestran', () => {
	test('ninguno tiene código de estado, palabras en inglés ni queda sin salida', () => {
		for (const [motivo, texto] of Object.entries(MENSAJES_DE_ESCANEO)) esPresentable(texto, motivo);
	});

	test('el filtro sirve: los dos textos que llegaron a producción no pasarían', () => {
		// Si esto deja de fallar, el resto de la prueba no está midiendo nada.
		assert.ok(PALABRAS_PRESTADAS.test('The operation was aborted due to timeout'));
		assert.ok(/\d{3}/.test('El sitio respondió con estado 403.'));
	});
});

describe('traducción de cada tipo de fallo', () => {
	test('el sitio no deja entrar (el caso Zara)', () => {
		for (const estado of [401, 403, 451]) {
			assert.equal(motivoDeEscaneo(errorDeEstado(estado)), 'bloqueado', `estado ${estado}`);
		}
		assert.equal(
			mensajeDeEscaneo(errorDeEstado(403, 'https://www.zara.com/ar/es/camiseta-p05857381.html')),
			'Ese sitio no permite que lo leamos automáticamente. Es habitual en las marcas grandes. Cargá el producto a mano con sus fotos, o probá con la URL de tu tienda.',
		);
	});

	test('el sitio frena por muchas consultas', () => {
		assert.equal(motivoDeEscaneo(errorDeEstado(429)), 'demasiadas-consultas');
	});

	test('la página no existe', () => {
		for (const estado of [404, 410]) assert.equal(motivoDeEscaneo(errorDeEstado(estado)), 'no-existe', `estado ${estado}`);
	});

	test('el problema es del sitio, no nuestro', () => {
		for (const estado of [500, 502, 503, 504]) assert.equal(motivoDeEscaneo(errorDeEstado(estado)), 'sitio-caido', `estado ${estado}`);
	});

	test('tiempo agotado, en las tres formas en que Node lo entrega', () => {
		// La que sale de AbortSignal.timeout tal cual.
		const seco = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		assert.equal(motivoDeEscaneo(seco), 'tiempo-agotado');
		// La misma, envuelta por fetch: el mensaje de arriba dice "fetch failed" y
		// mirando solo esa capa un sitio lento parecía un certificado roto.
		const envuelto = Object.assign(new TypeError('fetch failed'), { cause: seco });
		assert.equal(motivoDeEscaneo(envuelto), 'tiempo-agotado');
		// Y la de undici cuando se agota esperando las cabeceras.
		assert.equal(motivoDeEscaneo(Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' })), 'tiempo-agotado');
		assert.equal(
			mensajeDeEscaneo(seco),
			'El sitio tardó demasiado en responder. Volvé a intentar en un momento, o cargá el producto a mano con sus fotos.',
		);
	});

	test('dominio inexistente', () => {
		const dns = Object.assign(new Error('getaddrinfo ENOTFOUND mitienda.com.ar'), { code: 'ENOTFOUND' });
		assert.equal(motivoDeEscaneo(dns), 'dominio-inexistente');
		assert.equal(motivoDeEscaneo(Object.assign(new Error('getaddrinfo EAI_AGAIN x.com'), { code: 'EAI_AGAIN' })), 'dominio-inexistente');
	});

	test('certificado vencido o conexión cortada', () => {
		const tls = Object.assign(new TypeError('fetch failed'), {
			cause: Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }),
		});
		assert.equal(motivoDeEscaneo(tls), 'conexion');
		assert.equal(motivoDeEscaneo(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })), 'conexion');
		// "fetch failed" pelado, sin causa: es lo único que deja undici a veces.
		assert.equal(motivoDeEscaneo(new TypeError('fetch failed')), 'conexion');
	});

	test('la URL no sirve', () => {
		assert.equal(motivoDeEscaneo(new TypeError('Invalid URL')), 'url-invalida');
		assert.equal(motivoDeEscaneo(new Error('La URL debe comenzar con http o https.')), 'url-invalida');
		assert.equal(motivoDeEscaneo(new Error('La URL no puede incluir credenciales.')), 'url-invalida');
	});

	test('direcciones internas, redirecciones sin fin y páginas gigantes', () => {
		assert.equal(motivoDeEscaneo(new Error('La URL no puede apuntar a una red privada.')), 'red-privada');
		assert.equal(motivoDeEscaneo(new Error('La URL resuelve a una red privada o no disponible.')), 'red-privada');
		assert.equal(motivoDeEscaneo(new Error('La URL tiene demasiadas redirecciones.')), 'demasiadas-redirecciones');
		assert.equal(motivoDeEscaneo(new Error('El archivo remoto supera el tamaño permitido.')), 'demasiado-grande');
	});

	test('lo que se bajó no es una página web, o no tiene productos', () => {
		assert.equal(motivoDeEscaneo(new ErrorDeEscaneo('no-es-web', 'content-type application/pdf')), 'no-es-web');
		assert.equal(motivoDeEscaneo(new Error('La URL no apunta a una página web compatible.')), 'no-es-web');
		assert.equal(motivoDeEscaneo(new Error('No se encontró ningún producto en esa página.')), 'sin-productos');
	});

	test('un mensaje viejo con el estado adentro se sigue entendiendo', () => {
		// Quedó código publicado que arma el texto a mano; mientras exista, la
		// traducción tiene que reconocerlo en vez de mostrarlo.
		assert.equal(motivoDeEscaneo(new Error('El sitio respondió con estado 403.')), 'bloqueado');
		assert.equal(motivoDeEscaneo(new Error('status 500')), 'sitio-caido');
	});

	test('lo que no se reconoce igual sale presentable', () => {
		for (const raro of [null, undefined, {}, new Error(''), 'algo raro', 42]) {
			esPresentable(mensajeDeEscaneo(raro), String(raro));
		}
		assert.equal(motivoDeEscaneo(new Error('')), 'desconocido');
	});

	test('el detalle técnico existe, pero vive aparte del mensaje', () => {
		const fallo = errorDeEstado(403, 'https://www.zara.com/p.html');
		assert.match(detalleDeEscaneo(fallo), /403/);
		assert.ok(!/403/.test(mensajeDeEscaneo(fallo)), 'el código no puede cruzarse al mensaje');
		assert.match(detalleDeEscaneo(new Error('getaddrinfo ENOTFOUND x.com')), /ENOTFOUND/);
	});
});

describe('lo que llega al navegador', () => {
	test('un 504 con HTML no revienta la lectura del JSON', async () => {
		// Cuando la función de Vercel se pasa de tiempo, el cuerpo es una página de
		// error. `response.json()` tiraba "Unexpected token 'A'..." y eso se mostraba.
		const respuesta = new Response('<!doctype html><h1>An error occurred</h1>', {
			status: 504,
			headers: { 'content-type': 'text/html' },
		});
		const payload = await leerRespuestaDeEscaneo(respuesta);
		esPresentable(String(payload.error), '504 con HTML');
		assert.equal(payload.error, MENSAJES_DE_ESCANEO['demora-nuestra']);
	});

	test('un JSON normal se lee igual que siempre', async () => {
		const payload = await leerRespuestaDeEscaneo(new Response(JSON.stringify({ importedIds: ['a'] }), { status: 201 }));
		assert.deepEqual(payload.importedIds, ['a']);
	});
});

describe('el escáner nunca deja escapar el fallo crudo', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	/** Sin clave el proxy no se intenta: la prueba mide el camino directo. */
	function sinProxy() {
		vi.stubEnv('SCRAPER_API_KEY', '');
	}

	test('un sitio que bloquea llega traducido a scanWebsite', async () => {
		sinProxy();
		vi.stubGlobal('fetch', async () => new Response('', { status: 403 }));
		await assert.rejects(
			scanWebsite('https://www.zara.com/ar/es/camiseta-p05857381.html'),
			(error: unknown) => {
				esPresentable((error as Error).message, 'scanWebsite 403');
				assert.equal(motivoDeEscaneo(error), 'bloqueado');
				return true;
			},
		);
	});

	test('un sitio lento llega traducido a extractProductPageWithAI', { timeout: 30_000 }, async () => {
		sinProxy();
		// Es el caso 2 exacto: lo que lanza AbortSignal.timeout, sin envolver.
		vi.stubGlobal('fetch', async () => {
			throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		});
		await assert.rejects(
			extractProductPageWithAI('https://tiendalenta.com/producto/uno', ''),
			(error: unknown) => {
				esPresentable((error as Error).message, 'extractProductPageWithAI timeout');
				assert.equal(motivoDeEscaneo(error), 'tiempo-agotado');
				return true;
			},
		);
	});

	test('un dominio inexistente llega traducido, sin el texto de Node', async () => {
		sinProxy();
		vi.stubGlobal('fetch', async () => {
			throw Object.assign(new TypeError('fetch failed'), {
				cause: Object.assign(new Error('getaddrinfo ENOTFOUND mitienda.com.ar'), { code: 'ENOTFOUND' }),
			});
		});
		await assert.rejects(
			scanWebsite('https://mitienda.com.ar/producto'),
			(error: unknown) => {
				assert.ok(!/ENOTFOUND/.test((error as Error).message));
				esPresentable((error as Error).message, 'scanWebsite DNS');
				assert.equal(motivoDeEscaneo(error), 'dominio-inexistente');
				return true;
			},
		);
	});

	test('un sitio lento ahora sí llega al último recurso', async () => {
		// El proxy solo se disparaba mirando `response.status === 403`, o sea que
		// hacía falta que el sitio contestara. Un sitio lento no contestaba nunca:
		// la excepción se escapaba y el único camino que podía salvarlo ni se
		// enteraba. Con esto, tardar deja de ser un callejón sin salida.
		vi.stubEnv('SCRAPER_API_KEY', 'clave-de-prueba');
		vi.stubGlobal('fetch', async (input: unknown) => {
			if (String(input).includes('api.scraperapi.com')) {
				return new Response('<html><head><title>Mi tienda</title></head><body></body></html>', {
					status: 200,
					headers: { 'content-type': 'text/html' },
				});
			}
			throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		});
		const fuente = await scanWebsite('https://tiendalenta.com/producto/uno');
		assert.equal(fuente.title, 'Mi tienda');
	});

	test('un sitio que frena por consultas también llega al último recurso', async () => {
		// El 429 se reintentaba siempre por el mismo camino directo, o sea desde la
		// misma IP que el sitio acababa de frenar. Salir por otra es justamente lo
		// que puede destrabarlo.
		vi.stubEnv('SCRAPER_API_KEY', 'clave-de-prueba');
		vi.stubGlobal('fetch', async (input: unknown) => {
			if (String(input).includes('api.scraperapi.com')) {
				return new Response('<html><head><title>Mi tienda</title></head><body></body></html>', {
					status: 200,
					headers: { 'content-type': 'text/html' },
				});
			}
			return new Response('', { status: 429 });
		});
		const fuente = await scanWebsite('https://tiendafrenada.com/producto/uno');
		assert.equal(fuente.title, 'Mi tienda');
	});

	test('los sondeos de plataforma no salen por el proxy aunque los bloqueen', async () => {
		// Los tres sondeos —Shopify, Woo, Tiendanube— preguntan si el sitio tiene esa
		// API y esperan que no. Muchos WAF les contestan 403 o 429, que son
		// justamente los estados que ahora mandan al último recurso: sin apagarlo a
		// mano, cada escaneo gastaba tres consultas pagas para confirmar que no.
		vi.stubEnv('SCRAPER_API_KEY', 'clave-de-prueba');
		let consultasPagas = 0;
		vi.stubGlobal('fetch', async (input: unknown) => {
			const destino = String(input);
			if (destino.includes('api.scraperapi.com')) {
				consultasPagas += 1;
				return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
			}
			if (/products\.json|wp-json|productos\.json/.test(destino)) return new Response('', { status: 403 });
			return new Response('<html><head><title>Mi tienda</title></head><body></body></html>', {
				status: 200,
				headers: { 'content-type': 'text/html' },
			});
		});
		await scanWebsite('https://mitienda.com.ar/');
		assert.equal(consultasPagas, 0, 'un sondeo bloqueado no justifica pagar una consulta');
	});

	test('un PDF en vez de una página web se explica como tal', async () => {
		sinProxy();
		vi.stubGlobal('fetch', async () => new Response('%PDF-1.7', { status: 200, headers: { 'content-type': 'application/pdf' } }));
		await assert.rejects(
			scanWebsite('https://mitienda.com.ar/catalogo.pdf'),
			(error: unknown) => {
				esPresentable((error as Error).message, 'scanWebsite PDF');
				assert.equal(motivoDeEscaneo(error), 'no-es-web');
				return true;
			},
		);
	});
});

/** Que la lista de motivos y la de mensajes no se separen con el tiempo. */
describe('cobertura', () => {
	test('cada motivo tiene su mensaje', () => {
		const motivos: MotivoDeEscaneo[] = [
			'bloqueado', 'demasiadas-consultas', 'no-existe', 'sitio-caido', 'tiempo-agotado',
			'demora-nuestra', 'dominio-inexistente', 'conexion', 'no-es-web', 'sin-productos',
			'url-invalida', 'red-privada', 'demasiadas-redirecciones', 'demasiado-grande', 'desconocido',
		];
		assert.equal(Object.keys(MENSAJES_DE_ESCANEO).length, motivos.length);
		for (const motivo of motivos) assert.ok(MENSAJES_DE_ESCANEO[motivo], motivo);
	});
});
