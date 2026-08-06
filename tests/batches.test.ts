import assert from 'node:assert/strict';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createFakeSupabase, PNG_BYTES, type FakeSupabaseOptions } from './helpers/fake-supabase';

/**
 * Arranque de lotes y de carruseles: quién puede lanzarlos, cuántos créditos
 * cuestan y qué queda guardado para que después los genere `batch-worker`.
 */

const USER = { id: '22222222-2222-4222-8222-222222222222', email: 'cliente@example.com' };

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

vi.mock('../src/lib/creattia/winner-picker', () => ({
	loadWinners: async () => ([
		{ templateId: 40, name: 'Gratis', imagePath: '40/2fb666571bf2802e.png' },
		{ templateId: 41, name: 'Pago', imagePath: '41/aaaaaaaaaaaaaaaa.png' },
		{ templateId: 42, name: 'Pago 2', imagePath: '42/bbbbbbbbbbbbbbbb.png' },
	]),
}));

vi.mock('../src/lib/creattia/product-media', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/creattia/product-media')>();
	return { ...actual, countProductImages: async () => 1, listProductImageRows: async () => [] };
});

const { POST: batchStart } = await import('../src/pages/api/creativos/batch-start');
const { POST: carouselStart } = await import('../src/pages/api/creativos/carousel-start');

const paidProfile = {
	user_id: USER.id, credits_remaining: 100, credits_monthly: 120,
	subscription_status: 'authorized', plan_code: 'scale',
};

function setup(overrides: FakeSupabaseOptions = {}) {
	const profiles = overrides.tables?.creative_profiles || [{ ...paidProfile }];
	let credits = Number(profiles[0]?.credits_remaining ?? 0);
	fake = createFakeSupabase({
		tables: {
			creative_profiles: profiles,
			creative_products: [{
				id: 'prod-1', user_id: USER.id, name: 'Café', description: 'Tueste medio',
				is_active: true, image_path: `${USER.id}/products/prod-1/primary.png`,
			}],
			...overrides.tables,
		},
		storage: { [`creative-assets/${USER.id}/products/prod-1/primary.png`]: PNG_BYTES, ...overrides.storage },
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

function post(url: string, body: Record<string, unknown>) {
	return new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

beforeEach(() => { authUser = USER; });

describe('POST /api/creativos/batch-start', () => {
	const base = { productId: 'prod-1', winnerPaths: ['40/2fb666571bf2802e.png'], format: 'original' };

	test('crea una fila por referencia y cobra 1 crédito por imagen', async () => {
		const { creditsNow } = setup();
		const response = await batchStart({
			request: post('https://creattia.app/api/creativos/batch-start', {
				...base, winnerPaths: ['40/2fb666571bf2802e.png', '41/aaaaaaaaaaaaaaaa.png'],
			}),
		} as any);
		const payload = await response.json();

		assert.equal(response.status, 200, JSON.stringify(payload));
		assert.equal(payload.count, 2);
		assert.equal(creditsNow(), 98);
		assert.equal(fake.tables.creative_generations.length, 2);
		// Cada fila guarda su ganador: es lo que después clona batch-worker.
		const paths = fake.tables.creative_generations.map((row) => row.settings_snapshot.referencePath);
		assert.deepEqual(paths.sort(), ['40/2fb666571bf2802e.png', '41/aaaaaaaaaaaaaaaa.png']);
	});

	test('la calidad pro cuesta 3 créditos por imagen y queda anotada', async () => {
		const { creditsNow } = setup();
		const response = await batchStart({
			request: post('https://creattia.app/api/creativos/batch-start', { ...base, quality: 'pro' }),
		} as any);
		assert.equal(response.status, 200);
		assert.equal(creditsNow(), 97);
		assert.equal(fake.tables.creative_generations[0].settings_snapshot.quality, 'pro');
	});

	test('sin créditos suficientes no se crea ninguna fila', async () => {
		setup({ tables: { creative_profiles: [{ ...paidProfile, credits_remaining: 1 }] } });
		const response = await batchStart({
			request: post('https://creattia.app/api/creativos/batch-start', {
				...base, winnerPaths: ['40/2fb666571bf2802e.png', '41/aaaaaaaaaaaaaaaa.png', '42/bbbbbbbbbbbbbbbb.png'],
			}),
		} as any);
		const payload = await response.json();
		assert.equal(response.status, 402);
		assert.equal(payload.code, 'NO_CREDITS');
		assert.equal(fake.tables.creative_generations?.length ?? 0, 0);
	});

	test('una ruta que no está en la biblioteca se rechaza', async () => {
		setup();
		const response = await batchStart({
			request: post('https://creattia.app/api/creativos/batch-start', { ...base, winnerPaths: ['99/inventada.png'] }),
		} as any);
		assert.equal(response.status, 400);
	});

	test('una cuenta gratuita no puede lanzar un lote con la biblioteca paga', async () => {
		setup({ tables: { creative_profiles: [{ ...paidProfile, plan_code: 'trial', subscription_status: 'trial' }] } });
		const response = await batchStart({
			request: post('https://creattia.app/api/creativos/batch-start', { ...base, winnerPaths: ['41/aaaaaaaaaaaaaaaa.png'] }),
		} as any);
		const payload = await response.json();
		assert.equal(response.status, 402);
		assert.equal(payload.code, 'LIBRARY_LOCKED');
	});

	test('el tope por lote es 40 anuncios', async () => {
		setup();
		const response = await batchStart({
			request: post('https://creattia.app/api/creativos/batch-start', {
				...base, winnerPaths: Array.from({ length: 41 }, (_, index) => `40/${index}.png`),
			}),
		} as any);
		assert.equal(response.status, 400);
	});
});

describe('POST /api/creativos/carousel-start', () => {
	const slides = ['40/2fb666571bf2802e.png', '41/aaaaaaaaaaaaaaaa.png', '42/bbbbbbbbbbbbbbbb.png'];
	const base = { templateId: 40, referenceSlidePaths: slides, productIds: ['prod-1'], format: 'original' };

	test('crea una fila por página, todas en el mismo lote', async () => {
		const { creditsNow } = setup();
		const response = await carouselStart({
			request: post('https://creattia.app/api/creativos/carousel-start', base),
		} as any);
		const payload = await response.json();

		assert.equal(response.status, 200, JSON.stringify(payload));
		assert.equal(fake.tables.creative_generations.length, 3);
		assert.equal(creditsNow(), 97);

		const rows = fake.tables.creative_generations;
		const batchIds = new Set(rows.map((row) => row.batch_id));
		assert.equal(batchIds.size, 1, 'todas las páginas van en el mismo lote');
		// Cada página conoce su lugar: es lo que usa el prompt del carrusel.
		assert.deepEqual(rows.map((row) => row.settings_snapshot.carouselIndex).sort(), [1, 2, 3]);
		assert.ok(rows.every((row) => row.settings_snapshot.carouselTotal === 3));
		assert.ok(rows.every((row) => row.settings_snapshot.carousel === true));
	});

	test('la calidad pro cuesta 3 créditos por página', async () => {
		const { creditsNow } = setup();
		await carouselStart({
			request: post('https://creattia.app/api/creativos/carousel-start', { ...base, quality: 'pro' }),
		} as any);
		assert.equal(creditsNow(), 91, '3 páginas × 3 créditos');
		assert.equal(fake.tables.creative_generations[0].settings_snapshot.quality, 'pro');
	});

	test('un carrusel necesita al menos 2 páginas', async () => {
		setup();
		const response = await carouselStart({
			request: post('https://creattia.app/api/creativos/carousel-start', { ...base, referenceSlidePaths: [slides[0]] }),
		} as any);
		assert.equal(response.status, 400);
	});

	test('o un producto para todas las páginas, o uno por página', async () => {
		setup();
		const response = await carouselStart({
			request: post('https://creattia.app/api/creativos/carousel-start', { ...base, productIds: ['prod-1', 'prod-1'] }),
		} as any);
		assert.equal(response.status, 400);
	});

	test('una cuenta gratuita no puede armar un carrusel de la biblioteca paga', async () => {
		setup({ tables: { creative_profiles: [{ ...paidProfile, plan_code: 'trial', subscription_status: 'trial' }] } });
		const response = await carouselStart({
			request: post('https://creattia.app/api/creativos/carousel-start', base),
		} as any);
		const payload = await response.json();
		assert.equal(response.status, 402);
		assert.equal(payload.code, 'LIBRARY_LOCKED');
	});

	test('una página que no existe en la biblioteca se rechaza', async () => {
		setup();
		const response = await carouselStart({
			request: post('https://creattia.app/api/creativos/carousel-start', {
				...base, referenceSlidePaths: ['40/2fb666571bf2802e.png', '99/inventada.png'],
			}),
		} as any);
		assert.equal(response.status, 400);
	});

	test('sin sesión no arranca', async () => {
		setup();
		authUser = null;
		const response = await carouselStart({
			request: post('https://creattia.app/api/creativos/carousel-start', base),
		} as any);
		assert.equal(response.status, 401);
	});
});
