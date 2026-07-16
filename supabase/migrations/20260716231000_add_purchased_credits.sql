-- Acreditar créditos comprados (pago único). Solo service role.
create or replace function public.add_purchased_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount < 1 or p_amount > 100 then
    raise exception 'credit amount must be between 1 and 100';
  end if;

  update public.creative_profiles
  set credits_remaining = coalesce(credits_remaining, 0) + p_amount,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.add_purchased_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_purchased_credits(uuid, integer) to service_role;
