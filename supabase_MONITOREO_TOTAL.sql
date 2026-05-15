-- ============================================================
-- SISTEMA C.A.R — MONITOREO DE ACTIVIDAD COMPLETO
-- Ejecutar este archivo para habilitar tracking y last_login
-- ============================================================

-- 1. Tabla de Actividad
CREATE TABLE IF NOT EXISTS public.car_user_activity (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   uuid REFERENCES public.car_clients(id) ON DELETE CASCADE,
  action      text NOT NULL, -- 'session_start', 'page_view'
  metadata    jsonb DEFAULT '{}'::jsonb,
  ip          text,
  location    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);

-- 2. Columna last_login en car_clients (si no existe)
ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS last_login timestamptz;

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_car_activity_created_at ON public.car_user_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_car_clients_last_login ON public.car_clients(last_login DESC);

-- 4. RLS y Políticas
ALTER TABLE public.car_user_activity ENABLE ROW LEVEL SECURITY;

-- Admins ven todo
DROP POLICY IF EXISTS "car_activity_admin_select" ON public.car_user_activity;
CREATE POLICY "car_activity_admin_select" ON public.car_user_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.car_clients
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

-- Usuarios insertan su propia actividad
DROP POLICY IF EXISTS "car_activity_user_insert" ON public.car_user_activity;
CREATE POLICY "car_activity_user_insert" ON public.car_user_activity
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Función para actualizar last_login automáticamente
CREATE OR REPLACE FUNCTION public.update_last_login_from_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.action = 'session_start' THEN
    UPDATE public.car_clients
    SET last_login = NEW.created_at
    WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS tr_update_last_login ON public.car_user_activity;
CREATE TRIGGER tr_update_last_login
  AFTER INSERT ON public.car_user_activity
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_login_from_activity();

-- 6. Función estadística para los gráficos
CREATE OR REPLACE FUNCTION public.get_daily_activity_stats(days_ago int DEFAULT 30)
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
  WHERE created_at >= (now() - (days_ago || ' days')::interval)
  GROUP BY day
  ORDER BY day DESC;
END;
$$;
