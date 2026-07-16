-- Estilo visual de marca detectado del sitio web (colores, tipografía, logo, estética)
alter table public.creative_profiles
  add column if not exists brand_style jsonb;
