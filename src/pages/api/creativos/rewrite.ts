import type { APIRoute } from 'astro';
import { authenticateRequest, checkRateLimit, getAdminClient, json } from '../../../lib/creattia/server';
import { stripWebReferences } from '../../../lib/creattia/ad-copy';

export const prerender = false;
export const maxDuration = 30;

function clean(value: unknown, max = 1000) {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);

	const openAIKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
	const googleKey = import.meta.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
	if (!openAIKey && !googleKey) return json({ error: 'Falta configurar las API keys de IA.' }, 503);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);
	const withinLimit = await checkRateLimit(admin, auth.user.id, 'rewrite-copy', 60, 3600);
	if (!withinLimit) return json({ error: 'Rehiciste muchos textos en poco tiempo. Esperá un rato y volvé a intentar.' }, 429);

	try {
		const body = await request.json();
		const original = clean(body.original, 500);
		const current = clean(body.current, 500);
		const messageRole = clean(body.messageRole, 500);
		const productName = clean(body.productName, 200);
		const productFacts = clean(body.productFacts, 1500);
		const extra = clean(body.extra, 500);
		const language = clean(body.language, 10) || 'es';

		const systemPrompt = `You are a senior ad copywriter. Rewrite one visible text zone from a winning ad for the target product.
Original text: "${original}"
Persuasive role: "${messageRole}"
Target product: "${productName}"
Verified product facts: "${productFacts}"
Extra direction: "${extra}"
Current suggestion: "${current}"

Write a fresh, persuasive alternative that performs the same persuasive role, in the requested language (code: ${language}). Keep it similar in length or shorter so it fits the original layout. Do not invent prices, discounts, guarantees, reviews, certifications or URLs. Output only the raw replacement text, with no markdown, quotes or explanation.`;

		let text = '';
		if (googleKey) {
			const model = import.meta.env.GEMINI_ANALYSIS_MODEL || process.env.GEMINI_ANALYSIS_MODEL || 'gemini-2.5-flash';
			const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] }),
			});
			const data = await response.json().catch(() => ({}));
			if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) text = data.candidates[0].content.parts[0].text.trim();
		}

		if (!text && openAIKey) {
			const OpenAI = (await import('openai')).default;
			const openai = new OpenAI({ apiKey: openAIKey });
			const model = import.meta.env.OPENAI_ANALYSIS_MODEL || process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o-mini';
			const response = await openai.chat.completions.create({ model, messages: [{ role: 'system', content: systemPrompt }] });
			text = response.choices[0]?.message?.content?.trim() || '';
		}

		if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”'))) text = text.slice(1, -1).trim();
		return json({ replacement: stripWebReferences(text || current) });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : 'Error al reescribir.' }, 500);
	}
};
