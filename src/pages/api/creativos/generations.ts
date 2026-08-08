import type { APIRoute } from 'astro';
import { authenticateRequest, fail, getAdminClient, json } from '../../../lib/creattia/server';

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Tope por llamada: la selección múltiple de la biblioteca no pasa de unas decenas. */
const MAXIMO = 200;

/**
 * Borrar imágenes generadas.
 *
 * Antes esto lo hacía el navegador contra la tabla: `delete().in('id', ids)`.
 * Pero `creative_generations` tiene RLS activo y su única política es de
 * lectura, así que el borrado no alcanzaba ninguna fila — y PostgREST no
 * considera eso un error, simplemente informa cero filas afectadas. El código
 * miraba `error`, lo veía vacío y anunciaba "imagen eliminada correctamente".
 * Un par de segundos después el sondeo del historial volvía a traer las mismas
 * filas y las imágenes reaparecían solas, sin nada que sugiriera qué había
 * pasado.
 *
 * El borrado pasa a hacerse acá, con el rol de servicio, filtrando SIEMPRE por
 * el dueño: nadie puede borrar lo de otra cuenta mandando identificadores
 * ajenos. Y se responde qué se borró de verdad, para que la pantalla no pueda
 * volver a mentir.
 */
export const DELETE: APIRoute = async ({ request }) => {
	const auth = await authenticateRequest(request);
	if (!auth.user) return json({ error: auth.error }, 401);

	const body = await request.json().catch(() => ({}));
	const pedidos = Array.isArray(body.ids) ? body.ids : [];
	const ids = [...new Set(pedidos.map((id: unknown) => String(id)).filter((id: string) => UUID.test(id)))];
	if (!ids.length) return json({ error: 'No indicaste qué imágenes borrar.' }, 400);
	if (ids.length > MAXIMO) return json({ error: `Se pueden borrar hasta ${MAXIMO} imágenes por vez.` }, 400);

	const admin = getAdminClient();
	if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

	// El `eq('user_id')` es lo que hace segura la operación: sin él, el rol de
	// servicio borraría cualquier fila cuyo identificador alguien adivine.
	const { data: borradas, error } = await admin.from('creative_generations')
		.delete()
		.in('id', ids)
		.eq('user_id', auth.user.id)
		.select('id,output_path');
	if (error) return fail('generations-delete', error, 'No pudimos borrar las imágenes.', 500, auth.user.id);

	/**
	 * Los archivos también se van.
	 *
	 * Borrar solo la fila dejaba la imagen ocupando lugar en el depósito para
	 * siempre, sin nada que la referenciara: espacio que se paga y no se puede
	 * recuperar después, porque ya no queda registro de a quién pertenecía.
	 *
	 * Si esto falla no se deshace el borrado: la persona pidió que la imagen
	 * desapareciera y desapareció. Queda anotado y el archivo huérfano es un
	 * problema de limpieza, no de la operación que pidió.
	 */
	const archivos = (borradas || []).map((fila) => fila.output_path).filter(Boolean) as string[];
	if (archivos.length) {
		const { error: storageError } = await admin.storage.from('creative-assets').remove(archivos);
		if (storageError) console.warn('[generations-delete] quedaron archivos sin borrar:', storageError.message);
	}

	return json({ borradas: (borradas || []).map((fila) => fila.id as string) });
};
