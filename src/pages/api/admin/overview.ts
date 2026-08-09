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
		const [users, profilesResult, subscriptionsResult, purchasesResult, subscriptionPaymentsResult, generationsResult, videosResult, overridesResult] = await Promise.all([
			listAllUsers(admin),
			listProfiles(admin),
			admin.from('creative_subscriptions').select('user_id,provider_subscription_id,plan_code,status,monthly_credits,current_period_end,last_event_id,created_at,updated_at').order('created_at', { ascending: false }),
			admin.from('creative_credit_purchases').select('payment_id,user_id,credits,amount,currency,created_at').order('created_at', { ascending: false }).limit(5000),
			admin.from('creative_subscription_payments').select('payment_id,user_id,provider_subscription_id,plan_code,status,amount,currency,paid_at,created_at').order('paid_at', { ascending: false }).limit(5000),
			admin.from('creative_generations').select('id,user_id,status,created_at,completed_at,title,output_path,format,settings_snapshot').order('created_at', { ascending: false }).limit(10000),
			admin.from('creative_video_generations').select('id,user_id,status,created_at,completed_at,title,duration_seconds').order('created_at', { ascending: false }).limit(5000),
			admin.from('creative_admin_access_overrides').select('user_id,access_mode,plan_code,credits_override,note,updated_at'),
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
				// Se firma abajo, en lote.
				outputPath: row.output_path || null,
				...authorOf(row.user_id),
			})),
			...videos.slice(0, 50).map((row: any) => ({
				type: 'video', createdAt: row.created_at, title: row.title || 'Video generado',
				description: `${row.status}${row.duration_seconds ? ` · ${row.duration_seconds}s` : ''}`,
				userId: row.user_id, status: row.status, ...authorOf(row.user_id),
			})),
		].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, 60);

		// Miniaturas de los creativos del feed, firmadas en una sola llamada.
		const thumbPaths = [...new Set(activity.map((item: any) => item.outputPath).filter(Boolean))] as string[];
		if (thumbPaths.length) {
			const { data: signed } = await admin.storage.from('creative-assets').createSignedUrls(thumbPaths, 60 * 60);
			const urlByPath = new Map((signed || []).map((row: any, index: number) => [row.path || thumbPaths[index], row.signedUrl]));
			for (const item of activity as any[]) {
				if (item.outputPath) item.thumbUrl = urlByPath.get(item.outputPath) || null;
			}
		}

		return json({
			generatedAt: new Date().toISOString(),
			metrics: {
				users: users.length,
				newUsers7d: users.filter((user: any) => withinDays(user.created_at, 7)).length,
				newUsers30d: users.filter((user: any) => withinDays(user.created_at, 30)).length,
				activeToday: users.filter((user: any) => withinDays(user.last_sign_in_at, 1)).length,
				activeUsers: userRows.filter((user: any) => user.activeNow).length,
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
			plans: Object.entries(ADMIN_PLAN_LABELS).map(([code, label]) => ({ code, label, price: PLAN_PRICES[code] || 0 })),
		});
	} catch (error) {
		console.error('[admin-overview]', error);
		return json({ error: error instanceof Error ? error.message : 'No se pudo cargar el panel admin.' }, 500);
	}
};
