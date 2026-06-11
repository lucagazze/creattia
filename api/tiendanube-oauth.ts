import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TN_CLIENT_ID = process.env.TIENDANUBE_CLIENT_ID || '';
const TN_CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET || '';

const getRedirectUri = (req: VercelRequest) => {
  const host = req.headers.host || '';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/tiendanube-oauth?action=callback`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  // ── AUTHORIZE: initiate OAuth flow ──────────────────────────────────────────
  if (action === 'authorize') {
    const clientId = req.query.clientId as string;

    if (!TN_CLIENT_ID) {
      return res.status(503).json({ error: 'TiendaNube OAuth no configurado. Falta TIENDANUBE_CLIENT_ID en variables de entorno.' });
    }

    const state = Buffer.from(JSON.stringify({ clientId })).toString('base64');
    const redirectUri = getRedirectUri(req);

    // TiendaNube OAuth authorization URL
    const authorizeUrl =
      `https://www.tiendanube.com/apps/${TN_CLIENT_ID}/authorize` +
      `?state=${encodeURIComponent(state)}`;

    return res.status(200).json({ authorizeUrl });
  }

  // ── CALLBACK: exchange code for access_token ─────────────────────────────────
  if (action === 'callback') {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;

    if (!code) {
      return res.redirect('/integraciones?tiendanube=error&reason=missing_code');
    }

    let clientId: string | undefined;
    try {
      const parsed = JSON.parse(Buffer.from(stateRaw, 'base64').toString('utf8'));
      clientId = parsed.clientId;
    } catch {
      return res.redirect('/integraciones?tiendanube=error&reason=invalid_state');
    }

    if (!TN_CLIENT_ID || !TN_CLIENT_SECRET) {
      return res.redirect('/integraciones?tiendanube=error&reason=not_configured');
    }

    try {
      // Exchange code for permanent access token
      // TiendaNube returns: { access_token, token_type, user_id (= store_id) }
      const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: TN_CLIENT_ID,
          client_secret: TN_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code
        }).toString()
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('[TiendaNube OAuth] Token exchange failed:', err);
        return res.redirect('/integraciones?tiendanube=error&reason=token_exchange');
      }

      const tokenData = await tokenRes.json() as {
        access_token: string;
        token_type: string;
        user_id: number; // This is the store ID
      };

      const { access_token, user_id: storeId } = tokenData;

      // Save to Supabase
      if (clientId && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: clientData } = await supabase
          .from('car_clients')
          .select('connection_statuses')
          .eq('id', clientId)
          .maybeSingle();

        const currentStatuses = clientData?.connection_statuses || {};
        const updatedStatuses = { ...currentStatuses, shopify: 'ok' }; // 'shopify' key is used for ecommerce status

        await supabase
          .from('car_clients')
          .update({
            tiendanube_store_id: String(storeId),
            tiendanube_access_token: access_token,
            ecommerce_platform: 'tiendanube',
            // Clear other ecommerce platforms
            shopify_domain: null,
            shopify_access_token: null,
            wordpress_url: null,
            woo_consumer_key: null,
            woo_consumer_secret: null,
            connection_statuses: updatedStatuses
          })
          .eq('id', clientId);
      }

      return res.redirect('/integraciones?tiendanube=success');
    } catch (err: any) {
      console.error('[TiendaNube OAuth] Error:', err);
      return res.redirect('/integraciones?tiendanube=error&reason=server_error');
    }
  }

  return res.status(400).json({ error: 'action parameter required: authorize | callback' });
}
