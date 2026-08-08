import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, test, vi } from 'vitest';

/**
 * El motor de carga de imágenes y la regla de CSS que dejaba la barra suelta.
 *
 * Las dos cosas son la misma queja: "la app se siente trabada". Una era que las
 * tarjetas aparecían antes que sus imágenes y cada imagen que entraba empujaba la
 * grilla; la otra, que la barra de arriba se iba con el scroll.
 */

// ── Un `Image` de mentira, para poder controlar cuándo "carga" cada imagen ────
type Pendiente = { src: string; cargar: (ancho?: number, alto?: number) => void; fallar: () => void };
let pendientes: Pendiente[] = [];
let decodeSoportado = true;

class ImagenFalsa {
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	decoding = '';
	naturalWidth = 0;
	naturalHeight = 0;
	#src = '';

	set src(valor: string) {
		this.#src = valor;
		if (!valor) return; // cancelación por timeout
		pendientes.push({
			src: valor,
			cargar: (ancho = 800, alto = 1000) => {
				this.naturalWidth = ancho;
				this.naturalHeight = alto;
				this.onload?.();
			},
			fallar: () => this.onerror?.(),
		});
	}
	get src() { return this.#src; }

	decode() {
		return decodeSoportado ? Promise.resolve() : Promise.reject(new Error('sin soporte'));
	}
}

vi.stubGlobal('Image', ImagenFalsa as any);
vi.stubGlobal('window', {
	setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
	clearTimeout: (id: any) => clearTimeout(id),
} as any);
vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0) as any);

const { imagenFallada, imagenLista, precargarImagen, precargarImagenes, ratioDeImagen } =
	await import('../src/lib/creattia/image-ready');

/** Deja avanzar las promesas internas (decode). */
const soltarMicrotareas = () => new Promise((listo) => setTimeout(listo, 0));

let contador = 0;
/** Una URL nueva por prueba: la caché del módulo es global a propósito. */
const url = (nombre: string) => `https://cdn.test/${nombre}-${(contador += 1)}.webp`;

beforeEach(async () => {
	// Las descargas que quedaron a medio camino siguen ocupando ranuras en la cola
	// del módulo —que es global a propósito—, así que se cierran antes de empezar.
	// Se drena en vueltas: cerrar una libera su ranura y arranca la siguiente de
	// la cola, que también hay que cerrar.
	while (pendientes.length) {
		const enCurso = pendientes;
		pendientes = [];
		enCurso.forEach((pendiente) => pendiente.fallar());
		await soltarMicrotareas();
	}
	decodeSoportado = true;
});

describe('precarga de imágenes', () => {
	test('una imagen no está lista hasta que carga y se decodifica', async () => {
		const objetivo = url('portada');
		const promesa = precargarImagen(objetivo);

		assert.equal(imagenLista(objetivo), false, 'se dio por lista antes de cargar');
		pendientes.find((p) => p.src === objetivo)!.cargar(1080, 1350);
		await promesa;

		assert.equal(imagenLista(objetivo), true);
		// La proporción real permite reservar el lugar exacto de la tarjeta.
		assert.equal(Math.round(ratioDeImagen(objetivo) * 100), Math.round((1080 / 1350) * 100));
	});

	test('pedir la misma imagen dos veces no la baja dos veces', async () => {
		const objetivo = url('repetida');
		const primera = precargarImagen(objetivo);
		const segunda = precargarImagen(objetivo);

		assert.equal(pendientes.filter((p) => p.src === objetivo).length, 1, 'se bajó dos veces la misma imagen');
		pendientes.find((p) => p.src === objetivo)!.cargar();
		await Promise.all([primera, segunda]);
		assert.equal(imagenLista(objetivo), true);
	});

	test('una vez resuelta, responde al instante sin volver a la red', async () => {
		const objetivo = url('cacheada');
		const promesa = precargarImagen(objetivo);
		pendientes.find((p) => p.src === objetivo)!.cargar();
		await promesa;

		pendientes = [];
		await precargarImagen(objetivo);
		assert.equal(pendientes.length, 0, 'volvió a pedir una imagen que ya tenía');
	});

	test('una imagen que falla queda marcada, no en el limbo', async () => {
		const objetivo = url('rota');
		const promesa = precargarImagen(objetivo);
		pendientes.find((p) => p.src === objetivo)!.fallar();
		await promesa;

		// Distinguir "falló" de "todavía no llegó" es lo que permite saltearla en
		// vez de dejar la grilla trabada esperándola para siempre.
		assert.equal(imagenLista(objetivo), false);
		assert.equal(imagenFallada(objetivo), true);
	});

	test('si el navegador no soporta decode(), alcanza con que haya cargado', async () => {
		decodeSoportado = false;
		const objetivo = url('sin-decode');
		const promesa = precargarImagen(objetivo);
		pendientes.find((p) => p.src === objetivo)!.cargar();
		await promesa;

		assert.equal(imagenLista(objetivo), true, 'un decode rechazado no puede perder la imagen');
	});

	test('no se bajan más de ocho a la vez: las primeras tienen que llegar primero', async () => {
		const lote = Array.from({ length: 20 }, (_, i) => url(`lote-${i}`));
		precargarImagenes(lote);

		assert.equal(pendientes.length, 8, `arrancaron ${pendientes.length} descargas en paralelo`);
		// Al terminar una, entra la siguiente de la cola: el flujo es constante.
		const primera = pendientes[0];
		primera.cargar();
		await soltarMicrotareas();
		assert.ok(pendientes.length > 8, 'al liberarse una ranura no entró la siguiente');
	});

	test('lo urgente se atiende antes que lo que ya estaba encolado', async () => {
		const relleno = Array.from({ length: 12 }, (_, i) => url(`fondo-${i}`));
		precargarImagenes(relleno);
		const encoladas = pendientes.length;

		const urgente = url('lo-que-mira-el-usuario');
		precargarImagen(urgente, true);
		// Con las ocho ranuras ocupadas, la urgente espera; lo que importa es que
		// quede primera en la fila.
		pendientes[0].cargar();
		await soltarMicrotareas();

		const nuevas = pendientes.slice(encoladas).map((p) => p.src);
		assert.equal(nuevas[0], urgente, 'la urgente no se adelantó en la cola');
	});
});

describe('la barra superior acompaña el scroll', () => {
	test('ningún contenedor del shell usa overflow-x: hidden', async () => {
		const css = await readFile(new URL('../src/components/creattia/creative-app.css', import.meta.url), 'utf8');
		/**
		 * Por qué esto es un test y no un comentario.
		 *
		 * `overflow-x: hidden` en `.studio-main` no se ve mal en ninguna captura:
		 * cuando un eje es `hidden` y el otro `visible`, CSS convierte el otro en
		 * `auto`, el contenedor pasa a ser su propio scroll y `position: sticky` se
		 * ancla a él en vez de al viewport. Medido con navegador: la barra se iba
		 * -1500px al scrollear 1500px, en TODOS los anchos.
		 *
		 * `clip` recorta igual y no crea contenedor de scroll.
		 */
		// Los comentarios se sacan primero: esta misma explicación menciona la regla
		// vieja, y buscarla en el texto daría un positivo falso eterno.
		const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
		const reglasDelShell = sinComentarios
			.split('}')
			.filter((bloque) => /\.studio-main|\.studio-content|\.creative-app-shell|html,\s*body/.test(bloque));

		for (const bloque of reglasDelShell) {
			assert.equal(
				/overflow-x:\s*hidden/.test(bloque),
				false,
				`overflow-x: hidden rompe el sticky de la barra superior:\n${bloque.trim().slice(0, 220)}`,
			);
		}
	});

	test('la barra está declarada como sticky arriba', async () => {
		const css = await readFile(new URL('../src/components/creattia/creative-app.css', import.meta.url), 'utf8');
		const bloques = css.split('}').filter((bloque) => bloque.includes('.studio-topbar {'));
		assert.ok(bloques.some((bloque) => /position:\s*sticky/.test(bloque)), 'la barra dejó de ser sticky');
		assert.ok(bloques.some((bloque) => /top:\s*0/.test(bloque)), 'la barra sticky sin top no se pega a nada');
	});
});
