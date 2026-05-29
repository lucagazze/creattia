-- ============================================================
-- Migración: Agregar columnas de Facebook Page a car_clients
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar columnas
ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS fb_page_id text,
  ADD COLUMN IF NOT EXISTS fb_page_name text;
