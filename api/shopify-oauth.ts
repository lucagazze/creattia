import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';

// Redirect URL must be registered in Shopify Partner App settings
const getRedirectUri = (req: VercelRequest) => {
  const host = req.headers.host || '';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/shopify-oauth?action=callback`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  // ── AUTHORIZE: initiate OAuth flow ──────────────────────────────────────────
  if (action === 'authorize') {
    const shop = (req.query.shop as string || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const clientId = req.query.clientId as string; // Supabase user/client ID

    if (!shop) {
      return res.status(400).json({ error: 'shop parameter required (e.g. mi-tienda.myshopify.com)' });
    }
    if (!SHOPIFY_CLIENT_ID) {
      return res.status(503).json({ error: 'Shopify OAuth no configurado. Falta SHOPIFY_CLIENT_ID en variables de entorno.' });
    }

    const scopes = 'read_orders,read_customers,read_products,read_inventory,read_analytics';
    const redirectUri = getRedirectUri(req);
    const state = Buffer.from(JSON.stringify({ clientId, shop })).toString('base64');

    const authorizeUrl =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${SHOPIFY_CLIENT_ID}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    return res.status(200).json({ authorizeUrl });
  }

  // ── CALLBACK: exchange code for access_token ─────────────────────────────────
  if (action === 'callback') {
    const code = req.query.code as string;
    const shop = req.query.shop as string;
    const stateRaw = req.query.state as string;

    if (!code || !shop) {
      return res.redirect('/integraciones?shopify=error&reason=missing_params');
    }

    let clientId: string | undefined;
    try {
      const parsed = JSON.parse(Buffer.from(stateRaw, 'base64').toString('utf8'));
      clientId = parsed.clientId;
    } catch {
      return res.redirect('/integraciones?shopify=error&reason=invalid_state');
    }

    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
      return res.redirect('/integraciones?shopify=error&reason=not_configured');
    }

    try {
      // Exchange code for permanent access token
      const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: SHOPIFY_CLIENT_ID,
          client_secret: SHOPIFY_CLIENT_SECRET,
          code
        })
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('[Shopify OAuth] Token exchange failed:', err);
        return res.redirect('/integraciones?shopify=error&reason=token_exchange');
      }

      const { access_token } = await tokenRes.json() as { access_token: string };

      // Save to Supabase
      if (clientId && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');

        // Get current connection_statuses
        const { data: clientData } = await supabase
          .from('car_clients')
          .select('connection_statuses')
          .eq('id', clientId)
          .maybeSingle();

        const currentStatuses = clientData?.connection_statuses || {};
        const updatedStatuses = { ...currentStatuses, shopify: 'ok' };

        await supabase
          .from('car_clients')
          .update({
            shopify_domain: cleanShop,
            shopify_access_token: access_token,
            ecommerce_platform: 'shopify',
            // Clear other ecommerce platforms
            tiendanube_store_id: null,
            tiendanube_access_token: null,
            wordpress_url: null,
            woo_consumer_key: null,
            woo_consumer_secret: null,
            connection_statuses: updatedStatuses
          })
          .eq('id', clientId);
      }

      return res.redirect('/integraciones?shopify=success');
    } catch (err: any) {
      console.error('[Shopify OAuth] Error:', err);
      return res.redirect('/integraciones?shopify=error&reason=server_error');
    }
  }

  return res.status(400).json({ error: 'action parameter required: authorize | callback' });
}
