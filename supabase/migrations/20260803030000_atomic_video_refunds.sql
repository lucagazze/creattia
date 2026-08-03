-- Mark a failed video and refund its credits in one locked transaction.
-- Repeated status requests are safe: only the first caller can refund.
create or replace function public.fail_creative_video_generation(
  p_job_id uuid,
  p_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  amount integer;
  refunded boolean := false;
begin
  select settings_snapshot
    into snapshot
  from public.creative_video_generations
  where id = p_job_id and user_id = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if coalesce((snapshot ->> 'creditRefunded')::boolean, false) = false then
    amount := case
      when coalesce(snapshot ->> 'creditCost', '') ~ '^[0-9]+$'
        then greatest(0, (snapshot ->> 'creditCost')::integer)
      else 4
    end;
    update public.creative_profiles
      set credits_remaining = credits_remaining + amount,
          updated_at = now()
      where user_id = p_user_id;
    snapshot := jsonb_set(snapshot, '{creditRefunded}', 'true'::jsonb, true);
    refunded := true;
  end if;

  update public.creative_video_generations
    set status = 'failed',
        error_code = left(coalesce(p_reason, 'El proveedor rechazó la generación.'), 500),
        settings_snapshot = snapshot
    where id = p_job_id and user_id = p_user_id;

  return refunded;
end;
$$;

revoke all on function public.fail_creative_video_generation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fail_creative_video_generation(uuid, uuid, text) to service_role;
