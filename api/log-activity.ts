import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44";

function cleanIp(ip: string): string {
  if (!ip) return 'unknown';
  // If it's a comma-separated list (e.g. from x-forwarded-for), take the first one
  const firstIp = ip.split(',')[0].trim();
  // Strip IPv6 prefix for IPv4-mapped addresses
  if (firstIp.startsWith('::ffff:')) {
    return firstIp.substring(7);
  }
  return firstIp;
}

function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === 'unknown') {
    return true;
  }
  // Check private IP ranges: 10.x.x.x, 172.16.x.x-172.31.x.x, 192.168.x.x
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return true;
  }
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Authenticate user
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid auth token', details: authError?.message });
    }

    const { clientId, action, metadata = {} } = req.body as { clientId: string; action: string; metadata?: any };
    if (!clientId || !action) {
      return res.status(400).json({ error: 'Missing clientId or action' });
    }

    // 2. Extract Client IP
    const rawIp = (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string) || '';
    const ip = cleanIp(rawIp);

    // 3. Resolve Location (preferring Vercel Geolocation headers)
    let location: any = {};
    if (req.headers['x-vercel-ip-country']) {
      location = {
        city: req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city'] as string) : '',
        region: req.headers['x-vercel-ip-country-region'] ? req.headers['x-vercel-ip-country-region'] as string : '',
        country: req.headers['x-vercel-ip-country'] as string,
        org: 'Vercel Edge',
      };
    } else if (!isPrivateIp(ip)) {
      // Fallback: Query a fast API with timeout (1 second max)
      try {
        const fetchRes = await Promise.race([
          fetch(`https://freeipapi.com/api/json/${ip}`),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
        ]) as Response;

        if (fetchRes && fetchRes.ok) {
          const data = await fetchRes.json();
          location = {
            city: data.city || data.cityName || '',
            region: data.region || data.regionName || '',
            country: data.country || data.countryName || '',
            org: data.isp || '',
          };
        }
      } catch (geoErr) {
        console.warn('Geolocation fallback failed:', geoErr);
      }
    }

    // 4. Write/Update Activity using supabaseAdmin
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const userEmail = metadata.user_email || user.email || 'Desconocido';
    const ua = metadata.ua || 'unknown';
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();

    let query = supabaseAdmin
      .from('car_user_activity')
      .select('id, metadata')
      .eq('user_id', user.id)
      .eq('action', action)
      .gt('created_at', oneHourAgo);

    if (ip !== 'unknown') {
      query = query.eq('ip', ip);
    } else {
      query = query.is('ip', null);
    }

    const { data: allExisting, error: selectErr } = await query.order('created_at', { ascending: false });
    if (selectErr) throw selectErr;

    const existing = allExisting?.find(e => e.metadata?.ua === ua);

    if (existing) {
      const { error: updateErr } = await supabaseAdmin
        .from('car_user_activity')
        .update({
          created_at: new Date().toISOString(),
          metadata: {
            ...existing.metadata,
            ...metadata,
            user_email: userEmail,
            refreshes: (existing.metadata?.refreshes || 0) + 1,
          },
        })
        .eq('id', existing.id);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabaseAdmin.from('car_user_activity').insert({
        user_id: user.id,
        client_id: clientId,
        action,
        metadata: { ...metadata, user_email: userEmail, refreshes: 1 },
        ip: ip === 'unknown' ? null : ip,
        location,
      });
      if (insertErr) throw insertErr;
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[Log Activity API] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
