alter table public.creative_profiles
  add column if not exists last_activity_at timestamptz;

create index if not exists creative_profiles_last_activity_at_idx
  on public.creative_profiles (last_activity_at desc);
