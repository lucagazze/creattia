import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44";

function cleanIp(ip: string): string {
  if (!ip) return 'unknown';
  const firstIp = ip.split(',')[0].trim();
  if (firstIp.startsWith('::ffff:')) {
    return firstIp.substring(7);
  }
  return firstIp;
}

function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === 'unknown') {
    return true;
  }
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

  // 1. Authenticate the caller using their Authorization token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.trim().toLowerCase().startsWith('bearer')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const parts = authHeader.split(' ');
  const token = parts.length > 1 ? parts[1] : '';
  if (!token) {
    return res.status(401).json({ error: 'Empty token in Authorization header' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid auth token', details: authError?.message });
    }

    const { action, payload } = req.body as { action: string; payload?: any };
    if (!action) {
      return res.status(400).json({ error: 'Missing action' });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // BRANCH A: Non-admin logActivity endpoint (open to all authenticated users)
    if (action === 'logActivity') {
      const { clientId, activityAction, metadata = {} } = payload || {};
      if (!clientId || !activityAction) {
        return res.status(400).json({ error: 'Missing clientId or activityAction' });
      }

      const rawIp = (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string) || '';
      const ip = cleanIp(rawIp);

      let location: any = {};
      if (req.headers['x-vercel-ip-country']) {
        location = {
          city: req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city'] as string) : '',
          region: req.headers['x-vercel-ip-country-region'] ? req.headers['x-vercel-ip-country-region'] as string : '',
          country: req.headers['x-vercel-ip-country'] as string,
          org: 'Vercel Edge',
        };
      } else if (!isPrivateIp(ip)) {
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

      const userEmail = metadata.user_email || user.email || 'Desconocido';
      const ua = metadata.ua || 'unknown';
      const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();

      let query = supabaseAdmin
        .from('car_user_activity')
        .select('id, metadata')
        .eq('user_id', user.id)
        .eq('action', activityAction)
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
          action: activityAction,
          metadata: { ...metadata, user_email: userEmail, refreshes: 1 },
          ip: ip === 'unknown' ? null : ip,
          location,
        });
        if (insertErr) throw insertErr;
      }

      return res.status(200).json({ success: true });
    }

    // BRANCH B: Admin checks (restricted to is_admin = true)
    const { data: profile, error: dbError } = await supabaseAdmin
      .from('car_clients')
      .select('is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbError || !profile || !profile.is_admin) {
      return res.status(403).json({ error: 'Access denied: User is not an admin' });
    }

    switch (action) {
      case 'listUsers': {
        const { perPage } = payload || { perPage: 1000 };
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage });
        if (error) throw error;
        return res.status(200).json(data);
      }
      case 'getUserById': {
        const { userId } = payload || {};
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (error) throw error;
        return res.status(200).json(data);
      }
      case 'createUser': {
        const { email, password } = payload || {};
        if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true
        });
        if (error) throw error;
        return res.status(200).json(data);
      }
      case 'updateUserById': {
        const { userId, data: updateData } = payload || {};
        if (!userId || !updateData) return res.status(400).json({ error: 'Missing userId or update data' });
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, updateData);
        if (error) throw error;
        return res.status(200).json(data);
      }
      case 'deleteUser': {
        const { userId } = payload || {};
        if (!userId) return res.status(400).json({ error: 'Missing userId' });
        const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return res.status(200).json(data);
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    console.error('[Admin Users API] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
