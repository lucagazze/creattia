import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Load manifest
const manifestPath = resolve('./public/scraped_ads/manifest.json');
const raw = await readFile(manifestPath, 'utf-8');
const manifest = JSON.parse(raw);

function classify(item) {
	const name = (item.name || '').toLowerCase();
	const notes = (item.promptNotes || '').toLowerCase();
	const tid = item.templateId;

	// 1. Nosotros vs Ellos (vs)
	if (tid === 23 || notes.includes(' vs ') || notes.includes('versus') || notes.includes('unlike') || notes.includes('better than')) {
		return 'vs';
	}
	// 2. Testimonios (testimonios)
	if (tid === 1 || notes.includes('review') || notes.includes('love') || notes.includes('testimonial') || notes.includes('customer') || notes.includes('“') || notes.includes('"') || notes.includes('says')) {
		return 'testimonios';
	}
	// 3. Antes y después (antes-despues)
	if (notes.includes('before') || notes.includes('after') || notes.includes('antes') || notes.includes('después')) {
		return 'antes-despues';
	}
	// 4. Cazador de mitos (mitos)
	if (tid === 32 || notes.includes('myth') || notes.includes('truth') || notes.includes('fact') || notes.includes('real') || notes.includes('fake')) {
		return 'mitos';
	}
	// 5. Gancho negativo (gancho-negativo)
	if (notes.includes('stop') || notes.includes('don\'t') || notes.includes('mistake') || notes.includes('avoid') || notes.includes('hate') || notes.includes('worst') || notes.includes('never')) {
		return 'gancho-negativo';
	}
	// 6. Preguntas frecuentes (preguntas)
	if (notes.includes('?') || notes.includes('how do') || notes.includes('why do') || notes.includes('what is') || notes.includes('question')) {
		return 'preguntas';
	}
	// 7. Top razones (top-razones)
	if (notes.includes('reason') || notes.includes('reasons') || notes.includes('why you need') || notes.includes('top 3') || notes.includes('top 5')) {
		return 'top-razones';
	}
	// 8. Estadísticas (estadisticas)
	if (notes.includes('%') || notes.includes('10x') || notes.includes('3x') || notes.includes('5x') || /\b\d{1,3}%\b/.test(notes) || notes.includes('stats') || notes.includes('numbers')) {
		return 'estadisticas';
	}
	// 9. Qué contiene (contenido)
	if (notes.includes('what\'s inside') || notes.includes('ingredients') || notes.includes('contains') || notes.includes('what you get') || notes.includes('box') || notes.includes('pack')) {
		return 'contenido';
	}
	// 10. Problema-solución (problema-solucion)
	if (notes.includes('tired of') || notes.includes('struggle') || notes.includes('solution') || notes.includes('finally') || notes.includes('save time') || notes.includes('easy way')) {
		return 'problema-solucion';
	}
	// 11. Notas (notas)
	if (notes.includes('note:') || notes.includes('memo') || notes.includes('tweet') || notes.includes('slack') || notes.includes('post-it')) {
		return 'notas';
	}
	// 12. Multimedia (multimedia)
	if (notes.includes('video') || notes.includes('watch') || notes.includes('media') || notes.includes('show') || notes.includes('gif')) {
		return 'multimedia';
	}
	// 13. Más vendidos (mas-vendidos)
	if (tid === 13 || tid === 15 || tid === 18 || notes.includes('free') || notes.includes('shipping') || notes.includes('off') || notes.includes('save') || notes.includes('sale') || notes.includes('discount') || notes.includes('price') || notes.includes('best seller') || notes.includes('popular')) {
		return 'mas-vendidos';
	}
	// 14. Características (caracteristicas)
	return 'caracteristicas'; // Default for Hero ads showing products/features
}

function getTags(item, category) {
	const name = (item.name || '').toLowerCase();
	const notes = (item.promptNotes || '').toLowerCase();
	const ind = ((item.metadata && item.metadata.industry) || '').toLowerCase();
	const tags = new Set();

	// Style/Category tags
	if (category === 'vs') tags.add('Comparación').add('VS');
	if (category === 'testimonios') tags.add('Testimonial').add('Opinión').add('Social Proof');
	if (category === 'mas-vendidos') tags.add('Oferta').add('Descuento').add('Promo');
	if (category === 'mitos') tags.add('Mitos').add('Educativo');
	if (category === 'caracteristicas') tags.add('Producto').add('Llamativo');
	if (category === 'notas') tags.add('Tweet').add('Texto');
	if (category === 'preguntas') tags.add('Preguntas').add('FAQ');
	if (category === 'estadisticas') tags.add('Métricas').add('Números');
	if (category === 'antes-despues') tags.add('Antes/Después').add('Resultados');
	if (category === 'problema-solucion') tags.add('Solución').add('Beneficios');

	// Template-specific tags
	if (item.templateId === 40) tags.add('Minimalista').add('Clean');
	if (item.templateId === 13) tags.add('Precio').add('Tachado');
	if (item.templateId === 15) tags.add('Fecha Límite').add('Urgencia');
	if (item.templateId === 18) tags.add('Envío Gratis').add('Beneficio');

	// Industry/Market tags
	if (ind.includes('b2b') || ind.includes('saas') || ind.includes('software') || name.includes('notion') || name.includes('figma') || name.includes('zapier')) {
		tags.add('SaaS').add('B2B').add('Tecnología');
	} else {
		tags.add('E-commerce').add('Físico');
	}
	if (ind.includes('health') || ind.includes('wellness') || ind.includes('beauty') || ind.includes('collagen') || name.includes('billie')) {
		tags.add('Estilo de Vida').add('Salud').add('Belleza');
	}
	if (ind.includes('food') || ind.includes('snack') || name.includes('flings')) {
		tags.add('Comida').add('Snacks');
	}

	// Keywords search terms
	if (notes.includes('bold') || name.includes('bold')) tags.add('Llamativo').add('Bold');
	if (notes.includes('simple') || notes.includes('minimal')) tags.add('Minimalista');
	if (notes.includes('premium') || notes.includes('luxury')) tags.add('Premium');
	if (notes.includes('modern') || notes.includes('next-gen')) tags.add('Moderno');

	return Array.from(tags);
}

// Process all items
let stats = {};
manifest.items = manifest.items.map(item => {
	const cat = classify(item);
	stats[cat] = (stats[cat] || 0) + 1;
	const tags = getTags(item, cat);
	return {
		...item,
		category: cat,
		tags
	};
});

console.log('--- RECLASIFICACIÓN DE ANUNCIOS ---');
console.log('Total procesados:', manifest.items.length);
console.log('Distribución de categorías:', stats);

// Save updated manifest
await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log('¡Manifiesto guardado correctamente en:', manifestPath);
