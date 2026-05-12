import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api/klaviyo': {
        target: 'https://a.klaviyo.com/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/klaviyo/, ''),
      },

      // Shopify: domain is encoded in the path as /api/shopify/<domain>/...
      // This proxy strips /api/shopify/<domain> and forwards to the correct admin API
      '/api/shopify': {
        target: 'https://placeholder.myshopify.com',
        changeOrigin: true,
        secure: false,
        // @ts-ignore
        router: (req: any) => {
          const domain = req.headers['x-shop-domain'];
          if (domain) {
            return `https://${domain}`;
          }
          return 'https://placeholder.myshopify.com';
        },
        rewrite: (path) => {
          const stripped = path.replace(/^\/api\/shopify/, '');
          return `/admin/api/2024-01${stripped}`;
        },
        autoRewrite: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const domain = req.headers['x-shop-domain'];
            if (domain) {
              proxyReq.setHeader('Host', domain);
              proxyReq.setHeader('X-Forwarded-Host', domain);
              console.log(`[Proxy] Shopify: https://${domain}${proxyReq.path}`);
            }
          });
        },
      },
    },
  },
});
