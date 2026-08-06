-- Red de seguridad para el limitador de uso.
--
-- La función `check_rate_limit` y su tabla `rate_limit_events` ya existen en el
-- proyecto, creadas a mano: no estaban en ninguna migración, así que un entorno
-- nuevo (o una restauración) se quedaba sin ellas y todos los endpoints que
-- llaman modelos de IA perdían su tope.
--
-- Esta migración las deja versionadas SIN tocar la implementación que ya está
-- corriendo: la de producción serializa las llamadas concurrentes del mismo
-- usuario con un advisory lock —cosa que una versión ingenua no hace y por eso
-- deja pasar dos requests simultáneas— y se conserva tal cual.

create table if not exists public.rate_limit_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup_idx
  on public.rate_limit_events (user_id, event_key, created_at desc);

alter table public.rate_limit_events enable row level security;
-- Nadie la lee desde el cliente: solo la escribe la función.
revoke all on public.rate_limit_events from anon, authenticated;
grant select, insert, delete on public.rate_limit_events to service_role;
grant usage, select on sequence public.rate_limit_events_id_seq to service_role;

-- Solo se crea si falta. Si ya está, se respeta la que corre hoy.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'check_rate_limit'
  ) then
    execute $fn$
      create function public.check_rate_limit(
        p_user_id uuid,
        p_event_key text,
        p_max_count integer,
        p_window_seconds integer
      )
      returns boolean
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        window_start timestamptz := now() - make_interval(secs => greatest(p_window_seconds, 1));
        used integer;
      begin
        -- Serializa las llamadas concurrentes del mismo usuario+evento: sin esto
        -- dos requests simultáneas leen el conteo antes de que ninguna inserte y
        -- las dos pasan el límite.
        perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_event_key, 0));

        delete from public.rate_limit_events
        where created_at < now() - make_interval(secs => greatest(p_window_seconds, 1) * 4);

        select count(*) into used
        from public.rate_limit_events
        where user_id = p_user_id
          and event_key = p_event_key
          and created_at >= window_start;

        if used >= greatest(p_max_count, 0) then
          return false;
        end if;

        insert into public.rate_limit_events (user_id, event_key)
        values (p_user_id, p_event_key);

        return true;
      end;
      $body$;
    $fn$;
  end if;
end
$$;

revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;
