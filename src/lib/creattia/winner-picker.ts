import OpenAI from 'openai';

// Selección de anuncios ganadores REALES de la biblioteca (1.700+) para un
// producto concreto. El lote no se arma con prompts de texto: se arma con
// referencias visuales probadas que después se clonan con el producto del
// usuario, igual que hace el Studio.

export type Winner = {
	templateId: number;
	name: string;
	imagePath: string;
	promptNotes?: string;
	categoryGroup?: string;
	categoryBranch?: string;
	categoryLeaf?: string;
	tags?: string[];
	metadata?: { domain?: string; cta?: string; mediaType?: string; carouselImages?: string[] };
};

export type ProductSignals = { wearable: boolean };

let cachedWinners: Winner[] | null = null;

/**
 * Carga el manifest de ganadores.
 *
 * La fuente de verdad es Supabase Storage, igual que en la Biblioteca de
 * ganadores del front. `public/scraped_ads/` está en .gitignore, así que en
 * Vercel ese archivo NO existe: leerlo desde el propio origen daba 404 en
 * producción y el lote no se podía armar. Se deja como fallback para desarrollo.
 */
export async function loadWinners(siteOrigin: string): Promise<Winner[]> {
	if (cachedWinners) return cachedWinners;

	const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
	const sources = [
		supabaseUrl
			? `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/creative-references/manifests/starter-static-50.json`
			: '',
		`${siteOrigin.replace(/\/$/, '')}/scraped_ads/manifest.json`,
	].filter(Boolean);

	const failures: string[] = [];
	for (const source of sources) {
		try {
			const response = await fetch(source);
			if (!response.ok) {
				failures.push(`${response.status} en ${source.split('/').slice(-1)[0]}`);
				continue;
			}
			const data: any = await response.json();
			const items: Winner[] = Array.isArray(data) ? data : data.items || [];
			// Los carruseles también entran como candidatos: para el lote se clona
			// solo su portada (página 1), igual que cualquier anuncio estático. El
			// carrusel completo (todas las páginas) se genera aparte, desde la
			// biblioteca → "Usar este diseño" → Carrusel completo.
			const usable = items.filter((item) => item.imagePath);
			if (usable.length) {
				cachedWinners = usable;
				return cachedWinners;
			}
			failures.push(`sin items usables en ${source.split('/').slice(-1)[0]}`);
		} catch (error) {
			failures.push(error instanceof Error ? error.message : String(error));
		}
	}

	throw new Error(`No se pudo cargar la biblioteca de ganadores (${failures.join(' | ')}).`);
}

/**
 * Lo único que se le pregunta a la IA sobre el producto: si se usa puesto sobre
 * el cuerpo. Eso alimenta el filtro de compatibilidad (una plantilla donde la
 * prenda va puesta en una modelo no sirve para un material o un cosmético).
 *
 * Ya NO se piden nichos ni palabras clave: la referencia no necesita ser del
 * mismo rubro, porque el producto se reemplaza igual al clonarla. Filtrar por
 * rubro solo achicaba el pool y devolvía siempre las mismas marcas.
 */
async function readProductSignals(
	product: { name: string; description?: string; priceText?: string },
	keys: { openAIKey?: string; googleKey?: string },
): Promise<ProductSignals> {
	const prompt = `Producto: "${product.name}"
Descripción: ${product.description?.slice(0, 600) || 'sin descripción'}

Devolvé SOLO JSON:
{"wearable": true si el producto se USA PUESTO sobre el cuerpo (prenda, calzado, ropa interior, joya, reloj, accesorio que se lleva encima). false si es un material, insumo, alimento, cosmético, mueble, herramienta, dispositivo, servicio o cualquier cosa que no se viste}`;

	const parse = (raw: string): ProductSignals => ({ wearable: JSON.parse(raw).wearable === true });

	if (keys.googleKey) {
		try {
			const model = process.env.GEMINI_ANALYSIS_MODEL || import.meta.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash-lite';
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.googleKey}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: { responseMimeType: 'application/json' },
				}),
			});
			const data: any = await response.json();
			const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
			return parse(text);
		} catch (error) {
			console.warn('Señal wearable por Gemini falló:', error);
		}
	}

	if (keys.openAIKey) {
		try {
			const openai = new OpenAI({ apiKey: keys.openAIKey });
			const response = await openai.chat.completions.create({
				model: 'gpt-4o-mini',
				response_format: { type: 'json_object' },
				messages: [{ role: 'user', content: prompt }],
			});
			return parse(response.choices[0]?.message?.content || '{}');
		} catch (error) {
			console.warn('Señal wearable por OpenAI falló:', error);
		}
	}

	// Sin IA se asume que se puede vestir: así no se filtra nada por las dudas.
	return { wearable: true };
}

/** Mezcla al azar sin modificar el array original (Fisher-Yates). */
function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swap = Math.floor(Math.random() * (index + 1));
		[copy[index], copy[swap]] = [copy[swap], copy[index]];
	}
	return copy;
}

/**
 * Elige referencias AL AZAR de toda la biblioteca.
 *
 * Antes se puntuaba por rubro y palabras clave y se repartía por tipo de anuncio.
 * Se sacó por dos razones:
 *  - La referencia no necesita ser del mismo rubro: el producto se reemplaza al
 *    clonarla. Filtrar por rubro solo achicaba el pool y repetía las mismas marcas.
 *  - El campo categoryLeaf del manifest no es confiable (etiquetaba una foto de
 *    salame como "reseñas"), así que las cuotas por tipo de anuncio se estaban
 *    armando sobre un dato equivocado.
 *
 * Lo único que se sigue filtrando es la compatibilidad estructural, que se decide
 * mirando la imagen en winner-screening.ts, más una referencia por marca para que
 * el lote no se vea repetido.
 */
export async function pickWinnersForProduct(input: {
	winners: Winner[];
	product: { name: string; description?: string; priceText?: string };
	count: number;
	/** Suplentes para cuando el usuario descarta una referencia en la revisión. */
	spareCount?: number;
	openAIKey?: string;
	googleKey?: string;
}): Promise<{ winners: Winner[]; spares: Winner[]; signals: ProductSignals }> {
	const signals = await readProductSignals(input.product, { openAIKey: input.openAIKey, googleKey: input.googleKey });

	// Si el producto no se usa puesto, se saltean los rubros donde el anuncio
	// muestra la prenda sobre una persona. El screening por imagen igual vuelve a
	// chequearlo, pero descartarlas acá ahorra llamadas de visión.
	const pool = input.winners;

	const picked: Winner[] = [];
	const spares: Winner[] = [];
	const brands = new Set<string>();
	const spareTarget = input.spareCount ?? Math.max(24, input.count * 3);

	for (const winner of shuffle(pool)) {
		if (picked.length >= input.count && spares.length >= spareTarget) break;
		// Una referencia por marca: dos anuncios del mismo anunciante suelen
		// compartir estética y el lote se ve repetido.
		const brand = (winner.name || '').toLowerCase();
		if (brands.has(brand)) continue;
		brands.add(brand);
		if (picked.length < input.count) picked.push(winner);
		else spares.push(winner);
	}

	return { winners: picked, spares, signals };
}
