-- ═══════════════════════════════════════════════════════════════════════
-- EJECUTAR EN SUPABASE SQL EDITOR
-- Habilita: pre-invitaciones Google (user_id nullable) + RLS correctas
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Hacer user_id nullable (para pre-invitaciones Google)
ALTER TABLE public.car_business_accounts
  ALTER COLUMN user_id DROP NOT NULL;

-- 2. Eliminar el UNIQUE constraint original en user_id (bloquea múltiples NULL)
ALTER TABLE public.car_business_accounts
  DROP CONSTRAINT IF EXISTS car_business_accounts_user_id_key;

-- 3. Crear índice único parcial — solo aplica cuando user_id NO es NULL
DROP INDEX IF EXISTS car_business_accounts_user_id_unique;
CREATE UNIQUE INDEX car_business_accounts_user_id_unique
  ON public.car_business_accounts (user_id)
  WHERE user_id IS NOT NULL;

-- 4. Recrear policies RLS para que el service role pueda insertar/modificar
--    (el service role bypasea RLS pero a veces los proyectos tienen FORCE RLS)
DROP POLICY IF EXISTS "Users read own link" ON public.car_business_accounts;
DROP POLICY IF EXISTS "Service role full access" ON public.car_business_accounts;
DROP POLICY IF EXISTS "Admin full access" ON public.car_business_accounts;

-- Lectura: usuario ve su propio vínculo (por user_id O por email para Google pendiente)
CREATE POLICY "Users read own link"
  ON public.car_business_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

-- INSERT/UPDATE/DELETE: solo el service role (admin)
-- En Supabase el service role bypasea RLS, pero si el proyecto tiene FORCE ROW LEVEL SECURITY
-- en la tabla, necesita una policy explícita para el rol postgres/service_role
CREATE POLICY "Service role full access"
  ON public.car_business_accounts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
