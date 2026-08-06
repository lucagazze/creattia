import type { AppProfile } from './app-types';

/** Claves y helpers del estado que sobrevive a un refresh del navegador. */

export const PROFILE_KEY = 'creattia-profile-v1';
export const SESSION_KEY = 'creattia-session-v1';
export const HISTORY_KEY = 'creattia-history-v1';
export const ACTIVE_BATCH_KEY = 'creattia-active-batch-v1';
export const PRODUCTS_KEY = 'creattia-products-v1';
export const FAVORITES_KEY = 'creattia-favorites-v1';

export const defaultProfile: AppProfile = {
	fullName: '',
	brandName: '',
	website: '',
	instagram: '',
	primaryColor: '#18181b',
	secondaryColor: '#f4f0ff',
	credits: 1,
	monthlyCredits: 1,
	subscriptionStatus: 'trial',
	planCode: 'trial',
	subscriptionPeriodEnd: '',
	onboardingCompleted: false,
	brandSummary: '',
	catalogStatus: 'not_scanned',
	catalogLastSyncedAt: '',
	catalogError: '',
};

export function scopedKey(base: string, userId?: string | null) {
	return `${base}:${userId || 'anon'}`;
}

export function loadLocal<T>(key: string, fallback: T): T {
	try {
		const value = localStorage.getItem(key);
		return value ? JSON.parse(value) : fallback;
	} catch {
		return fallback;
	}
}

export function saveLocal(key: string, value: unknown) {
	try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be blocked */ }
}
