import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, test } from 'vitest';

import {
	datosDelNavegador,
	datosDelNavegadorGuardados,
	guardarDatosDelNavegador,
	sendMetaEvent,
} from '../src/lib/creattia/meta-capi';
import { createFakeSupabase } from './helpers/fake-supabase';

/**
 * Los datos con los que Meta empareja una conversión con quien vio el anuncio.
 *
 * El evento salía con el mail y el id de usuario hasheados y nada más. Alcanza
 * para que Meta lo reciba —no da error, no aparece nada raro en el panel— pero
 * no para que lo atribuya: sin la `_fbc`, que es el clic en el anuncio, la
 * compra queda flotando y la campaña que la generó nunca se la anota. Se paga
 * una conversión que después no figura, y el algoritmo aprende con la mitad de
 * los casos.
 *
 * Lo que se prueba acá es lo que falla en silencio: que los cuatro datos viajen,
 * que viajen SIN hashear (hashearlos no es más seguro, es romperlos), que la
 * falta de cualquiera de ellos no tumbe el envío, y que la compra —que la
 * confirma Mercado Pago desde su servidor, sin navegador del otro lado— salga
 * igual con los datos que la persona dejó al abrir el checkout.
 */

const raizProyecto = new URL('..', import.meta.url);
const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');

/** Deja pasar `sendMetaEvent` y devuelve lo que se le mandó a Meta. */
function interceptarEnvios() {
	const enviados: any[] = [];
	const original = globalThis.fetch;
	globalThis.fetch = (async (_url: any, init: any) => {
		enviados.push(JSON.parse(String(init?.body || '{}')));
		return new Response('{"events_received":1}', { status: 200 });
	}) as typeof fetch;
	return { enviados, restaurar: () => { globalThis.fetch = original; } };
}

/** El `user_data` del último evento que salió. */
async function userDataDe(enviar: () => Promise<void>) {
	const { enviados, restaurar } = interceptarEnvios();
	try {
		await enviar();
	} finally {
		restaurar();
	}
	assert.equal(enviados.length, 1, 'no salió ningún evento hacia Meta');
	return enviados[0].data[0].user_data as Record<string, unknown>;
}

let tokenOriginal: string | undefined;

beforeEach(() => {
	// Sin token configurado `sendMetaEvent` corta antes de armar nada y los tests
	// pasarían sin haber probado el envío.
	tokenOriginal = process.env.META_CAPI_TOKEN;
	process.env.META_CAPI_TOKEN = 'token-de-prueba';
});

afterEach(() => {
	if (tokenOriginal === undefined) delete process.env.META_CAPI_TOKEN;
	else process.env.META_CAPI_TOKEN = tokenOriginal;
});

describe('lo que se lee del pedido del navegador', () => {
	test('saca la IP, el user-agent y las dos cookies del píxel', () => {
		const datos = datosDelNavegador(new Request('https://creattia.app/api/creativos/track', {
			headers: {
				'x-forwarded-for': '200.10.20.30',
				'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
				cookie: 'sb-access-token=abc; _fbp=fb.1.1700000000000.1234567890; _fbc=fb.1.1700000000000.IwAR0ClicDelAnuncio',
			},
		}));
		assert.equal(datos.ip, '200.10.20.30');
		assert.equal(datos.userAgent, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
		assert.equal(datos.fbp, 'fb.1.1700000000000.1234567890');
		assert.equal(datos.fbc, 'fb.1.1700000000000.IwAR0ClicDelAnuncio');
	});

	test('de x-forwarded-for se queda con la primera IP', () => {
		// La cabecera acumula un salto por proxy. Mandar la cadena entera a Meta es
		// mandarle algo que no es ninguna IP: no da error, simplemente no empareja.
		const datos = datosDelNavegador(new Request('https://creattia.app/', {
			headers: { 'x-forwarded-for': '200.10.20.30, 76.76.21.9, 10.0.0.1' },
		}));
		assert.equal(datos.ip, '200.10.20.30');
	});

	test('si no hay x-forwarded-for usa x-real-ip', () => {
		const datos = datosDelNavegador(new Request('https://creattia.app/', {
			headers: { 'x-real-ip': '190.5.5.5' },
		}));
		assert.equal(datos.ip, '190.5.5.5');
	});

	test('un pedido sin nada devuelve todo en null y no explota', () => {
		const datos = datosDelNavegador(new Request('https://creattia.app/'));
		assert.equal(datos.ip, null);
		assert.equal(datos.fbp, null);
		assert.equal(datos.fbc, null);
	});

	test('no confunde una cookie que termina igual', () => {
		// `_fbc` y `algo_fbc` comparten el final: partir por "incluye" traía el
		// valor equivocado y Meta lo habría descartado sin avisar.
		const datos = datosDelNavegador(new Request('https://creattia.app/', {
			headers: { cookie: 'algo_fbc=basura; _fbc=fb.1.999.IwAR0Real' },
		}));
		assert.equal(datos.fbc, 'fb.1.999.IwAR0Real');
	});
});

describe('lo que se le manda a Meta', () => {
	test('los cuatro datos viajan cuando están', async () => {
		const userData = await userDataDe(() => sendMetaEvent('tokens_comprados', 'usuario-1', {}, {}, {
			ip: '200.10.20.30',
			userAgent: 'Mozilla/5.0',
			fbp: 'fb.1.1700000000000.1234567890',
			fbc: 'fb.1.1700000000000.IwAR0ClicDelAnuncio',
		}));
		assert.equal(userData.client_ip_address, '200.10.20.30');
		assert.equal(userData.client_user_agent, 'Mozilla/5.0');
		assert.equal(userData.fbp, 'fb.1.1700000000000.1234567890');
		assert.equal(userData.fbc, 'fb.1.1700000000000.IwAR0ClicDelAnuncio');
	});

	test('la IP, el user-agent y las cookies NO se hashean; el mail SÍ', async () => {
		const userData = await userDataDe(() => sendMetaEvent('tokens_comprados', 'usuario-1', {}, {
			email: 'Comprador@Ejemplo.com', valor: 10, moneda: 'USD',
		}, {
			ip: '200.10.20.30', userAgent: 'Mozilla/5.0', fbp: 'fb.1.2.3', fbc: 'fb.1.2.IwAR0',
		}));
		// Meta compara la `fbc` contra el clic que registró de su lado: un sha256
		// no coincide nunca con nada y la compra queda sin atribuir para siempre.
		for (const campo of ['client_ip_address', 'client_user_agent', 'fbp', 'fbc']) {
			assert.equal(
				/^[0-9a-f]{64}$/.test(String(userData[campo])),
				false,
				`${campo} viaja hasheado y así Meta no lo puede usar`,
			);
		}
		// El mail al revés: en claro sería filtrar un dato personal.
		assert.deepEqual(userData.em, [sha256('comprador@ejemplo.com')]);
		assert.deepEqual(userData.external_id, [sha256('usuario-1')]);
	});

	test('cada dato es un valor suelto, no un arreglo como el mail', async () => {
		const userData = await userDataDe(() => sendMetaEvent('checkout_abierto', 'usuario-1', {}, {}, {
			ip: '200.10.20.30', userAgent: 'Mozilla/5.0', fbp: 'fb.1.2.3', fbc: 'fb.1.2.IwAR0',
		}));
		for (const campo of ['client_ip_address', 'client_user_agent', 'fbp', 'fbc']) {
			assert.equal(Array.isArray(userData[campo]), false, `${campo} tiene que ir como texto, no en arreglo`);
		}
	});

	test('sin datos del navegador el evento sale igual, sin claves vacías', async () => {
		// Alguien con bloqueador no manda `_fbp` ni `_fbc`. Mandar la clave en null
		// hace que Meta rechace el evento entero: prefiere que no esté.
		const userData = await userDataDe(() => sendMetaEvent('planes_vistos', 'usuario-1'));
		assert.equal('client_ip_address' in userData, false);
		assert.equal('client_user_agent' in userData, false);
		assert.equal('fbp' in userData, false);
		assert.equal('fbc' in userData, false);
		assert.deepEqual(userData.external_id, [sha256('usuario-1')]);
	});

	test('con solo una parte manda esa parte', async () => {
		const userData = await userDataDe(() => sendMetaEvent('app_abierta', 'usuario-1', {}, {}, {
			ip: '200.10.20.30', userAgent: null, fbp: null, fbc: 'fb.1.2.IwAR0',
		}));
		assert.equal(userData.client_ip_address, '200.10.20.30');
		assert.equal(userData.fbc, 'fb.1.2.IwAR0');
		assert.equal('fbp' in userData, false);
		assert.equal('client_user_agent' in userData, false);
	});
});

describe('el alta de la cuenta, que pasa una sola vez', () => {
	/** El `event_id` del último evento que salió. */
	async function eventIdDe(enviar: () => Promise<void>) {
		const { enviados, restaurar } = interceptarEnvios();
		try {
			await enviar();
		} finally {
			restaurar();
		}
		return enviados[0].data[0].event_id as string;
	}

	test('el mismo usuario da siempre el mismo event_id', async () => {
		/**
		 * Meta no rechaza un CompleteRegistration repetido: lo cuenta como bueno, y
		 * las campañas terminan aprendiendo a buscar gente que ya está registrada y
		 * vuelve a entrar. Lo que impide el duplicado es la base, pero si dos
		 * pedidos simultáneos se cruzan con el candado sin aplicar, un id que no
		 * dependa de la hora hace que Meta los una en uno.
		 */
		const primero = await eventIdDe(() => sendMetaEvent('cuenta_creada', 'usuario-1'));
		const segundo = await eventIdDe(() => sendMetaEvent('cuenta_creada', 'usuario-1'));
		assert.equal(primero, segundo, 'dos avisos del mismo alta se cuentan como dos registros');
		assert.equal(primero, 'cuenta_creada-usuario-1');
	});

	test('cada persona tiene el suyo', async () => {
		const uno = await eventIdDe(() => sendMetaEvent('cuenta_creada', 'usuario-1'));
		const otro = await eventIdDe(() => sendMetaEvent('cuenta_creada', 'usuario-2'));
		assert.notEqual(uno, otro, 'las altas de dos personas se unieron en una sola');
	});

	test('los eventos que sí se repiten siguen contándose por separado', async () => {
		// Una generación pedida hoy y otra mañana son dos hechos distintos: ahí el
		// id tiene que seguir cambiando.
		const uno = await eventIdDe(() => sendMetaEvent('generacion_pedida', 'usuario-1', { batchId: 'lote-1' }));
		const otro = await eventIdDe(() => sendMetaEvent('generacion_pedida', 'usuario-1', { batchId: 'lote-2' }));
		assert.notEqual(uno, otro);
	});
});

describe('la compra, que se confirma sin navegador del otro lado', () => {
	test('lo que se guarda en el checkout es lo que recupera el webhook', async () => {
		const fake = createFakeSupabase({ tables: { creative_meta_identity: [] } });
		// Paso 1: la persona abre el checkout y se va a Mercado Pago.
		await guardarDatosDelNavegador(fake.client as any, 'usuario-7', {
			ip: '200.10.20.30',
			userAgent: 'Mozilla/5.0 (iPhone)',
			fbp: 'fb.1.1700000000000.1234567890',
			fbc: 'fb.1.1700000000000.IwAR0ClicDelAnuncio',
		});

		// Paso 2: minutos después Mercado Pago avisa el pago desde SU servidor. El
		// pedido no tiene ni IP ni cookies del comprador; salen de lo guardado.
		const recuperados = await datosDelNavegadorGuardados(fake.client as any, 'usuario-7');
		const userData = await userDataDe(() => sendMetaEvent('tokens_comprados', 'usuario-7', { paymentId: '123' }, {
			valor: 4.9, moneda: 'USD', email: 'comprador@ejemplo.com',
		}, recuperados));

		assert.equal(userData.fbc, 'fb.1.1700000000000.IwAR0ClicDelAnuncio', 'el Purchase salió sin el clic del anuncio');
		assert.equal(userData.fbp, 'fb.1.1700000000000.1234567890');
		assert.equal(userData.client_ip_address, '200.10.20.30');
		assert.equal(userData.client_user_agent, 'Mozilla/5.0 (iPhone)');
	});

	test('un usuario que nunca pasó por el checkout no rompe el Purchase', async () => {
		const fake = createFakeSupabase({ tables: { creative_meta_identity: [] } });
		const recuperados = await datosDelNavegadorGuardados(fake.client as any, 'usuario-sin-datos');
		assert.deepEqual(recuperados, {});
		const userData = await userDataDe(() => sendMetaEvent('tokens_comprados', 'usuario-sin-datos', {}, {
			valor: 4.9, moneda: 'USD',
		}, recuperados));
		assert.deepEqual(userData.external_id, [sha256('usuario-sin-datos')]);
	});

	test('solo se escriben los campos que llegaron con valor', async () => {
		// Un checkout abierto desde un navegador con bloqueador no trae `_fbp` ni
		// `_fbc`. Si el guardado los escribiera en null, pisaría los datos buenos de
		// una visita anterior: se perdería justo la atribución que se quiere salvar.
		const fake = createFakeSupabase({ tables: { creative_meta_identity: [] } });
		await guardarDatosDelNavegador(fake.client as any, 'usuario-8', {
			ip: '200.10.20.30', userAgent: 'Mozilla/5.0', fbp: null, fbc: null,
		});
		const fila = fake.tables.creative_meta_identity[0];
		assert.equal(fila.client_ip_address, '200.10.20.30');
		assert.equal('fbp' in fila, false, 'un fbp vacío borraría el guardado antes');
		assert.equal('fbc' in fila, false, 'un fbc vacío borraría el clic del anuncio');
	});

	test('sin ningún dato no se escribe nada', async () => {
		const fake = createFakeSupabase({ tables: { creative_meta_identity: [] } });
		await guardarDatosDelNavegador(fake.client as any, 'usuario-9', {});
		assert.equal(fake.tables.creative_meta_identity.length, 0);
	});
});

describe('los endpoints que reportan plata usan el puente', () => {
	async function leer(ruta: string) {
		return readFile(new URL(ruta, raizProyecto), 'utf8');
	}

	test('los dos checkouts guardan los datos antes de mandar a Mercado Pago', async () => {
		for (const ruta of ['src/pages/api/creativos/subscribe.ts', 'src/pages/api/creativos/buy-credits.ts']) {
			assert.match(await leer(ruta), /guardarDatosDelNavegador\(/, `${ruta} manda a pagar sin guardar con qué emparejar la compra`);
		}
	});

	test('las tres compras del webhook recuperan lo guardado', async () => {
		const webhook = await leer('src/pages/api/creativos/webhook/mercadopago.ts');
		// Créditos sueltos, primera autorización de la suscripción y cada renovación.
		const recuperos = webhook.match(/datosDelNavegadorGuardados\(/g) || [];
		assert.ok(recuperos.length >= 3, 'alguna de las tres compras se reporta sin datos de emparejamiento');
	});

	test('la tabla del puente existe como migración', async () => {
		const migracion = await leer('supabase/migrations/20260809000000_datos_de_emparejamiento_meta.sql');
		assert.match(migracion, /create table if not exists public\.creative_meta_identity/);
		// Si el navegador pudiera escribir acá, podría inyectar la `_fbc` de otro y
		// hacernos atribuir compras a campañas que no las generaron.
		assert.match(migracion, /revoke all on public\.creative_meta_identity from anon, authenticated/);
	});
});
