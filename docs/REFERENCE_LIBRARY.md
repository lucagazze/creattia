# Biblioteca de referencias

Creattia separa dos conceptos:

- Las 50 estrategias creativas originales ya incluidas en la aplicación.
- Las imágenes de referencia que ejemplifican cada estrategia.

Las referencias solo se habilitan para generación cuando su procedencia está marcada como `owned`, `licensed` o `public_domain`. Un anuncio visible en una biblioteca pública no implica permiso para copiarlo, descargarlo en masa ni usarlo como activo de entrenamiento o referencia comercial.

## Importar un lote

1. Copiá `docs/reference-library.example.json` y agregá hasta 100 elementos.
2. Usá archivos propios, licenciados o de dominio público.
3. Completá la fuente, el estado de derechos y las notas de licencia.
4. Ejecutá:

```bash
npm run references:import -- /ruta/al/manifiesto.json
```

El importador calcula una huella SHA-256, sube cada imagen al bucket privado `creative-references` y guarda fuente, licencia y taxonomía en Supabase. Si el mismo archivo vuelve a importarse, actualiza el registro en vez de duplicarlo.
