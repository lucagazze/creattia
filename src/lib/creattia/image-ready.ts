import { useEffect, useMemo, useState } from 'react';

/**
 * Carga de imágenes: la tarjeta aparece cuando la imagen ya está pintada.
 *
 * El problema que resuelve. La tarjeta se dibujaba en cuanto llegaba la URL
 * firmada, con el `<img>` todavía vacío: primero entraba una tarjeta de altura
 * cero —solo el pie con el botón—, después bajaba la imagen y la tarjeta crecía
 * de golpe empujando todo lo de abajo. Con veinte tarjetas a la vez eso son
 * veinte saltos de layout seguidos, cada uno con su reflow: se ve como si la app
 * se trabara, y en el medio de un scroll te mueve lo que estabas mirando.
 *
 * La idea. Una imagen se precarga fuera del documento y solo se muestra cuando
 * está DECODIFICADA, o sea lista para pintarse en el próximo frame sin trabajo
 * pendiente. `img.decode()` es justo eso: `onload` garantiza que llegaron los
 * bytes, no que el navegador ya los convirtió en píxeles —decodificar un JPEG
 * grande en el hilo principal es lo que produce el tirón—.
 *
 * Cómo se usa. Las vistas piden el prefijo listo (`usePrefijoListo`) y renderizan
 * solo eso: las tarjetas entran en bloque, ya con su imagen y con su altura
 * final, así que nada de lo que ya estaba en pantalla se mueve. Mientras tanto se
 * muestran esqueletos al final de la grilla, que es el único lugar donde crecer
 * no molesta a nadie.
 *
 * Todo el estado es de módulo, no de componente: las mismas referencias
 * aparecen en la grilla, en el lightbox y en el historial, y una imagen ya
 * decodificada tiene que estar disponible al instante en la siguiente vista.
 */

/** Cuántas bajadas en paralelo. Más que esto no acelera: satura la red y hace que las primeras tarden más. */
const EN_PARALELO = 8;

/**
 * Cuánto se espera una imagen antes de darla por perdida.
 *
 * Sin este tope una sola imagen que nunca responde congela el prefijo y la
 * grilla se queda a medias para siempre.
 */
const TIMEOUT_MS = 12_000;

/** Resultado de una imagen: la proporción sirve para reservar su lugar. */
type Resultado = { ok: boolean; ratio: number };

const resueltas = new Map<string, Resultado>();
const enVuelo = new Map<string, Promise<Resultado>>();
const oyentes = new Set<() => void>();

/** Cola de espera: se atiende en orden de pedido, con las urgentes adelante. */
const cola: Array<{ url: string; resolver: (resultado: Resultado) => void }> = [];
let activas = 0;

function avisar() {
	for (const oyente of oyentes) oyente();
}

function cargar(url: string): Promise<Resultado> {
	return new Promise<Resultado>((resolver) => {
		const img = new Image();
		let terminado = false;
		const cerrar = (resultado: Resultado) => {
			if (terminado) return;
			terminado = true;
			window.clearTimeout(temporizador);
			resolver(resultado);
		};
		const temporizador = window.setTimeout(() => {
			// Se corta la descarga: seguir esperando una imagen que no llega solo
			// ocupa una de las ranuras en paralelo.
			img.src = '';
			cerrar({ ok: false, ratio: 0 });
		}, TIMEOUT_MS);

		img.decoding = 'async';
		img.onload = () => {
			const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0;
			// `decode()` termina el trabajo caro acá, fuera del documento. Si el
			// navegador no lo soporta o lo rechaza, `onload` ya alcanza: los bytes
			// están y la imagen se va a pintar igual.
			const listo = () => cerrar({ ok: true, ratio });
			if (typeof img.decode === 'function') img.decode().then(listo, listo);
			else listo();
		};
		img.onerror = () => cerrar({ ok: false, ratio: 0 });
		img.src = url;
	});
}

function atenderCola() {
	while (activas < EN_PARALELO && cola.length) {
		const siguiente = cola.shift()!;
		activas += 1;
		void cargar(siguiente.url).then((resultado) => {
			activas -= 1;
			siguiente.resolver(resultado);
			atenderCola();
		});
	}
}

/**
 * Precarga una imagen y avisa cuando está lista para pintarse.
 *
 * Se puede llamar tantas veces como se quiera con la misma URL: la primera
 * dispara la bajada y el resto se cuelga de esa misma promesa.
 */
export function precargarImagen(url: string, urgente = false): Promise<Resultado> {
	if (!url) return Promise.resolve({ ok: false, ratio: 0 });
	const ya = resueltas.get(url);
	if (ya) return Promise.resolve(ya);
	const enCurso = enVuelo.get(url);
	if (enCurso) return enCurso;

	const promesa = new Promise<Resultado>((resolver) => {
		const entrada = { url, resolver };
		if (urgente) cola.unshift(entrada);
		else cola.push(entrada);
		atenderCola();
	}).then((resultado) => {
		resueltas.set(url, resultado);
		enVuelo.delete(url);
		avisar();
		return resultado;
	});
	enVuelo.set(url, promesa);
	return promesa;
}

/** Precarga un conjunto en el orden dado, sin esperar el resultado. */
export function precargarImagenes(urls: Array<string | null | undefined>, urgente = false) {
	for (const url of urls) if (url) void precargarImagen(url, urgente);
}

/** ¿Esta imagen ya está decodificada y se puede mostrar sin trabajo pendiente? */
export function imagenLista(url?: string | null) {
	return Boolean(url && resueltas.get(url)?.ok);
}

/** Proporción real (ancho/alto) de una imagen ya cargada; 0 si todavía no se sabe. */
export function ratioDeImagen(url?: string | null) {
	return (url && resueltas.get(url)?.ratio) || 0;
}

/** Se intentó y no se pudo: la tarjeta no se muestra en vez de dejar un hueco roto. */
export function imagenFallada(url?: string | null) {
	const resultado = url ? resueltas.get(url) : undefined;
	return Boolean(resultado && !resultado.ok);
}

/** Suscribe un callback a cada imagen que termina. Devuelve la baja. */
function suscribir(callback: () => void) {
	oyentes.add(callback);
	return () => { oyentes.delete(callback); };
}

/**
 * Re-renderiza el componente cada vez que termina una imagen.
 *
 * Se agrupan los avisos en un frame: veinte imágenes que terminan juntas
 * provocaban veinte renders del mismo árbol.
 *
 * Lo usan las vistas que deciden qué mostrar consultando `imagenLista()` en el
 * render: sin esta suscripción, el componente no se enteraría de que una imagen
 * terminó y se quedaría mostrando el estado de carga para siempre.
 */
export function useAvisoDeCarga() {
	const [, forzarRender] = useState(0);
	useEffect(() => {
		let pendiente = 0;
		return suscribir(() => {
			if (pendiente) return;
			pendiente = requestAnimationFrame(() => {
				pendiente = 0;
				forzarRender((valor) => valor + 1);
			});
		});
	}, []);
}

/**
 * Hasta dónde se puede renderizar sin que nada salte.
 *
 * Devuelve la longitud del prefijo de `urls` que ya está resuelto —cargado o
 * descartado—, así que las tarjetas entran siempre en orden y en bloque. Un
 * hueco en el medio movería de lugar lo que ya está en pantalla, que es
 * justamente lo que se quiere evitar.
 *
 * `urls` puede traer huecos (`''`) para los items cuya URL firmada todavía no
 * llegó: cuentan como no resueltos y frenan el prefijo, que es lo correcto.
 */
export function usePrefijoListo(urls: Array<string | null | undefined>, ventana = 24) {
	useAvisoDeCarga();
	const clave = urls.join('|');

	// El prefijo se recalcula en cada render; el render lo dispara el aviso de
	// carga, así que siempre refleja lo último que terminó.
	let listas = 0;
	for (const url of urls) {
		if (!url || !resueltas.has(url)) break;
		listas += 1;
	}

	/**
	 * Se pide en orden y con una ventana que avanza.
	 *
	 * Solo se precarga un tramo por delante de lo que ya está listo: pedir las
	 * 1.380 de la biblioteca de una vez llenaría la cola con imágenes que nadie
	 * va a ver y las de la pantalla actual quedarían atrás en la fila.
	 */
	useEffect(() => {
		precargarImagenes(urls.slice(0, listas + ventana));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [clave, listas, ventana]);

	return listas;
}

/**
 * Espera a que un conjunto entero esté listo, con tope de tiempo.
 *
 * Para la primera pantalla y para los cambios de filtro: ahí conviene mostrar
 * todo junto y ya armado, en vez de ir goteando tarjetas. El tope evita que una
 * imagen lenta deje la pantalla en blanco.
 */
export function useConjuntoListo(urls: Array<string | null | undefined>, topeMs = 2500) {
	useAvisoDeCarga();
	const clave = urls.join('|');
	const [vencido, setVencido] = useState(false);

	useEffect(() => {
		setVencido(false);
		precargarImagenes(urls, true);
		const temporizador = window.setTimeout(() => setVencido(true), topeMs);
		return () => window.clearTimeout(temporizador);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [clave, topeMs]);

	const completo = urls.length > 0 && urls.every((url) => Boolean(url) && resueltas.has(url as string));
	return completo || vencido;
}
