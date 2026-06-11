-- ============================================================
-- EJECUTAR EN: Supabase Dashboard -> SQL Editor -> Run
-- Propósito: Agregar columna facebook_access_token a car_clients
-- ============================================================

ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS facebook_access_token text;

-- Verificar que quedó bien:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'car_clients'
  AND column_name IN ('meta_account_id', 'meta_pixel_id', 'facebook_access_token');
