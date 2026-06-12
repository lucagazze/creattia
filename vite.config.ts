import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Warn when a chunk exceeds 1000kb
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split vendor libraries into separate cacheable chunks
        manualChunks: (id) => {
          // React core — smallest, most cached
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // React Router
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router';
          }
          // Supabase client
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          // Lucide icons (large — isolate so pages don't pay for unused icons)
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide';
          }
          // Recharts / charting libs
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
        },
      },
    },
  },
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
          return `/admin/api/2026-01${stripped}`;
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

