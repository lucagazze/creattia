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

const COST: Record<QualityTier, number> = { low: 0.035, medium: 0.082, high: 0.236 };

/**
 * Por defecto TODAS las imágenes salen en 'medium'.
 *
 * El ruteo automático ahorraba entre 14% y 29%, pero 'low' degrada justo donde
 * más se nota — la letra chica de las etiquetas — y no vale la pena arriesgar la
 * calidad de un anuncio por unos centavos. Se prioriza que todas salgan bien.
 *
 * Para volver al ruteo automático alcanza con poner IMAGE_QUALITY_TIER=auto.
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
