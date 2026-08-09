/**
 * Traduce cualquier fallo de "pegar una URL" a una frase que se pueda leer.
 *
 * Cada punto del escaneo tiraba su error como venía. Alguien pegaba la URL de
 * un producto de Zara y en pantalla le aparecía "El sitio respondió con estado
 * 403."; con un sitio lento le salía "The operation was aborted due to
 * timeout", que es el texto crudo de Node; con un dominio mal escrito,
 * "getaddrinfo ENOTFOUND mitienda.com.ar". Ninguno de los tres dice qué pasó ni
 * qué hacer, así que la persona cerraba la pestaña.
 *
 * Zara, Nike o Amazon bloquean a los servidores de nube por diseño y no hay
 * nada que arreglar de nuestro lado: el usuario de Creattia pega la URL de SU
 * tienda, y para el caso raro en que el sitio no se deja leer lo único que
 * importa es que sepa que puede cargar el producto a mano y seguir.
 *
 * El detalle técnico se guarda en `detalleTecnico` y va al registro del
 * servidor. A la pantalla nunca llega un código de estado ni una palabra en
 * inglés.
 */

export type MotivoDeEscaneo =
	| 'bloqueado'
	| 'demasiadas-consultas'
	| 'no-existe'
	| 'sitio-caido'
	| 'tiempo-agotado'
	| 'demora-nuestra'
	| 'dominio-inexistente'
	| 'conexion'
	| 'no-es-web'
	| 'sin-productos'
	| 'url-invalida'
	| 'red-privada'
	| 'demasiadas-redirecciones'
	| 'demasiado-grande'
	| 'desconocido';

/**
 * Lo que lee la persona, por motivo.
 *
 * Todas terminan ofreciendo una salida concreta. La única excepción son los
 * casos donde el problema es la dirección que escribió: ahí la salida es
 * corregirla, y ofrecerle cargar el producto a mano solo confundiría.
 */
export const MENSAJES_DE_ESCANEO: Record<MotivoDeEscaneo, string> = {
	bloqueado: 'Ese sitio no permite que lo leamos automáticamente. Es habitual en las marcas grandes. Cargá el producto a mano con sus fotos, o probá con la URL de tu tienda.',
	'demasiadas-consultas': 'El sitio nos está frenando porque recibió muchas consultas seguidas. Esperá un minuto y volvé a intentar, o cargá el producto a mano con sus fotos.',
	'no-existe': 'Esa página no existe. Revisá la dirección: tiene que ser el link exacto del producto, el que te queda en la barra del navegador.',
	'sitio-caido': 'El sitio está fallando en este momento, no es algo de Creattia. Volvé a intentar en un rato, o cargá el producto a mano con sus fotos.',
	'tiempo-agotado': 'El sitio tardó demasiado en responder. Volvé a intentar en un momento, o cargá el producto a mano con sus fotos.',
	'demora-nuestra': 'Tardamos demasiado leyendo esa página y el análisis se cortó. Volvé a intentar, o cargá el producto a mano con sus fotos.',
	'dominio-inexistente': 'No encontramos ese dominio. Fijate que esté bien escrito y que la tienda esté publicada.',
	conexion: 'No pudimos conectarnos con ese sitio: puede ser un problema de su certificado o de su servidor. Volvé a intentar en un rato, o cargá el producto a mano con sus fotos.',
	'no-es-web': 'Ese link no abre una página web, parece un archivo o una imagen suelta. Pegá la dirección de la página del producto tal como se ve en el navegador.',
	'sin-productos': 'Leímos la página pero no encontramos productos ahí. Pegá el link de la ficha de un producto, o cargalo a mano con sus fotos.',
	'url-invalida': 'Esa dirección no es válida. Pegá el link completo, empezando con https://',
	'red-privada': 'Esa dirección apunta a una red interna y no se puede leer. Pegá el link público de la tienda.',
	'demasiadas-redirecciones': 'El sitio nos manda de una página a otra sin llegar a destino. Pegá el link final del producto, el que te queda en la barra del navegador.',
	'demasiado-grande': 'Esa página pesa demasiado para leerla entera. Probá con el link de un producto puntual en vez del catálogo completo.',
	desconocido: 'No pudimos leer esa página. Volvé a intentar, o cargá el producto a mano con sus fotos.',
};

/** Un fallo de escaneo ya traducido: el `message` se puede mostrar tal cual. */
export class ErrorDeEscaneo extends Error {
	readonly motivo: MotivoDeEscaneo;
	/** Lo que se manda al registro del servidor. Nunca se muestra. */
	readonly detalleTecnico: string;

	constructor(motivo: MotivoDeEscaneo, detalleTecnico = '') {
		super(MENSAJES_DE_ESCANEO[motivo]);
		this.name = 'ErrorDeEscaneo';
		this.motivo = motivo;
		this.detalleTecnico = detalleTecnico;
	}
}

/**
 * Qué significa cada código HTTP para quien pegó la URL.
 *
 * El 401 y el 451 llegan por el mismo camino que el 403 —un muro delante del
 * contenido— y para la persona son lo mismo: el sitio no se deja leer.
 */
export function motivoPorEstado(status: number): MotivoDeEscaneo {
	if (status === 401 || status === 403 || status === 451) return 'bloqueado';
	if (status === 429) return 'demasiadas-consultas';
	if (status === 404 || status === 410) return 'no-existe';
	// Un 3xx que llega hasta acá es una redirección sin destino: el sitio nunca
	// entrega la página.
	if (status >= 300 && status < 400) return 'demasiadas-redirecciones';
	if (status >= 500) return 'sitio-caido';
	return 'desconocido';
}

export function errorDeEstado(status: number, contexto = '') {
	return new ErrorDeEscaneo(motivoPorEstado(status), `HTTP ${status}${contexto ? ` en ${contexto}` : ''}`);
}

/**
 * Todo el texto de un error, incluida su cadena de `cause`.
 *
 * `fetch` de Node envuelve la falla real: el timeout llega como
 * `TypeError: fetch failed` con el `TimeoutError` adentro de `cause`. Mirando
 * solo el mensaje de arriba, un sitio lento y un certificado vencido se ven
 * idénticos.
 */
function textoDelError(error: unknown, profundidad = 0): string {
	if (profundidad > 4 || error === null || error === undefined) return '';
	if (typeof error === 'string') return error;
	if (typeof error !== 'object') return String(error);
	const partes: string[] = [];
	const candidato = error as { name?: unknown; message?: unknown; code?: unknown; errno?: unknown; cause?: unknown };
	for (const campo of [candidato.name, candidato.message, candidato.code, candidato.errno]) {
		if (campo !== undefined && campo !== null) partes.push(String(campo));
	}
	if (candidato.cause) partes.push(textoDelError(candidato.cause, profundidad + 1));
	return partes.join(' ');
}

/** Clasifica cualquier cosa que se haya lanzado durante el escaneo. */
export function motivoDeEscaneo(error: unknown): MotivoDeEscaneo {
	if (error instanceof ErrorDeEscaneo) return error.motivo;
	const texto = textoDelError(error);
	if (!texto.trim()) return 'desconocido';

	// Se ordena de la señal más específica a la más genérica: "fetch failed" es
	// el envoltorio de casi todo y clasificarlo primero se comería los demás.
	if (/timeouterror|aborted due to timeout|the operation was aborted|aborterror|etimedout|und_err_(?:headers|body)_timeout/i.test(texto)) return 'tiempo-agotado';
	if (/enotfound|eai_again|getaddrinfo|dns/i.test(texto)) return 'dominio-inexistente';
	if (/cert_|certificate|_ssl_|err_tls|depth_zero|self[- ]signed|unable to verify|econnreset|econnrefused|ehostunreach|enetunreach|epipe|socket hang up|other side closed|fetch failed|und_err_/i.test(texto)) return 'conexion';
	if (/no puede apuntar a una red privada|resuelve a una red privada/i.test(texto)) return 'red-privada';
	if (/demasiadas redirecciones/i.test(texto)) return 'demasiadas-redirecciones';
	if (/supera el tamaño permitido/i.test(texto)) return 'demasiado-grande';
	if (/no apunta a una página web|no es una página web/i.test(texto)) return 'no-es-web';
	if (/no se encontró ningún producto|no encontramos productos|sin productos/i.test(texto)) return 'sin-productos';
	if (/invalid url|url inválida|url invalida|debe comenzar con http|no puede incluir credenciales|debe apuntar a instagram/i.test(texto)) return 'url-invalida';
	// Compatibilidad con cualquier punto que todavía lance el estado en el texto.
	const estado = texto.match(/(?:estado|status)\s+(\d{3})/i);
	if (estado) return motivoPorEstado(Number(estado[1]));
	return 'desconocido';
}

/** La frase que ve la persona. Es la única forma de mostrar un fallo de escaneo. */
export function mensajeDeEscaneo(error: unknown): string {
	return MENSAJES_DE_ESCANEO[motivoDeEscaneo(error)];
}

/** El detalle que se manda al registro del servidor, nunca a la pantalla. */
export function detalleDeEscaneo(error: unknown): string {
	if (error instanceof ErrorDeEscaneo) return error.detalleTecnico || error.motivo;
	return textoDelError(error).slice(0, 500) || 'sin detalle';
}

/**
 * Lee el JSON de una respuesta del servidor sin romperse cuando no lo es.
 *
 * Cuando la función de Vercel se pasa de tiempo, el navegador recibe un 504 con
 * una página HTML de error. `response.json()` explotaba con "Unexpected token
 * 'A', \"An error o\"... is not valid JSON" y ese texto salía en pantalla: el
 * único caso donde la persona ni siquiera se enteraba de que el problema había
 * sido la demora.
 */
export async function leerRespuestaDeEscaneo(response: Response): Promise<Record<string, any>> {
	try {
		return (await response.json()) as Record<string, any>;
	} catch {
		if (response.ok) return {};
		const motivo: MotivoDeEscaneo = response.status === 504 || response.status === 502 ? 'demora-nuestra' : 'desconocido';
		return { error: MENSAJES_DE_ESCANEO[motivo] };
	}
}
