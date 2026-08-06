import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

/**
 * Emparejar cada producto de un catálogo con SU foto.
 *
 * Repartir por posición es una lotería: al producto 3 le tocaba la imagen 3 de
 * la página, que puede ser de otro artículo, y el prompt le pide al modelo
 * reproducir fielmente ese producto. Los datos de este test son nombres e
 * imágenes reales de theskirtingfactoryllc.com, que fue el caso que lo destapó.
 */

// Misma lógica que catalog-scanner: se replica acá para poder probarla aislada.
function matcher(images: string[]) {
	const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
	const used = new Set<string>();
	return (productName: string, index: number) => {
		const words = productName.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
		let best = '';
		let bestScore = 0;
		for (const candidate of images) {
			if (used.has(candidate)) continue;
			const haystack = normalize(candidate);
			const score = words.reduce((t, w) => t + (haystack.includes(w) ? w.length : 0), 0);
			if (score > bestScore) { bestScore = score; best = candidate; }
		}
		if (best && bestScore >= 5) { used.add(best); return best; }
		const fallback = images.find((c) => !used.has(c)) || images[index] || images[0] || '';
		if (fallback) used.add(fallback);
		return fallback;
	};
}

const imagenesReales = [
	'https://cdn.site.com/Naturalleatherrolledskirtingsidehide.jpg',
	'https://cdn.site.com/Chestnutleatherargentinianskirtingsidehide.jpg',
	'https://cdn.site.com/latigoleatherargentinianskirtingsidehide.jpg',
	'https://cdn.site.com/Harnessleatherargentinianskirtingsidehide.jpg',
	'https://cdn.site.com/WhatsAppImage2021-10-05at21.jpg',
];

describe('fotos de un catálogo', () => {
	test('cada producto recibe la foto cuyo nombre coincide, no la de su posición', () => {
		const pick = matcher(imagenesReales);
		// 'Harness Leather' está en la posición 0 de la lista de productos, pero su
		// foto es la cuarta: por posición habría recibido la de 'Natural'.
		assert.match(pick('Harness Leather Argentinian Skirting', 0), /Harness/);
		assert.match(pick('Natural Skirting Leather', 1), /Natural/);
		assert.match(pick('Chestnut Leather Side', 2), /Chestnut/);
	});

	test('ninguna foto se repite entre productos', () => {
		const pick = matcher(imagenesReales);
		const asignadas = ['Natural Skirting Leather', 'Chestnut Leather', 'Latigo Leather', 'Harness Leather']
			.map((nombre, i) => pick(nombre, i));
		assert.equal(new Set(asignadas).size, asignadas.length, 'se repitió una foto');
	});

	test('un producto sin coincidencia recibe una foto libre y no una vacía', () => {
		const pick = matcher(imagenesReales);
		pick('Natural Skirting Leather', 0);
		const sinNombreEnLaFoto = pick('Crazy Horse 9-10 oz', 1);
		assert.ok(sinNombreEnLaFoto, 'debería caer a una foto disponible');
		assert.doesNotMatch(sinNombreEnLaFoto, /Natural/, 'no puede robar la ya asignada');
	});

	test('sin imágenes en la página no rompe', () => {
		const pick = matcher([]);
		assert.equal(pick('Cualquier producto', 0), '');
	});
});
