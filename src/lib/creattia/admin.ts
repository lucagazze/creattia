// Único usuario con el plan Admin: créditos infinitos y puede agregar/borrar
// anuncios ganadores de la biblioteca. Todos los demás son usuarios normales.
export const ADMIN_EMAIL = 'algoritmiadesarrollos@gmail.com';

export function isAdminEmail(email?: string | null) {
	return (email || '').toLowerCase().trim() === ADMIN_EMAIL;
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
