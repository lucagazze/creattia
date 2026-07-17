import type { APIRoute } from 'astro';
import { authenticateRequest, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 60;

// Extrae texto de PDF / Word / Excel (y las imágenes embebidas si hay), y destila
// con IA el nombre + descripción del producto para precargar la carga manual.

async function extractPdf(buf: Buffer): Promise<string> {
	const { extractText, getDocumentProxy } = await import('unpdf');
	const doc = await getDocumentProxy(new Uint8Array(buf));
	const { text } = await extractText(doc, { mergePages: true });
	return Array.isArray(text) ? text.join('\n') : String(text || '');
}

async function extractDocx(buf: Buffer): Promise<{ text: string; images: string[] }> {
	const mammoth = (await import('mammoth')).default || (await import('mammoth'));
	const images: string[] = [];
	const raw = await (mammoth as any).extractRawText({ buffer: buf });
	try {
		await (mammoth as any).convertToHtml({ buffer: buf }, {
			convertImage: (mammoth as any).images.imgElement(async (image: any) => {
				if (images.length < 4) {
					const b64 = await image.read('base64');
					images.push(`data:${image.contentType};base64,${b64}`);
				}
				return {};
			}),
		});
	} catch { /* sin imágenes */ }
	return { text: raw.value || '', images };
}

async function extractXlsx(buf: Buffer): Promise<string> {
	const XLSX = await import('xlsx');
	const wb = XLSX.read(buf, { type: 'buffer' });
	return wb.SheetNames.map((name) => `# ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`).join('\n\n').slice(0, 20000);
}

// Destila {name, facts} del texto con Gemini flash.
async function distill(text: string, googleKey: string): Promise<{ name: string; facts: string } | null> {
	if (!googleKey || !text.trim()) return null;
	try {
		const prompt = `Del siguiente documento, extraé el PRODUCTO o SERVICIO principal para una publicidad. Devolvé SOLO JSON: {"name":"nombre corto del producto/servicio","facts":"beneficios, características, precio y datos verificables en 1-3 frases (español), sin inventar nada que no esté en el texto"}.\n\nDOCUMENTO:\n${text.slice(0, 12000)}`;
		const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${googleKey}`, {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
		});
		const data: any = await res.json().catch(() => ({}));
		const raw = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
		const parsed = JSON.parse(raw);
		if (parsed?.name || parsed?.facts) return { name: String(parsed.name || '').slice(0, 180), facts: String(parsed.facts || '').slice(0, 1200) };
	} catch { /* cae al fallback */ }
	return null;
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	const googleKey = import.meta.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';

	try {
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) return json({ error: 'Subí un archivo.' }, 400);
		if (file.size > 20 * 1024 * 1024) return json({ error: 'El archivo supera los 20 MB.' }, 413);

		const buf = Buffer.from(await file.arrayBuffer());
		const name = (file.name || '').toLowerCase();
		const type = file.type || '';
		let text = '';
		let images: string[] = [];

		if (type.includes('pdf') || name.endsWith('.pdf')) {
			text = await extractPdf(buf);
		} else if (type.includes('word') || type.includes('officedocument.wordprocessing') || name.endsWith('.docx')) {
			const r = await extractDocx(buf);
			text = r.text; images = r.images;
		} else if (type.includes('sheet') || type.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
			text = await extractXlsx(buf);
		} else {
			return json({ error: 'Formato no soportado. Usá PDF, Word (.docx) o Excel (.xlsx/.csv).' }, 415);
		}

		text = text.replace(/\s+\n/g, '\n').trim();
		if (!text && !images.length) return json({ error: 'No pudimos leer contenido de ese archivo.' }, 422);

		const distilled = await distill(text, googleKey);
		const productName = distilled?.name || (file.name || '').replace(/\.[^.]+$/, '').slice(0, 120);
		const productFacts = distilled?.facts || text.slice(0, 1200);

		return json({ name: productName, facts: productFacts, images });
	} catch (error) {
		console.error('parse-doc error:', error);
		return json({ error: 'No pudimos analizar el archivo.' }, 500);
	}
};
