-- Los créditos comprados desaparecían con la renovación del plan.
--
-- `add_purchased_credits` SUMA la compra a credits_remaining, pero el webhook de
-- la suscripción, al renovar, hacía `credits_remaining = monthlyCredits`: una
-- asignación absoluta. O sea que quien compraba 100 imágenes sueltas y después
-- renovaba su plan Básico se quedaba con 5. Pagó dos veces y se le borró lo más
-- caro, sin ningún error, sin aviso y sin forma de notarlo salvo mirando el
-- saldo antes y después.
--
-- Se separa la cuenta: `credits_purchased` recuerda cuántos de los créditos
-- disponibles vienen de una compra suelta y por lo tanto NO caducan con el mes.
-- El consumo sigue tocando una sola columna, así que reserve/refund no cambian.

alter table public.creative_profiles
	add column if not exists credits_purchased integer not null default 0;

comment on column public.creative_profiles.credits_purchased is
	'Cuántos de los credits_remaining provienen de compras sueltas. No caducan con la renovación mensual.';

-- El tope decía 100 y el checkout permite comprar hasta 1000: una compra de 101
-- lanzaba excepción, el webhook borraba el registro del pago y devolvía 500.
-- Mercado Pago lo reintentaba para siempre y la persona nunca recibía nada.
create or replace function public.add_purchased_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if p_amount < 1 or p_amount > 1000 then
		raise exception 'credit amount must be between 1 and 1000';
	end if;

	update public.creative_profiles
	set credits_remaining = coalesce(credits_remaining, 0) + p_amount,
			credits_purchased = coalesce(credits_purchased, 0) + p_amount,
			updated_at = now()
	where user_id = p_user_id;
end;
$$;

/**
 * La recarga del mes, sin pisar lo comprado.
 *
 * El saldo comprado que sobrevive es, como mucho, lo que quedaba sin usar: si
 * alguien compró 100 y gastó 120, no le quedan 100 comprados esperando. Tomar el
 * menor de los dos es lo único que no regala créditos ni los hace desaparecer.
 */
create or replace function public.apply_subscription_refill(p_user_id uuid, p_monthly integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	sobreviven integer;
	total integer;
begin
	if p_monthly < 0 or p_monthly > 10000 then
		raise exception 'monthly credits out of range';
	end if;

	select least(coalesce(credits_purchased, 0), greatest(coalesce(credits_remaining, 0), 0))
	into sobreviven
	from public.creative_profiles
	where user_id = p_user_id;

	if sobreviven is null then
		return -1;
	end if;

	update public.creative_profiles
	set credits_remaining = p_monthly + sobreviven,
			credits_purchased = sobreviven,
			last_credit_refill_at = now(),
			updated_at = now()
	where user_id = p_user_id
	returning credits_remaining into total;

	return coalesce(total, -1);
end;
$$;

revoke all on function public.add_purchased_credits(uuid, integer) from public, anon, authenticated;
revoke all on function public.apply_subscription_refill(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_purchased_credits(uuid, integer) to service_role;
grant execute on function public.apply_subscription_refill(uuid, integer) to service_role;
