-- Los anuncios ganadores marcados con "me gusta" vivían solo en localStorage
-- (`creattia-liked-scraped-v1:<userId>`): se perdían al limpiar el navegador y
-- no aparecían al entrar desde otro dispositivo. Pasan a la cuenta.

create table if not exists public.creative_winner_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, image_path)
);

create index if not exists creative_winner_favorites_user_idx
  on public.creative_winner_favorites(user_id, created_at desc);

alter table public.creative_winner_favorites enable row level security;

drop policy if exists "winner_favorites_select_own" on public.creative_winner_favorites;
create policy "winner_favorites_select_own" on public.creative_winner_favorites
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "winner_favorites_insert_own" on public.creative_winner_favorites;
create policy "winner_favorites_insert_own" on public.creative_winner_favorites
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "winner_favorites_delete_own" on public.creative_winner_favorites;
create policy "winner_favorites_delete_own" on public.creative_winner_favorites
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, delete on public.creative_winner_favorites to authenticated;
grant select, insert, delete on public.creative_winner_favorites to service_role;
