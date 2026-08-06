import type { LayoutAnalysis } from './ad-analysis';

/**
 * Decide con qué nivel de calidad generar cada anuncio.
 *
 * Medido con gpt-image-2 sobre el mismo prompt (jul-2026):
 *   low     26s   USD 0.031-0.039
 *   medium  60s   USD 0.078-0.086
 *   high   180s   USD 0.236
 *
 * La app genera imágenes estáticas sin copy publicitario añadido. El nivel
 * configurable sigue existiendo para priorizar calidad visual en cada cuenta.
 */
export type QualityTier = 'low' | 'medium' | 'high';

export type TierDecision = {
	tier: QualityTier;
	/** Por qué se eligió, para poder auditarlo desde el historial. */
	reason: string;
	/** Costo estimado en USD, con los valores medidos. */
	estimatedCost: number;
};

// Medidos a 1024. A 1536 (el tamaño que se pide ahora) suben con la cantidad de
// píxeles; `npm run compare-quality` mide el costo real de cada variante.
const COST: Record<QualityTier, number> = { low: 0.035, medium: 0.082, high: 0.236 };

/**
 * Por defecto TODAS las imágenes salen en 'medium'.
 *
 * Contra la falta de nitidez del texto se probó primero subir a 'high', pero
 * cuesta 3x y tarda 3x (180s contra 60s) para un problema que era de píxeles:
 * las imágenes salían a 1024. Se ataca por resolución (ver formats.ts, ahora
 * 1536) y con la regla que prohíbe sombras y halos en el texto, las dos mucho
 * más baratas. 'high' queda disponible con IMAGE_QUALITY_TIER si hiciera falta.
 *
 * El nivel no es elegible por el usuario: una imagen cuesta siempre 1 crédito.
 * Para mover el nivel de TODA la app está IMAGE_QUALITY_TIER (low|medium|high|auto),
 * y para forzar una generación puntual, `forceTier` en el snapshot.
 */
function configuredTier(): QualityTier | 'auto' {
	const raw = (process.env.IMAGE_QUALITY_TIER || import.meta.env.IMAGE_QUALITY_TIER || 'medium').toLowerCase();
	return raw === 'auto' || raw === 'low' || raw === 'medium' || raw === 'high' ? raw : 'medium';
}

export function pickQualityTier(analysis: LayoutAnalysis | null, options?: { force?: QualityTier }): TierDecision {
	if (options?.force) {
		return { tier: options.force, reason: 'elegido a mano', estimatedCost: COST[options.force] };
	}
	const configured = configuredTier();
	if (configured !== 'auto') {
		return { tier: configured, reason: `nivel fijo ${configured}`, estimatedCost: COST[configured] };
	}
	return {
		tier: 'medium',
		reason: analysis ? 'análisis visual listo para imagen estática' : 'sin análisis previo, se usa el nivel seguro',
		estimatedCost: COST.medium,
	};
}
