import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query['...path'] || req.query.path;
  const klaviyoPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');

  // Use raw query string from req.url to preserve original encoding (brackets, commas, etc.)
  const rawUrl = req.url || '';
  const rawQsIdx = rawUrl.indexOf('?');
  const rawQs = rawQsIdx >= 0 ? rawUrl.slice(rawQsIdx + 1) : '';
  const targetUrl = `https://a.klaviyo.com/api/${klaviyoPath}${rawQs ? `?${rawQs}` : ''}`;

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

  if (auth) forwardHeaders['Authorization'] = auth as string;
  if (rev)  forwardHeaders['Revision']      = rev as string;
  forwardHeaders['Content-Type']  = 'application/vnd.api+json';
  forwardHeaders['Accept']        = 'application/vnd.api+json';

  try {
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers: {
        ...forwardHeaders,
        'User-Agent': 'curl/8.4.0'
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
