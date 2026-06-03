import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function cleanHtml(html: string): string {
  let text = html;
  text = text.replace(/<head[\s\S]*?<\/head>/gi, '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.slice(0, 15000); // Limit to 15k characters per page
}

function extractInternalLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /href=["']([^"']+)["']/gi;
  let match;
  
  let baseDomain = '';
  try {
    baseDomain = baseUrl.replace(/^https?:\/\//i, '').split('/')[0];
  } catch (e) {
    return [];
  }
  
  while ((match = regex.exec(html)) !== null) {
    let href = match[1].trim();
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      continue;
    }
    if (href.startsWith('/')) {
      href = `${baseUrl.replace(/\/$/, '')}${href}`;
    }
    const isInternal = href.includes(baseDomain) || !/^https?:\/\//i.test(href);
    if (isInternal) {
      if (!/^https?:\/\//i.test(href)) {
        href = `${baseUrl.replace(/\/$/, '')}/${href.replace(/^\//, '')}`;
      }
      href = href.split('?')[0].split('#')[0];
      if (!links.includes(href) && href !== baseUrl && href !== `${baseUrl}/` && href.startsWith('http')) {
        links.push(href);
      }
    }
  }
  return links;
}

function prioritizeLinks(links: string[]): string[] {
  const keywords = [
    /envio/i, /shipping/i, /entrega/i,
    /devoluc/i, /refund/i, /cambio/i, /retorn/i,
    /faq/i, /pregunta/i, /ayuda/i, /soporte/i, /help/i,
    /nosotros/i, /about/i, /quienes/i, /contacto/i, /contact/i,
    /product/i, /tienda/i, /shop/i, /catalog/i, /collection/i,
    /precio/i, /price/i, /tarifa/i,
    /garantia/i, /warranty/i,
    /politic/i, /terms/i, /condicion/i,
  ];
  const matches = links.filter(link => keywords.some(regex => regex.test(link)));
  return [...new Set(matches)].slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const { clientId, url, action, type, platform, shopify_domain, shopify_access_token, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token, frames, isVideo } = req.body as any;

  // ── CREATIVE ANALYSIS (TRIBE v2) ──────────────────────────────────────────
  if (type === 'analyze-creative') {
    const geminiKey = process.env.GOOGLE_AI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'Gemini key not configured' });
    if (!frames?.length) return res.status(400).json({ error: 'No frames provided' });

    const prompt = isVideo
      ? `ERES: TRIBE v2, especialista en análisis de video-creatives para redes sociales (Reels, TikTok, Facebook Ads).\n\nSE TE PASAN: ${frames.length} capturas del VIDEO completo, ~1 por segundo de inicio a fin. Analízalas EN CONJUNTO como una sola pieza.\n\nANALIZA COMO DIRECTOR CREATIVO: gancho de los primeros 3 segundos, ritmo del video, claridad del mensaje, efectividad del CTA, energía de la persona en cámara.\n\nPROHIBIDO: mencionar problemas técnicos de foto. Solo analiza el video como pieza creativa y de marketing.\nPERMITIDO SER BRUTAL: "Regrabar el video", "El gancho es inexistente", "Nadie va a ver esto más de 2 segundos".\n\nEVALÚA:\n1. Retención de Atención (0-99): ¿El gancho detiene el scroll?\n2. Impacto Emocional (0-99): ¿Despierta curiosidad, deseo, humor o impacto?\n3. Carga Cognitiva (0-99): ¿El mensaje es claro sin esfuerzo? Ideal <30.\n4. Región Principal: "V1" (visual puro), "A1" (voz/música), "FFA" (persona/rostro), "EBA" (movimiento/cuerpo), "Amígdala" (emoción/shock).\n\nRESPONDE SOLO CON ESTE JSON (sin texto extra):\n{"attentionPct":72,"attentionReason":"Por qué la atención es ese número.","emotionPct":65,"emotionReason":"Por qué el impacto emocional es ese número.","cogLoad":28,"cogLoadReason":"Por qué la carga cognitiva es ese número.","highestRegion":"FFA","textInsight":"Diagnóstico del video en 2-3 líneas.","actionItems":["Consejo 1","Consejo 2","Consejo 3","Consejo 4"]}`
      : `ERES: TRIBE v2, especialista en análisis de anuncios gráficos estáticos para redes sociales.\n\nANALIZA COMO DIRECTOR DE ARTE: jerarquía visual, contraste, legibilidad del texto, efectividad del CTA, balance imagen/copy.\n\nEVALÚA:\n1. Retención de Atención (0-99): ¿Para el scroll en 0.5 segundos?\n2. Impacto Emocional (0-99): ¿La imagen genera deseo, curiosidad o urgencia?\n3. Carga Cognitiva (0-99): ¿Se entiende en <3 segundos? Ideal <30.\n4. Región Principal: "V1" (composición), "FFA" (rostro/persona), "EBA" (producto/objeto), "Amígdala" (color/emoción), "A1" (texto dominante).\n\nRESPONDE SOLO CON ESTE JSON:\n{"attentionPct":72,"attentionReason":"Por qué.","emotionPct":65,"emotionReason":"Por qué.","cogLoad":28,"cogLoadReason":"Por qué.","highestRegion":"V1","textInsight":"Diagnóstico en 2-3 líneas.","actionItems":["Consejo 1","Consejo 2","Consejo 3","Consejo 4"]}`;

    try {
      const parts: any[] = [{ text: prompt }];
      for (const b64 of frames) {
        const base64Data = b64.includes(',') ? b64.split(',')[1] : b64;
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Data } });
      }
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' },
            thinkingConfig: { thinkingBudget: 0 },
          }),
        }
      );
      if (!geminiRes.ok) return res.status(geminiRes.status).json({ error: 'Gemini API error' });
      const geminiData = await geminiRes.json();
      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return res.status(500).json({ error: 'Empty AI response' });
      return res.status(200).json(JSON.parse(text));
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Analysis failed' });
    }
  }

  // ── PRODUCT ANALYSIS — SAVE TO DB ────────────────────────────────────────
  if (type === 'save-analysis') {
    const { data: analysisData } = req.body as any;
    if (!clientId || !analysisData) return res.status(400).json({ error: 'Missing clientId or data' });
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('car_product_analysis')
        .upsert(
          { client_id: clientId, data: analysisData, calculated_at: now, updated_at: now },
          { onConflict: 'client_id' }
        );
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ saved: true, calculated_at: now });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRODUCT ANALYSIS — LOAD FROM DB ──────────────────────────────────────
  if (type === 'load-analysis') {
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    try {
      const { data, error } = await supabase
        .from('car_product_analysis')
        .select('data, calculated_at')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(200).json({ found: false });
      return res.status(200).json({
        found: true,
        results: (data as any).data || [],
        calculated_at: (data as any).calculated_at,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PRODUCTS PROXY (merged from api/products.ts to stay under 12 function limit) ──
  if (type === 'products') {
    try {
      let products: any[] = [];
      if (platform === 'shopify') {
        const domain = (shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (!domain || !shopify_access_token) return res.status(400).json({ error: 'Shopify no configurado' });
        const r = await fetch(`https://${domain}/admin/api/2024-01/products.json?limit=250&fields=id,title,body_html,handle,status,variants,images,product_type,tags`, {
          headers: { 'X-Shopify-Access-Token': shopify_access_token, 'Accept': 'application/json' },
        });
        if (!r.ok) return res.status(r.status).json({ error: `Shopify error ${r.status}` });
        const data = await r.json();
        products = (data.products || []).filter((p: any) => p.status === 'active').map((p: any) => ({
          id: p.id, title: p.title,
          description: p.body_html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || '',
          type: p.product_type || '', tags: p.tags || '', image: p.images?.[0]?.src || null,
          url: `https://${domain}/products/${p.handle}`,
          variants: (p.variants || []).map((v: any) => ({
            id: v.id,
            title: v.title !== 'Default Title' ? v.title : '',
            price: v.price,
            compare_at_price: v.compare_at_price || null,
            sku: v.sku || '',
            inventory_item_id: v.inventory_item_id,
            inventory_quantity: v.inventory_quantity ?? 0,
            available: v.inventory_policy === 'continue' || (v.inventory_quantity ?? 1) > 0,
          })),
        }));
      } else if (platform === 'wordpress') {
        const base = (wordpress_url || '').replace(/\/$/, '');
        if (!base || !woo_consumer_key || !woo_consumer_secret) return res.status(400).json({ error: 'WooCommerce no configurado' });
        const creds = Buffer.from(`${woo_consumer_key}:${woo_consumer_secret}`).toString('base64');
        for (let page = 1; page <= 5; page++) {
          const r = await fetch(`${base}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`, { headers: { 'Authorization': `Basic ${creds}` } });
          if (!r.ok) break;
          const data: any[] = await r.json();
          if (!data.length) break;
          products = products.concat(data.map((p: any) => ({ id: p.id, title: p.name, description: p.short_description?.replace(/<[^>]+>/g, ' ').trim().slice(0, 300) || '', type: p.categories?.[0]?.name || '', tags: p.tags?.map((t: any) => t.name).join(', ') || '', image: p.images?.[0]?.src || null, url: p.permalink || '', variants: p.attributes?.length > 0 ? [{ title: p.attributes.map((a: any) => a.options?.join('/')).join(' · '), price: p.price, sku: p.sku, available: p.stock_status === 'instock' }] : [{ title: '', price: p.price, sku: p.sku, available: p.stock_status === 'instock' }] })));
        }
      } else if (platform === 'tiendanube') {
        if (!tiendanube_store_id || !tiendanube_access_token) return res.status(400).json({ error: 'Tiendanube no configurado' });
        for (let page = 1; page <= 5; page++) {
          const r = await fetch(`https://api.tiendanube.com/v1/${tiendanube_store_id}/products?per_page=200&page=${page}`, { headers: { 'Authentication': `bearer ${tiendanube_access_token}`, 'User-Agent': 'AlgorBot/1.0' } });
          if (!r.ok) break;
          const data: any[] = await r.json();
          if (!data.length) break;
          products = products.concat(data.map((p: any) => ({ id: p.id, title: p.name?.es || p.name?.en || Object.values(p.name || {})[0] || '', description: (p.description?.es || p.description?.en || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 300), type: p.categories?.[0]?.name?.es || '', tags: '', image: p.images?.[0]?.src || null, url: p.canonical_url || '', variants: (p.variants || []).map((v: any) => ({ title: v.values?.map((val: any) => val.es || val.en).join(' / ') || '', price: v.price, sku: v.sku, available: v.stock === null || v.stock > 0 })) })));
        }
      } else {
        return res.status(400).json({ error: 'Plataforma no soportada' });
      }
      return res.status(200).json({ products });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error interno' });
    }
  }

  // ── PRODUCT COSTS — SAVE ─────────────────────────────────────────────────
  if (type === 'save-costs') {
    const { costs } = req.body as any; // [{ variant_id, cost }]
    if (!clientId || !costs?.length) return res.status(400).json({ error: 'Missing clientId or costs' });
    try {
      const now = new Date().toISOString();
      const rows = costs.map((c: any) => ({ client_id: clientId, variant_id: String(c.variant_id), cost: parseFloat(c.cost) || 0, updated_at: now }));
      const { error } = await supabase.from('car_product_costs').upsert(rows, { onConflict: 'client_id,variant_id' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ saved: true });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  }

  // ── PRODUCT COSTS — LOAD ─────────────────────────────────────────────────
  if (type === 'load-costs') {
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    try {
      const { data, error } = await supabase.from('car_product_costs').select('variant_id, cost').eq('client_id', clientId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ costs: data || [] });
    } catch (err: any) { return res.status(500).json({ error: err.message }); }
  }

  // ── GENERATE FIELDS — AI extracts tone/offers/faq from scraped content ───
  if (action === 'generate-fields') {
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    try {
      const { data: cl } = await supabase
        .from('car_clients')
        .select('scraped_content, instagram_context, business_name')
        .eq('id', clientId)
        .maybeSingle();
      if (!cl) return res.status(404).json({ error: 'Client not found' });

      const webCtx: string = (cl as any).scraped_content || '';
      const socialCtx: string = (cl as any).instagram_context || '';
      const bName: string = (cl as any).business_name || 'el negocio';

      if (!webCtx) return res.status(400).json({ error: 'Primero escaneá el sitio web' });

      const fieldsPrompt = `Sos un experto en marketing digital y atención al cliente. Analizá la información del negocio "${bName}" y extraé los siguientes campos en formato JSON estricto:

1. "business_description": Descripción completa del negocio. Incluir: qué vende, productos principales con precios exactos si están disponibles, políticas de envío, devoluciones, formas de pago, datos de contacto (teléfono, email, WhatsApp, dirección). Máx 450 palabras. MUY IMPORTANTE: solo usar información que esté en el texto, no inventar.

2. "tone": Instrucciones exactas de cómo debe hablar la IA. Incluir: voseo argentino obligatorio, nivel de formalidad, si usar emojis (y cuántos), longitud máxima de respuestas, palabras o frases características de la marca. Máx 150 palabras.

3. "offers": SOLO si hay descuentos, promociones, cuotas sin interés, envío gratis u ofertas ACTIVAS mencionadas explícitamente en la información. Si no hay información clara de ofertas vigentes, devolvé exactamente "". Si hay ofertas, formato: lista con guiones, incluir vigencia si se menciona.

4. "faq": Preguntas frecuentes que haría un cliente nuevo, con respuestas basadas ÚNICAMENTE en información del texto. Formato exacto para cada par: "P: ¿pregunta?\nR: respuesta completa\n\n". Mínimo 8 pares si hay suficiente info. Solo usar datos reales del texto.

RESPONDÉ ÚNICAMENTE CON JSON VÁLIDO. Sin texto extra, sin bloques de código markdown.`;

      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: fieldsPrompt },
            { role: 'user', content: `INFORMACIÓN WEB:\n${webCtx.slice(0, 22000)}\n\nINFORMACIÓN REDES SOCIALES:\n${socialCtx.slice(0, 6000)}` }
          ],
          temperature: 0.2,
          max_tokens: 2500,
          response_format: { type: 'json_object' }
        }),
      });

      if (!aiRes.ok) throw new Error(`OpenAI error ${aiRes.status}`);
      const aiJson = await aiRes.json();
      const parsed = JSON.parse(aiJson.choices?.[0]?.message?.content || '{}');

      const desc: string = parsed.business_description || '';
      const tone: string = parsed.tone || '';
      const offersVal: string = parsed.offers || '';
      const faqVal: string = parsed.faq || '';

      const nowTs = new Date().toISOString();
      await supabase.from('car_clients').update({
        business_description: desc,
        custom_instructions: JSON.stringify({ tone, offers: offersVal, faq: faqVal }),
        brain_updated_at: nowTs
      }).eq('id', clientId);

      return res.status(200).json({
        business_description: desc,
        tone,
        offers: offersVal,
        faq: faqVal,
        brain_updated_at: nowTs
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!clientId) {
    return res.status(400).json({ error: 'Missing clientId' });
  }

  // ── SYNC CATALOG (Meta first, Shopify fallback) ──────────────────────
  if (action === 'sync-catalog') {
    const { data: cl } = await supabase
      .from('car_clients')
      .select('meta_account_id, shopify_domain, shopify_access_token, website_url')
      .eq('id', clientId)
      .maybeSingle();
    if (!cl) return res.status(404).json({ error: 'Client not found' });

    const { data: tokenRow } = await supabase.from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
    const metaToken: string = tokenRow?.value || '';
    const META_BASE = 'https://graph.facebook.com/v21.0';

    let catalog: any[] = [];
    let source = '';

    if (cl.meta_account_id && metaToken) {
      try {
        const accountId = cl.meta_account_id.startsWith('act_') ? cl.meta_account_id : `act_${cl.meta_account_id}`;
        const cRes = await fetch(`${META_BASE}/${accountId}/product_catalogs?fields=id,name,product_count&access_token=${metaToken}`);
        const cData: any = await cRes.json();
        const catalogs: any[] = cData.data || [];
        if (catalogs.length > 0) {
          const best = catalogs.sort((a: any, b: any) => (b.product_count || 0) - (a.product_count || 0))[0];
          let allProducts: any[] = [];
          let nextUrl: string | null = `${META_BASE}/${best.id}/products?fields=id,name,price,currency,url,product_type,availability,image_url,retailer_id&limit=200&access_token=${metaToken}`;
          while (nextUrl) {
            const pRes: Response = await fetch(nextUrl);
            const pData: any = await pRes.json();
            allProducts = allProducts.concat(pData.data || []);
            nextUrl = pData.paging?.next || null;
          }
          const available = allProducts.filter((p: any) => !p.availability || p.availability === 'in stock' || p.availability === 'available');
          catalog = available.map((p: any) => {
            const priceRaw = p.price || '';
            const priceNum = priceRaw.replace(/[^0-9.]/g, '');
            const currency = priceRaw.replace(/[0-9. ]/g, '').trim();
            const priceStr = priceNum ? `${currency || '$'}${parseFloat(priceNum).toFixed(2)}` : 'Consultar';
            return { id: p.id || p.retailer_id || '', title: p.name || '', handle: '', type: p.product_type || '', tags: '', price: priceStr, variants: [], source: 'meta', url: p.url || '' };
          });
          source = `Meta Catalog: ${best.name} (${catalog.length} productos)`;
        }
      } catch (e) { console.error('[sync-catalog] Meta failed:', e); }
    }

    if (catalog.length === 0 && cl.shopify_domain && cl.shopify_access_token) {
      try {
        const domain = cl.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        let allP: any[] = [];
        let pageUrl: string | null = `https://${domain}/admin/api/2024-01/products.json?limit=250&fields=id,title,handle,status,variants,product_type,tags`;
        while (pageUrl) {
          const sRes: Response = await fetch(pageUrl, { headers: { 'X-Shopify-Access-Token': cl.shopify_access_token, 'Accept': 'application/json' } });
          if (!sRes.ok) break;
          const sData: any = await sRes.json();
          allP = allP.concat(sData.products || []);
          const lh: string = sRes.headers.get('link') || '';
          const nm: RegExpMatchArray | null = lh.match(/<([^>]+)>;\s*rel="next"/);
          pageUrl = nm ? nm[1] : null;
        }
        catalog = allP.filter((p: any) => p.status === 'active').map((p: any) => {
          const vs = p.variants || [];
          const prices = [...new Set(vs.map((v: any) => v.price).filter(Boolean))];
          const priceStr = prices.length === 1 ? `$${prices[0]}` : prices.length > 1 ? `$${Math.min(...prices.map(Number))}-$${Math.max(...prices.map(Number))}` : 'Consultar';
          return { id: p.id, title: p.title, handle: p.handle, type: p.product_type || '', tags: p.tags || '', price: priceStr, variants: vs.map((v: any) => v.title).filter((t: string) => t && t !== 'Default Title'), source: 'shopify', url: '' };
        });
        source = `Shopify (${catalog.length} productos activos)`;
      } catch (e) { console.error('[sync-catalog] Shopify failed:', e); }
    }

    if (catalog.length === 0) return res.status(400).json({ error: 'No se encontró catálogo. Configurá Meta Ads o Shopify.' });

    const syncedAt = new Date().toISOString();
    const { error: ue } = await supabase.from('car_clients').update({ products_catalog: JSON.stringify(catalog), catalog_synced_at: syncedAt }).eq('id', clientId);
    if (ue) return res.status(502).json({ error: ue.message });
    return res.status(200).json({ success: true, source, count: catalog.length, synced_at: syncedAt, catalog });
  }

  if ((!action || action === 'scrape-all' || action === 'scrape-website') && !url) {
    return res.status(400).json({ error: 'Missing url' });
  }

  try {
    // 1. Retrieve the client profile details (IG Business ID, FB Page ID, Business Name)
    const { data: client, error: clientErr } = await supabase
      .from('car_clients')
      .select('ig_business_id, fb_page_id, business_name')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr || !client) {
      return res.status(404).json({ error: 'No se encontró el cliente en la base de datos.' });
    }

    const { business_name, ig_business_id: igId, fb_page_id: fbPageId } = client;

    // ─────────────────────────────────────────────────────────────────────────
    // BRANCH: sync-instagram (Social Media Only)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'sync-instagram') {
      let metaToken = '';
      if (igId || fbPageId) {
        try {
          const { data: tokenData } = await supabase
            .from('AgencySettings')
            .select('value')
            .eq('key', 'meta_ads_token')
            .maybeSingle();
          metaToken = tokenData?.value || '';
        } catch (tokenErr) {
          console.error('[Unified Scraper] Error fetching Meta token:', tokenErr);
        }
      }

      let instagramRawContent = '';
      if (igId && metaToken) {
        console.log(`[Unified Scraper] Fetching Instagram posts for ID: ${igId}`);
        try {
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${igId}/media?fields=id,caption,media_type,timestamp,permalink&limit=15&access_token=${metaToken}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (igRes.ok) {
            const igData = await igRes.json();
            const mediaItems = igData.data || [];
            instagramRawContent = mediaItems
              .map((item: any, i: number) => {
                if (!item.caption) return '';
                return `[Post IG ${i + 1} - ${new Date(item.timestamp).toLocaleDateString()}] "${item.caption.replace(/\s+/g, ' ').trim()}"`;
              })
              .filter(Boolean)
              .join('\n\n');
          }
        } catch (igErr) {
          console.error('[Unified Scraper] IG fetch failed:', igErr);
        }
      }

      let facebookRawContent = '';
      if (fbPageId && metaToken) {
        console.log(`[Unified Scraper] Fetching Facebook posts for ID: ${fbPageId}`);
        try {
          const fbRes = await fetch(
            `https://graph.facebook.com/v21.0/${fbPageId}/feed?fields=id,message,created_time&limit=15&access_token=${metaToken}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            const feedItems = fbData.data || [];
            facebookRawContent = feedItems
              .map((item: any, i: number) => {
                if (!item.message) return '';
                return `[Post FB ${i + 1} - ${new Date(item.created_time).toLocaleDateString()}] "${item.message.replace(/\s+/g, ' ').trim()}"`;
              })
              .filter(Boolean)
              .join('\n\n');
          }
        } catch (fbErr) {
          console.error('[Unified Scraper] FB fetch failed:', fbErr);
        }
      }

      let socialSummary = '';
      const compiledSocial = [
        instagramRawContent ? `--- PUBLICACIONES DE INSTAGRAM ---\n${instagramRawContent}` : '',
        facebookRawContent ? `--- PUBLICACIONES DE FACEBOOK ---\n${facebookRawContent}` : ''
      ].filter(Boolean).join('\n\n');

      if (compiledSocial) {
        try {
          const openaiSocialRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `Analiza las descripciones de posts de Instagram y Facebook de la marca "${business_name}".
Crea un resumen en español súper práctico centrado en:
1. PRODUCTOS DESTACADOS / LANZAMIENTOS (Mencionados en redes)
2. PRECIOS Y PROMOCIONES ACTIVAS (Descuentos, sorteos, envíos gratis)
3. ESTILO DE COMUNICACIÓN Y HASHTAGS (Tono informal, alegre, modismos)`
                },
                { role: 'user', content: compiledSocial.slice(0, 30000) }
              ],
              temperature: 0.3,
              max_tokens: 1000,
            }),
          });

          if (openaiSocialRes.ok) {
            const socialResJson = await openaiSocialRes.json();
            socialSummary = socialResJson.choices?.[0]?.message?.content?.trim() || '';
          }
        } catch (socialSumErr) {
          console.error('[Unified Scraper] Social summary failed:', socialSumErr);
        }
      }

      const finalSocialSummary = socialSummary || (igId || fbPageId ? 'No se pudo sincronizar información reciente de redes sociales en este intento.' : 'Redes sociales no vinculadas.');

      const nowTimestamp = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('car_clients')
        .update({
          instagram_context: finalSocialSummary,
          brain_updated_at: nowTimestamp
        })
        .eq('id', clientId);

      if (updateError) {
        return res.status(500).json({ error: 'Error al guardar la información de redes en la base de datos.', detail: updateError.message });
      }

      return res.status(200).json({ instagram_context: finalSocialSummary, brain_updated_at: nowTimestamp });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BRANCH: scrape-website (Website Crawl Only)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'scrape-website') {
      let targetUrl = url!.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      }

      console.log(`[Unified Scraper] Scraping website: ${targetUrl}`);
      let websiteSummary = '';
      let pagesVisited: string[] = [];
      try {
        const fetchResponse = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (fetchResponse.ok) {
          const htmlContent = await fetchResponse.text();
          const homepageText = cleanHtml(htmlContent);

          const discoveredLinks = extractInternalLinks(htmlContent, targetUrl);
          const targetSubpages = prioritizeLinks(discoveredLinks);
          pagesVisited = targetSubpages;

          const subpagesContent = await Promise.all(
            targetSubpages.map(async (link) => {
              try {
                const subRes = await fetch(link, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  },
                  signal: AbortSignal.timeout(5000),
                });
                if (subRes.ok) {
                  const html = await subRes.text();
                  const text = cleanHtml(html);
                  const pathName = new URL(link).pathname;
                  return `--- PÁGINA: ${pathName} ---\n${text}`;
                }
              } catch (e) {
                console.error(`[Unified Scraper] Error scraping subpage ${link}:`, e);
              }
              return '';
            })
          );

          let combinedText = `--- PÁGINA DE INICIO (HOME) ---\n${homepageText}\n\n` +
            subpagesContent.filter(Boolean).join('\n\n');
          combinedText = combinedText.slice(0, 45000);

          const openaiWebRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `Sos un experto en análisis de negocios. Analizá el texto extraído del sitio web del negocio "${business_name}" y generá una base de conocimiento exhaustiva en español.

Extraé y organizá TODA la información disponible en estas secciones:

1. INFORMACIÓN GENERAL
   - Qué es el negocio, qué vende, diferencial de la marca
   - Nombres del equipo (dueños, vendedores, atención al cliente)
   - Canales de contacto: teléfono, email, WhatsApp, dirección

2. CATÁLOGO COMPLETO DE PRODUCTOS / SERVICIOS
   - Nombre de cada producto con descripción breve
   - Precios exactos si están mencionados (con moneda)
   - Variantes disponibles (talles, colores, medidas)
   - Materiales, calidad, origen

3. ENVÍOS Y ENTREGAS
   - Tiempos de entrega por zona
   - Costos de envío y umbral de envío gratis
   - Transportistas y horarios de despacho

4. CAMBIOS, DEVOLUCIONES Y GARANTÍAS
   - Plazos y condiciones
   - Cómo iniciar un reclamo

5. FORMAS DE PAGO Y FINANCIACIÓN
   - Métodos aceptados, cuotas, descuentos por forma de pago

6. PREGUNTAS FRECUENTES
   - Preguntas más comunes con sus respuestas exactas

Sé exhaustivo. Si hay precios, incluilos. Si hay horarios, incluilos. No inventés información.`
                },
                { role: 'user', content: combinedText }
              ],
              temperature: 0.2,
              max_tokens: 2500,
            }),
          });

          if (openaiWebRes.ok) {
            const webResJson = await openaiWebRes.json();
            websiteSummary = webResJson.choices?.[0]?.message?.content?.trim() || '';
          }
        }
      } catch (e: any) {
        console.error('[Unified Scraper] Web scrape failed:', e);
      }

      const finalWebSummary = websiteSummary || 'No se pudo extraer información detallada del sitio web en este intento.';

      const nowTimestamp = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('car_clients')
        .update({
          scraped_content: finalWebSummary,
          website_url: targetUrl,
          brain_updated_at: nowTimestamp
        })
        .eq('id', clientId);

      if (updateError) {
        return res.status(500).json({ error: 'Error al guardar la información web en la base de datos.', detail: updateError.message });
      }

      return res.status(200).json({ scraped_content: finalWebSummary, website_url: targetUrl, brain_updated_at: nowTimestamp, pages_visited: pagesVisited });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BRANCH: DEFAULT / scrape-all (Website + Social Media + Instructions)
    // ─────────────────────────────────────────────────────────────────────────
    let targetUrl = url!.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    console.log(`[Unified Scraper] Scraping website: ${targetUrl}`);
    let websiteSummary = '';
    try {
      const fetchResponse = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (fetchResponse.ok) {
        const htmlContent = await fetchResponse.text();
        const homepageText = cleanHtml(htmlContent);

        const discoveredLinks = extractInternalLinks(htmlContent, targetUrl);
        const targetSubpages = prioritizeLinks(discoveredLinks);

        const subpagesContent = await Promise.all(
          targetSubpages.map(async (link) => {
            try {
              const subRes = await fetch(link, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(5000),
              });
              if (subRes.ok) {
                const html = await subRes.text();
                const text = cleanHtml(html);
                const pathName = new URL(link).pathname;
                return `--- PÁGINA: ${pathName} ---\n${text}`;
              }
            } catch (e) {
              console.error(`[Unified Scraper] Error scraping subpage ${link}:`, e);
            }
            return '';
          })
        );

        let combinedText = `--- PÁGINA DE INICIO (HOME) ---\n${homepageText}\n\n` + 
          subpagesContent.filter(Boolean).join('\n\n');
        combinedText = combinedText.slice(0, 45000);

        const openaiWebRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `Sos un experto en análisis de negocios. Analiza el texto extraído del sitio web del negocio "${business_name}" y genera una base de conocimiento exhaustiva y estructurada en español.

Extraé y organiza TODA la información disponible en estas secciones:

1. DESCRIPCIÓN DEL NEGOCIO
   - Qué es, qué vende, desde cuándo, dónde opera, diferencial de la marca
   - Nombres de las personas del equipo (dueños, vendedores, atención al cliente)
   - Canales de contacto: teléfono, email, WhatsApp, dirección física si hay

2. CATÁLOGO COMPLETO DE PRODUCTOS / SERVICIOS
   - Nombre de cada producto/servicio con descripción breve
   - Precios exactos si están mencionados (incluyendo moneda)
   - Variantes disponibles (talles, colores, medidas, etc.)
   - Materiales, calidad, origen

3. ENVÍOS Y ENTREGAS
   - Tiempos de entrega por zona (capital, interior, internacional)
   - Costos de envío
   - A partir de qué monto hay envío gratis
   - Couriers o transportistas que usan
   - Horarios de despacho

4. CAMBIOS, DEVOLUCIONES Y GARANTÍAS
   - Plazo para hacer cambios/devoluciones
   - Condiciones y excepciones
   - Cómo iniciar un reclamo
   - Garantía de productos

5. FORMAS DE PAGO Y FINANCIACIÓN
   - Métodos de pago aceptados (tarjetas, transferencia, efectivo, etc.)
   - Cuotas sin interés disponibles
   - Descuentos por forma de pago

6. PREGUNTAS FRECUENTES Y DATOS CLAVE
   - Preguntas más comunes que tendría un cliente nuevo
   - Respuestas exactas que da el negocio
   - Información de atención al cliente (horarios, respuesta típica)

Sé exhaustivo. Si el sitio tiene precios, incluilos. Si tiene horarios, incluilos. Si hay nombres de personas, incluilos. No inventes información que no esté en el texto.`
              },
              { role: 'user', content: combinedText }
            ],
            temperature: 0.2,
            max_tokens: 2500,
          }),
        });

        if (openaiWebRes.ok) {
          const webResJson = await openaiWebRes.json();
          websiteSummary = webResJson.choices?.[0]?.message?.content?.trim() || '';
        }
      }
    } catch (e: any) {
      console.error('[Unified Scraper] Web scrape failed:', e);
    }

    let metaToken = '';
    if (igId || fbPageId) {
      try {
        const { data: tokenData } = await supabase
          .from('AgencySettings')
          .select('value')
          .eq('key', 'meta_ads_token')
          .maybeSingle();
        metaToken = tokenData?.value || '';
      } catch (tokenErr) {
        console.error('[Unified Scraper] Error fetching Meta token:', tokenErr);
      }
    }

    let instagramRawContent = '';
    if (igId && metaToken) {
      console.log(`[Unified Scraper] Fetching Instagram posts for ID: ${igId}`);
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v21.0/${igId}/media?fields=id,caption,media_type,timestamp,permalink&limit=15&access_token=${metaToken}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (igRes.ok) {
          const igData = await igRes.json();
          const mediaItems = igData.data || [];
          instagramRawContent = mediaItems
            .map((item: any, i: number) => {
              if (!item.caption) return '';
              return `[Post IG ${i + 1} - ${new Date(item.timestamp).toLocaleDateString()}] "${item.caption.replace(/\s+/g, ' ').trim()}"`;
            })
            .filter(Boolean)
            .join('\n\n');
        }
      } catch (igErr) {
        console.error('[Unified Scraper] IG fetch failed:', igErr);
      }
    }

    let facebookRawContent = '';
    if (fbPageId && metaToken) {
      console.log(`[Unified Scraper] Fetching Facebook posts for ID: ${fbPageId}`);
      try {
        const fbRes = await fetch(
          `https://graph.facebook.com/v21.0/${fbPageId}/feed?fields=id,message,created_time&limit=15&access_token=${metaToken}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          const feedItems = fbData.data || [];
          facebookRawContent = feedItems
            .map((item: any, i: number) => {
              if (!item.message) return '';
              return `[Post FB ${i + 1} - ${new Date(item.created_time).toLocaleDateString()}] "${item.message.replace(/\s+/g, ' ').trim()}"`;
            })
            .filter(Boolean)
            .join('\n\n');
        }
      } catch (fbErr) {
        console.error('[Unified Scraper] FB fetch failed:', fbErr);
      }
    }

    let socialSummary = '';
    const compiledSocial = [
      instagramRawContent ? `--- PUBLICACIONES DE INSTAGRAM ---\n${instagramRawContent}` : '',
      facebookRawContent ? `--- PUBLICACIONES DE FACEBOOK ---\n${facebookRawContent}` : ''
    ].filter(Boolean).join('\n\n');

    if (compiledSocial) {
      try {
        const openaiSocialRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `Analiza las descripciones de posts de Instagram y Facebook de la marca "${business_name}".
Crea un resumen en español súper práctico centrado en:
1. PRODUCTOS DESTACADOS / LANZAMIENTOS (Mencionados en redes)
2. PRECIOS Y PROMOCIONES ACTIVAS (Descuentos, sorteos, envíos gratis)
3. ESTILO DE COMUNICACIÓN Y HASHTAGS (Tono informal, alegre, modismos)`
              },
              { role: 'user', content: compiledSocial.slice(0, 30000) }
            ],
            temperature: 0.3,
            max_tokens: 1000,
          }),
        });

        if (openaiSocialRes.ok) {
          const socialResJson = await openaiSocialRes.json();
          socialSummary = socialResJson.choices?.[0]?.message?.content?.trim() || '';
        }
      } catch (socialSumErr) {
        console.error('[Unified Scraper] Social summary failed:', socialSumErr);
      }
    }

    const finalWebSummary = websiteSummary || 'No se pudo extraer información detallada del sitio web en este intento.';
    const finalSocialSummary = socialSummary || (igId || fbPageId ? 'No se pudo sincronizar información reciente de redes sociales en este intento.' : 'Redes sociales no vinculadas.');

    let autoCatalog = '';
    let autoInstructions = '';
    try {
      const systemPrompt = `You are a professional business strategist and AI prompt engineer.
Your task is to take the extracted knowledge of website and social media of "${business_name}" and generate optimal content for two settings fields:

1. "business_description" (Manual Context & Catalog):
   Summarize key support rules, catalog details, return processes, shipping options, and FAQ answers into a highly concise and actionable summary. Limit to 350 words.

2. "custom_instructions" (Tone & Style Rules):
   CRITICAL REQUIREMENT: Write optimal tone guidelines explicitly mandating friendly, informal, warm and cheerful support using Argentine Spanish voseo ("vos", "tenés", "mirá", "comprá", "escribinos", "dejame", etc.). Include guidelines for using moderate emojis, keeping responses short/concise (max 1-2 paragraphs), and being highly helpful. Avoid sounding robotic. Limit to 120 words.

CRITICAL: Return your output ONLY as a raw JSON object with the keys "business_description" and "custom_instructions". Do not include Markdown blocks, quotes, or conversational explanations.
Example output:
{
  "business_description": "...",
  "custom_instructions": "..."
}`;

      const openaiFieldsRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { 
              role: 'user', 
              content: `INFORMACIÓN SITIO WEB:\n${finalWebSummary}\n\nINFORMACIÓN REDES SOCIALES:\n${finalSocialSummary}` 
            }
          ],
          temperature: 0.4,
          max_tokens: 1200,
          response_format: { type: 'json_object' }
        }),
      });

      if (openaiFieldsRes.ok) {
        const fieldsJson = await openaiFieldsRes.json();
        const parsed = JSON.parse(fieldsJson.choices?.[0]?.message?.content || '{}');
        autoCatalog = parsed.business_description || '';
        autoInstructions = parsed.custom_instructions || '';
      }
    } catch (fieldsErr) {
      console.error('[Unified Scraper] AI fields generation failed:', fieldsErr);
    }

    const finalCatalog = autoCatalog || `Catálogo y soporte para ${business_name} basado en el sitio web oficial.`;
    const finalInstructions = autoInstructions || `Responde siempre con el tono e información oficial de ${business_name}. Usa el voseo argentino de manera cordial y amigable ("vos", "tenés", "comprá", "mirá"). Mantén las respuestas claras y breves.`;

    const nowTimestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('car_clients')
      .update({
        scraped_content: finalWebSummary,
        instagram_context: finalSocialSummary,
        business_description: finalCatalog,
        custom_instructions: finalInstructions,
        website_url: targetUrl,
        brain_updated_at: nowTimestamp
      })
      .eq('id', clientId);

    if (updateError) {
      return res.status(500).json({ 
        error: 'Error al actualizar el cerebro en la base de datos.', 
        detail: updateError.message 
      });
    }

    return res.status(200).json({
      scraped_content: finalWebSummary,
      instagram_context: finalSocialSummary,
      business_description: finalCatalog,
      custom_instructions: finalInstructions,
      website_url: targetUrl,
      brain_updated_at: nowTimestamp
    });

  } catch (err: any) {
    console.error('[Unified Scraper] Error:', err);
    return res.status(500).json({ error: `Error interno de servidor: ${err.message}` });
  }
}
