import type { APIRoute } from 'astro';
import { authenticateRequest, checkRateLimit, getAdminClient, json } from '../../../lib/creattia/server';
import { sugerirQueDestacar } from '../../../lib/creattia/clon-libre';

export const prerender = false;

/**
 * Tres cosas que valdría la pena destacar, sacadas de lo que se leyó de la URL.
 *
 * Frente a un campo vacío casi nadie escribe: no porque no tenga qué decir, sino
 * porque no sabe qué se puede pedir. Tres opciones concretas lo vuelven
 * contestable con un toque, y la cuarta —escribir lo propio— es el campo mismo.
 *
 * No mira el anuncio ganador: se probó y no pagaba, tres ganadores muy distintos
 * devolvían las mismas tres frases. Sin la imagen esto es una llamada de texto,
 * sin descarga y sin validar acceso a la biblioteca.
 */
const limpiar = (valor: unknown, max: number) => String(valor || '').replace(/\s+/g, ' ').trim().slice(0, max);

export const POST: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const dentroDelLimite = await checkRateLimit(admin, auth.user.id, 'sugerencias-de-aviso', 60, 3600, true);
		if (!dentroDelLimite) return json({ error: 'Pediste muchas sugerencias en poco tiempo. Esperá un rato.' }, 429);

		const form = await request.formData();
		const productIds = form.getAll('productIds').map((id) => limpiar(id, 80)).filter(Boolean);
		let nombre = limpiar(form.get('productName'), 180);
		let datos = limpiar(form.get('productFacts'), 2000);
		if (productIds.length) {
			// Se leen del servidor y no del cliente: es lo mismo que ve la generación.
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
			{ nombre, datos },
		);
		return json({ sugerencias });
	} catch (cause) {
		console.error('[sugerencias] falló:', cause);
		// Sin sugerencias el campo sigue funcionando escrito a mano: no es un error
		// que valga la pena mostrarle a nadie.
		return json({ sugerencias: [] });
	}
};
