import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Hardcoded Meta config mappings fallback
const CLIENT_META_MAP: Record<string, { igId?: string; username?: string; adAccountId?: string }> = {
  'df57e4cd-6433-4c2f-a42f-4ad7e59d30dc': { adAccountId: 'act_2136106490563351' },
  '02504445-7e44-4599-8b62-6c44a1af4b24': { igId: '17841460101454399', username: 'atermicos.pinamar' },
  'e0141716-178d-483b-8c2c-a58d391b83a1': { igId: '17841438390504961', username: 'libreriamayoristaleo' },
  'b6d2f956-18c2-42d4-af3d-5a55442c234a': { igId: '17841446979077762', username: 'lic.rociofuentes' },
  '9cc15a64-897f-412f-a048-86791ed04185': { igId: '17841421861661046', username: 'puertasblindasasjack' },
  '51a050d9-5f32-4f95-8724-8eefff9666d6': { igId: '17841463377689897', username: 'selecta' },
};

// Human-readable labels for each tool (sent to the client as thinking steps)
const TOOL_META: Record<string, { label: string; icon: string }> = {
  'get_meta_ads_live_data':  { label: 'Consultando Meta Ads', icon: '📊' },
  'get_meta_ads_creatives':  { label: 'Buscando creativos activos', icon: '🎨' },
  'get_klaviyo_data':        { label: 'Revisando Email Marketing', icon: '📧' },
  'get_ecommerce_data':      { label: 'Consultando la tienda', icon: '🛒' },
  'get_instagram_posts':     { label: 'Cargando posts de Instagram', icon: '📸' },
  'list_clients':            { label: 'Buscando clientes', icon: '👥' },
  'get_client_metrics':      { label: 'Analizando métricas históricas', icon: '📈' },
};

// In-memory caches to avoid repeated DB lookups on every request
let metaTokenCache: { value: string; expiresAt: number } | null = null;
const clientCache: Record<string, { data: any; expiresAt: number }> = {};

async function getMetaToken(): Promise<string> {
  const now = Date.now();
  if (metaTokenCache && metaTokenCache.expiresAt > now) return metaTokenCache.value;
  try {
    const { data } = await supabase
      .from('AgencySettings')
      .select('value')
      .eq('key', 'meta_ads_token')
      .maybeSingle();
    const value = data?.value || '';
    metaTokenCache = { value, expiresAt: now + 5 * 60 * 1000 };
    return value;
  } catch {
    return '';
  }
}

async function getClientData(clientId: string, fields: string): Promise<any> {
  const cacheKey = `${clientId}:${fields}`;
  const now = Date.now();
  if (clientCache[cacheKey] && clientCache[cacheKey].expiresAt > now) {
    return clientCache[cacheKey].data;
  }
  const { data } = await supabase.from('car_clients').select(fields).eq('id', clientId).maybeSingle();
  clientCache[cacheKey] = { data, expiresAt: now + 2 * 60 * 1000 };
  return data;
}

async function fetchKlaviyoData(apiKey: string) {
  const kvFetch = async (path: string) => {
    const res = await fetch(`https://a.klaviyo.com/api/${path}`, {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        Revision: '2024-10-15',
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Klaviyo API error ${res.status}`);
    return res.json();
  };

  const fmtDate = (d?: string) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  try {
    const [campsData, flowsData] = await Promise.all([
      kvFetch(`campaigns?filter=equals(messages.channel,%22email%22)&include=campaign-messages&sort=-created_at&page[size]=50`),
      kvFetch(`flows?sort=-updated&page[size]=50`),
    ]);

    const msgMap = new Map<string, any>();
    for (const item of campsData.included ?? []) {
      if (item.type === 'campaign-message') {
        msgMap.set(item.id, { subject: item.attributes.subject, preview_text: item.attributes.preview_text });
      }
    }

    const allCamps = (campsData.data ?? []).filter((c: any) => c.attributes.status.toLowerCase() !== 'cancelled');
    const scheduled = allCamps.filter((c: any) => c.attributes.status.toLowerCase() === 'scheduled');
    const sent = allCamps.filter((c: any) => c.attributes.status.toLowerCase() === 'sent');
    const draft = allCamps.filter((c: any) => !['scheduled','sent'].includes(c.attributes.status.toLowerCase()));

    const mapCamp = (c: any) => {
      const msgIds: string[] = c.relationships?.['campaign-messages']?.data?.map((d: any) => d.id) ?? [];
      const msg = msgIds[0] ? msgMap.get(msgIds[0]) : undefined;
      const sendDate = c.attributes.send_time ?? c.attributes.scheduled_at;
      return {
        name: c.attributes.name,
        subject: msg?.subject || c.attributes.name,
        status: c.attributes.status,
        sendDate: sendDate ? fmtDate(sendDate) : null,
      };
    };

    const campaigns = {
      scheduled: scheduled.map(mapCamp),
      sent: sent.slice(0, 10).map(mapCamp),
      draft: draft.slice(0, 5).map(mapCamp),
    };

    const liveFlows = (flowsData.data ?? [])
      .filter((f: any) => f.attributes.status.toLowerCase() === 'live')
      .map((f: any) => ({ name: f.attributes.name, trigger: f.attributes.trigger_type }));

    const allFlows = (flowsData.data ?? [])
      .map((f: any) => ({ name: f.attributes.name, status: f.attributes.status, trigger: f.attributes.trigger_type }));

    return {
      campaigns,
      liveFlows,
      totalFlows: allFlows.length,
      summary: {
        scheduledCount: scheduled.length,
        sentCount: sent.length,
        draftCount: draft.length,
        liveFlowsCount: liveFlows.length,
      }
    };
  } catch (error: any) {
    console.error('Klaviyo error:', error);
    return { error: error.message || 'Error al obtener datos de Email Marketing' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured in environment' });
  }

  const { messages, profile, activeClientId, activeBusinessName } = req.body as {
    messages: Array<{ role: string; content: string }>;
    profile?: { id: string; is_admin: boolean; business_name: string };
    activeClientId?: string;
    activeBusinessName?: string;
  };

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // ── Set SSE headers BEFORE writing any data ─────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const isAdmin = !!profile?.is_admin;
  const userClientId = profile?.id;
  const fallbackClientId = activeClientId || userClientId;

  const tools = [
    {
      type: 'function',
      function: {
        name: 'list_clients',
        description: 'Get names and IDs of clients in the platform. Helpful to find the clientId of a specific client name mentioned by the user.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_client_metrics',
        description: 'Get historical performance metrics (Meta Ads spend/impressions/clicks/CTR/ROAS and email metrics open/click rates) for a client.',
        parameters: {
          type: 'object',
          properties: { clientId: { type: 'string', description: 'The UUID of the client' } },
          required: ['clientId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_klaviyo_data',
        description: 'Get live campaigns (sent, scheduled, and draft emails with subjects/send dates) and active flows directly from the email marketing provider for a client.',
        parameters: {
          type: 'object',
          properties: { clientId: { type: 'string', description: 'The UUID of the client' } },
          required: ['clientId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_meta_ads_live_data',
        description: 'Get live Meta Ads performance data from the Meta API: account-level insights (spend, reach, impressions, purchases/leads/messages, ROAS, CPA/CPL), list of active campaigns with names and objectives, and count of active ads. Use this whenever the user asks about Meta Ads performance, spend, ROAS, results, campaigns, or how their ads are doing.',
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'The UUID of the client' },
            days: { type: 'number', description: 'Number of days to look back: 7, 14, 30, or 90. Default is 14.' },
          },
          required: ['clientId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_meta_ads_creatives',
        description: 'Get the list of active Meta Ads creatives/ads grouped by campaign. Use when the user asks which creatives are active, what ads are running, or wants to know the names of their active ads.',
        parameters: {
          type: 'object',
          properties: { clientId: { type: 'string', description: 'The UUID of the client' } },
          required: ['clientId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_instagram_posts',
        description: 'Get recent Instagram posts with their caption, permalink, like/comment counts, and image/thumbnail URLs. Helpful to show IG media/images.',
        parameters: {
          type: 'object',
          properties: { clientId: { type: 'string', description: 'The UUID of the client' } },
          required: ['clientId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_ecommerce_data',
        description: "Get this month's ecommerce data (total revenue, total orders count, average order value (AOV)) from Shopify or Tiendanube for a client.",
        parameters: {
          type: 'object',
          properties: { clientId: { type: 'string', description: 'The UUID of the client' } },
          required: ['clientId'],
        },
      },
    },
  ];

  const isAuthorizedForClient = (targetClientId: string) => {
    if (isAdmin) return true;
    return targetClientId === userClientId;
  };

  const activeClientText = (activeBusinessName && fallbackClientId)
    ? `CLIENTE ACTIVO: "${activeBusinessName}" — clientId="${fallbackClientId}". En CADA llamada a herramientas usá EXACTAMENTE este clientId sin modificarlo.`
    : (fallbackClientId
      ? `CLIENTE ACTIVO: "${profile?.business_name || 'Usuario'}" — clientId="${fallbackClientId}". En CADA llamada a herramientas usá EXACTAMENTE este clientId.`
      : 'No hay cliente activo seleccionado. Usá list_clients para encontrarlo.');

  const systemMessage = `Sos el asistente de marketing digital inteligente de Algoritmia.
Tu nombre es "Algo". Respondés en español argentino, de manera amigable y profesional.

Tenés acceso a herramientas reales para consultar datos de clientes: Meta Ads, Email Marketing (Klaviyo), e-commerce (Shopify/Tiendanube), Instagram.

CONTEXTO DEL CLIENTE ACTIVO:
${activeClientText}

CUÁNDO USAR CADA HERRAMIENTA:
- 'get_meta_ads_live_data': SIEMPRE que el usuario pregunte sobre rendimiento de Meta Ads (gasto, ROAS, resultados, campañas activas, cómo le va en publicidad).
- 'get_meta_ads_creatives': SIEMPRE que el usuario pregunte qué creativos están activos, qué anuncios están corriendo, cuáles son los nombres de los creativos. Usá el clientId del contexto activo.
- 'get_klaviyo_data': SIEMPRE que el usuario pregunte sobre email marketing: emails programados, campañas enviadas, flujos activos, qué emails están listos, cuándo se envía algo.
- 'get_ecommerce_data': Para ventas, ingresos y pedidos de la tienda.
- 'get_instagram_posts': Para posts recientes de Instagram.
- 'list_clients': Para encontrar el clientId de un cliente por nombre.

REGLA CRÍTICA DE TOOLS: Cuando el usuario pregunta algo, SIEMPRE llamá a la herramienta correspondiente antes de responder. NUNCA digas que no tenés acceso a esa información sin haber llamado la herramienta primero. Si la herramienta falla, decilo en forma natural.

IMPORTANTE sobre email marketing:
- Para cualquier pregunta sobre emails, campañas de email, flujos, automatizaciones → SIEMPRE usar 'get_klaviyo_data'.
- El resultado incluye: campaigns.scheduled (programados con fecha), campaigns.sent (enviados), campaigns.draft (borradores), liveFlows (flujos activos).
- Al responder sobre emails programados: mostrar SOLO los de campaigns.scheduled con su fecha. Si está vacío, decir que no hay emails programados actualmente.

FLUJO DE TRABAJO:
1. Si no conocés el clientId del cliente mencionado, usá 'list_clients' primero.
2. Si el usuario no especifica cliente, SIEMPRE usá el clientId del contexto: ${fallbackClientId}
3. Respondé siempre con datos reales de las herramientas. Sé específico con números, nombres y fechas.
4. Si una herramienta devuelve error o datos vacíos: decí algo natural como "En este momento no pude traer esa info, pero la podés ver directamente acá:" + el link correspondiente.

REGLAS DE TONO Y FORMATO:
- Respuestas cortas, claras, naturales. Sin datos técnicos irrelevantes.
- Viñetas cortas para listas. Tablas solo si es indispensable.
- NO muestres imágenes en markdown. Para creativos, listá los nombres agrupados por campaña.
- Modismos argentinos: "tenés", "mirá", "querés", "che".

LINKS DE NAVEGACIÓN — Usá estos links en su propia línea SOLO cuando sea útil:
  * Anuncios/creativos/captación Meta Ads: ` + "`" + `[Ver en Captación](/#/captacion)` + "`" + `
  * Facturación/ventas/e-commerce: ` + "`" + `[Ver Tienda Online](/#/tienda)` + "`" + `
  * Email marketing/flujos/campañas: ` + "`" + `[Ver Email Marketing](/#/email-marketing)` + "`" + `
  * Reportes/métricas generales: ` + "`" + `[Ver Reportes](/#/reportes)` + "`" + `

REGLA OBLIGATORIA - CIERRE DE CONVERSACIÓN: Al final de CADA respuesta sin excepción, agregá este bloque con formato exacto:
[[FOLLOWUP]]Una pregunta de seguimiento relevante y específica al tema que acabás de responder
[[OPT]]Primera acción concreta que el usuario podría querer
[[OPT]]Segunda acción concreta que el usuario podría querer
[[OPT]]Tercera acción concreta que el usuario podría querer

NUNCA omitir este bloque. SIEMPRE exactamente 3 opciones.`;

  try {
    let apiMessages = [
      { role: 'system', content: systemMessage },
      ...messages,
    ];

    let runLoop = true;
    let maxIterations = 5;
    let finalReply = '';

    while (runLoop && maxIterations > 0) {
      maxIterations--;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: apiMessages,
          tools: tools,
          tool_choice: 'auto',
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('OpenAI API Error:', errText);
        sendEvent({ type: 'error', message: 'Error de OpenAI API' });
        res.end();
        return;
      }

      const responseData = await response.json();
      const choice = responseData.choices?.[0];
      const assistantMessage = choice?.message;

      if (!assistantMessage) break;

      apiMessages.push(assistantMessage);

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Emit thinking event with all tools being called
        const toolSteps = assistantMessage.tool_calls.map((tc: any) => ({
          tool: tc.function.name,
          label: TOOL_META[tc.function.name]?.label || tc.function.name,
          icon: TOOL_META[tc.function.name]?.icon || '⚙️',
        }));
        sendEvent({ type: 'thinking', steps: toolSteps });

        // Execute all tool calls in parallel
        const toolResults = await Promise.all(assistantMessage.tool_calls.map(async (toolCall: any) => {
          const { name, arguments: argsString } = toolCall.function;
          let args: any = {};
          try { args = JSON.parse(argsString); } catch {}

          let toolResult: any = null;

          if (name === 'list_clients') {
            if (!isAdmin) {
              if (userClientId) {
                const { data } = await supabase.from('car_clients').select('id, business_name').eq('id', userClientId).maybeSingle();
                toolResult = data ? [data] : [];
              } else {
                toolResult = [];
              }
            } else {
              const { data } = await supabase.from('car_clients').select('id, business_name').order('business_name');
              toolResult = data || [];
            }
          } else if (name === 'get_client_metrics') {
            const { clientId } = args as { clientId: string };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              const [metaRes, emailRes] = await Promise.all([
                supabase.from('car_meta_metrics').select('*').eq('client_id', clientId).order('period_start', { ascending: false }).limit(10),
                supabase.from('car_email_metrics').select('*').eq('client_id', clientId).order('period_start', { ascending: false }).limit(10),
              ]);
              toolResult = { metaMetrics: metaRes.data || [], emailMetrics: emailRes.data || [] };
            }
          } else if (name === 'get_klaviyo_data') {
            const { clientId } = args as { clientId: string };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              const clientData = await getClientData(clientId, 'klaviyo_api_key');
              if (!clientData?.klaviyo_api_key) {
                toolResult = { error: 'Client does not have Email Marketing API Key configured' };
              } else {
                toolResult = await fetchKlaviyoData(clientData.klaviyo_api_key);
              }
            }
          } else if (name === 'get_meta_ads_live_data') {
            const { clientId, days = 14 } = args as { clientId: string; days?: number };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              const [clientData, token] = await Promise.all([
                getClientData(clientId, 'meta_account_id'),
                getMetaToken(),
              ]);

              let adAccountId = clientData?.meta_account_id || CLIENT_META_MAP[clientId]?.adAccountId;
              if (adAccountId && !adAccountId.startsWith('act_')) adAccountId = `act_${adAccountId}`;

              if (!adAccountId) {
                toolResult = { error: 'Meta Ad Account ID no configurado para este cliente.' };
              } else if (!token) {
                toolResult = { error: 'Token de Meta Ads no configurado en el sistema.' };
              } else {
                try {
                  const preset = days <= 7 ? 'last_7d' : days <= 14 ? 'last_14d' : days <= 30 ? 'last_30d' : 'last_90d';
                  const base = `https://graph.facebook.com/v21.0`;
                  const activeFilter = encodeURIComponent('["ACTIVE"]');

                  const [insightsRes, campaignsRes, adsRes] = await Promise.all([
                    fetch(`${base}/${adAccountId}/insights?fields=spend,reach,impressions,actions,action_values,purchase_roas&date_preset=${preset}&access_token=${token}`),
                    fetch(`${base}/${adAccountId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&effective_status=${activeFilter}&limit=50&access_token=${token}`),
                    fetch(`${base}/${adAccountId}/ads?fields=id,name&effective_status=${activeFilter}&limit=100&access_token=${token}`),
                  ]);

                  if (!insightsRes.ok) {
                    const errBody = await insightsRes.text();
                    throw new Error(`Meta insights error ${insightsRes.status}: ${errBody}`);
                  }

                  const [insightsJson, campaignsJson, adsJson] = await Promise.all([
                    insightsRes.json(),
                    campaignsRes.json(),
                    adsRes.json(),
                  ]);

                  const ins = insightsJson.data?.[0] || {};
                  const spend = parseFloat(ins.spend || 0);
                  const reach = parseInt(ins.reach || 0);
                  const impressions = parseInt(ins.impressions || 0);

                  const acts: any[] = ins.actions || [];
                  const findAction = (...types: string[]) => {
                    const a = acts.find((x: any) => types.includes(x.action_type));
                    return a ? parseFloat(a.value) : 0;
                  };
                  const purchases = findAction('purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase');
                  const leads = findAction('lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped');
                  const messages = findAction('onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.messaging_first_reply');

                  const avs: any[] = ins.action_values || [];
                  const revEntry = avs.find((x: any) => ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'].includes(x.action_type));
                  const revenue = revEntry ? parseFloat(revEntry.value) : 0;
                  const roas = spend > 0 && revenue > 0 ? +(revenue / spend).toFixed(2) : 0;

                  const campaigns = (campaignsJson.data || []).map((c: any) => ({
                    name: c.name,
                    objective: c.objective,
                    budget: c.daily_budget
                      ? `$${(parseFloat(c.daily_budget) / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}/día`
                      : c.lifetime_budget
                      ? `$${(parseFloat(c.lifetime_budget) / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })} total`
                      : 'Sin dato',
                  }));

                  const activeAds = (adsJson.data || []);

                  toolResult = {
                    period: `Últimos ${days} días`,
                    spend: +spend.toFixed(2),
                    reach,
                    impressions,
                    purchases,
                    leads,
                    messages,
                    revenue: +revenue.toFixed(2),
                    roas,
                    cpa: purchases > 0 ? +(spend / purchases).toFixed(2) : 0,
                    cpl: leads > 0 ? +(spend / leads).toFixed(2) : 0,
                    costPerMessage: messages > 0 ? +(spend / messages).toFixed(2) : 0,
                    activeCampaignsCount: campaigns.length,
                    activeCampaigns: campaigns,
                    activeAdsCount: activeAds.length,
                    activeAdNames: activeAds.slice(0, 15).map((a: any) => a.name),
                  };
                } catch (e: any) {
                  toolResult = { error: `Error al obtener datos de Meta: ${e.message}` };
                }
              }
            }
          } else if (name === 'get_meta_ads_creatives') {
            const { clientId } = args as { clientId: string };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              const [clientData, token2] = await Promise.all([
                getClientData(clientId, 'meta_account_id'),
                getMetaToken(),
              ]);

              let adAccountId = clientData?.meta_account_id || CLIENT_META_MAP[clientId]?.adAccountId;
              if (adAccountId && !adAccountId.startsWith('act_')) adAccountId = `act_${adAccountId}`;

              if (!adAccountId) {
                toolResult = { error: 'Meta Ad Account ID not configured for this client.' };
              } else if (!token2) {
                toolResult = { error: 'Meta Ads access token not configured in system.' };
              } else {
                try {
                  const base = `https://graph.facebook.com/v21.0`;
                  const activeFilter = encodeURIComponent('["ACTIVE"]');
                  const [adsRes, campsRes] = await Promise.all([
                    fetch(`${base}/${adAccountId}/ads?fields=id,name,campaign_id&effective_status=${activeFilter}&limit=100&access_token=${token2}`),
                    fetch(`${base}/${adAccountId}/campaigns?fields=id,name,objective&effective_status=${activeFilter}&limit=50&access_token=${token2}`).catch(() => null),
                  ]);
                  if (!adsRes.ok) {
                    const errBody = await adsRes.text().catch(() => '');
                    throw new Error(`Meta API ${adsRes.status}: ${errBody.slice(0, 200)}`);
                  }
                  const adsJson = await adsRes.json();
                  const campsJson = campsRes?.ok ? await campsRes.json().catch(() => ({ data: [] })) : { data: [] };
                  const ads = adsJson.data || [];
                  const camps = campsJson.data || [];
                  const campMap = new Map(camps.map((c: any) => [c.id, { name: c.name, objective: c.objective }]));

                  const grouped: Record<string, { campaignName: string; objective: string; creatives: string[] }> = {};
                  for (const ad of ads) {
                    const cid = ad.campaign_id || 'other';
                    const camp = campMap.get(cid) as any;
                    const cname = camp?.name || 'Sin campaña';
                    const obj = camp?.objective || '';
                    if (!grouped[cid]) grouped[cid] = { campaignName: cname, objective: obj, creatives: [] };
                    grouped[cid].creatives.push(ad.name);
                  }

                  toolResult = {
                    totalActive: ads.length,
                    byCampaign: Object.values(grouped),
                  };
                } catch (e: any) {
                  toolResult = { error: `Error obteniendo creativos: ${e.message}` };
                }
              }
            }
          } else if (name === 'get_instagram_posts') {
            const { clientId } = args as { clientId: string };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              const igId = CLIENT_META_MAP[clientId]?.igId;
              const token = await getMetaToken();

              if (!igId) {
                toolResult = { error: 'Instagram account ID mapping not found for this client.' };
              } else if (!token) {
                toolResult = { error: 'Meta token not configured.' };
              } else {
                try {
                  const res = await fetch(`https://graph.facebook.com/v21.0/${igId}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url&limit=15&access_token=${token}`);
                  if (!res.ok) throw new Error(`Instagram status ${res.status}`);
                  const json = await res.json();
                  toolResult = json.data || [];
                } catch (e: any) {
                  toolResult = { error: e.message };
                }
              }
            }
          } else if (name === 'get_ecommerce_data') {
            const { clientId } = args as { clientId: string };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              const client = await getClientData(clientId, 'ecommerce_platform, shopify_domain, shopify_access_token, tiendanube_store_id, tiendanube_access_token');

              if (!client) {
                toolResult = { error: 'Client profile not found' };
              } else {
                const platform = client.ecommerce_platform;
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                const sinceIso = startOfMonth.toISOString();
                const untilIso = endOfMonth.toISOString();

                if (platform === 'shopify') {
                  const domain = client.shopify_domain;
                  const token = client.shopify_access_token;
                  if (!domain || !token) {
                    toolResult = { error: 'Shopify credentials not fully configured for this client' };
                  } else {
                    try {
                      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
                      const targetUrl = `https://${cleanDomain}/admin/api/2024-01/orders.json?status=any&created_at_min=${sinceIso}&created_at_max=${untilIso}&limit=250`;
                      const res = await fetch(targetUrl, {
                        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
                      });
                      if (!res.ok) throw new Error(`Shopify status ${res.status}`);
                      const data = await res.json();
                      const orders = data.orders || [];
                      const validOrders = orders.filter((o: any) => !o.cancelled_at && o.financial_status !== 'voided');
                      const totalRevenue = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price || 0), 0);
                      const totalDiscounts = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_discounts || 0), 0);
                      toolResult = {
                        platform: 'Shopify',
                        revenue: totalRevenue,
                        ordersCount: validOrders.length,
                        totalDiscounts,
                        aov: validOrders.length > 0 ? totalRevenue / validOrders.length : 0,
                        period: `${startOfMonth.toLocaleDateString('es-AR')} a ${now.toLocaleDateString('es-AR')}`
                      };
                    } catch (e: any) {
                      toolResult = { error: `Shopify fetch error: ${e.message}` };
                    }
                  }
                } else if (platform === 'tiendanube') {
                  const storeId = client.tiendanube_store_id;
                  const token = client.tiendanube_access_token;
                  if (!storeId || !token) {
                    toolResult = { error: 'Tiendanube credentials not fully configured for this client' };
                  } else {
                    try {
                      const targetUrl = `https://api.tiendanube.com/v1/${storeId}/orders?created_at_min=${sinceIso}&created_at_max=${untilIso}&limit=200`;
                      const res = await fetch(targetUrl, {
                        headers: {
                          'Authentication': `bearer ${token}`,
                          'User-Agent': 'Algoritmia (lucagazze@gmail.com)',
                          'Content-Type': 'application/json',
                        }
                      });
                      if (!res.ok) throw new Error(`Tiendanube status ${res.status}`);
                      const orders = await res.json();
                      const validOrders = Array.isArray(orders) ? orders.filter((o: any) => o.status !== 'cancelled') : [];
                      const totalRevenue = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total || 0), 0);
                      toolResult = {
                        platform: 'Tiendanube',
                        revenue: totalRevenue,
                        ordersCount: validOrders.length,
                        aov: validOrders.length > 0 ? totalRevenue / validOrders.length : 0,
                        period: `${startOfMonth.toLocaleDateString('es-AR')} a ${now.toLocaleDateString('es-AR')}`
                      };
                    } catch (e: any) {
                      toolResult = { error: `Tiendanube fetch error: ${e.message}` };
                    }
                  }
                } else {
                  toolResult = { error: `Ecommerce platform ${platform || 'not configured'} not supported or missing` };
                }
              }
            }
          } else {
            toolResult = { error: `Tool ${name} not implemented` };
          }

          // Emit tool_done for each tool as it completes
          sendEvent({ type: 'tool_done', tool: name });

          return {
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify(toolResult),
          };
        }));

        for (const result of toolResults) {
          apiMessages.push(result as any);
        }
      } else {
        finalReply = assistantMessage.content || '';
        runLoop = false;
      }
    }

    sendEvent({ type: 'done', reply: finalReply || 'Perdón, no pude procesar la consulta.' });
    res.end();
  } catch (err: any) {
    console.error('Chat handler execution error:', err);
    sendEvent({ type: 'error', message: err.message || 'Internal server error' });
    res.end();
  }
}
