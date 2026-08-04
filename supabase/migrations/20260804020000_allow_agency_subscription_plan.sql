-- The Agency plan is part of the public pricing table and must be accepted by
-- the provider subscription record constraint as well.
alter table public.creative_subscriptions
  drop constraint if exists creative_subscriptions_plan_code_check;

alter table public.creative_subscriptions
  add constraint creative_subscriptions_plan_code_check
  check (plan_code in ('creator', 'pro', 'scale', 'agency'));
