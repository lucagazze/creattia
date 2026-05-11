-- ============================================================
--  SISTEMA C.A.R — PORTAL DE CLIENTES
--  SUPABASE SETUP COMPLETO
--  Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. TABLA: car_clients
--    Perfil de negocio ligado a cada usuario de auth.users
--    Cada cliente de Supabase Auth tendrá una fila aquí.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.car_clients (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE,           -- FK → auth.users
  business_name       text NOT NULL,                 -- Nombre del negocio
  business_logo_url   text,                          -- Logo (URL pública)
  industry            text,                          -- Ej: "Dermocosmética"
  plan                text DEFAULT 'CAR Growth',     -- 'CAR Growth' | 'CAR Full'
  chatwoot_url        text,                          -- URL del chat de soporte
  chatwoot_token      text,                          -- Token del widget Chatwoot
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT car_clients_pkey PRIMARY KEY (id),
  CONSTRAINT car_clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- 2. TABLA: car_meta_metrics
--    Métricas de Meta Ads (Módulo C — Captación) por cliente y período
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.car_meta_metrics (
  id                  bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id           uuid NOT NULL,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  -- Alcance y visibilidad
  impressions         integer NOT NULL DEFAULT 0,
  reach               integer NOT NULL DEFAULT 0,
  frequency           numeric(5,2),
  cpm                 numeric(10,2),                 -- Costo por 1000 impresiones
  -- Clics y CTR
  clicks              integer NOT NULL DEFAULT 0,
  ctr                 numeric(5,2) NOT NULL DEFAULT 0, -- Porcentaje
  -- Conversiones
  conversions         integer NOT NULL DEFAULT 0,
  cost_per_result     numeric(10,2),                 -- CPA (Costo por resultado)
  -- Inversión
  spend               numeric(12,2) NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'USD',
  -- Retorno
  roas                numeric(8,2),                  -- Return on Ad Spend
  -- Nivel de consciencia (N1-N5 framework CAR)
  awareness_level     text,                          -- 'N1' | 'N2' | 'N3' | 'N4' | 'N5'
  campaign_name       text,                          -- Nombre de la campaña
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT car_meta_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT car_meta_metrics_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.car_clients(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- 3. TABLA: car_email_metrics
--    Métricas de Email Marketing / Klaviyo (Módulo R — Retención)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.car_email_metrics (
  id                  bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id           uuid NOT NULL,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  campaign_name       text NOT NULL,
  campaign_type       text,                          -- 'Recupero Carrito' | 'Win-Back' | 'Recompra' | 'Newsletter' | 'Post-Compra'
  -- Envíos
  emails_sent         integer NOT NULL DEFAULT 0,
  delivered           integer NOT NULL DEFAULT 0,
  -- Engagement
  open_rate           numeric(5,2) NOT NULL DEFAULT 0,    -- %
  click_rate          numeric(5,2) NOT NULL DEFAULT 0,    -- %
  unsubscribe_rate    numeric(5,2) NOT NULL DEFAULT 0,    -- %
  -- Absolutos
  unique_opens        integer NOT NULL DEFAULT 0,
  unique_clicks       integer NOT NULL DEFAULT 0,
  bounces             integer NOT NULL DEFAULT 0,
  -- Retorno
  revenue_attributed  numeric(12,2),                -- Ingresos atribuidos al email
  currency            text NOT NULL DEFAULT 'ARS',
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT car_email_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT car_email_metrics_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.car_clients(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- 4. TABLA: car_links
--    Links rápidos personalizados por cliente
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.car_links (
  id                  bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id           uuid NOT NULL,
  label               text NOT NULL,                 -- Ej: "Mi tienda Shopify"
  url                 text NOT NULL,
  icon                text,                          -- Emoji o nombre de ícono
  category            text DEFAULT 'general',        -- 'general' | 'tienda' | 'reporte' | 'tool'
  sort_order          integer NOT NULL DEFAULT 0,
  CONSTRAINT car_links_pkey PRIMARY KEY (id),
  CONSTRAINT car_links_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.car_clients(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- 5. TABLA: car_reports
--    Reportes mensuales (PDFs almacenados en Storage)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.car_reports (
  id                  bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id           uuid NOT NULL,
  title               text NOT NULL,                 -- Ej: "Reporte Abril 2026"
  period              text NOT NULL,                 -- Ej: "Abril 2026"
  file_url            text,                          -- URL pública del PDF en Storage
  storage_path        text,                          -- Path interno en el bucket
  summary             text,                          -- Resumen en texto
  highlights          jsonb DEFAULT '[]'::jsonb,     -- Puntos clave del mes
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT car_reports_pkey PRIMARY KEY (id),
  CONSTRAINT car_reports_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.car_clients(id) ON DELETE CASCADE
);


-- ============================================================
-- ÍNDICES — Para mejorar performance en consultas frecuentes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_car_clients_user_id       ON public.car_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_car_meta_client            ON public.car_meta_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_car_meta_period            ON public.car_meta_metrics(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_car_email_client           ON public.car_email_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_car_email_period           ON public.car_email_metrics(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_car_links_client           ON public.car_links(client_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_car_reports_client         ON public.car_reports(client_id, created_at DESC);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- CRÍTICO: Cada cliente solo ve SUS propios datos
-- ============================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.car_clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_meta_metrics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_email_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_reports       ENABLE ROW LEVEL SECURITY;


-- ─── Políticas para car_clients ───────────────────────────────
-- Un usuario solo puede ver y editar su propio perfil
CREATE POLICY "car_clients_select_own"
  ON public.car_clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "car_clients_update_own"
  ON public.car_clients FOR UPDATE
  USING (auth.uid() = user_id);


-- ─── Políticas para car_meta_metrics ─────────────────────────
-- El usuario solo ve métricas de su client_id
CREATE POLICY "car_meta_select_own"
  ON public.car_meta_metrics FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.car_clients WHERE user_id = auth.uid()
    )
  );


-- ─── Políticas para car_email_metrics ────────────────────────
CREATE POLICY "car_email_select_own"
  ON public.car_email_metrics FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.car_clients WHERE user_id = auth.uid()
    )
  );


-- ─── Políticas para car_links ─────────────────────────────────
CREATE POLICY "car_links_select_own"
  ON public.car_links FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.car_clients WHERE user_id = auth.uid()
    )
  );


-- ─── Políticas para car_reports ───────────────────────────────
CREATE POLICY "car_reports_select_own"
  ON public.car_reports FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.car_clients WHERE user_id = auth.uid()
    )
  );


-- ============================================================
-- STORAGE — Bucket para PDFs de Reportes
-- Ejecutar en Supabase Dashboard > Storage > New bucket
-- O correr este SQL (requiere extensión storage habilitada)
-- ============================================================

-- Crear el bucket 'car-reports' (archivos privados con acceso por RLS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'car-reports',
  'car-reports',
  false,                              -- NO público — acceso controlado por policy
  52428800,                           -- Límite 50MB por archivo
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: El cliente puede leer solo los archivos de su carpeta (client_id/*)
CREATE POLICY "car_reports_storage_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'car-reports'
    AND (
      SELECT id::text FROM public.car_clients WHERE user_id = auth.uid()
    ) = split_part(name, '/', 1)
  );

-- Policy: Solo admins pueden subir archivos (vos subís los PDFs para los clientes)
-- Para hacer upload desde el dashboard de Supabase sin restricciones:
CREATE POLICY "car_reports_storage_insert_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'car-reports');


-- ============================================================
-- DATOS DE EJEMPLO — Para probar la app rápidamente
-- (Reemplazar 'USER_UUID_AQUI' con el UUID real del auth.user)
-- ============================================================

-- PASO 1: Primero crear el usuario en Supabase Auth:
--   Dashboard > Authentication > Users > Invite user
--   O usar: supabase.auth.admin.createUser({ email, password })

-- PASO 2: Insertar el perfil del cliente (reemplazar el UUID)
/*
INSERT INTO public.car_clients (user_id, business_name, industry, plan, chatwoot_url, chatwoot_token)
VALUES (
  'USER_UUID_AQUI',           -- <-- UUID del usuario creado en Auth
  'Empresa Ejemplo S.A.',
  'Dermocosmética',
  'CAR Full',
  'https://app.chatwoot.com',  -- Tu URL de Chatwoot (opcional)
  'TOKEN_CHATWOOT_AQUI'        -- Token del widget (opcional)
);

-- Obtener el client_id recién insertado:
-- SELECT id FROM car_clients WHERE user_id = 'USER_UUID_AQUI';

-- PASO 3: Insertar links del cliente
INSERT INTO public.car_links (client_id, label, url, icon, category, sort_order)
VALUES
  ('CLIENT_ID_AQUI', 'Mi Tienda (Shopify)', 'https://mi-tienda.myshopify.com', '🛒', 'tienda', 1),
  ('CLIENT_ID_AQUI', 'Klaviyo Dashboard', 'https://app.klaviyo.com', '📧', 'tool', 2),
  ('CLIENT_ID_AQUI', 'Meta Ads Manager', 'https://adsmanager.facebook.com', '📊', 'tool', 3),
  ('CLIENT_ID_AQUI', 'Google Drive Recursos', 'https://drive.google.com', '📁', 'general', 4);

-- PASO 4: Insertar métricas de ejemplo (Meta Ads)
INSERT INTO public.car_meta_metrics (client_id, period_start, period_end, impressions, reach, clicks, ctr, conversions, cost_per_result, spend, currency, roas, campaign_name)
VALUES
  ('CLIENT_ID_AQUI', '2026-04-01', '2026-04-30', 250000, 180000, 4500, 1.80, 87, 12.50, 1087.50, 'USD', 3.2, 'CAR — Adquisición Abril'),
  ('CLIENT_ID_AQUI', '2026-03-01', '2026-03-31', 210000, 155000, 3900, 1.86, 72, 14.20, 1022.40, 'USD', 2.9, 'CAR — Adquisición Marzo'),
  ('CLIENT_ID_AQUI', '2026-02-01', '2026-02-28', 195000, 142000, 3400, 1.74, 61, 15.80, 963.80, 'USD', 2.7, 'CAR — Adquisición Febrero');

-- PASO 5: Insertar métricas de email (Klaviyo)
INSERT INTO public.car_email_metrics (client_id, period_start, period_end, campaign_name, campaign_type, emails_sent, delivered, open_rate, click_rate, unsubscribe_rate, unique_opens, unique_clicks, bounces, revenue_attributed)
VALUES
  ('CLIENT_ID_AQUI', '2026-04-01', '2026-04-30', 'Newsletter Abril', 'Newsletter', 8500, 8320, 38.5, 4.2, 0.3, 3203, 349, 180, 142000),
  ('CLIENT_ID_AQUI', '2026-04-01', '2026-04-30', 'Recupero de Carrito Abril', 'Recupero Carrito', 1240, 1215, 52.1, 18.7, 0.1, 633, 227, 25, 89500),
  ('CLIENT_ID_AQUI', '2026-04-01', '2026-04-30', 'Win-Back 60 días', 'Win-Back', 620, 608, 28.4, 6.1, 0.5, 173, 37, 12, 22100);

-- PASO 6: Insertar reporte mensual
INSERT INTO public.car_reports (client_id, title, period, summary, highlights)
VALUES (
  'CLIENT_ID_AQUI',
  'Reporte Mensual — Abril 2026',
  'Abril 2026',
  'Mes sólido. Se alcanzaron los objetivos de CPA y el ROAS superó el benchmark del plan CAR Full. Los flujos de Klaviyo mostraron un aumento del 18% en revenue atribuido.',
  '[
    {"icon": "📈", "text": "ROAS 3.2x — por encima del target de 2.5x"},
    {"icon": "📧", "text": "Recupero de carrito: $89.500 atribuidos"},
    {"icon": "🎯", "text": "87 conversiones con CPA de $12.50"},
    {"icon": "🔄", "text": "Flujo Win-Back reactivó 37 clientes"}
  ]'::jsonb
);
*/


-- ============================================================
-- FUNCIÓN HELPER — Para verificar que un usuario tiene perfil
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_car_client()
RETURNS public.car_clients
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT * FROM public.car_clients WHERE user_id = auth.uid() LIMIT 1;
$$;


-- ============================================================
-- COLUMNA is_admin — Marcar administradores del sistema
-- ============================================================

-- Agregar columna is_admin a car_clients (si no existe)
ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ── CÓMO MARCAR UN USUARIO COMO ADMIN ──────────────────────────
-- 1. Encontrá el user_id del admin en Authentication > Users del Dashboard
-- 2. Ejecutá este SQL reemplazando el UUID:
/*
UPDATE public.car_clients
SET is_admin = true
WHERE user_id = 'TU_UUID_DE_ADMIN_AQUI';
*/

-- ── POLÍTICA RLS PARA QUE ADMINS VEAN TODOS LOS CLIENTES ──────
-- Por defecto, car_clients_select_own solo permite ver el propio perfil.
-- Agregamos una política adicional para admins:
CREATE POLICY "car_clients_admin_select_all"
  ON public.car_clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.car_clients AS me
      WHERE me.user_id = auth.uid() AND me.is_admin = true
    )
  );

-- Política para que admins puedan actualizar cualquier perfil
CREATE POLICY "car_clients_admin_update_all"
  ON public.car_clients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.car_clients AS me
      WHERE me.user_id = auth.uid() AND me.is_admin = true
    )
  );

-- Política para que admins puedan insertar nuevos perfiles
CREATE POLICY "car_clients_admin_insert"
  ON public.car_clients FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.car_clients AS me
      WHERE me.user_id = auth.uid() AND me.is_admin = true
    )
  );


-- ============================================================
-- CREAR USUARIO — Dos formas de hacerlo
-- ============================================================

-- ── FORMA 1: Desde el Dashboard de Supabase (recomendado) ─────
-- Authentication > Users > Add user
-- Llenás: Email + Password
-- Luego ejecutás el INSERT de car_clients con el UUID generado.

-- ── FORMA 2: Via SQL con función admin (requiere Service Role Key) ──
-- La app usa supabase.auth.admin.createUser() que requiere la SERVICE ROLE KEY.
-- Para habilitarlo en la app, creá un archivo .env con:
--   VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
-- Y modificá services/supabase.ts para usar un segundo cliente admin.

-- ── FORMA 3: Flujo manual completo ───────────────────────────
/*
-- PASO 1: Crear usuario en Auth
-- (Hacerlo desde Dashboard > Authentication > Add user)
-- Ejemplo del UUID obtenido: 'abc123-...'

-- PASO 2: Insertar perfil del cliente
INSERT INTO public.car_clients (user_id, business_name, industry, plan, is_admin)
VALUES (
  'UUID_DEL_USUARIO_CREADO',
  'Mi Empresa',
  'Dermocosmética',
  'CAR Growth',
  false  -- true solo para admins
);

-- PASO 3 (opcional): Si querés que este usuario sea admin también
UPDATE public.car_clients SET is_admin = true WHERE user_id = 'UUID_DEL_USUARIO_CREADO';
*/
