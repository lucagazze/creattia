import type { AppProfile, AppSession } from './app-types';
import { resolverSuscripcion } from '../../lib/creattia/subscription-state';

/** Lectura de la sesión y del plan: lo usan todas las pantallas. */

export function firstName(profile: AppProfile, email = '') {
	return profile.fullName.trim().split(' ')[0] || email.split('@')[0] || 'hola';
}

export function planLabel(profile: AppProfile) {
	const nombres: Record<string, string> = { creator: 'Básico', pro: 'Pro', scale: 'Scale', agency: 'Agency' };
	const suscripcion = resolverSuscripcion(profile);

	/**
	 * Un plan dado de baja pero todavía vigente sigue siendo ese plan.
	 *
	 * Decía "Plan cancelado" desde el segundo en que confirmabas la baja, aunque
	 * el mes estuviera pagado y siguieras teniendo todo. Leído desde el menú
	 * parecía que ya te habían cortado el servicio.
	 */
	if (suscripcion.activa) {
		const nombre = nombres[suscripcion.planCode] || suscripcion.planCode.charAt(0).toUpperCase() + suscripcion.planCode.slice(1);
		return suscripcion.enBaja ? `Plan ${nombre} · hasta el fin del período` : `Plan ${nombre}`;
	}
	if (profile.subscriptionStatus === 'authorized' && profile.planCode === 'admin') return 'Plan Admin';
	if (profile.subscriptionStatus === 'authorized') {
		const nombre = nombres[profile.planCode] || profile.planCode.charAt(0).toUpperCase() + profile.planCode.slice(1);
		return `Plan ${nombre}`;
	}
	if (profile.subscriptionStatus === 'pending') return 'Activación pendiente';
	// Vencida, cancelada y fuera de período, o nunca pagó: todas son el plan gratis.
	return 'Plan Gratis';
}

export const planOrder: Record<string, number> = { free: 0, creator: 1, pro: 2, scale: 3, agency: 4 };
export const paidSubscriptionStatuses = ['authorized', 'pending', 'paused'];

/**
 * Suscripciones que de verdad están vigentes.
 *
 * 'pending' significa que se abrió un checkout y todavía no se pagó, así que
 * contarlo como plan vigente hacía que el plan elegido apareciera como "Plan
 * actual" con el botón desactivado: quien dudaba y volvía se encontraba con que
 * justo ese plan era el único que ya no podía contratar.
 */
export const activeSubscriptionStatuses = ['authorized', 'paused'];

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
