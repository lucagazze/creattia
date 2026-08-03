export type AdaptedAdCopy = {
	primaryText: string;
	headline: string;
	description: string;
	cta: string;
};

const LIMITS = {
	primaryText: 700,
	headline: 60,
	description: 90,
	cta: 30,
} as const;

const WEB_REFERENCE = /(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,24}(?:\/\S*)?/gi;

export function stripWebReferences(value: unknown) {
	return String(value || '')
		.replace(WEB_REFERENCE, '')
		.replace(/\s+([,.;:!?])/g, '$1')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

export function normalizeDisplayWebsite(value: unknown) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	try {
		const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
		return parsed.hostname.replace(/^www\./i, '').toLowerCase().slice(0, 80);
	} catch {
		return '';
	}
}

function clean(value: unknown, max: number) {
	return stripWebReferences(value)
		.slice(0, max);
}

export function fallbackAdCopy(input: {
	productName?: string;
	productFacts?: string;
	brandName?: string;
	benefit?: string;
	cta?: string;
}): AdaptedAdCopy {
	const productName = clean(input.productName, 100) || 'este producto';
	const brandName = clean(input.brandName, 80);
	const benefit = clean(input.benefit || input.productFacts, 220) || 'Una alternativa pensada para hacerte las cosas más simples.';
	const cta = clean(input.cta, LIMITS.cta) || 'Conocelo ahora';
	const intro = brandName ? `${brandName} presenta ${productName}.` : `Conocé ${productName}.`;
	return {
		primaryText: clean(`${intro} ${benefit} ${cta}.`, LIMITS.primaryText),
		headline: clean(`${productName}: conocé la diferencia`, LIMITS.headline),
		description: clean(benefit, LIMITS.description),
		cta,
	};
}

export function normalizeAdCopy(value: unknown, fallbackInput: Parameters<typeof fallbackAdCopy>[0] = {}): AdaptedAdCopy {
	const fallback = fallbackAdCopy(fallbackInput);
	const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
	return {
		primaryText: clean(source.primaryText, LIMITS.primaryText) || fallback.primaryText,
		headline: clean(source.headline, LIMITS.headline) || fallback.headline,
		description: clean(source.description, LIMITS.description) || fallback.description,
		cta: clean(source.cta, LIMITS.cta) || fallback.cta,
	};
}

export function adCopyToText(copy: AdaptedAdCopy) {
	return [
		copy.primaryText,
		copy.headline && `Título: ${copy.headline}`,
		copy.description && `Descripción: ${copy.description}`,
		copy.cta && `CTA: ${copy.cta}`,
	].filter(Boolean).join('\n\n');
}
