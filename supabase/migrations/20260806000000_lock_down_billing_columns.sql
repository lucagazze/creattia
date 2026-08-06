-- Cierra tres agujeros que permitían usar Creattia entero sin pagar.
--
-- 1. `grant update on creative_profiles to authenticated` daba permiso de
--    escritura sobre TODA la fila, y RLS no filtra por columna: cualquier
--    cuenta podía hacer
--      update creative_profiles set credits_remaining = 99999,
--             plan_code = 'agency', subscription_status = 'authorized'
--    desde el navegador con la clave publishable. Ahora el cliente solo puede
--    tocar los campos de marca; créditos, plan y estado de suscripción quedan
--    exclusivamente en manos del service_role (webhook de Mercado Pago y RPCs).
--
-- 2. `creative_generations` no tenía un índice para el barrido de trabajos
--    colgados, que ahora corre seguido.
--
-- El cierre del bucket `creative-references` va aparte, en
-- 20260806002000_private_reference_bucket.sql, porque antes hay que copiar la
-- muestra pública de la landing al bucket nuevo.

-- ── 1. Perfiles: permisos por columna ────────────────────────────────────────
revoke insert, update on public.creative_profiles from authenticated;

grant insert (user_id, full_name, brand_name, website_url, instagram_handle,
              brand_colors, logo_path, onboarding_completed, updated_at)
  on public.creative_profiles to authenticated;

grant update (full_name, brand_name, website_url, instagram_handle,
              brand_colors, logo_path, onboarding_completed, updated_at)
  on public.creative_profiles to authenticated;

-- Defensa en profundidad: aunque alguien recupere el permiso por error, este
-- trigger impide que una sesión de usuario mueva las columnas de facturación.
-- El service_role las sigue escribiendo sin restricción.
create or replace function public.guard_creative_profile_billing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- El trigger corre con el rol de quien escribe (security invoker), así que
  -- alcanza con mirar quién es: el backend usa service_role, el navegador
  -- siempre llega como 'authenticated' o 'anon'.
  if current_user in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;

  new.credits_remaining := old.credits_remaining;
  new.credits_monthly := old.credits_monthly;
  new.plan_code := old.plan_code;
  new.subscription_status := old.subscription_status;
  new.subscription_period_end := old.subscription_period_end;
  new.last_credit_refill_at := old.last_credit_refill_at;
  new.mercado_pago_subscription_id := old.mercado_pago_subscription_id;
  return new;
end;
$$;

drop trigger if exists creative_profiles_guard_billing on public.creative_profiles;
create trigger creative_profiles_guard_billing
  before update on public.creative_profiles
  for each row execute procedure public.guard_creative_profile_billing();

revoke all on function public.guard_creative_profile_billing() from public, anon, authenticated;

-- ── 2. Índice para el barrido de generaciones colgadas ───────────────────────
create index if not exists creative_generations_stuck_idx
  on public.creative_generations(status, created_at)
  where status = 'processing';

-- ── 3. Tope de créditos comprados alineado con el checkout ───────────────────
-- El checkout permite comprar hasta 1000 créditos y el webhook los valida en
-- ese mismo rango, pero add_purchased_credits abortaba arriba de 100: el
-- usuario pagaba, la RPC tiraba excepción, el webhook devolvía 500 y borraba el
-- registro del pago. Resultado: plata cobrada y cero créditos acreditados.
create or replace function public.add_purchased_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount < 1 or p_amount > 1000 then
    raise exception 'credit amount must be between 1 and 1000';
  end if;

  update public.creative_profiles
  set credits_remaining = coalesce(credits_remaining, 0) + p_amount,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.add_purchased_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_purchased_credits(uuid, integer) to service_role;
