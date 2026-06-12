-- ============================================================
-- EJECUTAR EN: Supabase Dashboard -> SQL Editor -> Run
-- Propósito: Agregar columnas de TikTok Ads a car_clients
-- ============================================================

ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS tiktok_access_token text,
  ADD COLUMN IF NOT EXISTS tiktok_refresh_token text,
  ADD COLUMN IF NOT EXISTS tiktok_advertiser_id text,
  ADD COLUMN IF NOT EXISTS tiktok_expiration timestamptz;

-- Verificar que se agregaron correctamente:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'car_clients'
  AND column_name IN ('tiktok_access_token', 'tiktok_refresh_token', 'tiktok_advertiser_id', 'tiktok_expiration');
