import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const { clientId, itemText, username } = req.body as {
    clientId: string;
    itemText: string;
    username: string;
  };

  if (!clientId || !itemText) {
    return res.status(400).json({ error: 'Missing clientId or itemText' });
  }

  try {
    // 1. Fetch client settings from Supabase
    const { data: client, error: dbError } = await supabase
      .from('car_clients')
      .select('business_name, ecommerce_platform, shopify_domain, shopify_access_token')
      .eq('id', clientId)
      .maybeSingle();

    if (dbError || !client) {
      return res.status(404).json({ error: 'Client not found or database error' });
    }

    const { business_name, ecommerce_platform, shopify_domain, shopify_access_token } = client;

    // 2. Fetch Shopify products if platform is Shopify
    let products: any[] = [];
    if (ecommerce_platform === 'shopify' && shopify_domain && shopify_access_token) {
      try {
        const cleanDomain = shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const shopifyUrl = `https://${cleanDomain}/admin/api/2024-01/products.json?limit=50&fields=title,handle`;
        const shopifyRes = await fetch(shopifyUrl, {
          headers: {
            'X-Shopify-Access-Token': shopify_access_token,
            'Accept': 'application/json',
          }
        });
        if (shopifyRes.ok) {
          const json = await shopifyRes.json();
          products = json.products || [];
        }
      } catch (err) {
        console.error('[Shopify Draft] Error fetching products:', err);
      }
    }

    // 3. Construct the prompt
    const cleanDomainForLink = shopify_domain ? shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
    const productsContext = products.length > 0
      ? `Catálogo de productos de la tienda:\n${products.map(p => `- ${p.title} (Link de compra: https://${cleanDomainForLink}/products/${p.handle})`).join('\n')}`
      : 'No hay catálogo de productos de Shopify configurado.';

    const systemMessage = `Sos Algor, el asistente de IA de la marca "${business_name}".
Redactá un borrador de respuesta natural, amable y en español argentino (usá el voseo: vos, tenés, consultame, etc.) para responder a un cliente.

Detalles:
- Usuario en red social: @${username}
- Mensaje que envió: "${itemText}"

${productsContext}

Reglas:
1. Sé muy conciso (máximo 1 o 2 oraciones).
2. Si el usuario pregunta por un producto específico, disponibilidad, precio o cómo comprar, recomendá el producto del catálogo y colocá EXACTAMENTE el link correspondiente: https://${cleanDomainForLink}/products/[handle-del-producto]. No inventes handles que no estén en la lista.
3. No uses marcadores de posición (placeholders) como [precio] o [enlace]. La respuesta debe estar lista para enviarse.
4. Devolvé ÚNICAMENTE el texto final de la respuesta sugerida, sin explicaciones ni prefijos.`;

    // 4. Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: `Generá el borrador para @${username}` }
        ],
        temperature: 0.5,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'OpenAI error', detail: errText });
    }

    const responseData = await response.json();
    const draftText = responseData.choices?.[0]?.message?.content?.trim() || '';

    return res.status(200).json({ draft: draftText });

  } catch (err: any) {
    console.error('Draft generation error:', err);
    return res.status(502).json({ error: 'Draft reply server error', detail: err.message });
  }
}
