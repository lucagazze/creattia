import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { detalleDeEscaneo, ErrorDeEscaneo, motivoDeEscaneo } from './errores-de-escaneo';

function isPrivateIPv4(address: string) {
	const [a, b] = address.split('.').map(Number);
	return a === 0 || a === 10 || a === 127 || a >= 224
		|| (a === 100 && b >= 64 && b <= 127)
		|| (a === 169 && b === 254)
		|| (a === 172 && b >= 16 && b <= 31)
		|| (a === 192 && (b === 0 || b === 168))
		|| (a === 198 && (b === 18 || b === 19));
}

/**
 * La dirección IPv4 escondida dentro de una IPv6, si la hay.
 *
 * Hay tres formas de escribir una IPv4 como IPv6 y las tres llegan al mismo
 * lugar: la mapeada (`::ffff:169.254.169.254`), la de NAT64 (`64:ff9b::`) y la
 * de 6to4 (`2002::`). Se comparaba por prefijo de texto contra cuatro casos
 * sueltos, así que alcanzaba con publicar un registro AAAA apuntando al
 * servicio de metadatos de la nube para que el filtro lo diera por pública y el
 * servidor fuera a buscarlo. Cualquiera podía pegar esa URL como sitio de su
 * marca.
 */
function ipv4Escondida(address: string): string | null {
	const mapeada = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapeada) return mapeada[1];
	// Las mismas direcciones también se escriben en hexadecimal.
	const hex = address.match(/^(?:::ffff:|64:ff9b::|2002:)([0-9a-f]{1,4}):([0-9a-f]{1,4})/);
	if (hex) {
		const alto = parseInt(hex[1], 16);
		const bajo = parseInt(hex[2], 16);
		return `${alto >> 8}.${alto & 255}.${bajo >> 8}.${bajo & 255}`;
	}
	return null;
}

function isPrivateAddress(address: string) {
	const normalized = address.toLowerCase().split('%')[0];
	if (isIP(normalized) === 4) return isPrivateIPv4(normalized);
	if (isIP(normalized) === 6) {
		const escondida = ipv4Escondida(normalized);
		// Una IPv4 disfrazada pasa por el chequeo IPv4 COMPLETO, no por una lista
		// de prefijos: es el mismo destino escrito de otra manera.
		if (escondida && isPrivateIPv4(escondida)) return true;
		// NAT64 y 6to4 son túneles hacia IPv4: sin poder leer el destino, no se
		// puede afirmar que sea público.
		if (/^(64:ff9b:|2002:)/.test(normalized)) return true;
		return normalized === '::' || normalized === '::1'
			|| normalized.startsWith('fc') || normalized.startsWith('fd')
			// fe80::/10 son las link-local: fe8, fe9, fea y feb.
			|| /^fe[89ab]/.test(normalized);
	}
	return true;
}

/** Solo para las pruebas: el filtro de direcciones, sin resolver DNS. */
export const esPrivadaParaPruebas = isPrivateAddress;

export function normalizeExternalUrl(raw: string, kind: 'website' | 'instagram' = 'website') {
	let value = raw.trim();
	if (!value) return '';
	if (kind === 'instagram' && value.startsWith('@')) value = `https://www.instagram.com/${value.slice(1)}/`;
	if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
	const url = new URL(value);
	if (!['http:', 'https:'].includes(url.protocol)) throw new Error('La URL debe comenzar con http o https.');
	if (url.username || url.password) throw new Error('La URL no puede incluir credenciales.');
	if (kind === 'instagram' && url.hostname !== 'instagram.com' && !url.hostname.endsWith('.instagram.com')) {
		throw new Error('El enlace de Instagram debe apuntar a instagram.com.');
	}
	url.hash = '';
	return url.toString();
}

async function assertPublicUrl(url: URL) {
	const hostname = url.hostname.toLowerCase();
	if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
		throw new Error('La URL no puede apuntar a una red privada.');
	}
	if (isIP(hostname) && isPrivateAddress(hostname)) throw new Error('La URL no puede apuntar a una red privada.');
	const addresses = await lookup(hostname, { all: true, verbatim: true });
	if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
		throw new Error('La URL resuelve a una red privada o no disponible.');
	}
}

/**
 * Estados donde vale la pena volver a pedir la página por el proxy.
 *
 * El 403 es el bloqueo clásico de Akamai y Cloudflare, pero el muro también se
 * presenta como 401, como 429 —"muchas consultas desde esta IP", que se resuelve
 * saliendo por otra— y como el 503 de "checking your browser". Antes ninguno de
 * esos tres llegaba nunca al último recurso.
 */
function convieneElProxy(status: number) {
	return status === 401 || status === 403 || status === 429 || status === 503;
}

/**
 * Descarga una URL externa con todos los frenos puestos.
 *
 * `techoTotalMs` es el tope de TODO el intento: redirecciones, reintentos con
 * cabeceras de navegador, prueba con y sin www y proxy incluidos. Sin ese tope
 * cada salto podía sumar 56 s y una cadena de cuatro llegaba a casi cuatro
 * minutos; multiplicado por los reintentos del escáner, la función de Vercel se
 * moría antes de poder contestar y el navegador recibía un 504 con HTML que ni
 * siquiera se podía leer como JSON. Ahora el fallo llega SIEMPRE antes que el
 * corte de la plataforma, y con un mensaje.
 *
 * `permitirProxy` en false apaga el último recurso. Sirve para los sondeos que
 * preguntan "¿esto es Shopify?" y esperan que la respuesta sea que no: ahí un
 * bloqueo no es un problema a resolver, es la respuesta, y salir por el proxy
 * solo gasta una consulta paga para confirmar lo mismo.
 */
export async function safeExternalFetch(rawUrl: string, init: RequestInit = {}, timeoutMs = 12_000, techoTotalMs = timeoutMs * 3, permitirProxy = true) {
	const scraperApiKey = (typeof import.meta.env !== 'undefined' && import.meta.env.SCRAPER_API_KEY) || process.env.SCRAPER_API_KEY;
	const baseHeaders = new Headers(init.headers);
	const wantsImage = (baseHeaders.get('accept') || '').startsWith('image/');
	const vence = Date.now() + Math.max(timeoutMs, techoTotalMs);
	const restante = () => vence - Date.now();
	/** Lo que se le puede dar a un pedido sin pasarse del techo del intento. */
	const ventana = (extraMs = 0) => {
		const disponible = restante();
		if (disponible <= 0) throw new ErrorDeEscaneo('tiempo-agotado', `techo de ${techoTotalMs} ms agotado en ${rawUrl}`);
		return Math.min(timeoutMs + extraMs, disponible);
	};
	const buildBrowserHeaders = (referer?: string) => {
		const headers = new Headers(baseHeaders);
		if (!headers.has('user-agent')) headers.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
		if (!headers.has('accept')) headers.set('accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/jpeg;q=0.8,*/*;q=0.5');
		if (!headers.has('accept-language')) headers.set('accept-language', 'es-AR,es;q=0.9,en;q=0.8');
		if (referer && !headers.has('referer')) headers.set('referer', referer);
		return headers;
	};
	const fetchDirect = (target: URL, referer?: string) => fetch(target, {
		...init,
		redirect: 'manual',
		signal: AbortSignal.timeout(ventana()),
		headers: buildBrowserHeaders(referer),
	});
	const fetchThroughScraper = async (target: URL) => {
		if (!permitirProxy || !scraperApiKey || wantsImage) return null;
		// Sin margen suficiente el proxy solo sirve para llegar tarde: es preferible
		// contestar ya con el motivo real que gastar el resto del techo y terminar
		// devolviendo lo mismo.
		if (restante() < 6_000) return null;
		const proxyUrl = `https://api.scraperapi.com?api_key=${encodeURIComponent(scraperApiKey)}&url=${encodeURIComponent(target.toString())}`;
		try {
			const proxyResponse = await fetch(proxyUrl, {
				signal: AbortSignal.timeout(ventana(8000)),
				headers: buildBrowserHeaders(),
			});
			// Una clave vencida o sin saldo suele responder 401/403. En ese caso no
			// propagamos el bloqueo del proxy: conservamos la respuesta directa.
			return proxyResponse.ok ? proxyResponse : null;
		} catch (error) {
			console.warn('ScraperAPI fetch failed; using the direct site response:', error);
			return null;
		}
	};

	let current = new URL(rawUrl);
	for (let redirects = 0; redirects < 4; redirects += 1) {
		try {
			await assertPublicUrl(current);
		} catch (dnsError) {
			// `dns.lookup` tira el error de Node en crudo y así salía a la pantalla:
			// con un dominio mal escrito se leía "getaddrinfo ENOTFOUND mitienda.com".
			throw dnsError instanceof ErrorDeEscaneo ? dnsError : new ErrorDeEscaneo(motivoDeEscaneo(dnsError), detalleDeEscaneo(dnsError));
		}
		let response: Response | null = null;
		/** Por qué no hubo respuesta, para poder explicarlo si el proxy tampoco sirve. */
		let falloDirecto: unknown = null;
		try {
			response = await fetchDirect(current);
		} catch (error) {
			falloDirecto = error;
		}
		// Algunos e-commerce bloquean el primer request del servidor por el
		// user-agent o la falta de referer. Reintentamos una vez como navegador
		// antes de devolver el 403 al flujo de generación.
		if (response && response.status === 403) {
			try {
				response = await fetchDirect(current, `${current.origin}/`);
			} catch (retryError) {
				console.warn('Browser-like external fetch retry failed:', retryError);
			}
			if (response.status === 403 && !current.hostname.startsWith('localhost')) {
				try {
					const alternate = new URL(current.toString());
					alternate.hostname = alternate.hostname.startsWith('www.') ? alternate.hostname.slice(4) : `www.${alternate.hostname}`;
					await assertPublicUrl(alternate);
					const alternateResponse = await fetchDirect(alternate, `${alternate.origin}/`);
					if (alternateResponse.ok) response = alternateResponse;
				} catch (alternateError) {
					console.warn('Alternate host fetch failed:', alternateError);
				}
			}
		}
		/**
		 * El último recurso también entra cuando NO hubo respuesta.
		 *
		 * El proxy solo se disparaba mirando `response.status === 403`, o sea que
		 * hacía falta que el sitio contestara algo. Un sitio lento nunca contestaba:
		 * el pedido directo lanzaba a los 12 s, la excepción se escapaba entera y el
		 * proxy —que sale desde IPs residenciales y aguanta más— no se enteraba
		 * jamás. Lo mismo con los cortes de conexión y los certificados vencidos.
		 */
		if (!response || convieneElProxy(response.status)) {
			const proxyResponse = await fetchThroughScraper(current);
			if (proxyResponse) response = proxyResponse;
		}
		if (!response) {
			throw falloDirecto instanceof ErrorDeEscaneo
				? falloDirecto
				: new ErrorDeEscaneo(motivoDeEscaneo(falloDirecto), detalleDeEscaneo(falloDirecto));
		}
		if (response.status < 300 || response.status >= 400) return response;
		const location = response.headers.get('location');
		if (!location) return response;
		current = new URL(location, current);
	}
	throw new ErrorDeEscaneo('demasiadas-redirecciones', rawUrl);
}

export async function readLimited(response: Response, maxBytes: number) {
	const declared = Number(response.headers.get('content-length') || 0);
	if (declared > maxBytes) throw new Error('El archivo remoto supera el tamaño permitido.');
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) {
				await reader.cancel();
				throw new Error('El archivo remoto supera el tamaño permitido.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}
