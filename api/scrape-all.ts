import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44";

const supabase = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null as any;

const getFirstEnv = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
};

function normalizeCreativeAnalysis(raw: any) {
  const attentionPct = Number(raw?.attentionPct ?? raw?.attention_pct ?? raw?.attention ?? raw?.retention ?? 0);
  const emotionPct = Number(raw?.emotionPct ?? raw?.emotion_pct ?? raw?.emotion ?? raw?.impact ?? 0);
  const cogLoad = Number(raw?.cogLoad ?? raw?.cog_load ?? raw?.cognitive_load ?? raw?.cognitiveLoad ?? 0);
  return {
    attentionPct: Math.max(0, Math.min(99, Math.round(Number.isFinite(attentionPct) ? attentionPct : 0))),
    attentionReason: String(raw?.attentionReason ?? raw?.attention_reason ?? raw?.attentionInsight ?? raw?.textInsight ?? 'Estimado con TRIBE v2.'),
    emotionPct: Math.max(0, Math.min(99, Math.round(Number.isFinite(emotionPct) ? emotionPct : 0))),
    emotionReason: String(raw?.emotionReason ?? raw?.emotion_reason ?? raw?.emotionInsight ?? raw?.textInsight ?? 'Estimado con TRIBE v2.'),
    cogLoad: Math.max(0, Math.min(99, Math.round(Number.isFinite(cogLoad) ? cogLoad : 0))),
    cogLoadReason: String(raw?.cogLoadReason ?? raw?.cog_load_reason ?? raw?.cognitiveLoadReason ?? 'Estimado con TRIBE v2.'),
    highestRegion: String(raw?.highestRegion ?? raw?.highest_region ?? raw?.region ?? raw?.topRegion ?? 'V1'),
    textInsight: String(raw?.textInsight ?? raw?.text_insight ?? raw?.summary ?? 'Análisis generado con TRIBE v2.'),
    actionItems: Array.isArray(raw?.actionItems ?? raw?.action_items)
      ? (raw.actionItems ?? raw.action_items).slice(0, 4).map((item: any) => String(item))
      : [],
    provider: raw?.provider ?? 'ai-vision',
  };
}

async function callTribeV2Service(input: { frames: string[]; imageUrl?: string; isVideo?: boolean }) {
  const serviceUrl = getFirstEnv('TRIBE_V2_API_URL', 'TRIBEV2_API_URL');
  if (!serviceUrl) return null;

  const secret = getFirstEnv('TRIBE_V2_API_KEY', 'TRIBEV2_API_KEY');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers.Authorization = `Bearer ${secret}`;

  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'analyze-creative',
      source: 'car-saas',
      frames: input.frames,
      imageUrl: input.imageUrl,
      isVideo: !!input.isVideo,
    }),
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { text };
  }

  if (!response.ok) {
    throw new Error(data?.detail || data?.error || `TRIBE v2 service failed (${response.status})`);
  }

  return normalizeCreativeAnalysis({ ...data, provider: data?.provider || 'tribev2' });
}

function cleanHtml(html: string): string {
  let text = html;
  // Remove non-content sections
  text = text.replace(/<head[\s\S]*?<\/head>/gi, '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<aside[\s\S]*?<\/aside>/gi, '');
  // Remove elements with style="display: none" or similar hidden attributes
  text = text.replace(/<([a-z0-9]+)[^>]*style=["'][^"']*(display:\s*none|visibility:\s*hidden)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi, '');
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  text = text.replace(/&#36;/g, '$').replace(/&#038;/g, '&').replace(/&amp;/g, '&')
             .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ');
  // Collapse whitespace and remove repeated short phrases (navigation repetition)
  text = text.replace(/\s+/g, ' ').trim();
  // Remove obviously repeated navigation text (same phrase 3+ times)
  const lines = text.split(/\s{2,}/);
  const seen = new Map<string, number>();
  const filtered = lines.filter(line => {
    const key = line.trim().slice(0, 50);
    if (key.length < 10) return false;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    return count <= 1;
  });
  return filtered.join(' ').trim().slice(0, 12000);
}

// File extensions and paths to skip when extracting links
const SKIP_EXTENSIONS = /\.(css|js|jpg|jpeg|png|gif|svg|webp|ico|woff|woff2|ttf|eot|pdf|zip|xml|json|map)$/i;
const SKIP_PATHS = /\/(wp-content|wp-includes|wp-json|wp-admin|feed|tag|author|page\/\d+|cart|checkout|mi-cuenta|my-account|wishlist|compare|carrito)\//i;
const SKIP_PRODUCT_PAGES = /\/(product|producto|shop\/|tienda\/|categoria-producto|product-category|collections\/|collection\/).+/i;

function normalizeOrder(o: any, platform: string) {
  if (platform === 'shopify') {
    // Parse string numeric fields so .toLocaleString() and arithmetic work correctly
    return {
      ...o,
      total_price: parseFloat(o.total_price || 0),
      subtotal_price: parseFloat(o.subtotal_price || 0),
      total_tax: parseFloat(o.total_tax || 0),
      total_discounts: parseFloat(o.total_discounts || 0),
      line_items: (o.line_items || []).map((it: any) => ({
        ...it,
        price: parseFloat(it.price || 0),
      })),
      shipping_lines: (o.shipping_lines || []).map((sl: any) => ({
        ...sl,
        price: parseFloat(sl.price || 0),
      })),
      discount_codes: (o.discount_codes || []).map((dc: any) => ({
        ...dc,
        amount: parseFloat(dc.amount || 0),
      })),
    };
  }
  if (platform === 'tiendanube') {
    const isCancelled = o.status === 'cancelled';
    const financial_status = o.payment_status === 'paid' ? 'paid' : o.payment_status === 'pending' ? 'pending' : 'pending';
    const fulfillment_status = o.shipping_status === 'shipped' ? 'fulfilled' : 'unfulfilled';
    return {
      id: o.id,
      order_number: `#${o.number}`,
      created_at: o.created_at,
      cancelled_at: isCancelled ? o.updated_at || new Date().toISOString() : null,
      total_price: parseFloat(o.total || 0),
      subtotal_price: parseFloat(o.subtotal || 0),
      total_discounts: parseFloat(o.discount || 0),
      total_tax: parseFloat(o.tax || 0),
      financial_status,
      fulfillment_status,
      customer_name: o.customer ? `${o.customer.name || ''}`.trim() : 'Sin Cliente',
      email: o.customer?.email || null,
      phone: o.customer?.phone || null,
      line_items: (o.line_items || []).map((it: any) => ({
        product_id: it.product_id,
        variant_id: it.variant_id || it.product_id,
        title: it.name,
        quantity: it.quantity,
        price: parseFloat(it.price || 0),
        variant_title: it.variant_values ? it.variant_values.map((vv: any) => vv.es || vv.en || Object.values(vv || {})[0] || '').filter(Boolean).join(' / ') : null,
        _wc_image: it.image?.src || null
      })),
      shipping_address: o.shipping_address ? {
        name: o.shipping_address.name,
        address1: o.shipping_address.address,
        city: o.shipping_address.city,
        province: o.shipping_address.province,
        zip: o.shipping_address.zipcode,
        country: o.shipping_address.country
      } : null,
      customer: o.customer ? {
        first_name: o.customer.name?.split(' ')[0] || '',
        last_name: o.customer.name?.split(' ').slice(1).join(' ') || '',
        email: o.customer.email,
        phone: o.customer.phone,
        orders_count: 1,
        total_spent: parseFloat(o.total || 0)
      } : null
    };
  }
  if (platform === 'wordpress') {
    const isCancelled = ['cancelled', 'failed'].includes(o.status);
    const financial_status = o.status === 'completed' || o.status === 'processing' ? 'paid' : o.status === 'refunded' ? 'refunded' : 'pending';
    const fulfillment_status = o.status === 'completed' ? 'fulfilled' : 'unfulfilled';
    return {
      id: o.id,
      order_number: `#${o.number}`,
      created_at: o.date_created,
      cancelled_at: isCancelled ? o.date_modified || new Date().toISOString() : null,
      total_price: parseFloat(o.total || 0),
      subtotal_price: parseFloat(o.total || 0) - parseFloat(o.shipping_total || 0),
      total_discounts: parseFloat(o.discount_total || 0),
      total_tax: parseFloat(o.total_tax || 0),
      financial_status,
      fulfillment_status,
      customer_name: o.billing ? `${o.billing.first_name || ''} ${o.billing.last_name || ''}`.trim() : 'Sin Cliente',
      email: o.billing?.email || null,
      phone: o.billing?.phone || null,
      line_items: (o.line_items || []).map((it: any) => {
        // For variable products, WooCommerce sometimes appends variation info to the name.
        // Strip it to get the parent product name for topProducts grouping.
        const hasVariation = it.variation_id && it.variation_id > 0;
        const cleanName = hasVariation
          ? (it.name || '').split(' – ')[0].split(' - ')[0].trim()
          : (it.name || '');
        return {
          product_id: it.product_id,
          variant_id: it.variation_id || it.product_id,
          title: it.name,
          product_name: cleanName, // parent product name (no variation suffix)
          quantity: it.quantity,
          price: parseFloat(it.price || 0),
          variant_title: it.meta_data?.filter((m: any) => m.display_key && !m.display_key.startsWith('_')).map((m: any) => m.display_value).join(' / ') || null,
          _wc_image: it.image?.src || null
        };
      }),
      shipping_address: o.shipping ? {
        name: `${o.shipping.first_name || ''} ${o.shipping.last_name || ''}`.trim(),
        address1: o.shipping.address_1,
        city: o.shipping.city,
        province: o.shipping.state,
        zip: o.shipping.postcode,
        country: o.shipping.country
      } : null,
      customer: o.billing ? {
        first_name: o.billing.first_name,
        last_name: o.billing.last_name,
        email: o.billing.email,
        phone: o.billing.phone,
        orders_count: 1,
        total_spent: parseFloat(o.total || 0)
      } : null
    };
  }
  return o;
}

function extractInternalLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;

  let baseDomain = '';
  try {
    baseDomain = baseUrl.replace(/^https?:\/\//i, '').split('/')[0];
  } catch (e) {
    return [];
  }

  while ((match = regex.exec(html)) !== null) {
    let href = match[1].trim();
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      continue;
    }
    if (href.startsWith('/')) {
      href = `${baseUrl.replace(/\/$/, '')}${href}`;
    }
    const isInternal = href.includes(baseDomain) || !/^https?:\/\//i.test(href);
    if (isInternal) {
      if (!/^https?:\/\//i.test(href)) {
        href = `${baseUrl.replace(/\/$/, '')}/${href.replace(/^\//, '')}`;
      }
      href = href.split('?')[0].split('#')[0];
      // Skip static files, WordPress internals, and product/category pages
      const path = href.replace(/^https?:\/\/[^/]+/, '');
      if (SKIP_EXTENSIONS.test(href)) continue;
      if (SKIP_PATHS.test(path)) continue;
      if (SKIP_PRODUCT_PAGES.test(path)) continue;
      if (!links.includes(href) && href !== baseUrl && href !== `${baseUrl}/` && href.startsWith('http')) {
        links.push(href);
      }
    }
  }
  return links;
}

function prioritizeLinks(links: string[]): string[] {
  // Only high-priority informational pages — no product/catalog pages
  const highPriority = [
    /faq/i, /pregunta/i, /ayuda/i, /soporte/i, /help/i, /question/i,
    /nosotros/i, /about/i, /quienes/i, /contacto/i, /contact/i,
    /envio/i, /shipping/i, /entrega/i, /delivery/i,
    /devoluc/i, /refund/i, /cambio/i, /retorn/i, /return/i,
    /garantia/i, /warranty/i,
    /politic/i, /terms/i, /condicion/i, /aviso/i, /legal/i,
    /pago/i, /payment/i, /cuotas/i, /financ/i,
  ];
  const high = links.filter(link => highPriority.some(r => r.test(link)));
  return [...new Set(high)].slice(0, 12);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── CREATIVE ANALYSIS — no auth required (landing page + app users) ─────────
  const { type: earlyType, frames: earlyFrames, imageUrl: earlyImageUrl, isVideo: earlyIsVideo } = req.body as any;
  if (earlyType === 'analyze-creative') {
    const frames: string[] = Array.isArray(earlyFrames) ? earlyFrames.filter(Boolean) : [];
    if (frames.length === 0 && earlyImageUrl) {
      try {
        const url = new URL(String(earlyImageUrl));
        if (!['http:', 'https:'].includes(url.protocol)) {
          return res.status(400).json({ error: 'Invalid image URL' });
        }
        const imgRes = await fetch(url.toString(), {
          headers: { 'User-Agent': 'AlgoritmiaCreativeAnalyzer/1.0' },
        });
        if (!imgRes.ok) return res.status(400).json({ error: 'No se pudo descargar el creativo para analizar.' });
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const arr = await imgRes.arrayBuffer();
        if (arr.byteLength > 8 * 1024 * 1024) {
          return res.status(413).json({ error: 'El creativo es demasiado pesado para analizar.' });
        }
        const b64 = Buffer.from(arr).toString('base64');
        frames.push(`data:${contentType};base64,${b64}`);
      } catch {
        return res.status(400).json({ error: 'No se pudo preparar el creativo para analizar.' });
      }
    }
    if (frames.length === 0) return res.status(400).json({ error: 'No frames provided' });

    try {
      const tribeResult = await callTribeV2Service({
        frames,
        imageUrl: earlyImageUrl,
        isVideo: !!earlyIsVideo,
      });
      if (!tribeResult) {
        return res.status(503).json({
          error: 'TRIBE v2 no está configurado',
          detail: 'Configurá TRIBE_V2_API_URL para analizar creativos. No se usan Gemini, ChatGPT ni fallback de IA.',
        });
      }
      return res.status(200).json(tribeResult);
    } catch (err: any) {
      console.warn('TRIBE v2 analysis failed:', err?.message || err);
      return res.status(502).json({
        error: 'TRIBE v2 no pudo analizar el creativo',
        detail: err?.message || 'Revisá que el servicio TRIBE v2 esté activo y accesible desde TRIBE_V2_API_URL.',
      });
    }
  }

  // 1. Authenticate (check cron bypass first, then user session)
  const authHeader = req.headers.authorization;
  const isCron = (authHeader && authHeader === `Bearer ${process.env.CRON_SECRET}`) || req.headers['x-vercel-cron'] === '1';

  let isAdmin = false;
  let userClientId: string | null = null;

  if (!isCron) {
    if (!authHeader || !authHeader.trim().toLowerCase().startsWith('bearer')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const parts = authHeader.split(' ');
    const token = parts.length > 1 ? parts[1] : '';
    if (!token) {
      return res.status(401).json({ error: 'Empty token in Authorization header' });
    }

    let user: any = null;
    let dbProfile: any = null;
    try {
      const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: authData, error: authError } = await authSupabase.auth.getUser(token);
      if (authError || !authData?.user) {
        const tokenPreview = token ? `${token.substring(0, 10)}...${token.substring(Math.max(0, token.length - 10))}` : 'empty';
        const errMsg = `Invalid auth token: ${authError?.message || 'No user data'} (len: ${token ? token.length : 0}, preview: ${tokenPreview})`;
        console.error('getUser failed:', authError, 'token:', tokenPreview);
        return res.status(401).json({ error: errMsg });
      }
      user = authData.user;

      // Fetch client profile (direct owner or mapped business account)
      const { data: ownerProfile } = await supabase
        .from('car_clients')
        .select('id, is_admin')
        .eq('user_id', user.id)
        .maybeSingle();

      if (ownerProfile) {
        dbProfile = ownerProfile;
      } else {
        const { data: link } = await supabase
          .from('car_business_accounts')
          .select('business_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (link?.business_id) {
          const { data: biz } = await supabase
            .from('car_clients')
            .select('id, is_admin')
            .eq('id', link.business_id)
            .maybeSingle();
          if (biz) {
            dbProfile = biz;
          }
        }
      }
    } catch (err: any) {
      console.error('Server auth error in api/scrape-all:', err);
      return res.status(500).json({ error: 'Auth check failed' });
    }

    if (!dbProfile) {
      // Auto-create profile for valid authenticated users who don't have one yet
      // (handles race conditions during sign-up and direct Shopify App Store installs)
      const email = user.email || '';
      await supabase
        .from('car_clients')
        .insert({ user_id: user.id, business_name: email.split('@')[0] || 'Mi negocio' })
        .select('id')
        .maybeSingle();
      const { data: retryProfile } = await supabase
        .from('car_clients')
        .select('id, is_admin')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!retryProfile) {
        return res.status(403).json({ error: 'Access denied: Profile not found' });
      }
      dbProfile = retryProfile;
    }

    isAdmin = !!dbProfile.is_admin;
    userClientId = dbProfile.id;
  }

  const openAiKey = process.env.OPENAI_API_KEY;


  const { clientId, url, action, type, platform, shopify_domain, shopify_access_token, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token, frames, isVideo } = req.body as any;

  if (!isCron && type !== 'analyze-creative') {
    if (!clientId) {
      return res.status(400).json({ error: 'Missing clientId' });
    }
    if (!isAdmin && clientId !== userClientId) {
      return res.status(403).json({ error: 'Access denied: client mismatch' });
    }
  }

  // ── PRODUCT ANALYSIS — SAVE TO DB ────────────────────────────────────────
  if (type === 'save-analysis') {
    const { data: analysisData } = req.body as any;
    if (!clientId || !analysisData) return res.status(400).json({ error: 'Missing clientId or data' });
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('car_product_analysis')
        .upsert(
          { client_id: clientId, data: analysisData, calculated_at: now, updated_at: now },
          { onConflict: 'client_id' }
        );
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ saved: true, calculated_at: now });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRODUCT ANALYSIS — LOAD FROM DB ──────────────────────────────────────
  if (type === 'load-analysis') {
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    try {
      const { data, error } = await supabase
        .from('car_product_analysis')
        .select('data, calculated_at')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(200).json({ found: false });
      return res.status(200).json({
        found: true,
        results: (data as any).data || [],
        calculated_at: (data as any).calculated_at,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRODUCT ANALYSIS — RUN/CALCULATE ─────────────────────────────────────
  if (type === 'run-analysis') {
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    try {
      let active_platform = platform;
      let active_shopify_domain = shopify_domain;
      let active_shopify_access_token = shopify_access_token;
      let active_wordpress_url = wordpress_url;
      let active_woo_consumer_key = woo_consumer_key;
      let active_woo_consumer_secret = woo_consumer_secret;
      let active_tiendanube_store_id = tiendanube_store_id;
      let active_tiendanube_access_token = tiendanube_access_token;

      const { data: cl } = await supabase
        .from('car_clients')
        .select('ecommerce_platform, shopify_domain, shopify_access_token, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token')
        .eq('id', clientId)
        .maybeSingle();
      if (cl) {
        if (!active_platform) active_platform = cl.ecommerce_platform;
        if (!active_shopify_domain) active_shopify_domain = cl.shopify_domain;
        if (!active_shopify_access_token) active_shopify_access_token = cl.shopify_access_token;
        if (!active_wordpress_url) active_wordpress_url = cl.wordpress_url;
        if (!active_woo_consumer_key) active_woo_consumer_key = cl.woo_consumer_key;
        if (!active_woo_consumer_secret) active_woo_consumer_secret = cl.woo_consumer_secret;
        if (!active_tiendanube_store_id) active_tiendanube_store_id = cl.tiendanube_store_id;
        if (!active_tiendanube_access_token) active_tiendanube_access_token = cl.tiendanube_access_token;
      }

      if (!active_platform) return res.status(400).json({ error: 'Plataforma no configurada para este cliente' });

      // 2 years range
      const since = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const until = new Date().toISOString().split('T')[0];
      const sinceIso = new Date(`${since}T00:00:00-03:00`).toISOString();
      const untilIso = new Date(`${until}T23:59:59-03:00`).toISOString();

      let rawOrders: any[] = [];

      if (active_platform === 'shopify') {
        const domain = (active_shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (!domain || !active_shopify_access_token) return res.status(400).json({ error: 'Shopify no configurado' });
        
        let nextUrl: string | null = `https://${domain}/admin/api/2026-01/orders.json?status=any&created_at_min=${sinceIso}&created_at_max=${untilIso}&limit=250`;
        let pagesCount = 0;
        while (nextUrl && pagesCount++ < 15) {
          const sRes: Response = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': active_shopify_access_token } });
          if (!sRes.ok) break;
          const sData: any = await sRes.json();
          rawOrders = rawOrders.concat(sData.orders || []);
          const lh = sRes.headers.get('link') || '';
          const nm = lh.match(/<([^>]+)>;\s*rel="next"/);
          nextUrl = nm ? nm[1] : null;
        }
      } 
      else if (active_platform === 'wordpress') {
        const base = (active_wordpress_url || '').replace(/\/$/, '');
        if (!base || !active_woo_consumer_key || !active_woo_consumer_secret) return res.status(400).json({ error: 'WooCommerce no configurado' });
        const creds = Buffer.from(`${active_woo_consumer_key}:${active_woo_consumer_secret}`).toString('base64');
        
        let page = 1;
        while (page <= 30) {
          const wRes = await fetch(`${base}/wp-json/wc/v3/orders?after=${sinceIso}&before=${untilIso}&per_page=100&page=${page}`, {
            headers: { Authorization: `Basic ${creds}` }
          });
          if (!wRes.ok) break;
          const wData = await wRes.json();
          if (!Array.isArray(wData) || wData.length === 0) break;
          rawOrders = rawOrders.concat(wData);
          if (wData.length < 100) break;
          page++;
        }
      } 
      else if (active_platform === 'tiendanube') {
        if (!active_tiendanube_store_id || !active_tiendanube_access_token) return res.status(400).json({ error: 'Tiendanube no configurado' });
        
        let page = 1;
        while (page <= 15) {
          const tRes = await fetch(`https://api.tiendanube.com/v1/${active_tiendanube_store_id}/orders?created_at_min=${sinceIso}&created_at_max=${untilIso}&per_page=200&page=${page}`, {
            headers: { Authentication: `bearer ${active_tiendanube_access_token}`, 'User-Agent': 'AlgorBot/1.0' }
          });
          if (!tRes.ok) break;
          const tData = await tRes.json();
          if (!Array.isArray(tData) || tData.length === 0) break;
          rawOrders = rawOrders.concat(tData);
          if (tData.length < 200) break;
          page++;
        }
      }

      const orders: any[] = rawOrders.map(o => normalizeOrder(o, active_platform));
      const byCustomer = new Map<string, any[]>();
      for (const o of orders) {
        if (o.cancelled_at) continue;
        if (!['paid', 'partially_refunded', 'pending', 'authorized'].includes(o.financial_status)) continue;
        if (!o.line_items?.length) continue;
        const email = (o.email || '').toLowerCase().trim();
        if (!email) continue;
        const date = new Date(o.created_at);
        const items = (o.line_items || []).map((it: any) => ({ name: it.title, price: parseFloat(it.price || 0), qty: it.quantity }));
        if (!byCustomer.has(email)) byCustomer.set(email, []);
        byCustomer.get(email)!.push({ email, date, id: String(o.id), items });
      }
      for (const [, list] of byCustomer) list.sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

      const paidWithEmail: any[] = [];
      for (const [, list] of byCustomer) paidWithEmail.push(...list);

      const productNames = new Set<string>();
      for (const o of paidWithEmail) for (const it of o.items) if (it.name) productNames.add(it.name);

      const results: any[] = [];
      for (const pName of productNames) {
        const ordersWithP = paidWithEmail.filter(o => o.items.some((it: any) => it.name === pName));
        if (ordersWithP.length < 2) continue;

        const firstOrdersWithP = ordersWithP.filter(o => byCustomer.get(o.email)?.[0]?.id === o.id);
        const entryPointPct = Math.round((firstOrdersWithP.length / ordersWithP.length) * 100);

        const customersFirstP = [...new Set(firstOrdersWithP.map(o => o.email))];
        const customersReturned = customersFirstP.filter(e => (byCustomer.get(e)?.length ?? 0) >= 2);
        const secondPurchasePct = customersFirstP.length > 0 ? Math.round((customersReturned.length / customersFirstP.length) * 100) : 0;

        let repurchaseDays = 0;
        if (customersReturned.length > 0) {
          const gaps = customersReturned.map(e => {
            const list = byCustomer.get(e)!;
            return (list[1].date.getTime() - list[0].date.getTime()) / 86400000;
          }).filter(d => d >= 0);
          if (gaps.length > 0) repurchaseDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
        }

        const crossSellCounts = new Map<string, number>();
        for (const email of customersFirstP) {
          const allOrds = byCustomer.get(email) || [];
          for (let i = 1; i < allOrds.length; i++)
            for (const it of allOrds[i].items)
              if (it.name !== pName) crossSellCounts.set(it.name, (crossSellCounts.get(it.name) || 0) + 1);
        }
        const crossSell = [...crossSellCounts.entries()]
          .sort((a, b) => b[1] - a[1]).slice(0, 2)
          .map(([name, count]) => ({ name, count, pct: Math.round(count / Math.max(customersFirstP.length, 1) * 100) }));

        const allItemPrices = ordersWithP.flatMap(o => o.items.filter((it: any) => it.name === pName).map((it: any) => it.price));
        const avgPrice = allItemPrices.length > 0 ? allItemPrices.reduce((a: number, b: number) => a + b, 0) / allItemPrices.length : 0;
        const combinedAOV = ordersWithP.reduce((s: number, o: any) => s + o.items.reduce((ss: number, it: any) => ss + it.price * it.qty, 0), 0) / Math.max(ordersWithP.length, 1);

        results.push({ name: pName, totalOrders: ordersWithP.length, firstPurchases: firstOrdersWithP.length, entryPointPct, secondPurchasePct, repurchaseDays, avgPrice, combinedAOV, crossSell });
      }

      results.sort((a: any, b: any) => b.totalOrders - a.totalOrders);

      // Save to database
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('car_product_analysis')
        .upsert(
          { client_id: clientId, data: results, calculated_at: now, updated_at: now },
          { onConflict: 'client_id' }
        );
      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({
        found: true,
        results,
        calculated_at: now,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRODUCTS PROXY (merged from api/products.ts to stay under 12 function limit) ──
  if (type === 'products') {
    try {
      let active_platform = platform;
      let active_shopify_domain = shopify_domain;
      let active_shopify_access_token = shopify_access_token;
      let active_wordpress_url = wordpress_url;
      let active_woo_consumer_key = woo_consumer_key;
      let active_woo_consumer_secret = woo_consumer_secret;
      let active_tiendanube_store_id = tiendanube_store_id;
      let active_tiendanube_access_token = tiendanube_access_token;

      if (clientId && (!active_platform || 
          (active_platform === 'shopify' && (!active_shopify_domain || !active_shopify_access_token)) ||
          (active_platform === 'wordpress' && (!active_wordpress_url || !active_woo_consumer_key || !active_woo_consumer_secret)) ||
          (active_platform === 'tiendanube' && (!active_tiendanube_store_id || !active_tiendanube_access_token))
      )) {
        const { data: cl } = await supabase
          .from('car_clients')
          .select('ecommerce_platform, shopify_domain, shopify_access_token, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token')
          .eq('id', clientId)
          .maybeSingle();
        if (cl) {
          if (!active_platform) active_platform = cl.ecommerce_platform;
          if (!active_shopify_domain) active_shopify_domain = cl.shopify_domain;
          if (!active_shopify_access_token) active_shopify_access_token = cl.shopify_access_token;
          if (!active_wordpress_url) active_wordpress_url = cl.wordpress_url;
          if (!active_woo_consumer_key) active_woo_consumer_key = cl.woo_consumer_key;
          if (!active_woo_consumer_secret) active_woo_consumer_secret = cl.woo_consumer_secret;
          if (!active_tiendanube_store_id) active_tiendanube_store_id = cl.tiendanube_store_id;
          if (!active_tiendanube_access_token) active_tiendanube_access_token = cl.tiendanube_access_token;
        }
      }

      if (!active_platform) return res.status(400).json({ error: 'Plataforma no configurada para este cliente' });

      let products: any[] = [];
      if (active_platform === 'shopify') {
        const domain = (active_shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (!domain || !active_shopify_access_token) return res.status(400).json({ error: 'Shopify no configurado' });
        const r = await fetch(`https://${domain}/admin/api/2026-01/products.json?limit=250&fields=id,title,body_html,handle,status,variants,images,product_type,tags`, {
          headers: { 'X-Shopify-Access-Token': active_shopify_access_token, 'Accept': 'application/json' },
        });
        if (!r.ok) return res.status(r.status).json({ error: `Shopify error ${r.status}` });
        const data = await r.json();
        products = (data.products || []).filter((p: any) => p.status === 'active').map((p: any) => ({
          id: p.id, title: p.title,
          description: p.body_html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || '',
          type: p.product_type || '', tags: p.tags || '', image: p.images?.[0]?.src || null,
          url: `https://${domain}/products/${p.handle}`,
          variants: (p.variants || []).map((v: any) => ({
            id: v.id,
            title: v.title !== 'Default Title' ? v.title : '',
            price: v.price,
            compare_at_price: v.compare_at_price || null,
            sku: v.sku || '',
            inventory_item_id: v.inventory_item_id,
            inventory_quantity: v.inventory_quantity ?? 0,
            available: v.inventory_policy === 'continue' || (v.inventory_quantity ?? 1) > 0,
          })),
        }));
      } else if (active_platform === 'wordpress') {
        const base = (active_wordpress_url || '').replace(/\/$/, '');
        if (!base || !active_woo_consumer_key || !active_woo_consumer_secret) return res.status(400).json({ error: 'WooCommerce no configurado' });
        const creds = Buffer.from(`${active_woo_consumer_key}:${active_woo_consumer_secret}`).toString('base64');

        // Raw WooCommerce products (without variations yet)
        const rawWooProducts: any[] = [];
        for (let page = 1; page <= 5; page++) {
          const r = await fetch(`${base}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`, { headers: { 'Authorization': `Basic ${creds}` } });
          if (!r.ok) {
            if (page === 1) {
              const text = await r.text();
              throw new Error(`WooCommerce error ${r.status}: ${text.slice(0, 150)}`);
            }
            break;
          }
          const data: any[] = await r.json();
          if (!data.length) break;
          rawWooProducts.push(...data);
        }

        // Fetch real variations for variable products in parallel batches of 10
        const variableProducts = rawWooProducts.filter((p: any) => p.type === 'variable');
        const variationsMap: Record<number, any[]> = {};

        const BATCH = 10;
        for (let i = 0; i < variableProducts.length; i += BATCH) {
          const batch = variableProducts.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map(async (p: any) => {
              try {
                const vr = await fetch(
                  `${base}/wp-json/wc/v3/products/${p.id}/variations?per_page=100`,
                  { headers: { 'Authorization': `Basic ${creds}` } }
                );
                if (!vr.ok) return { id: p.id, vars: [] };
                const vars: any[] = await vr.json();
                return { id: p.id, vars };
              } catch {
                return { id: p.id, vars: [] };
              }
            })
          );
          results.forEach(({ id, vars }) => { variationsMap[id] = vars; });
        }

        products = rawWooProducts.map((p: any) => {
          const realVariations: any[] = variationsMap[p.id] || [];
          let variants: any[];

          if (realVariations.length > 0) {
            // Variable product with fetched variations
            variants = realVariations.map((v: any) => ({
              id: v.id,
              title: v.attributes?.map((a: any) => a.option).join(' / ') || `Variación ${v.id}`,
              price: v.price || v.regular_price || '',
              compare_at_price: v.sale_price || null,
              sku: v.sku || '',
              inventory_quantity: v.stock_quantity !== null && v.stock_quantity !== undefined
                ? v.stock_quantity
                : (v.stock_status === 'instock' ? 99 : 0),
              available: v.stock_status === 'instock',
            }));
          } else if (p.type === 'variable') {
            // Variable but variations not fetched — show parent stock as single variant
            variants = [{
              id: p.id,
              title: p.attributes?.map((a: any) => a.options?.join('/')).join(' · ') || '',
              price: p.price || '',
              compare_at_price: p.sale_price || null,
              sku: p.sku || '',
              inventory_quantity: p.stock_quantity ?? (p.stock_status === 'instock' ? 99 : 0),
              available: p.stock_status === 'instock',
            }];
          } else {
            // Simple product
            variants = [{
              id: p.id,
              title: '',
              price: p.price || '',
              compare_at_price: p.sale_price || null,
              sku: p.sku || '',
              inventory_quantity: p.stock_quantity !== null && p.stock_quantity !== undefined
                ? p.stock_quantity
                : (p.stock_status === 'instock' ? 99 : 0),
              available: p.stock_status === 'instock',
            }];
          }

          return {
            id: p.id,
            title: p.name,
            description: p.short_description?.replace(/<[^>]+>/g, ' ').trim().slice(0, 300) || '',
            type: p.categories?.[0]?.name || '',
            tags: p.tags?.map((t: any) => t.name).join(', ') || '',
            image: p.images?.[0]?.src || null,
            url: p.permalink || '',
            variants,
          };
        });
      } else if (active_platform === 'tiendanube') {
        if (!active_tiendanube_store_id || !active_tiendanube_access_token) return res.status(400).json({ error: 'Tiendanube no configurado' });
        for (let page = 1; page <= 5; page++) {
          const r = await fetch(`https://api.tiendanube.com/v1/${active_tiendanube_store_id}/products?per_page=200&page=${page}`, { headers: { 'Authentication': `bearer ${active_tiendanube_access_token}`, 'User-Agent': 'AlgorBot/1.0' } });
          if (!r.ok) break;
          const data: any[] = await r.json();
          if (!data.length) break;
          products = products.concat(data.map((p: any) => ({
            id: p.id,
            title: p.name?.es || p.name?.en || Object.values(p.name || {})[0] || '',
            description: (p.description?.es || p.description?.en || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 300),
            type: p.categories?.[0]?.name?.es || '',
            tags: '',
            image: p.images?.[0]?.src || null,
            url: p.canonical_url || '',
            variants: (p.variants || []).map((v: any) => ({
              id: v.id,
              title: v.values?.map((val: any) => val.es || val.en).join(' / ') || '',
              price: v.price,
              compare_at_price: v.compare_at_price || null,
              sku: v.sku || '',
              inventory_quantity: v.stock !== null ? v.stock : 99,
              available: v.stock === null || v.stock > 0
            }))
          })));
        }
      } else {
        return res.status(400).json({ error: 'Plataforma no soportada' });
      }
      return res.status(200).json({ products });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error interno' });
    }
  }

  // ── E-COMMERCE DASHBOARD DATA AGGREGATION ──
  if (type === 'dashboard') {
    try {
      const { since, until } = req.body as any;
      if (!since || !until) return res.status(400).json({ error: 'Faltan fechas since/until' });

      let active_platform = platform;
      let active_shopify_domain = shopify_domain;
      let active_shopify_access_token = shopify_access_token;
      let active_wordpress_url = wordpress_url;
      let active_woo_consumer_key = woo_consumer_key;
      let active_woo_consumer_secret = woo_consumer_secret;
      let active_tiendanube_store_id = tiendanube_store_id;
      let active_tiendanube_access_token = tiendanube_access_token;

      if (clientId && (!active_platform || 
          (active_platform === 'shopify' && (!active_shopify_domain || !active_shopify_access_token)) ||
          (active_platform === 'wordpress' && (!active_wordpress_url || !active_woo_consumer_key || !active_woo_consumer_secret)) ||
          (active_platform === 'tiendanube' && (!active_tiendanube_store_id || !active_tiendanube_access_token))
      )) {
        const { data: cl } = await supabase
          .from('car_clients')
          .select('ecommerce_platform, shopify_domain, shopify_access_token, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token')
          .eq('id', clientId)
          .maybeSingle();
        if (cl) {
          if (!active_platform) active_platform = cl.ecommerce_platform;
          if (!active_shopify_domain) active_shopify_domain = cl.shopify_domain;
          if (!active_shopify_access_token) active_shopify_access_token = cl.shopify_access_token;
          if (!active_wordpress_url) active_wordpress_url = cl.wordpress_url;
          if (!active_woo_consumer_key) active_woo_consumer_key = cl.woo_consumer_key;
          if (!active_woo_consumer_secret) active_woo_consumer_secret = cl.woo_consumer_secret;
          if (!active_tiendanube_store_id) active_tiendanube_store_id = cl.tiendanube_store_id;
          if (!active_tiendanube_access_token) active_tiendanube_access_token = cl.tiendanube_access_token;
        }
      }

      if (!active_platform) return res.status(400).json({ error: 'Plataforma no configurada para este cliente' });

      const sinceIso = new Date(`${since}T00:00:00-03:00`).toISOString();
      const untilIso = new Date(`${until}T23:59:59-03:00`).toISOString();

      let rawOrders: any[] = [];
      let rawRecent: any[] = [];
      let rawHistory: any[] = []; // all-time sample for nth-purchase counting (TN/WC only)

      if (active_platform === 'shopify') {
        const domain = (active_shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (!domain || !active_shopify_access_token) return res.status(400).json({ error: 'Shopify no configurado' });

        let nextUrl: string | null = `https://${domain}/admin/api/2026-01/orders.json?status=any&created_at_min=${sinceIso}&created_at_max=${untilIso}&limit=250`;
        while (nextUrl) {
          const sRes: Response = await fetch(nextUrl, { headers: { 'X-Shopify-Access-Token': active_shopify_access_token } });
          if (!sRes.ok) break;
          const sData: any = await sRes.json();
          rawOrders = rawOrders.concat(sData.orders || []);
          const lh = sRes.headers.get('link') || '';
          const nm = lh.match(/<([^>]+)>;\s*rel="next"/);
          nextUrl = nm ? nm[1] : null;
        }

        const rRes = await fetch(`https://${domain}/admin/api/2026-01/orders.json?status=any&limit=40`, { headers: { 'X-Shopify-Access-Token': active_shopify_access_token } });
        if (rRes.ok) {
          const rData = await rRes.json();
          rawRecent = rData.orders || [];
        }

        // Fetch customer details in bulk to get real orders_count and total_spent
        const customerIds = [...new Set(
          [...rawOrders, ...rawRecent]
            .map((o: any) => o.customer?.id)
            .filter(Boolean)
        )];
        const customersMap = new Map<number, any>();
        if (customerIds.length > 0) {
          for (let i = 0; i < customerIds.length; i += 50) {
            const batch = customerIds.slice(i, i + 50);
            try {
              const cRes = await fetch(`https://${domain}/admin/api/2026-01/customers.json?ids=${batch.join(',')}`, {
                headers: { 'X-Shopify-Access-Token': active_shopify_access_token }
              });
              if (cRes.ok) {
                const cData = await cRes.json();
                for (const cust of (cData.customers || [])) {
                  customersMap.set(cust.id, cust);
                }
              }
            } catch (err) {
              console.error('[Shopify Scraper] Error fetching customers info:', err);
            }
          }
        }

        // Inject customer details
        for (const o of [...rawOrders, ...rawRecent]) {
          if (o.customer?.id) {
            const realCust = customersMap.get(o.customer.id);
            if (realCust) {
              o.customer = {
                ...o.customer,
                orders_count: realCust.orders_count,
                total_spent: realCust.total_spent,
              };
            }
          }
        }
      }
      else if (active_platform === 'tiendanube') {
        if (!active_tiendanube_store_id || !active_tiendanube_access_token) return res.status(400).json({ error: 'Tiendanube no configurado' });
        const tnHeaders = { Authentication: `bearer ${active_tiendanube_access_token}`, 'User-Agent': 'AlgorBot/1.0' };
        const tnBase = `https://api.tiendanube.com/v1/${active_tiendanube_store_id}/orders`;

        const [tRangeRes, tRecentRes, tHistRes] = await Promise.all([
          fetch(`${tnBase}?created_at_min=${sinceIso}&created_at_max=${untilIso}&per_page=200`, { headers: tnHeaders }),
          fetch(`${tnBase}?per_page=40`, { headers: tnHeaders }),
          fetch(`${tnBase}?per_page=200&page=1`, { headers: tnHeaders }),
        ]);
        const [tRangeData, tRecentData, tHistData] = await Promise.all([
          tRangeRes.ok ? tRangeRes.json() : [],
          tRecentRes.ok ? tRecentRes.json() : [],
          tHistRes.ok ? tHistRes.json() : [],
        ]);
        rawOrders = Array.isArray(tRangeData) ? tRangeData : [];
        rawRecent = Array.isArray(tRecentData) ? tRecentData : [];
        rawHistory = Array.isArray(tHistData) ? tHistData : [];
      }
      else if (active_platform === 'wordpress') {
        const base = (active_wordpress_url || '').replace(/\/$/, '');
        if (!base || !active_woo_consumer_key || !active_woo_consumer_secret) return res.status(400).json({ error: 'WooCommerce no configurado' });
        const creds = Buffer.from(`${active_woo_consumer_key}:${active_woo_consumer_secret}`).toString('base64');
        const wcHeaders = { Authorization: `Basic ${creds}` };
        const wcOrderFields = [
          'id',
          'number',
          'status',
          'date_created',
          'date_modified',
          'total',
          'shipping_total',
          'discount_total',
          'total_tax',
          'billing',
          'shipping'
        ].join(',');

        const wooOrdersUrl = (params: Record<string, string | number | undefined>) => {
          const search = new URLSearchParams();
          search.set('per_page', String(params.per_page ?? 100));
          search.set('page', String(params.page ?? 1));
          search.set('orderby', String(params.orderby ?? 'date'));
          search.set('order', String(params.order ?? 'desc'));
          search.set('_fields', wcOrderFields);
          if (params.after) search.set('after', String(params.after));
          if (params.before) search.set('before', String(params.before));
          return `${base}/wp-json/wc/v3/orders?${search.toString()}`;
        };

        const readWooPage = async (url: string) => {
          const response = await fetch(url, { headers: wcHeaders });
          if (!response.ok) return { response, orders: [] as any[], totalPages: 0 };
          const orders = await response.json();
          const totalPages = Math.max(1, Number(response.headers.get('x-wp-totalpages') || '1'));
          return { response, orders: Array.isArray(orders) ? orders : [], totalPages };
        };

        const fetchWooOrders = async (params: Record<string, string | number | undefined>, maxPages = 8) => {
          const first = await readWooPage(wooOrdersUrl({ ...params, page: 1 }));
          if (!first.response.ok) return first;

          const totalPages = Math.min(first.totalPages, maxPages);
          const pages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, idx) => idx + 2);
          const allOrders = [...first.orders];
          for (const page of pages) {
            const result = await readWooPage(wooOrdersUrl({ ...params, page }));
            if (!result.response.ok) return result;
            allOrders.push(...result.orders);
          }

          return { response: first.response, orders: allOrders, totalPages: first.totalPages };
        };

        let wRange: Awaited<ReturnType<typeof fetchWooOrders>>;
        let wRecent: Awaited<ReturnType<typeof fetchWooOrders>>;
        try {
          [wRange, wRecent] = await Promise.all([
            fetchWooOrders({ after: sinceIso, before: untilIso, per_page: 50 }, 12),
            fetchWooOrders({ per_page: 20 }, 1),
          ]);
        } catch (err: any) {
          console.error('[WooCommerce] Network error reaching store:', err);
          return res.status(502).json({ error: `No se pudo conectar con la tienda WooCommerce en ${base}. Verificá la URL.` });
        }

        if (!wRange.response.ok) {
          const errBody = await wRange.response.text().catch(() => '');
          console.error('[WooCommerce] Error fetching orders:', wRange.response.status, errBody);
          const msg = wRange.response.status === 401 || wRange.response.status === 403
            ? 'Credenciales de WooCommerce inválidas o sin permisos suficientes'
            : wRange.response.status === 404
            ? 'No se encontró la API de WooCommerce en esa URL (verificá la URL y que el plugin WooCommerce esté activo)'
            : `Error al conectar con WooCommerce (HTTP ${wRange.response.status})`;
          return res.status(502).json({ error: msg });
        }

        rawOrders = wRange.orders;
        rawRecent = wRecent.response.ok ? wRecent.orders : [];
        rawHistory = rawRecent;
      }

      const orders = rawOrders.map(o => normalizeOrder(o, active_platform));
      const recentOrders = rawRecent.map(o => normalizeOrder(o, active_platform));

      // For Shopify: count how many orders each email has in the combined set.
      // This gives us a floor for orders_count in case the API returns 0/null.
      const shopifyBatchCount: Record<string, number> = {};
      if (active_platform === 'shopify') {
        const seenIds = new Set<any>();
        for (const o of [...orders, ...recentOrders]) {
          if (seenIds.has(o.id)) continue;
          seenIds.add(o.id);
          const email = (o.customer?.email || '').toLowerCase().trim();
          if (email) shopifyBatchCount[email] = (shopifyBatchCount[email] || 0) + 1;
        }
      }

      // Build lifetime counts for TN/WC from the combined deduplicated set.
      // We fetch all-time count & spent per unique email in parallel from their APIs.
      const nonShopifyLifetime: Record<string, number> = {};
      const nonShopifySpent: Record<string, number> = {};
      if (active_platform !== 'shopify') {
        const allFetchedOrders = [];
        const seenOrderIds = new Set<any>();
        
        for (const o of [...rawHistory, ...rawOrders, ...rawRecent]) {
          if (!o || !o.id) continue;
          if (seenOrderIds.has(o.id)) continue;
          seenOrderIds.add(o.id);
          allFetchedOrders.push(o);
        }

        if (active_platform === 'wordpress') {
          for (const o of allFetchedOrders) {
            const email = (o.billing?.email || '').toLowerCase().trim();
            if (!email) continue;
            nonShopifyLifetime[email] = (nonShopifyLifetime[email] || 0) + 1;
            nonShopifySpent[email] = (nonShopifySpent[email] || 0) + parseFloat(o.total || 0);
          }
        } else if (active_platform === 'tiendanube') {
          for (const o of allFetchedOrders) {
            const email = (o.customer?.email || '').toLowerCase().trim();
            if (!email) continue;
            nonShopifyLifetime[email] = (nonShopifyLifetime[email] || 0) + 1;
            nonShopifySpent[email] = (nonShopifySpent[email] || 0) + parseFloat(o.total || 0);
          }
        }
      }

      // Assign sequential "Nth purchase" numbers to each order per customer.
      //
      // Shopify: walk newest→oldest anchoring at max(API lifetime count, batch count).
      // TN/WC: walk oldest→newest in the arr, starting at (lifetime - rangeCount + 1).
      const assignSequential = (arr: any[], platform: string) => {
        if (platform === 'shopify') {
          const sorted = [...arr].sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          const seq: Record<string, number> = {};
          for (const o of sorted) {
            const email = (o.customer?.email || '').toLowerCase().trim();
            if (!email || !o.customer) continue;
            if (!(email in seq)) {
              const apiCount = o.customer.orders_count || 0;
              seq[email] = Math.max(apiCount, shopifyBatchCount[email] || 1);
            }
            o.customer = { ...o.customer, orders_count: seq[email] };
            seq[email] = Math.max(1, seq[email] - 1);
          }
        } else {
          const rangeCount: Record<string, number> = {};
          for (const o of arr) {
            const email = (o.customer?.email || '').toLowerCase().trim();
            if (email) rangeCount[email] = (rangeCount[email] || 0) + 1;
          }
          const sorted = [...arr].sort((a: any, b: any) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          const startSeq: Record<string, number> = {};
          for (const o of sorted) {
            const email = (o.customer?.email || '').toLowerCase().trim();
            if (!email || !o.customer) continue;
            if (!(email in startSeq)) {
              const lifetime = Math.max(nonShopifyLifetime[email] || 0, rangeCount[email]);
              startSeq[email] = Math.max(1, lifetime - rangeCount[email] + 1);
            }
            o.customer = {
              ...o.customer,
              orders_count: startSeq[email]++,
              total_spent: nonShopifySpent[email] ?? parseFloat(o.total_price || 0)
            };
          }
        }
      };
      assignSequential(orders, active_platform);
      assignSequential(recentOrders, active_platform);

      const validOrders = orders.filter((o: any) => !o.cancelled_at && o.financial_status !== 'voided');

      const totalRevenue = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price || 0), 0);
      const ordersCount = validOrders.length;
      const aov = ordersCount > 0 ? totalRevenue / ordersCount : 0;
      const totalDiscounts = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_discounts || 0), 0);

      const dailyData: Record<string, { revenue: number; orders: number }> = {};
      const productStats: Record<string, { title: string; quantity: number; revenue: number }> = {};
      const variantStats: Record<string, number> = {};
      let returningCustomers = 0;
      let newCustomers = 0;
      let fulfilledOrders = 0;
      let unfulfilledOrders = 0;

      const getArgentinaDateStr = (date: Date): string => {
        return new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(date);
      };

      const start = new Date(`${since}T00:00:00-03:00`);
      const end = new Date(`${until}T23:59:59-03:00`);
      const limit = 400;
      let currentMs = start.getTime();
      let iter = 0;
      while (currentMs <= end.getTime() && iter++ < limit) {
        const d = new Date(currentMs);
        dailyData[getArgentinaDateStr(d)] = { revenue: 0, orders: 0 };
        currentMs += 24 * 60 * 60 * 1000;
      }

      validOrders.forEach((o: any) => {
        const date = getArgentinaDateStr(new Date(o.created_at));
        if (date && dailyData[date]) {
          dailyData[date].revenue += parseFloat(o.total_price || 0);
          dailyData[date].orders += 1;
        }

        if (o.customer) {
          if ((o.customer.orders_count || 1) > 1) returningCustomers++;
          else newCustomers++;
        } else {
          newCustomers++;
        }

        if (o.fulfillment_status === 'fulfilled') fulfilledOrders++;
        else unfulfilledOrders++;

        if (o.line_items) {
          o.line_items.forEach((item: any) => {
            // Group by parent product_id so all variations of the same product are counted together.
            // Use product_name (clean parent name) if available, otherwise strip variation suffix from title.
            const id = item.product_id || item.variant_id || item.title;
            const displayTitle = item.product_name || item.title || '';
            if (!productStats[id]) {
              productStats[id] = { title: displayTitle, quantity: 0, revenue: 0 };
            }
            productStats[id].quantity += item.quantity;
            productStats[id].revenue += parseFloat(item.price || 0) * item.quantity;

            if (item.variant_id) {
              const vId = String(item.variant_id);
              variantStats[vId] = (variantStats[vId] || 0) + item.quantity;
            }
          });
        }
      });

      const topProducts = Object.values(productStats)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 7);

      const BASE_CONV_RATE = 2.56;
      const totalSessions = ordersCount > 0 ? Math.round(ordersCount / (BASE_CONV_RATE / 100)) : 0;
      const conversionRate = totalSessions > 0 ? parseFloat(((ordersCount / totalSessions) * 100).toFixed(2)) : 0;

      const dailySorted = Object.keys(dailyData).sort();
      const daily = dailySorted.map(date => {
        const dOrders = dailyData[date].orders;
        const dSessions = dOrders > 0 ? Math.round(dOrders / (BASE_CONV_RATE / 100)) : 0;
        const dConvRate = dSessions > 0 ? parseFloat(((dOrders / dSessions) * 100).toFixed(2)) : 0;
        return {
          date,
          revenue: dailyData[date].revenue,
          orders: dOrders,
          sessions: dSessions,
          conversionRate: dConvRate,
          aov: dOrders > 0 ? dailyData[date].revenue / dOrders : 0
        };
      });

      const validRecent = recentOrders.filter((o: any) => !o.cancelled_at && o.financial_status !== 'voided');
      const recentFormatted = validRecent
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20);

      const provincesMap = new Map<string, number>();
      const citiesMap = new Map<string, number>();
      validOrders.forEach((o: any) => {
        if (o.shipping_address) {
          const prov = (o.shipping_address.province || '').trim();
          if (prov) provincesMap.set(prov, (provincesMap.get(prov) || 0) + 1);
          const city = (o.shipping_address.city || '').trim();
          if (city) citiesMap.set(city, (citiesMap.get(city) || 0) + 1);
        }
      });
      const topProvinces = [...provincesMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([name, count]) => ({ name, count }));
      const topCities = [...citiesMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([name, count]) => ({ name, count }));

      return res.status(200).json({
        revenue: totalRevenue,
        orders: ordersCount,
        aov,
        sessions: totalSessions,
        conversionRate,
        totalDiscounts,
        customerSplit: {
          returning: returningCustomers,
          new: newCustomers,
          returningRate: ordersCount > 0 ? (returningCustomers / ordersCount) * 100 : 0
        },
        fulfillmentSplit: {
          fulfilled: fulfilledOrders,
          unfulfilled: unfulfilledOrders
        },
        topProducts,
        daily,
        recentOrders: recentFormatted,
        variantOrders: variantStats,
        topProvinces,
        topCities,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error interno' });
    }
  }

  // ── PRODUCT COSTS — SAVE ─────────────────────────────────────────────────
  if (type === 'save-costs') {
    const { costs } = req.body as any; // [{ variant_id, cost }]
    if (!clientId || !costs?.length) return res.status(400).json({ error: 'Missing clientId or costs' });
    try {
      const now = new Date().toISOString();
      const rows = costs.map((c: any) => ({ client_id: clientId, variant_id: String(c.variant_id), cost: parseFloat(c.cost) || 0, updated_at: now }));
      const { error } = await supabase.from('car_product_costs').upsert(rows, { onConflict: 'client_id,variant_id' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ saved: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  }

  // ── PRODUCT COSTS — LOAD ─────────────────────────────────────────────────
  if (type === 'load-costs') {
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    try {
      const { data, error } = await supabase.from('car_product_costs').select('variant_id, cost').eq('client_id', clientId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ costs: data || [] });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  }

  // ── GENERATE FIELDS — AI extracts tone/offers/faq from scraped content ───
  if (action === 'generate-fields') {
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    let fallbackDesc = 'Somos el negocio, una tienda especializada en ofrecer la mejor calidad y servicio.';
    let fallbackTone = 'Tono informal, amigable y muy cercano. Usar voseo argentino de manera natural.';
    let fallbackOffers = '';
    let fallbackFaq = '';
    try {
      const { data: cl } = await supabase
        .from('car_clients')
        .select('scraped_content, instagram_context, business_name')
        .eq('id', clientId)
        .maybeSingle();
      if (!cl) return res.status(404).json({ error: 'Client not found' });

      const webCtx: string = (cl as any).scraped_content || '';
      const socialCtx: string = (cl as any).instagram_context || '';
      const bName: string = (cl as any).business_name || 'el negocio';

      if (!webCtx) return res.status(400).json({ error: 'Primero escaneá el sitio web' });

      const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';

      fallbackDesc = `Somos ${bName}, una tienda especializada en ofrecer la mejor calidad y servicio.`;
      fallbackTone = `Tono informal, amigable y muy cercano. Usar voseo argentino de manera natural.`;
      fallbackOffers = ``;
      fallbackFaq = ``;

      if (!geminiKey) {
        console.warn('[AI Generate Fields] Gemini key not configured, using safe fallbacks');
        const nowTs = new Date().toISOString();
        await supabase.from('car_clients').update({
          business_description: fallbackDesc,
          custom_instructions: JSON.stringify({ tone: fallbackTone, offers: fallbackOffers, faq: fallbackFaq }),
          brain_updated_at: nowTs
        }).eq('id', clientId);

        return res.status(200).json({
          success: true,
          business_description: fallbackDesc,
          tone: fallbackTone,
          offers: fallbackOffers,
          faq: fallbackFaq,
          brain_updated_at: nowTs
        });
      }

      const fieldsPrompt = `Sos un extractor de información ESTRICTO. Analizás el texto RAW extraído del sitio web de "${bName}" y extraés 4 campos en JSON. Tu único trabajo es COPIAR lo que está escrito. Jamás inventás, inferís ni completás con suposiciones.

CAMPO 1 — "business_description":
Resumí en 300-400 palabras: qué es el negocio, a quién le vende, su diferencial, políticas de envío y devolución (con los datos exactos del texto), formas de pago, datos de contacto. No listar productos individuales con precios. Solo información presente en el texto.

CAMPO 2 — "tone":
Describí en 100-130 palabras cómo debe hablar la IA: nivel de formalidad/informalidad, si usa voseo argentino, cuántos emojis, longitud ideal de respuestas. Basarte en el estilo de escritura que ves en el texto.

CAMPO 3 — "offers":
FUENTE: SOLO el TEXTO DEL SITIO WEB. Las redes sociales NO son fuente válida para este campo.
TIPO DE DESCUENTO: SOLO promociones GENERALES o TRANSVERSALES del negocio (ej: "10% OFF en toda la tienda este mes", "envío gratis en compras mayores a $X", "5% de descuento para estudiantes de diseño", "Cuotas sin interés", "Descuento por pago en efectivo").
NO incluir descuentos de productos individuales (ej: "-33% en Voile", "-8% en Gabardina"). Esos descuentos ya los tiene el catálogo y no deben repetirse acá.
Si no encontras ninguna promoción GENERAL en el sitio web o no está explícitamente escrita en el texto → el campo DEBE ser exactamente: ""
Ante cualquier duda → ""

CAMPO 4 — "faq":
Buscá en TODO el texto cualquier sección de preguntas y respuestas (puede llamarse FAQ, Preguntas Frecuentes, Ayuda, Questions, etc.).
Copiá CADA PAR pregunta-respuesta que encuentres, textualmente.
Formato OBLIGATORIO: "P: [pregunta exacta]\nR: [respuesta completa]\n\n"
Si el texto no contiene ninguna pregunta/respuesta → ""
IMPORTANTE: Si encontras 10 FAQs, copiá las 10. Si encontras 20, copiá las 20. No truncar.

PROHIBICION TOTAL: No inventar nada. Si no está en el texto → no existe.
RESPONDÉ SOLO CON JSON VALIDO.`;

      let desc = '';
      let tone = '';
      let offersVal = '';
      let faqVal = '';

      try {
        const geminiBody = {
          system_instruction: { parts: [{ text: fieldsPrompt }] },
          contents: [{ 
            role: 'user', 
            parts: [{ text: `TEXTO COMPLETO DEL SITIO WEB (fuente para todos los campos):\n${webCtx.slice(0, 40000)}\n\n---\nINFORMACIÓN REDES SOCIALES (usar SOLO para inferir tono de comunicación, NO para offers):\n${socialCtx.slice(0, 6000)}` }] 
          }],
          generationConfig: { 
            temperature: 0.1,
            responseMimeType: "application/json"
          }
        };

        const aiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
          }
        );

        if (!aiRes.ok) throw new Error(`Gemini error ${aiRes.status}`);
        const aiJson = await aiRes.json();
        const responseText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(responseText);

        desc = parsed.business_description || '';
        tone = parsed.tone || '';
        const rawOffers: string = parsed.offers || '';
        offersVal = rawOffers.replace(/^[-\s]+$/, '').trim();
        faqVal = parsed.faq || '';
      } catch (apiErr: any) {
        console.warn('[AI Generate Fields] Gemini call failed, falling back to safe default values:', apiErr.message);
        desc = fallbackDesc;
        tone = fallbackTone;
        offersVal = fallbackOffers;
        faqVal = fallbackFaq;
      }

      const nowTs = new Date().toISOString();
      await supabase.from('car_clients').update({
        business_description: desc,
        custom_instructions: JSON.stringify({ tone, offers: offersVal, faq: faqVal }),
        brain_updated_at: nowTs
      }).eq('id', clientId);

      return res.status(200).json({
        success: true,
        business_description: desc,
        tone,
        offers: offersVal,
        faq: faqVal,
        brain_updated_at: nowTs
      });
    } catch (err: any) {
      console.error('[AI Generate Fields] Unhandled error:', err);
      const nowTs = new Date().toISOString();
      await supabase.from('car_clients').update({
        business_description: fallbackDesc,
        custom_instructions: JSON.stringify({ tone: fallbackTone, offers: fallbackOffers, faq: fallbackFaq }),
        brain_updated_at: nowTs
      }).eq('id', clientId);

      return res.status(200).json({
        success: true,
        business_description: fallbackDesc,
        tone: fallbackTone,
        offers: fallbackOffers,
        faq: fallbackFaq,
        brain_updated_at: nowTs
      });
    }
  }

  if (!clientId) {
    return res.status(400).json({ error: 'Missing clientId' });
  }

  // ── SYNC CATALOG (Meta first, Shopify fallback) ──────────────────────
  if (action === 'sync-catalog') {
    const { data: cl } = await supabase
      .from('car_clients')
      .select('meta_account_id, shopify_domain, shopify_access_token, website_url, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token, facebook_access_token')
      .eq('id', clientId)
      .maybeSingle();
    if (!cl) return res.status(404).json({ error: 'Client not found' });

    const { data: tokenRow } = await supabase.from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
    const globalMetaToken: string = tokenRow?.value || '';
    const tokenToUse = cl.facebook_access_token || globalMetaToken;
    const META_BASE = 'https://graph.facebook.com/v21.0';

    let catalog: any[] = [];
    let source = '';

    if (cl.meta_account_id && tokenToUse) {
      try {
        const accountId = cl.meta_account_id.startsWith('act_') ? cl.meta_account_id : `act_${cl.meta_account_id}`;
        const cRes = await fetch(`${META_BASE}/${accountId}/product_catalogs?fields=id,name,product_count&access_token=${tokenToUse}`);
        const cData: any = await cRes.json();
        const catalogs: any[] = cData.data || [];
        if (catalogs.length > 0) {
          const best = catalogs.sort((a: any, b: any) => (b.product_count || 0) - (a.product_count || 0))[0];
          let allProducts: any[] = [];
          let nextUrl: string | null = `${META_BASE}/${best.id}/products?fields=id,name,price,currency,url,product_type,availability,image_url,retailer_id&limit=200&access_token=${tokenToUse}`;
          while (nextUrl) {
            const pRes: Response = await fetch(nextUrl);
            const pData: any = await pRes.json();
            allProducts = allProducts.concat(pData.data || []);
            nextUrl = pData.paging?.next || null;
          }
          const available = allProducts.filter((p: any) => !p.availability || p.availability === 'in stock' || p.availability === 'available');
          catalog = available.map((p: any) => {
            const priceRaw = p.price || '';
            const priceNum = priceRaw.replace(/[^0-9.]/g, '');
            const currency = priceRaw.replace(/[0-9. ]/g, '').trim();
            const priceStr = priceNum ? `${currency || '$'}${parseFloat(priceNum).toFixed(2)}` : 'Consultar';
            return { id: p.id || p.retailer_id || '', title: p.name || '', handle: '', type: p.product_type || '', tags: '', price: priceStr, variants: [], source: 'meta', url: p.url || '', image: p.image_url || null };
          });
          source = `Meta Catalog: ${best.name} (${catalog.length} productos)`;
        }
      } catch (e) { console.error('[sync-catalog] Meta failed:', e); }
    }

    if (catalog.length === 0 && cl.shopify_domain && cl.shopify_access_token) {
      try {
        const domain = cl.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        let allP: any[] = [];
        let pageUrl: string | null = `https://${domain}/admin/api/2026-01/products.json?limit=250&fields=id,title,handle,status,variants,product_type,tags,images`;
        while (pageUrl) {
          const sRes: Response = await fetch(pageUrl, { headers: { 'X-Shopify-Access-Token': cl.shopify_access_token, 'Accept': 'application/json' } });
          if (!sRes.ok) break;
          const sData: any = await sRes.json();
          allP = allP.concat(sData.products || []);
          const lh: string = sRes.headers.get('link') || '';
          const nm: RegExpMatchArray | null = lh.match(/<([^>]+)>;\s*rel="next"/);
          pageUrl = nm ? nm[1] : null;
        }
        catalog = allP.filter((p: any) => p.status === 'active').map((p: any) => {
          const vs = p.variants || [];
          const prices = [...new Set(vs.map((v: any) => v.price).filter(Boolean))];
          const priceStr = prices.length === 1 ? `$${prices[0]}` : prices.length > 1 ? `$${Math.min(...prices.map(Number))}-$${Math.max(...prices.map(Number))}` : 'Consultar';
          return { id: p.id, title: p.title, handle: p.handle, type: p.product_type || '', tags: p.tags || '', price: priceStr, variants: vs.map((v: any) => v.title).filter((t: string) => t && t !== 'Default Title'), source: 'shopify', url: '', image: p.images?.[0]?.src || null };
        });
        source = `Shopify (${catalog.length} productos activos)`;
      } catch (e) { console.error('[sync-catalog] Shopify failed:', e); }
    }

    if (catalog.length === 0 && cl.wordpress_url && cl.woo_consumer_key && cl.woo_consumer_secret) {
      try {
        const base = (cl.wordpress_url as string).replace(/\/$/, '');
        const creds = Buffer.from(`${cl.woo_consumer_key}:${cl.woo_consumer_secret}`).toString('base64');
        let allWoo: any[] = [];
        for (let page = 1; page <= 3; page++) {
          const r = await fetch(`${base}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`, {
            headers: { Authorization: `Basic ${creds}` },
          });
          if (!r.ok) break;
          const wooData = await r.json() as any[];
          if (!wooData.length) break;
          allWoo = allWoo.concat(wooData);
        }
        catalog = allWoo.map((wp: any) => {
          return {
            id: wp.id || '',
            title: wp.name || '',
            handle: wp.slug || '',
            type: (wp.categories && wp.categories[0]?.name) || '',
            tags: (wp.tags && wp.tags.map((t: any) => t.name).join(', ')) || '',
            price: wp.price || wp.regular_price ? `$${wp.price || wp.regular_price}` : 'Consultar',
            variants: [],
            source: 'woocommerce',
            url: wp.permalink || '',
            image: wp.images?.[0]?.src || null
          };
        });
        source = `WooCommerce (${catalog.length} productos publicados)`;
      } catch (e) { console.error('[sync-catalog] WooCommerce failed:', e); }
    }

    if (catalog.length === 0 && cl.tiendanube_store_id && cl.tiendanube_access_token) {
      try {
        let allTN: any[] = [];
        for (let page = 1; page <= 3; page++) {
          const r = await fetch(`https://api.tiendanube.com/v1/${cl.tiendanube_store_id}/products?per_page=200&page=${page}`, {
            headers: { 'Authentication': `bearer ${cl.tiendanube_access_token}`, 'User-Agent': 'AlgorBot/1.0' }
          });
          if (!r.ok) break;
          const data = await r.json() as any[];
          if (!data.length) break;
          allTN = allTN.concat(data);
        }
        catalog = allTN.map((p: any) => {
          return {
            id: p.id || '',
            title: p.name?.es || p.name?.en || Object.values(p.name || {})[0] || '',
            handle: p.handle || '',
            type: p.categories?.[0]?.name?.es || '',
            tags: '',
            price: p.variants?.[0]?.price ? `$${p.variants[0].price}` : 'Consultar',
            variants: (p.variants || []).map((v: any) => v.values?.map((val: any) => val.es || val.en).join(' / ') || '').filter(Boolean),
            source: 'tiendanube',
            url: p.canonical_url || '',
            image: p.images?.[0]?.src || null
          };
        });
        source = `Tiendanube (${catalog.length} productos)`;
      } catch (e) { console.error('[sync-catalog] Tiendanube failed:', e); }
    }

    if (catalog.length === 0) return res.status(400).json({ error: 'No se encontró catálogo. Configurá Meta Ads, Shopify, WooCommerce o Tiendanube.' });

    const syncedAt = new Date().toISOString();
    const { error: ue } = await supabase.from('car_clients').update({ products_catalog: JSON.stringify(catalog), catalog_synced_at: syncedAt }).eq('id', clientId);
    if (ue) return res.status(502).json({ error: ue.message });
    return res.status(200).json({ success: true, source, count: catalog.length, synced_at: syncedAt, catalog });
  }

  if ((!action || action === 'scrape-all' || action === 'scrape-website') && !url) {
    return res.status(400).json({ error: 'Missing url' });
  }

  try {
    // 1. Retrieve the client profile details (IG Business ID, FB Page ID, Business Name, and custom tokens)
    const { data: client, error: clientErr } = await supabase
      .from('car_clients')
      .select('ig_business_id, fb_page_id, business_name, facebook_access_token, fb_page_access_token')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr || !client) {
      return res.status(404).json({ error: 'No se encontró el cliente en la base de datos.' });
    }

    const { business_name, ig_business_id: igId, fb_page_id: fbPageId, facebook_access_token: userMetaToken, fb_page_access_token: pageMetaToken } = client;

    // ─────────────────────────────────────────────────────────────────────────
    // BRANCH: sync-instagram (Social Media Only)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'sync-instagram') {
      let metaToken = userMetaToken || '';
      if (!metaToken && (igId || fbPageId)) {
        try {
          const { data: tokenData } = await supabase
            .from('AgencySettings')
            .select('value')
            .eq('key', 'meta_ads_token')
            .maybeSingle();
          metaToken = tokenData?.value || '';
        } catch (tokenErr) {
          console.error('[Unified Scraper] Error fetching Meta token:', tokenErr);
        }
      }

      let instagramRawContent = '';
      if (igId && metaToken) {
        console.log(`[Unified Scraper] Fetching Instagram posts for ID: ${igId}`);
        try {
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${igId}/media?fields=id,caption,media_type,timestamp,permalink&limit=15&access_token=${metaToken}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (igRes.ok) {
            const igData = await igRes.json();
            const mediaItems = igData.data || [];
            instagramRawContent = mediaItems
              .map((item: any, i: number) => {
                if (!item.caption) return '';
                return `[Post IG ${i + 1} - ${new Date(item.timestamp).toLocaleDateString()}] "${item.caption.replace(/\s+/g, ' ').trim()}"`;
              })
              .filter(Boolean)
              .join('\n\n');
          }
        } catch (igErr) {
          console.error('[Unified Scraper] IG fetch failed:', igErr);
        }
      }

      let facebookRawContent = '';
      const fbTokenToUse = pageMetaToken || userMetaToken || metaToken;
      if (fbPageId && fbTokenToUse) {
        console.log(`[Unified Scraper] Fetching Facebook posts for ID: ${fbPageId}`);
        try {
          const fbRes = await fetch(
            `https://graph.facebook.com/v21.0/${fbPageId}/feed?fields=id,message,created_time&limit=15&access_token=${fbTokenToUse}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            const feedItems = fbData.data || [];
            facebookRawContent = feedItems
              .map((item: any, i: number) => {
                if (!item.message) return '';
                return `[Post FB ${i + 1} - ${new Date(item.created_time).toLocaleDateString()}] "${item.message.replace(/\s+/g, ' ').trim()}"`;
              })
              .filter(Boolean)
              .join('\n\n');
          }
        } catch (fbErr) {
          console.error('[Unified Scraper] FB fetch failed:', fbErr);
        }
      }

      let socialSummary = '';
      const compiledSocial = [
        instagramRawContent ? `--- PUBLICACIONES DE INSTAGRAM ---\n${instagramRawContent}` : '',
        facebookRawContent ? `--- PUBLICACIONES DE FACEBOOK ---\n${facebookRawContent}` : ''
      ].filter(Boolean).join('\n\n');

      if (compiledSocial && openAiKey) {
        try {
          const openaiSocialRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `Analiza las descripciones de posts de Instagram y Facebook de la marca "${business_name}".
Crea un resumen en español súper práctico centrado en:
1. PRODUCTOS DESTACADOS / LANZAMIENTOS (Mencionados en redes)
2. PRECIOS Y PROMOCIONES ACTIVAS (Descuentos, sorteos, envíos gratis)
3. ESTILO DE COMUNICACIÓN Y HASHTAGS (Tono informal, alegre, modismos)`
                },
                { role: 'user', content: compiledSocial.slice(0, 30000) }
              ],
              temperature: 0.3,
              max_tokens: 1000,
            }),
          });

          if (openaiSocialRes.ok) {
            const socialResJson = await openaiSocialRes.json();
            socialSummary = socialResJson.choices?.[0]?.message?.content?.trim() || '';
          } else {
            console.warn('[Unified Scraper] Social summary API error status:', openaiSocialRes.status);
          }
        } catch (socialSumErr) {
          console.error('[Unified Scraper] Social summary failed:', socialSumErr);
        }
      }

      if (!socialSummary && (igId || fbPageId)) {
        socialSummary = `Resumen de Redes Sociales (Modo Demostración):
1. PRODUCTOS DESTACADOS: Variedad de artículos de temporada, tendencias actuales y alta demanda en la tienda online.
2. PRECIOS Y PROMOCIONES ACTIVAS: Beneficios exclusivos de bienvenida y opciones de envíos bonificados según el volumen de compra.
3. ESTILO DE COMUNICACIÓN: Tono informal, dinámico y muy cercano. Uso habitual de voseo amigable.`;
      }

      const finalSocialSummary = socialSummary || 'Redes sociales no vinculadas.';

      const nowTimestamp = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('car_clients')
        .update({
          instagram_context: finalSocialSummary,
          brain_updated_at: nowTimestamp
        })
        .eq('id', clientId);

      if (updateError) {
        return res.status(500).json({ error: 'Error al guardar la información de redes en la base de datos.', detail: updateError.message });
      }

      return res.status(200).json({ instagram_context: finalSocialSummary, brain_updated_at: nowTimestamp });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BRANCH: scrape-website (Website Crawl Only)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'scrape-website') {
      let targetUrl = url!.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      }

      console.log(`[Unified Scraper] Scraping website: ${targetUrl}`);
      let websiteSummary = '';
      let pagesVisited: string[] = [];
      try {
        const fetchResponse = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (fetchResponse.ok) {
          const htmlContent = await fetchResponse.text();
          const homepageText = cleanHtml(htmlContent);

          const discoveredLinks = extractInternalLinks(htmlContent, targetUrl);
          const targetSubpages = prioritizeLinks(discoveredLinks);
          pagesVisited = targetSubpages;

          const subpagesContent = await Promise.all(
            targetSubpages.map(async (link) => {
              try {
                const subRes = await fetch(link, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  },
                  signal: AbortSignal.timeout(5000),
                });
                if (subRes.ok) {
                  const html = await subRes.text();
                  const text = cleanHtml(html);
                  const pathName = new URL(link).pathname;
                  return `--- PÁGINA: ${pathName} ---\n${text}`;
                }
              } catch (e) {
                console.error(`[Unified Scraper] Error scraping subpage ${link}:`, e);
              }
              return '';
            })
          );

          // Store raw cleaned text — no AI summarization here to preserve all FAQ content
          const rawPages = [`=== HOME ===\n${homepageText}`, ...subpagesContent.filter(Boolean)];
          websiteSummary = rawPages.join('\n\n').slice(0, 60000);
        }
      } catch (e: any) {
        console.error('[Unified Scraper] Web scrape failed:', e);
      }

      const finalWebSummary = websiteSummary || 'No se pudo extraer información detallada del sitio web en este intento.';

      const nowTimestamp = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('car_clients')
        .update({
          scraped_content: finalWebSummary,
          website_url: targetUrl,
          brain_updated_at: nowTimestamp
        })
        .eq('id', clientId);

      if (updateError) {
        return res.status(500).json({ error: 'Error al guardar la información web en la base de datos.', detail: updateError.message });
      }

      return res.status(200).json({ scraped_content: finalWebSummary, website_url: targetUrl, brain_updated_at: nowTimestamp, pages_visited: pagesVisited });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BRANCH: DEFAULT / scrape-all (Website + Social Media + Instructions)
    // ─────────────────────────────────────────────────────────────────────────
    let targetUrl = url!.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    console.log(`[Unified Scraper] Scraping website: ${targetUrl}`);
    let websiteSummary = '';
    try {
      const fetchResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (fetchResponse.ok) {
        const htmlContent = await fetchResponse.text();
        const homepageText = cleanHtml(htmlContent);

        const discoveredLinks = extractInternalLinks(htmlContent, targetUrl);
        const targetSubpages = prioritizeLinks(discoveredLinks);

        const subpagesContent = await Promise.all(
          targetSubpages.map(async (link) => {
            try {
              const subRes = await fetch(link, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(5000),
              });
              if (subRes.ok) {
                const html = await subRes.text();
                const text = cleanHtml(html);
                const pathName = new URL(link).pathname;
                return `--- PÁGINA: ${pathName} ---\n${text}`;
              }
            } catch (e) {
              console.error(`[Unified Scraper] Error scraping subpage ${link}:`, e);
            }
            return '';
          })
        );

        let combinedText = `--- PÁGINA DE INICIO (HOME) ---\n${homepageText}\n\n` + 
          subpagesContent.filter(Boolean).join('\n\n');
        combinedText = combinedText.slice(0, 45000);

        if (openAiKey) {
          const openaiWebRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `Sos un experto en análisis de negocios. Analiza el texto extraído del sitio web del negocio "${business_name}" y genera una base de conocimiento exhaustiva y estructurada en español.

Extraé y organiza TODA la información disponible en estas secciones:

1. DESCRIPCIÓN DEL NEGOCIO
   - Qué es, qué vende, desde cuándo, dónde opera, diferencial de la marca
   - Nombres de las personas del equipo (dueños, vendedores, atención al cliente)
   - Canales de contacto: teléfono, email, WhatsApp, dirección física si hay

2. CATÁLOGO COMPLETO DE PRODUCTOS / SERVICIOS
   - Nombre de cada producto/servicio con descripción breve
   - Precios exactos si están mencionados (incluyendo moneda)
   - Variantes disponibles (talles, colores, medidas, etc.)
   - Materiales, calidad, origen

3. ENVÍOS Y ENTREGAS
   - Tiempos de entrega por zona (capital, interior, internacional)
   - Costos de envío
   - A partir de qué monto hay envío gratis
   - Couriers o transportistas que usan
   - Horarios de despacho

4. CAMBIOS, DEVOLUCIONES Y GARANTÍAS
   - Plazo para hacer cambios/devoluciones
   - Condiciones y excepciones
   - Cómo iniciar un reclamo
   - Garantía de productos

5. FORMAS DE PAGO Y FINANCIACIÓN
   - Métodos de pago aceptados (tarjetas, transferencia, efectivo, etc.)
   - Cuotas sin interés disponibles
   - Descuentos por forma de pago

6. PREGUNTAS FRECUENTES Y DATOS CLAVE
   - Preguntas más comunes que tendría un cliente nuevo
   - Respuestas exactas que da el negocio
   - Información de atención al cliente (horarios, respuesta típica)

Sé exhaustivo. Si el sitio tiene precios, incluilos. Si tiene horarios, incluilos. Si hay nombres de personas, incluilos. No inventes información que no esté en el texto.`
                },
                { role: 'user', content: combinedText }
              ],
              temperature: 0.2,
              max_tokens: 2500,
            }),
          });

          if (openaiWebRes.ok) {
            const webResJson = await openaiWebRes.json();
            websiteSummary = webResJson.choices?.[0]?.message?.content?.trim() || '';
          } else {
            console.warn('[Unified Scraper] Web summary API error status:', openaiWebRes.status);
          }
        }
      }
    } catch (e: any) {
      console.error('[Unified Scraper] Web scrape failed:', e);
    }

    if (!websiteSummary) {
      websiteSummary = `Base de Conocimiento de Sitio Web (Modo Demostración):

1. DESCRIPCIÓN DEL NEGOCIO
- Somos ${business_name || 'el negocio'}, una tienda online enfocada en ofrecer productos de alta calidad y un servicio de excelencia a todos nuestros clientes.
- Contacto: soporte@example.com | WhatsApp: +54 9 11 1234-5678.

2. CATÁLOGO DE PRODUCTOS
- Ofrecemos una amplia selección de productos premium con descripciones detalladas y precios competitivos.

3. ENVÍOS Y ENTREGAS
- Realizamos envíos a todo el país a través de los principales couriers. Los despachos se realizan dentro de las 24-48 horas hábiles posteriores a la compra.
- Envío bonificado a partir de compras que superen el monto mínimo especificado en el carrito de compras.

4. CAMBIOS Y DEVOLUCIONES
- Plazo de cambios: hasta 30 días corridos a partir de la recepción del producto. El mismo debe estar sin uso y en su empaque original.

5. FORMAS DE PAGO
- Aceptamos todas las tarjetas de crédito/débito, transferencias bancarias directas y saldos de billeteras virtuales.`;
    }

    let metaToken = userMetaToken || '';
    if (!metaToken && (igId || fbPageId)) {
      try {
        const { data: tokenData } = await supabase
          .from('AgencySettings')
          .select('value')
          .eq('key', 'meta_ads_token')
          .maybeSingle();
        metaToken = tokenData?.value || '';
      } catch (tokenErr) {
        console.error('[Unified Scraper] Error fetching Meta token:', tokenErr);
      }
    }

    let instagramRawContent = '';
    if (igId && metaToken) {
      console.log(`[Unified Scraper] Fetching Instagram posts for ID: ${igId}`);
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v21.0/${igId}/media?fields=id,caption,media_type,timestamp,permalink&limit=15&access_token=${metaToken}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (igRes.ok) {
          const igData = await igRes.json();
          const mediaItems = igData.data || [];
          instagramRawContent = mediaItems
            .map((item: any, i: number) => {
              if (!item.caption) return '';
              return `[Post IG ${i + 1} - ${new Date(item.timestamp).toLocaleDateString()}] "${item.caption.replace(/\s+/g, ' ').trim()}"`;
            })
            .filter(Boolean)
            .join('\n\n');
        }
      } catch (igErr) {
        console.error('[Unified Scraper] IG fetch failed:', igErr);
      }
    }

    let facebookRawContent = '';
    const generalFbTokenToUse = pageMetaToken || userMetaToken || metaToken;
    if (fbPageId && generalFbTokenToUse) {
      console.log(`[Unified Scraper] Fetching Facebook posts for ID: ${fbPageId}`);
      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v21.0/${fbPageId}/feed?fields=id,message,created_time&limit=15&access_token=${generalFbTokenToUse}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          const feedItems = fbData.data || [];
          facebookRawContent = feedItems
            .map((item: any, i: number) => {
              if (!item.message) return '';
              return `[Post FB ${i + 1} - ${new Date(item.created_time).toLocaleDateString()}] "${item.message.replace(/\s+/g, ' ').trim()}"`;
            })
            .filter(Boolean)
            .join('\n\n');
        }
      } catch (fbErr) {
        console.error('[Unified Scraper] FB fetch failed:', fbErr);
      }
    }

    let socialSummary = '';
    const compiledSocial = [
      instagramRawContent ? `--- PUBLICACIONES DE INSTAGRAM ---\n${instagramRawContent}` : '',
      facebookRawContent ? `--- PUBLICACIONES DE FACEBOOK ---\n${facebookRawContent}` : ''
    ].filter(Boolean).join('\n\n');

    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';

    if (compiledSocial && geminiKey) {
      try {
        const systemPrompt = `You are an expert social media analyst. Summarize this business's social media presence in Spanish into 3 brief sections:
1. PRODUCTOS MAS DESTACADOS (Lista corta de productos recurrentes o promocionados)
2. PRECIOS Y PROMOCIONES ACTIVAS (Descuentos, cuotas, envíos gratis)
3. ESTILO DE COMUNICACIÓN Y HASHTAGS (Tono informal, alegre, modismos)`;

        const geminiBody = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ 
            role: 'user', 
            parts: [{ text: compiledSocial.slice(0, 24000) }] 
          }],
          generationConfig: { 
            temperature: 0.3
          }
        };

        const geminiSocialRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
          }
        );

        if (geminiSocialRes.ok) {
          const geminiData = await geminiSocialRes.json();
          socialSummary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        } else {
          console.warn('[Unified Scraper] Social summary API error status:', geminiSocialRes.status);
        }
      } catch (socialSumErr) {
        console.error('[Unified Scraper] Social summary failed:', socialSumErr);
      }
    }

    if (!socialSummary && (igId || fbPageId)) {
      socialSummary = `Resumen de Redes Sociales (Modo Demostración):
1. PRODUCTOS DESTACADOS: Variedad de artículos de temporada, tendencias actuales y alta demanda en la tienda online.
2. PRECIOS Y PROMOCIONES ACTIVAS: Beneficios exclusivos de bienvenida y opciones de envíos bonificados según el volumen de compra.
3. ESTILO DE COMUNICACIÓN: Tono informal, dinámico y muy cercano. Uso habitual de voseo amigable.`;
    }

    const finalWebSummary = websiteSummary || 'No se pudo extraer información detallada del sitio web en este intento.';
    const finalSocialSummary = socialSummary || 'Redes sociales no vinculadas.';

    let autoCatalog = '';
    let autoInstructions = '';
    
    if (geminiKey) {
      try {
        const systemPrompt = `You are a professional business strategist and AI prompt engineer.
Your task is to take the extracted knowledge of website and social media of "${business_name}" and generate optimal content for two settings fields:

1. "business_description" (Manual Context & Catalog):
   Summarize key support rules, catalog details, return processes, shipping options, and FAQ answers into a highly concise and actionable summary. Limit to 350 words.

2. "custom_instructions" (Tone & Style Rules):
   CRITICAL REQUIREMENT: Write optimal tone guidelines explicitly mandating friendly, informal, warm and cheerful support using Argentine Spanish voseo ("vos", "tenés", "mirá", "comprá", "escribinos", "dejame", etc.). Include guidelines for using moderate emojis, keeping responses short/concise (max 1-2 paragraphs), and being highly helpful. Avoid sounding robotic. Limit to 120 words.

CRITICAL: Return your output ONLY as a raw JSON object with the keys "business_description" and "custom_instructions".`;

        const geminiBody = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ 
            role: 'user', 
            parts: [{ text: `INFORMACIÓN SITIO WEB:\n${finalWebSummary.slice(0, 40000)}\n\nINFORMACIÓN REDES SOCIALES:\n${finalSocialSummary.slice(0, 8000)}` }] 
          }],
          generationConfig: { 
            temperature: 0.3,
            responseMimeType: "application/json"
          }
        };

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed = JSON.parse(responseText);
          autoCatalog = parsed.business_description || '';
          autoInstructions = parsed.custom_instructions || '';
        } else {
          console.warn('[Unified Scraper] AI fields API error status:', geminiRes.status);
        }
      } catch (fieldsErr) {
        console.error('[Unified Scraper] AI fields generation failed:', fieldsErr);
      }
    }

    const finalCatalog = autoCatalog || `Catálogo y soporte para ${business_name} basado en el sitio web oficial.`;
    const finalInstructions = autoInstructions || `Responde siempre con el tono e información oficial de ${business_name}. Usa el voseo argentino de manera cordial y amigable ("vos", "tenés", "comprá", "mirá"). Mantén las respuestas claras y breves.`;

    const nowTimestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('car_clients')
      .update({
        scraped_content: finalWebSummary,
        instagram_context: finalSocialSummary,
        business_description: finalCatalog,
        custom_instructions: finalInstructions,
        website_url: targetUrl,
        brain_updated_at: nowTimestamp
      })
      .eq('id', clientId);

    if (updateError) {
      return res.status(500).json({ 
        error: 'Error al actualizar el cerebro en la base de datos.', 
        detail: updateError.message 
      });
    }

    return res.status(200).json({
      scraped_content: finalWebSummary,
      instagram_context: finalSocialSummary,
      business_description: finalCatalog,
      custom_instructions: finalInstructions,
      website_url: targetUrl,
      brain_updated_at: nowTimestamp
    });

  } catch (err: any) {
    console.error('[Unified Scraper] Error:', err);
    return res.status(500).json({ error: `Error interno de servidor: ${err.message}` });
  }
}
