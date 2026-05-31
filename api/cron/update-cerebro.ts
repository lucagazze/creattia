import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Verify authorization (Vercel cron validation or secret parameter)
  const authHeader = req.headers.authorization;
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}` || req.headers['x-vercel-cron'] === '1';
  
  if (!isCron && req.query.secret !== 'supersecretupdate') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 2. Fetch all clients
    const { data: clients, error: fetchErr } = await supabase
      .from('car_clients')
      .select('id, business_name, website_url, ig_business_id');

    if (fetchErr || !clients) {
      return res.status(500).json({ error: 'Error fetching clients', detail: fetchErr?.message });
    }

    const host = req.headers.host || 'localhost:3000';
    // Use https if not on localhost
    const baseUrl = host.includes('localhost') ? `http://${host}` : `https://${host}`;

    console.log(`[Cron Cerebro] Found ${clients.length} clients to update.`);

    // 3. Trigger parallel scrape and sync updates for all clients
    const results = await Promise.allSettled(
      clients.map(async (client) => {
        const clientResults = { id: client.id, name: client.business_name, website: 'none', instagram: 'none' };

        // Scrape Website
        if (client.website_url) {
          try {
            const resWeb = await fetch(`${baseUrl}/api/scrape-all`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId: client.id, url: client.website_url, action: 'scrape-website' })
            });
            clientResults.website = resWeb.ok ? 'success' : `failed (${resWeb.status})`;
          } catch (err: any) {
            clientResults.website = `error: ${err.message}`;
          }
        }

        // Sync Instagram
        if (client.ig_business_id) {
          try {
            const resIg = await fetch(`${baseUrl}/api/scrape-all`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId: client.id, action: 'sync-instagram' })
            });
            clientResults.instagram = resIg.ok ? 'success' : `failed (${resIg.status})`;
          } catch (err: any) {
            clientResults.instagram = `error: ${err.message}`;
          }
        }

        return clientResults;
      })
    );

    const summary = results.map(r => r.status === 'fulfilled' ? r.value : r.reason);
    return res.status(200).json({ success: true, clientsProcessed: clients.length, summary });

  } catch (err: any) {
    console.error('[Cron Cerebro] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
