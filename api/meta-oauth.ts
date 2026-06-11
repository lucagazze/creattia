import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';

const getRedirectUri = (req: VercelRequest) => {
  const host = req.headers.host || '';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}/api/meta-oauth?action=callback`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  // ── GET APP ID (for frontend popup) ─────────────────────────────────────────
  if (action === 'app-id') {
    if (!META_APP_ID) {
      return res.status(503).json({ error: 'Meta OAuth no configurado. Falta META_APP_ID en variables de entorno.' });
    }
    return res.status(200).json({ appId: META_APP_ID });
  }

  // ── AUTHORIZE: return authorization URL for popup ────────────────────────────
  if (action === 'authorize') {
    const clientId = req.query.clientId as string;

    if (!META_APP_ID) {
      return res.status(503).json({ error: 'Meta OAuth no configurado. Falta META_APP_ID.' });
    }

    const redirectUri = getRedirectUri(req);
    const state = Buffer.from(JSON.stringify({ clientId })).toString('base64');

    const authorizeUrl =
      `https://www.facebook.com/dialog/oauth` +
      `?client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&scope=${encodeURIComponent('ads_read,ads_management,business_management,read_insights')}` +
      `&response_type=code`;

    return res.status(200).json({ authorizeUrl });
  }

  // ── CALLBACK: exchange code for token + fetch ad accounts ────────────────────
  if (action === 'callback') {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      return res.redirect('/integraciones?meta=error&reason=user_denied');
    }

    if (!code) {
      return res.redirect('/integraciones?meta=error&reason=missing_code');
    }

    let clientId: string | undefined;
    try {
      const parsed = JSON.parse(Buffer.from(stateRaw, 'base64').toString('utf8'));
      clientId = parsed.clientId;
    } catch {
      return res.redirect('/integraciones?meta=error&reason=invalid_state');
    }

    if (!META_APP_ID || !META_APP_SECRET) {
      return res.redirect('/integraciones?meta=error&reason=not_configured');
    }

    try {
      const redirectUri = getRedirectUri(req);

      // 1. Exchange code for short-lived user access token
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token` +
        `?client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&code=${code}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`
      );

      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        console.error('[Meta OAuth] Token exchange failed:', err);
        return res.redirect('/integraciones?meta=error&reason=token_exchange');
      }

      const tokenData = await tokenRes.json() as { access_token: string; token_type: string };
      const shortToken = tokenData.access_token;

      // 2. Exchange for long-lived token (60 days)
      const longTokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}` +
        `&fb_exchange_token=${shortToken}`
      );

      const longTokenData = await longTokenRes.json() as { access_token: string };
      const longToken = longTokenData.access_token || shortToken;

      // 3. Fetch user's Ad Accounts
      const adAccountsRes = await fetch(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${longToken}`
      );
      const adAccountsData = await adAccountsRes.json() as { data: { id: string; name: string; account_status: number }[] };
      const adAccounts = adAccountsData.data || [];

      // Use first active account if available
      const activeAccount = adAccounts.find(a => a.account_status === 1) || adAccounts[0];
      const accountId = activeAccount?.id || '';

      // 4. Save to Supabase
      if (clientId && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: clientData } = await supabase
          .from('car_clients')
          .select('connection_statuses')
          .eq('id', clientId)
          .maybeSingle();

        const currentStatuses = clientData?.connection_statuses || {};
        const updatedStatuses = { ...currentStatuses, meta: 'ok' };

        await supabase
          .from('car_clients')
          .update({
            meta_account_id: accountId,
            facebook_access_token: longToken,
            connection_statuses: updatedStatuses
          })
          .eq('id', clientId);
      }

      return res.redirect('/integraciones?meta=success');
    } catch (err: any) {
      console.error('[Meta OAuth] Error:', err);
      return res.redirect('/integraciones?meta=error&reason=server_error');
    }
  }

  return res.status(400).json({ error: 'action parameter required: authorize | callback | app-id' });
}
