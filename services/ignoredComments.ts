import { supabase } from './supabase';

// ── Comentarios ignorados ─────────────────────────────────────────────────────
// Fuente de verdad: tabla car_ignored_comments en Supabase (persiste "para siempre",
// cross-dispositivo, sobrevive limpiezas de caché). localStorage se usa solo como
// caché instantáneo para que la UI y el badge respondan sin esperar a la red.

const cacheKey = (clientId: string) => `car_ignored_comments_${clientId}`;

const readCache = (clientId: string): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(clientId)) || '{}') || {};
  } catch {
    return {};
  }
};

const writeCache = (clientId: string, map: Record<string, boolean>) => {
  try {
    localStorage.setItem(cacheKey(clientId), JSON.stringify(map));
  } catch {
    /* quota llena: seguimos, el server es la fuente de verdad */
  }
};

// Devuelve el mapa cacheado al instante y, en paralelo, refresca desde el server.
// onServer se llama con el mapa autoritativo (server ∪ ignores locales previos) cuando llega.
export async function loadIgnoredComments(
  clientId: string,
  onServer?: (map: Record<string, boolean>) => void
): Promise<Record<string, boolean>> {
  const cached = readCache(clientId);
  if (!clientId) return cached;
  try {
    const { data, error } = await supabase
      .from('car_ignored_comments')
      .select('comment_id')
      .eq('client_id', clientId);
    if (error) throw error;
    const serverMap: Record<string, boolean> = {};
    (data || []).forEach((r: any) => { serverMap[String(r.comment_id)] = true; });

    // Migración: ignores que existían solo en localStorage (de la versión vieja) se
    // suben al server una vez, para no perderlos. El resultado es la unión.
    const localOnly = Object.keys(cached).filter((id) => cached[id] && !serverMap[id]);
    if (localOnly.length > 0) {
      supabase
        .from('car_ignored_comments')
        .upsert(localOnly.map((comment_id) => ({ client_id: clientId, comment_id })), { onConflict: 'client_id,comment_id' })
        .then(({ error: upErr }) => { if (upErr) console.error('[ignoredComments] migración local→server falló:', upErr); });
      localOnly.forEach((id) => { serverMap[id] = true; });
    }

    writeCache(clientId, serverMap);
    onServer?.(serverMap);
    return serverMap;
  } catch {
    // Sin red o error: nos quedamos con el caché local.
    return cached;
  }
}

// Igual que loadIgnoredComments pero sin callback — para el badge/contadores.
export async function fetchIgnoredMap(clientId: string): Promise<Record<string, boolean>> {
  return loadIgnoredComments(clientId);
}

// Marca/desmarca un comentario como ignorado. Optimista: escribe el caché al toque
// y persiste en el server. Devuelve true si el server confirmó.
export async function setIgnoredComment(
  clientId: string,
  commentId: string,
  ignored: boolean
): Promise<boolean> {
  if (!clientId || !commentId) return false;
  const map = readCache(clientId);
  if (ignored) map[commentId] = true; else delete map[commentId];
  writeCache(clientId, map);
  try {
    if (ignored) {
      const { error } = await supabase
        .from('car_ignored_comments')
        .upsert({ client_id: clientId, comment_id: commentId }, { onConflict: 'client_id,comment_id' });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('car_ignored_comments')
        .delete()
        .eq('client_id', clientId)
        .eq('comment_id', commentId);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error('[ignoredComments] no se pudo persistir en el server:', err);
    return false;
  }
}
