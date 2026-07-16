import type { APIRoute } from 'astro';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;
export const maxDuration = 30;

function clean(value: any, max = 1000) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);
	
	const openAIKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
	const googleKey = import.meta.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
	if (!openAIKey && !googleKey) return json({ error: 'Falta configurar las API keys de IA.' }, 503);

	try {
		const body = await request.json();
		const original = clean(body.original, 500);
		const current = clean(body.current, 500);
		const messageRole = clean(body.messageRole, 500);
		const productName = clean(body.productName, 200);
		const productFacts = clean(body.productFacts, 1500);
		const extra = clean(body.extra, 500);
		const language = clean(body.language, 10) || 'es';

		const systemPrompt = `You are a senior ad copywriter. The user wants to rewrite a specific ad copy zone of a performance creative.
You are given:
- Original text from the template: "${original}"
- Persuasive role of this text: "${messageRole}"
- Target product name: "${productName}"
- Product facts: "${productFacts}"
- Extra indications/style from the user: "${extra}"
- Current suggestion: "${current}"

Write a fresh, highly persuasive alternative copy for the target product that performs the SAME persuasive role.
Ensure the text is in the requested language (language code: "${language}").
Keep it similar length (or shorter) so it fits in the layout.
Do NOT output any markdown, HTML, quotes, intro, or explanation. Output ONLY the raw alternative copy.`;

		let text = '';
		if (googleKey) {
			const model = import.meta.env.GEMINI_ANALYSIS_MODEL || process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					contents: [{ parts: [{ text: systemPrompt }] }]
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
				text = data.candidates[0].content.parts[0].text.trim();
			}
		}

		if (!text && openAIKey) {
			const OpenAI = (await import('openai')).default;
			const openai = new OpenAI({ apiKey: openAIKey });
			const model = import.meta.env.OPENAI_ANALYSIS_MODEL || process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o-mini';
			const response = await openai.chat.completions.create({
				model,
				messages: [
					{ role: 'system', content: systemPrompt },
				],
			});
			text = response.choices[0]?.message?.content?.trim() || '';
		}

		// Remove leading/trailing quotes if the model wrapped it
		if (text.startsWith('"') && text.endsWith('"')) {
			text = text.slice(1, -1).trim();
		}
		if (text.startsWith('“') && text.endsWith('”')) {
			text = text.slice(1, -1).trim();
		}

		return json({ replacement: text || current });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Error al reescribir.' }, 500);
	}
};
