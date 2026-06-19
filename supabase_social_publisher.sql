-- Social publisher: videos uploaded once and distributed to connected channels.

ALTER TABLE public.car_clients
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'car-social-videos',
  'car-social-videos',
  true,
  524288000,
  ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm'];

CREATE TABLE IF NOT EXISTS public.car_social_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.car_clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  caption TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL,
  video_path TEXT,
  selected_channels TEXT[] NOT NULL DEFAULT '{}',
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

ALTER TABLE public.car_social_publications
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_car_social_publications_client_created
  ON public.car_social_publications(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_car_social_publications_scheduled_due
  ON public.car_social_publications(status, scheduled_at)
  WHERE status = 'scheduled';

ALTER TABLE public.car_social_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their social publications" ON public.car_social_publications;
CREATE POLICY "Users can read their social publications"
  ON public.car_social_publications FOR SELECT
  USING (
    client_id IN (SELECT id FROM public.car_clients WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.car_business_accounts
      WHERE business_id = public.car_social_publications.client_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
    OR EXISTS (SELECT 1 FROM public.car_clients WHERE user_id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Users can insert their social publications" ON public.car_social_publications;
CREATE POLICY "Users can insert their social publications"
  ON public.car_social_publications FOR INSERT
  WITH CHECK (
    client_id IN (SELECT id FROM public.car_clients WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.car_business_accounts
      WHERE business_id = public.car_social_publications.client_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
    OR EXISTS (SELECT 1 FROM public.car_clients WHERE user_id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Users can upload social videos" ON storage.objects;
CREATE POLICY "Users can upload social videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'car-social-videos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (SELECT 1 FROM public.car_clients WHERE user_id = auth.uid() AND is_admin = true)
    )
  );

DROP POLICY IF EXISTS "Public can read social videos" ON storage.objects;
CREATE POLICY "Public can read social videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'car-social-videos');

DROP POLICY IF EXISTS "Users can update own social videos" ON storage.objects;
CREATE POLICY "Users can update own social videos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'car-social-videos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (SELECT 1 FROM public.car_clients WHERE user_id = auth.uid() AND is_admin = true)
    )
  )
  WITH CHECK (
    bucket_id = 'car-social-videos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (SELECT 1 FROM public.car_clients WHERE user_id = auth.uid() AND is_admin = true)
    )
  );
