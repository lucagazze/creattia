-- El plan anual entregaba los doce meses de tokens el primer día.
--
-- El webhook acreditaba `créditos del plan × 12` apenas Mercado Pago autorizaba
-- la suscripción: quien contrataba Pro anual se llevaba 480 tokens el día uno.
-- El cobro del año entra igual, pero el costo real de esos 480 tokens —USD 0.24
-- cada uno, o sea USD 115— se puede consumir entero en la primera semana, con
-- once meses de servicio todavía por delante. Era el único lugar del producto
-- donde el margen dependía de que el cliente NO usara lo que pagó.
--
-- De acá en adelante el anual entrega un mes por vez, igual que el mensual. Lo
-- que cambia es la entrega, no el cobro.
--
-- El problema práctico: en el plan anual Mercado Pago avisa UNA sola vez al año,
-- así que no hay ningún cobro que dispare los meses 2 al 12. Los reparte una
-- tarea diaria (/api/creativos/cron/recarga-anual), y esta migración le da las
-- dos cosas que necesita: saber qué suscripción es anual y desde cuándo se
-- cuentan sus meses, y un registro de qué mes ya se entregó para no entregarlo
-- dos veces.

-- ── 1. La suscripción tiene que saber que es anual ──────────────────────────
--
-- Hasta hoy el ciclo solo vivía en el `external_reference` de Mercado Pago y se
-- podía deducir de `monthly_credits`, que para el anual guardaba el total del
-- año. Con la entrega mensual esa pista desaparece —anual y mensual pasan a
-- guardar el mismo número—, así que el ciclo se guarda explícito.
alter table public.creative_subscriptions
  add column if not exists billing_cycle text not null default 'monthly';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'creative_subscriptions_billing_cycle_check'
  ) then
    alter table public.creative_subscriptions
      add constraint creative_subscriptions_billing_cycle_check
      check (billing_cycle in ('monthly', 'yearly'));
  end if;
end
$$;

-- Desde cuándo se cuentan los doce meses del año pagado. Lo escribe el webhook
-- recién DESPUÉS de acreditar, nunca antes: si se anclara al recibir el aviso,
-- un reintento de Mercado Pago correría la fecha sin que hubiera cobro nuevo y
-- la tarea diaria volvería a repartir desde el mes uno.
alter table public.creative_subscriptions
  add column if not exists cycle_anchor_at timestamptz;

comment on column public.creative_subscriptions.billing_cycle is
  'monthly o yearly. El anual cobra una vez al año pero entrega los tokens mes a mes.';
comment on column public.creative_subscriptions.cycle_anchor_at is
  'Arranque del año pagado. La recarga diaria calcula contra esta fecha qué mes toca entregar.';

-- Backfill a propósito incompleto: se marca cuáles son anuales pero NO se les
-- pone anclaje, y sin anclaje la tarea diaria las ignora.
--
-- Es deliberado: esas cuentas YA recibieron los doce meses por adelantado. Si
-- entraran al circuito nuevo, la primera recarga les dejaría el saldo de un mes
-- en lugar de lo que tienen hoy, porque apply_subscription_refill ASIGNA el
-- saldo del mes, no lo suma. Sería sacarle tokens a alguien que ya los pagó.
-- Entran solas al esquema nuevo cuando renueven el año: ahí el webhook les pone
-- el anclaje.
--
-- Se reconocen por la fecha del próximo cobro y no por los créditos: una
-- suscripción mensual nunca tiene el próximo cobro a más de un mes vista, así
-- que todo lo que apunte más allá de dos meses solo puede ser anual. Atarlo a
-- "monthly_credits es doce veces el del plan" obligaría a copiar acá los tokens
-- de cada plan, y esos números se mueven con la oferta comercial: la migración
-- quedaría mintiendo el día que cambien.
update public.creative_subscriptions
set billing_cycle = 'yearly'
where cycle_anchor_at is null
  and current_period_end is not null
  and current_period_end > now() + interval '2 months';

-- ── 2. Registro de meses entregados ─────────────────────────────────────────
--
-- La idempotencia se resuelve igual que en las dos tablas de plata que nunca
-- acreditaron de más —creative_credit_purchases y creative_subscription_payments—:
-- la clave natural del hecho ES la clave primaria. Allá el hecho es "este pago"
-- y la clave es el id del pago; acá el hecho es "el mes que arranca tal día para
-- tal suscripción", así que la clave se arma con el id de la suscripción y la
-- fecha de inicio de ese mes.
--
-- Insertar primero y acreditar solo si el insert entró convierte el "no
-- acreditar dos veces" en una garantía de Postgres, y no en una comparación de
-- fechas que puede fallar por una carrera entre dos ejecuciones, por un
-- reintento o por un reloj corrido. Ya nos pasó con las renovaciones: mientras
-- la decisión dependió de comparar next_payment_date, hubo meses cobrados que
-- nunca se acreditaron.
create table if not exists public.creative_subscription_refills (
  -- '<provider_subscription_id>:<YYYY-MM-DD del inicio del mes>'
  refill_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_subscription_id text not null,
  plan_code text not null,
  -- 1 es el mes que viaja junto con el cobro anual (lo entrega el webhook);
  -- del 2 al 12 los entrega la tarea diaria.
  cycle_index integer not null check (cycle_index between 1 and 12),
  credits integer not null check (credits >= 0),
  -- 'webhook' | 'cron'
  source text not null default 'cron',
  period_start timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists creative_subscription_refills_user_idx
  on public.creative_subscription_refills(user_id, period_start desc);

alter table public.creative_subscription_refills enable row level security;

-- Contabilidad interna: no se lee desde el navegador. Sin delete tampoco para
-- authenticated — borrar una fila de acá es regalarse un mes.
revoke all on public.creative_subscription_refills from anon, authenticated;
grant select, insert, delete on public.creative_subscription_refills to service_role;

comment on table public.creative_subscription_refills is
  'Qué mes del plan anual se entregó y cuándo. La clave primaria impide entregar dos veces el mismo mes.';
