/**
 * Muestra pública de la landing.
 *
 * Vive en `creative-showcase`, un bucket público separado del catálogo que se
 * vende. Antes estas imágenes se servían desde `creative-references`, y por eso
 * ese bucket tenía que ser público: cualquiera podía bajar el manifiesto y con
 * él las 1.700+ referencias de la biblioteca paga.
 */
const supabaseUrl = (import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');

export const SHOWCASE_BUCKET = 'creative-showcase';

/** URL pública de un asset de la muestra. */
export function showcaseUrl(path: string) {
	if (!path || path.startsWith('http')) return path;
	return `${supabaseUrl}/storage/v1/object/public/${SHOWCASE_BUCKET}/${path}`;
}

/**
 * Rutas que componen la muestra pública. El script
 * `scripts/publish-showcase-assets.mjs` copia exactamente estas desde
 * `creative-references` al bucket público, así que las dos listas tienen que
 * seguir siendo la misma.
 */
export const SHOWCASE_PATHS = [
	'40/efd72e666983d8e7.webp',
	'40/1b76d7e89d46ac25.webp',
	'40/f0e11445b9ff5bcf.webp',
	'40/95585757da7f44a8.webp',
	'40/1d58518c1d718dd4.webp',
	'1/af32ca5ec7697330.webp',
	'40/dae50b9af9994bbc.webp',
	'1/dcaf28871a7a4904.webp',
	'40/ece227e7e0c07477.webp',
	'40/9c8d4a8001b24d29.webp',
	'40/6115528cf8820436.webp',
	'40/2712b3774b326865.webp',
	'40/e00a8677f0d13e45.webp',
	// Las cinco del preview gratuito, que la landing también muestra.
	'40/2fb666571bf2802e.png',
	'40/55596501e64f813b.png',
	'40/174faa5c6ab2a671.png',
	'40/8640d4617f2e692d.png',
	'40/b3aaaa6a8d580a1a.png',
	'23/ec1000c7e99f98bf.jpg',
	'7/c621e734bc3f2b0d.jpg',
	'13/8d769523a157558c.jpg',
	'41/fee532dba2b04af0.jpg',
	'10/383bfa16d248c64d.png',
	'19/4e9aee92bbc8b5db.jpg',
] as const;
