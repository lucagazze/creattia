import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44";

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

  // 1. Authenticate the caller (admin user) using their Authorization token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.split(' ')[1];

  try {
    // Initialize standard client to verify user token and check admin status
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid auth token', details: authError?.message });
    }

    // Check if the user is an administrator
    const { data: profile, error: dbError } = await supabase
      .from('car_clients')
      .select('is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (dbError || !profile || !profile.is_admin) {
      return res.status(403).json({ error: 'Access denied: User is not an admin' });
    }

    // Initialize service role admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { action, payload } = req.body as { action: string; payload?: any };

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
