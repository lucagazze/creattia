import { planCredits } from './subscription-plans';

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

/**
 * Créditos que otorga cada plan desde el panel admin. Fuente: la oferta.
 *
 * El plan gratuito se agrega acá y no en `planCredits` a propósito: esa tabla la
 * lee el webhook de Mercado Pago para acreditar un cobro, y el plan gratis no se
 * cobra nunca. Meterlo ahí sería darle una fila en la tabla de la plata a algo
 * que no pasa por la plata. Carga mensual real del plan gratuito: un token.
 */
export const ADMIN_PLAN_CREDITS: Record<string, number> = { ...planCredits, free: 1 };

export const ADMIN_PLAN_LABELS: Record<string, string> = {
	free: 'Gratis',
	creator: 'Básico',
	pro: 'Pro',
	scale: 'Scale',
	agency: 'Agency',
	admin: 'Admin infinito',
	trial: 'Gratis',
};

/**
 * Planes que el admin puede asignar a mano.
 *
 * `free` faltaba, así que desde el panel se podía subir a cualquiera pero no
 * bajarlo: para sacarle un plan regalado había que quitar el override y esperar
 * a que el estado se resolviera solo. Bajar a Gratis es la operación inversa de
 * dar un plan y tiene que estar al lado.
 */
export const ADMIN_PLAN_CODES = new Set(['free', 'creator', 'pro', 'scale', 'agency']);
