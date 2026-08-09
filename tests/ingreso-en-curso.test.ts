import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'vitest';
import { EVENTOS_DE_VUELTA, escucharVueltaALaPantalla } from '../src/lib/creattia/ingreso-en-curso';

/**
 * El botón "Ingresar" gris para siempre después de abrir Google.
 *
 * Tocabas "Continuar con Google", el navegador te llevaba al proveedor y volvías
 * atrás porque en realidad querías entrar con tu correo. La pestaña volvía del
 * caché de ida y vuelta con el mismo React vivo y el estado de "ingresando"
 * todavía prendido, así que el formulario de correo quedaba deshabilitado y la
 * única salida era recargar la página. Alguien que llegó por un anuncio y no
 * entiende de recargar, no entra.
 *
 * Lo que se prueba acá es la parte que decide cuándo se suelta ese estado, con
 * una ventana simulada: el componente no se puede montar en estos tests porque
 * no hay navegador.
 */

function ventanaSimulada() {
	const escuchas = new Map<string, Set<() => void>>();
	return {
		addEventListener(tipo: string, escucha: () => void) {
			const existentes = escuchas.get(tipo) || new Set<() => void>();
			existentes.add(escucha);
			escuchas.set(tipo, existentes);
		},
		removeEventListener(tipo: string, escucha: () => void) {
			escuchas.get(tipo)?.delete(escucha);
		},
		disparar(tipo: string) {
			for (const escucha of [...(escuchas.get(tipo) || [])]) escucha();
		},
		suscriptos() {
			return [...escuchas.values()].reduce((total, grupo) => total + grupo.size, 0);
		},
	};
}

describe('el ingreso con Google se suelta cuando la persona vuelve', () => {
	for (const evento of EVENTOS_DE_VUELTA) {
		test(`vuelve por "${evento}" y el formulario queda usable`, () => {
			const ventana = ventanaSimulada();
			let suelto = false;
			escucharVueltaALaPantalla(() => { suelto = true; }, ventana);

			ventana.disparar(evento);

			assert.equal(suelto, true, `con "${evento}" el botón Ingresar se queda gris hasta recargar`);
		});
	}

	test('avisa una sola vez aunque lleguen los tres eventos juntos', () => {
		// Volver del caché de ida y vuelta dispara los tres casi al mismo tiempo.
		const ventana = ventanaSimulada();
		let avisos = 0;
		escucharVueltaALaPantalla(() => { avisos += 1; }, ventana);

		for (const evento of EVENTOS_DE_VUELTA) ventana.disparar(evento);

		assert.equal(avisos, 1);
	});

	test('al desarmarlo no queda ninguna escucha viva', () => {
		// Si sobreviven, siguen apagando un estado de una pantalla que ya no existe.
		const ventana = ventanaSimulada();
		let avisos = 0;
		const desarmar = escucharVueltaALaPantalla(() => { avisos += 1; }, ventana);
		assert.equal(ventana.suscriptos(), EVENTOS_DE_VUELTA.length);

		desarmar();
		for (const evento of EVENTOS_DE_VUELTA) ventana.disparar(evento);

		assert.equal(ventana.suscriptos(), 0);
		assert.equal(avisos, 0);
	});
});

describe('la pantalla de ingreso no puede quedar trabada', () => {
	const pantalla = readFile(new URL('../src/components/creattia/screens/AuthScreen.tsx', import.meta.url), 'utf8');

	test('marca a Google como en curso y arma la vuelta en el mismo lugar', async () => {
		const fuente = await pantalla;
		assert.ok(
			fuente.includes("setEnCurso('google')"),
			'cambió cómo se marca el ingreso con Google: revisá que se siga soltando al volver',
		);
		// Se pide la llamada armada y devuelta como limpieza del efecto, no que el
		// nombre aparezca: con el import alcanzaba para pasar aunque el efecto
		// hubiera quedado vacío, que es justo la forma en que esto se rompe.
		assert.ok(
			/return escucharVueltaALaPantalla\(/.test(fuente),
			'sin esto, abrir Google y volver atrás deja el formulario de correo deshabilitado para siempre',
		);
	});

	test('los dos caminos leen el mismo estado, así no se disparan a la vez', async () => {
		const fuente = await pantalla;
		const deshabilitados = [...fuente.matchAll(/disabled=\{([^}]*)\}/g)].map((coincidencia) => coincidencia[1]);
		assert.equal(deshabilitados.length, 2, 'aparecieron botones nuevos en el formulario de ingreso');
		for (const condicion of deshabilitados) {
			assert.ok(
				condicion.includes('enCurso'),
				`el botón con disabled={${condicion}} se puede tocar mientras el otro ingreso está en curso`,
			);
		}
	});
});
