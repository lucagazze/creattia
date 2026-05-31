import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const { chatwoot_url, chatwoot_token, path } = req.method === 'POST'
    ? req.body
    : req.query as any;

  if (!chatwoot_url || !chatwoot_token || !path) {
    return res.status(400).json({ error: 'Missing chatwoot_url, chatwoot_token or path' });
  }

  const body = req.method === 'POST' && req.body?.body ? req.body.body : undefined;
  const method = body ? 'POST' : 'GET';

  try {
    const upstream = await fetch(`${String(chatwoot_url).replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        'api_access_token': chatwoot_token,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
