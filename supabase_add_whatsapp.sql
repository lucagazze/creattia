-- ============================================================
-- EJECUTAR EN: Supabase Dashboard -> SQL Editor -> Run
-- Propósito: Agregar columnas de WhatsApp Cloud API a car_clients
-- ============================================================

ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id text,
  ADD COLUMN IF NOT EXISTS whatsapp_access_token text,
  ADD COLUMN IF NOT EXISTS whatsapp_business_account_id text,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_number text;

-- Verificar que se agregaron correctamente:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'car_clients'
  AND column_name IN ('whatsapp_phone_number_id', 'whatsapp_access_token', 'whatsapp_business_account_id', 'whatsapp_verified_number');
