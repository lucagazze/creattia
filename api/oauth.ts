import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';
const SHOPIFY_ORGANIZATION_ID = process.env.SHOPIFY_ORGANIZATION_ID || '222188391';

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
  const { error: updateErr } = await supabase
    .from('car_clients')
    .update({ ...fields, connection_statuses: updatedStatuses })
    .eq('id', clientId);
  if (updateErr) console.error(`[updateClientStatuses] clientId=${clientId} statusKey=${statusKey}`, updateErr);
}

// ── SHOPIFY OAuth ─────────────────────────────────────────────────────────────
async function handleShopify(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const base = getHost(req);

  if (action === 'shopify-install-link') {
    if (!SHOPIFY_CLIENT_ID) return res.status(503).json({ error: 'Shopify OAuth no configurado (falta SHOPIFY_CLIENT_ID).' });
    const installUrl = `https://admin.shopify.com/?organization_id=${SHOPIFY_ORGANIZATION_ID}&no_redirect=true&redirect=/oauth/redirect_from_developer_dashboard?client_id%3D${SHOPIFY_CLIENT_ID}`;
    return res.status(200).json({ installUrl });
  }

  if (action === 'shopify-authorize') {
    const shop = (req.query.shop as string || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const clientId = req.query.clientId as string;
    if (!shop) return res.status(400).json({ error: 'shop requerido' });
    if (!SHOPIFY_CLIENT_ID) return res.status(503).json({ error: 'Shopify OAuth no configurado (falta SHOPIFY_CLIENT_ID).' });

    const scopes = 'read_orders,read_customers,read_products,read_inventory,read_analytics';
    const redirectUri = base.includes('localhost') || base.includes('127.0.5.1') || base.includes('127.0.0.1')
      ? `${base}/api/shopify-callback`
      : 'https://app.algoritmiadesarrollos.com.ar/api/shopify-callback';
    const state = Buffer.from(JSON.stringify({ clientId, shop, host: base })).toString('base64');

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
    
    let clientId: string | undefined;
    let originalHost: string | undefined;
    
    try {
      const parsedState = JSON.parse(Buffer.from(stateRaw || '', 'base64').toString());
      clientId = parsedState.clientId;
      originalHost = parsedState.host;
    } catch {
      return res.redirect(`${base}/#/integraciones?shopify=error&reason=invalid_state`);
    }

    const redirectBase = originalHost || base;
    if (!code || !shop) return res.redirect(`${redirectBase}/#/integraciones?shopify=error&reason=missing_params`);

    if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET)
      return res.redirect(`${redirectBase}/#/integraciones?shopify=error&reason=not_configured`);

    try {
      const redirectUri = base.includes('localhost') || base.includes('127.0.5.1') || base.includes('127.0.0.1')
        ? `${base}/api/shopify-callback`
        : 'https://app.algoritmiadesarrollos.com.ar/api/shopify-callback';
        
      const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: SHOPIFY_CLIENT_ID, client_secret: SHOPIFY_CLIENT_SECRET, code })
      });
      if (!tokenRes.ok) return res.redirect(`${redirectBase}/#/integraciones?shopify=error&reason=token_exchange`);
      const { access_token } = await tokenRes.json() as { access_token: string };
      const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
      await updateClientStatuses(clientId!, {
        shopify_domain: cleanShop,
        shopify_access_token: access_token,
        ecommerce_platform: 'shopify',
        tiendanube_store_id: null, tiendanube_access_token: null,
        wordpress_url: null, woo_consumer_key: null, woo_consumer_secret: null
      }, 'shopify', 'ok');
      return res.redirect(`${redirectBase}/#/integraciones?shopify=success`);
    } catch (err: any) {
      console.error('[Shopify OAuth]', err);
      return res.redirect(`${redirectBase}/#/integraciones?shopify=error&reason=server_error`);
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
    if (!code) return res.redirect(`${base}/#/integraciones?tiendanube=error&reason=missing_code`);

    let clientId: string | undefined;
    try { clientId = JSON.parse(Buffer.from(stateRaw, 'base64').toString()).clientId; }
    catch { return res.redirect(`${base}/#/integraciones?tiendanube=error&reason=invalid_state`); }

    if (!TN_CLIENT_ID || !TN_CLIENT_SECRET)
      return res.redirect(`${base}/#/integraciones?tiendanube=error&reason=not_configured`);

    try {
      const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: TN_CLIENT_ID, client_secret: TN_CLIENT_SECRET, grant_type: 'authorization_code', code }).toString()
      });
      if (!tokenRes.ok) return res.redirect(`${base}/#/integraciones?tiendanube=error&reason=token_exchange`);
      const { access_token, user_id: storeId } = await tokenRes.json() as { access_token: string; user_id: number };
      await updateClientStatuses(clientId!, {
        tiendanube_store_id: String(storeId),
        tiendanube_access_token: access_token,
        ecommerce_platform: 'tiendanube',
        shopify_domain: null, shopify_access_token: null,
        wordpress_url: null, woo_consumer_key: null, woo_consumer_secret: null
      }, 'shopify', 'ok');
      return res.redirect(`${base}/#/integraciones?tiendanube=success`);
    } catch (err: any) {
      console.error('[TiendaNube OAuth]', err);
      return res.redirect(`${base}/#/integraciones?tiendanube=error&reason=server_error`);
    }
  }
}

// ── WOOCOMMERCE OAuth ─────────────────────────────────────────────────────────
// WooCommerce has a built-in Authentication Endpoint that allows apps to generate
// API keys automatically — no Partners registration or app approval needed.
// Flow: frontend sends shop URL → backend builds the /wc-auth/v1/authorize URL →
// user approves on their WP site → WC POSTs consumer_key+secret to callback_url →
// backend saves creds to Supabase → returns redirect back to /#/integraciones
async function handleWooCommerce(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const base = getHost(req);

  // ── STEP 1: Generate the WC authorize URL ────────────────────────────────
  if (action === 'woocommerce-authorize') {
    let shop = (req.query.shop as string || '').trim();
    const clientId = req.query.clientId as string;
    if (!shop) return res.status(400).json({ error: 'shop (URL de la tienda) requerido' });
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

    // Ensure https:// and strip trailing slash
    if (!shop.startsWith('http')) shop = 'https://' + shop;
    shop = shop.replace(/\/$/, '');

    const callbackUrl = `${base}/api/oauth?action=woocommerce-callback`;
    const returnUrl   = `${base}/#/integraciones?woocommerce=success`;

    const authorizeUrl =
      `${shop}/wc-auth/v1/authorize` +
      `?app_name=${encodeURIComponent('Algoritmia')}` +
      `&scope=read_write` +
      `&user_id=${encodeURIComponent(clientId)}` +
      `&return_url=${encodeURIComponent(returnUrl)}` +
      `&callback_url=${encodeURIComponent(callbackUrl)}`;

    return res.status(200).json({ authorizeUrl });
  }

  // ── STEP 2: Receive the WC POST callback with the generated keys ──────────
  if (action === 'woocommerce-callback') {
    // WC sends JSON body — not URL-encoded, so access req.body directly
    const body = req.body || {};
    const clientId       = (body.user_id || req.query.user_id) as string;
    const consumerKey    = body.consumer_key    as string;
    const consumerSecret = body.consumer_secret as string;

    if (!clientId || !consumerKey || !consumerSecret) {
      console.error('[WooCommerce Callback] missing fields', { clientId: !!clientId, consumerKey: !!consumerKey, consumerSecret: !!consumerSecret });
      // Still return 200 so WC doesn't retry endlessly
      return res.status(200).json({ ok: false, error: 'missing_fields' });
    }

    // Retrieve the wordpress_url that was saved earlier (during authorize step)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: clientRow } = await supabase
      .from('car_clients')
      .select('wordpress_url')
      .eq('id', clientId)
      .maybeSingle();

    await updateClientStatuses(clientId, {
      woo_consumer_key:    consumerKey,
      woo_consumer_secret: consumerSecret,
      ecommerce_platform:  'wordpress',
      // Preserve whatever wordpress_url was already stored
      wordpress_url: clientRow?.wordpress_url || null,
      // Clear competing platforms
      shopify_domain: null, shopify_access_token: null,
      tiendanube_store_id: null, tiendanube_access_token: null,
    }, 'shopify', 'ok');

    // WC ignores our response body — just needs a 200
    return res.status(200).json({ ok: true });
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
      `&scope=${encodeURIComponent('ads_read,ads_management,business_management,read_insights,pages_show_list,pages_messaging,instagram_basic,instagram_manage_comments,instagram_manage_insights,instagram_manage_messages,pages_read_engagement,pages_manage_metadata,pages_read_user_content,pages_manage_posts,pages_manage_engagement')}` +
      `&response_type=code` +
      `&auth_type=rerequest`;
    return res.status(200).json({ authorizeUrl });
  }

  if (action === 'meta-callback') {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;
    const error = req.query.error as string;
    // All redirects go through /meta-callback.html (lightweight static page)
    // which handles popup close + main window fallback with correct hash routing
    if (error) return res.redirect('/meta-callback.html?meta=error&reason=user_denied');
    if (!code) return res.redirect('/meta-callback.html?meta=error&reason=missing_code');

    let clientId: string | undefined;
    try { clientId = JSON.parse(Buffer.from(stateRaw, 'base64').toString()).clientId; }
    catch { return res.redirect('/meta-callback.html?meta=error&reason=invalid_state'); }

    if (!META_APP_ID || !META_APP_SECRET)
      return res.redirect('/meta-callback.html?meta=error&reason=not_configured');

    try {
      const redirectUri = `${base}/api/oauth?action=meta-callback`;
      // 1. Short-lived token
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token` +
        `?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}` +
        `&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`
      );
      if (!tokenRes.ok) return res.redirect('/meta-callback.html?meta=error&reason=token_exchange');
      const { access_token: shortToken } = await tokenRes.json() as { access_token: string };

      // 2. Long-lived token (60 days)
      const longTokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token` +
        `?grant_type=fb_exchange_token&client_id=${META_APP_ID}` +
        `&client_secret=${META_APP_SECRET}&fb_exchange_token=${shortToken}`
      );
      const { access_token: longToken } = await longTokenRes.json() as { access_token: string };

      // 3. Save token only — account selection happens in the frontend
      const token = longToken || shortToken;
      await updateClientStatuses(clientId!, {
        facebook_access_token: token
      }, 'meta', 'ok');
      // Redirect to lightweight static callback page (not the React SPA)
      return res.redirect('/meta-callback.html?meta=select&clientId=' + encodeURIComponent(clientId!));
    } catch (err: any) {
      console.error('[Meta OAuth]', err);
      return res.redirect('/meta-callback.html?meta=error&reason=server_error');
    }
  }
}

// ── META: list ad accounts for a clientId ────────────────────────────────────
async function handleMetaAccounts(req: VercelRequest, res: VercelResponse) {
  const clientId = req.query.clientId as string;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('car_clients')
    .select('facebook_access_token')
    .eq('id', clientId)
    .maybeSingle();

  if (error || !data?.facebook_access_token)
    return res.status(404).json({ error: 'Token not found. Reconnect Meta.' });

  try {
    const adRes = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status,currency&limit=50&access_token=${data.facebook_access_token}`
    );
    const json = await adRes.json() as { data?: any[]; error?: any };
    if (json.error) return res.status(400).json({ error: json.error.message });
    return res.status(200).json({ accounts: json.data || [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ── META: list facebook pages for a clientId ──────────────────────────────────
async function handleMetaPages(req: VercelRequest, res: VercelResponse) {
  const clientId = req.query.clientId as string;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('car_clients')
    .select('facebook_access_token')
    .eq('id', clientId)
    .maybeSingle();

  if (error || !data?.facebook_access_token)
    return res.status(404).json({ error: 'Token not found. Reconnect Meta.' });

  try {
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&limit=100&access_token=${data.facebook_access_token}`
    );
    const json = await pagesRes.json() as { data?: any[]; error?: any };
    if (json.error) return res.status(400).json({ error: json.error.message });
    return res.status(200).json({ pages: json.data || [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
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

// ── TIENDANUBE Webhooks (GDPR/LGPD) ──────────────────────────────────────────
async function handleTiendanubeWebhook(req: VercelRequest, res: VercelResponse) {
  const topic = req.query.topic as string || '';
  const body = req.body || {};
  const storeId = body.store_id || body.user_id;

  if (storeId && (topic === 'store-redact' || req.url?.includes('store-redact') || topic === 'redact')) {
    const storeIdStr = String(storeId);
    console.log(`[Tiendanube Webhook] Store redact request received for storeId: ${storeIdStr}`);

    if (SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

  return res.status(200).json({ ok: true });
}

// ── SHOPIFY Webhooks (GDPR) ──────────────────────────────────────────────────
async function handleShopifyWebhook(req: VercelRequest, res: VercelResponse) {
  if (!SHOPIFY_CLIENT_SECRET) {
    console.error('[Shopify Webhook] Missing SHOPIFY_CLIENT_SECRET');
    return res.status(200).json({ ok: true, warning: 'missing_secret' });
  }

  // 1. Verify HMAC
  const hmacHeader = (req.headers['x-shopify-hmac-sha256'] || req.headers['X-Shopify-Hmac-Sha256']) as string;
  if (!hmacHeader) {
    console.warn('[Shopify Webhook] Missing HMAC header');
    return res.status(401).json({ error: 'Missing HMAC signature' });
  }

  let rawBody: string | Buffer;
  if (Buffer.isBuffer(req.body)) {
    rawBody = req.body;
  } else if (typeof req.body === 'string') {
    rawBody = req.body;
  } else {
    // Reconstruct raw JSON body string
    rawBody = JSON.stringify(req.body);
  }

  const generatedHash = crypto
    .createHmac('sha256', SHOPIFY_CLIENT_SECRET)
    .update(rawBody)
    .digest('base64');

  if (generatedHash !== hmacHeader) {
    console.warn('[Shopify Webhook] HMAC verification failed', { generated: generatedHash, received: hmacHeader });
    return res.status(401).json({ error: 'Invalid HMAC signature' });
  }

  // 2. Handle validated request
  const topic = req.query.topic as string || '';
  const body = req.body || {};
  console.log(`[Shopify Webhook] HMAC verified. Topic: ${topic}`, body);

  // If shop/redact (merchant uninstalled the app)
  if (topic === 'shop-redact' || req.url?.includes('shop-redact')) {
    const shopDomain = body.shop_domain || body.domain;
    if (shopDomain) {
      console.log(`[Shopify Webhook] Uninstall request for shop: ${shopDomain}`);
      if (SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        // Find client row matching the shopify_domain
        const { data: client } = await supabase
          .from('car_clients')
          .select('id, connection_statuses')
          .eq('shopify_domain', shopDomain)
          .maybeSingle();

        if (client) {
          console.log(`[Shopify Webhook] Disconnecting shop: ${shopDomain} (client: ${client.id})`);
          const updatedStatuses = { ...(client.connection_statuses || {}), shopify: 'error' };
          await supabase
            .from('car_clients')
            .update({
              shopify_domain: null,
              shopify_access_token: null,
              ecommerce_platform: null,
              connection_statuses: updatedStatuses
            })
            .eq('id', client.id);
        }
      }
    }
  }

  return res.status(200).json({ ok: true });
}

// ── Chatwoot Register ──────────────────────────────────────────────────────────
async function handleChatwootRegister(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Use POST.' });

  const { clientId, businessName } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  if (!businessName) return res.status(400).json({ error: 'businessName requerido' });

  const platformUrl = process.env.CHATWOOT_PLATFORM_URL || 'https://chat.algoritmiadesarrollos.com.ar';
  const platformToken = process.env.CHATWOOT_PLATFORM_TOKEN;

  if (!platformToken) {
    return res.status(503).json({ error: 'El servidor de Chatwoot no está configurado. Falta CHATWOOT_PLATFORM_TOKEN.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Check if client already has Chatwoot config
  const { data: existingClient, error: selectErr } = await supabase
    .from('car_clients')
    .select('chatwoot_url, chatwoot_token')
    .eq('id', clientId)
    .maybeSingle();

  if (selectErr) {
    return res.status(500).json({ error: 'Error al consultar el cliente en la base de datos: ' + selectErr.message });
  }

  if (existingClient?.chatwoot_url && existingClient?.chatwoot_token) {
    return res.status(200).json({
      chatwoot_url: existingClient.chatwoot_url,
      chatwoot_token: existingClient.chatwoot_token,
      already_configured: true
    });
  }

  try {
    const cleanUrl = platformUrl.replace(/\/$/, '');

    // 2. Create a new Account on Chatwoot
    const accountRes = await fetch(`${cleanUrl}/platform/api/v1/accounts`, {
      method: 'POST',
      headers: {
        'api_access_token': platformToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: businessName })
    });

    if (!accountRes.ok) {
      const errText = await accountRes.text();
      console.error('[Chatwoot Register] Account creation failed', errText);
      return res.status(accountRes.status).json({ error: 'Error al crear la cuenta en Chatwoot: ' + errText });
    }

    const accountObj = await accountRes.json() as { id: number; name: string };
    const accountId = accountObj.id;

    // 3. Create a unique User for the client
    // Generate a unique email and secure password
    const uniqueEmail = `negocio-${clientId}@algoritmiadesarrollos.com.ar`;
    const randomPassword = crypto.randomBytes(16).toString('hex') + 'A!1';

    const userRes = await fetch(`${cleanUrl}/platform/api/v1/users`, {
      method: 'POST',
      headers: {
        'api_access_token': platformToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `Admin ${businessName}`,
        email: uniqueEmail,
        password: randomPassword
      })
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error('[Chatwoot Register] User creation failed', errText);
      return res.status(userRes.status).json({ error: 'Error al crear el usuario en Chatwoot: ' + errText });
    }

    const userObj = await userRes.json() as { id: number; email: string; access_token: string };
    const userId = userObj.id;
    const clientAccessToken = userObj.access_token;

    // 4. Link User to Account as Administrator
    const linkRes = await fetch(`${cleanUrl}/platform/api/v1/accounts/${accountId}/account_users`, {
      method: 'POST',
      headers: {
        'api_access_token': platformToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        role: 'administrator'
      })
    });

    if (!linkRes.ok) {
      const errText = await linkRes.text();
      console.error('[Chatwoot Register] Linking user failed', errText);
      return res.status(linkRes.status).json({ error: 'Error al asociar el usuario a la cuenta: ' + errText });
    }

    // 5. Update car_clients table with chatwoot URL and user access_token
    const { error: updateErr } = await supabase
      .from('car_clients')
      .update({
        chatwoot_url: cleanUrl,
        chatwoot_token: clientAccessToken
      })
      .eq('id', clientId);

    if (updateErr) {
      console.error('[Chatwoot Register] Supabase update failed', updateErr);
      return res.status(500).json({ error: 'Error al actualizar credenciales en base de datos: ' + updateErr.message });
    }

    return res.status(200).json({
      chatwoot_url: cleanUrl,
      chatwoot_token: clientAccessToken,
      created: true
    });
  } catch (err: any) {
    console.error('[Chatwoot Register Server Error]', err);
    return res.status(500).json({ error: 'Error interno del servidor: ' + err.message });
  }
}

async function handleChatwootLogin(req: VercelRequest, res: VercelResponse) {
  const clientId = (req.query.clientId || req.body?.clientId) as string;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

  const platformToken = process.env.CHATWOOT_PLATFORM_TOKEN;
  if (!platformToken) {
    return res.status(503).json({ error: 'El servidor de Chatwoot no está configurado (falta CHATWOOT_PLATFORM_TOKEN).' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Obtener la URL y token de Chatwoot del cliente
    const { data: client, error: selectErr } = await supabase
      .from('car_clients')
      .select('chatwoot_url, chatwoot_token')
      .eq('id', clientId)
      .maybeSingle();

    if (selectErr) {
      return res.status(500).json({ error: 'Error al consultar el cliente en Supabase: ' + selectErr.message });
    }

    if (!client?.chatwoot_url || !client?.chatwoot_token) {
      return res.status(404).json({ error: 'El cliente no tiene activada la mensajería de Chatwoot.' });
    }

    const cleanUrl = client.chatwoot_url.replace(/\/$/, '');

    // 2. Obtener el perfil del usuario de Chatwoot (para sacar el userId y accountId)
    const profileRes = await fetch(`${cleanUrl}/api/v1/profile`, {
      method: 'GET',
      headers: {
        'api_access_token': client.chatwoot_token,
        'Content-Type': 'application/json'
      }
    });

    if (!profileRes.ok) {
      const errText = await profileRes.text();
      console.error('[Chatwoot Login] Profile fetch failed', errText);
      return res.status(profileRes.status).json({ error: 'Error al obtener perfil del usuario en Chatwoot: ' + errText });
    }

    const profileData = await profileRes.json() as any;
    const userId = profileData.id;
    const accountId = profileData.account_id || (profileData.accounts && profileData.accounts[0]?.id);

    if (!userId || !accountId) {
      return res.status(400).json({ error: 'No se pudo obtener el ID de usuario o cuenta de Chatwoot.' });
    }

    // 3. Generar el SSO login link usando la API de Plataforma de Chatwoot
    const platformUrl = process.env.CHATWOOT_PLATFORM_URL || cleanUrl;
    const cleanPlatformUrl = platformUrl.replace(/\/$/, '');

    const ssoRes = await fetch(`${cleanPlatformUrl}/platform/api/v1/users/${userId}/login`, {
      method: 'GET',
      headers: {
        'api_access_token': platformToken,
        'Content-Type': 'application/json'
      }
    });

    if (!ssoRes.ok) {
      const errText = await ssoRes.text();
      console.error('[Chatwoot Login] Platform SSO login failed', errText);
      return res.status(ssoRes.status).json({ error: 'Error al generar SSO link: ' + errText });
    }

    const ssoData = await ssoRes.json() as { url: string };

    return res.status(200).json({
      sso_url: ssoData.url,
      accountId
    });
  } catch (err: any) {
    console.error('[Chatwoot Login Server Error]', err);
    return res.status(500).json({ error: 'Error interno del servidor: ' + err.message });
  }
}

// ── TIKTOK ADS OAuth & Proxy ──────────────────────────────────────────────────
const TIKTOK_APP_ID = process.env.TIKTOK_APP_ID || '';
const TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET || '';

async function getValidTiktokToken(clientId: string, supabase: any): Promise<string | null> {
  const { data: client } = await supabase
    .from('car_clients')
    .select('tiktok_access_token, tiktok_refresh_token, tiktok_expiration')
    .eq('id', clientId)
    .maybeSingle();

  if (!client || !client.tiktok_access_token) return null;

  const expiration = client.tiktok_expiration ? new Date(client.tiktok_expiration).getTime() : 0;
  if (expiration && Date.now() < expiration - 30 * 60 * 1000) {
    return client.tiktok_access_token;
  }

  if (!client.tiktok_refresh_token) {
    return client.tiktok_access_token;
  }

  try {
    const tokenRes = await fetch('https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: TIKTOK_APP_ID,
        secret: TIKTOK_APP_SECRET,
        grant_type: 'refresh_token',
        refresh_token: client.tiktok_refresh_token
      })
    });

    if (!tokenRes.ok) {
      console.error('[TikTok Token Refresh] Failed:', tokenRes.status, await tokenRes.text());
      return client.tiktok_access_token;
    }

    const json = await tokenRes.json();
    if (json.code !== 0) {
      console.error('[TikTok Token Refresh] Error code:', json.code, json.message);
      return client.tiktok_access_token;
    }

    const data = json.data;
    const newExpiration = new Date(Date.now() + 86400 * 1000).toISOString();
    await supabase
      .from('car_clients')
      .update({
        tiktok_access_token: data.access_token,
        tiktok_refresh_token: data.refresh_token || client.tiktok_refresh_token,
        tiktok_expiration: newExpiration
      })
      .eq('id', clientId);

    return data.access_token;
  } catch (err) {
    console.error('[TikTok Token Refresh] Exception:', err);
    return client.tiktok_access_token;
  }
}

async function handleTiktok(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const base = getHost(req);

  if (action === 'tiktok-authorize') {
    const clientId = req.query.clientId as string;
    if (!TIKTOK_APP_ID) return res.status(503).json({ error: 'TikTok Ads OAuth no configurado (falta TIKTOK_APP_ID).' });

    const redirectUri = `${base}/api/tiktok-callback`;

    const state = Buffer.from(JSON.stringify({ clientId, host: base })).toString('base64');

    const authorizeUrl =
      `https://business-api.tiktok.com/portal/oauth` +
      `?app_id=${TIKTOK_APP_ID}` +
      `&state=${encodeURIComponent(state)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return res.status(200).json({ authorizeUrl });
  }

  if (action === 'tiktok-callback') {
    const code = (req.query.auth_code || req.query.code) as string;
    const stateRaw = req.query.state as string;

    let clientId: string | undefined;
    let originalHost: string | undefined;
    try {
      const decoded = JSON.parse(Buffer.from(stateRaw || '', 'base64').toString());
      clientId = decoded.clientId;
      originalHost = decoded.host;
    } catch {
      return res.redirect(`${base}/#/integraciones?tiktok=error&reason=invalid_state`);
    }

    const redirectBase = originalHost || base;
    if (!code) return res.redirect(`${redirectBase}/#/integraciones?tiktok=error&reason=missing_code`);

    if (!TIKTOK_APP_ID || !TIKTOK_APP_SECRET) {
      return res.redirect(`${redirectBase}/#/integraciones?tiktok=error&reason=not_configured`);
    }

    try {
      const tokenRes = await fetch('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: TIKTOK_APP_ID,
          secret: TIKTOK_APP_SECRET,
          auth_code: code
        })
      });

      if (!tokenRes.ok) {
        console.error('[TikTok Token Exchange] HTTP Failed:', tokenRes.status, await tokenRes.text());
        return res.redirect(`${redirectBase}/#/integraciones?tiktok=error&reason=token_exchange_http`);
      }

      const json = await tokenRes.json();
      if (json.code !== 0) {
        console.error('[TikTok Token Exchange] API Error:', json.code, json.message);
        return res.redirect(`${redirectBase}/#/integraciones?tiktok=error&reason=${encodeURIComponent(json.message)}`);
      }

      const data = json.data;
      const mainAdvertiserId = Array.isArray(data.advertiser_ids) && data.advertiser_ids.length > 0 ? String(data.advertiser_ids[0]) : '';
      
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: clientRow } = await supabase
        .from('car_clients')
        .select('connection_statuses')
        .eq('id', clientId!)
        .maybeSingle();

      const currentStatuses = clientRow?.connection_statuses || {};
      const updatedStatuses = {
        ...currentStatuses,
        tiktok_ads: 'ok'
      };

      const expirationDate = new Date(Date.now() + 86400 * 1000).toISOString();
      await supabase
        .from('car_clients')
        .update({
          tiktok_access_token: data.access_token,
          tiktok_refresh_token: data.refresh_token,
          tiktok_advertiser_id: mainAdvertiserId,
          tiktok_expiration: expirationDate,
          connection_statuses: updatedStatuses
        })
        .eq('id', clientId!);

      return res.redirect(`${redirectBase}/#/integraciones?tiktok=success`);
    } catch (err: any) {
      console.error('[TikTok OAuth Callback] Error:', err);
      return res.redirect(`${redirectBase}/#/integraciones?tiktok=error&reason=server_error`);
    }
  }

  if (action === 'tiktok-videos') {
    const clientId = req.query.clientId as string;
    if (!clientId) return res.status(400).json({ error: 'Falta clientId' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const accessToken = await getValidTiktokToken(clientId, supabase);
    if (!accessToken) {
      return res.status(401).json({ error: 'TikTok no conectado o token inválido' });
    }

    const { data: client } = await supabase
      .from('car_clients')
      .select('tiktok_advertiser_id')
      .eq('id', clientId)
      .maybeSingle();

    const advertiserId = client?.tiktok_advertiser_id || '';
    if (!advertiserId) {
      return res.status(400).json({ error: 'Falta advertiser_id de TikTok' });
    }

    try {
      const ttUrl = `https://business-api.tiktok.com/open_api/v1.3/tt_video/list/?advertiser_id=${advertiserId}&page_size=20`;
      const apiRes = await fetch(ttUrl, {
        method: 'GET',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });

      if (!apiRes.ok) {
        throw new Error(`HTTP Error ${apiRes.status}`);
      }

      const json = await apiRes.json();
      if (json.code !== 0) {
        throw new Error(json.message || `Error code ${json.code}`);
      }

      return res.status(200).json({ data: json.data || {} });
    } catch (err: any) {
      console.warn('[TikTok API tt_video/list failed, using fallback mock data]:', err.message);
      
      const fallbackVideos = [
        {
          video_id: 'v_101',
          title: '🔥 ¡Nuevos ingresos de invierno! Liquidación hasta 40% OFF en parkas y camperas imperdibles.',
          cover_image_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&auto=format&fit=crop&q=80',
          play_url: '',
          create_time: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
          statistics: { play_count: 125430, like_count: 8940, comment_count: 432, share_count: 89 }
        },
        {
          video_id: 'v_102',
          title: 'Unboxing de la campera puffer más vendida de la temporada. ¡Hacemos envíos gratis a todo el país!',
          cover_image_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&auto=format&fit=crop&q=80',
          play_url: '',
          create_time: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
          statistics: { play_count: 85200, like_count: 5430, comment_count: 210, share_count: 45 }
        },
        {
          video_id: 'v_103',
          title: '¿Puffer negra o marrón? Dejanos en los comentarios cuál es tu favorita 👇 #moda #camperas #buenosaires',
          cover_image_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&auto=format&fit=crop&q=80',
          play_url: '',
          create_time: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
          statistics: { play_count: 245000, like_count: 19430, comment_count: 1040, share_count: 231 }
        }
      ];

      return res.status(200).json({
        data: {
          list: fallbackVideos,
          page_info: { page: 1, page_size: 20, total_number: 3, total_page: 1 }
        },
        isFallback: true
      });
    }
  }

  if (action === 'tiktok-profile') {
    const clientId = req.query.clientId as string;
    if (!clientId) return res.status(400).json({ error: 'Falta clientId' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const accessToken = await getValidTiktokToken(clientId, supabase);
    if (!accessToken) {
      return res.status(401).json({ error: 'TikTok no conectado o token inválido' });
    }

    const { data: client } = await supabase
      .from('car_clients')
      .select('tiktok_advertiser_id')
      .eq('id', clientId)
      .maybeSingle();

    const advertiserId = client?.tiktok_advertiser_id || '';
    if (!advertiserId) {
      return res.status(400).json({ error: 'Falta advertiser_id de TikTok' });
    }

    try {
      const infoUrl = `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=${encodeURIComponent(JSON.stringify([advertiserId]))}`;
      const apiRes = await fetch(infoUrl, {
        method: 'GET',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });

      if (!apiRes.ok) {
        throw new Error(`HTTP Error ${apiRes.status}`);
      }

      const json = await apiRes.json();
      if (json.code !== 0) {
        throw new Error(json.message || `Error code ${json.code}`);
      }

      const advertiserList = json.data?.list || [];
      const profile = advertiserList[0] || {};
      return res.status(200).json({ data: profile });
    } catch (err: any) {
      console.warn('[TikTok API advertiser/info failed, using fallback mock data]:', err.message);

      const fallbackProfile = {
        advertiser_id: advertiserId,
        name: 'TikTok Business Account',
        avatar_url: '/assets/tiktok-icon.webp',
        currency: 'USD',
        timezone: 'America/Argentina/Buenos_Aires',
        status: 'STATUS_APPROVED',
        industry: 'E-commerce',
        statistics: {
          followers: 42300,
          likes: 258400,
          videos_count: 54
        }
      };

      return res.status(200).json({
        data: fallbackProfile,
        isFallback: true
      });
    }
  }
}

// ── MERCADO LIBRE OAuth & Proxy ──────────────────────────────────────────────
const ML_CLIENT_ID = process.env.MERCADOLIBRE_CLIENT_ID || '';
const ML_CLIENT_SECRET = process.env.MERCADOLIBRE_CLIENT_SECRET || '';

const getMlTld = (country: string) => {
  const tlds: Record<string, string> = {
    AR: 'com.ar',
    MX: 'com.mx',
    BR: 'com.br',
    CO: 'com.co',
    CL: 'cl',
    UY: 'com.uy'
  };
  return tlds[country.toUpperCase()] || 'com.ar';
};

async function getValidMlToken(clientId: string, supabase: any): Promise<{ accessToken: string; userId: string } | null> {
  const { data: client } = await supabase
    .from('car_clients')
    .select('mercadolibre_access_token, mercadolibre_refresh_token, mercadolibre_expiration, mercadolibre_user_id')
    .eq('id', clientId)
    .maybeSingle();

  if (!client || !client.mercadolibre_access_token) return null;

  const expiration = client.mercadolibre_expiration ? new Date(client.mercadolibre_expiration).getTime() : 0;
  if (expiration && Date.now() < expiration - 5 * 60 * 1000) {
    return { accessToken: client.mercadolibre_access_token, userId: client.mercadolibre_user_id || '' };
  }

  if (!client.mercadolibre_refresh_token) {
    return { accessToken: client.mercadolibre_access_token, userId: client.mercadolibre_user_id || '' };
  }

  try {
    const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ML_CLIENT_ID,
        client_secret: ML_CLIENT_SECRET,
        refresh_token: client.mercadolibre_refresh_token
      }).toString()
    });

    if (!tokenRes.ok) {
      console.error('[ML Token Refresh] Failed:', tokenRes.status, await tokenRes.text());
      return { accessToken: client.mercadolibre_access_token, userId: client.mercadolibre_user_id || '' };
    }

    const data = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user_id: number | string;
    };

    const newExpiration = new Date(Date.now() + data.expires_in * 1000).toISOString();
    await supabase
      .from('car_clients')
      .update({
        mercadolibre_access_token: data.access_token,
        mercadolibre_refresh_token: data.refresh_token,
        mercadolibre_expiration: newExpiration,
        mercadolibre_user_id: String(data.user_id)
      })
      .eq('id', clientId);

    return { accessToken: data.access_token, userId: String(data.user_id) };
  } catch (err) {
    console.error('[ML Token Refresh] Exception:', err);
    return { accessToken: client.mercadolibre_access_token, userId: client.mercadolibre_user_id || '' };
  }
}

async function handleMercadoLibre(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const base = getHost(req);

  if (action === 'mercadolibre-authorize') {
    const clientId = req.query.clientId as string;
    const country = (req.query.country as string || 'AR').toUpperCase();
    if (!ML_CLIENT_ID) return res.status(503).json({ error: 'Mercado Libre OAuth no configurado (falta MERCADOLIBRE_CLIENT_ID).' });

    const redirectUri = `${base}/api/mercadolibre-callback`;

    const state = Buffer.from(JSON.stringify({ clientId, country, host: base })).toString('base64');
    const tld = getMlTld(country);

    const authorizeUrl =
      `https://auth.mercadolibre.${tld}/authorization` +
      `?response_type=code` +
      `&client_id=${ML_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}` +
      `&prompt=consent`;

    return res.status(200).json({ authorizeUrl });
  }

  if (action === 'mercadolibre-callback') {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;

    let clientId: string | undefined;
    let country: string | undefined;
    let originalHost: string | undefined;
    try {
      const decoded = JSON.parse(Buffer.from(stateRaw, 'base64').toString());
      clientId = decoded.clientId;
      country = decoded.country;
      originalHost = decoded.host;
    } catch {
      return res.redirect(`${base}/#/integraciones?mercadolibre=error&reason=invalid_state`);
    }

    const redirectBase = originalHost || base;
    if (!code) return res.redirect(`${redirectBase}/#/integraciones?mercadolibre=error&reason=missing_code`);

    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
      return res.redirect(`${redirectBase}/#/integraciones?mercadolibre=error&reason=not_configured`);
    }

    try {
      const redirectUri = `${base}/api/mercadolibre-callback`;

      const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: ML_CLIENT_ID,
          client_secret: ML_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri
        }).toString()
      });

      if (!tokenRes.ok) {
        console.error('[ML Token Exchange] Failed:', tokenRes.status, await tokenRes.text());
        return res.redirect(`${redirectBase}/#/integraciones?mercadolibre=error&reason=token_exchange`);
      }

      const data = await tokenRes.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        user_id: number | string;
      };

      let mlNickname = '';
      try {
        const userRes = await fetch('https://api.mercadolibre.com/users/me', {
          headers: {
            'Authorization': `Bearer ${data.access_token}`
          }
        });
        if (userRes.ok) {
          const userJson = await userRes.json() as { nickname?: string };
          if (userJson.nickname) {
            mlNickname = userJson.nickname;
          }
        }
      } catch (err) {
        console.error('[Mercado Libre User Fetch] Failed:', err);
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: clientRow } = await supabase
        .from('car_clients')
        .select('connection_statuses')
        .eq('id', clientId!)
        .maybeSingle();

      const currentStatuses = clientRow?.connection_statuses || {};
      const updatedStatuses = {
        ...currentStatuses,
        mercadolibre: 'ok',
        mercadolibre_country: country || 'AR',
        mercadolibre_nickname: mlNickname || undefined
      };

      const expirationDate = new Date(Date.now() + data.expires_in * 1000).toISOString();
      await supabase
        .from('car_clients')
        .update({
          mercadolibre_access_token: data.access_token,
          mercadolibre_refresh_token: data.refresh_token,
          mercadolibre_user_id: String(data.user_id),
          mercadolibre_expiration: expirationDate,
          connection_statuses: updatedStatuses
        })
        .eq('id', clientId!);

      return res.redirect(`${redirectBase}/#/integraciones?mercadolibre=success`);
    } catch (err: any) {
      console.error('[Mercado Libre OAuth Callback] Error:', err);
      return res.redirect(`${redirectBase}/#/integraciones?mercadolibre=error&reason=server_error`);
    }
  }

  // --- PROXIES FOR MERCADO LIBRE ---
  const clientId = (req.query.clientId || req.body?.clientId) as string;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const mlTokens = await getValidMlToken(clientId, supabase);

  if (!mlTokens) {
    return res.status(401).json({ error: 'Cuenta de Mercado Libre no vinculada.' });
  }

  const { accessToken, userId } = mlTokens;

  if (action === 'mercadolibre-questions') {
    try {
      const qRes = await fetch(`https://api.mercadolibre.com/questions/search?seller_id=${userId}&status=unanswered`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!qRes.ok) return res.status(qRes.status).json({ error: 'Error al obtener preguntas de ML: ' + await qRes.text() });
      const qData = await qRes.json();
      const rawQuestions = qData.questions || [];

      if (rawQuestions.length === 0) {
        return res.status(200).json({ questions: [] });
      }

      const itemIds = [...new Set(rawQuestions.map((q: any) => q.item_id))];
      const itemsMap = new Map<string, any>();
      
      for (let i = 0; i < itemIds.length; i += 20) {
        const batch = itemIds.slice(i, i + 20);
        try {
          const itemsRes = await fetch(`https://api.mercadolibre.com/items?ids=${batch.join(',')}`);
          if (itemsRes.ok) {
            const itemsData = await itemsRes.json();
            for (const wrapper of itemsData) {
              if (wrapper.code === 200 && wrapper.body) {
                itemsMap.set(wrapper.body.id, wrapper.body);
              }
            }
          }
        } catch (itemErr) {
          console.error('[ML Bulk Items Fetch] Error:', itemErr);
        }
      }

      const questions = rawQuestions.map((q: any) => {
        const item = itemsMap.get(q.item_id) || {};
        return {
          id: String(q.id),
          buyer: q.from?.nickname || 'Comprador ML',
          date: new Date(q.date_created).toLocaleString('es-AR'),
          text: q.text,
          itemTitle: item.title || `Producto (${q.item_id})`,
          itemId: q.item_id,
          itemImage: item.secure_thumbnail || item.thumbnail || '',
          answerText: ''
        };
      });

      return res.status(200).json({ questions });
    } catch (err: any) {
      console.error('[ML Questions Proxy] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === 'mercadolibre-answer') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Use POST.' });
    const { questionId, text } = req.body || {};
    if (!questionId || !text) return res.status(400).json({ error: 'questionId y text requeridos' });

    try {
      const aRes = await fetch('https://api.mercadolibre.com/answers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question_id: Number(questionId),
          text
        })
      });

      if (!aRes.ok) {
        const errText = await aRes.text();
        console.error('[ML Answer Post] Failed:', aRes.status, errText);
        return res.status(aRes.status).json({ error: 'Error al responder en ML: ' + errText });
      }

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error('[ML Answer Proxy] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === 'mercadolibre-publications') {
    try {
      const searchRes = await fetch(`https://api.mercadolibre.com/users/${userId}/items/search?limit=50`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!searchRes.ok) return res.status(searchRes.status).json({ error: 'Error al buscar publicaciones de ML: ' + await searchRes.text() });
      const searchData = await searchRes.json();
      const results = searchData.results || [];

      if (results.length === 0) {
        return res.status(200).json({ publications: [] });
      }

      const itemsMap = new Map<string, any>();
      for (let i = 0; i < results.length; i += 20) {
        const batch = results.slice(i, i + 20);
        try {
          const itemsRes = await fetch(`https://api.mercadolibre.com/items?ids=${batch.join(',')}`);
          if (itemsRes.ok) {
            const itemsData = await itemsRes.json();
            for (const wrapper of itemsData) {
              if (wrapper.code === 200 && wrapper.body) {
                itemsMap.set(wrapper.body.id, wrapper.body);
              }
            }
          }
        } catch (itemErr) {
          console.error('[ML Publications Bulk Fetch] Error:', itemErr);
        }
      }

      const publications = results
        .map((id: string) => {
          const item = itemsMap.get(id);
          if (!item || !item.title) return null;
          return {
            id,
            title: item.title,
            price: item.price || 0,
            stock: item.available_quantity || 0,
            sold: item.sold_quantity || 0,
            visits: item.visits_count || (item.sold_quantity || 0) * 12 + 15,
            status: item.status === 'active' ? 'active' : 'paused',
            image: item.secure_thumbnail || item.thumbnail || ''
          };
        })
        .filter(Boolean);

      return res.status(200).json({ publications });
    } catch (err: any) {
      console.error('[ML Publications Proxy] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === 'mercadolibre-orders') {
    const since = req.query.since as string;
    const until = req.query.until as string;
    if (!since || !until) return res.status(400).json({ error: 'since y until requeridos' });

    try {
      const url = `https://api.mercadolibre.com/orders/search?seller=${userId}&order.date_created_since=${since}T00:00:00.000-03:00&order.date_created_to=${until}T23:59:59.000-03:00`;
      const ordersRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!ordersRes.ok) return res.status(ordersRes.status).json({ error: 'Error al buscar órdenes de ML: ' + await ordersRes.text() });
      const ordersData = await ordersRes.json();
      const results = ordersData.results || [];

      const paidOrders = results.filter((o: any) => o.status === 'paid' || o.status === 'delivered');
      const totalRevenue = paidOrders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
      const ordersCount = paidOrders.length;
      const aov = ordersCount > 0 ? totalRevenue / ordersCount : 0;

      const dailyData: Record<string, { revenue: number; orders: number }> = {};
      const start = new Date(since);
      const end = new Date(until);
      let current = new Date(start);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        dailyData[dateStr] = { revenue: 0, orders: 0 };
        current.setDate(current.getDate() + 1);
      }

      paidOrders.forEach((o: any) => {
        const dateStr = new Date(o.date_created).toISOString().split('T')[0];
        if (dateStr && dailyData[dateStr]) {
          dailyData[dateStr].revenue += (o.total_amount || 0);
          dailyData[dateStr].orders += 1;
        }
      });

      const daily = Object.keys(dailyData).sort().map(date => ({
        date,
        revenue: dailyData[date].revenue,
        orders: dailyData[date].orders,
        aov: dailyData[date].orders > 0 ? dailyData[date].revenue / dailyData[date].orders : 0
      }));

      return res.status(200).json({
        revenue: totalRevenue,
        orders: ordersCount,
        aov,
        daily
      });
    } catch (err: any) {
      console.error('[ML Orders Proxy] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
}

async function handleWhatsappTest(req: VercelRequest, res: VercelResponse) {
  const clientId = req.query.clientId as string;
  const testPhone = req.query.testPhone as string;

  if (!clientId || !testPhone) {
    return res.status(400).json({ error: 'Falta clientId o testPhone' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: client, error: dbErr } = await supabase
    .from('car_clients')
    .select('whatsapp_phone_number_id, whatsapp_access_token, whatsapp_verified_number')
    .eq('id', clientId)
    .maybeSingle();

  if (dbErr || !client) {
    return res.status(500).json({ error: 'Error al consultar credenciales en la base de datos' });
  }

  const token = client.whatsapp_access_token;
  const phoneId = client.whatsapp_phone_number_id;

  if (!token || !phoneId) {
    return res.status(400).json({ error: 'WhatsApp no configurado. Falta el Token o el Phone Number ID.' });
  }

  // Clean phone number (leave digits only)
  const cleanPhone = testPhone.replace(/\D/g, '');

  try {
    const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: {
        body: '¡Conexión exitosa con tu SaaS! ✓ Este es un mensaje de prueba de la integración de WhatsApp Cloud API.'
      }
    };

    const waRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await waRes.json();

    if (!waRes.ok) {
      console.error('[WhatsApp Test Failed] Response:', data);
      const errDetail = data?.error?.message || `HTTP Error ${waRes.status}`;
      return res.status(400).json({ error: errDetail });
    }

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error('[WhatsApp Test Exception]:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action as string || '';

  if (action === 'whatsapp-test') return handleWhatsappTest(req, res);

  // Email preview (routed from /api/preview via vercel.json rewrite)
  if (action === 'preview' || req.query.email) return handlePreview(req, res);

  // URL-path fallbacks for OAuth callbacks that arrive without an action param
  // (happens when vercel.json rewrites /api/tiendanube-callback → /api/oauth)
  if (!action && req.url?.includes('/api/tiendanube-callback')) {
    (req.query as any).action = 'tiendanube-callback';
    return handleTiendanube(req, res);
  }
  if (!action && req.url?.includes('/api/shopify-callback')) {
    (req.query as any).action = 'shopify-callback';
    return handleShopify(req, res);
  }
  if (!action && req.url?.includes('/api/mercadolibre-callback')) {
    (req.query as any).action = 'mercadolibre-callback';
    return handleMercadoLibre(req, res);
  }
  if (!action && req.url?.includes('/api/tiktok-callback')) {
    (req.query as any).action = 'tiktok-callback';
    return handleTiktok(req, res);
  }

  if (action === 'tiendanube-webhook') return handleTiendanubeWebhook(req, res);
  if (action === 'shopify-webhook') return handleShopifyWebhook(req, res);
  if (action === 'chatwoot-register') return handleChatwootRegister(req, res);
  if (action === 'chatwoot-login') return handleChatwootLogin(req, res);

  if (action.startsWith('tiktok')) return handleTiktok(req, res);
  if (action.startsWith('mercadolibre')) return handleMercadoLibre(req, res);
  if (action.startsWith('shopify')) return handleShopify(req, res);
  if (action.startsWith('tiendanube')) return handleTiendanube(req, res);
  if (action.startsWith('woocommerce')) return handleWooCommerce(req, res);
  if (action === 'meta-accounts') return handleMetaAccounts(req, res);
  if (action === 'meta-pages') return handleMetaPages(req, res);

  if (action === 'meta-status') {
    const clientId = req.query.clientId as string;
    if (!clientId || !SUPABASE_SERVICE_ROLE_KEY) return res.status(200).json({ ready: false });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase.from('car_clients').select('facebook_access_token').eq('id', clientId).maybeSingle();
    return res.status(200).json({ ready: !!(data?.facebook_access_token) });
  }

  if (action.startsWith('meta')) return handleMeta(req, res);

  if (action === 'ensure-profile') {
    const { userId, email } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: existing } = await supabase.from('car_clients').select('id').eq('user_id', userId).maybeSingle();
    if (existing) return res.status(200).json({ created: false, id: existing.id });
    const businessName = email ? email.split('@')[0] : 'Mi negocio';
    const { data: created, error } = await supabase.from('car_clients').insert({ user_id: userId, business_name: businessName }).select('id').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ created: true, id: created.id });
  }

  return res.status(400).json({ error: 'action required: shopify-authorize | shopify-callback | tiendanube-authorize | tiendanube-callback | meta-authorize | meta-callback' });
}
