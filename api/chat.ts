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

// Agency settings / token helpers
async function getMetaToken() {
  try {
    const { data } = await supabase
      .from('AgencySettings')
      .select('value')
      .eq('key', 'meta_ads_token')
      .maybeSingle();
    return data?.value || '';
  } catch {
    return '';
  }
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
    if (!res.ok) throw new Error(`Klaviyo API error: ${res.status}`);
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
    console.error('Klaviyo error:', error);
    return { error: error.message || 'Error fetching Klaviyo data' };
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
        description: 'Get live campaigns (sent, scheduled, and draft emails with subjects/send dates) and active flows directly from Klaviyo for a client.',
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
        name: 'get_meta_ads_creatives',
        description: 'Get the active Meta Ads creatives/ads with their names, status, and image thumbnail URLs. Helpful when users ask to see ad creatives/images.',
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

Tienes acceso a herramientas para buscar información real de todos los clientes (campañas de Klaviyo, métricas de Meta Ads, métricas de Email, facturación de e-commerce de Shopify o Tiendanube, asignaciones de mails, creativos de anuncios e Instagram posts).

Cuando el usuario te pregunte sobre algún cliente, campaña, métricas, facturación, creativos o mails:
1. Si no conoces el clientId del cliente mencionado, usa 'list_clients' para buscarlo.
2. Si te preguntan sobre un cliente específico y ya tienes el clientId (o lo acabas de buscar), llama a la herramienta adecuada.
3. Responde siempre basándote en los datos reales que te devuelven las herramientas. Sé específico con nombres, asuntos y fechas reales.
4. Si el usuario te pregunta sin especificar un cliente, asume que se refiere al negocio activo actual en pantalla.
   ${activeClientText}
5. Si no hay datos disponibles o la llamada a las APIs falla, responde indicando de forma sencilla que no tenés una respuesta para esa pregunta en este momento.

REGLAS DE TONO, CONTENIDO Y FORMATO (MUY IMPORTANTES):
- Da respuestas súper naturales, claras, intuitivas y muy fáciles de leer para alguien que no entiende nada de marketing o tecnología.
- Usa preferentemente viñetas (por puntos) para resumir la información y hacerla fácil de leer de un vistazo. Evita textos largos o explicaciones técnicas complejas.
- Usa tablas solo si es sumamente necesario para estructurar datos numéricos o calendarios.
- NO muestres imágenes ni creativos directamente en el chat (NO utilices el formato de imagen markdown `![alt](url)`). En su lugar, describilos de forma breve en una lista por puntos y ofrece el botón con el link correspondiente para ir a verlos en la plataforma.
- SIEMPRE que el usuario pregunte sobre algo que tenga una sección visual en la plataforma (anuncios, ventas, mails, reportes, etc.), debés incluir el link/botón de redirección correspondiente al final de tu respuesta, en su propia línea de texto. Esto renderizará un botón Call-To-Action premium en la interfaz.
  Usa exactamente estos links en su propia línea según el tema de la consulta:
  * Si hablás de anuncios, creativos activos o captación de Meta Ads:
    ` + "`" + `[Ver Creativos en Captación](/#/captacion)` + "`" + `
  * Si hablás de facturación, ventas o e-commerce (Shopify/Tiendanube):
    ` + "`" + `[Ver Rendimiento en Tienda](/#/tienda)` + "`" + `
  * Si hablás de correos programados, flujos o campañas de Klaviyo:
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
        for (const toolCall of assistantMessage.tool_calls) {
          const { name, arguments: argsString } = toolCall.function;
          let args = {};
          try {
            args = JSON.parse(argsString);
          } catch (e) {
            console.error('Error parsing arguments for tool', name, e);
          }

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
              const { data: clientData } = await supabase
                .from('car_clients')
                .select('klaviyo_api_key')
                .eq('id', clientId)
                .maybeSingle();

              if (!clientData?.klaviyo_api_key) {
                toolResult = { error: 'Client does not have Klaviyo API Key configured' };
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
          } else if (name === 'get_meta_ads_creatives') {
            const { clientId } = args as { clientId: string };
            if (!clientId || !isAuthorizedForClient(clientId)) {
              toolResult = { error: 'Access denied or missing clientId' };
            } else {
              const { data: clientData } = await supabase
                .from('car_clients')
                .select('meta_account_id')
                .eq('id', clientId)
                .maybeSingle();
              
              let adAccountId = clientData?.meta_account_id || CLIENT_META_MAP[clientId]?.adAccountId;
              if (adAccountId && !adAccountId.startsWith('act_')) {
                adAccountId = `act_${adAccountId}`;
              }
              const token = await getMetaToken();

              if (!adAccountId) {
                toolResult = { error: 'Meta Ad Account ID not configured for this client.' };
              } else if (!token) {
                toolResult = { error: 'Meta Ads access token not configured in system.' };
              } else {
                try {
                  const res = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/ads?fields=id,name,status,creative{id,name,thumbnail_url,object_type}&limit=30&access_token=${token}`);
                  if (!res.ok) throw new Error(`Meta status ${res.status}`);
                  const json = await res.json();
                  toolResult = json.data || [];
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
              const { data: client } = await supabase
                .from('car_clients')
                .select('ecommerce_platform, shopify_domain, shopify_access_token, tiendanube_store_id, tiendanube_access_token')
                .eq('id', clientId)
                .maybeSingle();

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

          apiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: name,
            content: JSON.stringify(toolResult),
          } as any);
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
