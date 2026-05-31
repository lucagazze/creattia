-- ============================================================
-- SISTEMA C.A.R — PORTAL DE CLIENTES
-- AGREGAR TABLA DE RESPUESTAS RÁPIDAS (CANNED RESPONSES)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.car_canned_responses (
  id          bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  client_id   uuid NOT NULL,
  shortcut    text NOT NULL,                 -- Abreviatura de búsqueda, ej: "envio"
  title       text NOT NULL,                 -- Título identificador, ej: "Tiempos de Envío"
  content     text NOT NULL,                 -- Texto a insertar
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT car_canned_responses_pkey PRIMARY KEY (id),
  CONSTRAINT car_canned_responses_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.car_clients(id) ON DELETE CASCADE
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.car_canned_responses ENABLE ROW LEVEL SECURITY;

-- ─── Políticas RLS ──────────────────────────────────────────

CREATE POLICY "car_canned_select_own"
  ON public.car_canned_responses FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.car_clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "car_canned_insert_own"
  ON public.car_canned_responses FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.car_clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "car_canned_update_own"
  ON public.car_canned_responses FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM public.car_clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "car_canned_delete_own"
  ON public.car_canned_responses FOR DELETE
  USING (
    client_id IN (
      SELECT id FROM public.car_clients WHERE user_id = auth.uid()
    )
  );

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_car_canned_responses_client ON public.car_canned_responses(client_id);
