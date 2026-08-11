import type { APIRoute } from 'astro';
import { authenticateRequest, checkRateLimit, getAdminClient, json } from '../../../lib/creattia/server';
import { checkReferencePath } from '../../../lib/creattia/library-access';
import { getEffectiveAccess } from '../../../lib/creattia/admin-access';
import { sugerirQueDestacar } from '../../../lib/creattia/clon-libre';

export const prerender = false;

/**
 * Qué destacar en este aviso, propuesto mirando el ganador y el producto.
 *
 * El campo de indicaciones arrancaba vacío y frente a un campo vacío casi nadie
 * escribe nada: no porque no tenga qué decir, sino porque no sabe qué se puede
 * pedir. Con tres o cuatro opciones concretas —sacadas de ESTE ganador y de ESTE
 * producto, no de una lista fija— la pregunta se vuelve contestable con un toque.
 *
 * Lo que devuelve son intenciones ("que se vea el 4+2 de regalo"), nunca
 * maquetas: dónde va cada cosa lo sigue decidiendo el modelo al generar.
 */
const limpiar = (valor: unknown, max: number) => String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const dentroDelLimite = await checkRateLimit(admin, auth.user.id, 'sugerencias-de-aviso', 40, 3600, true);
		if (!dentroDelLimite) return json({ error: 'Pediste muchas sugerencias en poco tiempo. Esperá un rato.' }, 429);

		const form = await request.formData();
		const referencePath = limpiar(form.get('referencePath'), 300);
		if (!/^[0-9]+\/[a-f0-9]{8,}\.(png|jpe?g|webp|avif)$/i.test(referencePath)) {
			return json({ error: 'Referencia inválida.' }, 400);
		}
		// La misma validación que la generación: la ruta tiene que existir en el
		// manifiesto y estar permitida para el plan, no alcanza con parecer una ruta.
		const access = await getEffectiveAccess(admin, auth.user.id, auth.user.email);
		const veredicto = await checkReferencePath(referencePath, access, new URL(request.url).origin);
		if (!veredicto.ok) return json({ error: veredicto.error }, veredicto.status);

		const { data: blob, error } = await admin.storage.from('creative-references').download(referencePath);
		if (error || !blob) return json({ error: 'No se pudo leer el anuncio ganador.' }, 502);

		const productIds = form.getAll('productIds').map((id) => limpiar(id, 80)).filter(Boolean);
		let nombre = limpiar(form.get('productName'), 180);
		let datos = limpiar(form.get('productFacts'), 2000);
		if (productIds.length) {
			const { data: productos } = await admin.from('creative_products')
				.select('id,name,description,price_text,currency')
				.in('id', productIds).eq('user_id', auth.user.id).eq('is_active', true);
			if (productos?.length) {
				nombre = productos.map((item) => item.name).filter(Boolean).join(' + ').slice(0, 180) || nombre;
				datos = productos.map((item) => [
					item.description,
					item.price_text && `${item.price_text} ${item.currency || ''}`,
				].filter(Boolean).join(' · ')).join('\n').slice(0, 2000) || datos;
			}
		}

		const sugerencias = await sugerirQueDestacar(
			{ openAIKey: process.env.OPENAI_API_KEY || import.meta.env.OPENAI_API_KEY },
			{ ganador: { buffer: Buffer.from(await blob.arrayBuffer()), type: blob.type || 'image/png' }, nombre, datos },
		);
		return json({ sugerencias });
	} catch (cause) {
		console.error('[sugerencias] falló:', cause);
		// Sin sugerencias el campo sigue funcionando escrito a mano: no es un error
		// que valga la pena mostrarle a nadie.
		return json({ sugerencias: [] });
	}
};
