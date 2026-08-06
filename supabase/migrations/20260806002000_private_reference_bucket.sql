-- Cierra el bucket de la biblioteca de ganadores.
--
-- ⚠️  ORDEN IMPORTANTE. Antes de aplicar esta migración:
--   1. Aplicar 20260806001000_public_showcase_bucket.sql (crea el bucket público).
--   2. Correr `node --env-file=.env scripts/publish-showcase-assets.mjs`, que
--      copia las imágenes de la landing al bucket público.
-- Si se aplica antes, la landing queda sin imágenes.
--
-- `creative-references` guarda las 1.700+ referencias que son el producto que
-- se vende. Estaba marcado como público, así que el manifiesto
-- (manifests/starter-static-50.json) y todas las imágenes se podían bajar sin
-- cuenta: el paywall solo servía para ordenar la vista. Además la política de
-- storage dejaba leer el bucket entero a cualquier usuario autenticado,
-- incluidas las cuentas gratuitas.
--
-- Desde acá todo se sirve con URLs firmadas desde el servidor, que es el único
-- que decide quién ve qué (ver src/lib/creattia/library-access.ts).

update storage.buckets
set public = false
where id = 'creative-references';

-- El bucket ya tenía "creative_references_select_authenticated", que dejaba a
-- CUALQUIER cuenta (incluida la gratuita) bajar la biblioteca completa saltando
-- el paywall. Se elimina: ahora todo se sirve con URLs firmadas desde el
-- servidor, que es el único que decide quién ve qué.
drop policy if exists "creative_references_select_authenticated" on storage.objects;

