import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, email } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });

  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Check if already exists
  const { data: existing } = await supabase
    .from('car_clients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return res.status(200).json({ created: false, id: existing.id });

  // Auto-create
  const businessName = email ? email.split('@')[0] : 'Mi negocio';
  const { data: created, error } = await supabase
    .from('car_clients')
    .insert({ user_id: userId, business_name: businessName })
    .select('id')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ created: true, id: created.id });
}
