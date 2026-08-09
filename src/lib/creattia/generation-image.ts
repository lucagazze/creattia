import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase-browser';

// Las imágenes generadas viven en el bucket privado `creative-assets`.
// getPublicUrl NO funciona ahí: la única forma de mostrarlas es firmar el
// output_path. Las políticas de storage permiten al usuario firmar su propia
// carpeta ({user_id}/...), así que el cliente del navegador puede hacerlo.
const BUCKET = 'creative-assets';

/**
 * Cuánto vive una firma.
 *
 * Estaba en una hora y le pegaba a cualquiera que dejara la app abierta: se
 * entraba a "Mis imágenes", se pasaba a otra pestaña a trabajar, y al volver la
 * grilla entera estaba en blanco con los carteles de "Casi listo…" que ya no se
 * iban más. La única salida era recargar. Seis horas cubren una jornada de
 * trabajo sin volver a molestar a Supabase; que sean seis y no una además le da
 * aire al renovador de abajo para llegar tarde —una pestaña dormida despierta
 * con los temporizadores atrasados— sin que se rompa nada mientras tanto.
 */
const TTL_SECONDS = 6 * 60 * 60;

/**
 * Cuánto antes del vencimiento se pide una firma nueva.
 *
 * Es el colchón entre "esta firma todavía sirve" y "esta firma ya no vale":
 * cuarenta minutos alcanzan para que el reloj de abajo pase varias veces y para
 * que una descarga lenta que arrancó con la firma vieja termine bien.
 */
const MARGEN_MS = 40 * 60 * 1000;

/** Cada cuánto se revisa si hay firmas por vencer. */
const INTERVALO_MS = 5 * 60 * 1000;

/**
 * Ancho de las miniaturas de las grillas.
 *
 * Un creativo terminado pesa cerca de 1 MB (PNG a 1536px). "Mis imágenes" carga
 * 150: eran ~140 MB de descarga para mostrar tarjetas de 250px. Storage
 * transforma al vuelo y la misma imagen baja a ~40 KB, así que la grilla abre
 * casi al instante. El original se sigue usando al abrir la imagen grande.
 */
const THUMB_WIDTH = 420;

/**
 * Ancho para ver una imagen abierta.
 *
 * El original es un PNG de ~1 MB a 1536px. En pantalla no se distingue de una
 * versión a 1280px con buena calidad, pero pesa la quinta parte y por eso el
 * visor tardaba en mostrarla nítida. El archivo original se sigue usando para
 * descargar, que es donde la resolución sí importa.
 */
const VIEW_WIDTH = 1280;

type Variante = 'thumb' | 'view' | 'full';
type Firma = { url: string; vence: number; path: string; variante: Variante };

/**
 * Las firmas vivas de la sesión, y el camino de vuelta desde una URL a la suya.
 *
 * `firmas` guarda, por ruta y variante, la firma que hay que usar ahora.
 * `porUrl` es el índice al revés y es lo que hace que todo esto funcione sin
 * tocar el estado de las pantallas: cada tarjeta se quedó con la URL que le
 * tocó cuando cargó el historial, y esa URL —aunque ya haya vencido— sigue
 * apuntando a su entrada, así que se puede resolver a la firma nueva sin que
 * nadie tenga que ir a reescribir `history[i].imageUrl` en React. Por eso las
 * URLs viejas NO se borran del índice al renovar: son la llave que trae cada
 * pantalla en la mano.
 */
const firmas = new Map<string, Firma>();
const porUrl = new Map<string, string>();
const oyentes = new Set<() => void>();

let reloj: number | null = null;

function clave(path: string, variante: Variante) {
	return `${variante}|${path}`;
}

function varianteDe(options?: { thumb?: boolean; view?: boolean }): Variante {
	return options?.thumb ? 'thumb' : options?.view ? 'view' : 'full';
}

function transformDe(variante: Variante) {
	if (variante === 'thumb') return { transform: { width: THUMB_WIDTH, height: THUMB_WIDTH, resize: 'contain' as const, quality: 72 } };
	if (variante === 'view') return { transform: { width: VIEW_WIDTH, height: VIEW_WIDTH, resize: 'contain' as const, quality: 86 } };
	return undefined;
}

function avisar() {
	for (const oyente of oyentes) oyente();
}

/** Pide firmas nuevas a Supabase y las anota. No avisa: eso lo decide quien llama. */
async function firmar(client: SupabaseClient, paths: string[], variante: Variante): Promise<Map<string, string>> {
	const resultado = new Map<string, string>();
	if (!paths.length) return resultado;
	try {
		const { data } = await client.storage.from(BUCKET).createSignedUrls(paths, TTL_SECONDS, transformDe(variante) as any);
		const vence = Date.now() + TTL_SECONDS * 1000;
		(data || []).forEach((row: any, index: number) => {
			if (!row?.signedUrl) return;
			const path = row.path || paths[index];
			const id = clave(path, variante);
			firmas.set(id, { url: row.signedUrl, vence, path, variante });
			porUrl.set(row.signedUrl, id);
			resultado.set(path, row.signedUrl);
		});
		arrancarReloj();
	} catch {
		// Sin firma la tarjeta queda sin imagen, pero nunca rompe el render.
	}
	return resultado;
}

/**
 * El reloj que renueva antes de que se rompa nada.
 *
 * Uno solo para toda la app y una sola llamada por variante: la alternativa era
 * un temporizador por tarjeta, y con ciento cincuenta tarjetas eso son ciento
 * cincuenta pedidos de firma llegando juntos justo cuando la persona está
 * scrolleando. Acá se junta todo lo que está por vencer y se firma de una.
 *
 * Arranca recién cuando hay algo firmado y no se detiene: mientras la pestaña
 * viva hay imágenes en pantalla que dependen de esto. Cuando no hay nada por
 * vencer no toca la red, así que el costo de dejarlo andando es cero.
 */
function arrancarReloj() {
	if (reloj !== null || typeof window === 'undefined') return;
	reloj = window.setInterval(() => { void renovarFirmas(); }, INTERVALO_MS);
}

async function renovarFirmas() {
	if (!supabase) return;
	const limite = Date.now() + MARGEN_MS;
	const porVariante = new Map<Variante, string[]>();
	for (const firma of firmas.values()) {
		if (firma.vence > limite) continue;
		const lista = porVariante.get(firma.variante) || [];
		lista.push(firma.path);
		porVariante.set(firma.variante, lista);
	}
	if (!porVariante.size) return;
	for (const [variante, paths] of porVariante) await firmar(supabase, paths, variante);
	avisar();
}

export async function signGenerationPaths(
	client: SupabaseClient,
	paths: Array<string | null | undefined>,
	options?: { thumb?: boolean; view?: boolean },
): Promise<Map<string, string>> {
	const signed = new Map<string, string>();
	const unique = [...new Set(paths.map((value) => String(value || '').trim()).filter(Boolean))];
	if (!unique.length) return signed;

	// Lo que ya está firmado y le sobra vida se reusa tal cual. El polling del
	// historial pasa por acá cada 2,5 segundos con las últimas cincuenta rutas:
	// antes eso era un pedido de firma por vuelta —veinticuatro por minuto para
	// devolver siempre lo mismo— y encima cada vuelta traía URLs nuevas, así que
	// las pantallas tenían que descartarlas a mano para que las tarjetas no
	// parpadearan. Devolviendo la misma URL mientras sirve, esa gimnasia sobra.
	const variante = varianteDe(options);
	const faltan: string[] = [];
	for (const path of unique) {
		const firma = firmas.get(clave(path, variante));
		if (firma && firma.vence - Date.now() > MARGEN_MS) signed.set(path, firma.url);
		else faltan.push(path);
	}

	const nuevas = await firmar(client, faltan, variante);
	for (const [path, url] of nuevas) signed.set(path, url);
	return signed;
}

/**
 * La firma que hay que usar ahora para una URL que se guardó antes.
 *
 * Si no salió de acá —una referencia de otro bucket, una imagen pública— vuelve
 * igual que como entró.
 */
export function urlVigente(url?: string | null) {
	if (!url) return '';
	const id = porUrl.get(url);
	return (id && firmas.get(id)?.url) || url;
}

/** ¿Esta URL es una firma nuestra, o sea que se puede pedir de nuevo? */
export function puedeRefirmarse(url?: string | null) {
	return Boolean(url && porUrl.has(url));
}

/**
 * Pide una firma nueva para una URL que falló, ahora mismo.
 *
 * El reloj cubre el caso normal, pero no todos: una pestaña que estuvo dormida
 * ocho horas despierta con todo vencido y el navegador puede intentar bajar una
 * imagen antes de que el intervalo llegue a correr. Ahí el `<img>` recibe un
 * 400 y queda con el marco roto para siempre. Con esto, el que falla pide lo
 * suyo y se vuelve a intentar una vez.
 */
export async function refirmarUrl(url?: string | null): Promise<string> {
	const id = url ? porUrl.get(url) : undefined;
	const firma = id ? firmas.get(id) : undefined;
	if (!firma || !supabase) return '';
	// Si otra tarjeta de la misma imagen ya la renovó, esa sirve: veinte
	// tarjetas fallando juntas no tienen que pedir veinte firmas.
	if (firma.url !== url) return firma.url;
	const nuevas = await firmar(supabase, [firma.path], firma.variante);
	const nueva = nuevas.get(firma.path) || '';
	if (nueva && nueva !== url) avisar();
	return nueva;
}

/**
 * Sigue a una URL firmada a través de sus renovaciones.
 *
 * Quien muestra una imagen pasa la URL que tiene guardada y recibe siempre la
 * que sirve hoy, sin enterarse de que hubo un cambio.
 */
export function useUrlVigente(url?: string | null) {
	const [, forzarRender] = useState(0);
	useEffect(() => {
		const oyente = () => forzarRender((valor) => valor + 1);
		oyentes.add(oyente);
		return () => { oyentes.delete(oyente); };
	}, []);
	return urlVigente(url);
}

/**
 * URL en calidad completa de un creativo, para la vista grande y la descarga.
 *
 * Las grillas usan miniaturas transformadas —abren mucho más rápido— pero al
 * abrir una imagen hay que mostrar el original: con la miniatura, la vista
 * grande salía borrosa y la descarga bajaba una imagen chica.
 */
export function useFullGenerationUrl(outputPath?: string | null, fallback = '') {
	const [url, setUrl] = useState(fallback);
	useEffect(() => {
		setUrl(fallback);
		if (!outputPath || !supabase) return;
		let vigente = true;
		void (async () => {
			const signed = await signGenerationPaths(supabase, [outputPath], { view: true });
			const vista = signed.get(outputPath);
			if (vigente && vista) setUrl(vista);
		})();
		return () => { vigente = false; };
	}, [outputPath, fallback]);
	// El visor se puede dejar abierto tanto como cualquier otra pantalla, así que
	// la firma que se pidió al abrirlo también tiene que poder renovarse.
	return useUrlVigente(url);
}


/**
 * Firma el archivo ORIGINAL, sin transformar, en el momento de descargarlo.
 *
 * La vista abierta usa una versión a 1280px porque abre mucho antes, pero al
 * descargar hay que entregar el archivo completo: firmarlo recién acá evita
 * pagar esa firma en cada imagen que se abre y solo se mira.
 */
export async function signOriginalGeneration(outputPath?: string | null, fallback = ''): Promise<string> {
	if (!outputPath || !supabase) return fallback;
	const signed = await signGenerationPaths(supabase, [outputPath]);
	return signed.get(outputPath) || fallback;
}
