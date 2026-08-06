import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { parseBrandOverride } from '../src/lib/creattia/generation-pipeline';

/**
 * La identidad que se lee de una URL al regenerar viaja desde el navegador:
 * entra al prompt y el logo se descarga, así que no se confía en el cliente.
 */
describe('identidad tomada de una URL', () => {
	test('acepta lo válido y normaliza', () => {
		const r = parseBrandOverride({
			name: '  Marca Ajena  ', logoUrl: 'https://cdn.marca.com/logo.png',
			palette: { accent: '#00A86B' }, typography: { headings: 'Poppins', body: 'Inter' },
		});
		assert.equal(r?.name, 'Marca Ajena');
		assert.equal(r?.logoUrl, 'https://cdn.marca.com/logo.png');
		assert.equal(r?.palette?.accent, '#00a86b');
		assert.equal(r?.typography?.headings, 'Poppins');
	});

	test('descarta URLs de logo peligrosas o inválidas', () => {
		for (const logoUrl of ['javascript:alert(1)', 'file:///etc/passwd', 'data:image/png;base64,AAA', 'https://user:pass@x.com/l.png', 'no-es-url']) {
			const r = parseBrandOverride({ name: 'X', logoUrl });
			assert.equal(r?.logoUrl, undefined, `aceptó ${logoUrl}`);
		}
	});

	test('los colores que no son hexadecimales no pasan', () => {
		const r = parseBrandOverride({ name: 'X', palette: { accent: 'rojo', text: '#000000' } });
		assert.equal(r?.palette?.accent, undefined);
		assert.equal(r?.palette?.text, '#000000');
	});

	test('recorta textos largos y devuelve null si no quedó nada útil', () => {
		const r = parseBrandOverride({ name: 'a'.repeat(500) });
		assert.equal(r?.name?.length, 80);
		assert.equal(parseBrandOverride({}), null);
		assert.equal(parseBrandOverride('no json'), null);
		assert.equal(parseBrandOverride(null), null);
	});
});
