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

  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openAiKey) {
    return res.status(500).json({ error: 'No AI API key configured' });
  }

  const { clientId, itemText, username, postCaption, otherComments, conversationHistory, isDM } = req.body as {
    clientId: string;
    itemText: string;
    username: string;
    postCaption?: string;
    otherComments?: string[];
    conversationHistory?: string[]; // last N messages of the DM thread
    isDM?: boolean;
  };

  if (!clientId || !itemText) {
    return res.status(400).json({ error: 'Missing clientId or itemText' });
  }

  try {
    // 1. Fetch client settings from Supabase
    const { data: client, error: dbError } = await supabase
      .from('car_clients')
      .select('business_name, ecommerce_platform, shopify_domain, shopify_access_token, business_description, custom_instructions, scraped_content, instagram_context, website_url')
      .eq('id', clientId)
      .maybeSingle();

    if (dbError || !client) {
      return res.status(404).json({ error: 'Client not found or database error' });
    }

    // Fetch custom client links from Supabase
    let clientLinks: any[] = [];
    try {
      const { data: linksData } = await supabase
        .from('car_links')
        .select('title, url')
        .eq('client_id', clientId);
      if (linksData) {
        clientLinks = linksData;
      }
    } catch (err) {
      console.error('[Draft Reply] Error fetching client links:', err);
    }

    const { 
      business_name, 
      ecommerce_platform, 
      shopify_domain, 
      shopify_access_token,
      business_description,
      custom_instructions,
      scraped_content,
      instagram_context,
      website_url
    } = client;

    // Compiled business brain context
    const brainContext = [
      business_description ? `INFORMACIÓN DEL NEGOCIO:\n${business_description}` : '',
      scraped_content ? `CONOCIMIENTO APRENDIDO DE LA WEB:\n${scraped_content}` : '',
      instagram_context ? `CONOCIMIENTO APRENDIDO DE INSTAGRAM:\n${instagram_context}` : '',
      custom_instructions ? `INSTRUCCIONES DE TONO Y ESTILO:\n${custom_instructions}` : ''
    ].filter(Boolean).join('\n\n');

    // Fetch recent successful replies from activity log for few-shot learning
    let fewShotContext = '';
    try {
      const { data: recentActivities } = await supabase
        .from('car_user_activity')
        .select('metadata')
        .eq('client_id', clientId)
        .eq('action', 'reply_sent')
        .order('created_at', { ascending: false })
        .limit(20);

      if (recentActivities && recentActivities.length > 0) {
        const fewShotExamples = recentActivities
          .map(act => act.metadata)
          .filter(meta => meta && meta.incoming_text && meta.reply_text)
          .slice(0, 5); // Take up to 5 examples

        if (fewShotExamples.length > 0) {
          fewShotContext = `Here are some historical examples of replies previously sent by the brand to other customers. Use them as reference for the preferred tone, style, and structure:
${fewShotExamples.map((ex, i) => `Example ${i + 1}:
- Customer wrote: "${ex.incoming_text}"
- Brand reply: "${ex.reply_text}"`).join('\n\n')}`;
        }
      }
    } catch (err) {
      console.error('[Draft Reply] Error fetching historical replies:', err);
    }

    // 2. Fetch Shopify products if platform is Shopify
    let products: any[] = [];
    if (ecommerce_platform === 'shopify' && shopify_domain && shopify_access_token) {
      try {
        const cleanDomain = shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const shopifyUrl = `https://${cleanDomain}/admin/api/2024-01/products.json?limit=250&fields=title,handle,variants`;
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
    // Use the exact website_url saved in the brain as the canonical link.
    // Falls back to constructing from shopify_domain if website_url is not set.
    const cleanDomainForLink = shopify_domain ? shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
    // The canonical site URL: prefer the manually saved website_url from the brain.
    const canonicalSiteUrl = website_url
      ? website_url.replace(/\/$/, '')  // trim trailing slash but keep the URL exactly as saved
      : (cleanDomainForLink ? `https://${cleanDomainForLink}` : '');

    const productsContext = products.length > 0
      ? `Catálogo de productos de la tienda:\n${products.map(p => {
          const variantsList = p.variants?.map((v: any) => {
            const priceStr = v.price ? `${v.price}` : '';
            const titleStr = v.title && v.title !== 'Default Title' ? v.title : '';
            return { title: titleStr, price: priceStr };
          }) || [];

          let priceText = '';
          if (variantsList.length === 0) {
            priceText = 'Precio: Consultar';
          } else if (variantsList.length === 1 && !variantsList[0].title) {
            priceText = `Precio: $${variantsList[0].price || 'Consultar'}`;
          } else {
            const uniquePrices = Array.from(new Set(variantsList.map(v => v.price).filter(Boolean)));
            if (uniquePrices.length === 1) {
              priceText = `Precio: $${uniquePrices[0]} (Variantes/Talles disponibles: ${variantsList.map(v => v.title).join(', ')})`;
            } else {
              priceText = `Variantes/Talles y Precios: ${variantsList.map(v => `${v.title || 'Única'} a $${v.price}`).join(', ')}`;
            }
          }
          return `- ${p.title}: ${priceText}. Link de compra EXACTO: ${canonicalSiteUrl}/products/${p.handle}`;
        }).join('\n')}`
      : 'No hay catálogo de productos de Shopify configurado.';

    const linksContext = clientLinks.length > 0
      ? `Enlaces directos y páginas de interés del sitio web:\n${clientLinks.map(l => `- Para "${l.title}": usar el enlace EXACTO: ${l.url}`).join('\n')}`
      : 'No hay enlaces directos personalizados configurados en car_links.';

    // DM conversation history context (last 15 messages)
    const conversationHistoryBlock = conversationHistory && conversationHistory.length > 0
      ? `\nCONTEXTO DE LA CONVERSACIÓN (últimos ${conversationHistory.length} mensajes, del más viejo al más reciente):\n${conversationHistory.map(m => `  ${m}`).join('\n')}\n`
      : '';

    const systemMessage = `You are Algor, the advanced AI assistant for the brand "${business_name}".
${isDM ? 'Your task is to draft a natural, helpful, premium direct message reply to continue a conversation.' : 'Your task is to draft a friendly, natural, premium reply to a social media message.'}

CRITICAL INSTRUCTION - LANGUAGE DETECTION:
- You MUST identify the language of the customer's message: "${itemText}".
- You MUST draft the reply in that EXACT same language.
- If the customer wrote in English, the reply MUST be 100% in English. Do NOT use a single word of Spanish.
- If the customer wrote in Spanish, the reply MUST be 100% in Spanish (using Argentine Spanish voseo: e.g., "vos", "tenés", "consultame", "mirá", "compralo").
- If the customer wrote in Portuguese, the reply MUST be 100% in Portuguese.
- NEVER mix languages. If the comment is in English, do NOT output a single word in Spanish (such as "Hola", "Gracias", or "conseguilo").

Details:
- Social media user: @${username}
- Their latest message: "${itemText}"
${postCaption ? `- Caption/Text of the post (context): "${postCaption}"` : ''}
${otherComments && otherComments.length > 0 ? `- Other comments in the same post (context):\n${otherComments.map(c => `  * ${c}`).join('\n')}` : ''}
${conversationHistoryBlock}
${productsContext}
${linksContext}

${brainContext ? `Conocimiento adicional del negocio (Cerebro):\n${brainContext}\n` : ''}

${fewShotContext ? `\n${fewShotContext}\n` : ''}

Rules:
1. ${isDM ? 'Be conversational, premium, and helpful. You can use 1-3 sentences for DMs.' : 'Be extremely concise (maximum 1 or 2 sentences).'}
2. If they ask about a specific product, availability, price, or how to buy:
   - Check the Shopify products catalog context above. If a product matches, recommend it and include EXACTLY the corresponding link: ${canonicalSiteUrl}/products/[product-handle]. Do not invent handles.
   - If they ask about a specific product that is NOT present in the catalog listed above, you MUST explicitly state that the product is currently not available or not in stock, and invite them to browse the online store at ${canonicalSiteUrl} or offer a matching category link from the custom links context.
3. If they ask about general shopping, shipping, refunds, exchanges, contact, or FAQs:
   - Search the custom links context above. If a link matches the topic (e.g. shipping policies link, exchanges/refunds link, FAQs link, contact page, WhatsApp group link), recommend that EXACT URL. Never modify, shorten, or reconstruct it.
   - If there is no specific matching link in the custom links list but there is information in the business brain, explain it briefly and invite them to use the main store URL: ${canonicalSiteUrl}.
4. Do not use placeholders like [price] or [link]. The reply must be ready to send.
5. Output ONLY the final drafted text, without explanations, quotes, or prefixes.
${isDM ? '6. Take into account the full conversation history above to understand the context, what has already been discussed, and what the customer needs next.' : ''}`;


    // 4. Call AI API — Gemini 2.0 Flash preferred, fallback to OpenAI gpt-4.1-mini
    const userPrompt = `${isDM ? 'Mensaje del cliente en el DM' : 'Comentario del cliente'}: "${itemText}"\nGenerá el borrador de respuesta para @${username} en el mismo idioma del mensaje:`;
    let draftText = '';

    if (geminiKey) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemMessage }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: isDM ? 300 : 200,
            },
          }),
        }
      );
      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        draftText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      } else {
        const errText = await geminiRes.text();
        console.error('Gemini error, falling back to OpenAI:', errText);
      }
    }

    // Fallback to OpenAI if Gemini not available or failed
    if (!draftText && openAiKey) {
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: isDM ? 300 : 200,
        }),
      });
      if (openAiRes.ok) {
        const openAiData = await openAiRes.json();
        draftText = openAiData.choices?.[0]?.message?.content?.trim() || '';
      } else {
        const errText = await openAiRes.text();
        return res.status(502).json({ error: 'AI error', detail: errText });
      }
    }

    if (!draftText) {
      return res.status(502).json({ error: 'Empty response from AI' });
    }

    return res.status(200).json({ draft: draftText });

  } catch (err: any) {
    console.error('Draft generation error:', err);
    return res.status(502).json({ error: 'Draft reply server error', detail: err.message });
  }
}
