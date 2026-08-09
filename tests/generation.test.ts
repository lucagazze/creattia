import assert from 'node:assert/strict';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createFakeSupabase, PNG_BYTES, type FakeSupabaseOptions } from './helpers/fake-supabase';

/**
 * Tests de la generación de imágenes de punta a punta: se ejecutan los handlers
 * reales de las rutas contra un Supabase en memoria y un motor de imágenes
 * simulado. Lo que se prueba es la lógica de Creattia (permisos, créditos,
 * pipeline), no la de OpenAI ni la de Supabase.
 *
 * Existe porque una generación rota no se notaba hasta abrir la app: un guarda
 * mal puesto dejó de generar TODAS las imágenes con un 429 y el resto de la
 * suite seguía en verde.
 */

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'cliente@example.com' };

// Las rutas cortan con 503 si no hay credenciales de IA. Acá el motor está
// simulado, pero igual tienen que existir para pasar ese chequeo.
process.env.OPENAI_API_KEY = 'sk-test';
process.env.GOOGLE_AI_API_KEY = 'AIza-test';

// ── Dobles de los módulos que salen de la app ────────────────────────────────

let fake = createFakeSupabase();
let authUser: { id: string; email: string } | null = USER;

vi.mock('../src/lib/creattia/server', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/server')>();
	return {
		...actual,
		getAdminClient: () => fake.client as any,
		authenticateRequest: async () => (authUser
			? { user: authUser, token: 'token-de-prueba' }
			: { user: null, token: null, error: 'Sesión requerida.' }),
	};
});

type EngineCall = { prompt: string; images: unknown[]; format: string; tier?: string };
const generateAdImage = vi.fn(async (_input: EngineCall) => ({ buffer: Buffer.from(PNG_BYTES), engine: 'gemini-image' }));
vi.mock('../src/lib/creattia/image-engines', () => ({ generateAdImage: (input: EngineCall) => generateAdImage(input) }));

const analyzeReferenceLayout = vi.fn(async (_keys: unknown, _input: unknown) => ({
	language: 'es',
	referenceHasProduct: true,
	adCopy: { headline: 'Titular', description: 'Bajada', cta: 'Comprar', primaryText: 'Texto' },
	textZones: [],
	people: [],
}));
vi.mock('../src/lib/creattia/ad-analysis', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/ad-analysis')>();
	return {
		...actual,
		analyzeReferenceLayout: (keys: unknown, input: unknown) => analyzeReferenceLayout(keys, input),
		// sharp no corre sobre los bytes de mentira de los tests.
		normalizeImageInput: async (buffer: Buffer) => ({ buffer, type: 'image/png' }),
	};
});

vi.mock('../src/lib/creattia/winner-picker', () => ({
	loadWinners: async () => ([
		{ templateId: 40, name: 'Ganador de prueba', imagePath: '40/2fb666571bf2802e.png' },
		{ templateId: 41, name: 'Ganador pago', imagePath: '41/aaaaaaaaaaaaaaaa.png' },
	]),
}));

const pendingWork: Promise<unknown>[] = [];
vi.mock('@vercel/functions', () => ({
	waitUntil: (promise: Promise<unknown>) => { pendingWork.push(promise); },
}));

/** Espera a que termine el trabajo en segundo plano que lanzó este test. */
async function settleBackgroundWork() {
	while (pendingWork.length) {
		const running = pendingWork.splice(0, pendingWork.length);
		await Promise.allSettled(running);
	}
}

// El pipeline pide sharp solo para leer la proporción del ganador.
vi.mock('sharp', () => ({ default: () => ({ metadata: async () => ({ width: 1024, height: 1024 }) }) }));

const { POST: generate } = await import('../src/pages/api/creativos/generate');
const { POST: batchWorker } = await import('../src/pages/api/creativos/batch-worker');

// ── Datos base ───────────────────────────────────────────────────────────────

const paidProfile = {
	user_id: USER.id, credits_remaining: 50, credits_monthly: 60,
	subscription_status: 'authorized', plan_code: 'pro', brand_name: 'Marca',
};

function setup(overrides: FakeSupabaseOptions = {}) {
	const profiles = overrides.tables?.creative_profiles || [{ ...paidProfile }];
	let credits = Number(profiles[0]?.credits_remaining ?? 0);
	fake = createFakeSupabase({
		tables: {
			creative_profiles: profiles,
			creative_templates: [{ id: 7, name: 'Ángulo', purpose: 'vender', usage_hint: 'siempre', is_active: true }],
			creative_products: [{
				id: 'prod-1', user_id: USER.id, name: 'Café de especialidad', description: 'Tueste medio',
				is_active: true, image_path: `${USER.id}/products/prod-1/primary.png`,
			}],
			...overrides.tables,
		},
		storage: {
			'creative-references/40/2fb666571bf2802e.png': PNG_BYTES,
			'creative-references/41/aaaaaaaaaaaaaaaa.png': PNG_BYTES,
			[`creative-assets/${USER.id}/products/prod-1/primary.png`]: PNG_BYTES,
			...overrides.storage,
		},
		rpc: {
			reserve_creative_credits: ({ p_amount }) => {
				if (credits < p_amount) return { data: -1 };
				credits -= p_amount;
				return { data: credits };
			},
			refund_creative_credits: ({ p_amount }) => { credits += p_amount; return { data: credits }; },
			...overrides.rpc,
		},
	});
	return { creditsNow: () => credits };
}

function generateRequest(fields: Record<string, string>) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.append(key, value);
	return new Request('https://creattia.app/api/creativos/generate', { method: 'POST', body: form });
}

const baseFields = {
	templateId: '7',
	referencePath: '40/2fb666571bf2802e.png',
	productIds: 'prod-1',
	format: 'original',
	count: '1',
};

beforeEach(async () => {
	// Ningún test arranca con trabajo del anterior todavía en vuelo.
	await settleBackgroundWork();
	authUser = USER;
	generateAdImage.mockClear();
	analyzeReferenceLayout.mockClear();
});

// ── Studio: una imagen suelta ────────────────────────────────────────────────

describe('POST /api/creativos/generate', () => {
	test('genera una imagen y la deja disponible', async () => {
		const { creditsNow } = setup();
		const response = await generate({ request: generateRequest(baseFields) } as any);
		const payload = await response.json();

		assert.equal(response.status, 202, `esperaba 202 y llegó ${response.status}: ${JSON.stringify(payload)}`);
		assert.equal(payload.generations.length, 1);
		assert.equal(creditsNow(), 49, 'tiene que descontar exactamente 1 crédito');

		await settleBackgroundWork();
		expect(generateAdImage).toHaveBeenCalledOnce();
		const row = fake.tables.creative_generations[0];
		assert.equal(row.status, 'completed');
		assert.ok(row.output_path, 'la imagen tiene que quedar guardada');
		assert.equal(fake.calls.uploads.length, 1);
	});

	test('una RPC de rate limit inexistente no puede frenar la generación', async () => {
		// Regresión real: `check_rate_limit` nunca se creó en la base y el guarda
		// estaba en fail-closed, así que TODA generación devolvía 429. Un problema
		// de despliegue no puede dejar la app sin generar.
		setup();
		const response = await generate({ request: generateRequest(baseFields) } as any);
		assert.notEqual(response.status, 429, 'no puede bloquear por un limitador ausente');
		assert.equal(response.status, 202);
	});

	test('respeta el tope cuando el limitador sí existe y está lleno', async () => {
		setup({ rpc: { check_rate_limit: () => ({ data: false }) } });
		const response = await generate({ request: generateRequest(baseFields) } as any);
		assert.equal(response.status, 429);
	});

	test('sin créditos no genera ni gasta el motor', async () => {
		setup({ tables: { creative_profiles: [{ ...paidProfile, credits_remaining: 0 }] } });
		const response = await generate({ request: generateRequest(baseFields) } as any);
		const payload = await response.json();
		assert.equal(response.status, 402);
		assert.equal(payload.code, 'NO_CREDITS');
		expect(generateAdImage).not.toHaveBeenCalled();
	});

	test('sin sesión no genera', async () => {
		setup();
		authUser = null;
		const response = await generate({ request: generateRequest(baseFields) } as any);
		assert.equal(response.status, 401);
	});

	test('una referencia que no existe en la biblioteca se rechaza', async () => {
		setup();
		const response = await generate({ request: generateRequest({ ...baseFields, referencePath: '99/inventada.png' }) } as any);
		assert.equal(response.status, 400);
		expect(generateAdImage).not.toHaveBeenCalled();
	});

	test('una cuenta gratuita no puede usar una referencia de la biblioteca paga', async () => {
		setup({ tables: { creative_profiles: [{ ...paidProfile, plan_code: 'trial', subscription_status: 'trial' }] } });
		const response = await generate({ request: generateRequest({ ...baseFields, referencePath: '41/aaaaaaaaaaaaaaaa.png' }) } as any);
		const payload = await response.json();
		assert.equal(response.status, 402);
		assert.equal(payload.code, 'LIBRARY_LOCKED');
	});

	test('el nivel de calidad no es elegible por parámetro y la imagen cuesta 1 crédito', async () => {
		// El nivel lo decide quality-router para toda la app; mandar quality en el
		// request no puede cambiarlo ni cambiar el precio.
		const { creditsNow } = setup();
		const response = await generate({ request: generateRequest({ ...baseFields, quality: 'pro' }) } as any);
		assert.equal(response.status, 202);
		assert.equal(creditsNow(), 49, 'sigue costando 1 crédito');
		await settleBackgroundWork();
		assert.equal(generateAdImage.mock.calls[0]?.[0].tier, 'medium');
	});

	test('varias imágenes en un lote reservan y generan todas', async () => {
		const { creditsNow } = setup();
		const response = await generate({ request: generateRequest({ ...baseFields, count: '3' }) } as any);
		const payload = await response.json();
		assert.equal(response.status, 202);
		assert.equal(payload.generations.length, 3);
		assert.equal(creditsNow(), 47);
		await settleBackgroundWork();
		assert.equal(generateAdImage.mock.calls.length, 3);
	});

	test('si el motor falla, la generación queda fallida y devuelve el crédito', async () => {
		const { creditsNow } = setup();
		generateAdImage.mockRejectedValueOnce(new Error('el modelo rechazó el prompt'));
		const response = await generate({ request: generateRequest(baseFields) } as any);
		assert.equal(response.status, 202);
		await settleBackgroundWork();
		assert.equal(fake.tables.creative_generations[0].status, 'failed');
		assert.equal(creditsNow(), 50, 'el crédito no usado tiene que volver');
	});

	test('si falla UNA imagen del lote, las demás se entregan igual', async () => {
		/**
		 * El lote se generaba con `Promise.all`: un solo rechazo —un 500 del motor,
		 * un filtro de contenido— tiraba abajo la promesa entera, se descartaban las
		 * imágenes que YA estaban generadas y el lote completo quedaba fallido. El
		 * usuario esperaba dos minutos para no recibir nada, y las que sí salieron
		 * se pagaron igual en la API.
		 */
		const { creditsNow } = setup();
		generateAdImage.mockRejectedValueOnce(new Error('el modelo se cayó en la segunda'));

		const response = await generate({ request: generateRequest({ ...baseFields, count: '3' }) } as any);
		assert.equal(response.status, 202);
		await settleBackgroundWork();

		const filas = fake.tables.creative_generations;
		const completadas = filas.filter((fila: any) => fila.status === 'completed');
		const fallidas = filas.filter((fila: any) => fila.status === 'failed');
		assert.equal(completadas.length, 2, 'las imágenes que salieron bien se perdían con el lote');
		assert.equal(fallidas.length, 1);
		// Se descontaron 3 y se devuelve solo la que no salió.
		assert.equal(creditsNow(), 48, 'tiene que devolver exactamente el crédito de la que falló');
	});

	test('si fallan todas, el lote entero se cierra y se devuelven todos los créditos', async () => {
		const { creditsNow } = setup();
		generateAdImage.mockRejectedValue(new Error('el motor está caído'));

		await generate({ request: generateRequest({ ...baseFields, count: '3' }) } as any);
		await settleBackgroundWork();

		assert.equal(fake.tables.creative_generations.every((fila: any) => fila.status === 'failed'), true);
		assert.equal(creditsNow(), 50, 'no se puede cobrar un lote que no produjo nada');
		generateAdImage.mockReset();
	});
});

// ── Lotes y carruseles: el mismo pipeline ────────────────────────────────────

function batchRow(overrides: Record<string, any> = {}) {
	return {
		id: 'gen-1', user_id: USER.id, status: 'processing', output_path: null,
		title: 'Café de especialidad', format: 'original', template_id: 40,
		user_brief: null, batch_id: 'batch-1', output_index: 1, product_id: 'prod-1',
		settings_snapshot: { referencePath: '40/2fb666571bf2802e.png', format: 'original', language: 'es' },
		...overrides,
	};
}

function workerRequest(generationId = 'gen-1') {
	return new Request('https://creattia.app/api/creativos/batch-worker', {
		method: 'POST',
		body: JSON.stringify({ generationId }),
		headers: { 'content-type': 'application/json' },
	});
}

describe('POST /api/creativos/batch-worker', () => {
	test('genera una imagen del lote con el mismo pipeline que el Studio', async () => {
		setup({ tables: { creative_generations: [batchRow()] } });
		const response = await batchWorker({ request: workerRequest() } as any);
		const payload = await response.json();

		assert.equal(response.status, 200, JSON.stringify(payload));
		assert.ok(payload.imageUrl, 'tiene que devolver la imagen firmada');
		expect(analyzeReferenceLayout).toHaveBeenCalledOnce();
		expect(generateAdImage).toHaveBeenCalledOnce();

		// El ganador va primero y las fotos del producto después: mismo orden que
		// arma el Studio, porque ahora es literalmente el mismo código.
		const engineCall = generateAdImage.mock.calls[0]![0];
		assert.ok(engineCall.images.length >= 2);
		assert.equal(fake.tables.creative_generations[0].status, 'completed');
	});

	test('una página de carrusel pide el prompt con su número de página', async () => {
		setup({
			tables: {
				creative_generations: [batchRow({
					output_index: 2,
					settings_snapshot: {
						referencePath: '40/2fb666571bf2802e.png', format: 'original',
						carousel: true, carouselIndex: 2, carouselTotal: 4,
					},
				})],
			},
		});
		const response = await batchWorker({ request: workerRequest() } as any);
		assert.equal(response.status, 200);
		const prompt = generateAdImage.mock.calls[0]![0].prompt;
		assert.match(prompt, /2\D{0,10}4|page 2/i);
	});

	/**
	 * La página se genera con lo que se leyó EN ELLA, no en el carrusel entero.
	 *
	 * Un carrusel se analizaba de una sola vez y devolvía un análisis promedio.
	 * Como `referenceHasProduct`, `productPlacement` e `imageSlots` no llevan número
	 * de página, la página 1 recibía la lectura de la 3: con un ganador cuya página
	 * 1 era la foto de un gato y cuya página 3 tenía el packshot, la primera imagen
	 * se generaba con "sacá el producto original y poné el tuyo ahí" —una orden
	 * sobre otra página— y con las fotos del producto adjuntas. El modelo dejaba el
	 * gato y metía el producto nuevo al lado.
	 */
	test('una página sin producto no recibe el packshot que traía otra página', async () => {
		setup({
			tables: {
				creative_generations: [batchRow({
					settings_snapshot: {
						referencePath: '40/2fb666571bf2802e.png', format: 'original',
						carousel: true, carouselIndex: 1, carouselTotal: 3,
						approvedPlan: {
							language: 'es', referenceHasProduct: false, textZones: [], people: [],
							imageSlots: [{ where: 'las dos mitades', showsNow: 'un gato', replaceWith: 'la pelota sobre el césped' }],
						},
					},
				})],
			},
		});
		const response = await batchWorker({ request: workerRequest() } as any);
		assert.equal(response.status, 200);
		// El plan ya venía aprobado: no se vuelve a analizar, igual que una suelta.
		expect(analyzeReferenceLayout).not.toHaveBeenCalled();

		const llamada = generateAdImage.mock.calls[0]![0];
		assert.match(llamada.prompt, /NO PRODUCT INSERTION/);
		assert.doesNotMatch(llamada.prompt, /PRODUCT SWAP/);
		assert.match(llamada.prompt, /un gato/, 'el prompt tiene que nombrar lo que hay que sacar de ESTA página');
		assert.equal(llamada.images.length, 1, 'sin producto en la página, las fotos del producto no se adjuntan');
	});

	test('el lote usa el mismo nivel de calidad que el Studio', async () => {
		setup({
			tables: {
				creative_generations: [batchRow({
					settings_snapshot: { referencePath: '40/2fb666571bf2802e.png', format: 'original', quality: 'pro' },
				})],
			},
		});
		await batchWorker({ request: workerRequest() } as any);
		assert.equal(generateAdImage.mock.calls[0]![0].tier, 'medium');
	});

	test('no vuelve a generar una fila ya cerrada', async () => {
		// Era el agujero de créditos: cancelar el lote y pedirle igual las imágenes.
		setup({ tables: { creative_generations: [batchRow({ status: 'failed' })] } });
		const response = await batchWorker({ request: workerRequest() } as any);
		assert.equal(response.status, 409);
		expect(generateAdImage).not.toHaveBeenCalled();
	});

	test('una fila ya completada devuelve la misma imagen sin volver a gastar', async () => {
		setup({
			tables: { creative_generations: [batchRow({ status: 'completed', output_path: 'ruta/lista.png' })] },
		});
		const response = await batchWorker({ request: workerRequest() } as any);
		const payload = await response.json();
		assert.equal(payload.alreadyDone, true);
		expect(generateAdImage).not.toHaveBeenCalled();
	});

	test('no procesa la generación de otra cuenta', async () => {
		setup({ tables: { creative_generations: [batchRow({ user_id: 'otro-usuario' })] } });
		const response = await batchWorker({ request: workerRequest() } as any);
		assert.equal(response.status, 404);
		expect(generateAdImage).not.toHaveBeenCalled();
	});
});

describe('un solo worker por generación', () => {
	test('si la fila ya está tomada, el segundo worker no genera nada', async () => {
		// Era el bug de "la imagen cambió sola": el front relanzaba trabajo que
		// seguía en curso y el segundo worker pisaba el archivo del primero en
		// Storage, porque los dos suben a la misma ruta con upsert.
		setup({
			tables: {
				creative_generations: [batchRow({ claimed_at: new Date().toISOString() })],
			},
		});
		const response = await batchWorker({ request: workerRequest() } as any);
		const payload = await response.json();
		assert.equal(payload.alreadyRunning, true);
		expect(generateAdImage).not.toHaveBeenCalled();
	});

	test('un lock viejo se libera y permite reintentar', async () => {
		const hace20Minutos = new Date(Date.now() - 20 * 60_000).toISOString();
		setup({ tables: { creative_generations: [batchRow({ claimed_at: hace20Minutos })] } });
		const response = await batchWorker({ request: workerRequest() } as any);
		assert.equal(response.status, 200);
		expect(generateAdImage).toHaveBeenCalledOnce();
	});
});
