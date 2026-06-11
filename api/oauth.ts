import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';

const TN_CLIENT_ID = process.env.TIENDANUBE_CLIENT_ID || '';
const TN_CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET || '';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';

const getHost = (req: VercelRequest) => {
  const host = req.headers.host || '';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
};

async function updateClientStatuses(
  clientId: string,
  fields: Record<string, any>,
  statusKey: string,
  statusValue: 'ok' | 'error'
) {
  if (!clientId || !SUPABASE_SERVICE_ROLE_KEY) return;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from('car_clients')
    .select('connection_statuses')
    .eq('id', clientId)
    .maybeSingle();
  const updatedStatuses = { ...(data?.connection_statuses || {}), [statusKey]: statusValue };
  await supabase
    .from('car_clients')
    .update({ ...fields, connection_statuses: updatedStatuses })
    .eq('id', clientId);
}

// ── SHOPIFY OAuth ─────────────────────────────────────────────────────────────
async function handleShopify(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const base = getHost(req);

  if (action === 'shopify-authorize') {
    const shop = (req.query.shop as string || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const clientId = req.query.clientId as string;
    if (!shop) return res.status(400).json({ error: 'shop requerido' });
    if (!SHOPIFY_CLIENT_ID) return res.status(503).json({ error: 'Shopify OAuth no configurado (falta SHOPIFY_CLIENT_ID).' });

    const scopes = 'read_orders,read_customers,read_products,read_inventory,read_analytics';
    const redirectUri = `${base}/api/shopify-callback`;
    const state = Buffer.from(JSON.stringify({ clientId, shop })).toString('base64');

    const authorizeUrl =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${SHOPIFY_CLIENT_ID}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    return res.status(200).json({ authorizeUrl });
  }

  if (action === 'shopify-callback' || req.url?.includes('/api/shopify-callback')) {
    const code = req.query.code as string;
    const shop = req.query.shop as string;
    const stateRaw = req.query.state as string;
    if (!code || !shop) return res.redirect('/integraciones?shopify=error&reason=missing_params');

    let clientId: string | undefined;
    try { clientId = JSON.parse(Buffer.from(stateRaw, 'base64').toString()).clientId; }
    catch { return res.redirect('/integraciones?shopify=error&reason=invalid_state'); }

    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET)
      return res.redirect('/integraciones?shopify=error&reason=not_configured');

    try {
      const redirectUri = `${base}/api/shopify-callback`;
      const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: SHOPIFY_CLIENT_ID, client_secret: SHOPIFY_CLIENT_SECRET, code })
      });
      if (!tokenRes.ok) return res.redirect('/integraciones?shopify=error&reason=token_exchange');
      const { access_token } = await tokenRes.json() as { access_token: string };
      const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
      await updateClientStatuses(clientId!, {
        shopify_domain: cleanShop,
        shopify_access_token: access_token,
        ecommerce_platform: 'shopify',
        tiendanube_store_id: null, tiendanube_access_token: null,
        wordpress_url: null, woo_consumer_key: null, woo_consumer_secret: null
      }, 'shopify', 'ok');
      return res.redirect('/integraciones?shopify=success');
    } catch (err: any) {
      console.error('[Shopify OAuth]', err);
      return res.redirect('/integraciones?shopify=error&reason=server_error');
    }
  }
}

// ── TIENDANUBE OAuth ──────────────────────────────────────────────────────────
async function handleTiendanube(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const base = getHost(req);

  if (action === 'tiendanube-authorize') {
    const clientId = req.query.clientId as string;
    if (!TN_CLIENT_ID) return res.status(503).json({ error: 'TiendaNube OAuth no configurado (falta TIENDANUBE_CLIENT_ID).' });
    const state = Buffer.from(JSON.stringify({ clientId })).toString('base64');
    const authorizeUrl =
      `https://www.tiendanube.com/apps/${TN_CLIENT_ID}/authorize` +
      `?state=${encodeURIComponent(state)}`;
    return res.status(200).json({ authorizeUrl });
  }

  if (action === 'tiendanube-callback') {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;
    if (!code) return res.redirect('/integraciones?tiendanube=error&reason=missing_code');

    let clientId: string | undefined;
    try { clientId = JSON.parse(Buffer.from(stateRaw, 'base64').toString()).clientId; }
    catch { return res.redirect('/integraciones?tiendanube=error&reason=invalid_state'); }

    if (!TN_CLIENT_ID || !TN_CLIENT_SECRET)
      return res.redirect('/integraciones?tiendanube=error&reason=not_configured');

    try {
      const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: TN_CLIENT_ID, client_secret: TN_CLIENT_SECRET, grant_type: 'authorization_code', code }).toString()
      });
      if (!tokenRes.ok) return res.redirect('/integraciones?tiendanube=error&reason=token_exchange');
      const { access_token, user_id: storeId } = await tokenRes.json() as { access_token: string; user_id: number };
      await updateClientStatuses(clientId!, {
        tiendanube_store_id: String(storeId),
        tiendanube_access_token: access_token,
        ecommerce_platform: 'tiendanube',
        shopify_domain: null, shopify_access_token: null,
        wordpress_url: null, woo_consumer_key: null, woo_consumer_secret: null
      }, 'shopify', 'ok');
      return res.redirect('/integraciones?tiendanube=success');
    } catch (err: any) {
      console.error('[TiendaNube OAuth]', err);
      return res.redirect('/integraciones?tiendanube=error&reason=server_error');
    }
  }
}

// ── META OAuth ────────────────────────────────────────────────────────────────
async function handleMeta(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const base = getHost(req);

  if (action === 'meta-authorize') {
    const clientId = req.query.clientId as string;
    if (!META_APP_ID) return res.status(503).json({ error: 'Meta OAuth no configurado (falta META_APP_ID).' });
    const redirectUri = `${base}/api/oauth?action=meta-callback`;
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

  if (action === 'meta-callback') {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;
    const error = req.query.error as string;
    if (error) return res.redirect('/integraciones?meta=error&reason=user_denied');
    if (!code) return res.redirect('/integraciones?meta=error&reason=missing_code');

    let clientId: string | undefined;
    try { clientId = JSON.parse(Buffer.from(stateRaw, 'base64').toString()).clientId; }
    catch { return res.redirect('/integraciones?meta=error&reason=invalid_state'); }

    if (!META_APP_ID || !META_APP_SECRET)
      return res.redirect('/integraciones?meta=error&reason=not_configured');

    try {
      const redirectUri = `${base}/api/oauth?action=meta-callback`;
      // 1. Short-lived token
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token` +
        `?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}` +
        `&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`
      );
      if (!tokenRes.ok) return res.redirect('/integraciones?meta=error&reason=token_exchange');
      const { access_token: shortToken } = await tokenRes.json() as { access_token: string };

      // 2. Long-lived token (60 days)
      const longTokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token` +
        `?grant_type=fb_exchange_token&client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}&fb_exchange_token=${shortToken}`
      );
      const { access_token: longToken } = await longTokenRes.json() as { access_token: string };

      // 3. Fetch Ad Accounts
      const adRes = await fetch(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${longToken || shortToken}`
      );
      const { data: adAccounts = [] } = await adRes.json() as { data: { id: string; account_status: number }[] };
      const activeAccount = adAccounts.find(a => a.account_status === 1) || adAccounts[0];

      await updateClientStatuses(clientId!, {
        meta_account_id: activeAccount?.id || '',
        facebook_access_token: longToken || shortToken
      }, 'meta', 'ok');
      return res.redirect('/integraciones?meta=success');
    } catch (err: any) {
      console.error('[Meta OAuth]', err);
      return res.redirect('/integraciones?meta=error&reason=server_error');
    }
  }
}

// ── EMAIL PREVIEW (Open Graph redirect) ─────────────────────────────────────
function handlePreview(req: VercelRequest, res: VercelResponse) {
  const base = getHost(req);
  const file    = (req.query.email as string)   || '';
  const subject = (req.query.subject as string) || '';
  const client  = (req.query.client as string)  || '';
  const angle   = (req.query.angle as string)   || '';

  const title       = subject || file.replace('.html', '').replace(/_/g, ' ');
  const description = [client, angle].filter(Boolean).join(' · ') || 'Vista previa del email';
  const previewUrl  = `${base}/#/preview?email=${encodeURIComponent(file)}&subject=${encodeURIComponent(subject)}`;
  const screenshotName = file ? file.replace('.html', '.webp') : '';
  const imageUrl = screenshotName
    ? `${base}/email-library/screenshots/${encodeURIComponent(screenshotName)}`
    : `${base}/email-images/tsf_bite_logo.png`;

  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:url" content="${esc(previewUrl)}"/>
<meta property="og:image" content="${esc(imageUrl)}"/>
<meta property="og:site_name" content="Algoritmia — Email Preview"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(description)}"/>
<meta name="twitter:image" content="${esc(imageUrl)}"/>
<meta http-equiv="refresh" content="0; url=${esc(previewUrl)}"/>
<script>window.location.replace(${JSON.stringify(previewUrl)});</script>
</head><body style="margin:0;background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;">
<p style="font-family:Arial,sans-serif;color:#888;font-size:13px;">Redirigiendo…</p>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(html);
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action as string || '';

  // Email preview (routed from /api/preview via vercel.json rewrite)
  if (action === 'preview' || req.query.email) return handlePreview(req, res);

  if (action.startsWith('shopify')) return handleShopify(req, res);
  if (action.startsWith('tiendanube')) return handleTiendanube(req, res);
  if (action.startsWith('meta')) return handleMeta(req, res);

  return res.status(400).json({ error: 'action required: shopify-authorize | shopify-callback | tiendanube-authorize | tiendanube-callback | meta-authorize | meta-callback' });
}
