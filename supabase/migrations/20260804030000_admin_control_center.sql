-- Protected admin controls: plan/access overrides and an immutable action trail.
create table if not exists public.creative_admin_access_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_mode text not null default 'standard'
    check (access_mode in ('standard', 'plan', 'unlimited')),
  plan_code text check (plan_code in ('creator', 'pro', 'scale', 'agency', 'admin')),
  credits_override integer check (credits_override is null or credits_override >= 0),
  previous_profile jsonb,
  granted_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creative_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creative_admin_audit_log_created_idx
  on public.creative_admin_audit_log(created_at desc);
create index if not exists creative_admin_audit_log_target_idx
  on public.creative_admin_audit_log(target_user_id, created_at desc);

alter table public.creative_admin_access_overrides enable row level security;
alter table public.creative_admin_audit_log enable row level security;

drop policy if exists "admin_access_select_own" on public.creative_admin_access_overrides;
create policy "admin_access_select_own" on public.creative_admin_access_overrides
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.creative_admin_access_overrides to authenticated;
grant select, insert, update, delete on public.creative_admin_access_overrides to service_role;
grant select, insert on public.creative_admin_audit_log to service_role;

comment on table public.creative_admin_access_overrides is
  'Admin-only grants; never writable by an end user.';
comment on table public.creative_admin_audit_log is
  'Audit trail for privileged admin actions.';
