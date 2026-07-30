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
	metadata?: { foreplayNiches?: string[]; domain?: string; cta?: string; mediaType?: string; carouselImages?: string[] };
};

// Nichos tal como vienen etiquetados en el manifest de Foreplay.
const NICHES = [
	'Beauty', 'Health/Wellness', 'Fashion', 'App/Software', 'Food/Drink', 'Pets',
	'Accessories', 'Real Estate', 'Education', 'Tech', 'Home/Garden', 'Medical',
	'Business/Professional', 'Jewelry/Watches', 'Kids/Baby', 'Service Business',
	'Finance', 'Sports/Outdoors', 'Travel', 'Automotive', 'Entertainment',
];

// Reparto del lote por tipo de anuncio para cubrir el embudo completo en vez de
// devolver 40 veces el mismo formato hero. Los pesos suman 1.
const FUNNEL_MIX: Array<{ leaf: string; weight: number }> = [
	{ leaf: 'hero', weight: 0.26 },
	{ leaf: 'resenas', weight: 0.20 },
	{ leaf: 'precio', weight: 0.14 },
	{ leaf: 'competencia', weight: 0.12 },
	{ leaf: 'caracteristicas', weight: 0.12 },
	{ leaf: 'urgencia', weight: 0.06 },
	{ leaf: 'garantia', weight: 0.05 },
	{ leaf: 'mitos', weight: 0.03 },
	{ leaf: 'envio', weight: 0.02 },
];

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
			// Solo estáticos con imagen: los carruseles no sirven como referencia única.
			const usable = items.filter((item) => item.imagePath && item.metadata?.mediaType !== 'carousel');
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

/** Pide a la IA el nicho y las palabras clave del producto para hacer el match. */
async function readProductSignals(
	product: { name: string; description?: string; priceText?: string },
	keys: { openAIKey?: string; googleKey?: string },
): Promise<{ niches: string[]; keywords: string[] }> {
	const prompt = `Producto: "${product.name}"
Descripción: ${product.description?.slice(0, 800) || 'sin descripción'}
Precio: ${product.priceText || 'no informado'}

Vamos a buscar anuncios publicitarios reales parecidos para usarlos como
referencia visual. Necesito palabras que aparecerían en el texto o el rubro de
un anuncio de ESTE producto puntual, no de su categoría amplia.

Devolvé SOLO JSON:
{"niches": ["hasta 2 nichos de esta lista exacta, los más precisos: ${NICHES.join(', ')}"],
 "keywords": ["10 palabras clave de UNA sola palabra, en inglés y español, sin repetir: qué ES físicamente el producto, su material, su categoría concreta y para qué se usa. Nada genérico como 'calidad', 'producto' o 'premium'."]}`;

	const parse = (raw: string) => {
		const parsed = JSON.parse(raw);
		return {
			niches: (Array.isArray(parsed.niches) ? parsed.niches : []).filter((n: string) => NICHES.includes(n)).slice(0, 2),
			keywords: [...new Set((Array.isArray(parsed.keywords) ? parsed.keywords : [])
				.map((k: string) => String(k).toLowerCase().trim())
				.filter((k: string) => k.length > 2 && !GENERIC_WORDS.has(k)))].slice(0, 10) as string[],
		};
	};

	if (keys.googleKey) {
		try {
			const model = process.env.GEMINI_ANALYSIS_MODEL || import.meta.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
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
			const signals = parse(text);
			if (signals.niches.length || signals.keywords.length) return signals;
		} catch (error) {
			console.warn('Señales de producto por Gemini fallaron:', error);
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
			console.warn('Señales de producto por OpenAI fallaron:', error);
		}
	}

	// Sin IA: keywords crudas del nombre del producto.
	return { niches: [], keywords: product.name.toLowerCase().split(/\s+/).filter((word) => word.length > 3).slice(0, 6) };
}

// Palabras que matchean con cualquier anuncio y ensucian el ranking.
const GENERIC_WORDS = new Set([
	'producto', 'product', 'premium', 'calidad', 'quality', 'nuevo', 'new', 'mejor',
	'best', 'ecommerce', 'online', 'marca', 'brand', 'oferta', 'venta', 'sale', 'tienda',
]);

/**
 * Puntaje de afinidad entre un ganador y el producto.
 *
 * El match por nicho pesa poco a propósito: hay 123 anuncios etiquetados
 * "Fashion" y 83 "Accessories", así que si el nicho valiera mucho entraba
 * cualquiera (para un pack de cuero mayorista llegó a elegir un bralette y un
 * jacuzzi). Lo que de verdad discrimina son las palabras clave del producto
 * apareciendo en la marca, los tags o el mensaje del anuncio.
 */
// Palabra completa, no subcadena: buscar "craft" con includes() metía en el lote
// a las marcas "Craftd" y "Crafti" (joyería) para un producto de cuero.
const wordMatchers = new Map<string, RegExp>();
function matchesWord(haystack: string, keyword: string) {
	let matcher = wordMatchers.get(keyword);
	if (!matcher) {
		const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		matcher = new RegExp(`(^|[^a-záéíóúñü0-9])${safe}(s|es)?([^a-záéíóúñü0-9]|$)`, 'i');
		wordMatchers.set(keyword, matcher);
	}
	return matcher.test(haystack);
}

function scoreWinner(winner: Winner, signals: { niches: string[]; keywords: string[] }) {
	let score = 0;
	const winnerNiches = winner.metadata?.foreplayNiches || [];
	for (const niche of signals.niches) {
		if (winnerNiches.includes(niche)) score += 2;
	}
	const brandAndTags = [winner.name, ...(winner.tags || [])].join(' ').toLowerCase();
	const notes = (winner.promptNotes || '').toLowerCase();
	for (const keyword of signals.keywords) {
		if (!keyword) continue;
		// En la marca o los tags: señal fuerte (ej. "leather" en "Portland Leather Goods").
		if (matchesWord(brandAndTags, keyword)) score += 5;
		// En el mensaje del anuncio: señal media.
		else if (matchesWord(notes, keyword)) score += 3;
	}
	// Con notas de diseño el análisis de layout arranca mejor.
	if (winner.promptNotes) score += 1;
	return score;
}

/**
 * Umbral de afinidad real. Con 6 hace falta o un match de palabra clave en la
 * marca/tags (5 + 1 de notas), o un match en el mensaje del anuncio respaldado
 * por el nicho correcto (3 + 2 + 1). Un simple match de nicho (2 + 1 = 3) no
 * alcanza: hay 123 anuncios "Fashion" y entraba cualquiera.
 *
 * Ojo: esto es coincidencia de palabras, no comprensión semántica. Un anuncio
 * sobre "shoulder pain" puede matchear un producto llamado "Double Shoulder".
 * Los que quedan por debajo del umbral se marcan con weakMatch para que el
 * usuario los reemplace de una en el paso de revisión.
 */
const MIN_RELEVANCE = 6;

/**
 * Devuelve `count` ganadores: los que mejor pegan con el producto, repartidos
 * por tipo de anuncio para cubrir todo el embudo y sin repetir la misma marca
 * más de lo necesario.
 */
export async function pickWinnersForProduct(input: {
	winners: Winner[];
	product: { name: string; description?: string; priceText?: string };
	count: number;
	/** Suplentes para cuando el usuario descarta una referencia en la revisión. */
	spareCount?: number;
	openAIKey?: string;
	googleKey?: string;
}): Promise<{
	winners: Winner[];
	spares: Winner[];
	signals: { niches: string[]; keywords: string[] };
	/** Puntaje de afinidad por imagePath, para marcar en la UI cuáles pegan poco. */
	scoreByPath: Map<string, number>;
	minRelevance: number;
}> {
	const signals = await readProductSignals(input.product, { openAIKey: input.openAIKey, googleKey: input.googleKey });

	const ranked = input.winners
		.map((winner) => ({ winner, score: scoreWinner(winner, signals) }))
		.sort((a, b) => b.score - a.score);

	const scoreByPath = new Map(ranked.map(({ winner, score }) => [winner.imagePath, score]));
	const byLeaf = new Map<string, Winner[]>();
	for (const { winner } of ranked) {
		const leaf = winner.categoryLeaf || 'hero';
		if (!byLeaf.has(leaf)) byLeaf.set(leaf, []);
		byLeaf.get(leaf)!.push(winner);
	}

	const picked: Winner[] = [];
	const usedPaths = new Set<string>();
	const brandCount = new Map<string, number>();
	// Una marca sola no puede copar el lote: 1 cada 10 anuncios pedidos.
	const maxPerBrand = Math.max(1, Math.floor(input.count / 10));

	const take = (leaf: string, quantity: number, minScore: number) => {
		const pool = byLeaf.get(leaf) || [];
		for (const winner of pool) {
			if (quantity <= 0) break;
			if (usedPaths.has(winner.imagePath)) continue;
			if ((scoreByPath.get(winner.imagePath) || 0) < minScore) continue;
			const brand = (winner.name || '').toLowerCase();
			if ((brandCount.get(brand) || 0) >= maxPerBrand) continue;
			usedPaths.add(winner.imagePath);
			brandCount.set(brand, (brandCount.get(brand) || 0) + 1);
			picked.push(winner);
			quantity -= 1;
		}
	};

	// Primera pasada: solo referencias que de verdad tienen que ver con el
	// producto, repartidas por tipo de anuncio.
	for (const { leaf, weight } of FUNNEL_MIX) {
		take(leaf, Math.max(1, Math.round(input.count * weight)), MIN_RELEVANCE);
		if (picked.length >= input.count) break;
	}

	// Segunda pasada: si el umbral dejó el lote corto, se relaja pero se sigue
	// respetando el reparto por tipo antes de aceptar cualquier cosa.
	if (picked.length < input.count) {
		for (const { leaf, weight } of FUNNEL_MIX) {
			take(leaf, Math.max(1, Math.round(input.count * weight)), 0);
			if (picked.length >= input.count) break;
		}
	}

	// Última pasada: completar con los mejores que queden, sin importar el tipo.
	if (picked.length < input.count) {
		for (const { winner } of ranked) {
			if (picked.length >= input.count) break;
			if (usedPaths.has(winner.imagePath)) continue;
			usedPaths.add(winner.imagePath);
			picked.push(winner);
		}
	}

	const winners = picked.slice(0, input.count);
	for (const winner of picked.slice(input.count)) usedPaths.delete(winner.imagePath);

	// Suplentes: los siguientes mejor rankeados, para reemplazar en el paso de
	// revisión sin volver a pegarle a la IA.
	const spares: Winner[] = [];
	const spareTarget = input.spareCount ?? Math.max(8, input.count);
	for (const { winner } of ranked) {
		if (spares.length >= spareTarget) break;
		if (usedPaths.has(winner.imagePath)) continue;
		usedPaths.add(winner.imagePath);
		spares.push(winner);
	}

	return { winners, spares, signals, scoreByPath, minRelevance: MIN_RELEVANCE };
}
