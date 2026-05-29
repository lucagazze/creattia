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

  const { clientId, itemText, username, postCaption, otherComments } = req.body as {
    clientId: string;
    itemText: string;
    username: string;
    postCaption?: string;
    otherComments?: string[];
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

    const systemMessage = `You are Algor, the AI assistant for the brand "${business_name}".
Your task is to draft a friendly, natural reply to a social media message.

CRITICAL INSTRUCTION - LANGUAGE DETECTION:
- Closely analyze the language of the customer's message: "${itemText}".
- You MUST draft the reply in that EXACT same language. If the customer wrote in English, you MUST reply in English. If they wrote in Spanish, you MUST reply in Spanish (using Argentine Spanish voseo: e.g., "vos", "tenés", "consultame"). If they wrote in Portuguese, you MUST reply in Portuguese.
- NEVER mix languages. If the comment is in English, do NOT output a single word in Spanish (such as "Hola", "Gracias", or "conseguilo"). The entire response must be 100% in English.
- NEVER reply in Spanish if the customer's message is in English, Portuguese, or any other language.

Details:
- Social media user: @${username}
- Message sent: "${itemText}"
${postCaption ? `- Caption/Text of the post (context): "${postCaption}"` : ''}
${otherComments && otherComments.length > 0 ? `- Other comments in the same post (context):\n${otherComments.map(c => `  * ${c}`).join('\n')}` : ''}

${productsContext}

Rules:
1. Be extremely concise (maximum 1 or 2 sentences).
2. If they ask about a specific product, availability, price, or how to buy, recommend the product from the catalog and include EXACTLY the corresponding link: https://${cleanDomainForLink}/products/[product-handle]. Do not make up handles.
3. If they ask about shopping, shipping, or general prices and there is no specific matching product in the catalog, always offer the main website link: https://${cleanDomainForLink}.
4. Do not use placeholders like [price] or [link]. The reply must be ready to send.
5. Output ONLY the final drafted text, without explanations, quotes, or prefixes.
6. If the user asks about a specific product (its availability, if you sell it, or how to get it) and the product is NOT present in the catalog listed above, you MUST explicitly state that the product is currently not available or not in stock, and invite them to browse the online store at https://${cleanDomainForLink} to see all other products.`;

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
          { role: 'user', content: `Customer comment to reply to: "${itemText}"\nGenerate the drafted reply now for user @${username}:` }
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
