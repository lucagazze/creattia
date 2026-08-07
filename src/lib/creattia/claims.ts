/**
 * Cifras que el anunciante no puede respaldar.
 *
 * Clonando un anuncio de Intercom que prometía "resolvé el 50% de las consultas"
 * el sistema devolvió "incrementá 50% tu facturación en solo 90 días" para una
 * agencia de Meta Ads. Ni el 50% ni los 90 días existían en ningún lado: el
 * análisis los tomó prestados del ganador porque el mecanismo de persuasión del
 * anuncio ES el número, y al adaptarlo lo arrastró.
 *
 * El prompt ya lo prohibía en dos lugares y aun así pasó. Una instrucción es una
 * sugerencia fuerte; esto no puede depender de que el modelo obedezca, porque lo
 * que sale es una promesa comercial escrita dentro de una imagen que el usuario
 * va a publicar con su marca.
 *
 * Acá no se decide qué es verdad: solo si el número que se va a imprimir aparece
 * en los datos verificados de la página del usuario. Si no aparece, no se escribe.
 */

/** Un número con su unidad, tal como se lee en el anuncio. */
export type CifraDetectada = { texto: string; digitos: string };

/**
 * Los números que constituyen una AFIRMACIÓN, no un dato neutro.
 *
 * Se persiguen porcentajes, plata, plazos, multiplicadores, puntajes y volúmenes
 * de reseñas o clientes. Deliberadamente NO se persigue cualquier dígito suelto:
 * "PS5", "2.0", "7-8oz" o "Talle 42" son identidad del producto, no promesas, y
 * tratarlos como sospechosos rompería nombres reales.
 */
const PATRONES: RegExp[] = [
	// 50%, 12,5 %
	/\d+(?:[.,]\d+)?\s*%/g,
	// $1.200, USD 99, 1.200 ARS
	/(?:[$€£]\s?\d[\d.,]*)|(?:\d[\d.,]*\s?(?:USD|ARS|EUR|dólares|pesos|euros))/gi,
	// 90 días, 3 meses, 24 horas
	/\d+\s*(?:d[ií]as?|semanas?|meses?|años?|horas?|minutos?|days?|weeks?|months?|years?|hours?|minutes?)\b/gi,
	// 3x, 2,5X
	/\d+(?:[.,]\d+)?\s*x\b/gi,
	// 4,8 estrellas · 4.9/5
	/\d[.,]\d\s*(?:estrellas|stars|\/\s*5)/gi,
	// +10.000 clientes, 2500 reseñas
	/\+?\s?\d[\d.,]{2,}\s*(?:rese[ñn]as|reviews|clientes|customers|usuarios|users|ventas|pedidos)/gi,
];

/** Solo los dígitos, para poder comparar "12.450" con "12450". */
const soloDigitos = (texto: string) => texto.replace(/\D/g, '');

/**
 * Los números presentes en un texto, normalizados.
 *
 * Se compara NÚMERO contra NÚMERO y no una cadena dentro de otra: buscar "3"
 * dentro de todos los dígitos de la página lo encuentra siempre —en un código
 * postal, en un gramaje, en un año— y así cualquier promesa quedaba avalada por
 * casualidad.
 */
const numerosDe = (texto: string): Set<string> => {
	const numeros = new Set<string>();
	for (const coincidencia of (texto || '').matchAll(/\d[\d.,]*/g)) {
		const digitos = soloDigitos(coincidencia[0]);
		if (digitos) numeros.add(digitos);
	}
	return numeros;
};

/**
 * Las cifras de `texto` que no aparecen en los datos verificados.
 *
 * Da igual que la página escriba "1.200" y el anuncio "$1200": es el mismo
 * número y está respaldado.
 */
export function cifrasSinRespaldo(texto: string | null | undefined, verificado: string): CifraDetectada[] {
	const contenido = (texto || '').trim();
	if (!contenido) return [];
	const respaldo = numerosDe(verificado || '');
	const encontradas: CifraDetectada[] = [];
	for (const patron of PATRONES) {
		// Los patrones son globales y se comparten entre llamadas: sin esto el
		// lastIndex de una búsqueda anterior hace que se saltee coincidencias.
		patron.lastIndex = 0;
		for (const coincidencia of contenido.matchAll(patron)) {
			const digitos = soloDigitos(coincidencia[0]);
			if (!digitos) continue;
			if (respaldo.has(digitos)) continue;
			if (encontradas.some((cifra) => cifra.texto === coincidencia[0])) continue;
			encontradas.push({ texto: coincidencia[0].trim(), digitos });
		}
	}
	return encontradas;
}

/** Todo lo que el usuario sí verificó: los hechos de su página, su marca y sus productos. */
export function textoVerificado(input: { productFacts?: string; productNames?: string[]; brandName?: string }): string {
	return [input.productFacts || '', (input.productNames || []).join(' '), input.brandName || ''].join(' ');
}
