import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivateAddress(address: string) {
	const normalized = address.toLowerCase().split('%')[0];
	if (isIP(normalized) === 4) {
		const [a, b] = normalized.split('.').map(Number);
		return a === 0 || a === 10 || a === 127 || a >= 224
			|| (a === 100 && b >= 64 && b <= 127)
			|| (a === 169 && b === 254)
			|| (a === 172 && b >= 16 && b <= 31)
			|| (a === 192 && (b === 0 || b === 168))
			|| (a === 198 && (b === 18 || b === 19));
	}
	if (isIP(normalized) === 6) {
		return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
			|| normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea')
			|| normalized.startsWith('feb') || normalized.startsWith('::ffff:127.')
			|| normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:172.')
			|| normalized.startsWith('::ffff:192.168.');
	}
	return true;
}

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

export async function safeExternalFetch(rawUrl: string, init: RequestInit = {}, timeoutMs = 12_000) {
	const scraperApiKey = (typeof import.meta.env !== 'undefined' && import.meta.env.SCRAPER_API_KEY) || process.env.SCRAPER_API_KEY;
	const baseHeaders = new Headers(init.headers);
	const wantsImage = (baseHeaders.get('accept') || '').startsWith('image/');
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
		signal: AbortSignal.timeout(timeoutMs),
		headers: buildBrowserHeaders(referer),
	});
	const fetchThroughScraper = async (target: URL) => {
		if (!scraperApiKey || wantsImage) return null;
		const proxyUrl = `https://api.scraperapi.com?api_key=${encodeURIComponent(scraperApiKey)}&url=${encodeURIComponent(target.toString())}`;
		try {
			const proxyResponse = await fetch(proxyUrl, {
				signal: AbortSignal.timeout(timeoutMs + 8000),
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
		await assertPublicUrl(current);
		let response = await fetchDirect(current);
		// Algunos e-commerce bloquean el primer request del servidor por el
		// user-agent o la falta de referer. Reintentamos una vez como navegador
		// antes de devolver el 403 al flujo de generación.
		if (response.status === 403) {
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
			if (response.status === 403) {
				const proxyResponse = await fetchThroughScraper(current);
				if (proxyResponse) response = proxyResponse;
			}
		}
		if (response.status < 300 || response.status >= 400) return response;
		const location = response.headers.get('location');
		if (!location) return response;
		current = new URL(location, current);
	}
	throw new Error('La URL tiene demasiadas redirecciones.');
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
