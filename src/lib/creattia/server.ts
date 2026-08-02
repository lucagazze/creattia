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

/**
 * Límite de uso por usuario para acciones que cuestan plata pero NO gastan
 * créditos (análisis con IA, scraping de una URL): sin esto, una cuenta
 * podía llamarlas sin límite y generar costo real sin tope. Respaldado en
 * Postgres (RPC check_rate_limit) — funciona igual entre invocaciones
 * serverless distintas, a diferencia de un contador en memoria.
 */
export async function checkRateLimit(
	admin: ReturnType<typeof getAdminClient>,
	userId: string,
	eventKey: string,
	maxCount: number,
	windowSeconds: number,
): Promise<boolean> {
	if (!admin) return true; // sin conexión a Supabase no hay forma de contar: no bloquea
	try {
		const { data, error } = await admin.rpc('check_rate_limit', {
			p_user_id: userId,
			p_event_key: eventKey,
			p_max_count: maxCount,
			p_window_seconds: windowSeconds,
		});
		if (error) { console.error('check_rate_limit RPC error:', error); return true; }
		return data !== false;
	} catch (err) {
		console.error('check_rate_limit falló:', err);
		return true; // un fallo del limitador nunca debe tumbar la función real
	}
}

export function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff',
		},
	});
}
