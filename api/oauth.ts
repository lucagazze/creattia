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
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

const getHost = (req: VercelRequest) => {
  const host = req.headers.host || '';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
};

const normalizeUrl = (raw: string) => {
  let value = (raw || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value.replace(/\/+$/, '');
};

const normalizeDomain = (raw: string) => normalizeUrl(raw).replace(/^https?:\/\//i, '').replace(/\/.*$/, '');

const parseRequestBody = (body: any) => {
  if (!body || typeof body !== 'string') return body || {};
  try {
    return JSON.parse(body);
  } catch {
    return Object.fromEntries(new URLSearchParams(body));
  }
};

const fetchWithTimeout = (url: string, opts: any, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
};

const verifyWooCredentials = async (shopUrl: string, key: string, secret: string) => {
  try {
    const baseUrl = normalizeUrl(shopUrl);
    const url = `${baseUrl}/wp-json/wc/v3/products?per_page=1`;
    const basic = Buffer.from(`${key}:${secret}`).toString('base64');
    const res = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Basic ${basic}`,
        'User-Agent': 'AlgorBot/1.0'
      }
    });
    if (res.ok) return true;
    console.log('[WooCommerce Verify] basic-auth attempt failed', { status: res.status, shopUrl: baseUrl });

    const queryRes = await fetchWithTimeout(
      `${baseUrl}/wp-json/wc/v3/products?per_page=1&consumer_key=${encodeURIComponent(key)}&consumer_secret=${encodeURIComponent(secret)}`,
      { headers: { 'User-Agent': 'AlgorBot/1.0' } }
    );
    if (!queryRes.ok) console.log('[WooCommerce Verify] query-param attempt failed', { status: queryRes.status, shopUrl: baseUrl });
    return queryRes.ok;
  } catch (err: any) {
    console.error('[WooCommerce Verify] Failed:', err?.name === 'AbortError' ? 'timeout' : err?.message || err);
    return false;
  }
};

async function updateClientStatuses(
  clientId: string,
  fields: Record<string, any>,
  statusKey: string,
  statusValue: 'ok' | 'error',
  extraStatuses?: Record<string, any>
) {
  if (!clientId || !SUPABASE_SERVICE_ROLE_KEY) return;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from('car_clients')
    .select('connection_statuses')
    .eq('id', clientId)
    .maybeSingle();
  const updatedStatuses = { 
    ...(data?.connection_statuses || {}), 
    [statusKey]: statusValue,
    ...(extraStatuses || {})
  };
  const { error: updateErr } = await supabase
    .from('car_clients')
    .update({ ...fields, connection_statuses: updatedStatuses })
    .eq('id', clientId);
  if (updateErr) console.error(`[updateClientStatuses] clientId=${clientId} statusKey=${statusKey}`, updateErr);
}

const isProbablyTruncated = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // If it ends with punctuation or common closing characters
  if (/[.!?…)"'”’\]\-\*]$/.test(trimmed)) return false;

  // If it ends with a hashtag (e.g. #skincare)
  if (/#\w+$/.test(trimmed)) return false;

  // If it ends with an emoji
  try {
    if (/\p{Emoji}/u.test(trimmed.slice(-2)) && !/[\d#\*]/.test(trimmed.slice(-1))) return false;
  } catch (e) {
    if (/[🙌🙏👍👌💪🔥❤️💜💙💚🖤🤍✨🎉🌟🥳👏😍💖😎📸💄🛍️💅💆‍♀️✨💥🌿🎯👇]$/.test(trimmed)) return false;
  }

  // Otherwise, it is probably truncated
  return true;
};

const normalizeDraftText = (text: string) =>
  text
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();

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

      let shopName = '';
      try {
        const shopRes = await fetch(`https://${cleanShop}/admin/api/2023-04/shop.json`, {
          headers: {
            'X-Shopify-Access-Token': access_token,
            'User-Agent': 'AlgorBot/1.0'
          }
        });
        if (shopRes.ok) {
          const shopJson = await shopRes.json();
          if (shopJson.shop?.name) {
            shopName = shopJson.shop.name;
          }
        }
      } catch (err) {
        console.error('[Shopify Shop Details Fetch] Failed:', err);
      }

      await updateClientStatuses(clientId!, {
        shopify_domain: cleanShop,
        shopify_access_token: access_token,
        ecommerce_platform: 'shopify',
        tiendanube_store_id: null, tiendanube_access_token: null,
        wordpress_url: null, woo_consumer_key: null, woo_consumer_secret: null
      }, 'shopify', 'ok', { shopify_shop_name: shopName || undefined });
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
    const requestedDomain = normalizeDomain(req.query.domain as string || '');
    if (!TN_CLIENT_ID) return res.status(503).json({ error: 'TiendaNube OAuth no configurado (falta TIENDANUBE_CLIENT_ID).' });
    if (!requestedDomain) return res.status(400).json({ error: 'domain requerido' });
    const state = Buffer.from(JSON.stringify({ clientId, requestedDomain })).toString('base64');
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
    let requestedDomain = '';
    try {
      const state = JSON.parse(Buffer.from(stateRaw, 'base64').toString());
      clientId = state.clientId;
      requestedDomain = normalizeDomain(state.requestedDomain || '');
    }
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

      let tnStoreName = '';
      let tnConnectedDomain = requestedDomain;
      try {
        const tnStoreRes = await fetch(`https://api.tiendanube.com/v1/${storeId}/store`, {
          headers: {
            'Authentication': `bearer ${access_token}`,
            'User-Agent': 'AlgorBot/1.0'
          }
        });
        if (tnStoreRes.ok) {
          const tnStoreJson = await tnStoreRes.json() as {
            name?: { es?: string; pt?: string; en?: string };
            main_domain?: string;
            original_domain?: string;
            domains?: string[];
          };
          if (tnStoreJson.name) {
            tnStoreName = tnStoreJson.name.es || tnStoreJson.name.pt || tnStoreJson.name.en || '';
          }
          tnConnectedDomain = normalizeDomain(tnStoreJson.main_domain || tnStoreJson.original_domain || tnStoreJson.domains?.[0] || requestedDomain);
        }
      } catch (err) {
        console.error('[Tiendanube Store Details Fetch] Failed:', err);
      }

      await updateClientStatuses(clientId!, {
        tiendanube_store_id: String(storeId),
        tiendanube_access_token: access_token,
        ecommerce_platform: 'tiendanube',
        shopify_domain: null, shopify_access_token: null,
        wordpress_url: null, woo_consumer_key: null, woo_consumer_secret: null
      }, 'shopify', 'ok', {
        tiendanube_store_name: tnStoreName || undefined,
        tiendanube_requested_domain: requestedDomain || undefined,
        tiendanube_domain: tnConnectedDomain || undefined
      });
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
    shop = normalizeUrl(shop);

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'WooCommerce OAuth no configurado en el servidor.' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: saveUrlError } = await supabase
      .from('car_clients')
      .update({ wordpress_url: shop })
      .eq('id', clientId);

    if (saveUrlError) {
      console.error('[WooCommerce Authorize] failed to persist wordpress_url', {
        clientId,
        shop,
        error: saveUrlError.message,
      });
      return res.status(500).json({ error: 'No se pudo preparar la conexión con WooCommerce.' });
    }

    const callbackUrl = `${base}/api/oauth?action=woocommerce-callback`;
    const returnUrl   = `${base}/#/integraciones?woocommerce=pending`;

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
    const body = parseRequestBody(req.body);
    const clientId       = (body.user_id || req.query.user_id) as string;
    const consumerKey    = body.consumer_key    as string;
    const consumerSecret = body.consumer_secret as string;

    // Diagnostic log: confirms whether WooCommerce's server-to-server POST
    // is reaching us at all, and with what shape — the only way to tell
    // "host never sent it" apart from "sent it but we mis-parsed it".
    console.log('[WooCommerce Callback] hit', {
      method: req.method,
      contentType: req.headers['content-type'],
      bodyType: typeof req.body,
      bodyKeys: Object.keys(body || {}),
      queryKeys: Object.keys(req.query || {}),
      hasClientId: !!clientId,
      hasConsumerKey: !!consumerKey,
      hasConsumerSecret: !!consumerSecret,
    });

    if (!clientId || !consumerKey || !consumerSecret) {
      console.error('[WooCommerce Callback] missing fields', { clientId: !!clientId, consumerKey: !!consumerKey, consumerSecret: !!consumerSecret, rawBody: body });
      if (clientId) {
        await updateClientStatuses(clientId, {
          woo_consumer_key: null,
          woo_consumer_secret: null,
          ecommerce_platform: null,
        }, 'shopify', 'error');
      }
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
    const wordpressUrl = normalizeUrl(clientRow?.wordpress_url || '');

    if (!wordpressUrl) {
      await updateClientStatuses(clientId, {
        woo_consumer_key: null,
        woo_consumer_secret: null,
        ecommerce_platform: null,
      }, 'shopify', 'error');
      return res.status(200).json({ ok: false, error: 'missing_wordpress_url' });
    }

    // Save the credentials FIRST, immediately — before any external verification call.
    // The frontend starts polling as soon as the browser lands back on /#/integraciones,
    // racing against this same request. If we verified first (an external round-trip to
    // the merchant's own site, up to several seconds) the frontend's short polling window
    // could elapse before the row was ever written, reporting "missing" even though the
    // real credentials were on their way in. Save now, verify after, as a best-effort
    // status refinement that doesn't gate whether the connection is usable.
    await updateClientStatuses(clientId, {
      woo_consumer_key:    consumerKey,
      woo_consumer_secret: consumerSecret,
      ecommerce_platform:  'wordpress',
      wordpress_url: wordpressUrl,
      // Clear competing platforms
      shopify_domain: null, shopify_access_token: null,
      tiendanube_store_id: null, tiendanube_access_token: null,
    }, 'shopify', 'ok');

    const isVerified = await verifyWooCredentials(wordpressUrl, consumerKey, consumerSecret);
    if (!isVerified) {
      await updateClientStatuses(clientId, {}, 'shopify', 'error');
    }

    // WC ignores our response body — just needs a 200
    return res.status(200).json({ ok: isVerified });
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
      `&scope=${encodeURIComponent('ads_read,ads_management,business_management,read_insights,pages_show_list,pages_messaging,instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights,instagram_manage_messages,pages_read_engagement,pages_manage_metadata,pages_read_user_content,pages_manage_posts,pages_manage_engagement')}` +
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

async function handleMetaSaveSelection(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server not configured' });

  const authHeader = req.headers.authorization || '';
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sesión requerida' });

  const body = parseRequestBody(req.body);
  let clientId = String(body.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    await assertClientAccess(supabase, accessToken, clientId);
  } catch (err: any) {
    return res.status(isAuthSessionError(err) ? 401 : 403).json({ error: err?.message || 'Sin permisos' });
  }

  const selectedAccountId = body.selectedAccountId ? String(body.selectedAccountId) : null;
  const selectedAccountName = body.selectedAccountName ? String(body.selectedAccountName) : null;
  const selectedPage = body.selectedPage || null;
  const approveAds = body.approveAds !== false;
  const approveMessaging = body.approveMessaging !== false;

  if (approveAds && !selectedAccountId) return res.status(400).json({ error: 'Seleccioná una cuenta publicitaria.' });
  if (approveMessaging && !selectedPage?.id) return res.status(400).json({ error: 'Seleccioná una página de Facebook.' });

  const { data: current } = await supabase
    .from('car_clients')
    .select('connection_statuses')
    .eq('id', clientId)
    .maybeSingle();
  const currentStatuses = current?.connection_statuses || {};
  const ig = selectedPage?.instagram_business_account || null;
  const updatedStatuses = {
    ...currentStatuses,
    meta: approveAds || approveMessaging ? 'ok' : null,
    meta_account_name: approveAds ? selectedAccountName : null,
    facebook: approveMessaging ? 'ok' : null,
    instagram: approveMessaging && ig?.id ? 'ok' : null,
    facebook_page_name: approveMessaging ? selectedPage?.name : null,
    instagram_username: approveMessaging ? ig?.username || null : null
  };

  Object.keys(updatedStatuses).forEach(key => {
    if ((updatedStatuses as any)[key] === null || typeof (updatedStatuses as any)[key] === 'undefined') {
      delete (updatedStatuses as any)[key];
    }
  });

  const { error } = await supabase.from('car_clients').update({
    meta_account_id: approveAds ? selectedAccountId : null,
    fb_page_id: approveMessaging ? String(selectedPage.id) : null,
    fb_page_name: approveMessaging ? String(selectedPage.name || '') : null,
    fb_page_access_token: approveMessaging ? String(selectedPage.access_token || '') : null,
    ig_business_id: approveMessaging ? ig?.id || null : null,
    ig_username: approveMessaging ? ig?.username || null : null,
    connection_statuses: updatedStatuses
  }).eq('id', clientId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

async function handleMetaDisconnect(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Servidor no configurado.' });

  const authHeader = req.headers.authorization || '';
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sesión requerida' });

  const body = parseRequestBody(req.body);
  const clientId = String(body.clientId || req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    await assertClientAccess(supabase, accessToken, clientId);
  } catch (err: any) {
    return res.status(isAuthSessionError(err) ? 401 : 403).json({ error: err?.message || 'Sin permisos' });
  }

  const { data: current, error: readError } = await supabase
    .from('car_clients')
    .select('connection_statuses')
    .eq('id', clientId)
    .maybeSingle();
  if (readError) return res.status(500).json({ error: readError.message });

  const connectionStatuses = { ...(current?.connection_statuses || {}) };
  [
    'meta',
    'facebook',
    'instagram',
    'meta_account_name',
    'facebook_page_name',
    'instagram_username'
  ].forEach(key => delete connectionStatuses[key]);

  const { data, error } = await supabase
    .from('car_clients')
    .update({
      meta_account_id: null,
      meta_pixel_id: null,
      facebook_access_token: null,
      fb_page_id: null,
      fb_page_name: null,
      fb_page_access_token: null,
      ig_business_id: null,
      ig_username: null,
      connection_statuses: connectionStatuses
    })
    .eq('id', clientId)
    .select('*')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, client: data });
}

async function handleYoutube(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const base = getHost(req);

  if (action === 'youtube-authorize') {
    const clientId = req.query.clientId as string;
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
    if (!YOUTUBE_CLIENT_ID) return res.status(503).json({ error: 'YouTube OAuth no configurado (falta YOUTUBE_CLIENT_ID).' });
    const redirectUri = `${base}/api/oauth?action=youtube-callback`;
    const state = Buffer.from(JSON.stringify({ clientId, host: base })).toString('base64');
    const authorizeUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(YOUTUBE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&include_granted_scopes=true` +
      `&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly')}` +
      `&state=${encodeURIComponent(state)}`;
    return res.status(200).json({ authorizeUrl });
  }

  if (action === 'youtube-callback') {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;
    let clientId = '';
    let redirectBase = base;
    try {
      const state = JSON.parse(Buffer.from(stateRaw || '', 'base64').toString());
      clientId = state.clientId;
      redirectBase = state.host || base;
    } catch {
      return res.redirect(`${base}/#/integraciones?youtube=error&reason=invalid_state`);
    }
    if (!code || !clientId) return res.redirect(`${redirectBase}/#/integraciones?youtube=error&reason=missing_code`);
    if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.redirect(`${redirectBase}/#/integraciones?youtube=error&reason=not_configured`);
    }

    try {
      const redirectUri = `${base}/api/oauth?action=youtube-callback`;
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: YOUTUBE_CLIENT_ID,
          client_secret: YOUTUBE_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        }).toString()
      });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenJson.access_token) {
        return res.redirect(`${redirectBase}/#/integraciones?youtube=error&reason=token_exchange`);
      }

      let channelTitle = '';
      let channelId = '';
      try {
        const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` }
        });
        const channelJson = await channelRes.json().catch(() => ({}));
        const channel = channelJson?.items?.[0];
        channelTitle = channel?.snippet?.title || '';
        channelId = channel?.id || '';
      } catch {}

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: current } = await supabase.from('car_clients').select('connection_statuses').eq('id', clientId).maybeSingle();
      await supabase.from('car_clients').update({
        youtube_access_token: tokenJson.access_token,
        youtube_refresh_token: tokenJson.refresh_token || null,
        youtube_channel_id: channelId || null,
        youtube_channel_title: channelTitle || null,
        youtube_expiration: new Date(Date.now() + Number(tokenJson.expires_in || 3600) * 1000).toISOString(),
        connection_statuses: {
          ...(current?.connection_statuses || {}),
          youtube: 'ok',
          youtube_channel_title: channelTitle || undefined
        }
      }).eq('id', clientId);

      return res.redirect(`${redirectBase}/#/integraciones?youtube=success`);
    } catch (err: any) {
      console.error('[YouTube OAuth]', err);
      return res.redirect(`${redirectBase}/#/integraciones?youtube=error&reason=server_error`);
    }
  }

  if (action === 'youtube-profile' || action === 'youtube-posts') {
    const clientId = req.query.clientId as string;
    if (!clientId || !SUPABASE_SERVICE_ROLE_KEY) return res.status(400).json({ error: 'clientId requerido' });
    const authHeader = req.headers.authorization || '';
    const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const sessionToken = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '';
    if (!sessionToken) return res.status(401).json({ error: 'Sesión requerida' });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    try {
      await assertClientAccess(supabase, sessionToken, clientId);
    } catch (err: any) {
      return res.status(isAuthSessionError(err) ? 401 : 403).json({ error: err?.message || 'Sin permisos' });
    }
    const accessToken = await getValidYoutubeToken(clientId, supabase);
    if (!accessToken) return res.status(404).json({ error: 'YouTube no conectado' });
    const endpoint = action === 'youtube-profile'
      ? 'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true'
      : 'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&order=date&maxResults=24';
    const ytRes = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await ytRes.json().catch(() => ({}));
    if (!ytRes.ok || json?.error) return res.status(400).json({ error: json?.error?.message || 'No se pudo leer YouTube.' });
    return res.status(200).json(json);
  }

  return res.status(400).json({ error: 'youtube action invalid' });
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
const TIKTOK_CONTENT_CLIENT_KEY = process.env.TIKTOK_CONTENT_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || '';
const TIKTOK_CONTENT_CLIENT_SECRET = process.env.TIKTOK_CONTENT_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || '';

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
      
      let advertiserName = '';
      if (mainAdvertiserId) {
        try {
          const advRes = await fetch(`https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=["${mainAdvertiserId}"]`, {
            headers: {
              'Access-Token': data.access_token
            }
          });
          if (advRes.ok) {
            const advJson = await advRes.json();
            if (advJson.code === 0 && Array.isArray(advJson.data?.list) && advJson.data.list.length > 0) {
              advertiserName = advJson.data.list[0].name || '';
            }
          }
        } catch (err) {
          console.error('[TikTok Advertiser Info Fetch] Failed:', err);
        }
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
        tiktok_ads: 'ok',
        tiktok_advertiser_name: advertiserName || undefined
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
        avatar_url: '/assets/logotiktok.png',
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

async function getValidTiktokContentToken(clientId: string, supabase: any): Promise<string | null> {
  const { data: client } = await supabase
    .from('car_clients')
    .select('tiktok_content_access_token, tiktok_content_refresh_token, tiktok_content_expiration')
    .eq('id', clientId)
    .maybeSingle();

  if (!client?.tiktok_content_access_token) return null;

  const expiration = client.tiktok_content_expiration ? new Date(client.tiktok_content_expiration).getTime() : 0;
  if (expiration && Date.now() < expiration - 30 * 60 * 1000) {
    return client.tiktok_content_access_token;
  }

  if (!client.tiktok_content_refresh_token || !TIKTOK_CONTENT_CLIENT_KEY || !TIKTOK_CONTENT_CLIENT_SECRET) {
    return client.tiktok_content_access_token;
  }

  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CONTENT_CLIENT_KEY,
        client_secret: TIKTOK_CONTENT_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: client.tiktok_content_refresh_token
      }).toString()
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok || json.error) {
      console.error('[TikTok Content Refresh] Failed:', json);
      return client.tiktok_content_access_token;
    }

    await supabase
      .from('car_clients')
      .update({
        tiktok_content_access_token: json.access_token,
        tiktok_content_refresh_token: json.refresh_token || client.tiktok_content_refresh_token,
        tiktok_content_expiration: new Date(Date.now() + Number(json.expires_in || 86400) * 1000).toISOString()
      })
      .eq('id', clientId);

    return json.access_token;
  } catch (err) {
    console.error('[TikTok Content Refresh] Exception:', err);
    return client.tiktok_content_access_token;
  }
}

async function handleTiktokContent(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  const base = getHost(req);

  if (action === 'tiktok-content-authorize') {
    const clientId = req.query.clientId as string;
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
    if (!TIKTOK_CONTENT_CLIENT_KEY) return res.status(503).json({ error: 'TikTok orgánico no configurado (falta TIKTOK_CONTENT_CLIENT_KEY).' });

    const redirectUri = `${base}/api/tiktok-content-callback`;
    const state = Buffer.from(JSON.stringify({ clientId, host: base })).toString('base64');
    const authorizeUrl =
      `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${encodeURIComponent(TIKTOK_CONTENT_CLIENT_KEY)}` +
      `&scope=${encodeURIComponent('user.info.basic,video.upload')}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    return res.status(200).json({ authorizeUrl });
  }

  if (action === 'tiktok-content-callback') {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;
    const error = req.query.error as string;

    let clientId = '';
    let redirectBase = base;
    try {
      const state = JSON.parse(Buffer.from(stateRaw || '', 'base64').toString());
      clientId = state.clientId || '';
      redirectBase = state.host || base;
    } catch {
      return res.redirect(`${base}/#/integraciones?tiktok_content=error&reason=invalid_state`);
    }

    if (error) return res.redirect(`${redirectBase}/#/integraciones?tiktok_content=error&reason=${encodeURIComponent(error)}`);
    if (!code || !clientId) return res.redirect(`${redirectBase}/#/integraciones?tiktok_content=error&reason=missing_code`);
    if (!TIKTOK_CONTENT_CLIENT_KEY || !TIKTOK_CONTENT_CLIENT_SECRET) {
      return res.redirect(`${redirectBase}/#/integraciones?tiktok_content=error&reason=not_configured`);
    }

    try {
      const redirectUri = `${base}/api/tiktok-content-callback`;
      const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: TIKTOK_CONTENT_CLIENT_KEY,
          client_secret: TIKTOK_CONTENT_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri
        }).toString()
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || tokenJson.error) {
        console.error('[TikTok Content Token Exchange] Failed:', tokenJson);
        return res.redirect(`${redirectBase}/#/integraciones?tiktok_content=error&reason=token_exchange`);
      }

      let displayName = '';
      let avatarUrl = '';
      try {
        const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username', {
          headers: { Authorization: `Bearer ${tokenJson.access_token}` }
        });
        const userJson = await userRes.json();
        const user = userJson?.data?.user || {};
        displayName = user.display_name || user.username || '';
        avatarUrl = user.avatar_url || '';
      } catch (err) {
        console.error('[TikTok Content User Info] Failed:', err);
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: clientRow } = await supabase
        .from('car_clients')
        .select('connection_statuses')
        .eq('id', clientId)
        .maybeSingle();

      const updatedStatuses = {
        ...(clientRow?.connection_statuses || {}),
        tiktok_content: 'ok',
        tiktok_content_display_name: displayName || undefined
      };

      await supabase
        .from('car_clients')
        .update({
          tiktok_content_access_token: tokenJson.access_token,
          tiktok_content_refresh_token: tokenJson.refresh_token,
          tiktok_content_open_id: tokenJson.open_id,
          tiktok_content_display_name: displayName,
          tiktok_content_avatar_url: avatarUrl,
          tiktok_content_expiration: new Date(Date.now() + Number(tokenJson.expires_in || 86400) * 1000).toISOString(),
          connection_statuses: updatedStatuses
        })
        .eq('id', clientId);

      return res.redirect(`${redirectBase}/#/integraciones?tiktok_content=success`);
    } catch (err: any) {
      console.error('[TikTok Content Callback] Error:', err);
      return res.redirect(`${redirectBase}/#/integraciones?tiktok_content=error&reason=server_error`);
    }
  }
}

async function publishTiktokInboxVideo(accessToken: string, videoUrl: string) {
  const sourceRes = await fetch(videoUrl);
  if (!sourceRes.ok) throw new Error(`No se pudo leer el video para TikTok (${sourceRes.status}).`);
  const contentType = sourceRes.headers.get('content-type') || 'video/mp4';
  const videoBuffer = Buffer.from(await sourceRes.arrayBuffer());
  const videoSize = videoBuffer.byteLength;
  if (!videoSize) throw new Error('El video está vacío.');

  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1
      }
    })
  });
  const initJson = await initRes.json().catch(() => ({}));
  if (!initRes.ok || initJson?.error) {
    throw new Error(initJson?.error?.message || initJson?.error_description || `TikTok init error ${initRes.status}`);
  }

  const uploadUrl = initJson?.data?.upload_url;
  const publishId = initJson?.data?.publish_id;
  if (!uploadUrl) throw new Error('TikTok no devolvió upload_url.');

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType.includes('video/') ? contentType : 'video/mp4',
      'Content-Length': String(videoSize),
      'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`
    },
    body: videoBuffer
  });
  if (!uploadRes.ok) {
    throw new Error(`TikTok upload error ${uploadRes.status}: ${(await uploadRes.text()).slice(0, 160)}`);
  }

  return {
    status: 'processing',
    id: publishId,
    message: 'Video enviado a TikTok. El usuario debe abrir la notificación/inbox en TikTok para revisar y publicar.'
  };
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

type SocialChannel = 'instagram' | 'facebook' | 'tiktok' | 'youtube';

const isAuthSessionError = (err: any) => String(err?.message || '').toLowerCase().includes('sesión');

const validateSocialVideoOwnership = (clientId: string, videoUrl: string, videoPath: string | null) => {
  if (!videoPath) {
    throw new Error('videoPath requerido para publicar de forma segura. Volvé a cargar el video.');
  }

  const pathParts = videoPath.split('/').filter(Boolean);
  if (pathParts.length < 3 || pathParts[1] !== clientId) {
    throw new Error('El video no pertenece al cliente seleccionado. Volvé a cargarlo.');
  }

  try {
    const decodedPathname = decodeURIComponent(new URL(videoUrl).pathname);
    const expectedSuffix = `car-social-videos/${videoPath}`;
    if (!decodedPathname.endsWith(expectedSuffix)) {
      throw new Error('La URL pública no coincide con el archivo validado del cliente.');
    }
  } catch (err: any) {
    throw new Error(err?.message || 'URL de video inválida.');
  }
};

async function assertClientAccess(supabase: any, accessToken: string, clientId: string) {
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  const authUserId = userData?.user?.id || '';
  const authEmail = (userData?.user?.email || '').trim().toLowerCase();
  if (userErr || !authUserId) throw new Error('Tu sesión de Algoritmia expiró. Cerrá sesión y volvé a entrar.');

  const { data: client, error } = await supabase
    .from('car_clients')
    .select('user_id, is_admin')
    .eq('id', clientId)
    .maybeSingle();
  if (error || !client) throw new Error('Cliente no encontrado');

  const ownsClient = client.user_id === authUserId;
  const { data: adminClient } = await supabase
    .from('car_clients')
    .select('id')
    .eq('user_id', authUserId)
    .eq('is_admin', true)
    .maybeSingle();
  const { data: association } = await supabase
    .from('car_business_accounts')
    .select('id')
    .eq('business_id', clientId)
    .eq('user_id', authUserId)
    .maybeSingle();
  let emailAssociation = null;
  if (!association && authEmail) {
    const { data } = await supabase
      .from('car_business_accounts')
      .select('id')
      .eq('business_id', clientId)
      .ilike('email', authEmail)
      .maybeSingle();
    emailAssociation = data;
  }

  if (!ownsClient && !adminClient && !association && !emailAssociation) throw new Error('No tenés permisos para este cliente');
  return authUserId;
}

async function resolveClientAccess(supabase: any, accessToken: string, requestedClientId: string) {
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  const authUserId = userData?.user?.id || '';
  const authEmail = (userData?.user?.email || '').trim().toLowerCase();
  if (userErr || !authUserId) throw new Error('Tu sesión de Algoritmia expiró. Cerrá sesión y volvé a entrar.');

  let clientId = requestedClientId && requestedClientId !== 'default' ? requestedClientId : '';

  if (clientId) {
    const { data: client } = await supabase
      .from('car_clients')
      .select('id')
      .eq('id', clientId)
      .maybeSingle();
    if (!client) {
      const { data: associationById } = await supabase
        .from('car_business_accounts')
        .select('business_id')
        .eq('id', clientId)
        .eq('user_id', authUserId)
        .maybeSingle();
      clientId = associationById?.business_id || '';
    }
  }

  if (!clientId) {
    const [{ data: ownedClient }, { data: association }, { data: emailAssociation }] = await Promise.all([
      supabase
        .from('car_clients')
        .select('id')
        .eq('user_id', authUserId)
        .maybeSingle(),
      supabase
        .from('car_business_accounts')
        .select('business_id')
        .eq('user_id', authUserId)
        .maybeSingle(),
      authEmail
        ? supabase
          .from('car_business_accounts')
          .select('business_id')
          .ilike('email', authEmail)
          .maybeSingle()
        : Promise.resolve({ data: null })
    ]);
    clientId = ownedClient?.id || association?.business_id || emailAssociation?.business_id || '';
  }

  if (!clientId && authEmail) {
    const { data: emailAssociation } = await supabase
      .from('car_business_accounts')
      .select('business_id')
      .ilike('email', authEmail)
      .maybeSingle()
    clientId = emailAssociation?.business_id || '';
  }

  if (!clientId) throw new Error('Cliente no encontrado');
  await assertClientAccess(supabase, accessToken, clientId);
  return { authUserId, clientId };
}

const postGraph = async (url: string, body: Record<string, any>) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.error) {
    throw new Error(json?.error?.message || `Graph API error ${response.status}`);
  }
  return json;
};

const getGraph = async (url: string) => {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.error) {
    throw new Error(json?.error?.message || `Graph API error ${response.status}`);
  }
  return json;
};

async function publishFacebookVideo(pageId: string, pageToken: string, videoUrl: string, caption: string) {
  const json = await postGraph(`https://graph.facebook.com/v21.0/${pageId}/videos`, {
    file_url: videoUrl,
    description: caption,
    access_token: pageToken
  });
  const videoId = json?.id || '';
  return {
    status: 'published',
    id: videoId,
    url: videoId ? `https://www.facebook.com/${videoId}` : undefined,
    message: 'Video enviado a la página de Facebook.'
  };
}

async function publishInstagramReel(igBusinessId: string, pageToken: string, videoUrl: string, caption: string) {
  const container = await postGraph(`https://graph.facebook.com/v21.0/${igBusinessId}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: true,
    access_token: pageToken
  });

  const creationId = container?.id;
  if (!creationId) throw new Error('Instagram no devolvió creation_id.');

  let statusCode = '';
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, i === 0 ? 2500 : 5000));
    const status = await getGraph(`https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(pageToken)}`);
    statusCode = status?.status_code || '';
    if (statusCode === 'FINISHED') break;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Instagram no pudo procesar el video (${statusCode}).`);
    }
  }

  if (statusCode !== 'FINISHED') {
    return {
      status: 'processing',
      id: creationId,
      message: 'Instagram recibió el video y sigue procesándolo. Reintentá publicar en unos minutos si no aparece.'
    };
  }

  const published = await postGraph(`https://graph.facebook.com/v21.0/${igBusinessId}/media_publish`, {
    creation_id: creationId,
    access_token: pageToken
  });

  return {
    status: 'published',
    id: published?.id || creationId,
    url: published?.id ? `https://www.instagram.com/p/${published.id}/` : undefined,
    message: 'Reel enviado a Instagram.'
  };
}

async function getValidYoutubeToken(clientId: string, supabase: any) {
  const { data: client } = await supabase
    .from('car_clients')
    .select('youtube_access_token, youtube_refresh_token, youtube_expiration')
    .eq('id', clientId)
    .maybeSingle();

  if (!client?.youtube_access_token) return null;
  const expiration = client.youtube_expiration ? new Date(client.youtube_expiration).getTime() : 0;
  if (!expiration || expiration > Date.now() + 120000) return client.youtube_access_token;
  if (!client.youtube_refresh_token || !YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) return client.youtube_access_token;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        refresh_token: client.youtube_refresh_token,
        grant_type: 'refresh_token'
      }).toString()
    });
    const json = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !json.access_token) return client.youtube_access_token;
    await supabase.from('car_clients').update({
      youtube_access_token: json.access_token,
      youtube_expiration: new Date(Date.now() + Number(json.expires_in || 3600) * 1000).toISOString()
    }).eq('id', clientId);
    return json.access_token;
  } catch {
    return client.youtube_access_token;
  }
}

async function publishYoutubeShort(clientId: string, supabase: any, videoUrl: string, caption: string) {
  const accessToken = await getValidYoutubeToken(clientId, supabase);
  if (!accessToken) {
    return { status: 'missing_connection', message: 'Falta conectar YouTube desde Integraciones.' };
  }

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error('No se pudo descargar el video para YouTube.');
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const metadata = {
    snippet: {
      title: caption.slice(0, 90) || 'Short',
      description: caption,
      categoryId: '22'
    },
    status: {
      privacyStatus: 'public',
      selfDeclaredMadeForKids: false
    }
  };
  const boundary = `algoritmia_${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: video/*\r\n\r\n`),
    videoBuffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const uploadRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length)
    },
    body
  });
  const json = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || json?.error) throw new Error(json?.error?.message || 'YouTube rechazó la publicación.');
  return {
    status: 'published',
    id: json.id,
    url: json.id ? `https://www.youtube.com/shorts/${json.id}` : undefined,
    message: 'Short enviado a YouTube.'
  };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const buildSocialAccountSnapshot = (clientId: string, client: any, channels: SocialChannel[]) => ({
  client: {
    id: clientId,
    business_name: client.business_name || client.email || '',
  },
  requested_channels: channels,
  accounts: {
    instagram: client.ig_business_id ? {
      platform: 'instagram',
      account_id: client.ig_business_id,
      username: client.ig_username || '',
      page_id: client.fb_page_id || '',
      page_name: client.fb_page_name || '',
    } : null,
    facebook: client.fb_page_id ? {
      platform: 'facebook',
      page_id: client.fb_page_id,
      page_name: client.fb_page_name || '',
    } : null,
    tiktok: (client.tiktok_content_open_id || client.tiktok_content_display_name) ? {
      platform: 'tiktok',
      open_id: client.tiktok_content_open_id || '',
      display_name: client.tiktok_content_display_name || client.connection_statuses?.tiktok_content_display_name || '',
    } : null,
    youtube: (client.youtube_channel_id || client.youtube_channel_title) ? {
      platform: 'youtube',
      channel_id: client.youtube_channel_id || '',
      channel_title: client.youtube_channel_title || client.connection_statuses?.youtube_channel_title || '',
    } : null,
  },
});

const getAccountFingerprint = (account: any, channel: SocialChannel) => {
  if (!account) return '';
  if (channel === 'instagram') return String(account.account_id || '');
  if (channel === 'facebook') return String(account.page_id || '');
  if (channel === 'tiktok') return String(account.open_id || '');
  if (channel === 'youtube') return String(account.channel_id || '');
  return '';
};

const getChangedScheduledAccounts = (scheduledAudit: any, currentAudit: any, channels: SocialChannel[]) => {
  return channels.filter(channel => {
    const scheduled = getAccountFingerprint(scheduledAudit?.accounts?.[channel], channel);
    const current = getAccountFingerprint(currentAudit?.accounts?.[channel], channel);
    return !!scheduled && !!current && scheduled !== current;
  });
};

const assertExpectedSocialAccounts = (
  accountSnapshot: ReturnType<typeof buildSocialAccountSnapshot>,
  channels: SocialChannel[],
  expectedAccounts: Record<string, any>
) => {
  const mismatches = channels.filter(channel => {
    const expected = String(expectedAccounts?.[channel] || '').trim();
    const current = getAccountFingerprint(accountSnapshot.accounts?.[channel], channel);
    return !expected || !current || expected !== current;
  });

  if (mismatches.length > 0) {
    throw new Error(`La cuenta conectada no coincide con la confirmación (${mismatches.join(', ')}). Se bloqueó para evitar publicar en otra cuenta.`);
  }
};

async function publishSocialChannel(
  channel: SocialChannel,
  clientId: string,
  client: any,
  supabase: any,
  videoUrl: string,
  caption: string,
  accountSnapshot: Record<string, any>
) {
  if (channel === 'facebook') {
    if (!client.fb_page_id || !client.fb_page_access_token) {
      return { status: 'missing_connection', account: accountSnapshot.accounts.facebook, message: 'Falta conectar una página de Facebook con permiso de publicación.' };
    }
    return { ...(await publishFacebookVideo(client.fb_page_id, client.fb_page_access_token, videoUrl, caption)), account: accountSnapshot.accounts.facebook };
  }

  if (channel === 'instagram') {
    if (!client.ig_business_id || !client.fb_page_access_token) {
      return { status: 'missing_connection', account: accountSnapshot.accounts.instagram, message: 'Falta conectar Instagram profesional desde Meta.' };
    }
    return { ...(await publishInstagramReel(client.ig_business_id, client.fb_page_access_token, videoUrl, caption)), account: accountSnapshot.accounts.instagram };
  }

  if (channel === 'tiktok') {
    const tiktokToken = await getValidTiktokContentToken(clientId, supabase);
    if (!tiktokToken) {
      return { status: 'missing_connection', account: accountSnapshot.accounts.tiktok, message: 'Falta conectar TikTok orgánico desde Integraciones.' };
    }
    return { ...(await publishTiktokInboxVideo(tiktokToken, videoUrl)), account: accountSnapshot.accounts.tiktok };
  }

  if (channel === 'youtube') {
    return { ...(await publishYoutubeShort(clientId, supabase, videoUrl, caption)), account: accountSnapshot.accounts.youtube };
  }

  return { status: 'error', message: 'Canal no soportado.' };
}

async function publishSocialChannelsWithRetries(
  channels: SocialChannel[],
  clientId: string,
  client: any,
  supabase: any,
  videoUrl: string,
  caption: string,
  accountSnapshot: Record<string, any>
) {
  const channelResults = await Promise.all(channels.map(async channel => {
    let lastMessage = 'Error al publicar.';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await publishSocialChannel(channel, clientId, client, supabase, videoUrl, caption, accountSnapshot);
        return { channel, result: { ...result, attempts: attempt } };
      } catch (err: any) {
        lastMessage = err?.message || lastMessage;
        if (attempt < 3) await sleep(1500 * attempt);
      }
    }
    return { channel, result: { status: 'error', message: lastMessage, attempts: 3 } };
  }));

  return channelResults.reduce((acc, item) => {
    acc[item.channel] = item.result;
    return acc;
  }, {} as Record<string, any>);
}

async function handleCosts(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Servidor no configurado.' });

  const action = req.query.action as string;
  const authHeader = req.headers.authorization || '';
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sesión requerida' });

  const body = parseRequestBody(req.body);
  const clientId = String(body.clientId || req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    await assertClientAccess(supabase, accessToken, clientId);
  } catch (err: any) {
    return res.status(isAuthSessionError(err) ? 401 : 403).json({ error: err?.message || 'Sin permisos' });
  }

  if (action === 'costs-load') {
    const [variantRes, additionalRes] = await Promise.all([
      supabase
        .from('car_variant_costs')
        .select('variant_id, cost, packaging_cost, updated_at')
        .eq('client_id', clientId),
      supabase
        .from('car_additional_costs')
        .select('id, category, name, start_date, end_date, cost, daily_cost, currency, ad_spend, platform, updated_at')
        .eq('client_id', clientId)
    ]);
    if (variantRes.error) return res.status(500).json({ error: variantRes.error.message });
    if (additionalRes.error) return res.status(500).json({ error: additionalRes.error.message });
    return res.status(200).json({ variantCosts: variantRes.data || [], additionalCosts: additionalRes.data || [] });
  }

  if (action === 'costs-upsert-variants') {
    const rowsInput = Array.isArray(body.rows) ? body.rows : (body.row ? [body.row] : []);
    if (rowsInput.length === 0) return res.status(400).json({ error: 'rows requerido' });
    const now = new Date().toISOString();
    const rows = rowsInput
      .filter((row: any) => row?.variant_id)
      .map((row: any) => ({
        client_id: clientId,
        variant_id: String(row.variant_id),
        cost: Number(row.cost) || 0,
        packaging_cost: Number(row.packaging_cost) || 0,
        updated_at: row.updated_at || now
      }));
    if (rows.length === 0) return res.status(400).json({ error: 'rows sin variant_id' });
    const { data, error } = await supabase
      .from('car_variant_costs')
      .upsert(rows, { onConflict: 'client_id,variant_id' })
      .select('variant_id, cost, packaging_cost, updated_at');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ rows: data || [] });
  }

  if (action === 'costs-delete-variants') {
    const variantIds = Array.isArray(body.variantIds) ? body.variantIds.map(String) : [];
    if (variantIds.length === 0) return res.status(400).json({ error: 'variantIds requerido' });
    const { error } = await supabase
      .from('car_variant_costs')
      .delete()
      .eq('client_id', clientId)
      .in('variant_id', variantIds);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ deleted: variantIds.length });
  }

  if (action === 'costs-save-additional') {
    const row = body.row || {};
    const dbRow = {
      client_id: clientId,
      category: String(row.category || ''),
      name: String(row.name || ''),
      start_date: String(row.start_date || ''),
      end_date: String(row.end_date || ''),
      cost: Number(row.cost) || 0,
      daily_cost: Number(row.daily_cost) || 0,
      currency: String(row.currency || 'LOCAL'),
      ad_spend: !!row.ad_spend,
      platform: String(row.platform || '-'),
      updated_at: row.updated_at || new Date().toISOString()
    };
    if (!['equipo', 'otros', 'campanas'].includes(dbRow.category) || !dbRow.name || !dbRow.start_date || !dbRow.end_date) {
      return res.status(400).json({ error: 'Datos de costo adicional incompletos' });
    }
    const query = row.id
      ? supabase.from('car_additional_costs').update(dbRow).eq('client_id', clientId).eq('id', String(row.id)).select()
      : supabase.from('car_additional_costs').insert(dbRow).select();
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ row: data?.[0] || null });
  }

  if (action === 'costs-delete-additional') {
    const id = String(body.id || '');
    if (!id) return res.status(400).json({ error: 'id requerido' });
    const { error } = await supabase
      .from('car_additional_costs')
      .delete()
      .eq('client_id', clientId)
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ deleted: id });
  }

  return res.status(400).json({ error: 'costs action invalid' });
}

async function handleBrainSave(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Servidor no configurado.' });

  const authHeader = req.headers.authorization || '';
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sesión requerida' });

  const body = parseRequestBody(req.body);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let clientId = String(body.clientId || '');
  try {
    const access = await resolveClientAccess(supabase, accessToken, clientId);
    clientId = access.clientId;
  } catch (err: any) {
    return res.status(isAuthSessionError(err) ? 401 : 403).json({ error: err?.message || 'Sin permisos' });
  }

  const customInstructions = body.custom_instructions;
  const fields = {
    business_description: String(body.business_description || ''),
    custom_instructions: typeof customInstructions === 'string' ? customInstructions : JSON.stringify(customInstructions || {}),
    website_url: String(body.website_url || ''),
    brain_updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('car_clients')
    .update(fields)
    .eq('id', clientId)
    .select('brain_updated_at')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, brain_updated_at: data?.brain_updated_at || fields.brain_updated_at });
}

async function handleSocialPublish(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Servidor no configurado.' });

  const authHeader = req.headers.authorization || '';
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sesión requerida' });

  const body = parseRequestBody(req.body);
  const clientId = String(body.clientId || '');
  const caption = String(body.caption || '').trim();
  const videoUrl = String(body.videoUrl || '').trim();
  const videoPath = body.videoPath ? String(body.videoPath) : null;
  const channels = Array.isArray(body.channels)
    ? Array.from(new Set(body.channels.filter((c: string) => ['instagram', 'facebook', 'tiktok', 'youtube'].includes(c)))) as SocialChannel[]
    : [];
  const expectedAccounts = body.expectedAccounts && typeof body.expectedAccounts === 'object' ? body.expectedAccounts : {};
  const scheduledAt = body.scheduledAt ? String(body.scheduledAt) : '';

  if (!clientId || clientId === 'default') return res.status(400).json({ error: 'Cliente explícito requerido para publicar.' });
  if (!caption) return res.status(400).json({ error: 'caption requerido' });
  if (!videoUrl || !/^https:\/\//i.test(videoUrl)) return res.status(400).json({ error: 'videoUrl público HTTPS requerido' });
  if (channels.length === 0) return res.status(400).json({ error: 'Seleccioná al menos un canal' });
  try {
    validateSocialVideoOwnership(clientId, videoUrl, videoPath);
  } catch (err: any) {
    return res.status(403).json({ error: err?.message || 'El video no pertenece al cliente seleccionado. Volvé a cargarlo.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let authUserId = '';
  try {
    authUserId = await assertClientAccess(supabase, accessToken, clientId);
  } catch (err: any) {
    return res.status(isAuthSessionError(err) ? 401 : 403).json({ error: err?.message || 'Sin permisos' });
  }

  const { data: client, error } = await supabase
    .from('car_clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message || 'No se pudo leer el cliente.' });
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const accountSnapshot = buildSocialAccountSnapshot(clientId, client, channels);
  try {
    assertExpectedSocialAccounts(accountSnapshot, channels, expectedAccounts);
  } catch (err: any) {
    return res.status(409).json({ error: err?.message || 'La cuenta conectada no coincide con la confirmación.' });
  }

  if (scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 30000) {
    const { error: scheduleInsertError } = await supabase.from('car_social_publications').insert({
      client_id: clientId,
      user_id: authUserId,
      caption,
      video_url: videoUrl,
      video_path: videoPath,
      selected_channels: channels,
      results: { scheduled_at: scheduledAt, audit: accountSnapshot },
      status: 'scheduled'
    });
    if (scheduleInsertError) return res.status(500).json({ error: scheduleInsertError.message });
    return res.status(200).json({ ok: true, scheduled: true, results: {} });
  }

  const results = await publishSocialChannelsWithRetries(channels, clientId, client, supabase, videoUrl, caption, accountSnapshot);

  const publishedCount = Object.values(results).filter((item: any) => item.status === 'published' || item.status === 'processing').length;
  const publicationStatus = publishedCount > 0 ? 'published' : 'failed';

  try {
    await supabase.from('car_social_publications').insert({
      client_id: clientId,
      user_id: authUserId,
      caption,
      video_url: videoUrl,
      video_path: videoPath,
      selected_channels: channels,
      results: { ...results, audit: accountSnapshot },
      status: publicationStatus,
      published_at: publishedCount > 0 ? new Date().toISOString() : null
    });
  } catch (insertErr) {
    console.error('[Social Publish] could not insert history. Did you run supabase_social_publisher.sql?', insertErr);
  }

  return res.status(200).json({ ok: publishedCount > 0, results });
}

async function handleSocialPublishDue(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Servidor no configurado.' });

  const authHeader = req.headers.authorization || '';
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sesión requerida' });

  const body = parseRequestBody(req.body);
  const clientId = String(body.clientId || '');
  if (!clientId || clientId === 'default') return res.status(400).json({ error: 'clientId requerido' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    await assertClientAccess(supabase, accessToken, clientId);
  } catch (err: any) {
    return res.status(isAuthSessionError(err) ? 401 : 403).json({ error: err?.message || 'Sin permisos' });
  }

  const { data: jobs, error } = await supabase
    .from('car_social_publications')
    .select('id, client_id, caption, video_url, video_path, selected_channels, results, created_at')
    .eq('client_id', clientId)
    .eq('status', 'scheduled')
    .order('created_at', { ascending: true })
    .limit(3);

  if (error) return res.status(500).json({ error: error.message });
  if (!jobs?.length) return res.status(200).json({ ok: true, processed: 0, jobs: [] });

  const processed: any[] = [];
  const dueJobs = jobs.filter((job: any) => {
    const scheduledAt = job.results?.scheduled_at;
    return scheduledAt && new Date(scheduledAt).getTime() <= Date.now();
  });

  if (!dueJobs.length) return res.status(200).json({ ok: true, processed: 0, jobs: [] });

  for (const job of dueJobs) {
    const previousResults = job.results && typeof job.results === 'object' ? job.results : {};
    try {
      await supabase
        .from('car_social_publications')
        .update({ status: 'processing', results: { ...previousResults, processing_at: new Date().toISOString() } })
        .eq('id', job.id)
        .eq('status', 'scheduled');

      const channels = Array.isArray(job.selected_channels)
        ? Array.from(new Set(job.selected_channels.filter((c: string) => ['instagram', 'facebook', 'tiktok', 'youtube'].includes(c)))) as SocialChannel[]
        : [];
      if (channels.length === 0) throw new Error('La publicación programada no tiene canales válidos.');
      if (!job.video_url || !/^https:\/\//i.test(job.video_url)) throw new Error('videoUrl público HTTPS requerido.');
      validateSocialVideoOwnership(clientId, job.video_url, job.video_path || null);

      const { data: client, error: clientError } = await supabase
        .from('car_clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client) throw new Error('Cliente no encontrado.');

      const accountSnapshot = buildSocialAccountSnapshot(clientId, client, channels);
      const changedAccounts = getChangedScheduledAccounts(previousResults?.audit, accountSnapshot, channels);
      if (changedAccounts.length > 0) {
        throw new Error(`La cuenta conectada cambió desde que se programó: ${changedAccounts.join(', ')}. Se bloqueó para evitar publicar en otra cuenta.`);
      }

      const results = await publishSocialChannelsWithRetries(channels, clientId, client, supabase, job.video_url, job.caption || '', accountSnapshot);
      const publishedCount = Object.values(results).filter((item: any) => item.status === 'published' || item.status === 'processing').length;
      const finalStatus = publishedCount > 0 ? 'published' : 'failed';

      await supabase
        .from('car_social_publications')
        .update({
          status: finalStatus,
          results: { ...results, audit: accountSnapshot, scheduled_at: job.results?.scheduled_at, processed_at: new Date().toISOString() },
          published_at: publishedCount > 0 ? new Date().toISOString() : null
        })
        .eq('id', job.id);
      processed.push({ id: job.id, status: finalStatus });
    } catch (err: any) {
      await supabase
        .from('car_social_publications')
        .update({
          status: 'failed',
          results: { ...previousResults, error: err?.message || 'Error al publicar programación.', processed_at: new Date().toISOString() }
        })
        .eq('id', job.id);
      processed.push({ id: job.id, status: 'failed', error: err?.message || 'Error al publicar programación.' });
    }
  }

  return res.status(200).json({ ok: true, processed: processed.length, jobs: processed });
}

async function handleSocialDraftCaption(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido. Use POST.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Servidor no configurado.' });

  const authHeader = req.headers.authorization || '';
  const bearer = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const accessToken = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sesión requerida' });

  const body = parseRequestBody(req.body);
  const clientId = String(body.clientId || '');
  const creativeDescription = String(body.creativeDescription || '');
  const videoFocus = String(body.videoFocus || '');
  const postGoal = String(body.postGoal || 'viral');
  const postTone = String(body.postTone || 'default');
  const productMode = String(body.productMode || 'none');
  const selectedProduct = body.selectedProduct as any;
  const selectedProducts = body.selectedProducts as any[] || [];

  if (!clientId || clientId === 'default') return res.status(400).json({ error: 'clientId requerido' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    await assertClientAccess(supabase, accessToken, clientId);
  } catch (err: any) {
    return res.status(isAuthSessionError(err) ? 401 : 403).json({ error: err?.message || 'Sin permisos' });
  }

  // 1. Fetch client details from database
  const { data: client, error } = await supabase
    .from('car_clients')
    .select('business_name, business_description, custom_instructions, scraped_content, website_url, instagram_context')
    .eq('id', clientId)
    .maybeSingle();

  if (error || !client) return res.status(404).json({ error: error?.message || 'Cliente no encontrado' });

  // 2. Fetch client links
  let linksStr = '';
  try {
    const { data: links } = await supabase.from('car_links').select('title, url').eq('client_id', clientId);
    if (links && links.length > 0) {
      linksStr = '\nEnlaces importantes que podés mencionar o incluir:\n' + links.map(l => `- ${l.title}: ${l.url}`).join('\n');
    }
  } catch {}

  // 3. Prepare AI variables
  const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
  if (!geminiKey) {
    return res.status(503).json({ error: 'Servicio de IA no configurado en el servidor (falta GEMINI_API_KEY).' });
  }

  // Parse custom instructions
  let toneInstructions = '', offersContext = '', faqContext = '';
  try {
    const ci = JSON.parse(client.custom_instructions || '{}');
    toneInstructions = ci.tone || '';
    offersContext = ci.offers || '';
    faqContext = ci.faq || '';
  } catch {
    toneInstructions = client.custom_instructions || '';
  }

  // Clean tone instructions for caption generation
  let cleanTone = toneInstructions || '';
  cleanTone = cleanTone
    .replace(/priorizar respuestas ágiles y breves\.?/gi, '')
    .replace(/respuestas ágiles y breves\.?/gi, '')
    .replace(/y\s*[\.,]*\s*$/i, '') // Remove trailing "y" with spaces and punctuation
    .trim();
  if (cleanTone.endsWith(',')) {
    cleanTone = cleanTone.slice(0, -1).trim();
  }
  if (cleanTone && !cleanTone.endsWith('.')) {
    cleanTone += '.';
  }
  toneInstructions = cleanTone;

  // Build product context
  let productContext = '';
  if (productMode === 'single' && selectedProduct) {
    productContext = `\nEste post promociona un producto específico del catálogo:
- Producto: ${selectedProduct.title}
- Precio: ${selectedProduct.price || '—'}
- Enlace directo de compra: ${selectedProduct.url || '—'}
(Si mencionás el producto, hacé referencia a sus detalles e incluí su link de compra de manera atractiva en la llamada a la acción).`;
  } else if (productMode === 'multiple') {
    const selectedProducts = body.selectedProducts || [];
    if (selectedProducts.length > 0) {
      productContext = `\nEste post promociona los siguientes productos específicos del catálogo:
${selectedProducts.map((p: any) => `- Producto: ${p.title} (${p.price || 'Precio a consultar'}) ${p.url ? `- Enlace: ${p.url}` : ''}`).join('\n')}
(Enfocá el copy en destacar estos productos, comparar sus beneficios de forma rápida, e invitar a conocerlos en la tienda).`;
    } else {
      productContext = `\nEste post muestra o menciona varios productos del catálogo general. Enfocá el copy en invitar a conocer toda la variedad disponible en la tienda.`;
    }
  }

  // Build goal instructions
  let goalInstructions = '';
  if (postGoal === 'viral') {
    goalInstructions = `El objetivo es alcance viral y engagement. Creá un gancho inicial sumamente intrépido o polémico en la primera línea. Usá humor, curiosidad o intriga. Invitá al usuario a guardar o compartir el video.`;
  } else if (postGoal === 'sales') {
    goalInstructions = `El objetivo es la conversión y venta directa. Destacá el beneficio principal del producto, apelá a la urgencia (ej: "compralo antes de que se agote", "envíos a todo el país") y sumá un CTA directo a comprar.`;
  } else if (postGoal === 'promo') {
    goalInstructions = `El objetivo es promocional. Enfocate en destacar ofertas, descuentos vigentes, envíos gratis u oportunidades limitadas de ahorro.`;
  } else if (postGoal === 'edu') {
    goalInstructions = `El objetivo es educativo y dar valor. Explicá cómo usar el producto, compartí un tutorial paso a paso o listá 3 beneficios prácticos. Transmití autoridad y conocimiento.`;
  } else if (postGoal === 'interactive') {
    goalInstructions = `El objetivo es generar comentarios y respuestas. Concluí con una pregunta abierta sumamente fácil y atractiva para que el usuario comente, o incentiva a participar (ej. comentando una palabra clave).`;
  }

  // Build tone instructions override
  let toneOverride = '';
  if (postTone === 'casual') {
    toneOverride = `Tono: Casual, cercano, fresco y divertido (como un amigo recomendándole algo a otro).`;
  } else if (postTone === 'energetic') {
    toneOverride = `Tono: Muy enérgico, motivador, entusiasta y vendedor.`;
  } else if (postTone === 'professional') {
    toneOverride = `Tono: Profesional, educado, claro y corporativo.`;
  } else if (postTone === 'direct') {
    toneOverride = `Tono: Directo al grano, limpio, minimalista, sin rodeos.`;
  } else if (postTone === 'storytelling') {
    toneOverride = `Tono/Estilo: Storytelling. Comenzá contando una anécdota, un caso o una historia identificable sobre el problema que resuelve el producto.`;
  } else {
    let cleanToneStr = toneInstructions || 'Natural y dinámico';
    cleanToneStr = cleanToneStr
      .replace(/priorizar respuestas ágiles y breves\.?/gi, '')
      .replace(/respuestas ágiles y breves\.?/gi, '')
      .replace(/y\s*[\.,]*\s*$/i, '')
      .trim();
    if (cleanToneStr.endsWith(',')) cleanToneStr = cleanToneStr.slice(0, -1).trim();
    if (cleanToneStr && !cleanToneStr.endsWith('.')) cleanToneStr += '.';
    toneOverride = `Tono: Basate en las instrucciones de tono predeterminadas de la marca: ${cleanToneStr}.`;
  }

  // Build Cerebro Context block
  const cerebroContext = [
    client.business_description && `DESCRIPCIÓN GENERAL:\n${client.business_description}`,
    client.scraped_content && `CONTENIDO WEB / CEREBRO:\n${client.scraped_content}`,
    client.instagram_context && `CONTEXTO DE REDES SOCIALES:\n${client.instagram_context}`,
    toneInstructions && `ESTILO / TONO VIGENTE:\n${toneInstructions}`,
    offersContext && `OFERTAS ACTIVAS:\n${offersContext}`,
    faqContext && `FAQ:\n${faqContext}`,
  ].filter(Boolean).join('\n\n---\n\n');

  // 4. Formulate System & User Prompt
  const systemPrompt = `Sos un experto en marketing digital, copywriting y redes sociales. Tu tarea es redactar un excelente pie de página ('caption' o 'copy') para publicar en redes sociales (Instagram, Facebook, TikTok o YouTube Shorts) para un negocio.
Este es un espacio de contenido profesional sobre cosmética, cuidado de la piel (skincare) y bienestar. Todo el vocabulario sobre "piel", "hidratación", "rostro", "cuerpo" y "cremas" es estrictamente de uso comercial y dermatológico.
El copy de redes sociales debe redactarse de principio a fin, completando la estructura de gancho, desarrollo del tema, llamado a la acción (CTA) y hashtags. Bajo ninguna circunstancia dejes la redacción a medias, cortada o incompleta.`;

  const userPrompt = `Escribí un copy enganchador, persuasivo y nativo de redes sociales para un creativo.

Detalles del creativo / video:
${creativeDescription ? `- ¿De qué trata el video?: ${creativeDescription}` : '— (No se especificó detalle de video, basate en el objetivo)'}
${videoFocus ? `- Cómo enfocar la publicación / video: ${videoFocus}` : ''}
${productContext}

Información del negocio (Cerebro de la marca):
- Nombre: ${client.business_name || 'Mi Negocio'}
- Sitio web: ${client.website_url || '—'}
${linksStr}

Contexto y conocimiento de la marca (Cerebro de la marca):
${cerebroContext || '— (No hay datos en el cerebro, basate en la descripción general)'}

Enfoque de redacción solicitado:
- Objetivo de la publicación: ${goalInstructions}
- Tono a emplear: ${toneOverride}

Instrucciones de formato y estilo:
1. El copy debe sonar totalmente humano, dinámico y adaptado al enfoque solicitado.
2. Usá saltos de línea para que sea fácil de leer (separando gancho, desarrollo y CTA).
3. Usá emojis de manera inteligente para destacar puntos clave, sin abusar.
4. Incluí llamados a la acción (CTA) claros dirigidos a entrar al enlace, enviar mensaje o visitar la tienda.
5. Colocá al final una sección de hashtags relevantes (entre 5 y 10).
6. Devolvé únicamente el texto del copy redactado, sin ningún comentario tuyo, ni comillas iniciales/finales, ni markdown adicional.
7. IMPORTANTE: Ignorá cualquier directiva del cerebro de la marca que solicite respuestas cortas, breves o rápidas. Este es un pie de foto (caption) completo y detallado para redes sociales. Debe ser persuasivo, enganchador y extenderse todo lo necesario para cumplir con el gancho, el desarrollo, el llamado a la acción (CTA) y los hashtags.`;

  const completionGuard = `\n\nIMPORTANTE: Devolvé el copy COMPLETO de principio a fin. No importa lo largo que sea, genera todo el texto del pie de foto con su respectivo CTA y hashtags al final sin cortarlo nunca.`;

  // Build Gemini parts
  const parts: any[] = [{ text: userPrompt + completionGuard }];

  const geminiBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
    ]
  };

  let caption = '';
  const attempts: { model: string; error?: string; status?: number }[] = [];

  const openAiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '';

  // 1. Try OpenAI GPT-4o-mini (fast, cheap and excellent at copywriting) if configured
  if (openAiKey) {
    const model = 'gpt-4o-mini';
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt + completionGuard }
          ],
          temperature: 0.7,
          max_tokens: 2048
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = normalizeDraftText(data.choices?.[0]?.message?.content || '');
        if (text && !isProbablyTruncated(text)) {
          caption = text;
        } else if (text) {
          // Retry 1: Rewrite complete copy using gpt-4o-mini
          console.log(`[social-draft-caption] GPT output truncated. Running completion retry...`);
          const retryRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `${userPrompt}${completionGuard}\n\nEl copy anterior quedó incompleto o cortado: "${text}". Por favor, reescribí el copy COMPLETO DESDE EL INICIO (volviendo a incluir el gancho inicial, desarrollo, llamados a la acción y hashtags al final). debés entregar el pie de foto completo de principio a fin.` }
              ],
              temperature: 0.5,
              max_tokens: 2048
            })
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            const retryText = normalizeDraftText(retryData.choices?.[0]?.message?.content || '');
            if (retryText) {
              caption = retryText;
            }
          }
        }
      } else {
        attempts.push({ model, status: res.status, error: 'OpenAI HTTP error' });
      }
    } catch (e: any) {
      attempts.push({ model, error: e?.message || String(e) });
    }
  }

  // 2. Fallback to Gemini 2.5 Pro (smart, detailed, rich copy) if OpenAI is not set or failed
  if (!caption) {
    const model = 'gemini-2.5-pro';
    console.log(`[social-draft-caption] Falling back to Gemini 2.5 Pro for rich and complete copy...`);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody)
        }
      );

      if (res.ok) {
        const data = await res.json() as any;
        const parts = data.candidates?.[0]?.content?.parts || [];
        const finishReason = data.candidates?.[0]?.finishReason;
        const text = normalizeDraftText(parts.map((p: any) => p.text).filter(Boolean).join(''));
        
        if (text && finishReason !== 'MAX_TOKENS' && !isProbablyTruncated(text)) {
          caption = text;
        } else if (text) {
          // Retry 1: Request rewriting complete copy from start using Pro
          console.log(`[social-draft-caption] Pro output truncated. Running completion retry...`);
          const retryBody = {
            ...geminiBody,
            contents: [{ role: 'user', parts: [{ text: `${userPrompt}${completionGuard}\n\nEl copy anterior quedó incompleto o cortado: "${text}". Por favor, reescribí el copy COMPLETO DESDE EL INICIO (volviendo a incluir el gancho inicial, desarrollo, llamados a la acción y hashtags al final). debés entregar el pie de foto completo de principio a fin.` }] }],
            generationConfig: { ...geminiBody.generationConfig, temperature: 0.5 }
          };
          
          try {
            const retryRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(retryBody)
              }
            );
            if (retryRes.ok) {
              const retryData = await retryRes.json() as any;
              const retryParts = retryData.candidates?.[0]?.content?.parts || [];
              const retryText = normalizeDraftText(retryParts.map((p: any) => p.text).filter(Boolean).join(''));
              if (retryText && !isProbablyTruncated(retryText)) {
                caption = retryText;
              } else if (retryText) {
                // Retry 2: Concise fallback using Pro
                console.log(`[social-draft-caption] Pro retry truncated. Running concise fallback...`);
                const backupBody = {
                  ...geminiBody,
                  contents: [{ role: 'user', parts: [{ text: `${userPrompt}\n\nIMPORTANTE: El copy anterior se cortó. Por favor, generá una versión del copy que sea un poco más concisa pero 100% COMPLETA de principio a fin. Asegurá que empiece con el gancho, describa el producto, incluya el llamado a la acción (CTA) y finalice con los hashtags, cerrando la última frase de forma limpia con un punto o emoji.` }] }],
                  generationConfig: { temperature: 0.4, maxOutputTokens: 1536 }
                };
                const backupRes = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(backupBody)
                  }
                );
                if (backupRes.ok) {
                  const backupData = await backupRes.json() as any;
                  const backupParts = backupData.candidates?.[0]?.content?.parts || [];
                  const backupText = normalizeDraftText(backupParts.map((p: any) => p.text).filter(Boolean).join(''));
                  if (backupText) {
                    caption = backupText;
                  }
                }
              }
            }
          } catch (retryErr) {
            console.error(`[social-draft-caption] Pro retry exception:`, retryErr);
          }
          
          if (!caption) {
            caption = text; // Fallback to first attempt if retries failed
          }
        }
      } else {
        attempts.push({ model, status: res.status, error: 'Fallo HTTP al llamar a Pro.' });
      }
    } catch (e: any) {
      attempts.push({ model, error: e?.message || String(e) });
    }
  }

  // 3. Last resort fallback to Gemini 2.5 Flash if Gemini Pro fails
  if (!caption) {
    const model = 'gemini-2.5-flash';
    console.log(`[social-draft-caption] Pro failed, falling back to Flash...`);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody)
        }
      );
      if (res.ok) {
        const data = await res.json() as any;
        const parts = data.candidates?.[0]?.content?.parts || [];
        caption = normalizeDraftText(parts.map((p: any) => p.text).filter(Boolean).join(''));
      }
    } catch (e: any) {
      attempts.push({ model, error: e?.message || String(e) });
    }
  }

  if (!caption) {
    const detailStr = attempts.map(a => `${a.model}: ${a.status ? `HTTP ${a.status} ` : ''}${a.error || ''}`).join(' | ');
    return res.status(502).json({ error: `No se pudo generar el caption usando la IA. Detalle: ${detailStr}` });
  }

  // Clean caption
  caption = caption.trim().replace(/^["']|["']$/g, '');

  return res.status(200).json({ caption });
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action as string || '';

  if (action === 'social-publish') return handleSocialPublish(req, res);
  if (action === 'social-publish-due') return handleSocialPublishDue(req, res);
  if (action === 'social-draft-caption') return handleSocialDraftCaption(req, res);
  if (action === 'whatsapp-test') return handleWhatsappTest(req, res);
  if (action.startsWith('costs-')) return handleCosts(req, res);
  if (action === 'brain-save') return handleBrainSave(req, res);

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
  if (!action && req.url?.includes('/api/tiktok-content-callback')) {
    (req.query as any).action = 'tiktok-content-callback';
    return handleTiktokContent(req, res);
  }

  if (action === 'tiendanube-webhook') return handleTiendanubeWebhook(req, res);
  if (action === 'shopify-webhook') return handleShopifyWebhook(req, res);
  if (action === 'chatwoot-register') return handleChatwootRegister(req, res);
  if (action === 'chatwoot-login') return handleChatwootLogin(req, res);

  if (action.startsWith('tiktok-content')) return handleTiktokContent(req, res);
  if (action.startsWith('tiktok')) return handleTiktok(req, res);
  if (action.startsWith('youtube')) return handleYoutube(req, res);
  if (action.startsWith('mercadolibre')) return handleMercadoLibre(req, res);
  if (action.startsWith('shopify')) return handleShopify(req, res);
  if (action.startsWith('tiendanube')) return handleTiendanube(req, res);
  if (action.startsWith('woocommerce')) return handleWooCommerce(req, res);
  if (action === 'meta-accounts') return handleMetaAccounts(req, res);
  if (action === 'meta-pages') return handleMetaPages(req, res);
  if (action === 'meta-save-selection') return handleMetaSaveSelection(req, res);
  if (action === 'meta-disconnect') return handleMetaDisconnect(req, res);

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
