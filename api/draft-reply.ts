// draft-reply v3 — optimized context, smart thinking, filtered catalog
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Detect message complexity to decide thinking budget
function getThinkingBudget(text: string): number {
  const t = text.toLowerCase();
  const isComplex =
    /precio|price|cost[ao]?|cu[aá]nto|disponible|available|stock|env[ií]o|shipping|comprar|buy|order|pedido|talla|size|variante|variant|descuento|discount|wholesale|mayor[ií]sta|cantidad|medida|material|calidad|quality|diferencia|difference|recomend|suggest|fit|sirve|funciona/i.test(t);
  const isComplaint =
    /mal|problem[ao]|error|falla|roto|defect|queja|complaint|terrible|p[eé]simo|no lleg[oó]|no funcion|devoluci[oó]n|refund|cambio/i.test(t);
  if (isComplaint) return 2048;
  if (isComplex) return 1024;
  return 0; // simple comment/emoji/greeting — no thinking needed
}

// Filter catalog to most relevant products for the query (saves tokens)
function filterCatalog(catalog: any[], queryText: string): any[] {
  if (!catalog.length) return [];
  const q = queryText.toLowerCase();
  // Find direct matches first
  const matched = catalog.filter(p => {
    const words = (p.title || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    return words.some((w: string) => q.includes(w));
  });
  // Fill up to 40 with other products
  const others = catalog.filter(p => !matched.includes(p)).slice(0, 40 - matched.length);
  return [...matched, ...others];
}

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
  if (!geminiKey && !openAiKey) return res.status(500).json({ error: 'No AI API key configured' });

  const {
    clientId,
    itemText,
    username,
    // comment context
    postCaption,
    postMediaUrl,   // image/video URL of the post
    postPlatform,   // 'instagram' | 'facebook'
    allComments,    // full thread: [{username, text, reply?}]
    otherComments,  // legacy fallback
    // DM context
    conversationHistory,
    isDM,
    forceLang,
  } = req.body as {
    clientId: string; itemText: string; username: string;
    postCaption?: string; postMediaUrl?: string; postPlatform?: string;
    allComments?: { username: string; text: string; reply?: string }[];
    otherComments?: string[];
    conversationHistory?: string[]; isDM?: boolean; forceLang?: 'en' | 'es' | 'pt';
  };

  if (!clientId || !itemText) return res.status(400).json({ error: 'Missing clientId or itemText' });

  try {
    // 1. Fetch client brain from Supabase
    const { data: client, error: dbError } = await supabase
      .from('car_clients')
      .select('business_name, ecommerce_platform, shopify_domain, shopify_access_token, wordpress_url, woo_consumer_key, woo_consumer_secret, business_description, custom_instructions, scraped_content, instagram_context, website_url, meta_account_id')
      .eq('id', clientId)
      .maybeSingle();

    if (dbError || !client) return res.status(404).json({ error: 'Client not found' });

    const {
      business_name, ecommerce_platform,
      shopify_domain, shopify_access_token,
      wordpress_url, woo_consumer_key, woo_consumer_secret,
      business_description, custom_instructions, scraped_content, instagram_context,
      website_url,
    } = client;
    const meta_account_id: string | null = (client as any).meta_account_id ?? null;

    // Parse cerebro custom_instructions (JSON {tone, offers, faq} or plain string)
    let toneInstructions = '', offersContext = '', faqContext = '';
    try {
      const ci = JSON.parse(custom_instructions || '{}');
      toneInstructions = ci.tone || ''; offersContext = ci.offers || ''; faqContext = ci.faq || '';
    } catch { toneInstructions = custom_instructions || ''; }

    // 2. Fetch client links
    let clientLinks: { title: string; url: string }[] = [];
    try {
      const { data } = await supabase.from('car_links').select('title, url').eq('client_id', clientId);
      if (data) clientLinks = data;
    } catch {}

    // 3. Fetch recent successful replies for few-shot learning
    let fewShotContext = '';
    try {
      const { data: acts } = await supabase
        .from('car_user_activity').select('metadata')
        .eq('client_id', clientId).eq('action', 'reply_sent')
        .order('created_at', { ascending: false }).limit(20);
      const examples = (acts || [])
        .map(a => a.metadata)
        .filter((m: any) => m?.incoming_text && m?.reply_text)
        .slice(0, 5);
      if (examples.length > 0) {
        fewShotContext = examples
          .map((ex: any, i: number) => `Ejemplo ${i + 1}:\n  Cliente: "${ex.incoming_text}"\n  Marca: "${ex.reply_text}"`)
          .join('\n\n');
      }
    } catch {}

    // 4. Build product catalog — Meta + Shopify + WooCommerce
    let parsedCatalog: any[] = [];
    const formatToWww = (url: string) => {
      if (!url) return '';
      return 'www.' + url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    };
    const cleanDomain = shopify_domain ? shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
    const canonicalSite = formatToWww(website_url || cleanDomain);
    const buildLink = (p: any) =>
      p.url ? p.url.replace(/^https?:\/\//i, 'www.').replace(/^www\.www\./, 'www.')
             : p.handle ? `${canonicalSite}/products/${p.handle}` : canonicalSite;

    // Meta catalog
    if (meta_account_id) {
      try {
        const { data: tokenRow } = await supabase
          .from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
        const metaToken: string = tokenRow?.value || '';
        if (metaToken) {
          const accountId = meta_account_id.startsWith('act_') ? meta_account_id : `act_${meta_account_id}`;
          const cRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/product_catalogs?fields=id,name,product_count&access_token=${metaToken}`);
          const cData: any = await cRes.json();
          const best = (cData.data || []).sort((a: any, b: any) => (b.product_count || 0) - (a.product_count || 0))[0];
          if (best) {
            let all: any[] = [], next: string | null =
              `https://graph.facebook.com/v21.0/${best.id}/products?fields=id,name,price,currency,url,product_type,availability&limit=200&access_token=${metaToken}`;
            while (next && all.length < 500) {
              const r: any = await (await fetch(next)).json();
              all = all.concat(r.data || []);
              next = r.paging?.next || null;
            }
            parsedCatalog = all
              .filter((p: any) => !p.availability || p.availability === 'in stock' || p.availability === 'available')
              .map((p: any) => {
                const pr = (p.price || '').replace(/[^0-9.]/g, '');
                const cu = (p.price || '').replace(/[0-9. ]/g, '').trim();
                return { title: p.name || '', price: pr ? `${cu || '$'}${parseFloat(pr).toFixed(2)}` : 'Consultar', url: p.url || '', type: p.product_type || '', handle: '', variants: [] };
              });
          }
        }
      } catch {}
    }

    // Shopify catalog
    if (shopify_domain && shopify_access_token) {
      try {
        const sRes = await fetch(
          `https://${cleanDomain}/admin/api/2024-01/products.json?limit=250&fields=title,handle,variants,status,product_type`,
          { headers: { 'X-Shopify-Access-Token': shopify_access_token, 'Accept': 'application/json' } }
        );
        if (sRes.ok) {
          const { products = [] } = await sRes.json() as any;
          for (const sp of products.filter((p: any) => p.status === 'active')) {
            if (parsedCatalog.some(p => p.title.toLowerCase() === sp.title.toLowerCase())) continue;
            const vs = sp.variants || [];
            const prices = [...new Set(vs.map((v: any) => v.price).filter(Boolean))];
            parsedCatalog.push({
              title: sp.title,
              price: prices.length === 1 ? `$${prices[0]}` : prices.length > 1 ? `$${Math.min(...prices.map(Number))}-$${Math.max(...prices.map(Number))}` : 'Consultar',
              url: '', handle: sp.handle, type: sp.product_type || '',
              variants: vs.map((v: any) => v.title).filter((t: string) => t && t !== 'Default Title'),
            });
          }
        }
      } catch {}
    }

    // WooCommerce catalog
    if (wordpress_url && woo_consumer_key && woo_consumer_secret) {
      try {
        const base = (wordpress_url as string).replace(/\/$/, '');
        const creds = Buffer.from(`${woo_consumer_key}:${woo_consumer_secret}`).toString('base64');
        for (let page = 1; page <= 3; page++) {
          const r = await fetch(`${base}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`, { headers: { Authorization: `Basic ${creds}` } });
          if (!r.ok) break;
          const data: any[] = await r.json();
          if (!data.length) break;
          for (const wp of data) {
            if (parsedCatalog.some(p => p.title.toLowerCase() === (wp.name || '').toLowerCase())) continue;
            parsedCatalog.push({ title: wp.name || '', price: `$${wp.price || wp.regular_price || '?'}`, url: wp.permalink || '', handle: wp.slug || '', type: wp.categories?.[0]?.name || '', variants: [] });
          }
        }
      } catch {}
    }

    // Filter catalog to relevant products (reduces tokens significantly)
    const relevantCatalog = filterCatalog(parsedCatalog, itemText);
    const productsContext = relevantCatalog.length > 0
      ? `Catálogo (${parsedCatalog.length} productos en total, mostrando los ${relevantCatalog.length} más relevantes):\n${
          relevantCatalog.map(p => {
            const vars = p.variants?.length ? ` | vars: ${p.variants.slice(0, 5).join(', ')}` : '';
            const type = p.type ? ` | cat: ${p.type}` : '';
            return `- ${p.title}: ${p.price}${vars}${type} → ${buildLink(p)}`;
          }).join('\n')
        }`
      : 'Sin catálogo configurado.';

    // 5. Fetch product page content if product is directly mentioned
    let productPageContext = '';
    const directMatch = relevantCatalog.find(p => {
      const words = (p.title || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
      const q = itemText.toLowerCase();
      return words.filter((w: string) => q.includes(w)).length >= 2;
    });
    if (directMatch?.url) {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 4000);
        const pr = await fetch(directMatch.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal });
        if (pr.ok) {
          const html = await pr.text();
          const clean = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, '')
            .replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 1500);
          if (clean.length > 100) productPageContext = `\nDESCRIPCIÓN COMPLETA — "${directMatch.title}":\n${clean}`;
        }
      } catch {}
    }

    // 6. Language detection
    let lang: 'english' | 'spanish' | 'portuguese';
    if (forceLang === 'en') lang = 'english';
    else if (forceLang === 'pt') lang = 'portuguese';
    else if (forceLang === 'es') lang = 'spanish';
    else {
      const isEN = /\b(the|is|are|was|were|have|has|will|can|do|does|not|this|that|with|from|they|what|how|when|where|who|your|get|buy|order|price|ship|help|good|great|like|just|very|much|want|need|can't|don't|I've|it's)\b/i.test(itemText);
      const isES = /\b(el|la|los|las|un|una|que|de|en|por|para|con|como|más|tengo|quiero|puedo|precio|envío|gracias|hola|si|no|también|pero|esto|eso|muy|bien|cuánto|dónde|cómo)\b/i.test(itemText);
      const isPT = /\b(eu|você|não|com|por|uma|dos|das|está|tem|esse|muito|também|preciso|quero|obrigado|olá|boa|tudo|seria|gostaria|qual)\b/i.test(itemText);
      lang = isPT && !isEN && !isES ? 'portuguese' : isES && !isEN ? 'spanish' : isEN ? 'english' : 'spanish';
    }
    const LANG = lang === 'english' ? 'ENGLISH' : lang === 'portuguese' ? 'PORTUGUESE' : 'SPANISH';
    const langRule = lang === 'english'
      ? 'Every single word must be English. Not "Hola", not "Gracias", nothing Spanish or Portuguese.'
      : lang === 'portuguese'
      ? 'Cada palavra deve ser em português. Nada em inglês ou espanhol.'
      : 'Cada palabra debe ser en español argentino con voseo. Cero inglés.';

    // 7. Build comment thread context
    let threadContext = '';
    if (!isDM) {
      if (allComments && allComments.length > 0) {
        const thread = allComments.map(c => {
          const replied = c.reply ? `\n    → Marca respondió: "${c.reply}"` : '\n    → SIN RESPUESTA AÚN';
          return `  @${c.username}: "${c.text}"${replied}`;
        }).join('\n');
        threadContext = `HILO COMPLETO DE COMENTARIOS EN ESTA PUBLICACIÓN:\n${thread}`;
      } else if (otherComments && otherComments.length > 0) {
        threadContext = `Otros comentarios en la publicación:\n${otherComments.map(c => `  ${c}`).join('\n')}`;
      } else {
        threadContext = 'Este es el único comentario en la publicación.';
      }
    }

    // 8. Build DM conversation context
    const dmContext = isDM && conversationHistory && conversationHistory.length > 0
      ? `HISTORIAL DE LA CONVERSACIÓN (más antiguo → más reciente):\n${conversationHistory.map(m => `  ${m}`).join('\n')}`
      : isDM ? 'Primera interacción con este cliente.' : '';

    // 9. Build brain context (compact)
    const brainParts = [
      business_description && `NEGOCIO:\n${business_description}`,
      scraped_content && `WEB:\n${scraped_content}`,
      instagram_context && `REDES:\n${instagram_context}`,
      toneInstructions && `TONO:\n${toneInstructions}`,
      offersContext && `OFERTAS ACTIVAS:\n${offersContext}`,
      faqContext && `PREGUNTAS FRECUENTES:\n${faqContext}`,
    ].filter(Boolean).join('\n\n---\n\n');

    const linksBlock = clientLinks.length > 0
      ? clientLinks.map(l => `- ${l.title}: ${formatToWww(l.url)}`).join('\n')
      : 'Sin enlaces personalizados.';

    // 10. Determine thinking budget based on complexity
    const thinkingBudget = getThinkingBudget(itemText);

    // 11. Platform context
    const platformLabel = postPlatform === 'facebook' ? 'Facebook'
      : postPlatform === 'instagram' ? 'Instagram'
      : isDM ? 'DM (mensaje directo)'
      : 'Red social';

    // 12. Build system prompt — structured and concise
    const systemPrompt = `⚠️ IDIOMA OBLIGATORIO: ${LANG}. ${langRule}. Sin excepciones.

Hoy es ${argentineTime}. Plataforma: ${platformLabel}.

════ CEREBRO DEL NEGOCIO ════
${brainParts || 'Sin información cargada.'}

════ CATÁLOGO ════
${productsContext}
${productPageContext}

════ ENLACES DEL SITIO ════
${linksBlock}

${fewShotContext ? `════ EJEMPLOS DE RESPUESTAS REALES (usá como referencia de tono) ════\n${fewShotContext}` : ''}

════ QUIÉN SOS ════
Sos la persona detrás de las redes de "${business_name}". No un bot, no atención al cliente corporativa. Un humano que trabaja en la marca, conoce todos los productos de memoria y responde de forma natural.

════ CÓMO RESPONDER ════
${isDM ? `DM — conversación privada:
- Leé TODO el historial antes de responder. No repetir nada ya dicho.
- Respondé el mensaje más reciente, no los anteriores.
- Extensión acorde a la pregunta: si fue corto, respondé corto; si es complejo, extendete.
- No saludar si ya hubo intercambio previo.
- Tono: natural, como si siguieras una conversación.` : `COMENTARIO en ${platformLabel}:
- Máximo 1-3 oraciones. Más corto = más humano.
- PROHIBIDO: "¡Gracias por tu mensaje!", "¡Con gusto te ayudo!", cualquier apertura genérica de call center.
- Si es un halago o emoji → respondé con algo igual de corto (ej: "gracias 🙌", un emoji).
- Si pregunta algo específico → respondé directo al punto.
- Chequeá el hilo completo: si ya respondiste algo similar a otro usuario, variá la respuesta.`}

LINKS — incluir SOLO si la persona está claramente intentando comprar o pide el link:
- Usar formato "www." sin https://
- Link exacto del catálogo si existe; si no, usá: ${canonicalSite}

FORMATO FINAL:
- Solo el texto listo para enviar. Sin comillas, sin "Borrador:", sin explicaciones.
- Sin placeholders como [nombre] o [precio] — si no tenés el dato, no lo menciones.
- Sin markdown, sin asteriscos. Solo texto plano + emojis si corresponde.
- Si la respuesta óptima es un emoji solo → enviá solo el emoji.`;

    const userPrompt = isDM
      ? `${dmContext}\n\nMensaje más reciente del cliente: "${itemText}"\n\nRedactá la respuesta${username ? ` para ${username}` : ''}:`
      : `${postCaption ? `Publicación: "${postCaption}"\n` : ''}${threadContext ? `\n${threadContext}\n` : ''}
Comentario a responder: @${username}: "${itemText}"
Redactá la respuesta:`;

    // 13. Call Gemini 2.5 Flash (primary)
    let draftText = '';

    if (geminiKey) {
      try {
        const body: any = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
        };
        if (thinkingBudget > 0) body.thinkingConfig = { thinkingBudget };

        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        if (r.ok) {
          const d = await r.json();
          draftText = d.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text?.trim() || '';
        } else {
          console.error('[Draft v3] Gemini error:', r.status, await r.text());
        }
      } catch (e) {
        console.error('[Draft v3] Gemini exception:', e);
      }
    }

    // 14. Fallback to OpenAI gpt-4o-mini
    if (!draftText && openAiKey) {
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.7, max_tokens: 512,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          draftText = d.choices?.[0]?.message?.content?.trim() || '';
        } else {
          const errText = await r.text();
          return res.status(502).json({ error: 'AI error', detail: errText });
        }
      } catch (e: any) {
        return res.status(502).json({ error: 'AI exception', detail: e.message });
      }
    }

    if (!draftText) return res.status(502).json({ error: 'Empty AI response' });
    return res.status(200).json({ draft: draftText });

  } catch (err: any) {
    console.error('[Draft v3] Unhandled error:', err);
    return res.status(502).json({ error: 'Server error', detail: err.message });
  }
}
