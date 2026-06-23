// draft-reply v4 — stable build, gemini-2.5-flash, smart context
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const getFirstEnv = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
};

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  process.env.GOOGLE_AI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite'
].filter(Boolean) as string[];

const isProbablyTruncated = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // If it ends with punctuation or common closing characters
  if (/[.!?…)"'”’\]\-\*]$/.test(trimmed)) return false;

  // If it ends with a hashtag (e.g. #skincare)
  if (/#\w+$/.test(trimmed)) return false;

  // If it ends with an emoji
  try {
    if (/\p{Emoji}/u.test(trimmed.slice(-2)) && !/[\d#\*]/.test(trimmed.slice(-1))) return false;
  } catch (e) {
    if (/[🙌🙏👍👌💪🔥❤️💜💙💚🖤🤍✨🎉🌟🥳👏😍💖😎📸💄🛍️💅💆‍♀️✨💥🌿🎯👇]$/.test(trimmed)) return false;
  }

  // Otherwise, it is probably truncated
  return true;
};

const normalizeDraftText = (text: string) =>
  text
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const argentineTime = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Authenticate user from Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.trim().toLowerCase().startsWith('bearer')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const parts = authHeader.split(' ');
  const token = parts.length > 1 ? parts[1] : '';
  if (!token) {
    return res.status(401).json({ error: 'Empty token in Authorization header' });
  }

  let user: any = null;
  let dbProfile: any = null;
  try {
    const authSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await authSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
      const tokenPreview = token ? `${token.substring(0, 10)}...${token.substring(Math.max(0, token.length - 10))}` : 'empty';
      const errMsg = `Invalid auth token: ${authError?.message || 'No user data'} (len: ${token ? token.length : 0}, preview: ${tokenPreview})`;
      console.error('getUser failed:', authError, 'token:', tokenPreview);
      return res.status(401).json({ error: errMsg });
    }
    user = authData.user;

    // Fetch client profile (direct owner or mapped business account)
    const { data: ownerProfile } = await supabase
      .from('car_clients')
      .select('id, is_admin')
      .eq('user_id', user.id)
      .maybeSingle();

    if (ownerProfile) {
      dbProfile = ownerProfile;
    } else {
      const { data: link } = await supabase
        .from('car_business_accounts')
        .select('business_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (link?.business_id) {
        const { data: biz } = await supabase
          .from('car_clients')
          .select('id, is_admin')
          .eq('id', link.business_id)
          .maybeSingle();
        if (biz) {
          dbProfile = biz;
        }
      }
    }
  } catch (err: any) {
    console.error('Server auth error in api/draft-reply:', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }

  if (!dbProfile) {
    return res.status(403).json({ error: 'Access denied: Profile not found' });
  }

  const isAdmin = !!dbProfile.is_admin;
  const userClientId = dbProfile.id;

  const {
    clientId, itemText, username,
    postCaption, postPlatform,
    allComments, otherComments,
    conversationHistory, isDM, forceLang,
  } = req.body || {};

  const geminiKey = getFirstEnv('GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GEMINI_API_KEY');
  const openAiKey = getFirstEnv('OPENAI_API_KEY', 'OPENAI_KEY');
  if (!geminiKey && !openAiKey) {
    return res.status(503).json({
      error: 'AI_NOT_CONFIGURED',
      detail: 'No hay GOOGLE_AI_API_KEY/GEMINI_API_KEY ni OPENAI_API_KEY configurada en el servidor.'
    });
  }

  if (!clientId || !itemText) {
    return res.status(400).json({ error: 'Missing clientId or itemText' });
  }

  if (!isAdmin && clientId !== userClientId) {
    return res.status(403).json({ error: 'Access denied: client mismatch' });
  }

  try {
    // 1. Fetch client from Supabase
    const { data: client, error: dbError } = await supabase
      .from('car_clients')
      .select('business_name, ecommerce_platform, shopify_domain, shopify_access_token, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token, business_description, custom_instructions, scraped_content, instagram_context, website_url, meta_account_id, klaviyo_api_key, products_catalog')
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
      wordpress_url, woo_consumer_key, woo_consumer_secret,
      tiendanube_store_id, tiendanube_access_token,
      business_description, custom_instructions, scraped_content, instagram_context,
      website_url, products_catalog
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
    };    let parsedCatalog: any[] = [];
    if (products_catalog) {
      try {
        if (typeof products_catalog === 'string') {
          parsedCatalog = JSON.parse(products_catalog);
        } else if (Array.isArray(products_catalog)) {
          parsedCatalog = products_catalog;
        }
      } catch (e) {
        console.error('Error parsing products_catalog from DB:', e);
      }
    }

    // Fallback to live API fetches only if the database cached catalog is empty
    if (parsedCatalog.length === 0) {
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
            `https://${cleanDomain}/admin/api/2026-01/products.json?limit=250&fields=title,handle,variants,status,product_type`,
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

      // WooCommerce catalog
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

      // Tiendanube catalog
      if (tiendanube_store_id && tiendanube_access_token) {
        try {
          for (let page = 1; page <= 2; page++) {
            const r = await fetch(`https://api.tiendanube.com/v1/${tiendanube_store_id}/products?per_page=200&page=${page}`, {
              headers: { 'Authentication': `bearer ${tiendanube_access_token}`, 'User-Agent': 'AlgorBot/1.0' }
            });
            if (!r.ok) break;
            const data = await r.json() as any[];
            if (!data.length) break;
            for (const p of data) {
              if (parsedCatalog.some((pc: any) => pc.title.toLowerCase() === (p.name?.es || p.name?.en || '').toLowerCase())) continue;
              parsedCatalog.push({
                title: p.name?.es || p.name?.en || Object.values(p.name || {})[0] || '',
                price: `$${p.variants?.[0]?.price || '?'}`,
                url: p.canonical_url || '', handle: p.handle || '',
                type: p.categories?.[0]?.name?.es || '',
                variants: (p.variants || []).map((v: any) => v.values?.map((val: any) => val.es || val.en).join(' / ') || ''),
              });
            }
          }
        } catch (_) {}
      }
    }

    // Simple Levenshtein distance for fuzzy word matching
    const getEditDistance = (a: string, b: string): number => {
      if (a.length === 0) return b.length;
      if (b.length === 0) return a.length;
      const matrix = [];
      for (let i = 0; i <= b.length; i++) matrix[i] = [i];
      for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
            );
          }
        }
      }
      return matrix[b.length][a.length];
    };

    // Normalize Spanish terms (accents, common typo letters, seseo, double letters)
    const normalizeText = (str: string): string => {
      return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ss/g, 's')
        .replace(/z/g, 's')
        .replace(/c/g, 's') // For seseo
        .replace(/ll/g, 'l')
        .replace(/y/g, 'i')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
    };

    const queryNorm = normalizeText(itemText);
    const queryWords = queryNorm.split(/\s+/).filter(w => w.length >= 3);

    // Words that are generic in fabric shop catalog
    const genericWords = new Set(['tela', 'telas', 'bolsa', 'bolsas', 'panos', 'pano', 'combo', 'combos', 'retazo', 'retazos']);

    const getPrimaryKeyword = (title: string): string => {
      const words = normalizeText(title).split(/\s+/).filter(w => w.length >= 3);
      for (const w of words) {
        if (!genericWords.has(w)) return w;
      }
      return words[0] || '';
    };

    // Filter catalog to relevant products (max 40) using strict fabric keyword matching
    const matched = parsedCatalog.filter((p: any) => {
      const primaryKey = getPrimaryKeyword(p.title);
      if (!primaryKey) return false;
      
      return queryWords.some(qw => {
        if (qw === primaryKey) return true;
        if (qw.includes(primaryKey) || primaryKey.includes(qw)) return true;
        const dist = getEditDistance(qw, primaryKey);
        const maxAllowed = Math.min(1, Math.floor(Math.max(qw.length, primaryKey.length) / 4)); // strict edit distance for primary keyword (max 1 char diff)
        return dist <= maxAllowed;
      });
    });
    const others = parsedCatalog.filter((p: any) => !matched.includes(p)).slice(0, 40 - matched.length);
    const relevantCatalog = matched.concat(others);

    // Detect if message is asking about a specific product/price
    const askingPrice = /precio|price|cost|cuánto|cuanto|vale|valor|cuesta|how much|\$|pesos|dolar/i.test(itemText);
    const askingProduct = /tenés|tienen|hay\s+(stock|tela|disponible)|busco\s+\w|necesito\s+(comprar|tela|saber)|quiero\s+(comprar|saber\s+el\s+precio|ver\s+el\s+precio)|want\s+to\s+buy|do\s+you\s+have/i.test(itemText);
    const productMentioned = matched.length > 0;

    // Generic greeting/intro — don't trigger catalog enforcement
    const isGenericGreeting = /^[¡!]?\s*(hola|hi|hello|buenas|buen\s*(día|dia|tarde|noche)|hey|buenos)\b/i.test(itemText.trim())
      || (!askingPrice && itemText.trim().split(/\s+/).length <= 10 && !/tenés|tienen|cuánto|precio|stock|disponible|específic/i.test(itemText));

    // Build catalog context with validation hints
    let productsContext = '';
    if (parsedCatalog.length === 0) {
      productsContext = 'Sin catálogo configurado.';
    } else if ((askingPrice || askingProduct) && !productMentioned && !isGenericGreeting) {
      // Specific product query but NOT found in catalog
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

    // Pre-check: build explicit "verified facts" block for price/product queries
    let verifiedFacts = '';
    if ((askingPrice || askingProduct) && !isGenericGreeting) {
      if (matched.length > 0) {
        verifiedFacts = `\n⚠️ EL PRODUCTO SÍ EXISTE EN EL CATÁLOGO: El producto por el que consulta el cliente está en el catálogo.\n` +
          `DATOS DEL CATÁLOGO:\n${
            matched.map((p: any) => {
              const vars = p.variants?.length ? ` | variantes: ${p.variants.slice(0,4).join(', ')}` : '';
              return `  • ${p.title}: PRECIO=${p.price}${vars} → ${buildLink(p)}`;
            }).join('\n')
          }\n` +
          `⛔ REGLAS DE RESPUESTA PARA PRODUCTO EXISTENTE:\n` +
          `1. Respondé DIRECTAMENTE al cliente con el precio y la información del producto del catálogo y los detalles del CEREBRO DEL NEGOCIO (por ejemplo, si preguntan el ancho, material, etc., buscalos en la sección CEREBRO DEL NEGOCIO).\n` +
          `2. NO digas "Te respondemos por privado 📩" ni "Ahora mismo verifico y te confirmo en seguida 🙌" porque el producto ya está en el catálogo y debés darle la información disponible.\n` +
          `3. Si te preguntan por características adicionales (ancho, peso, colores) que no están en el catálogo, pero están en el CEREBRO DEL NEGOCIO (descripción, web scrape, etc.), usá esa información del Cerebro para responder.\n` +
          `4. Usá únicamente el precio especificado en el catálogo (no inventes ni supongas otros precios).`;
      } else {
        verifiedFacts = `\n⚠️ BÚSQUEDA EN CATÁLOGO: El producto consultado NO existe en el catálogo disponible.\n` +
          `- Para comentarios: Respondé de forma natural explicando amablemente que esa opción no la tenemos en catálogo actualmente. Sugeriles que revisen todas las opciones en nuestra web (${canonicalSite}) o invitalos a enviarnos un mensaje privado (DM) para asesorarlos y ver si les podemos conseguir stock.\n` +
          `- Para DMs: Explicá con calidez que vas a validar con el equipo de stock la disponibilidad de ese artículo y que les confirmás en seguida por este chat privado.`;
      }
    }

    // 10. System prompt
    const systemPrompt = `⚠️ IDIOMA OBLIGATORIO DE LA RESPUESTA FINAL: ${LANG}. ${langRule}. Sin excepciones.
Si el usuario eligió idioma manualmente, ignorá el idioma del comentario original y respondé únicamente en ${LANG}.
No mezcles idiomas. No traduzcas el comentario; respondé naturalmente en ${LANG}.

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

════ REGLA ABSOLUTA — PRODUCTOS, PRECIOS, MEDIDAS, DISPONIBILIDAD ════
${verifiedFacts || ''}

⛔ PROHIBICIÓN ABSOLUTA DE INVENTAR PRECIOS:
- Tenés terminantemente PROHIBIDO inventar, suponer, especular o mencionar cualquier precio que no esté explícitamente listado en los DATOS VERIFICADOS o en el catálogo de arriba.
- Si el precio no figura para la tela consultada, o si la tela consultada no está en el catálogo, no digas ningún precio bajo ninguna circunstancia.

⛔ REGLAS GENERALES DE RESPUESTA:
- Si la tela o producto consultado NO está en el catálogo o en los DATOS VERIFICADOS (como por ejemplo, si consultan por "lanilla" o "percal" y no figura en tu catálogo), tenés terminantemente PROHIBIDO inventar un precio o stock. En su lugar, respondé de forma natural, variada y atenta. Podés invitarlos a revisar todas las opciones vigentes en nuestra web (${canonicalSite}) o derivarlos para hablar por privado (por ejemplo: "Escribinos al privado y te confirmamos", "Si querés consultanos por privado y nos fijamos", "Te mandamos un mensajito privado para pasarte detalles", etc.). Nunca uses siempre el mismo texto genérico; variá la respuesta para que suene humana y conversacional.
- Si el cliente pregunta por una tela específica que NO está en el catálogo (por ejemplo, pregunta por "percal" y en los datos solo tenés "microfibra" o "tussor", que son telas totalmente distintas), NO asumas que son lo mismo. Debés indicar que no lo tenés y derivar al privado de forma variada e informal.
- Si el producto SÍ está en el catálogo, NO uses la frase de derivación/fallback. Respondé directamente con el precio del catálogo y respondé a sus preguntas. Si el cliente pregunta por características adicionales (ancho, composición, etc.) de ese producto, podés buscar y responder usando la información del CEREBRO DEL NEGOCIO.
- Para precios, stock y disponibilidad, la única fuente válida es el catálogo. Nunca supongas precios que no estén en el catálogo.

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

    const completionGuard = `\n\nIMPORTANTE: Devolvé una respuesta COMPLETA. No la cortes a mitad de frase. Cerrá la idea con puntuación final o emoji.`;

    // 11. Call Gemini, trying current models before falling back to OpenAI
    let draftText = '';
    const aiErrors: string[] = [];

    if (geminiKey) {
      const geminiBody = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt + completionGuard }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1536 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      };

      for (const model of GEMINI_MODELS) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody) }
          );
          if (geminiRes.ok) {
            const geminiData = await geminiRes.json() as any;
            const parts = geminiData.candidates?.[0]?.content?.parts || [];
            const finishReason = geminiData.candidates?.[0]?.finishReason;
            draftText = normalizeDraftText(parts.map((p: any) => p.text).filter(Boolean).join(''));
            if (draftText && (finishReason === 'MAX_TOKENS' || isProbablyTruncated(draftText))) {
              const retryBody = {
                ...geminiBody,
                contents: [{ role: 'user', parts: [{ text: `${userPrompt}${completionGuard}\n\nLa respuesta anterior quedó cortada: "${draftText}". Reescribí desde cero una versión final completa y lista para enviar.` }] }],
                generationConfig: { temperature: 0.5, maxOutputTokens: 1536 },
              };
              const retryRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retryBody) }
              );
              if (retryRes.ok) {
                const retryData = await retryRes.json() as any;
                 const retryParts = retryData.candidates?.[0]?.content?.parts || [];
                 const retryText = normalizeDraftText(retryParts.map((p: any) => p.text).filter(Boolean).join(''));
                if (retryText && !isProbablyTruncated(retryText)) draftText = retryText;
              }
            }
            if (draftText && !isProbablyTruncated(draftText)) break;
            aiErrors.push(`Gemini ${model}: ${draftText ? 'truncated response' : 'empty response'}`);
            draftText = '';
          } else {
            const errText = await geminiRes.text();
            aiErrors.push(`Gemini ${model}: HTTP ${geminiRes.status} ${errText.slice(0, 300)}`);
            console.error('[draft-reply] Gemini error:', model, geminiRes.status, errText);
          }
        } catch (e: any) {
          aiErrors.push(`Gemini ${model}: ${e?.message || String(e)}`);
          console.error('[draft-reply] Gemini exception:', model, e);
        }
      }
    }

    // 12. Fallback to OpenAI
    if ((!draftText || isProbablyTruncated(draftText)) && openAiKey) {
      try {
        const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt + completionGuard }],
            temperature: 0.7, max_tokens: 1536,
          }),
        });
        if (oaRes.ok) {
          const oaData = await oaRes.json() as any;
          draftText = normalizeDraftText(oaData.choices?.[0]?.message?.content || '');
          if (draftText && (oaData.choices?.[0]?.finish_reason === 'length' || isProbablyTruncated(draftText))) {
            const retryRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: `${userPrompt}${completionGuard}\n\nLa respuesta anterior quedó cortada: "${draftText}". Reescribí desde cero una versión final completa y lista para enviar.` },
                ],
                temperature: 0.5,
                max_tokens: 1536,
              }),
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json() as any;
              const retryText = normalizeDraftText(retryData.choices?.[0]?.message?.content || '');
              if (retryText && !isProbablyTruncated(retryText)) draftText = retryText;
            }
          }
        } else {
          const errText = await oaRes.text();
          aiErrors.push(`OpenAI: HTTP ${oaRes.status} ${errText.slice(0, 300)}`);
          console.warn('[draft-reply] OpenAI error:', oaRes.status, errText);
        }
      } catch (e: any) {
        aiErrors.push(`OpenAI: ${e?.message || String(e)}`);
        console.warn('[draft-reply] OpenAI exception:', e.message);
      }
    }

    if (!draftText || isProbablyTruncated(draftText)) {
      console.error('[draft-reply] All AI providers failed:', aiErrors.join(' | '));
      return res.status(502).json({
        error: 'AI_PROVIDER_FAILED',
        detail: aiErrors[0] || 'No se pudo generar el borrador con IA.'
      });
    }

    return res.status(200).json({ draft: draftText });

  } catch (err: any) {
    console.error('[draft-reply] Unhandled error:', err);
    return res.status(500).json({
      error: 'DRAFT_REPLY_FAILED',
      detail: err?.message || 'No se pudo generar el borrador con IA.'
    });
  }
}
