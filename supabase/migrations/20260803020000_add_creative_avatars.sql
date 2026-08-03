-- Reusable people/creator identities for video generation.
create table if not exists public.creative_avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  consent_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_avatar_images (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references public.creative_avatars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (avatar_id, storage_path)
);

create index if not exists creative_avatars_user_updated_idx
  on public.creative_avatars(user_id, updated_at desc);
create index if not exists creative_avatar_images_avatar_sort_idx
  on public.creative_avatar_images(avatar_id, sort_order);

alter table public.creative_avatars enable row level security;
alter table public.creative_avatar_images enable row level security;

create policy "avatars_select_own" on public.creative_avatars
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "avatars_insert_own" on public.creative_avatars
  for insert to authenticated with check ((select auth.uid()) = user_id and consent_confirmed = true);
create policy "avatars_update_own" on public.creative_avatars
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "avatars_delete_own" on public.creative_avatars
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "avatar_images_select_own" on public.creative_avatar_images
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "avatar_images_insert_own" on public.creative_avatar_images
  for insert to authenticated with check (
    (select auth.uid()) = user_id and exists (
      select 1 from public.creative_avatars avatar
      where avatar.id = avatar_id and avatar.user_id = (select auth.uid()) and avatar.consent_confirmed = true
    )
  );
create policy "avatar_images_delete_own" on public.creative_avatar_images
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.creative_avatars to authenticated, service_role;
grant select, insert, delete on public.creative_avatar_images to authenticated, service_role;
