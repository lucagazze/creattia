/**
 * De dónde vino cada persona.
 *
 * Las campañas ya llevan UTMs en los enlaces, pero nadie las leía: llegaban en
 * la URL, se perdían en la primera navegación y la app no guardaba nada. Se
 * podía saber cuánta gente entró y cuánta se registró, y no de qué anuncio.
 *
 * Se guarda el PRIMER toque y no el último. Quien llega por un anuncio, se va,
 * y vuelve tipeando la dirección, vino igual por ese anuncio: pisar el origen
 * con la visita directa es como una campaña que funciona termina figurando sin
 * una sola alta.
 */

const CLAVE = 'creattia:origen';

/** Los campos que se leen de la URL. `fbclid` lo agrega Facebook solo. */
const CAMPOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'] as const;

export type Origen = Partial<Record<(typeof CAMPOS)[number], string>> & { guardadoEn?: number; landing?: string };

function almacen(): Storage | null {
	try {
		return typeof window !== 'undefined' ? window.localStorage : null;
	} catch {
		// Cookies bloqueadas: se sigue sin origen antes que romper la pantalla.
		return null;
	}
}

/**
 * Lee la URL, guarda lo que traiga y devuelve el origen vigente.
 *
 * Se llama en cada carga. Si la URL no trae nada, no pisa lo guardado: es
 * justamente el caso de alguien que vuelve directo después de haber llegado por
 * un anuncio.
 */
export function capturarOrigen(): Origen | null {
	const store = almacen();
	if (typeof window === 'undefined') return null;
	let guardado: Origen | null = null;
	try {
		const crudo = store?.getItem(CLAVE);
		if (crudo) guardado = JSON.parse(crudo) as Origen;
	} catch {
		guardado = null;
	}

	const params = new URLSearchParams(window.location.search);
	const nuevo: Origen = {};
	for (const campo of CAMPOS) {
		const valor = params.get(campo);
		// Se acota: un parámetro larguísimo en la URL no puede engordar cada
		// evento que se escriba después.
		if (valor) nuevo[campo] = valor.trim().slice(0, 120);
	}

	if (!Object.keys(nuevo).length) return guardado;
	// Ya había un primer toque: se respeta.
	if (guardado && Object.keys(guardado).some((k) => k !== 'guardadoEn' && k !== 'landing')) return guardado;

	nuevo.guardadoEn = Date.now();
	nuevo.landing = window.location.pathname.slice(0, 60);
	try {
		store?.setItem(CLAVE, JSON.stringify(nuevo));
	} catch {
		// Sin lugar para guardarlo: igual se devuelve para el evento de esta carga.
	}
	return nuevo;
}

/** El origen guardado, sin volver a mirar la URL. */
export function leerOrigen(): Origen | null {
	try {
		const crudo = almacen()?.getItem(CLAVE);
		return crudo ? (JSON.parse(crudo) as Origen) : null;
	} catch {
		return null;
	}
}

/**
 * El origen en una línea, para leerlo de un vistazo en el panel.
 *
 * "facebook · cpc · retargeting-bajos" dice más que cinco columnas con la mitad
 * vacías, que es como se ven casi todas las campañas reales.
 */
export function origenEnUnaLinea(origen: Origen | null | undefined): string {
	if (!origen) return '';
	const partes = [origen.utm_source, origen.utm_medium, origen.utm_campaign, origen.utm_content].filter(Boolean);
	if (partes.length) return partes.join(' · ');
	// Sin UTMs pero con fbclid: vino de Meta igual, solo que sin etiquetar.
	return origen.fbclid ? 'Meta (sin UTM)' : '';
}

/** Solo los campos de origen, listos para viajar dentro de un evento. */
export function origenParaEvento(origen: Origen | null | undefined): Record<string, string> {
	const limpio: Record<string, string> = {};
	if (!origen) return limpio;
	for (const campo of CAMPOS) {
		const valor = origen[campo];
		if (valor) limpio[campo] = valor;
	}
	return limpio;
}
