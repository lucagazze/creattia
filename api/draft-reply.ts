import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // Fetch meta_account_id for live catalog
    let meta_account_id: string | null = null;
    try {
      const { data: metaRow } = await supabase
        .from('car_clients')
        .select('meta_account_id')
        .eq('id', clientId)
        .maybeSingle();
      meta_account_id = metaRow?.meta_account_id ?? null;
    } catch { /* skip */ }

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
      website_url,
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

    const formatToWwwLink = (url: string): string => {
      if (!url) return '';
      let clean = url.replace(/^https?:\/\//i, '').trim();
      clean = clean.replace(/^www\./i, '');
      return `www.${clean}`;
    };

    const cleanDomainForLink = shopify_domain ? shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
    const canonicalSiteUrl = formatToWwwLink(website_url || cleanDomainForLink);

    const buildProductLink = (p: any) =>
      p.url
        ? p.url.replace(/^https?:\/\//i, 'www.').replace(/^www\.www\./, 'www.')
        : p.handle ? `${canonicalSiteUrl}/products/${p.handle}` : canonicalSiteUrl;

    // 2. Fetch catalog LIVE from Meta (always up to date, no cache needed)
    let parsedCatalog: any[] = [];
    let productsContext = 'No hay catálogo de productos configurado.';

    if (meta_account_id) {
      try {
        const { data: tokenRow } = await supabase
          .from('AgencySettings')
          .select('value')
          .eq('key', 'meta_ads_token')
          .maybeSingle();
        const metaToken: string = tokenRow?.value || '';

        if (metaToken) {
          const accountId = meta_account_id.startsWith('act_') ? meta_account_id : `act_${meta_account_id}`;
          const META_BASE = 'https://graph.facebook.com/v21.0';

          const cRes = await fetch(`${META_BASE}/${accountId}/product_catalogs?fields=id,name,product_count&access_token=${metaToken}`);
          const cData: any = await cRes.json();
          const catalogs: any[] = cData.data || [];

          if (catalogs.length > 0) {
            const best = catalogs.sort((a: any, b: any) => (b.product_count || 0) - (a.product_count || 0))[0];

            let allProducts: any[] = [];
            let nextUrl: string | null = `${META_BASE}/${best.id}/products?fields=id,name,price,currency,url,product_type,availability&limit=200&access_token=${metaToken}`;
            while (nextUrl && allProducts.length < 500) {
              const pRes: Response = await fetch(nextUrl);
              const pData: any = await pRes.json();
              allProducts = allProducts.concat(pData.data || []);
              nextUrl = pData.paging?.next || null;
            }

            parsedCatalog = allProducts
              .filter((p: any) => !p.availability || p.availability === 'in stock' || p.availability === 'available')
              .map((p: any) => {
                const priceRaw = p.price || '';
                const priceNum = priceRaw.replace(/[^0-9.]/g, '');
                const currency = priceRaw.replace(/[0-9. ]/g, '').trim();
                return {
                  title: p.name || '',
                  price: priceNum ? `${currency || '$'}${parseFloat(priceNum).toFixed(2)}` : 'Consultar',
                  url: p.url || '',
                  type: p.product_type || '',
                  variants: [],
                  handle: '',
                };
              });
          }
        }
      } catch (e) {
        console.error('[Draft Reply] Meta catalog fetch failed:', e);
      }
    }

    if (parsedCatalog.length > 0) {
      productsContext = `Catálogo de productos en tiempo real (${parsedCatalog.length} productos disponibles):\n${
        parsedCatalog.map(p => {
          const typeStr = p.type ? ` | Categoría: ${p.type}` : '';
          return `- ${p.title}: ${p.price}${typeStr}. Link: ${buildProductLink(p)}`;
        }).join('\n')}`;
    }

    // 3. If the message asks about a specific product, fetch its page for full description
    let productPageContext = '';
    if (parsedCatalog.length > 0) {
      const msgLower = itemText.toLowerCase();
      const matched = parsedCatalog.find(p => {
        const titleWords = p.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        return titleWords.some((w: string) => msgLower.includes(w));
      });

      if (matched?.url) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const pageRes = await fetch(matched.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlgorBot/1.0)' },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (pageRes.ok) {
            const html = await pageRes.text();
            // Extract text: remove scripts, styles, nav, footer, header tags
            const clean = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();
            // Take first 2000 chars of meaningful content
            const excerpt = clean.slice(0, 2000);
            if (excerpt.length > 100) {
              productPageContext = `\nCONTENIDO DE LA PÁGINA DEL PRODUCTO "${matched.title}" (${buildProductLink(matched)}):\n${excerpt}\n`;
            }
          }
        } catch (err) {
          // Page fetch failed — continue without it
        }
      }
    }

    const linksContext = clientLinks.length > 0
      ? `Enlaces directos y páginas de interés del sitio web:\n${clientLinks.map(l => `- Para "${l.title}": usar el enlace EXACTO: ${formatToWwwLink(l.url)}`).join('\n')}`
      : 'No hay enlaces directos personalizados configurados en car_links.';

    // DM conversation history context (last 15 messages)
    const conversationHistoryBlock = conversationHistory && conversationHistory.length > 0
      ? `\nCONTEXTO DE LA CONVERSACIÓN (últimos ${conversationHistory.length} mensajes, del más viejo al más reciente):\n${conversationHistory.map(m => `  ${m}`).join('\n')}\n`
      : '';

    const systemMessage = `Fecha y hora actual en Argentina: ${argentineTime}.

Sos el community manager humano de la marca "${business_name}". Tu trabajo es redactar respuestas que suenen 100% humanas, naturales y directas — como si lo escribiera una persona real del equipo, no un bot.

════════════════════════════════════════
CONOCIMIENTO COMPLETO DEL NEGOCIO
════════════════════════════════════════
${brainContext || 'Sin información adicional cargada.'}

════════════════════════════════════════
CATÁLOGO DE PRODUCTOS
════════════════════════════════════════
${productsContext}
${productPageContext ? `════════════════════════════════════════
DESCRIPCIÓN COMPLETA DEL PRODUCTO CONSULTADO
════════════════════════════════════════
${productPageContext}
Usá esta información para dar una respuesta detallada y precisa sobre el producto.` : ''}

════════════════════════════════════════
ENLACES Y PÁGINAS DEL SITIO
════════════════════════════════════════
${linksContext}

${fewShotContext ? `════════════════════════════════════════
EJEMPLOS DE RESPUESTAS REALES ENVIADAS ANTES (úsalas como referencia de tono y estilo)
════════════════════════════════════════
${fewShotContext}` : ''}

════════════════════════════════════════
CONTEXTO DE LA CONVERSACIÓN
════════════════════════════════════════
${isDM ? (conversationHistoryBlock || 'Sin historial previo — primer contacto.') : (otherComments && otherComments.length > 0 ? `Otros comentarios en la misma publicación:\n${otherComments.map(c => `  • ${c}`).join('\n')}` : 'Sin otros comentarios.')}
${postCaption ? `\nPublicación a la que responde: "${postCaption}"` : ''}

════════════════════════════════════════
MENSAJE A RESPONDER
════════════════════════════════════════
Usuario: ${username.startsWith('Usuario') ? '(usuario privado — no mencionar nombre)' : `@${username}`}
Mensaje: "${itemText}"

════════════════════════════════════════
DETECCIÓN DE IDIOMA — REGLA ABSOLUTA
════════════════════════════════════════
El idioma de TU RESPUESTA lo determina ÚNICAMENTE el mensaje específico que estás respondiendo: "${itemText}"

PASO 1 — Identificá el idioma de ESE mensaje:
- Palabras en inglés (any, the, is, are, have, what, how, price, order, leather, good, etc.) → INGLÉS
- Palabras en español → ESPAÑOL
- Si el mensaje es muy corto o ambiguo (ej: "Thanks", "Ok", emojis, signos de puntuación), mirá los otros comentarios del mismo usuario como desempate.

PASO 2 — Respondé SIEMPRE en ese idioma:
- Inglés → 100% inglés. Cero palabras en español. Ni "Hola", ni "Gracias", ni voseo.
- Español → español argentino con voseo. Cero palabras en inglés.
- Portugués → 100% portugués.

NUNCA uses el idioma de los otros comentarios del post para decidir. Cada respuesta sigue el idioma del comentario que estás respondiendo.

════════════════════════════════════════
REGLAS DE RESPUESTA
════════════════════════════════════════

TONO Y HUMANIDAD:
- Escribí como una persona real del equipo, no como un asistente de IA ni un bot corporativo.
- Nada de frases genéricas como "¡Gracias por tu mensaje!", "¡Con gusto te ayudo!" o "¡Espero que tengas un excelente día!".
- NOMBRE DEL USUARIO: Si el campo usuario dice "(usuario privado)" NO uses ningún nombre ni @handle en la respuesta. Si tiene un nombre/handle real, podés usarlo ocasionalmente pero no es obligatorio.
- Sé directo y natural. Contestá lo que preguntaron, sin rodeos.
- Podés usar contracciones, lenguaje casual y expresiones reales de la marca.
- Si el tono de la marca es relajado e informal (como se ve en los ejemplos), usalo.
- ${isDM ? 'En DMs: la respuesta puede ser más larga si la pregunta lo requiere, pero siempre natural y conversacional.' : 'En comentarios: máximo 2-3 oraciones. Corto, directo, humano.'}

PRODUCTOS Y DISPONIBILIDAD:
- Antes de decir que algo no existe, revisá EXHAUSTIVAMENTE el catálogo y el conocimiento del negocio. Buscá por nombre, categoría, descripción parcial y sinónimos.
- Si el producto existe en el catálogo: mencionalo con su nombre exacto, precio si corresponde, y el link directo: ${canonicalSiteUrl}/products/[handle-exacto].
- Si después de revisar TODO el catálogo el producto definitivamente no está: decilo honestamente e invitá a explorar el sitio en ${canonicalSiteUrl}.
- NUNCA sugeras que un producto no existe si hay algo similar o equivalente en el catálogo.

HISTORIAL EN DMs:
- Leé TODO el historial de la conversación antes de responder.
- No repitas información, productos, links o explicaciones que ya se dieron.
- Si ya se saludó al cliente, NO volvás a saludar. Seguí la conversación de forma natural.
- Ajustá la longitud de tu respuesta al ritmo de la conversación: si los mensajes son cortos, respondé corto; si son detallados, podés extenderte.
- Siempre respondé el mensaje MÁS RECIENTE del cliente, no los anteriores.

LINKS Y URLs:
- Todo link debe empezar con "www." y sin "https://" ni "http://".
- Usá únicamente los links exactos del catálogo o de los enlaces configurados. No los modifiques ni los inventes.
- Si no hay un link específico, usá el sitio principal: ${canonicalSiteUrl}.

FORMATO FINAL:
- Salida: ÚNICAMENTE el texto de la respuesta. Sin comillas, sin explicaciones, sin prefijos, sin "Borrador:", sin "Respuesta:".
- Nada de placeholders como [nombre], [precio], [link]. La respuesta tiene que estar lista para enviarse tal cual.
- No uses asteriscos ni formato markdown. Solo texto plano.`;

    // 4. Call AI API — Gemini 2.0 Flash preferred, fallback to OpenAI gpt-4o-mini
    const userPrompt = `${isDM ? 'Mensaje del cliente en el DM' : 'Comentario del cliente'}: "${itemText}"\nRedactá la respuesta${username.startsWith('Usuario') ? '' : ` para @${username}`}:`;
    let draftText = '';

    if (geminiKey) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemMessage }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: 0.75,
              maxOutputTokens: 1024,
            },
            thinkingConfig: { thinkingBudget: 0 },
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
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.75,
          max_tokens: 1024,
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
