-- Errores del servidor, guardados donde se puedan mirar.
--
-- Todos los fallos terminaban en console.error, o sea en los logs de Vercel: se
-- retienen poco, no se pueden agrupar y nadie los mira salvo que ya sepa que hay
-- un problema. Los seis bugs que aparecieron hoy —el doble cobro del carrusel,
-- el checkout trabado, los cuadrados a media resolución— no dieron ninguna
-- señal; se encontraron probando a mano.
--
-- Con esto, un error queda registrado con su contexto y se puede ver desde el
-- centro admin: cuál se repite, desde cuándo, y a cuánta gente le pasa.

create table if not exists public.creative_errors (
  id bigserial primary key,
  -- De dónde salió: el mismo identificador que ya se usa en los logs.
  context text not null,
  message text not null,
  -- Firma estable del error, para poder agrupar repeticiones del mismo problema.
  fingerprint text not null,
  user_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creative_errors_fecha_idx on public.creative_errors(created_at desc);
create index if not exists creative_errors_firma_idx on public.creative_errors(fingerprint, created_at desc);
create index if not exists creative_errors_contexto_idx on public.creative_errors(context, created_at desc);

alter table public.creative_errors enable row level security;

-- Un error puede contener datos de la petición que lo provocó: no sale del
-- servidor. El panel admin lo lee con la clave de servicio.
revoke all on public.creative_errors from anon, authenticated;
grant select, insert, delete on public.creative_errors to service_role;
grant usage, select on sequence public.creative_errors_id_seq to service_role;

comment on table public.creative_errors is
  'Errores del servidor con su contexto. Se escriben desde fail(); se leen solo desde el centro admin.';
