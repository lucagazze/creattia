import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Build the Klaviyo API URL from the path segments
  const pathSegments = req.query.path as string[];
  const klaviyoPath = pathSegments ? pathSegments.join('/') : '';
  
  // Preserve query string (e.g. pagination cursors)
  const queryString = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue; // skip the path catch-all param
    if (Array.isArray(value)) {
      value.forEach(v => queryString.append(key, v));
    } else if (value) {
      queryString.set(key, value);
    }
  }
  const qs = queryString.toString();
  const targetUrl = `https://a.klaviyo.com/api/${klaviyoPath}${qs ? `?${qs}` : ''}`;

  // Set CORS header so the browser doesn't block the response
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Revision, Content-Type, Accept');

  // Handle preflight early
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Forward allowed headers (Authorization, Revision, Content-Type, Accept)
  const forwardHeaders: Record<string, string> = {};
  if (req.headers['accept'])          forwardHeaders['Accept']          = req.headers['accept'] as string;
  if (req.headers['authorization'])   forwardHeaders['Authorization']  = req.headers['authorization'] as string;
  if (req.headers['revision'])        forwardHeaders['Revision']        = req.headers['revision'] as string;
  if (req.headers['content-type'])    forwardHeaders['Content-Type']    = req.headers['content-type'] as string;

  try {
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers: forwardHeaders,
    };

    // Forward body for POST/PATCH/PUT
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const klaviyoRes = await fetch(targetUrl, fetchOptions);
    const contentType = klaviyoRes.headers.get('content-type') || '';

    // Forward critical headers back to the frontend (especially for rate limiting)
    const retryAfter = klaviyoRes.headers.get('retry-after');
    if (retryAfter) res.setHeader('Retry-After', retryAfter);
    
    const rlLimit = klaviyoRes.headers.get('ratelimit-limit');
    if (rlLimit) res.setHeader('RateLimit-Limit', rlLimit);
    
    const rlRem = klaviyoRes.headers.get('ratelimit-remaining');
    if (rlRem) res.setHeader('RateLimit-Remaining', rlRem);

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
