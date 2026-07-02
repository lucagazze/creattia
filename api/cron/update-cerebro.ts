import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Solo CRON_SECRET real: x-vercel-cron es falsificable y un secreto hardcodeado en
  // querystring queda expuesto en el código. Vercel envía el secreto automáticamente.
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET || '';
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 2. Fetch all clients
    const { data: clients, error: fetchErr } = await supabase
      .from('car_clients')
      .select('id, business_name, website_url, ig_business_id, meta_account_id, shopify_domain, shopify_access_token');

    if (fetchErr || !clients) {
      return res.status(500).json({ error: 'Error fetching clients', detail: fetchErr?.message });
    }

    const host = req.headers.host || 'localhost:3000';
    const baseUrl = host.includes('localhost') ? `http://${host}` : `https://${host}`;

    console.log(`[Cron] Found ${clients.length} clients to update.`);

    // 3. Process all clients in parallel
    const results = await Promise.allSettled(
      clients.map(async (client) => {
        const r: Record<string, string> = { id: client.id, name: client.business_name };

        // Sync catalog (Meta first, Shopify fallback) — runs daily to keep products up to date
        if (client.meta_account_id || (client.shopify_domain && client.shopify_access_token)) {
          try {
            const resCat = await fetch(`${baseUrl}/api/scrape-all`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': authHeader || ''
              },
              body: JSON.stringify({ clientId: client.id, action: 'sync-catalog' })
            });
            const catData = await resCat.json();
            r.catalog = resCat.ok ? `ok (${catData.count} productos)` : `failed (${resCat.status})`;
          } catch (err: any) {
            r.catalog = `error: ${err.message}`;
          }
        }

        // Scrape website (weekly — only if it's Monday to avoid overloading)
        const isMonday = new Date().getDay() === 1;
        if (isMonday && client.website_url) {
          try {
            const resWeb = await fetch(`${baseUrl}/api/scrape-all`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': authHeader || ''
              },
              body: JSON.stringify({ clientId: client.id, url: client.website_url, action: 'scrape-website' })
            });
            r.website = resWeb.ok ? 'ok' : `failed (${resWeb.status})`;
          } catch (err: any) {
            r.website = `error: ${err.message}`;
          }
        }

        // Sync Instagram (weekly — same)
        if (isMonday && client.ig_business_id) {
          try {
            const resIg = await fetch(`${baseUrl}/api/scrape-all`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': authHeader || ''
              },
              body: JSON.stringify({ clientId: client.id, action: 'sync-instagram' })
            });
            r.instagram = resIg.ok ? 'ok' : `failed (${resIg.status})`;
          } catch (err: any) {
            r.instagram = `error: ${err.message}`;
          }
        }

        return r;
      })
    );

    const summary = results.map(r => r.status === 'fulfilled' ? r.value : { error: String(r.reason) });
    return res.status(200).json({ success: true, clientsProcessed: clients.length, summary });

  } catch (err: any) {
    console.error('[Cron Cerebro] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
