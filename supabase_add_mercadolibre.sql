-- ============================================================
-- EJECUTAR EN: Supabase Dashboard -> SQL Editor -> Run
-- Propósito: Agregar columnas de Mercado Libre a car_clients
-- ============================================================

ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS mercadolibre_access_token text,
  ADD COLUMN IF NOT EXISTS mercadolibre_refresh_token text,
  ADD COLUMN IF NOT EXISTS mercadolibre_user_id text,
  ADD COLUMN IF NOT EXISTS mercadolibre_expiration timestamptz;

-- Verificar que se agregaron correctamente:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'car_clients'
  AND column_name IN ('mercadolibre_access_token', 'mercadolibre_refresh_token', 'mercadolibre_user_id', 'mercadolibre_expiration');
