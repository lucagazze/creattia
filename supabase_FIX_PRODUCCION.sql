-- ============================================================
-- FIX PRODUCCIÓN — EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================

-- 1. CREAR AgencySettings (guarda el token de Meta y otros configs globales)
CREATE TABLE IF NOT EXISTS public."AgencySettings" (
  key   text NOT NULL,
  value text NOT NULL,
  CONSTRAINT agency_settings_pkey PRIMARY KEY (key)
);

-- Deshabilitar RLS (solo la agencia accede, con service role)
ALTER TABLE public."AgencySettings" DISABLE ROW LEVEL SECURITY;

-- Insertar el token de Meta Ads (reemplazá el valor si cambió)
INSERT INTO public."AgencySettings" (key, value)
VALUES ('meta_ads_token', 'EAARvpoGdZCfIBQ1GtbvJqwE1ERnlIEZBGVGc8T3SeTKeMOuWZBZAwEoNe73uZBoVSUYnSObcpXklqHtjPr6goHwtmFZCvBBDabW0fkk5Ei2ZCFedAYhtYU4jVAqfOzR0vbWiYPRf9NDI0hP4FVxHsYaMFSGDZBmOjfQ5wvvQUMue9wTtiIB4ZCv10kEEPPivJZBTYcaAZDZD')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. CREAR client_links (alias de car_links — el código lo usa con este nombre)
CREATE TABLE IF NOT EXISTS public.client_links (
  id         bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id  uuid NOT NULL,
  title      text NOT NULL,
  url        text NOT NULL,
  icon       text DEFAULT 'link',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_links_pkey PRIMARY KEY (id),
  CONSTRAINT client_links_client_id_fkey FOREIGN KEY (client_id)
    REFERENCES public.car_clients(id) ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE public.client_links ENABLE ROW LEVEL SECURITY;

-- Política: cada cliente ve solo sus propios links
DROP POLICY IF EXISTS "client_links_select_own" ON public.client_links;
CREATE POLICY "client_links_select_own"
  ON public.client_links FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.car_clients WHERE user_id = auth.uid()
    )
    OR public.is_car_admin()
  );

-- Política: admins pueden insertar/actualizar/eliminar
DROP POLICY IF EXISTS "client_links_admin_all" ON public.client_links;
CREATE POLICY "client_links_admin_all"
  ON public.client_links FOR ALL
  USING (public.is_car_admin())
  WITH CHECK (public.is_car_admin());

-- Índice
CREATE INDEX IF NOT EXISTS idx_client_links_client ON public.client_links(client_id, created_at);

-- 3. VERIFICAR
SELECT key FROM public."AgencySettings";
SELECT COUNT(*) as total_client_links FROM public.client_links;
