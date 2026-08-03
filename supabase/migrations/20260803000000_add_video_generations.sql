-- Video generation jobs are separate from image generations because the
-- provider is asynchronous and returns a downloadable MP4 much later.
create table if not exists public.creative_video_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'openai',
  provider_job_id text,
  status text not null default 'queued'
    check (status in ('queued', 'in_progress', 'completed', 'failed')),
  progress smallint not null default 0 check (progress between 0 and 100),
  title text not null,
  reference_video_url text not null,
  reference_poster_url text,
  reference_script text,
  product_id uuid references public.creative_products(id) on delete set null,
  prompt text,
  model text not null default 'sora-2',
  duration_seconds smallint not null default 8,
  size text not null default '720x1280',
  output_path text,
  error_code text,
  settings_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists creative_video_generations_user_created_idx
  on public.creative_video_generations(user_id, created_at desc);
create index if not exists creative_video_generations_provider_job_idx
  on public.creative_video_generations(provider, provider_job_id);

alter table public.creative_video_generations enable row level security;

create policy "video_generations_select_own" on public.creative_video_generations
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.creative_video_generations to authenticated;
grant select, insert, update, delete on public.creative_video_generations to service_role;

-- Keep generated video files private and expose them only through short-lived
-- signed URLs returned by the status endpoint.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-video-outputs',
  'creative-video-outputs',
  false,
  104857600,
  array['video/mp4']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
