-- Compras únicas de créditos (pago por imagen). payment_id garantiza
-- idempotencia: el webhook de Mercado Pago puede llegar repetido.
create table if not exists public.creative_credit_purchases (
  payment_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  credits integer not null,
  amount numeric,
  currency text,
  created_at timestamptz not null default now()
);

alter table public.creative_credit_purchases enable row level security;
-- Sin políticas: solo el service role escribe y lee.
