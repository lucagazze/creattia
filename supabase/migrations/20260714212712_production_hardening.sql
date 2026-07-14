-- Production hardening for accounts created before the Creattia schema existed,
-- public editorial references, and the hottest dashboard queries.

insert into public.creative_profiles (user_id, full_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (user_id) do nothing;

update storage.buckets
set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
where id = 'creative-assets';

update storage.buckets
set
  public = true,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'application/json']
where id = 'creative-references';

create index if not exists creative_generations_completed_history_idx
  on public.creative_generations(user_id, created_at desc)
  where status = 'completed';

create index if not exists creative_references_template_active_order_idx
  on public.creative_references(template_id, sort_order)
  where is_active = true
    and rights_status in ('owned', 'licensed', 'public_domain');

grant select, insert, update on public.creative_profiles to authenticated;
grant select, insert, update, delete on public.creative_products to authenticated;
grant select on public.creative_templates, public.creative_references, public.creative_generations to authenticated;
grant select, insert, delete on public.creative_template_favorites to authenticated;
grant select on public.creative_subscriptions, public.creative_generation_products to authenticated;

grant select, insert, update on public.creative_profiles to service_role;
grant select, insert, update, delete on
  public.creative_products,
  public.creative_brand_sources,
  public.creative_product_images,
  public.creative_references,
  public.creative_template_favorites,
  public.creative_subscriptions,
  public.creative_generation_products
to service_role;
grant select, insert, update on public.creative_generations to service_role;
grant select on public.creative_templates to service_role;

revoke all on function public.create_creative_profile() from public, anon, authenticated;
revoke all on function public.reserve_creative_credit(uuid) from public, anon, authenticated;
revoke all on function public.refund_creative_credit(uuid) from public, anon, authenticated;
revoke all on function public.reserve_creative_credits(uuid, integer) from public, anon, authenticated;
revoke all on function public.refund_creative_credits(uuid, integer) from public, anon, authenticated;

grant execute on function public.reserve_creative_credit(uuid) to service_role;
grant execute on function public.refund_creative_credit(uuid) to service_role;
grant execute on function public.reserve_creative_credits(uuid, integer) to service_role;
grant execute on function public.refund_creative_credits(uuid, integer) to service_role;
