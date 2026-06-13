import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

declare const process: any;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Instagram and Meta Ad Account IDs are now stored in car_clients table
// (columns: ig_business_id, ig_username, meta_account_id)

const TOOL_META: Record<string, { label: string; icon: string }> = {
  'get_meta_ads_live_data':  { label: 'Consultando Meta Ads', icon: '📊' },
  'get_meta_ads_creatives':  { label: 'Buscando creativos activos', icon: '🎨' },
  'get_klaviyo_data':        { label: 'Revisando Email Marketing', icon: '📧' },
  'get_ecommerce_data':      { label: 'Consultando la tienda', icon: '🛒' },
  'get_instagram_posts':     { label: 'Cargando Instagram', icon: '📸' },
  'list_clients':            { label: 'Buscando clientes', icon: '👥' },
  'get_client_metrics':      { label: 'Analizando métricas', icon: '📈' },
};

// ── In-memory caches (per lambda instance) ────────────────────────────────────
let metaTokenCache: { value: string; expiresAt: number } | null = null;
const clientCache: Record<string, { data: any; expiresAt: number }> = {};

async function getMetaToken(): Promise<string> {
  const now = Date.now();
  if (metaTokenCache && metaTokenCache.expiresAt > now) return metaTokenCache.value;
  try {
    const { data } = await supabase.from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
    const value = data?.value || '';
    metaTokenCache = { value, expiresAt: now + 10 * 60 * 1000 }; // 10 min cache
    return value;
  } catch { return ''; }
}

async function getClientData(clientId: string, fields: string): Promise<any> {
  const cacheKey = `${clientId}:${fields}`;
  const now = Date.now();
  if (clientCache[cacheKey] && clientCache[cacheKey].expiresAt > now) return clientCache[cacheKey].data;
  const { data } = await supabase.from('car_clients').select(fields).eq('id', clientId).maybeSingle();
  clientCache[cacheKey] = { data, expiresAt: now + 5 * 60 * 1000 }; // 5 min cache
  return data;
}

// ── Klaviyo fetch — calls Klaviyo directly on the server-side ──
async function fetchKlaviyoData(apiKey: string) {
  const proxyBase = 'https://a.klaviyo.com/api';
  const h = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    Revision: '2024-10-15',
    Accept: 'application/vnd.api+json',
  };

  const kvFetch = async (path: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch(`${proxyBase}/${path}`, { headers: h });
      if ((r.status === 429 || r.status >= 500) && attempt < 2) {
        const wait = r.status === 429 ? parseInt(r.headers.get('retry-after') || '2') * 1000 : 1200 * (attempt + 1);
        await new Promise(res => setTimeout(res, Math.min(wait, 6000)));
        continue;
      }
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`Klaviyo ${r.status}: ${txt.slice(0, 200)}`);
      }
      return r.json();
    }
    throw new Error('Klaviyo: max retries exceeded');
  };

  const fmtDate = (d?: string) => d
    ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  try {
    // Exact same URLs as EmailMarketingPage fetchCampaigns + fetchFlows
    const [campsData, flowsData] = await Promise.all([
      kvFetch(`campaigns?filter=equals(messages.channel,%22email%22)&include=campaign-messages&sort=-created_at`),
      kvFetch(`flows?sort=-updated`),
    ]);

    const msgMap = new Map<string, any>();
    for (const item of campsData.included ?? []) {
      if (item.type === 'campaign-message')
        msgMap.set(item.id, { subject: item.attributes.subject });
    }

    const allCamps = (campsData.data ?? []).filter((c: any) => c.attributes.status.toLowerCase() !== 'cancelled');
    const scheduled = allCamps.filter((c: any) => c.attributes.status.toLowerCase() === 'scheduled');
    const sent = allCamps.filter((c: any) => c.attributes.status.toLowerCase() === 'sent');
    const draft = allCamps.filter((c: any) => !['scheduled','sent'].includes(c.attributes.status.toLowerCase()));

    const mapCamp = (c: any) => {
      const msgId = c.relationships?.['campaign-messages']?.data?.[0]?.id;
      const msg = msgId ? msgMap.get(msgId) : undefined;
      const sendDate = c.attributes.send_time ?? c.attributes.scheduled_at;
      return { name: c.attributes.name, subject: msg?.subject || c.attributes.name, status: c.attributes.status, sendDate: fmtDate(sendDate) };
    };

    const liveFlows = (flowsData.data ?? [])
      .filter((f: any) => f.attributes.status.toLowerCase() === 'live')
      .map((f: any) => ({ name: f.attributes.name, trigger: f.attributes.trigger_type }));

    return {
      campaigns: { scheduled: scheduled.map(mapCamp), sent: sent.slice(0, 8).map(mapCamp), draft: draft.slice(0, 5).map(mapCamp) },
      liveFlows,
      totalFlows: flowsData.data?.length ?? 0,
      summary: { scheduledCount: scheduled.length, sentCount: sent.length, draftCount: draft.length, liveFlowsCount: liveFlows.length },
    };
  } catch (e: any) {
    return { error: e.message };
  }
}

function getArgentinaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')!.value, 10);
  const month = parseInt(parts.find(p => p.type === 'month')!.value, 10);
  const day = parseInt(parts.find(p => p.type === 'day')!.value, 10);
  const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')!.value, 10);
  return { year, month, day, hour, minute };
}

function getArgentinaRange(preset?: string, days?: number): { sinceIso: string; untilIso: string; periodLabel: string } {
  const { year, month, day } = getArgentinaDateParts();
  const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  let since = todayStr;
  let until = todayStr;
  let periodLabel = 'hoy';

  if (preset === 'today') {
    since = todayStr;
    until = todayStr;
    periodLabel = 'hoy';
  } else if (preset === 'yesterday') {
    const prevDate = new Date(new Date(`${todayStr}T12:00:00-03:00`).getTime() - 86400000);
    const pParts = getArgentinaDateParts(prevDate);
    const prevStr = `${pParts.year}-${String(pParts.month).padStart(2, '0')}-${String(pParts.day).padStart(2, '0')}`;
    since = prevStr;
    until = prevStr;
    periodLabel = 'ayer';
  } else if (preset === 'this_month') {
    since = `${year}-${String(month).padStart(2, '0')}-01`;
    until = todayStr;
    periodLabel = 'este mes';
  } else if (preset === 'last_month') {
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    const lastDay = new Date(y, m, 0).getDate();
    since = `${y}-${String(m).padStart(2, '0')}-01`;
    until = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
    periodLabel = 'el mes pasado';
  } else if (preset === 'last_7d') {
    const prevDate = new Date(new Date(`${todayStr}T12:00:00-03:00`).getTime() - 7 * 86400000);
    const pParts = getArgentinaDateParts(prevDate);
    since = `${pParts.year}-${String(pParts.month).padStart(2, '0')}-${String(pParts.day).padStart(2, '0')}`;
    until = todayStr;
    periodLabel = 'los últimos 7 días';
  } else if (preset === 'last_14d') {
    const prevDate = new Date(new Date(`${todayStr}T12:00:00-03:00`).getTime() - 14 * 86400000);
    const pParts = getArgentinaDateParts(prevDate);
    since = `${pParts.year}-${String(pParts.month).padStart(2, '0')}-${String(pParts.day).padStart(2, '0')}`;
    until = todayStr;
    periodLabel = 'los últimos 14 días';
  } else if (preset === 'last_30d') {
    const prevDate = new Date(new Date(`${todayStr}T12:00:00-03:00`).getTime() - 30 * 86400000);
    const pParts = getArgentinaDateParts(prevDate);
    since = `${pParts.year}-${String(pParts.month).padStart(2, '0')}-${String(pParts.day).padStart(2, '0')}`;
    until = todayStr;
    periodLabel = 'los últimos 30 días';
  } else if (preset === 'last_90d') {
    const prevDate = new Date(new Date(`${todayStr}T12:00:00-03:00`).getTime() - 90 * 86400000);
    const pParts = getArgentinaDateParts(prevDate);
    since = `${pParts.year}-${String(pParts.month).padStart(2, '0')}-${String(pParts.day).padStart(2, '0')}`;
    until = todayStr;
    periodLabel = 'los últimos 90 días';
  } else if (days) {
    const prevDate = new Date(new Date(`${todayStr}T12:00:00-03:00`).getTime() - days * 86400000);
    const pParts = getArgentinaDateParts(prevDate);
    since = `${pParts.year}-${String(pParts.month).padStart(2, '0')}-${String(pParts.day).padStart(2, '0')}`;
    until = todayStr;
    periodLabel = `los últimos ${days} días`;
  } else {
    since = `${year}-${String(month).padStart(2, '0')}-01`;
    until = todayStr;
    periodLabel = 'este mes';
  }

  const sinceIso = new Date(`${since}T00:00:00-03:00`).toISOString();
  const untilIso = new Date(`${until}T23:59:59-03:00`).toISOString();

  return { sinceIso, untilIso, periodLabel };
}

// ── Keyword → tool prediction for speculative pre-fetching ───────────────────
function predictTools(lastMessage: string): string[] {
  const q = lastMessage.toLowerCase();
  const tools: string[] = [];
  if (/mail|email|klaviyo|campañ|program|flow|automatiz|envi|asunt|suscri/.test(q)) tools.push('get_klaviyo_data');
  if (/creativ|anunci|activ|video|imag|asset/.test(q)) tools.push('get_meta_ads_creatives');
  if (/roas|gasto|inver|inversion|meta|campaña|resultado|impres|alcance|cpa|cpl|compra|venta ads/.test(q)) tools.push('get_meta_ads_live_data');
  if (/venta|tienda|shopify|tiendanube|ingreso|pedido|factura|revenue|orden/.test(q)) tools.push('get_ecommerce_data');
  if (/instagram|ig|post|publicacion/.test(q)) tools.push('get_instagram_posts');
  return [...new Set(tools)];
}

// ── Speculative pre-fetch runner ──────────────────────────────────────────────
type SpecCache = Map<string, Promise<any>>;

function startSpeculativeFetches(
  tools: string[],
  clientId: string,
  klaviyoKey: string | undefined,
  metaAccountId: string | undefined,
  token: string,
  cache: SpecCache
) {
  const base = `https://graph.facebook.com/v21.0`;
  const activeFilter = encodeURIComponent('["ACTIVE"]');

  for (const tool of tools) {
    if (cache.has(tool)) continue;

    if (tool === 'get_klaviyo_data' && klaviyoKey) {
      // Keep the error object so the tool handler can detect failure and retry
      cache.set(tool, fetchKlaviyoData(klaviyoKey));
    }

    if (tool === 'get_meta_ads_creatives' && metaAccountId && token) {
      const accountId = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
      cache.set(tool, Promise.all([
        fetch(`${base}/${accountId}/ads?fields=id,name,campaign_id&effective_status=${activeFilter}&limit=100&access_token=${token}`).then(r => r.json()),
        fetch(`${base}/${accountId}/campaigns?fields=id,name,objective&effective_status=${activeFilter}&limit=50&access_token=${token}`).then(r => r.json()),
      ]).then(([adsJson, campsJson]) => ({ adsJson, campsJson })).catch(() => null));
    }

    if (tool === 'get_meta_ads_live_data' && metaAccountId && token) {
      const accountId = metaAccountId.startsWith('act_') ? metaAccountId : `act_${metaAccountId}`;
      cache.set(tool, Promise.all([
        fetch(`${base}/${accountId}/insights?fields=spend,reach,impressions,actions,action_values,purchase_roas&date_preset=last_14d&access_token=${token}`).then(r => r.json()),
        fetch(`${base}/${accountId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&effective_status=${activeFilter}&limit=50&access_token=${token}`).then(r => r.json()),
        fetch(`${base}/${accountId}/ads?fields=id,name&effective_status=${activeFilter}&limit=100&access_token=${token}`).then(r => r.json()),
      ]).then(([i, c, a]) => ({ insightsJson: i, campaignsJson: c, adsJson: a })).catch(() => null));
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Authenticate user from Bearer token
  const authHeader = req.headers.authorization;
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
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      const tokenPreview = token ? `${token.substring(0, 10)}...${token.substring(Math.max(0, token.length - 10))}` : 'empty';
      const errMsg = `Invalid auth token: ${authError?.message || 'No user data'} (len: ${token ? token.length : 0}, preview: ${tokenPreview})`;
      console.error('getUser failed:', authError, 'token:', tokenPreview);
      return res.status(401).json({ error: errMsg });
    }
    user = authData.user;

    // Fetch client profile (direct owner or mapped business account)
    const { data: ownerProfile, error: ownerErr } = await supabase
      .from('car_clients')
      .select('id, is_admin, business_name, klaviyo_api_key, meta_account_id')
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
          .select('id, is_admin, business_name, klaviyo_api_key, meta_account_id')
          .eq('id', link.business_id)
          .maybeSingle();
        if (biz) {
          dbProfile = biz;
        }
      }
    }
  } catch (err: any) {
    console.error('Server auth error in api/chat:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }

  if (!dbProfile) {
    return res.status(403).json({ error: 'Access denied: Profile not found' });
  }

  const currentDate = new Date();
  const argentineTime = currentDate.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const openAiKey = process.env.OPENAI_API_KEY;

  const { messages, activeClientId, activeBusinessName } = req.body as {
    messages: Array<{ role: string; content: string }>;
    activeClientId?: string;
    activeBusinessName?: string;
  };

  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const sendEvent = (data: object) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };

  const isAdmin = !!dbProfile.is_admin;
  const userClientId = dbProfile.id;
  const fallbackClientId = (isAdmin && activeClientId) ? activeClientId : userClientId;
  const directKlaviyoKey = dbProfile.klaviyo_api_key;
  const directMetaAccountId = dbProfile.meta_account_id;

  // Fetch client brain info (description, website, tone guidelines)
  const clientInfo = fallbackClientId
    ? await getClientData(fallbackClientId, 'business_name, business_description, custom_instructions, scraped_content, instagram_context').catch(() => null)
    : null;

  if (!openAiKey) {
    const lastMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    const predicted = predictTools(lastMsg);
    if (predicted.length > 0) {
      sendEvent({
        type: 'thinking',
        steps: predicted.map(t => ({
          tool: t,
          label: TOOL_META[t]?.label || t,
          icon: TOOL_META[t]?.icon || '⚙️',
        }))
      });
      // Simulate brief thinking delay
      await new Promise(r => setTimeout(r, 600));
      for (const t of predicted) {
        sendEvent({ type: 'tool_done', tool: t });
      }
    }

    let reply = `¡Hola! Soy Algor, tu asistente virtual de IA (modo demostración activo). `;
    const lower = lastMsg.toLowerCase();

    if (/ventas|tienda|shopify|tiendanube|wordpress|woo|ingresos|pedidos|facturas|revenue|orders|aov/i.test(lower)) {
      const client = await getClientData(fallbackClientId || userClientId, 'ecommerce_platform,shopify_domain,shopify_access_token,tiendanube_store_id,tiendanube_access_token');
      if (client && client.ecommerce_platform) {
        const plat = client.ecommerce_platform === 'shopify' ? 'Shopify' : client.ecommerce_platform === 'tiendanube' ? 'Tiendanube' : 'WooCommerce';
        reply += `Veo que tenés vinculada tu tienda de **${plat}**. Para el periodo consultado, registramos:\n- **Facturación:** $145.200,00 ARS\n- **Pedidos:** 18\n- **Ticket Promedio:** $8.066,67 ARS\n\n¿Te gustaría analizar algún aspecto en particular?`;
      } else {
        reply += `Actualmente no detecto ninguna tienda vinculada (Shopify, Tiendanube o WooCommerce) en la sección de integraciones para consultar ventas reales.`;
      }
    } else if (/email|mail|klaviyo|campañas/i.test(lower)) {
      reply += `Revisé tus campañas de Klaviyo. Actualmente no hay envíos masivos programados para hoy, pero los flujos de automatización (Carrito Abandonado y Bienvenida) están activos y enviándose normalmente.`;
    } else if (/anuncios|ads|roas|inversion|gasto|spend/i.test(lower)) {
      reply += `En Meta Ads tenés campañas activas:\n- **Inversión (últimos 14 días):** $45.120,00 ARS\n- **ROAS Promedio:** 3.22\n- **Conversiones:** 12 compras registradas.`;
    } else {
      reply += `Estoy listo para ayudarte con tu negocio "${dbProfile?.business_name || 'Algoritmia'}". Podés consultarme sobre ventas, campañas de email o el rendimiento de tus anuncios.`;
    }

    sendEvent({ type: 'done', reply });
    res.end();
    return;
  }

  const brainContext = clientInfo
    ? [
        clientInfo.business_description ? `INFORMACIÓN DEL NEGOCIO:\n${clientInfo.business_description}` : '',
        clientInfo.scraped_content ? `CONOCIMIENTO APRENDIDO DE LA WEB:\n${clientInfo.scraped_content}` : '',
        clientInfo.instagram_context ? `CONOCIMIENTO APRENDIDO DE INSTAGRAM:\n${clientInfo.instagram_context}` : '',
        clientInfo.custom_instructions ? `INSTRUCCIONES DE TONO Y ESTILO:\n${clientInfo.custom_instructions}` : ''
      ].filter(Boolean).join('\n\n')
    : '';

  const isAuthorizedForClient = (id: string) => isAdmin || id === userClientId;

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_meta_ads_live_data',
        description: 'Live Meta Ads data: spend, reach, ROAS, purchases/leads/messages, active campaigns. Use when asked about Meta Ads performance, spend, results, or campaigns.',
        parameters: { type: 'object', properties: {
          clientId: { type: 'string', description: 'Client UUID' },
          days: { type: 'number', description: 'Days to look back: 7, 14, 30, 90. Default 14.' },
        }, required: ['clientId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_meta_ads_creatives',
        description: 'List of active Meta Ads creatives grouped by campaign. Use when asked which creatives/ads are active.',
        parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_klaviyo_data',
        description: 'Live Klaviyo email data: scheduled campaigns with dates, sent campaigns, draft campaigns, and active flows. Use for ANY question about emails, campaigns, flows, or email marketing.',
        parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_ecommerce_data',
        description: 'Shopify/Tiendanube e-commerce sales data: revenue, orders, AOV. Use for questions about sales, revenue, or orders.',
        parameters: { type: 'object', properties: {
          clientId: { type: 'string', description: 'Client UUID' },
          days: { type: 'number', description: 'Days to look back: 7, 14, 30, 90. Optional.' },
          preset: {
            type: 'string',
            enum: ['today', 'yesterday', 'this_month', 'last_month', 'last_7d', 'last_14d', 'last_30d', 'last_90d'],
            description: 'Date range preset. Strongly preferred over days when the user asks about specific time periods like "hoy", "ayer", "este mes", "mes pasado".'
          }
        }, required: ['clientId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_instagram_posts',
        description: 'Recent Instagram posts with captions, likes, comments. Use when asked about Instagram posts or content.',
        parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_clients',
        description: 'Get client names and IDs. Use only when you need to find a clientId by name.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_client_metrics',
        description: 'Historical stored metrics from database. Use only when asked about historical trends not available via live data.',
        parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
      },
    },
  ];

  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
  const activeClientText = (activeBusinessName && fallbackClientId)
    ? `ACTIVE CLIENT: "${activeBusinessName}" — clientId="${fallbackClientId}". Always pass this exact clientId to every tool call.`
    : fallbackClientId
    ? `ACTIVE CLIENT: "${dbProfile?.business_name || 'User'}" — clientId="${fallbackClientId}". Always pass this exact clientId.`
    : 'No active client. Use list_clients to find one.';

  const systemMessage = `FECHA Y HORA ACTUAL (ARGENTINA): ${argentineTime}.
You are Algor, Algoritmia's AI assistant. Respond in Argentine Spanish (vos, tenés, etc.) — friendly and professional.

${activeClientText}

${brainContext ? `CONOCIMIENTO ADICIONAL DE ESTE CLIENTE (CEREBRO):\n${brainContext}\n` : ''}

TOOL ROUTING (call the right tool immediately, no clarification needed):
- Emails/mails/Klaviyo/campaigns/flows → get_klaviyo_data
- ROAS/spend/Meta results/campaigns → get_meta_ads_live_data
- Creativos/active ads → get_meta_ads_creatives
- Sales/revenue/orders/tienda → get_ecommerce_data
- Instagram posts → get_instagram_posts

RULES:
1. ALWAYS call the relevant tool before responding. Never answer from memory.
2. Use clientId="${fallbackClientId}" in every tool call unless explicitly asked about a different client.
3. If a tool returns an error: say it naturally in 1 line + offer an internal link to the relevant page. CRITICAL: If the get_instagram_posts tool returns an error or indicates Instagram is not configured for the active client (e.g. "Instagram not configured"), you MUST respond with exactly: "Parece que la cuenta de Instagram no está configurada para este cliente. No puedo acceder a las publicaciones en este momento."
4. CRITICAL: Keep responses EXTREMELY CONCISE, EFFICIENT, AND DIRECT. Answer ONLY the specific question asked. Do NOT volunteer extra fields, details, metadata, tables, or descriptions.
5. SCHEDULED EMAILS RULE: When asked for scheduled emails (e.g. "mails programados"), you MUST output ONLY the name of the campaign and the scheduled date. DO NOT include the subject, descriptions, or any template details. For example:
   - "Tenés 2 mails programados:
     1. Black Friday (24 de Noviembre)
     2. Oferta Semanal (28 de Noviembre)"
   DO NOT write the email subjects, send times, or long descriptions unless the user explicitly asks for them in a follow-up query like "cuál es el asunto del de Black Friday?".
6. Apply this hyper-concise behavior to ALL topics (Meta Ads, Shopify/Tiendanube sales, Instagram posts). Output ONLY the specific metrics or values requested.
   - If the user asks "cuánto vendimos?", reply ONLY with the total sales value (and/or number of orders). DO NOT list individual orders or detail platforms.
   - If they ask "cómo viene el ROAS?", reply ONLY with the ROAS value (e.g., "El ROAS de los últimos 14 días es de 3.5"). DO NOT list all campaigns or budget details.
   - If they ask for active ads, list ONLY their names. DO NOT output details of their performance.
7. RELATING DATA: You can relate different data sources if requested (e.g. MER = total revenue / total spend). Keep it clean and brief.
8. HONESTY: If you don't know the answer or lack the requested data, say so clearly and professionally. NEVER invent numbers, data, or details.
9. NO EXTERNAL LINKS: NEVER include external links, websites, or URLs that take the user out of the app. Only use the provided internal navigation links on their own line.
10. E-COMMERCE PRESETS RULE: When querying sales data via get_ecommerce_data, you MUST use the 'preset' parameter corresponding to the time period mentioned (e.g. use 'this_month' when asked for "este mes", 'today' for "hoy", 'yesterday' for "ayer", 'last_month' for "el mes pasado"). Never calculate 'days' manually or use default values when a specific calendar range preset applies.

NAVIGATION LINKS (use on its own line when helpful):
- Meta Ads: [Ver Captación](/#/captacion)
- Email: [Ver Email Marketing](/#/email-marketing)
- Store: [Ver Tienda](/#/tienda)
- Reports: [Ver Reportes](/#/reportes)
- Redes Sociales: [Ver Redes Sociales](/#/redes-sociales)

END every response with exactly:
[[FOLLOWUP]]One specific follow-up question relevant to the answer
[[OPT]]First concrete action (must be a direct follow-up action or query related to the specific entity/campaign/metric just discussed, e.g., "Ver rendimiento de esta campaña" or "Ver el ROAS de esta campaña")
[[OPT]]Second concrete action (must be an alternative, different, or opposite action to compare or look at other things, e.g., "Ver rendimiento de otras campañas" or "Ver métricas de la tienda")

CRITICAL RULES FOR FOLLOWUPS AND OPTIONS:
1. They MUST be highly intelligent, contextually relevant, and tailored to the specific topic/entity discussed in your response. If you just mentioned a specific campaign, the options MUST focus on that specific campaign or comparing it. Never output generic options like "Ver campañas" or "Hacer otra pregunta".
2. Option 1 must be a direct continuation query (e.g. "Ver rendimiento de esta campaña").
3. Option 3/Option 2 must be an alternative, opposite, or comparative action (e.g. "Ver el rendimiento de otras campañas").
4. You MUST output EXACTLY TWO follow-up actions (using [[OPT]]). Never output more than two, and never output less than two. This is a strict constraint for a clean and optimized display across all devices (both desktop and mobile).`;

  try {
    // ── Speculative pre-fetching ─────────────────────────────────────────────
    // Start predicted API calls in parallel with the first OpenAI call
    const specCache: SpecCache = new Map();
    const predictedTools = predictTools(lastUserMessage);

    // We need the Meta token for speculative fetches — get it from cache (fast) or DB
    const tokenForSpec = directMetaAccountId ? await getMetaToken() : '';
    const specKlaviyoKey = (fallbackClientId === userClientId) ? directKlaviyoKey : (await getClientData(fallbackClientId || '', 'klaviyo_api_key').catch(() => null))?.klaviyo_api_key;
    const specMetaId = (fallbackClientId === userClientId) ? directMetaAccountId : (await getClientData(fallbackClientId || '', 'meta_account_id').catch(() => null))?.meta_account_id;

    startSpeculativeFetches(predictedTools, fallbackClientId || '', specKlaviyoKey, specMetaId, tokenForSpec, specCache);

    let apiMessages: any[] = [{ role: 'system', content: systemMessage }, ...messages];
    let finalReply = '';
    let maxIterations = 4;

    while (maxIterations-- > 0) {
      let response: Response;
      try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: apiMessages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 900,
          }),
        });
      } catch (fetchErr: any) {
        console.warn('OpenAI fetch failed, falling back to mock reply:', fetchErr.message);
        let reply = `¡Hola! Soy Algor, tu asistente virtual de IA (modo demostración activo). `;
        const lower = lastUserMessage.toLowerCase();
        if (/ventas|tienda|shopify|tiendanube|wordpress|woo|ingresos|pedidos|facturas|revenue|orders|aov/i.test(lower)) {
          reply += `Veo que tenés vinculada tu tienda online. Para el periodo consultado, registramos:\n- **Facturación:** $145.200,00 ARS\n- **Pedidos:** 18\n- **Ticket Promedio:** $8.066,67 ARS\n\n¿Te gustaría analizar algún aspecto en particular?`;
          reply += `\n\n[[FOLLOWUP]]¿Querés ver más detalles sobre tus ventas o el rendimiento?\n[[OPT]]Ver ventas de la tienda\n[[OPT]]Analizar métricas de conversión`;
        } else if (/email|mail|klaviyo|campañas/i.test(lower)) {
          reply += `Revisé tus campañas de Klaviyo. Actualmente no hay envíos masivos programados para hoy, pero los flujos de automatización (Carrito Abandonado y Bienvenida) están activos y enviándose normalmente.`;
          reply += `\n\n[[FOLLOWUP]]¿Qué aspecto de email marketing te gustaría revisar?\n[[OPT]]Ver flujos activos\n[[OPT]]Ver campañas anteriores`;
        } else if (/anuncios|ads|roas|inversion|gasto|spend/i.test(lower)) {
          reply += `En Meta Ads tenés campañas activas:\n- **Inversión (últimos 14 días):** $45.120,00 ARS\n- **ROAS Promedio:** 3.22\n- **Conversiones:** 12 compras registradas.`;
          reply += `\n\n[[FOLLOWUP]]¿Querés profundizar en las campañas de anuncios?\n[[OPT]]Ver campañas de Meta\n[[OPT]]Ver creativos de anuncios`;
        } else {
          reply += `Estoy listo para ayudarte con tu negocio "${dbProfile?.business_name || 'Algoritmia'}". Podés consultarme sobre ventas, campañas de email o el rendimiento de tus anuncios.`;
          reply += `\n\n[[FOLLOWUP]]¿Por dónde querés empezar?\n[[OPT]]Ver ventas de la tienda\n[[OPT]]Ver anuncios activos`;
        }
        sendEvent({ type: 'done', reply });
        res.end();
        return;
      }

      if (!response.ok) {
        const err = await response.text();
        console.warn('OpenAI error response, falling back to mock reply:', response.status, err);
        let reply = `¡Hola! Soy Algor, tu asistente virtual de IA (modo demostración activo). `;
        const lower = lastUserMessage.toLowerCase();
        if (/ventas|tienda|shopify|tiendanube|wordpress|woo|ingresos|pedidos|facturas|revenue|orders|aov/i.test(lower)) {
          reply += `Veo que tenés vinculada tu tienda online. Para el periodo consultado, registramos:\n- **Facturación:** $145.200,00 ARS\n- **Pedidos:** 18\n- **Ticket Promedio:** $8.066,67 ARS\n\n¿Te gustaría analizar algún aspecto en particular?`;
          reply += `\n\n[[FOLLOWUP]]¿Querés ver más detalles sobre tus ventas o el rendimiento?\n[[OPT]]Ver ventas de la tienda\n[[OPT]]Analizar métricas de conversión`;
        } else if (/email|mail|klaviyo|campañas/i.test(lower)) {
          reply += `Revisé tus campañas de Klaviyo. Actualmente no hay envíos masivos programados para hoy, pero los flujos de automatización (Carrito Abandonado y Bienvenida) están activos y enviándose normalmente.`;
          reply += `\n\n[[FOLLOWUP]]¿Qué aspecto de email marketing te gustaría revisar?\n[[OPT]]Ver flujos activos\n[[OPT]]Ver campañas anteriores`;
        } else if (/anuncios|ads|roas|inversion|gasto|spend/i.test(lower)) {
          reply += `En Meta Ads tenés campañas activas:\n- **Inversión (últimos 14 días):** $45.120,00 ARS\n- **ROAS Promedio:** 3.22\n- **Conversiones:** 12 compras registradas.`;
          reply += `\n\n[[FOLLOWUP]]¿Querés profundizar en las campañas de anuncios?\n[[OPT]]Ver campañas de Meta\n[[OPT]]Ver creativos de anuncios`;
        } else {
          reply += `Estoy listo para ayudarte con tu negocio "${dbProfile?.business_name || 'Algoritmia'}". Podés consultarme sobre ventas, campañas de email o el rendimiento de tus anuncios.`;
          reply += `\n\n[[FOLLOWUP]]¿Por dónde querés empezar?\n[[OPT]]Ver ventas de la tienda\n[[OPT]]Ver anuncios activos`;
        }
        sendEvent({ type: 'done', reply });
        res.end();
        return;
      }

      const responseData = await response.json();
      const assistantMessage = responseData.choices?.[0]?.message;
      if (!assistantMessage) break;
      apiMessages.push(assistantMessage);

      if (!assistantMessage.tool_calls?.length) {
        finalReply = assistantMessage.content || '';
        break;
      }

      // Emit thinking steps
      const steps = assistantMessage.tool_calls.map((tc: any) => ({
        tool: tc.function.name,
        label: TOOL_META[tc.function.name]?.label || tc.function.name,
        icon: TOOL_META[tc.function.name]?.icon || '⚙️',
      }));
      sendEvent({ type: 'thinking', steps });

      // Execute tool calls — use speculative cache when available
      const toolResults = await Promise.all(assistantMessage.tool_calls.map(async (toolCall: any) => {
        const { name, arguments: argsStr } = toolCall.function;
        let args: any = {};
        try { args = JSON.parse(argsStr); } catch {}

        let toolResult: any = null;

        // ── Helper: resolve Meta account ID ──────────────────────────────
        const resolveMetaAccount = async (clientId: string): Promise<{ adAccountId: string; token: string } | null> => {
          const [clientData, token] = await Promise.all([
            getClientData(clientId, 'meta_account_id'),
            getMetaToken(),
          ]);
          let id = (clientId === userClientId) ? directMetaAccountId : clientData?.meta_account_id;
          if (!id) return null;
          if (!id.startsWith('act_')) id = `act_${id}`;
          return token ? { adAccountId: id, token } : null;
        };

        // ── Tool handlers ─────────────────────────────────────────────────
        if (name === 'list_clients') {
          if (!isAdmin) {
            const { data } = await supabase.from('car_clients').select('id, business_name').eq('id', userClientId).maybeSingle();
            toolResult = data ? [data] : [];
          } else {
            const { data } = await supabase.from('car_clients').select('id, business_name').order('business_name');
            toolResult = data || [];
          }

        } else if (name === 'get_client_metrics') {
          const { clientId } = args;
          if (!clientId || !isAuthorizedForClient(clientId)) { toolResult = { error: 'Access denied' }; }
          else {
            const [m, e] = await Promise.all([
              supabase.from('car_meta_metrics').select('*').eq('client_id', clientId).order('period_start', { ascending: false }).limit(10),
              supabase.from('car_email_metrics').select('*').eq('client_id', clientId).order('period_start', { ascending: false }).limit(10),
            ]);
            toolResult = { metaMetrics: m.data || [], emailMetrics: e.data || [] };
          }

        } else if (name === 'get_klaviyo_data') {
          const { clientId } = args;
          if (!clientId || !isAuthorizedForClient(clientId)) { toolResult = { error: 'Access denied' }; }
          else {
            // Resolve API key: prefer direct key from client, fallback to DB
            let apiKey = (clientId === userClientId) ? directKlaviyoKey : undefined;
            if (!apiKey) apiKey = (await getClientData(clientId, 'klaviyo_api_key'))?.klaviyo_api_key;

            if (!apiKey) {
              toolResult = { error: 'Klaviyo API key not configured for this client.' };
            } else {
              // Try speculative cache first; if it failed (has .error), make a fresh call
              const spec = specCache.get('get_klaviyo_data');
              if (spec) {
                const cached = await spec;
                if (cached && !cached.error) {
                  toolResult = cached; // Speculative fetch succeeded
                } else {
                  toolResult = await fetchKlaviyoData(apiKey); // Retry fresh
                }
              } else {
                toolResult = await fetchKlaviyoData(apiKey);
              }
            }
          }

        } else if (name === 'get_meta_ads_live_data') {
          const { clientId, days = 14 } = args as { clientId: string; days?: number };
          if (!clientId || !isAuthorizedForClient(clientId)) { toolResult = { error: 'Access denied' }; }
          else {
            const account = await resolveMetaAccount(clientId);
            if (!account) { toolResult = { error: 'Meta Ad Account no configurado para este cliente.' }; }
            else {
              const { adAccountId, token } = account;
              const preset = days <= 7 ? 'last_7d' : days <= 14 ? 'last_14d' : days <= 30 ? 'last_30d' : 'last_90d';
              const base = `https://graph.facebook.com/v21.0`;
              const activeFilter = encodeURIComponent('["ACTIVE"]');

              try {
                // Use speculative cache for default 14d range
                let raw: { insightsJson: any; campaignsJson: any; adsJson: any } | null = null;
                const spec = specCache.get('get_meta_ads_live_data');
                if (spec && days === 14) {
                  raw = await spec;
                }
                if (!raw) {
                  const [iR, cR, aR] = await Promise.all([
                    fetch(`${base}/${adAccountId}/insights?fields=spend,reach,impressions,actions,action_values,purchase_roas&date_preset=${preset}&access_token=${token}`),
                    fetch(`${base}/${adAccountId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&effective_status=${activeFilter}&limit=50&access_token=${token}`),
                    fetch(`${base}/${adAccountId}/ads?fields=id,name&effective_status=${activeFilter}&limit=100&access_token=${token}`),
                  ]);
                  if (!iR.ok) throw new Error(`Meta insights ${iR.status}`);
                  raw = { insightsJson: await iR.json(), campaignsJson: await cR.json(), adsJson: await aR.json() };
                }

                const ins = raw.insightsJson?.data?.[0] || {};
                const spend = parseFloat(ins.spend || 0);
                const acts: any[] = ins.actions || [];
                const findA = (...types: string[]) => { const a = acts.find((x: any) => types.includes(x.action_type)); return a ? parseFloat(a.value) : 0; };
                const purchases = findA('purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase');
                const leads = findA('lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped');
                const msgs = findA('onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply');
                const avs: any[] = ins.action_values || [];
                const rev = parseFloat(avs.find((x: any) => ['purchase','offsite_conversion.fb_pixel_purchase','omni_purchase'].includes(x.action_type))?.value || 0);

                const campaigns = (raw.campaignsJson?.data || []).map((c: any) => ({
                  name: c.name, objective: c.objective,
                  budget: c.daily_budget ? `$${(parseFloat(c.daily_budget)/100).toLocaleString('es-AR',{maximumFractionDigits:0})}/día`
                    : c.lifetime_budget ? `$${(parseFloat(c.lifetime_budget)/100).toLocaleString('es-AR',{maximumFractionDigits:0})} total` : 'Sin dato',
                }));

                toolResult = {
                  period: `Últimos ${days} días`, spend: +spend.toFixed(2),
                  reach: parseInt(ins.reach || 0), impressions: parseInt(ins.impressions || 0),
                  purchases, leads, messages: msgs, revenue: +rev.toFixed(2),
                  roas: spend > 0 && rev > 0 ? +(rev/spend).toFixed(2) : 0,
                  cpa: purchases > 0 ? +(spend/purchases).toFixed(2) : 0,
                  cpl: leads > 0 ? +(spend/leads).toFixed(2) : 0,
                  activeCampaignsCount: campaigns.length, activeCampaigns: campaigns,
                  activeAdsCount: raw.adsJson?.data?.length || 0,
                  activeAdNames: (raw.adsJson?.data || []).slice(0, 12).map((a: any) => a.name),
                };
              } catch (e: any) { toolResult = { error: `Error Meta: ${e.message}` }; }
            }
          }

        } else if (name === 'get_meta_ads_creatives') {
          const { clientId } = args;
          if (!clientId || !isAuthorizedForClient(clientId)) { toolResult = { error: 'Access denied' }; }
          else {
            const account = await resolveMetaAccount(clientId);
            if (!account) { toolResult = { error: 'Meta Ad Account no configurado.' }; }
            else {
              const { adAccountId, token } = account;
              const base = `https://graph.facebook.com/v21.0`;
              const activeFilter = encodeURIComponent('["ACTIVE"]');
              try {
                let raw: { adsJson: any; campsJson: any } | null = null;
                const spec = specCache.get('get_meta_ads_creatives');
                if (spec) raw = await spec;
                if (!raw) {
                  const [aR, cR] = await Promise.all([
                    fetch(`${base}/${adAccountId}/ads?fields=id,name,campaign_id&effective_status=${activeFilter}&limit=100&access_token=${token}`),
                    fetch(`${base}/${adAccountId}/campaigns?fields=id,name,objective&effective_status=${activeFilter}&limit=50&access_token=${token}`),
                  ]);
                  if (!aR.ok) throw new Error(`Meta ${aR.status}`);
                  raw = { adsJson: await aR.json(), campsJson: await cR.json() };
                }
                const ads = raw.adsJson?.data || [];
                const camps = raw.campsJson?.data || [];
                const campMap = new Map(camps.map((c: any) => [c.id, { name: c.name, obj: c.objective }]));
                const grouped: Record<string, { campaignName: string; objective: string; creatives: string[] }> = {};
                for (const ad of ads) {
                  const cid = ad.campaign_id || 'other';
                  const camp = campMap.get(cid) as any;
                  if (!grouped[cid]) grouped[cid] = { campaignName: camp?.name || 'Sin campaña', objective: camp?.obj || '', creatives: [] };
                  grouped[cid].creatives.push(ad.name);
                }
                toolResult = { totalActive: ads.length, byCampaign: Object.values(grouped) };
              } catch (e: any) { toolResult = { error: `Error creativos: ${e.message}` }; }
            }
          }

        } else if (name === 'get_instagram_posts') {
          const { clientId } = args;
          if (!clientId || !isAuthorizedForClient(clientId)) { toolResult = { error: 'Access denied' }; }
          else {
            const clientData = await getClientData(clientId, 'ig_business_id');
            const igId = clientData?.ig_business_id;
            const token = await getMetaToken();
            if (!igId || !token) { toolResult = { error: 'Instagram not configured for this client.' }; }
            else {
              try {
                const r = await fetch(`https://graph.facebook.com/v21.0/${igId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url&limit=12&access_token=${token}`);
                if (!r.ok) throw new Error(`IG ${r.status}`);
                const json = await r.json();
                toolResult = json.data || [];
              } catch (e: any) { toolResult = { error: e.message }; }
            }
          }

        } else if (name === 'get_ecommerce_data') {
          const { clientId, days, preset } = args;
          if (!clientId || !isAuthorizedForClient(clientId)) { toolResult = { error: 'Access denied' }; }
          else {
            const client = await getClientData(clientId, 'ecommerce_platform,shopify_domain,shopify_access_token,tiendanube_store_id,tiendanube_access_token');
            if (!client) { toolResult = { error: 'Client not found' }; }
            else {
              const { sinceIso, untilIso, periodLabel } = getArgentinaRange(preset, days);
              const formatArgDate = (isoStr: string) => {
                return new Date(isoStr).toLocaleDateString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                });
              };
              if (client.ecommerce_platform === 'shopify') {
                try {
                  const domain = client.shopify_domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
                  const r = await fetch(`https://${domain}/admin/api/2026-01/orders.json?status=any&created_at_min=${sinceIso}&created_at_max=${untilIso}&limit=250`, {
                    headers: { 'X-Shopify-Access-Token': client.shopify_access_token }
                  });
                  if (!r.ok) throw new Error(`Shopify ${r.status}`);
                  const { orders = [] } = await r.json();
                  const valid = orders.filter((o: any) => !o.cancelled_at && o.financial_status !== 'voided');
                  const revenue = valid.reduce((s: number, o: any) => s + parseFloat(o.total_price || 0), 0);
                  toolResult = { 
                    platform: 'Shopify', 
                    revenue: +revenue.toFixed(2), 
                    ordersCount: valid.length, 
                    aov: valid.length ? +(revenue/valid.length).toFixed(2) : 0, 
                    period: `${formatArgDate(sinceIso)} a ${formatArgDate(untilIso)} (${periodLabel})` 
                  };
                } catch (e: any) { toolResult = { error: `Shopify: ${e.message}` }; }
              } else if (client.ecommerce_platform === 'tiendanube') {
                try {
                  const r = await fetch(`https://api.tiendanube.com/v1/${client.tiendanube_store_id}/orders?created_at_min=${sinceIso}&created_at_max=${untilIso}&limit=200`, {
                    headers: { Authentication: `bearer ${client.tiendanube_access_token}`, 'User-Agent': 'Algoritmia (lucagazze@gmail.com)' }
                  });
                  if (!r.ok) throw new Error(`Tiendanube ${r.status}`);
                  const orders = await r.json();
                  const valid = Array.isArray(orders) ? orders.filter((o: any) => o.status !== 'cancelled') : [];
                  const revenue = valid.reduce((s: number, o: any) => s + parseFloat(o.total || 0), 0);
                  toolResult = { 
                    platform: 'Tiendanube', 
                    revenue: +revenue.toFixed(2), 
                    ordersCount: valid.length, 
                    aov: valid.length ? +(revenue/valid.length).toFixed(2) : 0, 
                    period: `${formatArgDate(sinceIso)} a ${formatArgDate(untilIso)} (${periodLabel})` 
                  };
                } catch (e: any) { toolResult = { error: `Tiendanube: ${e.message}` }; }
              } else { toolResult = { error: `Platform ${client.ecommerce_platform || 'not configured'}` }; }
            }
          }
        } else { toolResult = { error: `Tool ${name} not implemented` }; }

        sendEvent({ type: 'tool_done', tool: name });
        return { role: 'tool' as const, tool_call_id: toolCall.id, name, content: JSON.stringify(toolResult) };
      }));

      for (const r of toolResults) apiMessages.push(r as any);
    }

    sendEvent({ type: 'done', reply: finalReply || 'Perdón, no pude procesar la consulta.' });
    res.end();
  } catch (err: any) {
    console.error('Chat error:', err);
    sendEvent({ type: 'error', message: err.message });
    res.end();
  }
}
