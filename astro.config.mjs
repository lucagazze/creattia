import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://creattia.app',
  output: 'server',
  adapter: vercel({
    webAnalytics: { enabled: true },
    maxDuration: 300,
  }),
  integrations: [react(), sitemap()],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
