import type { APIRoute } from 'astro';
import { ADMIN_PLAN_CODES, ADMIN_PLAN_CREDITS, isAdminEmail } from '../../../lib/creattia/admin';
import { authenticateRequest, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

async function requireAdmin(request: Request) {
	const auth = await authenticateRequest(request);
	if (!auth.user) return { auth, response: json({ error: auth.error || 'Sesión requerida.' }, 401) };
	if (!isAdminEmail(auth.user.email)) return { auth, response: json({ error: 'No tenés permisos para administrar cuentas.' }, 403) };
	const admin = getAdminClient();
	if (!admin) return { auth, response: json({ error: 'Supabase no está configurado.' }, 503) };
	return { auth, admin };
}

export const GET: APIRoute = async ({ request }) => {
	const required = await requireAdmin(request);
	if ('response' in required) return required.response || json({ error: 'No autorizado.' }, 403);
	const { auth, admin } = required;
	const adminUser = auth.user!;
	const userId = new URL(request.url).searchParams.get('userId')?.trim();
	if (!userId) return json({ error: 'Falta userId.' }, 400);

	try {
		const [userResult, profileResult, subscriptionsResult, purchasesResult, subscriptionPaymentsResult, generationsResult, videosResult, overrideResult, auditResult] = await Promise.all([
			admin.auth.admin.getUserById(userId),
			admin.from('creative_profiles').select('*').eq('user_id', userId).maybeSingle(),
			admin.from('creative_subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
			admin.from('creative_credit_purchases').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
			admin.from('creative_subscription_payments').select('*').eq('user_id', userId).order('paid_at', { ascending: false }).limit(100),
			admin.from('creative_generations').select('id,title,status,format,created_at,completed_at,template_id,batch_id,output_path').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
			admin.from('creative_video_generations').select('id,title,status,model,duration_seconds,created_at,completed_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
			admin.from('creative_admin_access_overrides').select('*').eq('user_id', userId).maybeSingle(),
			admin.from('creative_admin_audit_log').select('id,action,details,created_at,admin_user_id').eq('target_user_id', userId).order('created_at', { ascending: false }).limit(100),
		]);
		if (userResult.error) throw userResult.error;
		for (const result of [profileResult, subscriptionsResult, purchasesResult, subscriptionPaymentsResult, generationsResult, videosResult, overrideResult, auditResult]) {
			if (result.error && result.error.code !== '42P01') throw result.error;
		}
		const generations = generationsResult.data || [];
		const paths = [...new Set(generations.map((row: any) => String(row.output_path || '').trim()).filter(Boolean))];
		const signedResult = paths.length ? await admin.storage.from('creative-assets').createSignedUrls(paths, 60 * 60) : { data: [] };
		const signedByPath = new Map((signedResult.data || []).map((row: any, index: number) => [row.path || paths[index], row.signedUrl]));
		const generationsWithImages = generations.map((row: any) => ({ ...row, image_url: row.output_path ? signedByPath.get(row.output_path) || null : null }));

		return json({
			user: userResult.data.user,
			profile: profileResult.data,
			subscriptions: subscriptionsResult.data || [],
			purchases: purchasesResult.data || [],
			subscriptionPayments: subscriptionPaymentsResult.error?.code === '42P01' ? [] : (subscriptionPaymentsResult.data || []),
			generations: generationsWithImages,
			videos: videosResult.error?.code === '42P01' ? [] : (videosResult.data || []),
			override: overrideResult.error?.code === '42P01' ? null : overrideResult.data,
			audit: auditResult.error?.code === '42P01' ? [] : (auditResult.data || []),
			requestedBy: adminUser.email,
		});
	} catch (error) {
		console.error('[admin-user-detail]', error);
		return json({ error: error instanceof Error ? error.message : 'No se pudo cargar el detalle del usuario.' }, 500);
	}
};

export const PATCH: APIRoute = async ({ request }) => {
	const required = await requireAdmin(request);
	if ('response' in required) return required.response || json({ error: 'No autorizado.' }, 403);
	const { auth, admin } = required;
	const adminUser = auth.user!;

	try {
		const body = await request.json().catch(() => ({}));
		const userId = String(body.userId || '').trim();
		const action = String(body.action || '').trim();
		if (!userId || !action) return json({ error: 'Faltan userId y action.' }, 400);
		const targetResult = await admin.auth.admin.getUserById(userId);
		if (targetResult.error || !targetResult.data.user) return json({ error: 'El usuario no existe.' }, 404);
		if (isAdminEmail(targetResult.data.user.email)) return json({ error: 'La cuenta administradora principal no se puede modificar desde este panel.' }, 400);

		const profileResult = await admin.from('creative_profiles').select('credits_remaining,credits_monthly,subscription_status,plan_code,subscription_period_end').eq('user_id', userId).maybeSingle();
		if (profileResult.error) throw profileResult.error;
		const existingResult = await admin.from('creative_admin_access_overrides').select('*').eq('user_id', userId).maybeSingle();
		if (existingResult.error && existingResult.error.code !== '42P01') throw existingResult.error;
		const existing = existingResult.data;
		const previousProfile = existing?.previous_profile || profileResult.data || null;
		const now = new Date().toISOString();

		if (action === 'revoke_override') {
			const deleteResult = await admin.from('creative_admin_access_overrides').delete().eq('user_id', userId);
			if (deleteResult.error) throw deleteResult.error;
			if (previousProfile) {
				const restoreResult = await admin.from('creative_profiles').upsert({
					user_id: userId,
					credits_remaining: previousProfile.credits_remaining ?? 0,
					credits_monthly: previousProfile.credits_monthly ?? 0,
					subscription_status: previousProfile.subscription_status || 'trial',
					plan_code: previousProfile.plan_code || 'trial',
					subscription_period_end: previousProfile.subscription_period_end || null,
					updated_at: now,
				}).eq('user_id', userId);
				if (restoreResult.error) throw restoreResult.error;
			}
			await writeAudit(admin, adminUser.id, userId, action, { previousProfile });
			return json({ ok: true, action });
		}

		if (action === 'set_credits') {
			const credits = Number(body.credits);
			if (!Number.isInteger(credits) || credits < 0 || credits > 99999) return json({ error: 'Los créditos deben ser un entero entre 0 y 99.999.' }, 400);
			const profileUpdate = await admin.from('creative_profiles').upsert({ user_id: userId, credits_remaining: credits, updated_at: now }, { onConflict: 'user_id' });
			if (profileUpdate.error) throw profileUpdate.error;
			const accessMode = existing?.access_mode === 'unlimited' ? 'plan' : (existing?.access_mode || 'standard');
			const planCode = existing?.plan_code === 'admin' ? 'creator' : (existing?.plan_code || null);
			await upsertOverride(admin, { userId, accessMode, planCode, creditsOverride: credits, previousProfile, grantedBy: adminUser.id, note: String(body.note || '').slice(0, 500), now });
			await writeAudit(admin, adminUser.id, userId, action, { credits, note: body.note || null });
			return json({ ok: true, action, credits });
		}

		if (action === 'set_unlimited') {
			const profileUpdate = await admin.from('creative_profiles').upsert({ user_id: userId, credits_remaining: 99999, credits_monthly: 99999, subscription_status: 'authorized', plan_code: 'admin', updated_at: now }, { onConflict: 'user_id' });
			if (profileUpdate.error) throw profileUpdate.error;
			await upsertOverride(admin, { userId, accessMode: 'unlimited', planCode: 'admin', creditsOverride: 99999, previousProfile, grantedBy: adminUser.id, note: String(body.note || '').slice(0, 500), now });
			await writeAudit(admin, adminUser.id, userId, action, { note: body.note || null });
			return json({ ok: true, action, credits: 99999 });
		}

		if (action === 'set_plan') {
			const planCode = String(body.planCode || '');
			if (!ADMIN_PLAN_CODES.has(planCode)) return json({ error: 'Plan inválido.' }, 400);
			const credits = Number.isInteger(Number(body.credits)) ? Number(body.credits) : ADMIN_PLAN_CREDITS[planCode];
			if (credits < 0 || credits > 99999) return json({ error: 'Cantidad de créditos inválida.' }, 400);
			/**
			 * El plan gratuito no es una suscripción, así que no puede quedar como
			 * 'authorized'.
			 *
			 * Ese estado significa "hay un cobro vivo detrás", y `resolverSuscripcion`
			 * lo cruza con la lista de planes pagos: un perfil autorizado con un plan
			 * que no se cobra es una combinación que no existe en ningún otro camino
			 * del sistema, y deja la pantalla de planes mostrando un estado que no se
			 * corresponde con nada. Bajar a Gratis además limpia la fecha del próximo
			 * cobro, que si no queda apuntando al período del plan que se acaba de
			 * sacar.
			 */
			const esGratis = planCode === 'free';
			const perfil: Record<string, unknown> = { user_id: userId, credits_remaining: credits, credits_monthly: credits, subscription_status: esGratis ? 'trial' : 'authorized', plan_code: planCode, updated_at: now };
			if (esGratis) perfil.subscription_period_end = null;
			const profileUpdate = await admin.from('creative_profiles').upsert(perfil, { onConflict: 'user_id' });
			if (profileUpdate.error) throw profileUpdate.error;
			await upsertOverride(admin, { userId, accessMode: 'plan', planCode, creditsOverride: credits, previousProfile, grantedBy: adminUser.id, note: String(body.note || '').slice(0, 500), now });
			await writeAudit(admin, adminUser.id, userId, action, { planCode, credits, note: body.note || null });
			return json({ ok: true, action, planCode, credits });
		}

		return json({ error: 'Acción admin desconocida.' }, 400);
	} catch (error) {
		console.error('[admin-user-action]', error);
		return json({ error: error instanceof Error ? error.message : 'No se pudo aplicar la acción admin.' }, 500);
	}
};

async function upsertOverride(admin: NonNullable<ReturnType<typeof getAdminClient>>, input: { userId: string; accessMode: string; planCode: string | null; creditsOverride: number; previousProfile: any; grantedBy: string; note: string; now: string }) {
	const result = await admin.from('creative_admin_access_overrides').upsert({
		user_id: input.userId,
		access_mode: input.accessMode,
		plan_code: input.planCode,
		credits_override: input.creditsOverride,
		previous_profile: input.previousProfile,
		granted_by: input.grantedBy,
		note: input.note || null,
		updated_at: input.now,
	}, { onConflict: 'user_id' });
	if (result.error) throw result.error;
}

async function writeAudit(admin: NonNullable<ReturnType<typeof getAdminClient>>, adminUserId: string, targetUserId: string, action: string, details: Record<string, unknown>) {
	const result = await admin.from('creative_admin_audit_log').insert({ admin_user_id: adminUserId, target_user_id: targetUserId, action, details });
	if (result.error) throw result.error;
}
