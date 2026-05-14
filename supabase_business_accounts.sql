-- Tabla para usuarios secundarios asociados a un negocio (car_clients)
CREATE TABLE IF NOT EXISTS public.car_business_accounts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.car_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.car_business_accounts ENABLE ROW LEVEL SECURITY;

-- Los usuarios autenticados pueden leer su propio vínculo (para el login)
CREATE POLICY "Users read own link"
  ON public.car_business_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- El service role (supabaseAdmin) bypasea RLS automáticamente — no necesita policy adicional
