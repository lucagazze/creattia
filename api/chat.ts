import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLIENT_META_MAP: Record<string, { igId?: string; username?: string; adAccountId?: string }> = {
  'df57e4cd-6433-4c2f-a42f-4ad7e59d30dc': { adAccountId: 'act_2136106490563351' },
  '02504445-7e44-4599-8b62-6c44a1af4b24': { igId: '17841460101454399', username: 'atermicos.pinamar' },
  'e0141716-178d-483b-8c2c-a58d391b83a1': { igId: '17841438390504961', username: 'libreriamayoristaleo' },
  'b6d2f956-18c2-42d4-af3d-5a55442c234a': { igId: '17841446979077762', username: 'lic.rociofuentes' },
  '9cc15a64-897f-412f-a048-86791ed04185': { igId: '17841421861661046', username: 'puertasblindasasjack' },
  '51a050d9-5f32-4f95-8724-8eefff9666d6': { igId: '17841463377689897', username: 'selecta' },
};

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

// ── Optimized Klaviyo fetch ───────────────────────────────────────────────────
async function fetchKlaviyoData(apiKey: string) {
  // Use the same headers as the /api/klaviyo proxy (JSON:API format required by Klaviyo)
  const h = {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    Revision: '2024-10-15',
    Accept: 'application/vnd.api+json',
  };
  const kvFetch = (path: string) =>
    fetch(`https://a.klaviyo.com/api/${path}`, { headers: h })
      .then(r => { if (!r.ok) throw new Error(`Klaviyo ${r.status}`); return r.json(); });

  const fmtDate = (d?: string) => d
    ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  try {
    const [campsData, flowsData] = await Promise.all([
      kvFetch(`campaigns?filter=equals(messages.channel,%22email%22)&include=campaign-messages&sort=-created_at&page[size]=30`),
      kvFetch(`flows?sort=-updated&page[size]=30`),
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
      cache.set(tool, fetchKlaviyoData(klaviyoKey).catch(() => null));
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

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

  const { messages, profile, activeClientId, activeBusinessName, klaviyoApiKey, metaAccountId } = req.body as {
    messages: Array<{ role: string; content: string }>;
    profile?: { id: string; is_admin: boolean; business_name: string; klaviyo_api_key?: string; meta_account_id?: string };
    activeClientId?: string;
    activeBusinessName?: string;
    klaviyoApiKey?: string;
    metaAccountId?: string;
  };

  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const sendEvent = (data: object) => { try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {} };

  const isAdmin = !!profile?.is_admin;
  const userClientId = profile?.id;
  const fallbackClientId = activeClientId || userClientId;
  const directKlaviyoKey = klaviyoApiKey || profile?.klaviyo_api_key;
  const directMetaAccountId = metaAccountId || profile?.meta_account_id;

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
        description: "This month's ecommerce data: revenue, orders count, AOV from Shopify/Tiendanube. Use for questions about sales, revenue, or orders.",
        parameters: { type: 'object', properties: { clientId: { type: 'string' } }, required: ['clientId'] },
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
    ? `ACTIVE CLIENT: "${profile?.business_name || 'User'}" — clientId="${fallbackClientId}". Always pass this exact clientId.`
    : 'No active client. Use list_clients to find one.';

  const systemMessage = `You are Algo, Algoritmia's AI assistant. Respond in Argentine Spanish (vos, tenés, etc.) — friendly and professional.

${activeClientText}

TOOL ROUTING (call the right tool immediately, no clarification needed):
- Emails/mails/Klaviyo/campaigns/flows → get_klaviyo_data
- ROAS/spend/Meta results/campaigns → get_meta_ads_live_data
- Creativos/active ads → get_meta_ads_creatives
- Sales/revenue/orders/tienda → get_ecommerce_data
- Instagram posts → get_instagram_posts

RULES:
1. ALWAYS call the relevant tool before responding. Never answer from memory.
2. Use clientId="${fallbackClientId}" in every tool call unless explicitly asked about a different client.
3. If a tool returns an error: say it naturally in 1 line + offer a link to the relevant page.
4. Keep responses concise: bullet points, no filler text, real numbers.
5. For email questions: show scheduled emails with their date. Say "no hay emails programados" if scheduled list is empty.

NAVIGATION LINKS (use on its own line when helpful):
- Meta Ads: [Ver Captación](/#/captacion)
- Email: [Ver Email Marketing](/#/email-marketing)
- Store: [Ver Tienda](/#/tienda)
- Reports: [Ver Reportes](/#/reportes)

END every response with exactly:
[[FOLLOWUP]]One specific follow-up question relevant to the answer
[[OPT]]First concrete action
[[OPT]]Second concrete action
[[OPT]]Third concrete action`;

  try {
    // ── Speculative pre-fetching ─────────────────────────────────────────────
    // Start predicted API calls in parallel with the first OpenAI call
    const specCache: SpecCache = new Map();
    const predictedTools = predictTools(lastUserMessage);

    // We need the Meta token for speculative fetches — get it from cache (fast) or DB
    const tokenForSpec = directMetaAccountId ? await getMetaToken() : '';
    const specMetaId = directMetaAccountId || (await getClientData(fallbackClientId || '', 'meta_account_id').catch(() => null))?.meta_account_id;

    startSpeculativeFetches(predictedTools, fallbackClientId || '', directKlaviyoKey, specMetaId, tokenForSpec, specCache);

    let apiMessages: any[] = [{ role: 'system', content: systemMessage }, ...messages];
    let finalReply = '';
    let maxIterations = 4;

    while (maxIterations-- > 0) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
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

      if (!response.ok) {
        const err = await response.text();
        sendEvent({ type: 'error', message: `OpenAI error ${response.status}` });
        console.error('OpenAI error:', err);
        res.end(); return;
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
          let id = clientData?.meta_account_id || CLIENT_META_MAP[clientId]?.adAccountId || (clientId === fallbackClientId ? directMetaAccountId : undefined);
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
            // Check speculative cache first
            const spec = specCache.get('get_klaviyo_data');
            if (spec) {
              toolResult = await spec;
            } else {
              let apiKey = (clientId === fallbackClientId) ? directKlaviyoKey : undefined;
              if (!apiKey) apiKey = (await getClientData(clientId, 'klaviyo_api_key'))?.klaviyo_api_key;
              toolResult = apiKey ? await fetchKlaviyoData(apiKey) : { error: 'Klaviyo API key not configured' };
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
            const igId = CLIENT_META_MAP[clientId]?.igId;
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
          const { clientId } = args;
          if (!clientId || !isAuthorizedForClient(clientId)) { toolResult = { error: 'Access denied' }; }
          else {
            const client = await getClientData(clientId, 'ecommerce_platform,shopify_domain,shopify_access_token,tiendanube_store_id,tiendanube_access_token');
            if (!client) { toolResult = { error: 'Client not found' }; }
            else {
              const now = new Date();
              const sinceIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
              const untilIso = now.toISOString();
              if (client.ecommerce_platform === 'shopify') {
                try {
                  const domain = client.shopify_domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
                  const r = await fetch(`https://${domain}/admin/api/2024-01/orders.json?status=any&created_at_min=${sinceIso}&created_at_max=${untilIso}&limit=250`, {
                    headers: { 'X-Shopify-Access-Token': client.shopify_access_token }
                  });
                  if (!r.ok) throw new Error(`Shopify ${r.status}`);
                  const { orders = [] } = await r.json();
                  const valid = orders.filter((o: any) => !o.cancelled_at && o.financial_status !== 'voided');
                  const revenue = valid.reduce((s: number, o: any) => s + parseFloat(o.total_price || 0), 0);
                  toolResult = { platform: 'Shopify', revenue: +revenue.toFixed(2), ordersCount: valid.length, aov: valid.length ? +(revenue/valid.length).toFixed(2) : 0, period: `${new Date(sinceIso).toLocaleDateString('es-AR')} a ${now.toLocaleDateString('es-AR')}` };
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
                  toolResult = { platform: 'Tiendanube', revenue: +revenue.toFixed(2), ordersCount: valid.length, aov: valid.length ? +(revenue/valid.length).toFixed(2) : 0, period: `${new Date(sinceIso).toLocaleDateString('es-AR')} a ${now.toLocaleDateString('es-AR')}` };
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
