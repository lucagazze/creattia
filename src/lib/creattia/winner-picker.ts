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

/** Carga el manifest de ganadores (asset estático del propio deploy). */
export async function loadWinners(siteOrigin: string): Promise<Winner[]> {
	if (cachedWinners) return cachedWinners;
	const response = await fetch(`${siteOrigin.replace(/\/$/, '')}/scraped_ads/manifest.json`);
	if (!response.ok) throw new Error(`No se pudo cargar la biblioteca de ganadores (${response.status}).`);
	const data: any = await response.json();
	const items: Winner[] = Array.isArray(data) ? data : data.items || [];
	// Solo estáticos con imagen: los carruseles no sirven como referencia única.
	cachedWinners = items.filter((item) => item.imagePath && item.metadata?.mediaType !== 'carousel');
	return cachedWinners;
}

/** Pide a la IA el nicho y las palabras clave del producto para hacer el match. */
async function readProductSignals(
	product: { name: string; description?: string; priceText?: string },
	keys: { openAIKey?: string; googleKey?: string },
): Promise<{ niches: string[]; keywords: string[] }> {
	const prompt = `Producto: "${product.name}"
Descripción: ${product.description?.slice(0, 800) || 'sin descripción'}
Precio: ${product.priceText || 'no informado'}

Devolvé SOLO JSON:
{"niches": ["hasta 3 nichos de esta lista exacta: ${NICHES.join(', ')}"],
 "keywords": ["hasta 8 palabras clave en inglés y español que describan el producto, su categoría y su beneficio"]}`;

	const parse = (raw: string) => {
		const parsed = JSON.parse(raw);
		return {
			niches: (Array.isArray(parsed.niches) ? parsed.niches : []).filter((n: string) => NICHES.includes(n)).slice(0, 3),
			keywords: (Array.isArray(parsed.keywords) ? parsed.keywords : []).map((k: string) => String(k).toLowerCase()).slice(0, 8),
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

function scoreWinner(winner: Winner, signals: { niches: string[]; keywords: string[] }) {
	let score = 0;
	const winnerNiches = winner.metadata?.foreplayNiches || [];
	for (const niche of signals.niches) {
		if (winnerNiches.includes(niche)) score += 6;
	}
	const haystack = [winner.name, winner.promptNotes, ...(winner.tags || [])].join(' ').toLowerCase();
	for (const keyword of signals.keywords) {
		if (keyword && haystack.includes(keyword)) score += 2;
	}
	// Con notas de diseño el análisis de layout arranca mejor.
	if (winner.promptNotes) score += 1;
	return score;
}

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
}): Promise<{ winners: Winner[]; spares: Winner[]; signals: { niches: string[]; keywords: string[] } }> {
	const signals = await readProductSignals(input.product, { openAIKey: input.openAIKey, googleKey: input.googleKey });

	const ranked = input.winners
		.map((winner) => ({ winner, score: scoreWinner(winner, signals) }))
		.sort((a, b) => b.score - a.score);

	const byLeaf = new Map<string, Winner[]>();
	for (const { winner } of ranked) {
		const leaf = winner.categoryLeaf || 'hero';
		if (!byLeaf.has(leaf)) byLeaf.set(leaf, []);
		byLeaf.get(leaf)!.push(winner);
	}

	const picked: Winner[] = [];
	const usedPaths = new Set<string>();
	const brandCount = new Map<string, number>();
	const maxPerBrand = Math.max(2, Math.ceil(input.count / 6));

	const take = (leaf: string, quantity: number) => {
		const pool = byLeaf.get(leaf) || [];
		for (const winner of pool) {
			if (quantity <= 0) break;
			if (usedPaths.has(winner.imagePath)) continue;
			const brand = (winner.name || '').toLowerCase();
			if ((brandCount.get(brand) || 0) >= maxPerBrand) continue;
			usedPaths.add(winner.imagePath);
			brandCount.set(brand, (brandCount.get(brand) || 0) + 1);
			picked.push(winner);
			quantity -= 1;
		}
	};

	for (const { leaf, weight } of FUNNEL_MIX) {
		take(leaf, Math.max(1, Math.round(input.count * weight)));
		if (picked.length >= input.count) break;
	}

	// Completar con los mejores que queden, sin importar el tipo.
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

	return { winners, spares, signals };
}
