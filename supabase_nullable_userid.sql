-- Permite que car_clients.user_id sea null cuando se elimina la única cuenta del negocio
ALTER TABLE public.car_clients ALTER COLUMN user_id DROP NOT NULL;
