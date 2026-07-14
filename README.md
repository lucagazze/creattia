# Creattia

Proyecto independiente de la landing y la aplicación web de Creattia.

## Rutas

- `/` — landing pública.
- `/app/` — registro, onboarding y aplicación.
- `/api/creativos/*` — generación, catálogo, suscripciones y webhook.

La aplicación permite guardar la web e Instagram de cada marca, importar URLs de productos concretos, combinar hasta 5 productos y generar de 1 a 4 variantes por lote. Cada resultado se guarda por separado en el historial.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run dev
```

La aplicación funciona en modo demo cuando Supabase todavía no está configurado.

## Supabase

1. Crear o elegir un proyecto de Supabase exclusivo para Creattia.
2. Copiar `.env.example` a `.env` y completar las tres variables de Supabase.
3. Vincular el proyecto con Supabase CLI y aplicar `supabase/migrations/`.
4. Agregar estas URLs en Authentication → URL Configuration:
   - Site URL: `https://creattia.app`
   - Redirect URL: `https://creattia.app/app/`
   - Para desarrollo: `http://127.0.0.1:4330/app/`
5. Habilitar Google como proveedor si se usará ese acceso.

La `SUPABASE_SERVICE_ROLE_KEY` es exclusivamente de servidor. Nunca debe llevar el prefijo `PUBLIC_` ni incluirse en código cliente.

## Referencias creativas

Las 50 estrategias originales funcionan aunque todavía no tengan una imagen de referencia. El repositorio también incluye 50 anuncios estáticos originales, uno por estrategia, listos para importar desde `docs/reference-library.starter-50.json`.

```bash
npm run references:manifest
npm run references:import -- docs/reference-library.starter-50.json
```

Para conocer el criterio de investigación, los derechos y cómo cargar nuevas piezas propias o licenciadas, seguí [docs/REFERENCE_LIBRARY.md](docs/REFERENCE_LIBRARY.md). La aplicación no activa referencias con procedencia sin verificar.

## Producción

- Configurar las variables de `.env.example` en Vercel.
- Definir `PUBLIC_SITE_URL=https://creattia.app`.
- Configurar el webhook de Mercado Pago en:
  `https://creattia.app/api/creativos/webhook/mercadopago`
- Conectar `creattia.app` como dominio del nuevo proyecto.

## Git nuevo

Este directorio no depende del repositorio de Algoritmia. Para convertirlo en repositorio propio:

```bash
git init
git add .
git commit -m "Initial Creattia app"
```
