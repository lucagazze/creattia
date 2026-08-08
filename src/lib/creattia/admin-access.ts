import { isAdminEmail } from './admin';
import { resolverSuscripcion, type EstadoSuscripcion } from './subscription-state';

type AdminClient = NonNullable<ReturnType<typeof import('./server').getAdminClient>>;

export type EffectiveAccess = {
	profile: any | null;
	override: any | null;
	accessMode: 'standard' | 'plan' | 'unlimited';
	isAdmin: boolean;
	isUnlimited: boolean;
	isPaidLibrary: boolean;
	planCode: string;
	credits: number;
	monthlyCredits: number;
	subscriptionStatus: string;
	/** El estado real de la suscripción, ya considerando el vencimiento. */
	suscripcion: EstadoSuscripcion;
};

/**
 * Resolves the account state after applying an admin-granted override.
 * The override table is intentionally readable only by the target user and
 * service_role; all writes go through the protected admin API.
 */
export async function getEffectiveAccess(admin: AdminClient, userId: string, email?: string | null): Promise<EffectiveAccess> {
	const [profileResult, overrideResult] = await Promise.all([
		admin.from('creative_profiles')
			.select('credits_remaining,credits_monthly,subscription_status,plan_code,subscription_period_end')
			.eq('user_id', userId).maybeSingle(),
		admin.from('creative_admin_access_overrides')
			.select('access_mode,plan_code,credits_override,previous_profile,note')
			.eq('user_id', userId).maybeSingle(),
	]);
	if (profileResult.error) throw profileResult.error;
	// During a rolling deploy the migration may not have reached the database
	// yet. Treat the absent table as no override so the normal app still loads.
	const override = overrideResult.error?.code === '42P01' ? null : overrideResult.data;
	if (overrideResult.error && overrideResult.error.code !== '42P01') throw overrideResult.error;

	const profile = profileResult.data;
	const isAdmin = isAdminEmail(email);
	const accessMode = isAdmin ? 'unlimited' : (override?.access_mode || 'standard');
	const isUnlimited = isAdmin || accessMode === 'unlimited';

	/**
	 * El plan vigente sale de `resolverSuscripcion`, no del campo guardado.
	 *
	 * Acá se comparaba `subscriptionStatus === 'authorized'` y listo. Eso cerraba
	 * la biblioteca en el instante de cancelar —aunque el mes estuviera pagado y
	 * la pantalla de baja prometiera lo contrario— y, del otro lado, dejaba el
	 * acceso pago abierto para siempre si el período vencía sin que llegara
	 * ningún aviso de Mercado Pago. La misma función la usa el navegador, así que
	 * lo que se muestra y lo que se permite no pueden discrepar.
	 */
	const suscripcion = resolverSuscripcion({
		planCode: override?.plan_code || profile?.plan_code,
		subscriptionStatus: profile?.subscription_status,
		subscriptionPeriodEnd: profile?.subscription_period_end,
	});

	// Un acceso otorgado a mano desde el panel admin no depende de Mercado Pago.
	const otorgadoAMano = accessMode === 'plan';
	const planCode = isUnlimited
		? (isAdmin ? 'admin' : (override?.plan_code || 'admin'))
		: (otorgadoAMano ? (override?.plan_code || 'creator') : suscripcion.planCode);
	const subscriptionStatus = isUnlimited || otorgadoAMano
		? 'authorized'
		: (suscripcion.vencida ? 'expired' : (profile?.subscription_status || 'trial'));
	/**
	 * Los tokens que ya tenía NO se tocan al vencer: se pagaron. Lo que se corta
	 * es la biblioteca y la carga mensual, que es lo que promete la pantalla de
	 * baja ("tus tokens actuales siguen disponibles").
	 */
	const credits = isUnlimited ? 99999 : (Number(override?.credits_override ?? profile?.credits_remaining) || 0);
	const monthlyCredits = isUnlimited
		? 99999
		: (suscripcion.activa || otorgadoAMano ? (Number(override?.credits_override ?? profile?.credits_monthly) || 0) : 0);

	return {
		profile,
		override,
		accessMode,
		isAdmin,
		isUnlimited,
		isPaidLibrary: isUnlimited || otorgadoAMano || suscripcion.activa,
		planCode,
		credits,
		monthlyCredits,
		subscriptionStatus,
		suscripcion,
	};
}
