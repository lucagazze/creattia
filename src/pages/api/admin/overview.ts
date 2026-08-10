import type { APIRoute } from 'astro';
import { ADMIN_PLAN_LABELS, ADMIN_PLAN_CODES, isAdminEmail } from '../../../lib/creattia/admin';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';
import { subscriptionPlans } from '../../../lib/creattia/subscription-plans';

export const prerender = false;

/**
 * Con esto se calcula la facturación recurrente que muestra el panel.
 *
 * Estaba copiada a mano y quedó con los precios de la escalera anterior, así que
 * después de cambiarlos el panel iba a seguir informando un MRR inflado —Agency
 * a USD 97.70 cuando se cobran 69.99— sin que nada avisara. Sale de la oferta.
 */
const PLAN_PRICES: Record<string, number> = Object.fromEntries(
	subscriptionPlans.filter((plan) => plan.price > 0).map((plan) => [plan.code, plan.price]),
);
const DAY = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

function withinDays(value: string | null | undefined, days: number) {
	return Boolean(value && Date.now() - new Date(value).getTime() <= days * DAY);
}

function isRecentlyActive(value: string | null | undefined) {
	return Boolean(value && Date.now() - new Date(value).getTime() <= ACTIVE_WINDOW_MS);
}

async function listAllUsers(admin: NonNullable<ReturnType<typeof getAdminClient>>) {
	const users: any[] = [];
	for (let page = 1; page <= 20; page += 1) {
		const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
		if (result.error) throw result.error;
		users.push(...(result.data.users || []));
		if ((result.data.users || []).length < 1000) break;
	}
	return users;
}

async function listProfiles(admin: NonNullable<ReturnType<typeof getAdminClient>>) {
	const baseFields = 'user_id,full_name,brand_name,credits_remaining,credits_monthly,subscription_status,plan_code,subscription_period_end,created_at,updated_at';
	const withPresence = await admin.from('creative_profiles').select(`${baseFields},last_activity_at`);
	if (!withPresence.error || withPresence.error.code !== '42703') return withPresence;
	// Permite que el panel siga funcionando durante el pequeño intervalo entre
	// publicar la app y aplicar la migración de presencia en Supabase.
	return admin.from('creative_profiles').select(baseFields);
}

export const GET: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error || 'Sesión requerida.' }, 401);
	if (!isAdminEmail(auth.user.email)) return json({ error: 'No tenés permisos para acceder al panel admin.' }, 403);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	try {
		const [users, profilesResult, subscriptionsResult, purchasesResult, subscriptionPaymentsResult, generationsResult, videosResult, overridesResult, eventosResult, pantallasResult, origenesResult] = await Promise.all([
			listAllUsers(admin),
			listProfiles(admin),
			admin.from('creative_subscriptions').select('user_id,provider_subscription_id,plan_code,status,monthly_credits,current_period_end,last_event_id,created_at,updated_at').order('created_at', { ascending: false }),
			admin.from('creative_credit_purchases').select('payment_id,user_id,credits,amount,currency,created_at').order('created_at', { ascending: false }).limit(5000),
			admin.from('creative_subscription_payments').select('payment_id,user_id,provider_subscription_id,plan_code,status,amount,currency,paid_at,created_at').order('paid_at', { ascending: false }).limit(5000),
			admin.from('creative_generations').select('id,user_id,status,created_at,completed_at,title,output_path,format,user_brief,settings_snapshot').order('created_at', { ascending: false }).limit(10000),
			admin.from('creative_video_generations').select('id,user_id,status,created_at,completed_at,title,duration_seconds').order('created_at', { ascending: false }).limit(5000),
			admin.from('creative_admin_access_overrides').select('user_id,access_mode,plan_code,credits_override,note,updated_at'),
			/**
			 * Las visitas del dia, para el panel en vivo.
			 *
			 * Salen de la tabla de eventos y no de una tabla nueva: `app_abierta` ya se
			 * escribe desde que alguien abre la app, y `landing_vista` desde la home.
			 * Se pide solo el dia para que la consulta no crezca con el historial.
			 */
			admin.from('creative_events')
				.select('event,user_id,created_at,props')
				.in('event', ['app_abierta', 'landing_vista'])
				.gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
			/**
			 * De dónde vino cada persona.
			 *
			 * Los eventos de arriba se piden solo del día, para el panel en vivo.
			 * El origen necesita más ventana: una campaña se juzga por lo que trajo
			 * en semanas, no en las últimas veinticuatro horas. Se piden treinta
			 * días y solo los que traen algo de UTM.
			 */
			admin.from('creative_events')
				.select('event,user_id,created_at,props')
				.in('event', ['app_abierta', 'landing_vista'])
				.gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
				.order('created_at', { ascending: true })
				.limit(5000),
			/**
			 * Dónde está parada cada persona ahora mismo.
			 *
			 * Se anota una fila cada vez que alguien CAMBIA de pantalla, así que la
			 * más reciente de cada uno es dónde está. Se pide solo la última media
			 * hora —más viejo que eso ya no es "ahora"— y ordenado al revés para
			 * que la primera que aparece por usuario sea la buena.
			 */
			admin.from('creative_events')
				.select('user_id,created_at,props')
				.eq('event', 'pantalla')
				.gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
				.order('created_at', { ascending: false })
				.limit(2000),
		]);
		for (const result of [profilesResult, subscriptionsResult, purchasesResult, subscriptionPaymentsResult, generationsResult, videosResult, overridesResult]) {
			if (result.error && result.error.code !== '42P01') throw result.error;
		}

		const profiles = profilesResult.data || [];
		const subscriptions = subscriptionsResult.data || [];
		const purchases = purchasesResult.data || [];
		const subscriptionPayments = subscriptionPaymentsResult.error?.code === '42P01' ? [] : (subscriptionPaymentsResult.data || []);
		const generations = generationsResult.data || [];
		const videos = videosResult.error?.code === '42P01' ? [] : (videosResult.data || []);
		const overrides = overridesResult.error?.code === '42P01' ? [] : (overridesResult.data || []);
		const profileByUser = new Map(profiles.map((row: any) => [row.user_id, row]));
		const subscriptionByUser = new Map(subscriptions.map((row: any) => [row.user_id, row]));
		const overrideByUser = new Map(overrides.map((row: any) => [row.user_id, row]));
		const purchaseByUser = new Map<string, any[]>();
		const subscriptionPaymentByUser = new Map<string, any[]>();
		const generationByUser = new Map<string, any[]>();
		const videoByUser = new Map<string, any[]>();
		for (const row of purchases) purchaseByUser.set(row.user_id, [...(purchaseByUser.get(row.user_id) || []), row]);
		for (const row of subscriptionPayments) subscriptionPaymentByUser.set(row.user_id, [...(subscriptionPaymentByUser.get(row.user_id) || []), row]);
		for (const row of generations) generationByUser.set(row.user_id, [...(generationByUser.get(row.user_id) || []), row]);
		for (const row of videos) videoByUser.set(row.user_id, [...(videoByUser.get(row.user_id) || []), row]);

		const userRows = users.map((user: any) => {
			const profile = profileByUser.get(user.id) || {};
			const subscription = subscriptionByUser.get(user.id) || null;
			const override = overrideByUser.get(user.id) || null;
			const userPurchases = purchaseByUser.get(user.id) || [];
			const userSubscriptionPayments = subscriptionPaymentByUser.get(user.id) || [];
			const userGenerations = generationByUser.get(user.id) || [];
			const userVideos = videoByUser.get(user.id) || [];
			const userPayments = [...userPurchases.map((row) => ({ ...row, paidAt: row.created_at, paymentType: 'credits' })), ...userSubscriptionPayments.map((row) => ({ ...row, paidAt: row.paid_at || row.created_at, paymentType: 'subscription' }))].sort((left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime());
			const lastPayment = userPayments[0] || null;
			const isOwner = isAdminEmail(user.email);
			const effectivePlan = isOwner ? 'admin' : (override?.plan_code || profile.plan_code || 'trial');
			const effectiveStatus = isOwner || override?.access_mode === 'unlimited' || override?.access_mode === 'plan' ? 'authorized' : (profile.subscription_status || 'trial');
			return {
				id: user.id,
				email: user.email || 'Sin email',
				fullName: profile.full_name || user.user_metadata?.full_name || '',
				brandName: profile.brand_name || '',
				createdAt: user.created_at,
				lastSignInAt: user.last_sign_in_at,
				lastActivityAt: profile.last_activity_at || user.last_sign_in_at,
				activeNow: isRecentlyActive(profile.last_activity_at),
				confirmedAt: user.email_confirmed_at,
				emailConfirmed: Boolean(user.email_confirmed_at),
				planCode: effectivePlan,
				planLabel: ADMIN_PLAN_LABELS[effectivePlan] || effectivePlan,
				subscriptionStatus: effectiveStatus,
				statusLabel: effectiveStatus === 'authorized' ? 'Activo' : effectiveStatus === 'cancelled' ? 'Cancelado' : effectiveStatus === 'paused' ? 'Pausado' : 'Prueba',
				credits: isOwner || override?.access_mode === 'unlimited' ? 99999 : Number(override?.credits_override ?? profile.credits_remaining ?? 0),
				monthlyCredits: isOwner || override?.access_mode === 'unlimited' ? 99999 : Number(override?.credits_override ?? profile.credits_monthly ?? 0),
				subscriptionPeriodEnd: subscription?.current_period_end || profile.subscription_period_end,
				override: override ? { accessMode: override.access_mode, planCode: override.plan_code, credits: override.credits_override, note: override.note, updatedAt: override.updated_at } : null,
				purchaseCount: userPurchases.length + userSubscriptionPayments.length,
				purchasedCredits: userPurchases.reduce((sum, row) => sum + Number(row.credits || 0), 0),
				paidAmount: [...userPurchases, ...userSubscriptionPayments].reduce((sum, row) => sum + Number(row.amount || 0), 0),
				lastPaymentAt: lastPayment?.paidAt || null,
				lastPaymentAmount: lastPayment?.amount || null,
				lastPaymentCurrency: lastPayment?.currency || 'USD',
				lastPaymentType: lastPayment?.paymentType || null,
				generationCount: userGenerations.length,
				completedGenerations: userGenerations.filter((row) => row.status === 'completed').length,
				videoCount: userVideos.length,
			};
		});

		const activeSubscriptions = subscriptions.filter((row: any) => row.status === 'authorized' && ADMIN_PLAN_CODES.has(row.plan_code));
		const mrr = activeSubscriptions.reduce((sum: number, row: any) => sum + (PLAN_PRICES[row.plan_code] || 0), 0);
		const completedGenerations = generations.filter((row: any) => row.status === 'completed').length;
		const totalPaid = [...purchases, ...subscriptionPayments].reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
		const totalPurchasedCredits = purchases.reduce((sum: number, row: any) => sum + Number(row.credits || 0), 0);
		// Quién hizo cada cosa: el feed mostraba solo el estado y había que abrir
		// la ficha para saber de quién era.
		const userById = new Map(users.map((user: any) => [user.id, user]));
		const authorOf = (userId: string) => {
			const user = userById.get(userId);
			return { email: user?.email || 'Cuenta eliminada', name: user?.user_metadata?.full_name || '' };
		};

		const activity = [
			...users.map((user: any) => ({ type: 'signup', createdAt: user.created_at, title: 'Nueva cuenta', description: user.email || 'Usuario sin email', userId: user.id, ...authorOf(user.id) })),
			...subscriptions.map((row: any) => ({ type: 'subscription', createdAt: row.created_at, title: `Suscripción ${ADMIN_PLAN_LABELS[row.plan_code] || row.plan_code}`, description: row.status, userId: row.user_id, ...authorOf(row.user_id) })),
			...purchases.map((row: any) => ({ type: 'payment', createdAt: row.created_at, title: 'Compra de créditos', description: `${row.credits} créditos · ${row.amount ? `${row.currency || 'USD'} ${row.amount}` : 'importe no informado'}`, userId: row.user_id, amount: row.amount, currency: row.currency, ...authorOf(row.user_id) })),
			...subscriptionPayments.map((row: any) => ({ type: 'payment', createdAt: row.paid_at || row.created_at, title: 'Pago de suscripción', description: `${ADMIN_PLAN_LABELS[row.plan_code] || row.plan_code || 'Plan'} · ${row.amount ? `${row.currency || 'USD'} ${row.amount}` : 'importe no informado'}`, userId: row.user_id, amount: row.amount, currency: row.currency, ...authorOf(row.user_id) })),
			...generations.slice(0, 200).map((row: any) => ({
				type: 'generation',
				createdAt: row.created_at,
				title: row.title || 'Imagen generada',
				description: row.status === 'completed' ? 'Creativo listo' : row.status === 'failed' ? 'Falló' : 'Generando',
				userId: row.user_id,
				status: row.status,
				format: row.format || row.settings_snapshot?.format || null,
				// Se firman abajo, las dos en la misma llamada.
				outputPath: row.output_path || null,
				// Con qué se hizo. El feed mostraba solo el resultado, así que para
				// saber de qué anuncio ganador salió o qué url había puesto la
				// persona había que ir a buscarlo a mano en la base.
				referencePath: row.settings_snapshot?.referencePath || null,
				referenceName: row.settings_snapshot?.referenceName || row.settings_snapshot?.templateName || null,
				sourceUrl: row.settings_snapshot?.sourceUrl || null,
				// Qué producto puso. Lo que se guarda son los ids; la foto se busca
				// abajo, para todo el feed de una vez y no una consulta por fila.
				productIds: Array.isArray(row.settings_snapshot?.productIds) ? row.settings_snapshot.productIds : [],
				productNames: Array.isArray(row.settings_snapshot?.productNames) ? row.settings_snapshot.productNames : [],
				// Con qué se pidió. Sin esto, mirar una generación vieja no explicaba
				// nada: se veía qué salió y no qué se había pedido, que es la mitad
				// de la respuesta cuando alguien pregunta por qué salió así.
				brief: row.user_brief || null,
				decisiones: {
					idioma: row.settings_snapshot?.language || null,
					alcance: row.settings_snapshot?.subjectMode || null,
					colores: row.settings_snapshot?.colorMode || null,
					tipografia: row.settings_snapshot?.typoMode || null,
					marca: row.settings_snapshot?.brandSource || null,
					firma: row.settings_snapshot?.logoMode ?? (row.settings_snapshot?.includeLogo ? 'imagen' : null),
					persona: row.settings_snapshot?.personMode || null,
					personaDescripta: row.settings_snapshot?.avatarDescription || null,
					prensa: row.settings_snapshot?.pressRowMode || null,
					prensaItems: Array.isArray(row.settings_snapshot?.pressRowItems) ? row.settings_snapshot.pressRowItems : [],
					preset: row.settings_snapshot?.preset || null,
					rehechaDe: row.settings_snapshot?.sourceGenerationId || null,
				},
				...authorOf(row.user_id),
			})),
			...videos.slice(0, 50).map((row: any) => ({
				type: 'video', createdAt: row.created_at, title: row.title || 'Video generado',
				description: `${row.status}${row.duration_seconds ? ` · ${row.duration_seconds}s` : ''}`,
				userId: row.user_id, status: row.status, ...authorOf(row.user_id),
			})),
		].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, 60);

		// Miniaturas de los creativos del feed, firmadas en una sola llamada.
		// La foto del producto que eligió: es la tercera pata de "con qué se hizo"
		// —el ganador da la forma, el producto da lo que se vende— y era la única
		// que no se podía ver sin entrar a la base.
		const idsDeProductos = [...new Set(activity.flatMap((item: any) => item.productIds || []))] as string[];
		if (idsDeProductos.length) {
			// TODAS las fotos de cada producto, no solo la principal: de una url se
			// bajan varias vistas y son las que el modelo mira para reconstruir la
			// prenda. Mostrar una sola no dice con qué se trabajó.
			const fotosPorProducto = new Map<string, string[]>();
			const { data: galeria } = await admin.from('creative_product_images')
				.select('product_id,storage_path,sort_order')
				.in('product_id', idsDeProductos.slice(0, 200))
				.order('sort_order');
			for (const fila of galeria || []) {
				if (!fila.storage_path) continue;
				const lista = fotosPorProducto.get(fila.product_id) || [];
				lista.push(fila.storage_path);
				fotosPorProducto.set(fila.product_id, lista);
			}
			// La principal del producto, por si la galería está vacía —productos
			// cargados a mano, o de antes de que existiera esa tabla—.
			const { data: filas } = await admin.from('creative_products')
				.select('id,image_path').in('id', idsDeProductos.slice(0, 200));
			for (const fila of filas || []) {
				if (!fila.image_path) continue;
				const lista = fotosPorProducto.get(fila.id) || [];
				if (!lista.includes(fila.image_path)) lista.unshift(fila.image_path);
				fotosPorProducto.set(fila.id, lista);
			}
			for (const item of activity as any[]) {
				// Se acota por generación: una url puede haber dejado veinticuatro
				// fotos, y firmar todas las de todo el feed sería una lista enorme
				// para algo que se mira de a una generación por vez.
				item.productPaths = (item.productIds || []).flatMap((id: string) => fotosPorProducto.get(id) || []).slice(0, 10);
			}
		}

		// El resultado y las fotos del producto viven en un bucket, y los anuncios
		// ganadores en OTRO. Firmar todo contra el primero devolvía null para la
		// referencia sin fallar: el bloque del ganador simplemente no aparecía, que
		// es justo lo que más se quiere ver.
		const firmar = async (bucket: string, rutas: string[]) => {
			const mapa = new Map<string, string>();
			if (!rutas.length) return mapa;
			const { data: firmadas } = await admin.storage.from(bucket).createSignedUrls(rutas, 60 * 60);
			for (const [indice, fila] of (firmadas || []).entries()) {
				if (fila?.signedUrl) mapa.set(fila.path || rutas[indice], fila.signedUrl);
			}
			return mapa;
		};
		const rutasDeAssets = [...new Set(
			activity.flatMap((item: any) => [item.outputPath, ...(item.productPaths || [])]).filter(Boolean)
		)] as string[];
		const rutasDeReferencias = [...new Set(activity.map((item: any) => item.referencePath).filter(Boolean))] as string[];
		const [urlDeAsset, urlDeReferencia] = await Promise.all([
			firmar('creative-assets', rutasDeAssets),
			firmar('creative-references', rutasDeReferencias),
		]);
		for (const item of activity as any[]) {
			if (item.outputPath) item.thumbUrl = urlDeAsset.get(item.outputPath) || null;
			if (item.referencePath) item.referenceUrl = urlDeReferencia.get(item.referencePath) || null;
			if (item.productPaths?.length) item.productUrls = item.productPaths.map((path: string) => urlDeAsset.get(path)).filter(Boolean);
		}

		const eventosDelDia: any[] = eventosResult?.error ? [] : (eventosResult?.data || []);

		/**
		 * De dónde vino cada persona, y qué trajo cada campaña.
		 *
		 * Se arma con los eventos ordenados de más viejo a más nuevo, así que el
		 * PRIMERO de cada usuario es su origen: quien llegó por un anuncio, se fue
		 * y volvió directo vino igual por ese anuncio, y quedarse con el último
		 * haría que la campaña que lo trajo figure sin una sola alta.
		 */
		const CAMPOS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
		const leerOrigen = (props: any) => {
			const origen: Record<string, string> = {};
			for (const campo of CAMPOS_UTM) if (props?.[campo]) origen[campo] = String(props[campo]).slice(0, 120);
			return Object.keys(origen).length ? origen : null;
		};
		const origenPorUsuario = new Map<string, Record<string, string>>();
		// Cada combinación de campaña, con lo que trajo. Las visitas anónimas
		// cuentan para la primera columna; las altas necesitan un usuario.
		const porCampania = new Map<string, { origen: Record<string, string>; visitas: number; usuarios: Set<string> }>();
		for (const fila of (origenesResult?.error ? [] : origenesResult?.data || []) as any[]) {
			const origen = leerOrigen(fila.props);
			if (!origen) continue;
			const clave = CAMPOS_UTM.map((c) => origen[c] || '').join('|');
			const acumulado = porCampania.get(clave) || { origen, visitas: 0, usuarios: new Set<string>() };
			acumulado.visitas += 1;
			if (fila.user_id) {
				acumulado.usuarios.add(fila.user_id);
				if (!origenPorUsuario.has(fila.user_id)) origenPorUsuario.set(fila.user_id, origen);
			}
			porCampania.set(clave, acumulado);
		}
		const usuarioPorId = new Map((users as any[]).map((u: any) => [u.id, u]));
		const origenes = [...porCampania.values()]
			.map((fila) => {
				const cuentas = [...fila.usuarios].map((id) => usuarioPorId.get(id)).filter(Boolean) as any[];
				const perfilPorId = new Map((profiles as any[]).map((p: any) => [p.user_id, p]));
				return {
					...fila.origen,
					visitas: fila.visitas,
					usuarios: cuentas.length,
					// Cuántos de esos pagan: es la única columna que dice si la campaña
					// sirve. Traer altas que no compran no es traer nada.
					pagos: cuentas.filter((u) => {
						const plan = perfilPorId.get(u.id)?.plan_code;
						return plan && plan !== 'free' && plan !== 'trial';
					}).length,
					cuentas: cuentas.slice(0, 30).map((u) => ({
						id: u.id,
						email: u.email || '',
						nombre: u.user_metadata?.full_name || '',
						creada: u.created_at,
						plan: perfilPorId.get(u.id)?.plan_code || 'free',
					})),
				};
			})
			.sort((a, b) => (b.usuarios - a.usuarios) || (b.visitas - a.visitas));
		for (const usuario of userRows as any[]) {
			usuario.origen = origenPorUsuario.get(usuario.id) || null;
		}

		// Dónde está cada uno: vienen ordenadas de la más nueva a la más vieja, así
		// que la PRIMERA de cada persona es la última pantalla que abrió.
		const pantallaPorUsuario = new Map<string, { vista: string; detalle: string; cuando: string }>();
		for (const fila of (pantallasResult?.error ? [] : pantallasResult?.data || []) as any[]) {
			if (!fila.user_id || pantallaPorUsuario.has(fila.user_id)) continue;
			pantallaPorUsuario.set(fila.user_id, {
				vista: String(fila.props?.vista || ''),
				detalle: String(fila.props?.detalle || ''),
				cuando: fila.created_at,
			});
		}
		for (const usuario of userRows as any[]) {
			const donde = pantallaPorUsuario.get(usuario.id);
			// Solo para quien está adentro AHORA: mostrar la última pantalla de
			// alguien que se fue hace veinte minutos se lee como que sigue ahí.
			usuario.pantalla = usuario.activeNow && donde ? donde : null;
		}

		return json({
			generatedAt: new Date().toISOString(),
			metrics: {
				users: users.length,
				newUsers7d: users.filter((user: any) => withinDays(user.created_at, 7)).length,
				newUsers30d: users.filter((user: any) => withinDays(user.created_at, 30)).length,
				activeToday: users.filter((user: any) => withinDays(user.last_sign_in_at, 1)).length,
				activeUsers: userRows.filter((user: any) => user.activeNow).length,
				// Lo de HOY, que es lo que se mira mientras corre una campana. `newUsers7d`
				// no sirve para eso: el dia que empezas a pautar, siete dias de historia
				// tapan justamente lo que queres ver.
				newUsersToday: users.filter((user: any) => withinDays(user.created_at, 1)).length,
				// VISITAS = aperturas. VISITANTES = personas distintas. Se devuelven las
				// dos: la primera dice cuanto se usa, la segunda cuanta gente hay, y
				// mezclarlas es lo que hace que un tablero mienta hacia arriba.
				appViewsToday: eventosDelDia.filter((row: any) => row.event === 'app_abierta').length,
				landingViewsToday: eventosDelDia.filter((row: any) => row.event === 'landing_vista').length,
				// La landing no tiene sesion, asi que los visitantes se cuentan por la
				// huella diaria que deja el endpoint publico —un hash de IP y navegador que
				// no se puede revertir y cambia todos los dias—.
				landingVisitorsToday: new Set(
					eventosDelDia
						.filter((row: any) => row.event === 'landing_vista')
						.map((row: any) => row.props?.visitante)
						.filter(Boolean),
				).size,
				// Personas distintas, no aperturas: una sola persona que entra ocho veces
				// no son ocho visitantes.
				appVisitorsToday: new Set(eventosDelDia.filter((row: any) => row.event === 'app_abierta').map((row: any) => row.user_id).filter(Boolean)).size,
				activeSubscriptions: activeSubscriptions.length,
				mrr,
				totalPaid,
				totalPurchasedCredits,
				generations: generations.length,
				completedGenerations,
				videos: videos.length,
			},
			users: userRows,
			recentPayments: [...purchases.map((row: any) => ({ ...row, paymentType: 'credits', paidAt: row.created_at })), ...subscriptionPayments.map((row: any) => ({ ...row, paymentType: 'subscription', paidAt: row.paid_at || row.created_at }))].sort((left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime()).slice(0, 50).map((row: any) => ({ ...row, email: users.find((user: any) => user.id === row.user_id)?.email || 'Sin email' })),
			activity,
			origenes,
			plans: Object.entries(ADMIN_PLAN_LABELS).map(([code, label]) => ({ code, label, price: PLAN_PRICES[code] || 0 })),
		});
	} catch (error) {
		console.error('[admin-overview]', error);
		return json({ error: error instanceof Error ? error.message : 'No se pudo cargar el panel admin.' }, 500);
	}
};
