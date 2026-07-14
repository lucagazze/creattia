import { createClient, type User } from '@supabase/supabase-js';

export function getAdminClient() {
	const url = import.meta.env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceRoleKey) return null;

	return createClient(url, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

export async function authenticateRequest(request: Request): Promise<{
	user: User | null;
	token: string | null;
	error?: string;
}> {
	const admin = getAdminClient();
	if (!admin) return { user: null, token: null, error: 'Supabase no está configurado.' };

	const authorization = request.headers.get('authorization') || '';
	const token = authorization.toLowerCase().startsWith('bearer ')
		? authorization.slice(7).trim()
		: null;

	if (!token) return { user: null, token: null, error: 'Sesión requerida.' };

	const { data, error } = await admin.auth.getUser(token);
	if (error || !data.user) return { user: null, token, error: 'La sesión venció. Volvé a ingresar.' };

	return { user: data.user, token };
}

export function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}
