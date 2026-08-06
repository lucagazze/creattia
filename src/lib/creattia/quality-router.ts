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
 * Por defecto TODAS las imágenes salen en 'high'.
 *
 * En 'medium' el texto sale con bordes blandos y el modelo agrega sombras y
 * halos que ensucian la tipografía: es lo que delata que un anuncio lo hizo una
 * IA. 'high' es el nivel donde las letras salen con filo de vector.
 *
 * Se paga en tiempo: ~180s por imagen contra ~60s. Entra en el maxDuration de
 * 300s de las funciones, pero deja menos margen; si una generación se pasa, el
 * barrido de colgadas la cierra y devuelve el crédito.
 *
 * El nivel no es elegible por el usuario: una imagen cuesta siempre 1 crédito.
 * Para mover el nivel de TODA la app está IMAGE_QUALITY_TIER (low|medium|high|auto),
 * y para forzar una generación puntual, `forceTier` en el snapshot.
 */
function configuredTier(): QualityTier | 'auto' {
	const raw = (process.env.IMAGE_QUALITY_TIER || import.meta.env.IMAGE_QUALITY_TIER || 'high').toLowerCase();
	return raw === 'auto' || raw === 'low' || raw === 'medium' || raw === 'high' ? raw : 'high';
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
		tier: 'high',
		reason: analysis ? 'análisis visual listo, se prioriza tipografía limpia' : 'sin análisis previo, se usa el nivel más alto',
		estimatedCost: COST.high,
	};
}
