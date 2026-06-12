import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
    const returnUrl   = `${base}/integraciones?woocommerce=success`;

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
      `&scope=${encodeURIComponent('ads_read,ads_management,business_management,read_insights')}` +
      `&response_type=code`;
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

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action as string || '';

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

  if (action === 'tiendanube-webhook') return handleTiendanubeWebhook(req, res);
  if (action === 'shopify-webhook') return handleShopifyWebhook(req, res);
  if (action === 'chatwoot-register') return handleChatwootRegister(req, res);

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
