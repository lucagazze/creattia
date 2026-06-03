// draft-reply v4 — stable build, gemini-2.5-flash, smart context
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const argentineTime = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openAiKey) {
    return res.status(500).json({ error: 'No AI API key configured' });
  }

  const {
    clientId, itemText, username,
    postCaption, postPlatform,
    allComments, otherComments,
    conversationHistory, isDM, forceLang,
  } = req.body || {};

  if (!clientId || !itemText) {
    return res.status(400).json({ error: 'Missing clientId or itemText' });
  }

  try {
    // 1. Fetch client from Supabase
    const { data: client, error: dbError } = await supabase
      .from('car_clients')
      .select('business_name, ecommerce_platform, shopify_domain, shopify_access_token, business_description, custom_instructions, scraped_content, instagram_context, website_url, meta_account_id, klaviyo_api_key')
      .eq('id', clientId)
      .maybeSingle();

    if (dbError) {
      console.error('[draft-reply] DB error:', JSON.stringify(dbError));
      return res.status(500).json({ error: 'DB error', detail: dbError.message });
    }
    if (!client) {
      return res.status(404).json({ error: 'Client not found', id: clientId });
    }

    const {
      business_name, shopify_domain, shopify_access_token,
      business_description, custom_instructions, scraped_content, instagram_context,
      website_url,
    } = client as any;
    const meta_account_id: string | null = (client as any).meta_account_id ?? null;

    // Parse cerebro custom_instructions
    let toneInstructions = '', offersContext = '', faqContext = '';
    try {
      const ci = JSON.parse(custom_instructions || '{}');
      toneInstructions = ci.tone || '';
      offersContext = ci.offers || '';
      faqContext = ci.faq || '';
    } catch {
      toneInstructions = custom_instructions || '';
    }

    // 2. Fetch client links
    let clientLinks: { title: string; url: string }[] = [];
    try {
      const { data } = await supabase.from('car_links').select('title, url').eq('client_id', clientId);
      if (data) clientLinks = data;
    } catch (_) { /* ignore */ }

    // 3. Fetch recent replies for few-shot learning
    let fewShotContext = '';
    try {
      const { data: acts } = await supabase
        .from('car_user_activity').select('metadata')
        .eq('client_id', clientId).eq('action', 'reply_sent')
        .order('created_at', { ascending: false }).limit(15);
      const examples = (acts || [])
        .map((a: any) => a.metadata)
        .filter((m: any) => m?.incoming_text && m?.reply_text)
        .slice(0, 4);
      if (examples.length > 0) {
        fewShotContext = examples
          .map((ex: any, i: number) => `Ejemplo ${i + 1}:\n  Cliente: "${ex.incoming_text}"\n  Marca: "${ex.reply_text}"`)
          .join('\n\n');
      }
    } catch (_) { /* ignore */ }

    // 4. Build catalog
    const formatToWww = (url: string) => {
      if (!url) return '';
      return 'www.' + url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    };
    const cleanDomain = (shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const canonicalSite = formatToWww(website_url || cleanDomain);
    const buildLink = (p: any) => {
      if (p.url) return p.url.replace(/^https?:\/\//i, 'www.').replace(/^www\.www\./, 'www.');
      if (p.handle) return `${canonicalSite}/products/${p.handle}`;
      return canonicalSite;
    };

    let parsedCatalog: any[] = [];

    // Meta catalog
    if (meta_account_id) {
      try {
        const { data: tokenRow } = await supabase
          .from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
        const metaToken: string = (tokenRow as any)?.value || '';
        if (metaToken) {
          const accountId = meta_account_id.startsWith('act_') ? meta_account_id : `act_${meta_account_id}`;
          const cRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/product_catalogs?fields=id,name,product_count&access_token=${metaToken}`);
          const cData = await cRes.json() as any;
          const best = (cData.data || []).sort((a: any, b: any) => (b.product_count || 0) - (a.product_count || 0))[0];
          if (best) {
            let allProds: any[] = [];
            let nextUrl: string | null = `https://graph.facebook.com/v21.0/${best.id}/products?fields=id,name,price,currency,url,product_type,availability&limit=200&access_token=${metaToken}`;
            while (nextUrl && allProds.length < 300) {
              const pRes = await fetch(nextUrl);
              const pData = await pRes.json() as any;
              allProds = allProds.concat(pData.data || []);
              nextUrl = pData.paging?.next || null;
            }
            parsedCatalog = allProds
              .filter((p: any) => !p.availability || p.availability === 'in stock' || p.availability === 'available')
              .map((p: any) => {
                const priceNum = (p.price || '').replace(/[^0-9.]/g, '');
                const priceCur = (p.price || '').replace(/[0-9. ]/g, '').trim();
                return {
                  title: p.name || '',
                  price: priceNum ? `${priceCur || '$'}${parseFloat(priceNum).toFixed(2)}` : 'Consultar',
                  url: p.url || '', type: p.product_type || '', handle: '', variants: [],
                };
              });
          }
        }
      } catch (_) { /* ignore */ }
    }

    // Shopify catalog
    if (shopify_domain && shopify_access_token) {
      try {
        const sRes = await fetch(
          `https://${cleanDomain}/admin/api/2024-01/products.json?limit=250&fields=title,handle,variants,status,product_type`,
          { headers: { 'X-Shopify-Access-Token': shopify_access_token, 'Accept': 'application/json' } }
        );
        if (sRes.ok) {
          const sData = await sRes.json() as any;
          for (const sp of (sData.products || []).filter((p: any) => p.status === 'active')) {
            if (parsedCatalog.some((p: any) => p.title.toLowerCase() === (sp.title || '').toLowerCase())) continue;
            const vs = sp.variants || [];
            const rawPrices: string[] = Array.from(new Set(vs.map((v: any) => v.price).filter(Boolean))) as string[];
            const nums = rawPrices.map(Number).filter(n => !isNaN(n));
            const priceStr = nums.length === 1 ? `$${nums[0]}` : nums.length > 1 ? `$${Math.min(...nums)}-$${Math.max(...nums)}` : 'Consultar';
            parsedCatalog.push({
              title: sp.title, price: priceStr, url: '', handle: sp.handle,
              type: sp.product_type || '',
              variants: vs.map((v: any) => v.title).filter((t: string) => t && t !== 'Default Title'),
            });
          }
        }
      } catch (_) { /* ignore */ }
    }

    // WooCommerce catalog (columns may not exist in DB, skip if undefined)
    const woo_consumer_key = undefined;
    const woo_consumer_secret = undefined;
    const wordpress_url = undefined;
    if (wordpress_url && woo_consumer_key && woo_consumer_secret) {
      try {
        const base = (wordpress_url as string).replace(/\/$/, '');
        const creds = Buffer.from(`${woo_consumer_key}:${woo_consumer_secret}`).toString('base64');
        for (let page = 1; page <= 2; page++) {
          const r = await fetch(`${base}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`, {
            headers: { Authorization: `Basic ${creds}` },
          });
          if (!r.ok) break;
          const wooData = await r.json() as any[];
          if (!wooData.length) break;
          for (const wp of wooData) {
            if (parsedCatalog.some((p: any) => p.title.toLowerCase() === (wp.name || '').toLowerCase())) continue;
            parsedCatalog.push({
              title: wp.name || '', price: `$${wp.price || wp.regular_price || '?'}`,
              url: wp.permalink || '', handle: wp.slug || '',
              type: (wp.categories && wp.categories[0]?.name) || '', variants: [],
            });
          }
        }
      } catch (_) { /* ignore */ }
    }

    // Filter catalog to relevant products (max 40)
    const queryLower = itemText.toLowerCase();
    const matched = parsedCatalog.filter((p: any) => {
      const words = (p.title || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      return words.some((w: string) => queryLower.includes(w));
    });
    const others = parsedCatalog.filter((p: any) => !matched.includes(p)).slice(0, 40 - matched.length);
    const relevantCatalog = matched.concat(others);

    // Detect if message is asking about a specific product/price
    const askingPrice = /precio|price|cost|cuánto|cuanto|vale|valor|cuesta|how much|\$|pesos|dolar/i.test(itemText);
    const askingProduct = /tenés|tienen|hay|stock|disponible|comprar|buy|quiero|necesito|busco|want|need|available/i.test(itemText);
    const productMentioned = matched.length > 0;

    // Build catalog context with validation hints
    let productsContext = '';
    if (parsedCatalog.length === 0) {
      productsContext = 'Sin catálogo configurado.';
    } else if ((askingPrice || askingProduct) && !productMentioned) {
      // Query seems product-related but no match found in catalog
      productsContext = `Catálogo disponible (${parsedCatalog.length} productos). El producto específico que pregunta el cliente NO fue encontrado en el catálogo.\n\n⚠️ PRODUCTO NO ENCONTRADO EN CATÁLOGO — Ver instrucciones de respuesta abajo.`;
    } else {
      productsContext = `Catálogo (${parsedCatalog.length} productos totales, ${relevantCatalog.length} relevantes):\n${
        relevantCatalog.map((p: any) => {
          const vars = p.variants && p.variants.length > 0 ? ` | vars: ${p.variants.slice(0, 4).join(', ')}` : '';
          return `- ${p.title}: ${p.price}${vars} → ${buildLink(p)}`;
        }).join('\n')
      }`;
    }

    const linksBlock = clientLinks.length > 0
      ? clientLinks.map((l: any) => `- ${l.title}: ${formatToWww(l.url)}`).join('\n')
      : 'Sin enlaces personalizados.';

    // 5. Language detection
    let lang: 'english' | 'spanish' | 'portuguese';
    if (forceLang === 'en') lang = 'english';
    else if (forceLang === 'pt') lang = 'portuguese';
    else if (forceLang === 'es') lang = 'spanish';
    else {
      const isEN = /\b(the|is|are|was|were|have|has|will|can|do|does|not|this|that|with|from|they|what|how|your|get|buy|order|price|ship|help|good|great|like|just|want|need)\b/i.test(itemText);
      const isES = /\b(el|la|los|las|un|una|que|de|en|por|para|con|como|más|tengo|quiero|puedo|precio|envío|gracias|hola|también|pero|muy|bien|cuánto)\b/i.test(itemText);
      const isPT = /\b(eu|você|não|com|por|uma|dos|das|está|tem|muito|também|preciso|quero|obrigado|olá)\b/i.test(itemText);
      lang = isPT && !isEN && !isES ? 'portuguese' : isES && !isEN ? 'spanish' : isEN ? 'english' : 'spanish';
    }
    const LANG = lang === 'english' ? 'ENGLISH' : lang === 'portuguese' ? 'PORTUGUESE' : 'SPANISH';
    const langRule = lang === 'english'
      ? 'Every word must be English. Not "Hola", not "Gracias", nothing Spanish.'
      : lang === 'portuguese'
      ? 'Cada palavra deve ser em português.'
      : 'Cada palabra en español argentino con voseo. Cero inglés.';

    // 6. Thread context
    let threadContext = '';
    if (!isDM) {
      if (allComments && allComments.length > 0) {
        threadContext = 'HILO COMPLETO DE COMENTARIOS:\n' + (allComments as any[]).map((c: any) => {
          const replied = c.reply ? `\n    → Marca: "${c.reply}"` : '\n    → SIN RESPUESTA AÚN';
          return `  @${c.username}: "${c.text}"${replied}`;
        }).join('\n');
      } else if (otherComments && otherComments.length > 0) {
        threadContext = 'Otros comentarios:\n' + (otherComments as string[]).map((c: string) => `  ${c}`).join('\n');
      }
    }

    const dmHistory = isDM && conversationHistory && conversationHistory.length > 0
      ? `HISTORIAL (más antiguo → reciente):\n${(conversationHistory as string[]).map(m => `  ${m}`).join('\n')}`
      : isDM ? 'Primer contacto.' : '';

    // 7. Smart thinking budget
    const isComplex = /precio|price|cost|cuánto|cuanto|disponible|stock|envío|shipping|comprar|buy|order|talla|size|variante|descuento|discount|wholesale|material|calidad|quality|diferencia|recomend/i.test(itemText);
    const isComplaint = /problema|error|falla|roto|defect|queja|terrible|no llegó|no funcionó|devoluci/i.test(itemText);
    const thinkingBudget = isComplaint ? 2048 : isComplex ? 1024 : 0;

    // 8. Platform
    const platformLabel = postPlatform === 'facebook' ? 'Facebook' : postPlatform === 'instagram' ? 'Instagram' : isDM ? 'DM' : 'Red social';

    // 9. Brain context
    const brainParts = [
      business_description && `NEGOCIO:\n${business_description}`,
      scraped_content && `WEB:\n${scraped_content}`,
      instagram_context && `REDES:\n${instagram_context}`,
      toneInstructions && `TONO:\n${toneInstructions}`,
      offersContext && `OFERTAS ACTIVAS:\n${offersContext}`,
      faqContext && `FAQ:\n${faqContext}`,
    ].filter(Boolean).join('\n\n---\n\n');

    // 10. System prompt
    const systemPrompt = `⚠️ IDIOMA: ${LANG}. ${langRule}. Sin excepciones.

Hoy: ${argentineTime}. Plataforma: ${platformLabel}.

════ CEREBRO DEL NEGOCIO ════
${brainParts || 'Sin información cargada.'}

════ CATÁLOGO ════
${productsContext}

════ ENLACES ════
${linksBlock}

${fewShotContext ? `════ EJEMPLOS DE RESPUESTAS REALES ════\n${fewShotContext}` : ''}

════ ROL ════
Sos la persona detrás de las redes de "${business_name}". No un bot. Un humano que trabaja en la marca y responde de forma natural.

════ REGLA CRÍTICA — PRODUCTOS Y PRECIOS (NUNCA IGNORAR) ════
1. SOLO podés mencionar el nombre exacto, precio o URL de un producto si ese producto aparece LITERALMENTE en el catálogo de arriba con un precio real (no "Consultar").
2. Si alguien pregunta por un producto y lo encontrás en el catálogo → respondé con el nombre y precio EXACTO del catálogo. No redondees ni modifiques el precio.
3. Si el catálogo muestra "Consultar" para el precio → NO digas ningún precio. Redirigí al privado/DM.
4. Si el producto NO aparece en el catálogo o no hay catálogo configurado → NO menciones ese producto ni inventes un precio. ${isDM ? 'Decí que vas a verificar y le respondés en breve.' : 'Decí "Te respondemos por privado 📩" y no menciones el producto ni el precio.'}
5. NUNCA inventar productos, precios, URLs ni disponibilidad. Si no está en el catálogo, no existe para vos.
${(!productMentioned && (askingPrice || askingProduct)) ? '\n⚠️ ATENCIÓN: El cliente pregunta por un producto/precio pero NO se encontró en el catálogo. Aplicar regla 4: no mencionar producto ni precio, redirigir al privado.' : ''}

════ CÓMO RESPONDER ════
${isDM
  ? `DM: Leé TODO el historial antes de responder. No repetir info ya dada. Respondé el mensaje más reciente. Tono natural y conversacional.`
  : `COMENTARIO en ${platformLabel}: Máximo 1-3 oraciones. Sin "¡Gracias por tu mensaje!" ni aperturas genéricas. Si es halago → respuesta corta (ej: "gracias 🙌"). Revisá el hilo: no repetir respuestas iguales a otros usuarios.`
}

LINKS — REGLA IMPORTANTE:
- Si mencionás un producto específico (precio, descripción, disponibilidad) → SIEMPRE incluí el link de ese producto del catálogo.
- Si no hay producto específico pero la persona quiere comprar → link de la tienda: ${canonicalSite}
- Si es un comentario de opinión o halago sin intención de compra → NO incluir link.
- Formato siempre "www." sin https://. Nunca inventar links — solo los del catálogo.

FORMATO: Solo el texto listo para enviar. Sin comillas, sin "Borrador:", sin markdown. Si la respuesta óptima es un emoji → solo el emoji.`;

    const userPrompt = isDM
      ? `${dmHistory}\n\nMensaje del cliente: "${itemText}"\nRedactá la respuesta${username ? ` para ${username}` : ''}:`
      : `${postCaption ? `Publicación: "${postCaption}"\n` : ''}${threadContext ? `\n${threadContext}\n` : ''}Comentario: @${username}: "${itemText}"\nRedactá la respuesta:`;

    // 11. Call Gemini 2.5 Flash
    let draftText = '';

    if (geminiKey) {
      try {
        const geminiBody = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
        };
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody) }
        );
        if (geminiRes.ok) {
          const geminiData = await geminiRes.json() as any;
          const parts = geminiData.candidates?.[0]?.content?.parts || [];
          draftText = (parts.find((p: any) => p.text)?.text || '').trim();
        } else {
          console.error('[draft-reply] Gemini error:', geminiRes.status, await geminiRes.text());
        }
      } catch (e) {
        console.error('[draft-reply] Gemini exception:', e);
      }
    }

    // 12. Fallback to OpenAI
    if (!draftText && openAiKey) {
      try {
        const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.7, max_tokens: 512,
          }),
        });
        if (oaRes.ok) {
          const oaData = await oaRes.json() as any;
          draftText = (oaData.choices?.[0]?.message?.content || '').trim();
        } else {
          const errText = await oaRes.text();
          console.error('[draft-reply] OpenAI error:', oaRes.status, errText);
          return res.status(502).json({ error: 'AI error', detail: errText });
        }
      } catch (e: any) {
        return res.status(502).json({ error: 'AI exception', detail: e.message });
      }
    }

    if (!draftText) {
      return res.status(502).json({ error: 'Empty AI response' });
    }

    return res.status(200).json({ draft: draftText });

  } catch (err: any) {
    console.error('[draft-reply] Unhandled error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}
