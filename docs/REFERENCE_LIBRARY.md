# Biblioteca de referencias

Creattia separa dos conceptos:

- Las 50 estrategias creativas originales ya incluidas en la aplicación.
- Las imágenes de referencia que ejemplifican cada estrategia.

Las referencias solo se habilitan para generación cuando su procedencia está marcada como `owned`, `licensed` o `public_domain`. Un anuncio visible en una biblioteca pública no implica permiso para copiarlo, descargarlo en masa ni usarlo como activo de entrenamiento o referencia comercial.

## Colección inicial: 50 anuncios estáticos

El repositorio incluye una colección inicial de 50 composiciones originales en formato vertical 4:5 (1080 × 1350). No contiene videos ni activos copiados de anunciantes: cada pieza recrea una estructura publicitaria validada —oferta, comparación, prueba social, demostración o autoridad— con una marca y un producto ficticios.

La investigación conserva, dentro del manifiesto, la fuente y la señal utilizada para priorizar cada estructura: ROAS, CTR, CPA, inversión, impresiones, duplicaciones o permanencia activa. Estas señales sirven para ordenar buenos puntos de partida; no garantizan ventas futuras.

Para regenerar el manifiesto:

```bash
npm run references:manifest
```

Para subir la colección al bucket privado y vincular una imagen con cada estrategia:

```bash
npm run references:import -- docs/reference-library.starter-50.json
```

El comando requiere `PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. La clave de servicio debe mantenerse únicamente en el servidor o en el entorno local.

## Importar un lote

1. Copiá `docs/reference-library.example.json` y agregá hasta 100 elementos.
2. Usá archivos propios, licenciados o de dominio público.
3. Completá la fuente, el estado de derechos y las notas de licencia.
4. Ejecutá:

```bash
npm run references:import -- /ruta/al/manifiesto.json
```

El importador calcula una huella SHA-256, sube cada imagen al bucket privado `creative-references` y guarda fuente, licencia y taxonomía en Supabase. Si el mismo archivo vuelve a importarse, actualiza el registro en vez de duplicarlo.
