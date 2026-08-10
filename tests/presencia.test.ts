import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { nombreDePantalla, reportarPantalla, olvidarPantalla } from '../src/lib/creattia/presencia';

/**
 * Dónde está parada cada persona dentro de la app.
 *
 * El latido de presencia solo guardaba una marca de tiempo: servía para contar
 * cuánta gente hay conectada, no para saber qué está haciendo. Con una campaña
 * corriendo eso es lo que se mira — si entran y se quedan en la biblioteca sin
 * generar, o en qué anuncio ganador se traban.
 */
describe('cómo se lee una pantalla en el panel', () => {
	test('traduce los nombres internos', () => {
		assert.equal(nombreDePantalla('winners'), 'Biblioteca de ganadores');
		assert.equal(nombreDePantalla('history'), 'Mis imágenes');
	});

	/** El detalle es lo que hace útil el dato: sin él, "creando" dice poco. */
	test('el detalle va pegado al nombre', () => {
		assert.equal(nombreDePantalla('revisando', 'Spring Summer Sale 26'), 'Revisando antes de generar · Spring Summer Sale 26');
	});

	test('una vista desconocida no deja un hueco', () => {
		assert.equal(nombreDePantalla(''), 'En la app');
		assert.equal(nombreDePantalla(null), 'En la app');
	});
});

/**
 * Se avisa cuando la pantalla CAMBIA, no en cada latido. El latido corre cada
 * minuto: anotar una fila por minuto por persona llenaría la tabla de eventos
 * con lo mismo repetido, y el dato que interesa —por dónde pasó— se perdería
 * entre miles de repeticiones.
 */
describe('cuándo se avisa', () => {
	function espiarFetch() {
		const llamadas: any[] = [];
		(globalThis as any).fetch = (url: string, opciones: any) => {
			llamadas.push({ url, body: JSON.parse(opciones.body) });
			return Promise.resolve({ ok: true });
		};
		return llamadas;
	}

	test('la misma pantalla dos veces se avisa una sola', () => {
		olvidarPantalla();
		const llamadas = espiarFetch();
		reportarPantalla('token', 'winners');
		reportarPantalla('token', 'winners');
		reportarPantalla('token', 'winners');
		assert.equal(llamadas.length, 1);
	});

	test('cambiar de pantalla sí se avisa', () => {
		olvidarPantalla();
		const llamadas = espiarFetch();
		reportarPantalla('token', 'winners');
		reportarPantalla('token', 'history');
		assert.equal(llamadas.length, 2);
		assert.equal(llamadas[1].body.vista, 'history');
	});

	/** Cambiar de anuncio dentro de la misma pantalla también es moverse. */
	test('el detalle cuenta como cambio', () => {
		olvidarPantalla();
		const llamadas = espiarFetch();
		reportarPantalla('token', 'creando', 'Spring Sale');
		reportarPantalla('token', 'creando', 'Tooth Armour');
		assert.equal(llamadas.length, 2);
		assert.equal(llamadas[1].body.detalle, 'Tooth Armour');
	});

	test('sin sesión no se avisa nada', () => {
		olvidarPantalla();
		const llamadas = espiarFetch();
		reportarPantalla('', 'winners');
		assert.equal(llamadas.length, 0);
	});

	/** Al cerrar sesión se olvida, para que la próxima cuenta no herede nada. */
	test('olvidar deja avisar la misma pantalla de nuevo', () => {
		olvidarPantalla();
		const llamadas = espiarFetch();
		reportarPantalla('token', 'winners');
		olvidarPantalla();
		reportarPantalla('token', 'winners');
		assert.equal(llamadas.length, 2);
	});
});
