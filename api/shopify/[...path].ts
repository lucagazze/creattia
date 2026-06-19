import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Ensure path is handled whether it's a string or an array (Vercel behavior can vary)
  const pathParam = req.query.path;
  const shopifyPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');
  
  // Extraer dominio y token de headers (lowercase in Node)
  const domain = (req.headers['x-shopify-domain'] as string) || (req.headers['x-shop-domain'] as string) || (req.query.shop as string);
  const token = (req.headers['x-shopify-access-token'] as string);

  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-shopify-domain, x-shop-domain, x-shopify-access-token, x-wc-base-url, x-wc-consumer-key, x-wc-consumer-secret, x-tn-store-id, x-tn-token, Content-Type, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'X-WP-Total, X-WP-TotalPages, Link');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // ── WooCommerce proxy (reuses this function to stay within Vercel function limit) ──
  const wcBaseUrl = req.headers['x-wc-base-url'] as string;
  const wcKey     = req.headers['x-wc-consumer-key'] as string;
  const wcSecret  = req.headers['x-wc-consumer-secret'] as string;

  if (wcBaseUrl && wcKey && wcSecret) {
    const cleanBase = wcBaseUrl.replace(/\/$/, '');
    const creds = Buffer.from(`${wcKey}:${wcSecret}`).toString('base64');
    const wcMatch = req.url?.match(/^\/api\/shopify\/wc\/(.*)/);
    const wcPathAndQuery = wcMatch ? wcMatch[1] : 'orders';
    const targetUrl = `${cleanBase}/wp-json/wc/v3/${wcPathAndQuery}`;
    try {
      const wcRes = await fetch(targetUrl, {
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' },
      });
      const totalPages = wcRes.headers.get('X-WP-TotalPages') || '1';
      const totalCount = wcRes.headers.get('X-WP-Total') || '0';
      res.setHeader('X-WP-TotalPages', totalPages);
      res.setHeader('X-WP-Total', totalCount);
      const data = await wcRes.json();
      return res.status(wcRes.status).json(data);
    } catch (err: any) {
      return res.status(502).json({ error: 'WooCommerce proxy error', detail: err.message });
    }
  }

  // ── Tiendanube proxy ──
  const tnStoreId = req.headers['x-tn-store-id'] as string;
  const tnToken   = req.headers['x-tn-token'] as string;

  if (tnStoreId && tnToken) {
    const tnMatch = req.url?.match(/^\/api\/shopify\/tn\/(.*)/);
    const tnPathAndQuery = tnMatch ? tnMatch[1] : 'orders';
    const targetUrl = `https://api.tiendanube.com/v1/${tnStoreId}/${tnPathAndQuery}`;
    try {
      const tnRes = await fetch(targetUrl, {
        headers: { Authentication: `bearer ${tnToken}`, 'User-Agent': 'Algoritmia (lucagazze@gmail.com)', 'Content-Type': 'application/json' },
      });
      const linkHeader = tnRes.headers.get('Link');
      if (linkHeader) res.setHeader('Link', linkHeader);
      if (
        req.method === 'GET' &&
        tnRes.status === 404 &&
        /^(products|orders)(\?|$)/.test(tnPathAndQuery)
      ) {
        return res.status(200).json([]);
      }
      const text = await tnRes.text();
      const data = text ? JSON.parse(text) : null;
      return res.status(tnRes.status).json(data);
    } catch (err: any) {
      return res.status(502).json({ error: 'Tiendanube proxy error', detail: err.message });
    }
  }

  if (!domain || !token) {
    console.error('[Shopify Proxy] Missing domain or token:', { domain: !!domain, token: !!token });
    return res.status(400).json({ error: 'Missing Shopify domain or token' });
  }

  if (req.headers['x-debug-target']) {
    return res.status(200).json({
      pathParam: req.query.path,
      shopifyPath,
      query: req.query,
      url: req.url,
      domain,
    });
  }

  // Extract path and query directly from req.url to bypass Vercel parsing quirks
  const match = req.url?.match(/^\/api\/shopify\/(.*)$/);
  const pathAndQuery = match ? match[1] : '';
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // Choose correct endpoint (Admin API vs OAuth)
  let targetUrl = `https://${cleanDomain}/admin/api/2026-01/${pathAndQuery}`;
  if (pathAndQuery.includes('oauth/access_token')) {
    targetUrl = `https://${cleanDomain}/admin/${pathAndQuery}`;
  }

  try {
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      if (Buffer.isBuffer(req.body)) {
        fetchOptions.body = req.body as any;
      } else if (typeof req.body === 'string') {
        fetchOptions.body = req.body;
      } else {
        fetchOptions.body = JSON.stringify(req.body);
      }
    }

    const shopifyRes = await fetch(targetUrl, fetchOptions);
    const contentType = shopifyRes.headers.get('content-type') || '';

    // Forward Link header so client-side pagination cursor (page_info) works in production
    const linkHeader = shopifyRes.headers.get('link');
    if (linkHeader) res.setHeader('Link', linkHeader);

    if (contentType.includes('application/json')) {
      const data = await shopifyRes.json();
      return res.status(shopifyRes.status).json(data);
    } else {
      const text = await shopifyRes.text();
      return res.status(shopifyRes.status).send(text);
    }
  } catch (error: any) {
    console.error('Shopify API Proxy Error:', error);
    return res.status(502).json({ error: 'Shopify proxy fetch error', detail: error.message });
  }
}
