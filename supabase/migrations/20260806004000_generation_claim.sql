-- Evita que dos workers generen la MISMA fila a la vez.
--
-- Síntoma reportado: "Creattia me hizo una imagen y pasó un tiempo y esa imagen
-- era diferente". No era una colisión de rutas en la base —no hay dos filas con
-- el mismo output_path— sino que el archivo se sobrescribía en Storage.
--
-- El front re-lanza cualquier generación que lleve más de 60s en 'processing',
-- y ese umbral era MENOR que lo que tarda una generación normal. Si además se
-- recargaba la página, se relanzaba trabajo que seguía en curso: dos workers
-- generaban la misma fila y el segundo pisaba el archivo del primero con
-- upsert:true. El usuario veía cambiar una imagen que ya tenía.
--
-- Con esta columna el worker toma la fila de forma atómica antes de gastar un
-- solo token: el que gana el UPDATE trabaja, el resto se retira.

alter table public.creative_generations
  add column if not exists claimed_at timestamptz;

comment on column public.creative_generations.claimed_at is
  'Cuándo un worker tomó esta fila. Sirve de lock: solo trabaja quien logra el UPDATE condicional. Se libera solo pasado el tiempo de reintento.';

create index if not exists creative_generations_claim_idx
  on public.creative_generations(status, claimed_at)
  where status = 'processing';
