-- Script para agregar un nuevo administrador al Sistema C.A.R.
-- Ejecuta este código en el SQL Editor de Supabase.

INSERT INTO public.car_clients (user_id, business_name, industry, plan, is_admin)
VALUES ('2bab9aa7-37e0-46eb-8877-24ef6ec3fe1d', 'Admin Nuevo', 'Administración', 'Premium', true)
ON CONFLICT (user_id) 
DO UPDATE SET is_admin = true;

-- Verificación
SELECT user_id, business_name, is_admin 
FROM public.car_clients 
WHERE user_id = '2bab9aa7-37e0-46eb-8877-24ef6ec3fe1d';
