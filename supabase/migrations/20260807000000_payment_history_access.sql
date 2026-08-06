-- Historial de pagos visible para su dueño.
--
-- Las dos tablas guardaban los cobros desde el webhook, pero tenían RLS activo
-- sin ninguna política: con eso Postgres niega todo, así que ni el propio
-- usuario podía leer sus pagos. En la app, "Historial de pagos" era un cartel
-- fijo que decía "no tenés facturas todavía" sin consultar nada.
--
-- Solo lectura, y solo de las filas propias: quien cobra es el webhook con la
-- clave de servicio, así que nadie más necesita escribir acá.

alter table public.creative_credit_purchases enable row level security;
alter table public.creative_subscription_payments enable row level security;

drop policy if exists "credit_purchases_select_own" on public.creative_credit_purchases;
create policy "credit_purchases_select_own" on public.creative_credit_purchases
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "subscription_payments_select_own" on public.creative_subscription_payments;
create policy "subscription_payments_select_own" on public.creative_subscription_payments
  for select to authenticated using ((select auth.uid()) = user_id);

-- El rol anónimo no tiene por qué mirar cobros de nadie.
revoke all on public.creative_credit_purchases from anon;
revoke all on public.creative_subscription_payments from anon;

-- Al usuario le alcanza con leer; escribir es cosa del webhook.
revoke insert, update, delete on public.creative_credit_purchases from authenticated;
revoke insert, update, delete on public.creative_subscription_payments from authenticated;
grant select on public.creative_credit_purchases to authenticated;
grant select on public.creative_subscription_payments to authenticated;

create index if not exists creative_credit_purchases_user_idx
  on public.creative_credit_purchases(user_id, created_at desc);
create index if not exists creative_subscription_payments_user_idx
  on public.creative_subscription_payments(user_id, coalesce(paid_at, created_at) desc);
