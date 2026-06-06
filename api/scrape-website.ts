import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { chatwoot_url, chatwoot_token, path, body: cwBody, method: cwMethod } = req.body;
  if (!chatwoot_url || !chatwoot_token || !path) {
    return res.status(400).json({ error: 'Missing chatwoot params' });
  }

  // Validate chatwoot_token belongs to a registered client in our DB
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: client } = await supabase
      .from('car_clients')
      .select('id')
      .eq('chatwoot_token', chatwoot_token)
      .single();
    if (!client) return res.status(403).json({ error: 'Unauthorized' });
  } catch {
    return res.status(403).json({ error: 'Auth check failed' });
  }
  try {
    const method = cwMethod || (cwBody !== undefined ? 'POST' : 'GET');
    const hasBody = cwBody !== undefined && method !== 'DELETE' && method !== 'GET';
    const upstream = await fetch(`${String(chatwoot_url).replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'api_access_token': chatwoot_token, 'Content-Type': 'application/json' },
      ...(hasBody ? { body: JSON.stringify(cwBody) } : {}),
    });
    const text = await upstream.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return res.status(upstream.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
