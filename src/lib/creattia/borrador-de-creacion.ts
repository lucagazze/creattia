/**
 * El anuncio que quedó a punto de generarse.
 *
 * Llegar a la revisión cuesta un análisis de visión del ganador: eso ya se pagó
 * y ya se esperó. Si la persona cierra la pestaña, toca atrás o se distrae antes
 * de apretar generar, todo eso se perdía y había que rehacerlo desde la url.
 *
 * Se guarda UNO solo, el último, en el navegador. No va al servidor a propósito:
 * es un borrador, no un dato del negocio, y una fila por cada vez que alguien
 * abandona la pantalla es basura que después hay que limpiar.
 *
 * Lo que NO se puede guardar son los archivos que todavía están en memoria —las
 * fotos de un avatar recién elegido, que viven como File hasta que se suben—.
 * Al volver, esas fotos no están, y el aviso que ya existe ("falta una foto de
 * la persona") bloquea el botón hasta que se vuelvan a elegir. Es preferible eso
 * a restaurar un borrador que dice estar completo y genera un aviso sin la cara
 * que se pidió.
 */

/** Sube cuando cambia la forma de lo guardado, para que lo viejo se descarte solo. */
const VERSION = 1;
const CLAVE = 'creattia:borrador';

/**
 * Una semana.
 *
 * Un borrador viejo apunta a productos que pueden haberse borrado y a un
 * anuncio ganador que quizás ya no está en la biblioteca. Ofrecer retomar algo
 * de hace un mes es ofrecer un error.
 */
const VENCE_EN_MS = 7 * 24 * 60 * 60 * 1000;

export type Borrador = {
	version: number;
	guardadoEn: number;
	/** De quién es. Dos cuentas en el mismo navegador no comparten borrador. */
	usuarioId: string;
	/** El anuncio ganador elegido, para poder volver a mostrarlo. */
	ad: any;
	/** El estado de la revisión, tal como lo dejó la persona. */
	estado: Record<string, unknown>;
};

function almacen(): Storage | null {
	try {
		// En SSR no hay window, y hay navegadores que tiran al leer localStorage
		// con las cookies bloqueadas. Un borrador nunca puede romper la pantalla.
		return typeof window !== 'undefined' ? window.localStorage : null;
	} catch {
		return null;
	}
}

export function guardarBorrador(usuarioId: string, ad: any, estado: Record<string, unknown>) {
	const store = almacen();
	if (!store || !usuarioId || !ad) return;
	try {
		const borrador: Borrador = { version: VERSION, guardadoEn: Date.now(), usuarioId, ad, estado };
		store.setItem(CLAVE, JSON.stringify(borrador));
	} catch {
		// Se llenó la cuota o el modo privado no deja escribir: se sigue sin
		// borrador antes que cortarle la generación a alguien por esto.
	}
}

export function leerBorrador(usuarioId: string): Borrador | null {
	const store = almacen();
	if (!store || !usuarioId) return null;
	try {
		const crudo = store.getItem(CLAVE);
		if (!crudo) return null;
		const borrador = JSON.parse(crudo) as Borrador;
		const sirve = borrador
			&& borrador.version === VERSION
			&& borrador.usuarioId === usuarioId
			&& typeof borrador.guardadoEn === 'number'
			&& Date.now() - borrador.guardadoEn < VENCE_EN_MS
			&& borrador.ad
			&& borrador.estado && typeof borrador.estado === 'object';
		if (!sirve) {
			// Vencido, de otra cuenta o de una versión anterior: se tira ahora, así
			// no queda ocupando el único lugar que hay.
			store.removeItem(CLAVE);
			return null;
		}
		return borrador;
	} catch {
		try { store.removeItem(CLAVE); } catch { /* nada que hacer */ }
		return null;
	}
}

export function borrarBorrador() {
	const store = almacen();
	if (!store) return;
	try { store.removeItem(CLAVE); } catch { /* nada que hacer */ }
}

/**
 * Qué decirle a la persona, según hasta dónde había llegado.
 *
 * Vive acá y no en cada pantalla porque el aviso aparece en tres —Inicio, la
 * biblioteca y el propio flujo— y tres copias del mismo texto es como empiezan
 * a decir cosas distintas. Sobre todo esta, que puede mentir: decir "listo para
 * generar" cuando todavía falta analizar la referencia manda a alguien a apretar
 * un botón que no está.
 */
export function resumenDelBorrador(borrador: Borrador): { titulo: string; detalle: string } {
	const nombre = borrador.ad?.name || 'un anuncio';
	const cuando = hace(borrador.guardadoEn);
	// El análisis del ganador es lo caro: si ya está, es lo que hay que nombrar.
	const analizado = Boolean((borrador.estado as any)?.plan);
	return analizado
		? {
			titulo: `Tenías «${nombre}» listo para generar`,
			detalle: `Lo dejaste ${cuando}, con el análisis del ganador y tus decisiones ya hechas. Solo queda apretar generar.`,
		}
		: {
			titulo: `Estabas armando un anuncio con «${nombre}»`,
			detalle: `Lo dejaste ${cuando}, con tu producto ya cargado. Seguí desde donde estabas en vez de empezar de nuevo.`,
		};
}

/** Hace cuánto se dejó, en palabras, para poder decírselo a la persona. */
export function hace(guardadoEn: number): string {
	const minutos = Math.floor((Date.now() - guardadoEn) / 60000);
	if (minutos < 1) return 'recién';
	if (minutos < 60) return `hace ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
	const horas = Math.floor(minutos / 60);
	if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
	const dias = Math.floor(horas / 24);
	return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}
