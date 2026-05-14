-- Permite que cuentas asociadas (car_business_accounts) lean el perfil del negocio (car_clients)
-- Ejecutar en Supabase SQL Editor

-- Eliminar políticas SELECT existentes en car_clients (nombres comunes)
DROP POLICY IF EXISTS "Users can view own profile" ON public.car_clients;
DROP POLICY IF EXISTS "Enable read access for users based on user_id" ON public.car_clients;
DROP POLICY IF EXISTS "Users can read own data" ON public.car_clients;
DROP POLICY IF EXISTS "Users can view their business" ON public.car_clients;

-- Nueva política: acceso si user_id coincide O si el usuario está en car_business_accounts para ese negocio
CREATE POLICY "Users can view their business" ON public.car_clients
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.car_business_accounts
      WHERE car_business_accounts.business_id = car_clients.id
        AND car_business_accounts.user_id = auth.uid()
    )
  );
