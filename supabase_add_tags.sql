-- Agregar columna para etiquetas/objetivos del cliente
ALTER TABLE car_clients ADD COLUMN IF NOT EXISTS client_tags TEXT[] DEFAULT '{}';
