import type { AppProfile, AppSession } from './app-types';

/** Lectura de la sesión y del plan: lo usan todas las pantallas. */

export function firstName(profile: AppProfile, email = '') {
	return profile.fullName.trim().split(' ')[0] || email.split('@')[0] || 'hola';
}

export function planLabel(profile: AppProfile) {
	if (profile.subscriptionStatus === 'authorized') {
		const names: Record<string, string> = { creator: 'Básico', pro: 'Pro', scale: 'Scale', agency: 'Agency' };
		return `Plan ${names[profile.planCode] || profile.planCode.charAt(0).toUpperCase() + profile.planCode.slice(1)}`;
	}
	if (profile.subscriptionStatus === 'pending') return 'Activación pendiente';
	if (profile.subscriptionStatus === 'paused') return 'Plan pausado';
	if (profile.subscriptionStatus === 'cancelled') return 'Plan cancelado';
	return 'Plan Gratis';
}

export const planOrder: Record<string, number> = { free: 0, creator: 1, pro: 2, scale: 3, agency: 4 };
export const paidSubscriptionStatuses = ['authorized', 'pending', 'paused'];

export function planRank(planCode: string) {
	return planOrder[planCode] ?? 0;
}

export function conciseText(value: string, maxLength = 105) {
	const clean = value.replace(/\s+/g, ' ').trim();
	const firstSentence = clean.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || clean;
	if (firstSentence.length <= maxLength) return firstSentence;
	const shortened = firstSentence.slice(0, maxLength + 1).replace(/\s+\S*$/, '').replace(/[,:;.!?]+$/, '');
	return `${shortened}.`;
}

export function getSessionEmail(session: AppSession | null) {
	return session?.user?.email || '';
}

export function getSessionId(session: AppSession | null) {
	return session?.user?.id || '';
}

export function getSessionToken(session: AppSession | null) {
	return session && 'access_token' in session ? session.access_token : '';
}
