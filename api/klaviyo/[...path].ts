import type { VercelRequest, VercelResponse } from '@vercel/node';

const KLAVIYO_REVISION = '2024-10-15';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract path and query directly from req.url — same approach as the Shopify proxy.
  // This bypasses Vercel's qs parser entirely, which was mangling bracket params
  // (page%5Bsize%5D → nested object) and causing 404s for multi-segment paths.
  const rawUrl = req.url || '';
  const urlMatch = rawUrl.match(/^\/api\/klaviyo\/?([^?]*)(.*)?$/);
  const klaviyoPath = urlMatch?.[1] || '';
  const queryPart  = urlMatch?.[2] || '';
  const targetUrl  = `https://a.klaviyo.com/api/${klaviyoPath}${queryPart}`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Revision, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.headers['x-debug-proxy'] === '1') {
    return res.status(200).json({ rawUrl, klaviyoPath, queryPart, targetUrl });
  }

  const auth = req.headers['authorization'];
  const forwardHeaders: Record<string, string> = {
    'Revision': KLAVIYO_REVISION,
    'Accept': 'application/vnd.api+json',
  };
  if (auth) forwardHeaders['Authorization'] = auth as string;
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
