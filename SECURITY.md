# Seguridad — puesta en producción de este cambio

## 1. Rotar los secretos filtrados (antes que nada)

El historial de git de este repositorio **público** contiene un `.env` con
credenciales reales:

- `SUPABASE_SERVICE_ROLE_KEY` (en su momento `VITE_SUPABASE_SERVICE_ROLE_KEY`) —
  esta clave ignora todas las políticas RLS: lee y escribe cualquier tabla.
- `VITE_META_ADS_TOKEN`
- `.env.verify` con un `VERCEL_OIDC_TOKEN` (vencido, pero igual conviene revisar).

Borrarlos del último commit no alcanza: siguen en los objetos de git y cualquiera
puede recuperarlos con `git log --all -p -- .env`.

Pasos:

1. Supabase → Settings → API → **rotar la service role key**. Actualizar la
   variable en Vercel.
2. Meta → rotar el token de la app.
3. Revisar accesos recientes en Supabase (Logs → Auth / Postgres) por si la clave
   se usó.
4. Recién después, limpiar el historial:
   ```bash
   git filter-repo --path .env --path .env.verify --invert-paths
   git push --force
   ```
   (o crear un repositorio nuevo sin historial). Ojo: si alguien clonó el repo,
   la clave vieja ya está fuera de tu control — la rotación es lo que protege.

## 2. Orden de despliegue

Las migraciones tienen que aplicarse en orden y hay un paso manual en el medio:

```bash
# 1. Permisos por columna, índices y tope de créditos comprados
# 2. Bucket público para la muestra de la landing
npx supabase db push   # aplica 20260806000000 y 20260806001000

# 3. Copiar las imágenes de la landing al bucket público
node --env-file=.env scripts/publish-showcase-assets.mjs

# 4. Recién ahora, cerrar el bucket de la biblioteca paga
npx supabase db push   # aplica 20260806002000
```

Si se aplica el paso 4 antes del 3, la landing queda sin imágenes.

Después de desplegar, verificar:

- La landing pública muestra las imágenes de muestra.
- Una cuenta gratuita ve solo 5 referencias por ángulo y no puede generar con una
  ruta de la biblioteca paga (`/api/creativos/generate` responde 402
  `LIBRARY_LOCKED`).
- Una cuenta paga ve la biblioteca completa con URLs firmadas.
- `update creative_profiles set credits_remaining = 9999` desde el navegador
  falla o no tiene efecto.

## 3. Qué protege cada capa

| Riesgo | Defensa |
| --- | --- |
| Auto-asignarse créditos o plan | Permisos por columna + trigger `guard_creative_profile_billing` |
| Bajar la biblioteca paga | Bucket privado + `checkReferencePath` en cada endpoint que acepta rutas |
| Duplicar créditos cancelando un lote | `closeGenerationsAndCountRefunds`: solo reembolsa quien mueve la fila `processing → failed` |
| Gasto de IA sin créditos | `checkRateLimit(..., failClosed: true)` en los endpoints que llaman modelos |
| SSRF por URLs de sitios de terceros | `safeExternalFetch` + `readLimited` |

## 4. Reportar una vulnerabilidad

Escribir a algoritmiadesarrollos@gmail.com con el detalle y, si aplica, los pasos
para reproducirla.
