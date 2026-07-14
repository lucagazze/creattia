create extension if not exists pgcrypto;

create table public.creative_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  brand_name text,
  website_url text,
  instagram_handle text,
  brand_colors text[] not null default array['#18181b', '#ffffff']::text[],
  logo_path text,
  onboarding_completed boolean not null default false,
  credits_remaining integer not null default 3 check (credits_remaining >= 0),
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'pending', 'authorized', 'paused', 'cancelled')),
  plan_code text not null default 'trial',
  mercado_pago_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creative_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_path text,
  product_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.creative_templates (
  id integer primary key,
  name text not null,
  category text not null,
  awareness_level text not null,
  purpose text not null,
  usage_hint text not null,
  prompt_rules text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.creative_references (
  id uuid primary key default gen_random_uuid(),
  template_id integer not null references public.creative_templates(id) on delete cascade,
  name text not null,
  image_path text not null,
  prompt_notes text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.creative_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id integer,
  reference_id uuid references public.creative_references(id) on delete set null,
  product_id uuid references public.creative_products(id) on delete set null,
  title text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  output_path text,
  format text not null default 'square',
  prompt text,
  user_brief text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index creative_products_user_id_idx on public.creative_products(user_id);
create index creative_generations_user_id_created_at_idx
  on public.creative_generations(user_id, created_at desc);
create index creative_references_template_id_idx on public.creative_references(template_id);
create index creative_generations_template_id_idx on public.creative_generations(template_id);
create index creative_generations_reference_id_idx on public.creative_generations(reference_id);
create index creative_generations_product_id_idx on public.creative_generations(product_id);

alter table public.creative_profiles enable row level security;
alter table public.creative_products enable row level security;
alter table public.creative_templates enable row level security;
alter table public.creative_references enable row level security;
alter table public.creative_generations enable row level security;

create policy "profiles_select_own" on public.creative_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "profiles_insert_own" on public.creative_profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.creative_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "products_select_own" on public.creative_products
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "products_insert_own" on public.creative_products
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "products_update_own" on public.creative_products
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "products_delete_own" on public.creative_products
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "templates_read_active" on public.creative_templates
  for select to authenticated using (is_active = true);
create policy "references_read_active" on public.creative_references
  for select to authenticated using (is_active = true);
create policy "generations_select_own" on public.creative_generations
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update on public.creative_profiles to authenticated;
grant select, insert, update, delete on public.creative_products to authenticated;
grant select on public.creative_templates, public.creative_references, public.creative_generations to authenticated;
grant select, insert, update on public.creative_profiles to service_role;
grant select, insert, update, delete on public.creative_products to service_role;
grant select on public.creative_templates, public.creative_references to service_role;
grant select, insert, update on public.creative_generations to service_role;

create or replace function public.create_creative_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.creative_profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_creative_profile on auth.users;
create trigger on_auth_user_created_creative_profile
  after insert on auth.users
  for each row execute procedure public.create_creative_profile();

revoke all on function public.create_creative_profile() from public, anon, authenticated;

create or replace function public.reserve_creative_credit(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  update public.creative_profiles
  set credits_remaining = credits_remaining - 1, updated_at = now()
  where user_id = p_user_id and credits_remaining > 0
  returning credits_remaining into remaining;

  if remaining is null then
    return -1;
  end if;
  return remaining;
end;
$$;

create or replace function public.refund_creative_credit(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.creative_profiles
  set credits_remaining = credits_remaining + 1, updated_at = now()
  where user_id = p_user_id;
$$;

revoke all on function public.reserve_creative_credit(uuid) from public, anon, authenticated;
revoke all on function public.refund_creative_credit(uuid) from public, anon, authenticated;
grant execute on function public.reserve_creative_credit(uuid) to service_role;
grant execute on function public.refund_creative_credit(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-assets',
  'creative-assets',
  false,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-references',
  'creative-references',
  false,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "creative_references_select_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'creative-references');

create policy "creative_assets_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'creative-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "creative_assets_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'creative-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "creative_assets_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'creative-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'creative-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "creative_assets_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'creative-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
