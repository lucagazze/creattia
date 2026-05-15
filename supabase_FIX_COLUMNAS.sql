-- ============================================================
-- FIX: ASEGURAR COLUMNAS DE MONITOREO
-- Ejecutar esto si te da error 400 al registrar actividad
-- ============================================================

-- 1. Asegurar que la tabla existe
CREATE TABLE IF NOT EXISTS public.car_user_activity (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id   uuid REFERENCES public.car_clients(id) ON DELETE CASCADE,
  action      text NOT NULL,
  metadata    jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now()
);

-- 2. Agregar columnas faltantes si la tabla ya existía de antes
ALTER TABLE public.car_user_activity 
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS location jsonb DEFAULT '{}'::jsonb;

-- 3. Habilitar RLS
ALTER TABLE public.car_user_activity ENABLE ROW LEVEL SECURITY;

-- 4. Políticas (Admins ven todo, Usuarios insertan)
DROP POLICY IF EXISTS "car_activity_admin_select" ON public.car_user_activity;
CREATE POLICY "car_activity_admin_select" ON public.car_user_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.car_clients
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

DROP POLICY IF EXISTS "car_activity_user_insert" ON public.car_user_activity;
CREATE POLICY "car_activity_user_insert" ON public.car_user_activity
  FOR INSERT WITH CHECK (auth.uid() = user_id);
