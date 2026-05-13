import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathSegments = req.query.path as string[];
  const shopifyPath = pathSegments ? pathSegments.join('/') : '';
  
  // Extraer dominio del query param ?shop= o del header como fallback
  const domain = (req.query.shop as string) || (req.headers['x-shopify-domain'] as string) || (req.headers['x-shop-domain'] as string);
  const token = req.headers['x-shopify-access-token'] as string;

  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-shopify-domain, x-shop-domain, x-shopify-access-token, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!domain || !token) {
    return res.status(400).json({ error: 'Missing Shopify domain or token' });
  }

  // Preserve query string
  const queryString = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) value.forEach(v => queryString.append(key, v));
    else if (value) queryString.set(key, value as string);
  }
  const qs = queryString.toString();
  
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
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
      fetchOptions.body = JSON.stringify(req.body);
    }

    const shopifyRes = await fetch(targetUrl, fetchOptions);

    const data = await shopifyRes.json();
    return res.status(shopifyRes.status).json(data);
  } catch (error: any) {
    console.error('Shopify API Proxy Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
