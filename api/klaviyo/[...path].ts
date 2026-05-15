import type { VercelRequest, VercelResponse } from '@vercel/node';

const KLAVIYO_REVISION = '2024-10-15';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query['...path'] || req.query.path;
  const klaviyoPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');

  // Build query string from req.query (already decoded by Vercel), stripping routing params.
  // Vercel's qs parser converts bracket notation (e.g. page[size]=50) into nested objects.
  // We flatten them back (page[size] → 50) so URLSearchParams serializes them correctly.
  const rawQuery: Record<string, any> = { ...req.query };
  delete rawQuery['...path'];
  delete rawQuery['path'];

  const flat: Record<string, string> = {};
  const flatten = (obj: any, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
        flatten(v, key);
      } else if (Array.isArray(v)) {
        (v as any[]).forEach((item, i) => { flat[`${key}[${i}]`] = String(item ?? ''); });
      } else {
        flat[key] = String(v ?? '');
      }
    }
  };
  flatten(rawQuery);
  const qs = new URLSearchParams(flat).toString();
  const targetUrl = `https://a.klaviyo.com/api/${klaviyoPath}${qs ? `?${qs}` : ''}`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Revision, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.headers['x-debug-proxy'] === '1') {
    return res.status(200).json({ pathKeys: { spread: req.query['...path'], plain: req.query.path }, klaviyoPath, targetUrl, url: req.url });
  }

  const auth = req.headers['authorization'];
  const forwardHeaders: Record<string, string> = {
    'Revision': KLAVIYO_REVISION,
    'Accept': 'application/vnd.api+json',
  };
  if (auth) forwardHeaders['Authorization'] = auth as string;
  // Only set Content-Type for requests that have a body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    forwardHeaders['Content-Type'] = 'application/vnd.api+json';
  }

  try {
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers: { ...forwardHeaders, 'User-Agent': 'curl/8.4.0' },
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

    ['retry-after', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset'].forEach(h => {
      const val = klaviyoRes.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    res.status(klaviyoRes.status);
    const contentType = klaviyoRes.headers.get('content-type') || '';

    if (!klaviyoRes.ok) {
      const errText = await klaviyoRes.text();
      console.error(`[Klaviyo Proxy] ${req.method} ${targetUrl} → ${klaviyoRes.status}:`, errText);
      return res.send(errText);
    }

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
