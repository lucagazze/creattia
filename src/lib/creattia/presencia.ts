/**
 * Dónde está parada cada persona dentro de la app.
 *
 * El latido de presencia solo guardaba una marca de tiempo: alcanzaba para
 * contar cuánta gente hay conectada, pero no para saber qué está haciendo. Con
 * una campaña corriendo eso es justo lo que se quiere mirar — si entran y se
 * quedan en la biblioteca sin generar, si abren el flujo y lo abandonan, en qué
 * anuncio ganador se traban.
 *
 * Se avisa cuando la pantalla CAMBIA, no en cada latido: el latido corre cada
 * minuto y escribir una fila por minuto por persona llenaría la tabla de eventos
 * con lo mismo repetido. Un cambio de pantalla son unos pocos por sesión.
 */

/** Lo último que se avisó, para no repetirlo. Vive en memoria de la pestaña. */
let ultimaPantalla = '';

/**
 * Avisa dónde está la persona.
 *
 * `detalle` es lo que hace útil el dato: "biblioteca" dice poco, "creando con
 * «Spring Summer Sale 26»" dice todo. Se manda solo si algo cambió respecto de
 * lo anterior, así que llamarla de más no cuesta nada.
 */
export function reportarPantalla(token: string, vista: string, detalle = '') {
	if (!token || !vista) return;
	const clave = `${vista}|${detalle}`;
	if (clave === ultimaPantalla) return;
	ultimaPantalla = clave;
	// Sin await ni manejo de error: es telemetría, y una pantalla que no se pudo
	// anotar no puede frenar ni romper nada de lo que la persona está haciendo.
	void fetch('/api/creativos/presence', {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ vista, detalle }),
	}).catch(() => undefined);
}

/** Al cerrar sesión se olvida, para que la próxima cuenta no herede la pantalla. */
export function olvidarPantalla() {
	ultimaPantalla = '';
}

/** Los nombres de pantalla en castellano, para mostrarlos en el centro admin. */
const NOMBRES: Record<string, string> = {
	home: 'Inicio',
	winners: 'Biblioteca de ganadores',
	library: 'Plantillas',
	discover: 'Descubrir',
	saved: 'Anuncios guardados',
	history: 'Mis imágenes',
	brand: 'Mi marca',
	plans: 'Planes',
	settings: 'Configuración',
	admin: 'Centro admin',
	creando: 'Creando un anuncio',
	revisando: 'Revisando antes de generar',
};

/** Cómo se lee una pantalla en el panel. El detalle manda cuando existe. */
export function nombreDePantalla(vista?: string | null, detalle?: string | null): string {
	const base = NOMBRES[String(vista || '')] || (vista ? String(vista) : 'En la app');
	return detalle ? `${base} · ${detalle}` : base;
}
