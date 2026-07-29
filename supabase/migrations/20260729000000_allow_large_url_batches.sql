-- El generador de anuncios probados por URL crea lotes de 10, 20, 30 o 40
-- imágenes. Los checks originales (pensados para las 1-4 imágenes del Studio)
-- rechazaban el insert completo: el lote caía a un reintento sin batch_id ni
-- output_index, así que cada fila quedaba huérfana con un batch_id aleatorio y
-- la app no podía seguir el progreso (las tarjetas quedaban cargando para
-- siempre). Se amplían los dos límites a 40.

alter table public.creative_generations
  drop constraint if exists creative_generations_output_index_check;
alter table public.creative_generations
  add constraint creative_generations_output_index_check
  check (output_index between 1 and 40);

alter table public.creative_generations
  drop constraint if exists creative_generations_requested_outputs_check;
alter table public.creative_generations
  add constraint creative_generations_requested_outputs_check
  check (requested_outputs between 1 and 40);
