import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // El dominio sin www redirige 308 a www, así que www es el host real. Estaba
  // declarado el apex: el canonical, el og:url y todas las URLs del sitemap
  // apuntaban a una dirección que redirige, o sea que cada página se declaraba
  // canónica en un lugar donde no vive.
  site: 'https://www.creattia.app',
  output: 'server',
  adapter: vercel({
    webAnalytics: { enabled: true },
    maxDuration: 300,
  }),
  integrations: [
    react(),
    // El sitemap listaba /app/, /auth/callback/ y el 404 — todas marcadas
    // noindex en su propio HTML. Un sitemap que ofrece páginas que después
    // prohíben indexarse es una contradicción que Search Console reporta como
    // error, y gasta presupuesto de rastreo en pantallas privadas.
    sitemap({
      // Se excluye la RAMA entera, no la página exacta: con el final de la ruta
      // se colaba /auth/callback/, que está a un nivel más de profundidad.
      filter: (page) => !/^\/(app|auth|404)(\/|$)/.test(new URL(page).pathname),
    }),
  ],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
