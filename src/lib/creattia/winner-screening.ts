/**
 * Filtro de compatibilidad entre un anuncio ganador y el producto del usuario.
 *
 * El manifest no dice si un ganador se puede clonar: solo trae marca, rubro y
 * tipo de anuncio. Por eso entraban plantillas imposibles y el resultado no tenía
 * sentido — con un cuero mayorista salió una modelo fitness en bikini con el
 * texto del cuero encima, una ilustración anatómica de un hombro con cueros
 * apilados, y una persona en la nieve con un cuero pegado en la espalda.
 *
 * Acá se mira la imagen del ganador con un modelo de visión barato (una llamada
 * por referencia, en paralelo, antes de cobrar créditos) y se decide si ese
 * layout puede alojar este producto. Las que no pasan se descartan en el paso de
 * revisión, así el usuario nunca gasta un crédito en un anuncio condenado.
 */

export type ScreeningVerdict = {
	/** El anuncio muestra un producto físico que se puede reemplazar. */
	hasProductShot: boolean;
	/** El producto aparece puesto sobre el cuerpo de una persona. */
	productOnBody: boolean;
	/** El anuncio es ilustración, diagrama o infografía, no una foto. */
	isIllustration: boolean;
	/** La imagen central es una persona/escena y el producto no es lo que se ve. */
	personIsTheSubject: boolean;
	reason: string;
};

export type ScreeningResult = ScreeningVerdict & { compatible: boolean };

const FALLBACK: ScreeningVerdict = {
	hasProductShot: true,
	productOnBody: false,
	isIllustration: false,
	personIsTheSubject: false,
	reason: 'sin análisis',
};

const PROMPT = `Mirá este anuncio publicitario y respondé SOLO con JSON:
{
 "hasProductShot": true si se ve un objeto físico vendible (envase, botella, caja, prenda, material, dispositivo) que podría reemplazarse por otro producto. false si el anuncio es solo texto, solo una persona, un gráfico o una captura de pantalla,
 "productOnBody": true si el producto se usa puesto sobre una persona (prenda, calzado, ropa interior, joya, parche en la piel),
 "isIllustration": true si es un dibujo, diagrama, ilustración médica o infografía en vez de una fotografía,
 "personIsTheSubject": true si lo que domina la imagen es el CUERPO o la CARA de una persona y el producto es secundario o no se ve (foto de gimnasio, antes y después de un cuerpo, retrato, selfie de cuerpo entero),
 "reason": "una frase corta en español describiendo qué se ve"
}`;

async function screenOne(
	imageBase64: string,
	mime: string,
	keys: { googleKey?: string },
): Promise<ScreeningVerdict> {
	if (!keys.googleKey) return FALLBACK;
	try {
		const model = process.env.GEMINI_SCREENING_MODEL || import.meta.env.GEMINI_SCREENING_MODEL || 'gemini-2.5-flash-lite';
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.googleKey}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: imageBase64 } }] }],
				generationConfig: { responseMimeType: 'application/json' },
			}),
		});
		const data: any = await response.json();
		if (!response.ok) throw new Error(JSON.stringify(data.error || data).slice(0, 140));
		const text = data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
		const parsed = JSON.parse(text);
		return {
			hasProductShot: parsed.hasProductShot !== false,
			productOnBody: parsed.productOnBody === true,
			isIllustration: parsed.isIllustration === true,
			personIsTheSubject: parsed.personIsTheSubject === true,
			reason: String(parsed.reason || '').slice(0, 160),
		};
	} catch (error) {
		console.warn('Screening de ganador falló, se acepta por defecto:', error);
		return FALLBACK;
	}
}

/**
 * Decide si el ganador puede clonarse para este producto.
 *
 * `productWearable` viene del análisis del producto: si es false, cualquier
 * plantilla donde el producto se lleva puesto queda descartada.
 * `productHasImage` es false cuando el usuario genera sin foto de producto: ahí
 * sirven justamente las plantillas SIN producto físico, y sobran las que lo tienen.
 */
export function isCompatible(verdict: ScreeningVerdict, product: { wearable: boolean; hasImage: boolean }): { compatible: boolean; why: string } {
	if (!product.hasImage) {
		// Sin foto de producto solo se pueden clonar layouts que no muestren uno.
		if (verdict.hasProductShot) return { compatible: false, why: 'la plantilla muestra un producto y no cargaste ninguna foto' };
		return { compatible: true, why: '' };
	}
	if (verdict.productOnBody && !product.wearable) {
		return { compatible: false, why: 'la plantilla muestra el producto puesto en una persona y el tuyo no se usa puesto' };
	}
	if (verdict.personIsTheSubject && !verdict.hasProductShot) {
		return { compatible: false, why: 'el anuncio es una persona y no hay dónde poner tu producto' };
	}
	if (verdict.isIllustration) {
		return { compatible: false, why: 'es una ilustración o diagrama: no se puede insertar una foto real de producto' };
	}
	if (!verdict.hasProductShot) {
		return { compatible: false, why: 'la plantilla no tiene un producto físico que reemplazar' };
	}
	return { compatible: true, why: '' };
}

/** Analiza varias referencias en paralelo, con un tope de concurrencia. */
export async function screenWinners(
	items: Array<{ imagePath: string; buffer: Buffer; mime: string }>,
	keys: { googleKey?: string },
	concurrency = 10,
): Promise<Map<string, ScreeningVerdict>> {
	const results = new Map<string, ScreeningVerdict>();
	const queue = [...items];
	const runNext = async (): Promise<void> => {
		const item = queue.shift();
		if (!item) return;
		results.set(item.imagePath, await screenOne(item.buffer.toString('base64'), item.mime, keys));
		return runNext();
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, runNext));
	return results;
}
