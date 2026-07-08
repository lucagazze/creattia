create table if not exists public.creattia_ad_references (
  id text primary key,
  source_file text not null,
  storage_bucket text not null default 'creattia-ad-references',
  storage_path text not null,
  public_url text not null,
  width integer,
  height integer,
  aspect_ratio numeric,
  archetype text not null,
  industry text,
  angle text,
  ring text,
  layout text,
  prompt_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creattia_ad_references_archetype_idx
  on public.creattia_ad_references (archetype);

create index if not exists creattia_ad_references_angle_idx
  on public.creattia_ad_references (angle);

create index if not exists creattia_ad_references_ring_idx
  on public.creattia_ad_references (ring);

create index if not exists creattia_ad_references_metadata_idx
  on public.creattia_ad_references using gin (metadata);

create or replace function public.set_creattia_ad_references_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_creattia_ad_references_updated_at
  on public.creattia_ad_references;

create trigger set_creattia_ad_references_updated_at
before update on public.creattia_ad_references
for each row
execute function public.set_creattia_ad_references_updated_at();

