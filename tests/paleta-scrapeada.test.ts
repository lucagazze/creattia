import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { __testing } from '../src/lib/creattia/brand-style';

/**
 * La paleta de una web se mide por lo que más se repite, no por lo primero.
 *
 * Se pasó la URL de una tienda de ropa y devolvió fondo #000000 y acento
 * #007aff —el azul de iOS—, cuando el sitio no es ni negro ni azul. La causa era
 * que se tomaba el PRIMER color que aparecía en el CSS para cada propiedad, y en
 * cualquier hoja moderna la primera declaración de `background` pertenece a un
 * reset, a un `::selection` o a un componente que quedó arriba en el bundle.
 *
 * Y no es un detalle cosmético: cuando la persona elige "colores de la URL", esa
 * paleta se aplica como COLOR RESTYLE sobre el anuncio ganador. Un ganador verde
 * azulado salía negro y azul, y el clon dejaba de parecerse al original.
 */

const { extractSemanticPalette } = __testing;

describe('la paleta sale de lo que predomina', () => {
	test('el fondo del body le gana al de un componente cualquiera', () => {
		// El orden es a propósito el peor: el color basura aparece PRIMERO.
		const css = `
			::selection { background: #000000; }
			.badge { background-color: #ff00ff; }
			body { background: #fdfbf7; color: #2b2b2b; }
			main { background: #fdfbf7; }
		`;
		const paleta = extractSemanticPalette(css, '');
		assert.equal(paleta.background, '#fdfbf7');
	});

	test('el acento sale del fondo de los botones', () => {
		const css = `
			body { background: #ffffff; color: #222222; }
			.btn-primary { background-color: #e2574c; color: #ffffff; }
			.product-card { background: #f4f4f4; }
		`;
		const paleta = extractSemanticPalette(css, '');
		assert.equal(paleta.accent, '#e2574c');
		assert.notEqual(paleta.background, '#e2574c');
	});

	test('los títulos definen el color del texto', () => {
		const css = `
			body { background: #ffffff; color: #999999; }
			.legal { color: #cccccc; }
			h1, h2 { color: #101820; }
		`;
		assert.equal(extractSemanticPalette(css, '').text, '#101820');
	});

	/** El azul de iOS venía por defecto en el meta y se llevaba el acento. */
	test('el theme-color vota pero no le gana a un botón real', () => {
		const css = `
			body { background: #ffffff; color: #222222; }
			.add-to-cart { background: #1b7f4f; }
		`;
		assert.equal(extractSemanticPalette(css, '#007aff').accent, '#1b7f4f');
	});

	test('sin ningún botón, el theme-color sirve igual', () => {
		assert.equal(extractSemanticPalette('body { background: #ffffff; }', '#007aff').accent, '#007aff');
	});

	test('un acento nunca es un gris si hay un color de verdad', () => {
		const css = `
			body { background: #ffffff; color: #111111; }
			.card { border-color: #dddddd; }
			.card { border-color: #dddddd; }
			.btn { background: #7a3cf0; }
		`;
		assert.equal(extractSemanticPalette(css, '').accent, '#7a3cf0');
	});

	test('la paleta comentada de arriba de la hoja no cuenta', () => {
		// Casi todas las hojas traen una leyenda de colores comentada al inicio.
		const css = `
			/* Paleta: #000000 negro, #ff0000 rojo */
			body { background: #fffdf9; color: #1a1a1a; }
		`;
		assert.equal(extractSemanticPalette(css, '').background, '#fffdf9');
	});

	test('los cuatro roles quedan distintos entre sí', () => {
		const css = `
			body { background: #ffffff; color: #222222; }
			h1 { color: #0b1f33; }
			.btn { background: #d94f30; }
			.tag { border-color: #2f9e8f; }
		`;
		const p = extractSemanticPalette(css, '');
		assert.equal(new Set([p.background, p.text, p.accent, p.secondary]).size, 4);
	});
});
