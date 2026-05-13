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

  // Build query string excluding 'path' and 'shop'
  const queryString = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path' || key === 'shop') continue;
    if (Array.isArray(value)) value.forEach(v => queryString.append(key, v));
    else if (value) queryString.set(key, value as string);
  }
  const qs = queryString.toString();
  
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // Choose correct endpoint (Admin API vs OAuth)
  let targetUrl = `https://${cleanDomain}/admin/api/2024-01/${shopifyPath}${qs ? `?${qs}` : ''}`;
  if (shopifyPath.includes('oauth/access_token')) {
    targetUrl = `https://${cleanDomain}/admin/${shopifyPath}${qs ? `?${qs}` : ''}`;
  }

  try {
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
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
