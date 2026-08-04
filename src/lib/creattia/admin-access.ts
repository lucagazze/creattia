import { isAdminEmail } from './admin';

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
	const planCode = isUnlimited ? (isAdmin ? 'admin' : (override?.plan_code || 'admin')) : (override?.plan_code || profile?.plan_code || 'trial');
	const subscriptionStatus = isUnlimited || accessMode === 'plan' ? 'authorized' : (profile?.subscription_status || 'trial');
	const credits = isUnlimited ? 99999 : (Number(override?.credits_override ?? profile?.credits_remaining) || 0);
	const monthlyCredits = isUnlimited ? 99999 : (Number(override?.credits_override ?? profile?.credits_monthly) || 0);

	return {
		profile,
		override,
		accessMode,
		isAdmin,
		isUnlimited,
		isPaidLibrary: isUnlimited || (['creator', 'pro', 'scale', 'agency'].includes(planCode) && subscriptionStatus === 'authorized'),
		planCode,
		credits,
		monthlyCredits,
		subscriptionStatus,
	};
}
