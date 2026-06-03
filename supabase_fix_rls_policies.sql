-- ═══════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: RLS Policies Fix for Clients and Business Accounts
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Drop existing policies on car_business_accounts
DROP POLICY IF EXISTS "Users read own link" ON public.car_business_accounts;
DROP POLICY IF EXISTS "Service role full access" ON public.car_business_accounts;
DROP POLICY IF EXISTS "Admin full access" ON public.car_business_accounts;
DROP POLICY IF EXISTS "Authenticated users can update own link" ON public.car_business_accounts;
DROP POLICY IF EXISTS "Admins can view all business accounts" ON public.car_business_accounts;

-- 2. Create updated, safe policies on car_business_accounts (without querying auth.users)
CREATE POLICY "Users read own link"
  ON public.car_business_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR lower(email) = lower(auth.jwt() ->> 'email')
  );

CREATE POLICY "Authenticated users can update own link"
  ON public.car_business_accounts
  FOR UPDATE TO authenticated
  USING (
    lower(email) = lower(auth.jwt() ->> 'email')
  )
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Service role full access"
  ON public.car_business_accounts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access"
  ON public.car_business_accounts
  FOR ALL TO authenticated
  USING (
    public.is_car_admin()
  )
  WITH CHECK (
    public.is_car_admin()
  );

-- 3. Update car_clients SELECT policy to allow associated users and admins
DROP POLICY IF EXISTS "car_clients_select_own" ON public.car_clients;
DROP POLICY IF EXISTS "Enable read access for all" ON public.car_clients;

CREATE POLICY "car_clients_select_own"
  ON public.car_clients
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_car_admin()
    OR EXISTS (
      SELECT 1 FROM public.car_business_accounts
      WHERE business_id = public.car_clients.id
        AND user_id = auth.uid()
    )
  );
