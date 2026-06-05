import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'x-wc-base-url, x-wc-consumer-key, x-wc-consumer-secret, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const baseUrl = req.headers['x-wc-base-url'] as string;
  const ck = req.headers['x-wc-consumer-key'] as string;
  const cs = req.headers['x-wc-consumer-secret'] as string;

  if (!baseUrl || !ck || !cs) {
    return res.status(400).json({ error: 'Missing WooCommerce credentials' });
  }

  const cleanBase = baseUrl.replace(/\/$/, '');
  const creds = Buffer.from(`${ck}:${cs}`).toString('base64');

  const { after, before, page = '1', per_page = '100' } = req.query;
  const params = new URLSearchParams();
  if (after) params.set('after', after as string);
  if (before) params.set('before', before as string);
  params.set('per_page', per_page as string);
  params.set('page', page as string);
  params.set('orderby', 'date');
  params.set('order', 'desc');

  const url = `${cleanBase}/wp-json/wc/v3/orders?${params.toString()}`;

  try {
    const wcRes = await fetch(url, {
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/json',
      },
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
