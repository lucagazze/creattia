-- ============================================================
-- EJECUTAR EN: Supabase Dashboard -> SQL Editor -> Run
-- Propósito: Agregar las columnas faltantes a car_clients
-- ============================================================

-- Agregar columnas de Meta Ads (si no existen)
ALTER TABLE public.car_clients ADD COLUMN IF NOT EXISTS meta_account_id text;
ALTER TABLE public.car_clients ADD COLUMN IF NOT EXISTS meta_pixel_id text;

-- Agregar columnas de Klaviyo (si no existen)
ALTER TABLE public.car_clients ADD COLUMN IF NOT EXISTS klaviyo_api_key text;
ALTER TABLE public.car_clients ADD COLUMN IF NOT EXISTS klaviyo_list_id text;

-- Asegurarse de que chatwoot exista (por las dudas)
ALTER TABLE public.car_clients ADD COLUMN IF NOT EXISTS chatwoot_url text;
ALTER TABLE public.car_clients ADD COLUMN IF NOT EXISTS chatwoot_token text;

-- IMPORTANTE: 
-- Después de ejecutar este SQL, refrescá (F5) tu aplicación para que 
-- tome los cambios en la base de datos y no tire el error 400.
