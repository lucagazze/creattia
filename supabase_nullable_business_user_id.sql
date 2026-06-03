-- ═══════════════════════════════════════════════════════════════════════
-- EJECUTAR EN SUPABASE SQL EDITOR — COMPLETO Y DEFINITIVO
-- Resuelve: pre-invitaciones Google, user_id nullable, RLS correctas
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

-- 4. Borrar TODAS las policies existentes de car_business_accounts
DROP POLICY IF EXISTS "Users read own link" ON public.car_business_accounts;
DROP POLICY IF EXISTS "Service role full access" ON public.car_business_accounts;
DROP POLICY IF EXISTS "Admin full access" ON public.car_business_accounts;
DROP POLICY IF EXISTS "Authenticated users can update own link" ON public.car_business_accounts;

-- 5. Policy SELECT: usuario ve su propio vínculo (por user_id O por email para Google pendiente)
CREATE POLICY "Users read own link"
  ON public.car_business_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

-- 6. Policy UPDATE: un usuario autenticado puede actualizar el registro que tenga su email
--    Esto permite que el sistema vincule automáticamente el user_id cuando entra por Google
CREATE POLICY "Authenticated users can update own link"
  ON public.car_business_accounts
  FOR UPDATE TO authenticated
  USING (
    lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- 7. Policy completa para service_role (bypasea RLS por defecto, pero si hay FORCE RLS necesita esto)
CREATE POLICY "Service role full access"
  ON public.car_business_accounts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 8. Policy completa para Administradores del sistema (rol authenticated con is_admin = true)
CREATE POLICY "Admin full access"
  ON public.car_business_accounts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.car_clients
      WHERE user_id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.car_clients
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );
