-- La landing muestra ~30 referencias como muestra pública. Hasta ahora salían
-- del mismo bucket que la biblioteca paga, y por eso ese bucket tenía que ser
-- público — lo que dejaba las 1.700+ referencias vendidas al alcance de
-- cualquiera con la URL del manifiesto.
--
-- Se separan: `creative-showcase` es público y solo tiene la muestra comercial;
-- `creative-references` queda privado con el catálogo completo.
--
-- Antes de aplicar la migración que cierra el bucket, copiar los assets con:
--   node --env-file=.env scripts/publish-showcase-assets.mjs

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-showcase',
  'creative-showcase',
  true,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
on conflict (id) do update set public = true;

-- Lectura anónima: es material de marketing, se sirve a visitantes sin cuenta.
drop policy if exists "creative_showcase_public_read" on storage.objects;
create policy "creative_showcase_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'creative-showcase');
