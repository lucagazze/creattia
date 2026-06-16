import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44";

const BASE = 'https://graph.facebook.com/v21.0';
const READ_ONLY_DENY = new Set(['access_token']);

const supabaseAdmin = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let metaTokenCache: { value: string; expiresAt: number } | null = null;

function getBearer(req: VercelRequest): string {
  const header = req.headers.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function normalizePath(path: unknown): string {
  const value = Array.isArray(path) ? path[0] : path;
  const clean = String(value || '').trim().replace(/^\/+/, '');
  if (!clean || clean.includes('://') || clean.includes('..') || clean.includes('\\')) return '';
  return clean;
}

async function getMetaToken(): Promise<string> {
  const now = Date.now();
  if (metaTokenCache && metaTokenCache.expiresAt > now) return metaTokenCache.value;
  if (!supabaseAdmin) return '';
  const { data } = await supabaseAdmin.from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
  const value = data?.value || '';
  metaTokenCache = { value, expiresAt: now + 5 * 60 * 1000 };
  return value;
}

async function getClientMetaToken(clientId: string, bearer: string): Promise<string> {
  if (!clientId) return '';
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data } = await supabaseUser
    .from('car_clients')
    .select('facebook_access_token')
    .eq('id', clientId)
    .maybeSingle();
  return data?.facebook_access_token || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const bearer = getBearer(req);
  if (!bearer) return res.status(401).json({ error: 'Missing Authorization header' });

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(bearer);
  if (authError || !user) return res.status(401).json({ error: 'Invalid auth token' });

  const graphPath = normalizePath(req.query.path);
  if (!graphPath) return res.status(400).json({ error: 'Invalid Meta path' });

  const clientIdRaw = Array.isArray(req.query.clientId) ? req.query.clientId[0] : req.query.clientId;
  const clientId = typeof clientIdRaw === 'string' ? clientIdRaw.trim() : '';
  const token = (await getClientMetaToken(clientId, bearer)) || await getMetaToken();
  if (!token) return res.status(500).json({ error: 'No Meta token configured' });

  const url = new URL(`${BASE}/${graphPath}`);
  Object.entries(req.query).forEach(([key, raw]) => {
    if (key === 'path' || key === 'clientId' || READ_ONLY_DENY.has(key)) return;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined) url.searchParams.set(key, String(value));
  });
  url.searchParams.set('access_token', token);

  try {
    const metaRes = await fetch(url.toString());
    const data = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok || data?.error) {
      return res.status(metaRes.ok ? 502 : metaRes.status).json({
        error: data?.error?.message || `Meta API error ${metaRes.status}`,
        metaError: data?.error || null,
      });
    }
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Meta API request failed' });
  }
}
