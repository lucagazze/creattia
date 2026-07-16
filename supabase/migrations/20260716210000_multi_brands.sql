-- Marcas múltiples por usuario (límite según plan: creator 1, pro 3, scale 5).
-- La marca activa se espeja en creative_profiles para que la generación no cambie.
create table if not exists public.creative_brands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  website_url text,
  logo_path text,
  brand_colors text[],
  brand_style jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creative_brands enable row level security;

drop policy if exists "brands_select_own" on public.creative_brands;
create policy "brands_select_own" on public.creative_brands
  for select using (auth.uid() = user_id);

alter table public.creative_profiles add column if not exists active_brand_id uuid;
