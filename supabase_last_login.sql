-- Agregar columna last_login a car_clients
ALTER TABLE public.car_clients
  ADD COLUMN IF NOT EXISTS last_login timestamptz;

-- Función para actualizar el last_login automáticamente desde la actividad
CREATE OR REPLACE FUNCTION update_last_login_from_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.action = 'session_start' THEN
    UPDATE public.car_clients
    SET last_login = NEW.created_at
    WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para ejecutar la función anterior
DROP TRIGGER IF EXISTS tr_update_last_login ON public.car_user_activity;
CREATE TRIGGER tr_update_last_login
  AFTER INSERT ON public.car_user_activity
  FOR EACH ROW
  EXECUTE FUNCTION update_last_login_from_activity();
