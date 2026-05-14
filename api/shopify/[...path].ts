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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-shopify-domain, x-shop-domain, x-shopify-access-token, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
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
  let targetUrl = `https://${cleanDomain}/admin/api/2024-01/${pathAndQuery}`;
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
        fetchOptions.body = req.body;
      } else if (typeof req.body === 'string') {
        fetchOptions.body = req.body;
      } else {
        fetchOptions.body = JSON.stringify(req.body);
      }
    }

    const shopifyRes = await fetch(targetUrl, fetchOptions);
    const contentType = shopifyRes.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await shopifyRes.json();
      return res.status(shopifyRes.status).json(data);
    } else {
      const text = await shopifyRes.text();
      // If it's an error from Shopify but not JSON, send it as text or wrap it
      return res.status(shopifyRes.status).send(text);
    }
  } catch (error: any) {
    console.error('Shopify API Proxy Error:', error);
    return res.status(502).json({ error: 'Shopify proxy fetch error', detail: error.message });
  }
}
