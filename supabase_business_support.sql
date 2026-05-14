
-- ============================================================
-- EJECUTAR EN: Supabase Dashboard -> SQL Editor -> Run
-- Propósito: Estructura de Negocios y Cuentas (Multiusuario)
-- ============================================================

-- 1. Crear tabla de Negocios
CREATE TABLE IF NOT EXISTS public.car_businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    industry text,
    plan text,
    meta_account_id text,
    klaviyo_api_key text,
    chatwoot_url text,
    chatwoot_token text,
    ecommerce_platform text,
    shopify_domain text,
    shopify_access_token text,
    tiendanube_store_id text,
    tiendanube_access_token text,
    client_tags text[],
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Vincular car_clients a Negocios
ALTER TABLE public.car_clients ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.car_businesses(id);

-- 3. Migración inicial: Crear un negocio por cada cliente existente
DO $$
DECLARE
    r RECORD;
    new_biz_id uuid;
BEGIN
    FOR r IN SELECT * FROM public.car_clients WHERE business_id IS NULL LOOP
        INSERT INTO public.car_businesses (
            name, industry, plan, meta_account_id, klaviyo_api_key,
            chatwoot_url, chatwoot_token, ecommerce_platform,
            shopify_domain, shopify_access_token, tiendanube_store_id,
            tiendanube_access_token, client_tags
        ) VALUES (
            r.business_name, r.industry, r.plan, r.meta_account_id, r.klaviyo_api_key,
            r.chatwoot_url, r.chatwoot_token, r.ecommerce_platform,
            r.shopify_domain, r.shopify_access_token, r.tiendanube_store_id,
            r.tiendanube_access_token, r.client_tags
        ) RETURNING id INTO new_biz_id;

        UPDATE public.car_clients SET business_id = new_biz_id WHERE id = r.id;
    END LOOP;
END $$;
