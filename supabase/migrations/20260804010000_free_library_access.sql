-- Primer lanzamiento freemium:
-- las cuentas gratuitas empiezan con un solo token. No tocamos créditos
-- comprados ni los créditos de suscripciones existentes.
alter table public.creative_profiles
  alter column credits_remaining set default 1;

update public.creative_profiles
set credits_remaining = 1,
    updated_at = now()
where plan_code = 'trial'
  and subscription_status = 'trial'
  and credits_remaining > 1;
