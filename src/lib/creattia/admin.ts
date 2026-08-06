/**
 * Cuentas con plan Admin: créditos infinitos y control de la biblioteca de
 * ganadores. Todas las demás son usuarios normales.
 *
 * La lista sale de `ADMIN_EMAILS` (separadas por coma) para no tener que tocar
 * el código —y volver a desplegar— cada vez que cambia quién administra. Si la
 * variable no está definida se usa la cuenta original, así nada se rompe en un
 * entorno sin configurar.
 */
const DEFAULT_ADMIN_EMAIL = 'algoritmiadesarrollos@gmail.com';

function configuredAdminEmails() {
	const raw = (typeof import.meta !== 'undefined' && import.meta.env?.ADMIN_EMAILS)
		|| (typeof process !== 'undefined' ? process.env?.ADMIN_EMAILS : '')
		|| '';
	const emails = String(raw)
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
	return emails.length ? emails : [DEFAULT_ADMIN_EMAIL];
}

/** Se resuelve una sola vez: la lista no cambia durante la vida del proceso. */
const adminEmails = new Set(configuredAdminEmails());

export const ADMIN_EMAIL = DEFAULT_ADMIN_EMAIL;

export function isAdminEmail(email?: string | null) {
	const normalized = (email || '').toLowerCase().trim();
	return normalized.length > 0 && adminEmails.has(normalized);
}

export const ADMIN_PLAN_CREDITS: Record<string, number> = {
	creator: 5,
	pro: 60,
	scale: 120,
	agency: 300,
};

export const ADMIN_PLAN_LABELS: Record<string, string> = {
	creator: 'Básico',
	pro: 'Pro',
	scale: 'Scale',
	agency: 'Agency',
	admin: 'Admin infinito',
	trial: 'Gratis',
};

export const ADMIN_PLAN_CODES = new Set(['creator', 'pro', 'scale', 'agency']);
