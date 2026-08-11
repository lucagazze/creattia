import OpenAI, { toFile } from 'openai';
import { formatSizes } from './formats';

// Motores de imagen reales, en el mismo orden que usa el Studio (generate.ts):
// 1) Gemini image (nano-banana) — rápido, barato y el mejor con texto en la imagen.
// 2) OpenAI gpt-image (OPENAI_IMAGE_MODEL) — fallback con las fotos reales como input.
// No hay tercer motor a propósito: un generador genérico devuelve arte que no es
// un anuncio y ensucia el historial con imágenes que el usuario no puede usar.

export type EngineImage = { buffer: Buffer; type: string };

/**
 * Lo que consumió una generación, en tokens.
 *
 * No se guardaba nada, así que la pregunta "¿cuánto me cuesta una imagen?" solo
 * se podía responder mirando el panel de OpenAI, y nunca por creativo. Con esto
 * cada generación deja su consumo real: los tokens de salida escalan con los
 * píxeles y son la diferencia entre una imagen a 1024 y la misma a 1536.
 */
export type EngineUsage = { entrada: number; salida: number; entradaImagen: number; entradaTexto: number };

const geminiAspectRatios: Record<string, string> = {
	'1:1': '1:1', '3:4': '3:4', '9:16': '9:16', '4:3': '4:3', '16:9': '16:9',
	square: '1:1', portrait: '3:4', story: '9:16', landscape: '4:3',
};

// gpt-image-2 acepta cualquier tamaño divisible por 16, así que da los ratios
// exactos. Antes acá estaba el mapa viejo de gpt-image-1, que solo tiene tres
// tamaños: un Story 9:16 terminaba saliendo en 2:3, bastante menos alto.
/**
 * Los tamaños salen de formats.ts, que es la fuente única.
 *
 * Acá vivía una copia con el cuadrado en 1024x1024. Cuando se subió la
 * resolución a 1536 se tocó formats.ts, pero ese archivo nunca le pasa el tamaño
 * al motor —solo se usa para validar el formato pedido—, así que esta copia
 * seguía mandando. El resultado: TODOS los anuncios cuadrados, que son la
 * mayoría, se seguían generando con la mitad de píxeles por letra. Es
 * exactamente el "se ve un poco borroso, como hecho con IA" que se reportaba.
 */
const openAISizes: Record<string, string> = formatSizes;

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
}): Promise<{ buffer: Buffer; usage?: EngineUsage }> {
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
		return { buffer: Buffer.from(b64, 'base64'), usage: leerConsumo(result) };
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
	return { buffer: Buffer.from(b64, 'base64'), usage: leerConsumo(result) };
}

/**
 * Lo que consumió la generación, tal como lo informa la API.
 *
 * Venía en cada respuesta y se descartaba, así que no había forma de responder
 * cuánto cuesta una imagen sin ir al panel de OpenAI. Los tokens de salida son
 * los que mandan: escalan con los píxeles, y son la diferencia entre una imagen
 * a 1024 y la misma a 1536.
 */
function leerConsumo(resultado: any): EngineUsage | undefined {
	const uso = resultado?.usage;
	if (!uso) return undefined;
	return {
		entrada: Number(uso.input_tokens) || 0,
		salida: Number(uso.output_tokens) || 0,
		entradaImagen: Number(uso.input_tokens_details?.image_tokens) || 0,
		entradaTexto: Number(uso.input_tokens_details?.text_tokens) || 0,
	};
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
	/**
	 * Prompt de respaldo para cuando OpenAI rechaza el pedido por su filtro.
	 *
	 * El rechazo es del pedido ENTERO —400, sin imagen— y no depende de lo que se
	 * vaya a dibujar sino de lo que el prompt describe: con ropa interior alcanza
	 * una línea sobre una persona para que no genere nada. Reintentar con la misma
	 * cosa no sirve; hay que mandarle menos.
	 */
	promptDeRespaldo?: string;
	images?: EngineImage[];
	format: string;
	/** Nivel de calidad de gpt-image-2. Lo decide quality-router.ts. */
	tier?: 'low' | 'medium' | 'high';
}): Promise<{ buffer: Buffer; engine: string; usage?: EngineUsage }> {
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
			const { buffer, usage } = await generateWithOpenAI({
				apiKey: input.openAIKey,
				model,
				prompt: input.prompt,
				images,
				size: sizeMap[input.format] || '1024x1024',
				openAIQuality: input.tier || 'medium',
			});
			if (buffer.length > 1024) return { buffer, engine: `${model} (${input.tier || 'medium'})`, usage };
			failures.push(`${model}: respuesta vacía`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			failures.push(`${model}: ${message}`);
			/**
			 * Un rechazo del filtro no es un fallo del motor: el motor anda y se negó
			 * a leer ESTE pedido.
			 *
			 * Y no es determinístico: el mismo prompt con la misma referencia pasa una
			 * vez y se rechaza la siguiente. Se comprobó quitando una por una las
			 * líneas sospechosas —el ICP, el párrafo de las personas, la categoría, la
			 * descripción del producto— y las seis variantes se rechazaron igual,
			 * incluida la que ya había pasado minutos antes. No hay línea culpable:
			 * hay un clasificador con varianza.
			 *
			 * Por eso se reintenta lo MISMO antes de recortar nada. Y sale casi
			 * gratis: un rechazo devuelve 400 sin imagen, así que no se cobra como
			 * generación. Recién si eso tampoco pasa se manda la versión sin el ICP ni
			 * las indicaciones, y recién después se cambia de motor —Gemini queda
			 * último porque escribe peor el texto chico.
			 */
			const esFiltro = /safety|moderation|content[_ ]policy/i.test(message);
			if (esFiltro) {
				const reintentos = [
					{ prompt: input.prompt, etiqueta: 'el mismo prompt' },
					...(input.promptDeRespaldo && input.promptDeRespaldo !== input.prompt
						? [{ prompt: input.promptDeRespaldo, etiqueta: 'sin el ICP ni las indicaciones' }]
						: []),
				];
				for (const [indice, intento] of reintentos.entries()) {
					console.warn(`[image-engines] ${model} rechazó el pedido por su filtro, se reintenta con ${intento.etiqueta}`);
					try {
						const otra = await generateWithOpenAI({
							apiKey: input.openAIKey,
							model,
							prompt: intento.prompt,
							images,
							size: sizeMap[input.format] || '1024x1024',
							openAIQuality: input.tier || 'medium',
						});
						if (otra.buffer.length > 1024) {
							return { buffer: otra.buffer, engine: `${model} (${input.tier || 'medium'}, reintento ${indice + 1})`, usage: otra.usage };
						}
					} catch (otroError) {
						const mensaje = otroError instanceof Error ? otroError.message : String(otroError);
						failures.push(`${model} (reintento ${indice + 1}): ${mensaje}`);
						// Un error que NO es del filtro no se reintenta: es del motor o de
						// la red, y volver a mandar lo mismo no lo va a arreglar.
						if (!/safety|moderation|content[_ ]policy/i.test(mensaje)) break;
					}
				}
				console.error(`[image-engines] ${model} rechazó todos los intentos, se cae a Gemini`);
			} else {
				console.error(`[image-engines] ${model} falló, se cae a Gemini:`, message);
			}
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
