-- Expand the first template set into a subscription product that can grow
-- without requiring a frontend release for every new creative.

alter table public.creative_templates
  add column if not exists slug text,
  add column if not exists category_group text not null default 'otros',
  add column if not exists category_branch text not null default 'general',
  add column if not exists category_leaf text not null default 'general',
  add column if not exists keywords text[] not null default '{}'::text[],
  add column if not exists is_featured boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists creative_templates_slug_uidx
  on public.creative_templates(slug)
  where slug is not null;
create index if not exists creative_templates_navigation_idx
  on public.creative_templates(category_group, category_branch, category_leaf, sort_order)
  where is_active = true;
create index if not exists creative_templates_keywords_idx
  on public.creative_templates using gin(keywords);

alter table public.creative_profiles
  add column if not exists credits_monthly integer not null default 0 check (credits_monthly >= 0),
  add column if not exists subscription_period_end timestamptz,
  add column if not exists last_credit_refill_at timestamptz;

create table if not exists public.creative_template_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id integer not null references public.creative_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, template_id)
);

create index if not exists creative_template_favorites_template_id_idx
  on public.creative_template_favorites(template_id);

alter table public.creative_template_favorites enable row level security;

create policy "template_favorites_select_own" on public.creative_template_favorites
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "template_favorites_insert_own" on public.creative_template_favorites
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "template_favorites_delete_own" on public.creative_template_favorites
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.creative_template_favorites to authenticated;
grant select, insert, update, delete on public.creative_template_favorites to service_role;

create table if not exists public.creative_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'mercado_pago' check (provider in ('mercado_pago')),
  provider_subscription_id text not null unique,
  plan_code text not null check (plan_code in ('creator', 'pro', 'scale')),
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  monthly_credits integer not null check (monthly_credits > 0),
  current_period_end timestamptz,
  last_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists creative_subscriptions_user_status_idx
  on public.creative_subscriptions(user_id, status);

alter table public.creative_subscriptions enable row level security;

create policy "subscriptions_select_own" on public.creative_subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.creative_subscriptions to authenticated;
grant select, insert, update, delete on public.creative_subscriptions to service_role;

update public.creative_templates
set
  slug = coalesce(slug, 'creative-' || id::text),
  category_group = case
    when id between 13 and 22 then 'vender'
    when id between 1 and 12 then 'confianza'
    when id between 23 and 29 then 'convencer'
    when id between 30 and 39 then 'educar'
    when id between 40 and 47 then 'producto'
    when id between 48 and 50 then 'autoridad'
    else 'otros'
  end,
  category_branch = case
    when id between 13 and 22 and id in (13, 15, 16, 18, 19) then 'promociones'
    when id between 13 and 22 then 'ticket'
    when id between 1 and 12 and id in (9, 10) then 'validacion'
    when id between 1 and 12 then 'clientes'
    when id between 23 and 29 then 'comparar'
    when id between 30 and 39 and id in (35, 36, 39) then 'contar'
    when id between 30 and 39 then 'descubrir'
    when id between 40 and 47 then 'presentar'
    when id between 48 and 50 then 'respaldo'
    else 'general'
  end,
  category_leaf = case
    when id in (1, 2, 3, 11) then 'resenas'
    when id in (4, 5, 8) then 'mensajes'
    when id in (6, 7, 12) then 'ugc'
    when id = 9 then 'volumen'
    when id = 10 then 'medios'
    when id in (13, 19) then 'precio'
    when id in (15, 16) then 'urgencia'
    when id = 18 then 'envio'
    when id in (14, 17, 20) then 'packs'
    when id = 21 then 'garantia'
    when id = 22 then 'financiacion'
    when id in (23, 24) then 'competencia'
    when id in (25, 26, 27) then 'valor'
    when id in (28, 29) then 'resultado'
    when id in (30, 31, 34, 38) then 'datos'
    when id in (32, 33, 37) then 'mitos'
    when id in (35, 36) then 'entretenimiento'
    when id = 39 then 'cercania'
    when id in (40, 42, 44) then 'hero'
    when id in (41, 43, 46) then 'detalle'
    when id in (45, 47) then 'uso'
    when id in (48, 49) then 'expertos'
    when id = 50 then 'fundador'
    else 'general'
  end,
  keywords = array_remove(array[lower(name), lower(category), lower(awareness_level)], null),
  is_featured = id in (1, 6, 13, 18, 22, 30, 40, 42, 48, 50),
  sort_order = id,
  updated_at = now();
