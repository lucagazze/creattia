import OpenAI, { toFile } from 'openai';

// Motores de imagen reales, en el mismo orden que usa el Studio (generate.ts):
// 1) Gemini image (nano-banana) — rápido, barato y el mejor con texto en la imagen.
// 2) OpenAI gpt-image-1 — fallback con las fotos reales como input.
// No hay tercer motor a propósito: un generador genérico devuelve arte que no es
// un anuncio y ensucia el historial con imágenes que el usuario no puede usar.

export type EngineImage = { buffer: Buffer; type: string };

const geminiAspectRatios: Record<string, string> = {
	'1:1': '1:1', '3:4': '3:4', '9:16': '9:16', '4:3': '4:3', '16:9': '16:9',
	square: '1:1', portrait: '3:4', story: '9:16', landscape: '4:3',
};

// gpt-image-1 solo acepta estos tres tamaños.
const openAISizes: Record<string, string> = {
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
	prompt: string;
	images: EngineImage[];
	size: string;
}): Promise<Buffer> {
	const openai = new OpenAI({ apiKey: input.apiKey });
	const model = 'gpt-image-1';
	if (input.images.length) {
		const files = await Promise.all(input.images.map((image, index) =>
			toFile(image.buffer, `input-${index}.png`, { type: image.type || 'image/png' })));
		const result = await openai.images.edit({
			model,
			image: files as any,
			prompt: input.prompt,
			size: input.size as any,
			quality: 'high',
			input_fidelity: 'high',
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
		quality: 'high',
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

	if (input.googleKey) {
		const preferred = process.env.GEMINI_IMAGE_MODEL || import.meta.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
		const models = [...new Set([preferred, 'gemini-3-pro-image-preview'])];
		for (const model of models) {
			try {
				const buffer = await generateWithGemini({
					apiKey: input.googleKey,
					model,
					prompt: input.prompt,
					images,
					aspectRatio: geminiAspectRatios[input.format] || '1:1',
				});
				if (buffer.length > 1024) return { buffer, engine: model };
				failures.push(`${model}: respuesta vacía`);
			} catch (error) {
				failures.push(`${model}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	if (input.openAIKey) {
		try {
			const buffer = await generateWithOpenAI({
				apiKey: input.openAIKey,
				prompt: input.prompt,
				images,
				size: openAISizes[input.format] || '1024x1024',
			});
			if (buffer.length > 1024) return { buffer, engine: 'gpt-image-1' };
			failures.push('gpt-image-1: respuesta vacía');
		} catch (error) {
			failures.push(`gpt-image-1: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	throw new Error(failures.length ? failures.join(' | ') : 'No hay ningún motor de imagen configurado.');
}
