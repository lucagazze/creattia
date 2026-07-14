# Creattia

Proyecto independiente de la landing y la aplicación web de Creattia.

## Rutas

- `/` — landing pública.
- `/app/` — registro, onboarding y aplicación.
- `/api/creativos/*` — generación, catálogo, suscripciones y webhook.

La aplicación permite guardar la web e Instagram de cada marca, importar una URL concreta con hasta 6 fotos públicas, cargar manualmente entre 1 y 6 fotos con datos verificados, combinar hasta 5 productos y generar de 1 a 4 variantes por lote. Cada resultado se guarda por separado en el historial y puede usarse como referencia para una nueva versión.

## Flujo del usuario

1. Crear la cuenta e ingresar los datos reales de la marca.
2. En **Mis productos**, pegar la URL exacta de un producto o subir sus fotos, nombre, descripción y precio.
3. Tocar **Crear con este producto** o abrir la **Biblioteca** y elegir una estructura de anuncio.
4. Elegir tipo de imagen, uno o varios productos, referencia, formato y cantidad.
5. Agregar una indicación solamente si hace falta; la marca y los datos del producto ya se usan automáticamente.
6. Descargar el resultado o pedir una nueva versión conservando todo, variando detalles o reinterpretando el mismo ángulo. También se puede reemplazar el producto sin perder la composición creada.

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
   ```bash
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   npx supabase db push
   ```
4. Agregar estas URLs en Authentication → URL Configuration:
   - Site URL: `https://creattia.app`
   - Redirect URL: `https://creattia.app/app/`
   - Para desarrollo: `http://127.0.0.1:4330/app/`
5. Habilitar Google como proveedor si se usará ese acceso.

La `SUPABASE_SERVICE_ROLE_KEY` es exclusivamente de servidor. Nunca debe llevar el prefijo `PUBLIC_` ni incluirse en código cliente.

## Referencias creativas

Las 50 estrategias originales funcionan aunque todavía no tengan una imagen de referencia. El repositorio también incluye 50 anuncios estáticos originales en `public/images/creattia/reference-library`, uno por estrategia, listos para importar desde `docs/reference-library.starter-50.json`.

```bash
npm run references:manifest
npm run references:import -- docs/reference-library.starter-50.json
```

Para conocer el criterio de investigación, los derechos y cómo cargar nuevas piezas propias o licenciadas, seguí [docs/REFERENCE_LIBRARY.md](docs/REFERENCE_LIBRARY.md). La aplicación no activa referencias con procedencia sin verificar.

## Producción

- Configurar las variables de `.env.example` en Vercel.
- Definir `PUBLIC_SITE_URL=https://creattia.app`.
- Configurar `OPENAI_API_KEY`; la generación usa `gpt-image-2` y el análisis de catálogo usa `gpt-5.6-luna` por defecto.
- Crear los tres planes recurrentes de Mercado Pago y completar sus IDs, el access token y el secreto del webhook.
- Configurar el webhook de Mercado Pago en:
  `https://creattia.app/api/creativos/webhook/mercadopago`
- Conectar `creattia.app` como dominio del nuevo proyecto.

Después de aplicar las migraciones e importar la biblioteca, ejecutar:

```bash
npm run production:verify
```

El comando comprueba proveedores de Auth, tablas y buckets, las 50 referencias estáticas y la configuración de OpenAI y Mercado Pago sin imprimir secretos.

## Git nuevo

Este directorio no depende del repositorio de Algoritmia. Para convertirlo en repositorio propio:

```bash
git init
git add .
git commit -m "Initial Creattia app"
```
