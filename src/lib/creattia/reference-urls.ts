import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase-browser';

/**
 * Pide al servidor las URLs firmadas de un puñado de referencias.
 *
 * El bucket de la biblioteca es privado: `getPublicUrl()` desde el navegador
 * devolvía una URL que ya no sirve (y, cuando el bucket era público, saltaba el
 * control de plan). El servidor valida cada ruta y firma solo las permitidas.
 */
export type LibraryItem = {
	imagePath: string;
	name: string;
	templateId?: number | null;
	imageUrl?: string;
	metadata?: Record<string, any>;
};

/**
 * Items de la biblioteca que la cuenta puede ver, ya filtrados por plan y con
 * las URLs firmadas. Reemplaza la lectura directa del manifiesto desde el
 * navegador, que dependía de que el bucket fuera público.
 */
export async function fetchLibraryItems(client: SupabaseClient): Promise<LibraryItem[]> {
	const { data: sessionData } = await client.auth.getSession();
	const token = sessionData.session?.access_token;
	if (!token) return [];
	try {
		const response = await fetch('/api/creativos/library', { headers: { authorization: `Bearer ${token}` } });
		if (!response.ok) return [];
		const payload = await response.json();
		return Array.isArray(payload?.items) ? payload.items as LibraryItem[] : [];
	} catch (error) {
		console.warn('No se pudo cargar la biblioteca:', error);
		return [];
	}
}

export async function fetchReferenceUrls(client: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
	const unique = [...new Set(paths.filter(Boolean))];
	if (!unique.length) return {};
	const { data: sessionData } = await client.auth.getSession();
	const token = sessionData.session?.access_token;
	if (!token) return {};

	try {
		const response = await fetch('/api/creativos/reference-urls', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ paths: unique }),
		});
		if (!response.ok) return {};
		const payload = await response.json();
		return payload?.urls && typeof payload.urls === 'object' ? payload.urls as Record<string, string> : {};
	} catch (error) {
		console.warn('No se pudieron firmar las referencias:', error);
		return {};
	}
}

// ── Caché de URLs firmadas para los componentes ──────────────────────────────
// Las firmas duran una hora y las mismas referencias aparecen en varias vistas
// (grilla, lightbox, historial). Sin caché, cada tarjeta pediría su propia firma.

const signedCache = new Map<string, string>();
let queued = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const waiters = new Set<() => void>();

/**
 * El servidor firma como mucho 250 rutas por pedido y descarta el resto en
 * silencio. Acá se mandaba la cola entera en una sola llamada, así que en una
 * cuenta paga —donde la biblioteca son miles— volvían 250 URLs y las demás se
 * marcaban abajo como "sin URL" de forma PERMANENTE. De ahí salía el síntoma:
 * las primeras tarjetas cargaban y de ahí en adelante todo quedaba en blanco
 * hasta recargar la página.
 *
 * Se corta en tandas del tamaño que el servidor acepta, y cada tanda solo da por
 * perdidas las rutas que ella misma pidió.
 */
const TANDA = 250;

function flushQueue() {
	flushTimer = null;
	const paths = [...queued];
	queued = new Set();
	if (!paths.length || !supabase) return;
	for (let desde = 0; desde < paths.length; desde += TANDA) {
		const tanda = paths.slice(desde, desde + TANDA);
		void fetchReferenceUrls(supabase, tanda).then((urls) => {
			for (const [path, url] of Object.entries(urls)) signedCache.set(path, url);
			// Solo las de ESTA tanda: marcar las de otra sería darlas por perdidas
			// antes de haberlas pedido.
			for (const path of tanda) if (!signedCache.has(path)) signedCache.set(path, '');
			for (const notify of waiters) notify();
		});
	}
}

function requestSigning(paths: string[]) {
	let added = false;
	for (const path of paths) {
		if (!path || path.startsWith('http') || signedCache.has(path) || queued.has(path)) continue;
		queued.add(path);
		added = true;
	}
	// Se juntan los pedidos de un mismo render en una sola llamada.
	if (added && !flushTimer) flushTimer = setTimeout(flushQueue, 16);
}

/**
 * URLs firmadas para un conjunto de rutas de la biblioteca. Devuelve lo que ya
 * está en caché y pide lo que falta; el componente se re-renderiza cuando llega.
 */
export function useReferenceUrls(paths: Array<string | null | undefined>) {
	const wanted = paths.filter((path): path is string => Boolean(path));
	const key = wanted.join('|');
	const [, forceRender] = useState(0);

	useEffect(() => {
		const notify = () => forceRender((value) => value + 1);
		waiters.add(notify);
		requestSigning(wanted);
		return () => { waiters.delete(notify); };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	const urls: Record<string, string> = {};
	for (const path of wanted) {
		urls[path] = path.startsWith('http') ? path : (signedCache.get(path) || '');
	}
	return urls;
}

/** Igual que `useReferenceUrls` para una sola ruta. */
export function useReferenceUrl(path?: string | null) {
	const urls = useReferenceUrls([path]);
	return path ? urls[path] || '' : '';
}
