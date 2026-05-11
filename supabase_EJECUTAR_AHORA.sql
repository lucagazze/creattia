-- ============================================================
-- EJECUTAR COMPLETO EN: Supabase → SQL Editor → Run
-- ============================================================

-- 1. CREAR TABLA (con todas las columnas de una vez)
CREATE TABLE IF NOT EXISTS public.car_clients (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL UNIQUE,
  business_name     text        NOT NULL,
  business_logo_url text,
  industry          text,
  plan              text        DEFAULT 'CAR Growth',
  active            boolean     NOT NULL DEFAULT true,
  is_admin          boolean     NOT NULL DEFAULT false,
  -- Meta Ads
  meta_account_id   text,
  meta_pixel_id     text,
  -- Klaviyo
  klaviyo_api_key   text,
  klaviyo_list_id   text,
  -- Chatwoot
  chatwoot_url      text,
  chatwoot_token    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT car_clients_pkey PRIMARY KEY (id),
  CONSTRAINT car_clients_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 2. HABILITAR RLS
ALTER TABLE public.car_clients ENABLE ROW LEVEL SECURITY;

-- 3. FUNCIÓN HELPER (evita recursión en políticas)
CREATE OR REPLACE FUNCTION public.is_car_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.car_clients
    WHERE user_id = auth.uid() AND is_admin = true
  );
$$;

-- 4. ELIMINAR POLÍTICAS VIEJAS (si existen)
DROP POLICY IF EXISTS "car_clients_select_own"        ON public.car_clients;
DROP POLICY IF EXISTS "car_clients_update_own"        ON public.car_clients;
DROP POLICY IF EXISTS "car_clients_admin_select_all"  ON public.car_clients;
DROP POLICY IF EXISTS "car_clients_admin_insert"      ON public.car_clients;
DROP POLICY IF EXISTS "car_clients_admin_update_all"  ON public.car_clients;

-- 5. CREAR POLÍTICAS LIMPIAS
CREATE POLICY "car_clients_select_own"
  ON public.car_clients FOR SELECT
  USING (auth.uid() = user_id OR public.is_car_admin());

CREATE POLICY "car_clients_update_own"
  ON public.car_clients FOR UPDATE
  USING (auth.uid() = user_id OR public.is_car_admin());

CREATE POLICY "car_clients_admin_insert"
  ON public.car_clients FOR INSERT
  WITH CHECK (public.is_car_admin());

-- 6. ÍNDICE
CREATE INDEX IF NOT EXISTS idx_car_clients_user_id ON public.car_clients(user_id);

-- 7. INSERTAR TU PERFIL COMO ADMIN
--    (ignorar si ya existe)
INSERT INTO public.car_clients (user_id, business_name, industry, plan, is_admin)
VALUES (
  'c9cff993-01d3-4523-b6ea-105d57d048d5',
  'Algoritmia Admin',
  'Agencia',
  'CAR Full',
  true
)
ON CONFLICT (user_id) DO UPDATE SET is_admin = true;

-- 8. VERIFICAR
SELECT user_id, business_name, is_admin FROM public.car_clients;
