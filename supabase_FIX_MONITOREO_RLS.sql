-- Fix RLS for Activity and Business Accounts (No recursion version)
-- Run this in Supabase SQL Editor

-- 1. Permiso de lectura global para car_clients (Básico para evitar recursión)
DROP POLICY IF EXISTS "Admins can view all clients" ON public.car_clients;
DROP POLICY IF EXISTS "Users can view their business" ON public.car_clients;
DROP POLICY IF EXISTS "Enable read access for all" ON public.car_clients;
CREATE POLICY "Enable read access for all" ON public.car_clients
  FOR SELECT TO authenticated
  USING (true);

-- 2. Asegurar que car_user_activity sea legible por admins
DROP POLICY IF EXISTS "Admins can view all activity" ON public.car_user_activity;
CREATE POLICY "Admins can view all activity" ON public.car_user_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.car_clients
      WHERE car_clients.user_id = auth.uid()
        AND car_clients.is_admin = true
    )
  );

-- 3. Asegurar que car_business_accounts sea legible por admins
DROP POLICY IF EXISTS "Admins can view all business accounts" ON public.car_business_accounts;
CREATE POLICY "Admins can view all business accounts" ON public.car_business_accounts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.car_clients
      WHERE car_clients.user_id = auth.uid()
        AND car_clients.is_admin = true
    )
  );
