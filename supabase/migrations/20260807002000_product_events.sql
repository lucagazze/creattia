-- Eventos de producto.
--
-- Se podía saber quién generó una imagen o quién pagó, porque eso deja fila en
-- su tabla. Lo que NO se podía saber es qué pasa con quien NO llega hasta ahí:
-- cuánta gente abre la app y no escanea nada, cuánta escanea y no genera, cuánta
-- mira los planes y no abre el checkout. Ese tramo es justamente donde se pierde
-- casi todo el mundo, y no dejaba ningún rastro.
--
-- Una tabla chata y barata: nombre del evento, usuario y unos pocos datos. Se
-- escribe desde el servidor, nunca desde el navegador, así que nadie puede
-- inventar eventos.

create table if not exists public.creative_events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  -- 'app_abierta' | 'url_escaneada' | 'referencia_analizada' | 'generacion_pedida'
  -- 'planes_vistos' | 'checkout_abierto' | 'checkout_vuelto' | 'plan_cancelado' …
  event text not null,
  -- Contexto mínimo del evento, sin datos personales.
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creative_events_evento_idx on public.creative_events(event, created_at desc);
create index if not exists creative_events_user_idx on public.creative_events(user_id, created_at desc);
create index if not exists creative_events_fecha_idx on public.creative_events(created_at desc);

alter table public.creative_events enable row level security;

-- Nadie lee esto desde el navegador: las métricas se calculan en el servidor con
-- la clave de servicio, y un usuario no tiene por qué ver la actividad de otros.
revoke all on public.creative_events from anon, authenticated;
grant select, insert on public.creative_events to service_role;
grant usage, select on sequence public.creative_events_id_seq to service_role;

comment on table public.creative_events is
  'Eventos de producto para medir el embudo. Se escriben desde el servidor; nunca desde el cliente.';
