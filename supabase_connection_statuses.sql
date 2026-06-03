-- =========================================================================
-- SQL MIGRATION: Add connection_statuses and update RLS policies for clients
-- Run this in Supabase SQL Editor
-- =========================================================================

-- 1. Add connection_statuses column to car_clients table
ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS connection_statuses jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "car_clients_select_own" ON public.car_clients;
DROP POLICY IF EXISTS "car_clients_update_own" ON public.car_clients;
DROP POLICY IF EXISTS "car_clients_admin_update_all" ON public.car_clients;

-- 3. Redefine SELECT policy to cover owners, system admins, and associated users
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

-- 4. Redefine UPDATE policy to cover owners, system admins, and associated users
CREATE POLICY "car_clients_update_own"
  ON public.car_clients
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_car_admin()
    OR EXISTS (
      SELECT 1 FROM public.car_business_accounts
      WHERE business_id = public.car_clients.id
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_car_admin()
    OR EXISTS (
      SELECT 1 FROM public.car_business_accounts
      WHERE business_id = public.car_clients.id
        AND user_id = auth.uid()
    )
  );
