import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

/**
 * El H1 es donde la marca escribe la oferta real de la página —"3x2 en toda la
 * tienda", "El cuero que usan los profesionales"—. Solo se le mandaban al modelo
 * el title y la meta descripción, que suelen ser texto de SEO, así que la
 * promesa que la marca eligió mostrar se perdía.
 *
 * Lo que se prueba acá es el filtro: sin él, una tienda Shopify que pinta su H1
 * con JavaScript deja "Your cart is empty" como primer encabezado, y esa frase
 * terminaba presentada al modelo como la promesa principal de la página.
 */
const CHROME = /^(?:(?:tu|your|mi|my|el|la)\s+)?(?:carrito|cart(?:\s+is\s+empty)?|carro|bolsa|bag|men[úu]|buscar|search|newsletter|suscribirse|subscribe|iniciar\s+sesi[óo]n|log\s?in|sign\s?in|crear\s+cuenta|cuenta|account|idioma|language|moneda|currency|filtros?|filters?|ordenar\s+por|sort\s+by|compartir|share|seguinos|s[íi]guenos|follow\s+us|contacto|cont[áa]ctanos|contact\s+us|ayuda|help|preguntas\s+frecuentes|faq|env[íi]os?\s+y\s+devoluciones|shipping\s+(?:and|&)\s+returns|devoluciones|returns|pol[íi]tica\s+de\s+\w+|privacy\s+policy|t[ée]rminos\s+(?:y|and)\s+\w+|terms\s+of\s+\w+|(?:estimated\s+)?(?:sub)?total|men[úu]\s+principal|main\s+menu|redes\s+sociales|footer|nav)\s*[:.]?$/i;
const util = (value: string) => value.length >= 3 && value.length <= 200 && !CHROME.test(value.trim());

describe('encabezados que valen como oferta', () => {
	test('descarta los encabezados de interfaz', () => {
		for (const basura of [
			'Your cart is empty', 'Your cart', 'Estimated total', 'Tu carrito',
			'Buscar', 'Newsletter', 'Iniciar sesión', 'Preguntas frecuentes',
			'Envíos y devoluciones', 'Términos y condiciones',
		]) {
			assert.equal(util(basura), false, basura);
		}
	});

	test('conserva las promesas reales', () => {
		for (const buena of [
			'3x2 en toda la tienda', 'El cuero que usan los profesionales',
			'Envío gratis desde $50.000', 'Cueros curtidos al vegetal desde 1987',
		]) {
			assert.equal(util(buena), true, buena);
		}
	});

	test('no confunde una promesa que empieza igual que un ítem de menú', () => {
		// Éste es el caso que rompió la primera versión del filtro: era por
		// prefijo, así que "Envíos" (menú) se llevaba puesto "Envío gratis
		// desde $50.000" (oferta). Ahora la coincidencia tiene que ser completa.
		assert.equal(util('Envío gratis desde $50.000'), true);
		assert.equal(util('Envíos y devoluciones'), false);
		assert.equal(util('Contamos con 40 años de oficio'), true);
		assert.equal(util('Contacto'), false);
	});
});
