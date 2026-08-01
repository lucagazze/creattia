// Único usuario con el plan Admin: créditos infinitos y puede agregar/borrar
// anuncios ganadores de la biblioteca. Todos los demás son usuarios normales.
export const ADMIN_EMAIL = 'algoritmiadesarrollos@gmail.com';

export function isAdminEmail(email?: string | null) {
	return (email || '').toLowerCase().trim() === ADMIN_EMAIL;
}
