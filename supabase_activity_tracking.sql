-- ============================================================
-- SISTEMA C.A.R — MONITOREO DE ACTIVIDAD
-- Tracking de accesos y visualizaciones
-- ============================================================

CREATE TABLE IF NOT EXISTS public.car_user_activity (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   uuid REFERENCES public.car_clients(id) ON DELETE CASCADE,
  action      text NOT NULL, -- 'session_start', 'page_view'
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Index for faster filtering by date
CREATE INDEX IF NOT EXISTS idx_car_activity_created_at ON public.car_user_activity(created_at DESC);

-- Enable RLS
ALTER TABLE public.car_user_activity ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Admins can see all activity
CREATE POLICY "car_activity_admin_select" ON public.car_user_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.car_clients
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

-- 2. Users can insert their own activity (only authenticated)
CREATE POLICY "car_activity_user_insert" ON public.car_user_activity
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Optional: function to get statistics easily
CREATE OR REPLACE FUNCTION public.get_daily_activity_stats(days_ago int DEFAULT 7)
RETURNS TABLE (day date, total_actions bigint, unique_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    created_at::date as day,
    COUNT(*) as total_actions,
    COUNT(DISTINCT user_id) as unique_users
  FROM public.car_user_activity
  WHERE created_at >= now() - (days_ago || ' days')::interval
  GROUP BY day
  ORDER BY day DESC;
END;
$$;
