import type { APIRoute } from 'astro';
import { isAdminEmail } from '../../../lib/creattia/admin';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

/**
 * Métricas de producto para el centro admin.
 *
 * El panel mostraba listas —usuarios, pagos, generaciones— pero ninguna medida:
 * no había forma de responder "de cada diez que se registran, cuántos llegan a
 * generar" ni "cuántos abren el checkout y no pagan". Esas dos preguntas son las
 * que dicen dónde se pierde la gente.
 *
 * Todo se calcula acá, con la clave de servicio. El navegador nunca recibe datos
 * de otros usuarios, solo los números agregados.
 */

function desde(dias: number) {
	return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	if (!isAdminEmail(auth.user.email)) return json({ error: 'No autorizado.' }, 403);
	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	const ventana = Number(new URL(request.url).searchParams.get('dias') || 30);
	const dias = [7, 30, 90, 365].includes(ventana) ? ventana : 30;
	const inicio = desde(dias);

	const [perfiles, generaciones, eventos, suscripciones, compras, cobros, bajas, errores] = await Promise.all([
		admin.from('creative_profiles').select('user_id,created_at,credits_remaining,plan_code,subscription_status'),
		admin.from('creative_generations').select('user_id,status,created_at,completed_at,settings_snapshot').gte('created_at', inicio),
		admin.from('creative_events').select('user_id,event,props,created_at').gte('created_at', inicio),
		admin.from('creative_subscriptions').select('user_id,plan_code,status,created_at'),
		admin.from('creative_credit_purchases').select('user_id,credits,amount,currency,created_at'),
		admin.from('creative_subscription_payments').select('user_id,plan_code,amount,currency,status,paid_at,created_at'),
		admin.from('creative_cancellation_feedback').select('reason,comment,retained,plan_code,created_at'),
		admin.from('creative_errors').select('context,message,fingerprint,user_id,created_at').gte('created_at', inicio).order('created_at', { ascending: false }).limit(2000),
	]);

	const usuarios = perfiles.data || [];
	const gens = generaciones.data || [];
	const evs = eventos.data || [];

	const usuariosDe = (evento: string) => new Set(evs.filter((e: any) => e.event === evento && e.user_id).map((e: any) => e.user_id));
	const registrados = new Set(usuarios.filter((u: any) => u.created_at >= inicio).map((u: any) => u.user_id));
	const generaron = new Set(gens.filter((g: any) => g.user_id).map((g: any) => g.user_id));
	const pagaron = new Set([
		...(compras.data || []).filter((c: any) => c.created_at >= inicio).map((c: any) => c.user_id),
		...(cobros.data || []).filter((c: any) => (c.paid_at || c.created_at) >= inicio).map((c: any) => c.user_id),
	]);

	// El embudo, en el orden en que lo recorre una persona.
	const embudo = [
		{ paso: 'Se registró', usuarios: registrados.size },
		{ paso: 'Escaneó una URL', usuarios: usuariosDe('url_escaneada').size },
		{ paso: 'Analizó una referencia', usuarios: usuariosDe('referencia_analizada').size },
		{ paso: 'Pidió una generación', usuarios: new Set([...usuariosDe('generacion_pedida'), ...usuariosDe('carrusel_pedido'), ...usuariosDe('lote_pedido')]).size },
		{ paso: 'Generó de verdad', usuarios: generaron.size },
		{ paso: 'Abrió el checkout', usuarios: usuariosDe('checkout_abierto').size },
		{ paso: 'Pagó', usuarios: pagaron.size },
	];

	const completadas = gens.filter((g: any) => g.status === 'completed');
	const fallidas = gens.filter((g: any) => g.status === 'failed');
	const duraciones = completadas
		.filter((g: any) => g.completed_at && g.created_at)
		.map((g: any) => (new Date(g.completed_at).getTime() - new Date(g.created_at).getTime()) / 1000)
		.filter((s: number) => s > 0 && s < 900)
		.sort((a: number, b: number) => a - b);

	const contar = (lista: any[], clave: (item: any) => string) => {
		const mapa = new Map<string, number>();
		for (const item of lista) {
			const valor = clave(item);
			if (!valor) continue;
			mapa.set(valor, (mapa.get(valor) || 0) + 1);
		}
		return [...mapa.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, total]) => ({ nombre, total }));
	};

	// Actividad por día, para ver la tendencia y no solo el total.
	const porDia = new Map<string, { generaciones: number; usuarios: Set<string> }>();
	for (const g of gens) {
		const dia = String(g.created_at).slice(0, 10);
		const actual = porDia.get(dia) || { generaciones: 0, usuarios: new Set<string>() };
		actual.generaciones += 1;
		if (g.user_id) actual.usuarios.add(g.user_id);
		porDia.set(dia, actual);
	}

	const ingresoDe = (lista: any[], campoFecha: string) => (lista || [])
		.filter((item: any) => (item[campoFecha] || item.created_at) >= inicio)
		.reduce((total: number, item: any) => total + Number(item.amount || 0), 0);

	return json({
		dias,
		embudo,
		usuarios: {
			total: usuarios.length,
			nuevos: registrados.size,
			activos: new Set(gens.map((g: any) => g.user_id).filter(Boolean)).size,
			// Cuántos de todos los registrados generaron alguna vez: el número que
			// dice si el producto se entiende solo.
			activacion: usuarios.length ? Math.round((generaron.size / usuarios.length) * 100) : 0,
		},
		generacion: {
			total: gens.length,
			completadas: completadas.length,
			fallidas: fallidas.length,
			exito: gens.length ? Math.round((completadas.length / gens.length) * 1000) / 10 : 0,
			segundosMediana: duraciones.length ? Math.round(duraciones[Math.floor(duraciones.length / 2)]) : 0,
			porFormato: contar(gens, (g) => g.settings_snapshot?.format || ''),
			porSujeto: contar(gens, (g) => g.settings_snapshot?.subjectMode || ''),
			porIdioma: contar(gens, (g) => g.settings_snapshot?.language || ''),
		},
		dinero: {
			suscripcionesActivas: (suscripciones.data || []).filter((s: any) => s.status === 'authorized').length,
			suscripcionesPendientes: (suscripciones.data || []).filter((s: any) => s.status === 'pending').length,
			cobros: (cobros.data || []).filter((c: any) => (c.paid_at || c.created_at) >= inicio).length,
			comprasSueltas: (compras.data || []).filter((c: any) => c.created_at >= inicio).length,
			ingresoSuscripciones: Math.round(ingresoDe(cobros.data || [], 'paid_at') * 100) / 100,
			ingresoTokens: Math.round(ingresoDe(compras.data || [], 'created_at') * 100) / 100,
		},
		bajas: {
			total: (bajas.data || []).length,
			retenidos: (bajas.data || []).filter((b: any) => b.retained).length,
			porMotivo: contar(bajas.data || [], (b) => b.reason),
			comentarios: (bajas.data || []).filter((b: any) => b.comment).slice(0, 20).map((b: any) => ({
				motivo: b.reason, comentario: b.comment, retenido: b.retained, fecha: b.created_at,
			})),
		},
		eventos: contar(evs, (e) => e.event),
		// Agrupados por firma: lo que importa no es cuántos errores hubo sino
		// cuáles se repiten, desde cuándo y a cuánta gente le pasan.
		errores: (() => {
			const porFirma = new Map<string, { contexto: string; mensaje: string; total: number; usuarios: Set<string>; ultimo: string }>();
			for (const fila of errores.data || []) {
				const actual = porFirma.get(fila.fingerprint) || {
					contexto: fila.context, mensaje: fila.message, total: 0, usuarios: new Set<string>(), ultimo: fila.created_at,
				};
				actual.total += 1;
				if (fila.user_id) actual.usuarios.add(fila.user_id);
				if (fila.created_at > actual.ultimo) actual.ultimo = fila.created_at;
				porFirma.set(fila.fingerprint, actual);
			}
			return {
				total: (errores.data || []).length,
				grupos: [...porFirma.values()]
					.sort((a, b) => b.total - a.total)
					.slice(0, 20)
					.map((grupo) => ({
						contexto: grupo.contexto,
						mensaje: grupo.mensaje.slice(0, 180),
						total: grupo.total,
						usuarios: grupo.usuarios.size,
						ultimo: grupo.ultimo,
					})),
			};
		})(),
		porDia: [...porDia.entries()]
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([dia, datos]) => ({ dia, generaciones: datos.generaciones, usuarios: datos.usuarios.size })),
	});
};
