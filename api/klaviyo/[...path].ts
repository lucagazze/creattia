import type { VercelRequest, VercelResponse } from '@vercel/node';

const KLAVIYO_REVISION = '2024-10-15';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathParam = req.query['...path'] || req.query.path;
  const klaviyoPath = Array.isArray(pathParam) ? pathParam.join('/') : (pathParam || '');

  // Use the raw query string from req.url to preserve special chars (parens, brackets, quotes)
  // that URLSearchParams would over-encode, breaking Klaviyo filter syntax.
  const rawUrl = req.url || '';
  const qIdx = rawUrl.indexOf('?');
  let rawQs = qIdx !== -1 ? rawUrl.slice(qIdx + 1) : '';

  // Strip Vercel's internal catch-all routing params from the query string
  rawQs = rawQs
    .split('&')
    .filter(part => !part.startsWith('path=') && !part.startsWith('...path=') && !part.match(/^path\[/))
    .join('&');

  const targetUrl = `https://a.klaviyo.com/api/${klaviyoPath}${rawQs ? `?${rawQs}` : ''}`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Revision, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
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

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  try {
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers: { ...forwardHeaders, 'User-Agent': 'curl/8.4.0' },
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

    // Retry up to 3 times on 429 with exponential backoff
    let klaviyoRes: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      klaviyoRes = await fetch(targetUrl, fetchOptions);
      if (klaviyoRes.status !== 429) break;
      const retryAfter = parseInt(klaviyoRes.headers.get('retry-after') || '2');
      const backoff = Math.min((attempt + 1) * retryAfter * 1000, 8000);
      if (attempt < 3) await sleep(backoff);
    }
    if (!klaviyoRes) throw new Error('No response from Klaviyo');

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
