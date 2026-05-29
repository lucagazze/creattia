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
    metaTokenCache = { value, expiresAt: now + 5 * 60 * 1000 }; // 5 min cache
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
  clientCache[cacheKey] = { data, expiresAt: now + 2 * 60 * 1000 }; // 2 min cache
  return data;
}

// Klaviyo Helper function
async function fetchKlaviyoData(apiKey: string) {
  const kvFetch = async (path: string) => {
    const res = await fetch(`https://a.klaviyo.com/api/${path}`, {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        Revision: '2024-10-15',
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Email Marketing API error: ${res.status}`);
    return res.json();
  };

  try {
    const [campsData, flowsData] = await Promise.all([
      kvFetch(
        `campaigns?filter=equals(messages.channel,%22email%22)&include=campaign-messages&sort=-created_at`,
      ),
      kvFetch(`flows?sort=-updated`),
    ]);

    const msgMap = new Map<string, any>();
    for (const item of campsData.included ?? []) {
      if (item.type === 'campaign-message') {
        msgMap.set(item.id, {
          subject: item.attributes.subject,
          preview_text: item.attributes.preview_text,
        });
      }
    }

    const campaigns = (campsData.data ?? [])
      .filter((c: any) => c.attributes.status.toLowerCase() !== 'cancelled')
      .map((c: any) => {
        const msgIds: string[] = c.relationships?.['campaign-messages']?.data?.map((d: any) => d.id) ?? [];
        const msg = msgIds[0] ? msgMap.get(msgIds[0]) : undefined;
        return {
          name: c.attributes.name,
          status: c.attributes.status,
          send_time: c.attributes.send_time,
          scheduled_at: c.attributes.scheduled_at,
          subject: msg?.subject,
        };
      });

    const flows = (flowsData.data ?? [])
      .filter((f: any) => f.attributes.status.toLowerCase() === 'live')
      .map((f: any) => ({
        name: f.attributes.name,
        status: f.attributes.status,
        trigger_type: f.attributes.trigger_type,
      }));

    return { campaigns, flows };
  } catch (error: any) {
    console.error('Email error:', error);
    return { error: error.message || 'Error fetching Email Marketing data' };
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

  const isAdmin = !!profile?.is_admin;
  const userClientId = profile?.id;
  const fallbackClientId = activeClientId || userClientId;

  const tools = [
    {
      type: 'function',
      function: {
        name: 'list_clients',
        description: 'Get names and IDs of clients in the platform. Helpful to find the clientId of a specific client name mentioned by the user.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_client_metrics',
        description: 'Get historical performance metrics (Meta Ads spend/impressions/clicks/CTR/ROAS and email metrics open/click rates) for a client.',
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'The UUID of the client' },
          },
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
          properties: {
            clientId: { type: 'string', description: 'The UUID of the client' },
          },
          required: ['clientId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_assigned_emails',
        description: 'Get the assigned and scheduled emails/files from the Supabase email library for a client.',
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'The UUID of the client' },
          },
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
        description: 'Get the count and names of active Meta Ads creatives/ads. Use ONLY when the user specifically asks how many creatives are active or what their names are. Do NOT use for performance metrics — use get_meta_ads_live_data for that.',
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'The UUID of the client' },
          },
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
          properties: {
            clientId: { type: 'string', description: 'The UUID of the client' },
          },
          required: ['clientId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_ecommerce_data',
        description: 'Get this month\'s ecommerce data (total revenue, total orders count, average order value (AOV)) from Shopify or Tiendanube for a client.',
        parameters: {
          type: 'object',
          properties: {
            clientId: { type: 'string', description: 'The UUID of the client' },
          },
          required: ['clientId'],
        },
      },
    },
  ];

  // Helper security filter
  const isAuthorizedForClient = (targetClientId: string) => {
    if (isAdmin) return true;
    return targetClientId === userClientId;
  };

  const activeClientText = activeBusinessName 
    ? `El negocio seleccionado/activo actualmente en la pantalla del administrador es "${activeBusinessName}" (ID: ${fallbackClientId}).` 
    : `El negocio del usuario actual es "${profile?.business_name || 'Desconocido'}" (ID: ${fallbackClientId}).`;

  const systemMessage = `Sos el asistente de marketing digital inteligente de Algoritmia.
Tu nombre es "Algo". Respondés en español argentino, de manera amigable y profesional.

Tenés acceso a herramientas reales para consultar datos de clientes: Meta Ads, Email Marketing (Klaviyo), e-commerce (Shopify/Tiendanube), Instagram y emails asignados.

CUÁNDO USAR CADA HERRAMIENTA:
- 'get_meta_ads_live_data': SIEMPRE que el usuario pregunte sobre rendimiento de Meta Ads (gasto, ROAS, resultados, campañas activas, cómo le va en publicidad). Esta es la herramienta principal para Meta.
- 'get_meta_ads_creatives': Solo cuando pregunten cuántos creativos/anuncios están activos o sus nombres. NO para métricas de rendimiento.
- 'get_klaviyo_data': Para campañas y flujos de email marketing.
- 'get_assigned_emails': Para ver emails asignados/programados desde la biblioteca.
- 'get_ecommerce_data': Para ventas, ingresos y pedidos de la tienda.
- 'get_instagram_posts': Para posts recientes de Instagram.
- 'list_clients': Para encontrar el clientId de un cliente por nombre (solo si no lo sabés).

FLUJO DE TRABAJO:
1. Si no conocés el clientId del cliente mencionado, usá 'list_clients' primero.
2. Si el usuario no especifica cliente, asumí que es el negocio activo en pantalla: ${activeClientText}
3. Respondé siempre con datos reales de las herramientas. Sé específico con números, nombres y fechas.
4. Si una herramienta falla, decilo de forma simple y natural.

REGLAS DE TONO, CONTENIDO Y FORMATO (MUY IMPORTANTES):
- RESPUESTA DE MAILS PROGRAMADOS: Si el usuario te pregunta qué mails/correos están programados, debés responder detallando ÚNICAMENTE el nombre/asunto del correo y para cuándo está programado (fecha de envío). NO muestres bajo ningún concepto datos de bajo nivel como "Estado: Activo", "Aprobado: Sí", "Fecha de creación", etc.
- Da respuestas súper lógicas, acertadas, claras, naturales y muy fáciles de leer. Evita dar datos o detalles técnicos irrelevantes que entorpezcan la lectura.
- Usa preferentemente viñetas (por puntos) cortas para resumir la información y hacerla fácil de leer de un vistazo.
- Usa tablas solo si es sumamente necesario para estructurar datos numéricos o calendarios.
- NO muestres imágenes ni creativos directamente en el chat (NO utilices el formato de imagen markdown \`![alt](url)\`). En su lugar, describilos de forma breve en una lista por puntos y ofrece el botón con el link correspondiente para ir a verlos en la plataforma.
- SIEMPRE que el usuario pregunte sobre algo que tenga una sección visual en la plataforma (anuncios, ventas, mails, reportes, etc.), debés incluir el link/botón de redirección correspondiente al final de tu respuesta, en su propia línea de texto. Esto renderizará un botón Call-To-Action premium en la interfaz.
  Usa exactamente estos links en su propia línea según el tema de la consulta:
  * Si hablás de anuncios, creativos activos o captación de Meta Ads:
    ` + "`" + `[Ver Creativos en Captación](/#/captacion)` + "`" + `
  * Si hablás de facturación, ventas o e-commerce (Shopify/Tiendanube):
    ` + "`" + `[Ver Rendimiento en Tienda](/#/tienda)` + "`" + `
  * Si hablás de correos programados, flujos o campañas de Email Marketing:
    ` + "`" + `[Ver Email Marketing](/#/email-marketing)` + "`" + `
  * Para métricas generales, PDFs o reportes mensuales:
    ` + "`" + `[Ver Reportes Mensuales](/#/reportes)` + "`" + `
- Sé amigable e inteligente. Usa modismos de Argentina (por ejemplo, "tenés", "mirá", "querés", "che", "chequeá").`;

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
        return res.status(response.status).json({ error: 'OpenAI API completion error' });
      }

      const responseData = await response.json();
      const choice = responseData.choices?.[0];
      const assistantMessage = choice?.message;

      if (!assistantMessage) {
        break;
      }

      apiMessages.push(assistantMessage);

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Execute all tool calls in parallel for maximum speed
        const toolResults = await Promise.all(assistantMessage.tool_calls.map(async (toolCall: any) => {
          const { name, arguments: argsString } = toolCall.function;
          let args: any = {};
          try { args = JSON.parse(argsString); } catch {}

          let toolResult: any = null;

          if (name === 'list_clients') {
            if (!isAdmin) {
              if (userClientId) {
                const { data } = await supabase
                  .from('car_clients')
                  .select('id, business_name')
                  .eq('id', userClientId)
                  .maybeSingle();
                toolResult = data ? [data] : [];
              } else {
                toolResult = [];
              }
            } else {
              const { data } = await supabase
                .from('car_clients')
                .select('id, business_name')
                .order('business_name');
              toolResult = data || [];
            }
          } else if (name === 'get_client_metrics') {
            const { clientId } = args as { clientId: string };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              const [metaRes, emailRes] = await Promise.all([
                supabase
                  .from('car_meta_metrics')
                  .select('*')
                  .eq('client_id', clientId)
                  .order('period_start', { ascending: false })
                  .limit(10),
                supabase
                  .from('car_email_metrics')
                  .select('*')
                  .eq('client_id', clientId)
                  .order('period_start', { ascending: false })
                  .limit(10),
              ]);
              toolResult = {
                metaMetrics: metaRes.data || [],
                emailMetrics: emailRes.data || [],
              };
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
          } else if (name === 'get_assigned_emails') {
            const { clientId } = args as { clientId: string };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              const { data } = await supabase
                .from('car_email_assignments')
                .select('*')
                .eq('client_id', clientId);
              toolResult = data || [];
            }
          } else if (name === 'get_meta_ads_live_data') {
            const { clientId, days = 14 } = args as { clientId: string; days?: number };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              // Fetch client data and token in parallel
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

                  const [insightsRes, campaignsRes, adsRes] = await Promise.all([
                    fetch(`${base}/${adAccountId}/insights?fields=spend,reach,impressions,actions,action_values,purchase_roas&date_preset=${preset}&access_token=${token}`),
                    fetch(`${base}/${adAccountId}/campaigns?fields=name,status,objective,daily_budget,lifetime_budget&effective_status=["ACTIVE"]&limit=50&access_token=${token}`),
                    fetch(`${base}/${adAccountId}/ads?fields=id,name&effective_status=["ACTIVE"]&limit=100&access_token=${token}`),
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
                  const res = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/ads?fields=id,name,status&effective_status=["ACTIVE"]&limit=100&access_token=${token2}`);
                  if (!res.ok) throw new Error(`Meta status ${res.status}`);
                  const json = await res.json();
                  const ads = json.data || [];
                  toolResult = {
                    totalActive: ads.length,
                    names: ads.map((a: any) => a.name),
                    note: 'Para ver los creativos con imágenes, usar el botón de Captación en la plataforma.',
                  };
                } catch (e: any) {
                  toolResult = { error: e.message };
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
                        headers: {
                          'X-Shopify-Access-Token': token,
                          'Content-Type': 'application/json',
                        }
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

          return {
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify(toolResult),
          };
        }));

        // Add all tool results to messages at once
        for (const result of toolResults) {
          apiMessages.push(result as any);
        }
      } else {
        finalReply = assistantMessage.content || '';
        runLoop = false;
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ reply: finalReply || 'Perdón, no pude procesar la consulta.' });
  } catch (err: any) {
    console.error('Chat handler execution error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
