-- ============================================================
-- EJECUTAR EN: Supabase Dashboard -> SQL Editor -> Run
-- Propósito: Agregar columnas de TikTok Ads y TikTok orgánico a car_clients
-- ============================================================

ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS tiktok_access_token text,
  ADD COLUMN IF NOT EXISTS tiktok_refresh_token text,
  ADD COLUMN IF NOT EXISTS tiktok_advertiser_id text,
  ADD COLUMN IF NOT EXISTS tiktok_expiration timestamptz,
  ADD COLUMN IF NOT EXISTS tiktok_content_access_token text,
  ADD COLUMN IF NOT EXISTS tiktok_content_refresh_token text,
  ADD COLUMN IF NOT EXISTS tiktok_content_open_id text,
  ADD COLUMN IF NOT EXISTS tiktok_content_display_name text,
  ADD COLUMN IF NOT EXISTS tiktok_content_avatar_url text,
  ADD COLUMN IF NOT EXISTS tiktok_content_expiration timestamptz,
  ADD COLUMN IF NOT EXISTS youtube_access_token text,
  ADD COLUMN IF NOT EXISTS youtube_refresh_token text,
  ADD COLUMN IF NOT EXISTS youtube_channel_id text,
  ADD COLUMN IF NOT EXISTS youtube_channel_title text,
  ADD COLUMN IF NOT EXISTS youtube_expiration timestamptz;

-- Verificar que se agregaron correctamente:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'car_clients'
  AND column_name IN (
    'tiktok_access_token',
    'tiktok_refresh_token',
    'tiktok_advertiser_id',
    'tiktok_expiration',
    'tiktok_content_access_token',
    'tiktok_content_refresh_token',
    'tiktok_content_open_id',
    'tiktok_content_display_name',
    'tiktok_content_avatar_url',
    'tiktok_content_expiration',
    'youtube_access_token',
    'youtube_refresh_token',
    'youtube_channel_id',
    'youtube_channel_title',
    'youtube_expiration'
  );
