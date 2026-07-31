import type { LayoutAnalysis } from './ad-analysis';

/**
 * Decide con qué nivel de calidad generar cada anuncio.
 *
 * Medido con gpt-image-2 sobre el mismo prompt (jul-2026):
 *   low     26s   USD 0.031-0.039
 *   medium  60s   USD 0.078-0.086
 *   high   180s   USD 0.236
 *
 * `low` da resultados publicables — texto legible, iconos limpios, producto
 * realista — SALVO cuando hay que escribir letra chica. Ahí degrada de forma
 * característica: el nombre del producto salió "PORN PINK NIACINAMIDE" en vez de
 * "PDRN", y los badges con porcentajes quedaron con palabras inventadas.
 *
 * Por eso el criterio no es "simple contra complejo" sino si el anuncio depende
 * de texto crítico. Y eso ya lo sabemos antes de generar: el análisis enumera
 * cada zona de texto y si el producto tiene envase impreso. No hace falta un
 * modelo extra para clasificar.
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

// Un texto que trae un número, un porcentaje o un precio no admite errores: si
// el modelo se come un dígito, el anuncio miente.
const HAS_FIGURE = /\d|%|\$|€|USD|ARS/i;

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
	// Sin análisis no se puede saber qué hay en juego: se va a lo seguro.
	if (!analysis || !analysis.textZones?.length) {
		return { tier: 'medium', reason: 'sin análisis previo, se usa el nivel seguro', estimatedCost: COST.medium };
	}

	const zones = analysis.textZones;

	// 1. Texto impreso sobre el envase del propio producto. Es el caso que
	// rompe: el nombre del producto tiene que salir letra por letra.
	if (analysis.productHasPackaging && zones.some((zone) => zone.onProduct)) {
		return { tier: 'medium', reason: 'el producto tiene texto impreso en el envase', estimatedCost: COST.medium };
	}

	// 2. Cifras: precios, porcentajes, medidas, cantidades de reseñas.
	const withFigures = zones.filter((zone) => HAS_FIGURE.test(zone.replacement || ''));
	if (withFigures.length) {
		return { tier: 'medium', reason: `${withFigures.length} zona(s) con cifras que no pueden salir mal`, estimatedCost: COST.medium };
	}

	// 3. Muchos bloques de texto: cuanto más texto, más chico y más fácil de
	// arruinar. Seis o más ya es una placa densa.
	if (zones.length >= 6) {
		return { tier: 'medium', reason: `${zones.length} bloques de texto, demasiado denso para el nivel bajo`, estimatedCost: COST.medium };
	}

	// 4. Textos largos: un párrafo en cuerpo chico también degrada.
	const longest = Math.max(...zones.map((zone) => (zone.replacement || '').length));
	if (longest > 160) {
		return { tier: 'medium', reason: 'hay un bloque de texto largo en cuerpo chico', estimatedCost: COST.medium };
	}

	return {
		tier: 'low',
		reason: `${zones.length} bloques de texto simples, sin cifras ni etiqueta impresa`,
		estimatedCost: COST.low,
	};
}
