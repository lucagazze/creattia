alter table public.creative_profiles
  add column brand_summary text,
  add column brand_voice text,
  add column target_audience text,
  add column catalog_status text not null default 'not_scanned'
    check (catalog_status in ('not_scanned', 'scanning', 'ready', 'partial', 'failed')),
  add column catalog_last_synced_at timestamptz,
  add column catalog_error text;

alter table public.creative_products
  add column description text,
  add column price_text text,
  add column currency text,
  add column source text not null default 'manual'
    check (source in ('manual', 'website', 'instagram')),
  add column external_id text,
  add column source_image_url text,
  add column metadata jsonb not null default '{}'::jsonb,
  add column analysis jsonb not null default '{}'::jsonb,
  add column updated_at timestamptz not null default now(),
  add column synced_at timestamptz,
  add column search_document tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(price_text, ''))
  ) stored;

alter table public.creative_generations
  add column image_type text not null default 'product'
    check (image_type in ('product', 'promotion', 'lifestyle', 'catalog')),
  add column variant_key text,
  add column settings_snapshot jsonb not null default '{}'::jsonb;

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
where id = 'creative-assets';

create table public.creative_brand_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('website', 'instagram')),
  source_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'scanning', 'ready', 'partial', 'failed')),
  title text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type)
);

create table public.creative_product_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.creative_products(id) on delete cascade,
  storage_path text not null,
  source_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index creative_products_user_source_external_uidx
  on public.creative_products(user_id, source, external_id);
create index creative_products_user_active_updated_idx
  on public.creative_products(user_id, is_active, updated_at desc);
create index creative_products_search_document_idx
  on public.creative_products using gin(search_document);
create index creative_brand_sources_user_status_idx
  on public.creative_brand_sources(user_id, status);
create index creative_product_images_user_id_idx
  on public.creative_product_images(user_id);
create index creative_product_images_product_sort_idx
  on public.creative_product_images(product_id, sort_order);
create unique index creative_product_images_product_path_uidx
  on public.creative_product_images(product_id, storage_path);

alter table public.creative_brand_sources enable row level security;
alter table public.creative_product_images enable row level security;

create policy "brand_sources_select_own" on public.creative_brand_sources
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "brand_sources_insert_own" on public.creative_brand_sources
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "brand_sources_update_own" on public.creative_brand_sources
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "brand_sources_delete_own" on public.creative_brand_sources
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "product_images_select_own" on public.creative_product_images
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "product_images_insert_own" on public.creative_product_images
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.creative_products p
      where p.id = product_id and p.user_id = (select auth.uid())
    )
  );
create policy "product_images_update_own" on public.creative_product_images
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.creative_products p
      where p.id = product_id and p.user_id = (select auth.uid())
    )
  );
create policy "product_images_delete_own" on public.creative_product_images
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.creative_brand_sources to authenticated;
grant select, insert, update, delete on public.creative_product_images to authenticated;
grant select, insert, update, delete on public.creative_brand_sources to service_role;
grant select, insert, update, delete on public.creative_product_images to service_role;
