-- El código llamaba a `check_rate_limit` desde julio, pero la función nunca se
-- creó: la llamada fallaba siempre y el limitador dejaba pasar todo en silencio,
-- así que los endpoints que llaman modelos de IA no tenían ningún tope real.
--
-- Acá se crea de verdad. Cuenta eventos por usuario y clave en una ventana
-- deslizante; devuelve false cuando se pasó del máximo.

create table if not exists public.creative_rate_limit_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists creative_rate_limit_events_lookup_idx
  on public.creative_rate_limit_events (user_id, event_key, created_at desc);

alter table public.creative_rate_limit_events enable row level security;
-- Nadie la lee desde el cliente: solo la escribe la función de abajo.
revoke all on public.creative_rate_limit_events from anon, authenticated;
grant select, insert, delete on public.creative_rate_limit_events to service_role;
grant usage, select on sequence public.creative_rate_limit_events_id_seq to service_role;

create or replace function public.check_rate_limit(
  p_user_id uuid,
  p_event_key text,
  p_max_count integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  window_start timestamptz := now() - make_interval(secs => greatest(p_window_seconds, 1));
  used integer;
begin
  -- Limpieza oportunista: los eventos viejos de este usuario y esta clave ya no
  -- cuentan para nada, así la tabla no crece sin fin.
  delete from public.creative_rate_limit_events
  where user_id = p_user_id
    and event_key = p_event_key
    and created_at < window_start;

  select count(*) into used
  from public.creative_rate_limit_events
  where user_id = p_user_id
    and event_key = p_event_key
    and created_at >= window_start;

  if used >= greatest(p_max_count, 0) then
    return false;
  end if;

  insert into public.creative_rate_limit_events (user_id, event_key)
  values (p_user_id, p_event_key);

  return true;
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;
