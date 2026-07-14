-- Multi-product generations, batched outputs, and auditable reference sources.

alter table public.creative_generations
  add column if not exists batch_id uuid,
  add column if not exists output_index smallint not null default 1,
  add column if not exists requested_outputs smallint not null default 1;

update public.creative_generations
set batch_id = id
where batch_id is null;

alter table public.creative_generations
  alter column batch_id set default gen_random_uuid(),
  alter column batch_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'creative_generations_output_index_check'
      and conrelid = 'public.creative_generations'::regclass
  ) then
    alter table public.creative_generations
      add constraint creative_generations_output_index_check
      check (output_index between 1 and 4);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'creative_generations_requested_outputs_check'
      and conrelid = 'public.creative_generations'::regclass
  ) then
    alter table public.creative_generations
      add constraint creative_generations_requested_outputs_check
      check (requested_outputs between 1 and 4);
  end if;
end $$;

create index if not exists creative_generations_user_batch_idx
  on public.creative_generations(user_id, batch_id, output_index);
create unique index if not exists creative_generations_id_user_uidx
  on public.creative_generations(id, user_id);
create unique index if not exists creative_products_id_user_uidx
  on public.creative_products(id, user_id);

create table if not exists public.creative_generation_products (
  generation_id uuid not null,
  product_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  sort_order smallint not null default 0 check (sort_order between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (generation_id, product_id),
  foreign key (generation_id, user_id)
    references public.creative_generations(id, user_id) on delete cascade,
  foreign key (product_id, user_id)
    references public.creative_products(id, user_id) on delete restrict
);

create index if not exists creative_generation_products_product_idx
  on public.creative_generation_products(product_id);
create index if not exists creative_generation_products_user_generation_idx
  on public.creative_generation_products(user_id, generation_id);

alter table public.creative_generation_products enable row level security;

create policy "generation_products_select_own" on public.creative_generation_products
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.creative_generation_products to authenticated;
grant select, insert, update, delete on public.creative_generation_products to service_role;

alter table public.creative_references
  add column if not exists source_url text,
  add column if not exists source_platform text,
  add column if not exists rights_status text not null default 'unverified',
  add column if not exists license_notes text,
  add column if not exists category_group text,
  add column if not exists category_branch text,
  add column if not exists category_leaf text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'creative_references_rights_status_check'
      and conrelid = 'public.creative_references'::regclass
  ) then
    alter table public.creative_references
      add constraint creative_references_rights_status_check
      check (rights_status in ('owned', 'licensed', 'public_domain', 'unverified'));
  end if;
end $$;

create index if not exists creative_references_active_taxonomy_idx
  on public.creative_references(category_group, category_branch, category_leaf, sort_order)
  where is_active = true;

drop policy if exists "references_read_active" on public.creative_references;
create policy "references_read_active" on public.creative_references
  for select to authenticated
  using (
    is_active = true
    and rights_status in ('owned', 'licensed', 'public_domain')
  );

grant select, insert, update, delete on public.creative_references to service_role;

create or replace function public.reserve_creative_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  if p_amount < 1 or p_amount > 4 then
    raise exception 'credit amount must be between 1 and 4';
  end if;

  update public.creative_profiles
  set credits_remaining = credits_remaining - p_amount,
      updated_at = now()
  where user_id = p_user_id
    and credits_remaining >= p_amount
  returning credits_remaining into remaining;

  return coalesce(remaining, -1);
end;
$$;

create or replace function public.refund_creative_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount < 1 or p_amount > 4 then
    raise exception 'credit amount must be between 1 and 4';
  end if;

  update public.creative_profiles
  set credits_remaining = credits_remaining + p_amount,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.reserve_creative_credits(uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_creative_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_creative_credits(uuid, integer) to service_role;
grant execute on function public.refund_creative_credits(uuid, integer) to service_role;
