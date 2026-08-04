-- Keep recurring subscription invoices separate from one-off token purchases so
-- the admin center can show every actual payment, not only the subscription row.
create table if not exists public.creative_subscription_payments (
  payment_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_subscription_id text,
  plan_code text,
  status text not null default 'approved',
  amount numeric,
  currency text,
  paid_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists creative_subscription_payments_user_paid_idx
  on public.creative_subscription_payments(user_id, paid_at desc);

alter table public.creative_subscription_payments enable row level security;
grant select on public.creative_subscription_payments to authenticated;
grant select, insert, update on public.creative_subscription_payments to service_role;
