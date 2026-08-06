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
	/**
	 * Si el limitador falla: `false` (default) deja pasar para no tumbar la
	 * función; `true` bloquea. Se usa `true` en lo que llama a un modelo caro,
	 * donde un limitador roto es una factura abierta.
	 */
	failClosed = false,
): Promise<boolean> {
	if (!admin) return !failClosed; // sin conexión a Supabase no hay forma de contar
	try {
		const { data, error } = await admin.rpc('check_rate_limit', {
			p_user_id: userId,
			p_event_key: eventKey,
			p_max_count: maxCount,
			p_window_seconds: windowSeconds,
		});
		if (error) {
			// La función no existe todavía (migración sin aplicar). Eso es un
			// problema de despliegue, no un abuso del usuario: bloquear acá dejaba
			// la app entera sin generar. Se avisa fuerte y se deja pasar.
			if (isMissingFunction(error)) {
				console.error(
					'[rate-limit] Falta la función check_rate_limit en la base. '
					+ 'Aplicá supabase/migrations/*_rate_limit_events.sql — hasta entonces no hay tope de uso.',
				);
				return true;
			}
			console.error('check_rate_limit RPC error:', error);
			return !failClosed;
		}
		return data !== false;
	} catch (err) {
		console.error('check_rate_limit falló:', err);
		return !failClosed;
	}
}

/** `undefined_function` de Postgres, o el 404 de PostgREST cuando no la encuentra. */
function isMissingFunction(error: { code?: string; message?: string }) {
	if (error.code === '42883' || error.code === 'PGRST202') return true;
	return /could not find the function|does not exist/i.test(error.message || '');
}

/**
 * Cierra generaciones y devuelve SOLO las que este llamado logró mover de
 * 'processing' a 'failed'.
 *
 * Es el único punto donde se decide un reembolso. El `eq('status','processing')`
 * hace que dos caminos concurrentes (el pipeline que falla, el barrido de
 * colgadas, el botón Cancelar) no puedan acreditar el mismo crédito dos veces:
 * gana el primero y el resto recibe cero filas. Antes cada uno reembolsaba por
 * su cuenta y se podían duplicar créditos.
 */
export async function closeGenerationsAndCountRefunds(
	admin: NonNullable<ReturnType<typeof getAdminClient>>,
	userId: string,
	generationIds: string[],
	errorMessage: string,
): Promise<string[]> {
	if (!generationIds.length) return [];
	const { data, error } = await admin.from('creative_generations').update({
		status: 'failed',
		error_code: errorMessage.slice(0, 500),
		completed_at: new Date().toISOString(),
	}).in('id', generationIds).eq('user_id', userId).eq('status', 'processing').select('id');
	if (error) {
		console.error('No se pudieron cerrar las generaciones:', error);
		return [];
	}
	return (data || []).map((row) => row.id as string);
}

/**
 * Respuesta de error para el usuario final: el detalle real va al log del
 * servidor y nunca al cliente. Devolver `error.message` crudo filtraba nombres
 * de tablas, columnas y mensajes de Postgres en cada 500.
 */
export function fail(context: string, error: unknown, message: string, status = 500) {
	console.error(`[${context}]`, error);
	return json({ error: message }, status);
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
