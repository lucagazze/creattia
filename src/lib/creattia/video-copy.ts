const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>{}\[\]"']+/gi;
const INSTRUCTION_PATTERN = /^(?:nombrar|mencionar|explicar|decir|aclarar|mostrar|cerrar\s+con|adaptar|incluir)\b/i;

function titleFromSlug(value: string) {
	return decodeURIComponent(value)
		.replace(/\.[a-z0-9]{2,5}$/i, '')
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, (letter) => letter.toUpperCase())
		.trim();
}

export function stripVideoUrls(value: unknown) {
	return String(value || '')
		.replace(URL_PATTERN, '')
		.replace(/\s+([,.;:!?])/g, '$1')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

export function normalizeVideoProductName(value: unknown, fallback = 'el producto') {
	const raw = String(value || '').trim();
	const match = raw.match(URL_PATTERN)?.[0];
	if (match) {
		try {
			const parsed = new URL(match.startsWith('www.') ? `https://${match}` : match);
			const segments = parsed.pathname.split('/').filter(Boolean);
			const productIndex = segments.findIndex((segment) => /^(?:products?|productos?)$/i.test(segment));
			const slug = productIndex >= 0 ? segments[productIndex + 1] : segments.at(-1);
			const inferred = slug ? titleFromSlug(slug) : '';
			if (inferred && !/^(?:index|home|inicio)$/i.test(inferred)) return inferred.slice(0, 120);
		} catch { /* se usa el texto limpio */ }
	}
	const cleaned = stripVideoUrls(raw)
		.replace(/^[\s|·:;,.-]+|[\s|·:;,.-]+$/g, '')
		.slice(0, 120);
	if (!cleaned || /^(?:https?|www)\b/i.test(cleaned)) return fallback;
	return cleaned;
}

export function sanitizeSpokenVideoText(value: unknown, max = 320) {
	return stripVideoUrls(value)
		.replace(/[<>\[\]{}]/g, '')
		.replace(/\s{2,}/g, ' ')
		.trim()
		.slice(0, max);
}

function limitedWords(value: string, maximum: number) {
	const words = value.split(/\s+/).filter(Boolean);
	if (words.length <= maximum) return value;
	return `${words.slice(0, maximum).join(' ').replace(/[,;:]$/, '')}.`;
}

export function naturalFallbackDialogue(input: {
	productName: string;
	benefit?: string;
	cta?: string;
	duration: string | number;
}) {
	const productName = normalizeVideoProductName(input.productName);
	const benefit = sanitizeSpokenVideoText(input.benefit, 180).replace(/[.!?]+$/, '');
	const cta = sanitizeSpokenVideoText(input.cta, 80).replace(/[.!?]+$/, '') || 'Conocelo hoy';
	const maxWords = Math.max(7, Math.floor(Math.max(4, Number(input.duration) || 8) * 2.15));
	const intro = `Conocé ${productName}.`;
	const ending = `${cta}.`;
	const reserved = intro.split(/\s+/).length + ending.split(/\s+/).length;
	const middle = benefit && !INSTRUCTION_PATTERN.test(benefit)
		? limitedWords(benefit, Math.max(3, maxWords - reserved))
		: 'Una opción simple y confiable para todos los días.';
	return limitedWords(`${intro} ${middle} ${ending}`.replace(/\s+/g, ' ').trim(), maxWords);
}

export function sanitizeDialogueLine(value: unknown, fallback: string) {
	const cleaned = sanitizeSpokenVideoText(value);
	if (!cleaned || INSTRUCTION_PATTERN.test(cleaned) || /\b(?:https?|www|\.com\b)/i.test(cleaned)) return fallback;
	return cleaned;
}
