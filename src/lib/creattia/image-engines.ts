import OpenAI, { toFile } from 'openai';

// Motores de imagen reales, en el mismo orden que usa el Studio (generate.ts):
// 1) Gemini image (nano-banana) — rápido, barato y el mejor con texto en la imagen.
// 2) OpenAI gpt-image (OPENAI_IMAGE_MODEL) — fallback con las fotos reales como input.
// No hay tercer motor a propósito: un generador genérico devuelve arte que no es
// un anuncio y ensucia el historial con imágenes que el usuario no puede usar.

export type EngineImage = { buffer: Buffer; type: string };

const geminiAspectRatios: Record<string, string> = {
	'1:1': '1:1', '3:4': '3:4', '9:16': '9:16', '4:3': '4:3', '16:9': '16:9',
	square: '1:1', portrait: '3:4', story: '9:16', landscape: '4:3',
};

// gpt-image-2 acepta cualquier tamaño divisible por 16, así que da los ratios
// exactos. Antes acá estaba el mapa viejo de gpt-image-1, que solo tiene tres
// tamaños: un Story 9:16 terminaba saliendo en 2:3, bastante menos alto.
const openAISizes: Record<string, string> = {
	'1:1': '1024x1024', '3:4': '1152x1536', '9:16': '864x1536', '4:3': '1536x1152', '16:9': '1536x864',
	square: '1024x1024', portrait: '1152x1536', story: '864x1536', landscape: '1536x1152',
};

// gpt-image-1 (legacy) solo acepta estos tres.
const legacyOpenAISizes: Record<string, string> = {
	'1:1': '1024x1024', '3:4': '1024x1536', '9:16': '1024x1536', '4:3': '1536x1024', '16:9': '1536x1024',
	square: '1024x1024', portrait: '1024x1536', story: '1024x1536', landscape: '1536x1024',
};

async function generateWithGemini(input: {
	apiKey: string;
	model: string;
	prompt: string;
	images: EngineImage[];
	aspectRatio: string;
}): Promise<Buffer> {
	const parts = [
		{ text: input.prompt },
		...input.images.map((image) => ({ inline_data: { mime_type: image.type, data: image.buffer.toString('base64') } })),
	];
	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${input.apiKey}`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts }],
				generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: input.aspectRatio } },
			}),
		},
	);
	const data: any = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(`Gemini ${response.status}: ${JSON.stringify(data.error || data).slice(0, 180)}`);
	const part = data.candidates?.[0]?.content?.parts?.find((item: any) => item.inlineData?.data || item.inline_data?.data);
	if (!part) throw new Error(`Gemini no devolvió imagen (${data.candidates?.[0]?.finishReason || 'sin candidatos'}).`);
	return Buffer.from(part.inlineData?.data || part.inline_data?.data, 'base64');
}

async function generateWithOpenAI(input: {
	apiKey: string;
	model: string;
	prompt: string;
	images: EngineImage[];
	size: string;
	/**
	 * 'medium' es el punto de calidad/precio: midió 76s y USD 0.078/img con la
	 * etiqueta del producto perfecta. 'low' baja a 25s pero vuelve a escribir mal
	 * el nombre del envase, y 'high' se va a 225s.
	 */
	openAIQuality?: 'low' | 'medium' | 'high';
}): Promise<Buffer> {
	const openai = new OpenAI({ apiKey: input.apiKey });
	const model = input.model;
	const quality = input.openAIQuality || 'high';
	if (input.images.length) {
		// OpenAI es muy estricto con el formato de entrada: devolvía
		// "Invalid image file or mode for image 4" por el logo, un PNG con un modo
		// de color que no acepta. Se re-codifica todo a PNG RGB plano, que siempre
		// entra. Solo en esta rama: el camino de Gemini no lo necesita.
		const sharp = (await import('sharp')).default;
		const files = await Promise.all(input.images.map(async (image, index) => {
			let buffer = image.buffer;
			try {
				buffer = await sharp(image.buffer).flatten({ background: '#ffffff' }).toColorspace('srgb').png().toBuffer();
			} catch (error) {
				console.error('[image-engines] no se pudo re-codificar una imagen para OpenAI:', error);
			}
			return toFile(buffer, `input-${index}.png`, { type: 'image/png' });
		}));
		const result = await openai.images.edit({
			model,
			image: files as any,
			prompt: input.prompt,
			size: input.size as any,
			quality,
			// input_fidelity solo existe en gpt-image-1; gpt-image-2 lo trae nativo.
			...(model === 'gpt-image-1' ? { input_fidelity: 'high' } : {}),
			n: 1,
		} as any);
		const b64 = result.data?.[0]?.b64_json;
		if (!b64) throw new Error('OpenAI no devolvió imagen.');
		return Buffer.from(b64, 'base64');
	}
	const result = await openai.images.generate({
		model,
		prompt: input.prompt,
		size: input.size as any,
		quality,
		n: 1,
	});
	const b64 = result.data?.[0]?.b64_json;
	if (!b64) throw new Error('OpenAI no devolvió imagen.');
	return Buffer.from(b64, 'base64');
}

/**
 * Genera UNA imagen publicitaria probando los motores en orden.
 * Lanza error con el detalle de todos los motores si ninguno responde: el que
 * llama marca la fila como `failed` y devuelve el crédito. Nunca inventa una
 * imagen de relleno.
 */
export async function generateAdImage(input: {
	googleKey?: string;
	openAIKey?: string;
	prompt: string;
	images?: EngineImage[];
	format: string;
}): Promise<{ buffer: Buffer; engine: string }> {
	const images = input.images || [];
	const failures: string[] = [];

	// Gemini bloquea prompts con su filtro de contenido (IMAGE_SAFETY) sin decir
	// qué parte le molestó. Antes eso daba la generación por perdida; ahora se
	// reintenta una vez con el prompt limpio de las palabras que más lo disparan.
	const softenPrompt = (prompt: string) => prompt
		.replace(/(hard failure|hard error|CRITICAL|must NOT|NEVER|forbidden)/gi, 'please avoid')
		.replace(/(underwear|bralette|lingerie|bare|nude|skin|body)/gi, 'garment')
		.replace(/(kill|destroy|attack)\w*/gi, 'address');

	// Motor único: gpt-image-2 en calidad media.
	// Medido contra Gemini con el mismo prompt y las mismas entradas: escribe bien
	// el texto chico de las etiquetas de forma consistente (Gemini alternaba
	// "PORN PINK" por "PDRN PINK" y repetía palabras del titular) y cuesta apenas
	// 12% más (USD 0.078 contra 0.067 por imagen). Lo que se paga es tiempo:
	// ~40-60s por imagen contra ~10s. Con 5 en paralelo no hay límite de tasa.
	if (input.openAIKey) {
		const model = process.env.OPENAI_IMAGE_MODEL || import.meta.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
		const sizeMap = model === 'gpt-image-1' ? legacyOpenAISizes : openAISizes;
		try {
			const buffer = await generateWithOpenAI({
				apiKey: input.openAIKey,
				model,
				prompt: input.prompt,
				images,
				size: sizeMap[input.format] || '1024x1024',
				openAIQuality: 'medium',
			});
			if (buffer.length > 1024) return { buffer, engine: `${model} (medium)` };
			failures.push(`${model}: respuesta vacía`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[image-engines] ${model} falló, se cae a Gemini:`, message);
			failures.push(`${model}: ${message}`);
		}
	}

	// Respaldo: si OpenAI falla o se cae, Gemini salva la generación en ~10s.
	if (input.googleKey) {
		// Medido sobre el mismo prompt/referencia/producto (jul-2026):
		//   flash-lite  7.7s  $0.034/img  OK en layouts simples, pero en un
		//               testimonial con persona + logo + etiqueta dejó el logo de
		//               la marca del ganador en el anuncio, repitió una palabra del
		//               titular y volvió ilegible la etiqueta. Descartado como
		//               primario: poner una marca ajena en el anuncio de un cliente
		//               es peor que ahorrar la mitad del costo.
		//   flash      10.3s  $0.067/img  el más consistente en los casos difíciles.
		//   pro        22.5s  $0.134/img  más fotorrealista pero DEGRADA el texto
		//                                 chico de la etiqueta ("PDRR NIACINAMIOE").
		const preferred = process.env.GEMINI_IMAGE_MODEL || import.meta.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
		const models = [...new Set([preferred, 'gemini-3-pro-image'])];
		for (const model of models) {
			for (const attempt of ['original', 'soften'] as const) {
				try {
					const buffer = await generateWithGemini({
						apiKey: input.googleKey,
						model,
						prompt: attempt === 'soften' ? softenPrompt(input.prompt) : input.prompt,
						images,
						aspectRatio: geminiAspectRatios[input.format] || '1:1',
					});
					if (buffer.length > 1024) return { buffer, engine: attempt === 'soften' ? `${model} (reintento)` : model };
					failures.push(`${model}: respuesta vacía`);
					break;
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					failures.push(`${model}${attempt === 'soften' ? ' (reintento)' : ''}: ${message}`);
					// Solo tiene sentido reintentar si fue el filtro de contenido.
					if (attempt === 'original' && /IMAGE_SAFETY|PROHIBITED_CONTENT|SAFETY/i.test(message)) continue;
					break;
				}
			}
		}
	}

	throw new Error(failures.length ? failures.join(' | ') : 'No hay ningún motor de imagen configurado.');
}
