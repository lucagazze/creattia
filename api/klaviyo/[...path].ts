import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract path and query directly from req.url to bypass Vercel parsing quirks
  const match = req.url?.match(/^\/api\/klaviyo\/(.*)$/);
  const pathAndQuery = match ? match[1] : '';
  const targetUrl = `https://a.klaviyo.com/api/${pathAndQuery}`;

  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Revision, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Forward critical headers correctly (case-insensitive in req.headers)
  const forwardHeaders: Record<string, string> = {};
  const auth = req.headers['authorization'];
  const rev = req.headers['revision'];
  const ct = req.headers['content-type'];
  const acc = req.headers['accept'];

  if (auth) forwardHeaders['Authorization'] = auth as string;
  if (rev)  forwardHeaders['Revision']      = rev as string;
  if (ct)   forwardHeaders['Content-Type']  = ct as string;
  if (acc)  forwardHeaders['Accept']        = acc as string;

  try {
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers: {
        ...forwardHeaders,
        'User-Agent': 'curl/8.4.0'
      },
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const klaviyoRes = await fetch(targetUrl, fetchOptions);
    const contentType = klaviyoRes.headers.get('content-type') || '';

    // Forward rate limit headers back
    ['retry-after', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset'].forEach(h => {
      const val = klaviyoRes.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    res.status(klaviyoRes.status);

    if (contentType.includes('application/json')) {
      const data = await klaviyoRes.json();
      return res.json(data);
    } else {
      const text = await klaviyoRes.text();
      return res.send(text);
    }
  } catch (err: any) {
    console.error('[Klaviyo Proxy Error]', err);
    return res.status(502).json({ error: 'Klaviyo proxy error', detail: err.message });
  }
}
