import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Tiendanube ping or validation might do a GET or POST.
  // We accept both and always return 200 to be safe.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Log details to Vercel logs to debug when Tiendanube does test pings
  console.log('[Tiendanube Webhook]', {
    method: req.method,
    query: req.query,
    body: req.body,
  });

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, message: 'Webhook endpoint is active' });
  }

  try {
    const topic = req.query.topic as string || '';
    const body = req.body || {};
    
    // For store/redact (uninstall or deletion)
    const storeId = body.store_id || body.user_id;

    if (storeId && (topic === 'store-redact' || req.url?.includes('store-redact') || topic === 'redact')) {
      const storeIdStr = String(storeId);
      console.log(`[Tiendanube Webhook] Store redact request received for storeId: ${storeIdStr}`);

      if (SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        // Find client row matching the store_id
        const { data: client, error: selectError } = await supabase
          .from('car_clients')
          .select('id, connection_statuses')
          .eq('tiendanube_store_id', storeIdStr)
          .maybeSingle();

        if (selectError) {
          console.error(`[Tiendanube Webhook] Error selecting client for storeId ${storeIdStr}:`, selectError);
        }

        if (client) {
          console.log(`[Tiendanube Webhook] Disconnecting and clearing tokens for client ID: ${client.id}`);
          const updatedStatuses = { ...(client.connection_statuses || {}), shopify: 'error' };
          
          const { error: updateError } = await supabase
            .from('car_clients')
            .update({
              tiendanube_store_id: null,
              tiendanube_access_token: null,
              ecommerce_platform: null,
              connection_statuses: updatedStatuses
            })
            .eq('id', client.id);

          if (updateError) {
            console.error(`[Tiendanube Webhook] Error updating client statuses for storeId ${storeIdStr}:`, updateError);
          } else {
            console.log(`[Tiendanube Webhook] Client ID ${client.id} successfully disconnected from Tiendanube.`);
          }
        } else {
          console.log(`[Tiendanube Webhook] No client found in database matching storeId: ${storeIdStr}`);
        }
      } else {
        console.error('[Tiendanube Webhook] SUPABASE_SERVICE_ROLE_KEY is not configured.');
      }
    } else {
      console.log(`[Tiendanube Webhook] Non-redact or informational privacy webhook received. Topic: ${topic}`);
    }

    // Always return 200 OK within less than 3 seconds to keep Tiendanube happy
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[Tiendanube Webhook] Error processing webhook:', err);
    // Return 200 OK anyway so Tiendanube doesn't block the app or retry repeatedly
    return res.status(200).json({ ok: true, error: err.message });
  }
}
