import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { mergePaletteOverride, parsePaletteOverride } from '../src/lib/creattia/generation-pipeline';

/**
 * La detección de colores se equivoca (toma el gris de un banner o el color de
 * un botón de cookies). El usuario tiene que poder corregirla, pero lo que
 * manda el cliente entra al prompt: solo se aceptan hexadecimales completos.
 */

const detectada = { background: '#ffffff', text: '#111111', accent: '#ff0000', source: 'url' };

describe('corrección de la paleta', () => {
	test('lo que corrige el usuario pisa lo detectado', () => {
		const r = mergePaletteOverride(detectada, { accent: '#00A86B' });
		assert.equal(r?.accent, '#00a86b');
		assert.equal(r?.background, '#ffffff', 'lo que no se tocó se conserva');
		assert.equal(r?.source, 'corregida por el usuario');
	});

	test('un valor que no es un color se ignora y no ensucia el prompt', () => {
		for (const basura of ['rojo', 'javascript:alert(1)', '#fff', '#12345', 'rgb(1,2,3)', '"; DROP TABLE', '']) {
			const r = mergePaletteOverride(detectada, { accent: basura });
			assert.equal(r?.accent, '#ff0000', `aceptó ${JSON.stringify(basura)}`);
		}
	});

	test('sin corrección devuelve la detectada tal cual', () => {
		assert.deepEqual(mergePaletteOverride(detectada, null), detectada);
		assert.deepEqual(mergePaletteOverride(detectada, {}), detectada);
		assert.equal(mergePaletteOverride(undefined, null), undefined);
	});

	test('solo se leen los cuatro roles conocidos', () => {
		const r = mergePaletteOverride(detectada, { accent: '#00a86b', inventado: '#000000' } as any);
		assert.equal((r as any).inventado, undefined);
	});

	test('parsePaletteOverride acepta JSON y objeto, y descarta lo inválido', () => {
		assert.deepEqual(parsePaletteOverride('{"accent":"#00A86B"}'), { accent: '#00a86b' });
		assert.deepEqual(parsePaletteOverride({ text: '#000000' }), { text: '#000000' });
		assert.equal(parsePaletteOverride('no es json'), null);
		assert.equal(parsePaletteOverride('{"accent":"rojo"}'), null);
		assert.equal(parsePaletteOverride(null), null);
	});
});
