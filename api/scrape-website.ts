import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function cleanHtml(html: string): string {
  let text = html;
  // Remove head, script, style, header, footer, nav
  text = text.replace(/<head[\s\S]*?<\/head>/gi, '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  // Strip tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Clean whitespace
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
    
    // Ignore hashes, mailto, tel, javascript links
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      continue;
    }
    
    // Normalize relative paths
    if (href.startsWith('/')) {
      href = `${baseUrl.replace(/\/$/, '')}${href}`;
    }
    
    // Check if it's internal
    const isInternal = href.includes(baseDomain) || !/^https?:\/\//i.test(href);
    if (isInternal) {
      // Normalize absolute link
      if (!/^https?:\/\//i.test(href)) {
        href = `${baseUrl.replace(/\/$/, '')}/${href.replace(/^\//, '')}`;
      }
      
      // Clean query parameters and hashes
      href = href.split('?')[0].split('#')[0];
      
      // Make sure we have a valid URL string
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
    /faq/i, /pregunta/i, /ayuda/i, /soporte/i,
    /nosotros/i, /about/i, /quienes/i, /contacto/i, /contact/i
  ];
  
  const matches = links.filter(link => {
    return keywords.some(regex => regex.test(link));
  });
  
  // Return top 5 unique matching links
  return [...new Set(matches)].slice(0, 5);
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

  // ── Chatwoot proxy branch ──────────────────────────────────────────────
  if (req.body?.chatwoot_url) {
    const { chatwoot_url, chatwoot_token, path, body: cwBody, method: cwMethod } = req.body;
    if (!chatwoot_url || !chatwoot_token || !path) {
      return res.status(400).json({ error: 'Missing chatwoot params' });
    }
    try {
      let method = cwMethod || (cwBody ? 'POST' : 'GET');
      let body = cwBody;
      if (cwBody?._method === 'DELETE') { method = 'DELETE'; body = undefined; }
      const upstream = await fetch(`${String(chatwoot_url).replace(/\/$/, '')}${path}`, {
        method,
        headers: { 'api_access_token': chatwoot_token, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await upstream.text();
      const data = text ? JSON.parse(text) : {};
      return res.status(upstream.status).json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
  // ── End Chatwoot proxy ─────────────────────────────────────────────────

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const { clientId, url } = req.body as { clientId: string; url: string };

  if (!clientId || !url) {
    return res.status(400).json({ error: 'Missing clientId or url' });
  }

  try {
    // 1. Clean URL
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    // 2. Fetch HTML content from Homepage
    const fetchResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!fetchResponse.ok) {
      return res.status(400).json({ error: `No se pudo conectar a la web: ${fetchResponse.statusText}` });
    }

    const htmlContent = await fetchResponse.text();
    const homepageText = cleanHtml(htmlContent);

    if (!homepageText) {
      return res.status(400).json({ error: 'La web escaneada no tiene contenido de texto legible.' });
    }

    // 3. Discover and crawl internal subpages in parallel
    const discoveredLinks = extractInternalLinks(htmlContent, targetUrl);
    const targetSubpages = prioritizeLinks(discoveredLinks);

    console.log(`[Web Scraper] Discovered ${discoveredLinks.length} links. Crawling ${targetSubpages.length} subpages:`, targetSubpages);

    const subpagesContent = await Promise.all(
      targetSubpages.map(async (link) => {
        try {
          const subRes = await fetch(link, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(5000), // 5s timeout per subpage
          });
          if (subRes.ok) {
            const html = await subRes.text();
            const text = cleanHtml(html);
            const pathName = new URL(link).pathname;
            return `--- PÁGINA: ${pathName} ---\n${text}`;
          }
        } catch (e) {
          console.error(`[Web Scraper] Error scraping subpage ${link}:`, e);
        }
        return '';
      })
    );

    // Combine all pages
    let combinedText = `--- PÁGINA DE INICIO (HOME) ---\n${homepageText}\n\n` + 
      subpagesContent.filter(Boolean).join('\n\n');

    // Limit combined content to 45k characters for LLM context optimization
    combinedText = combinedText.slice(0, 45000);

    // 4. Call OpenAI to summarize the website structure and details
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `You are an expert AI scraper and business analyst. 
Your task is to analyze the following raw text extracted from a business website (homepage and key subpages like shipping policies, about us, and FAQs) and generate a highly organized, comprehensive knowledge base in Spanish.
This knowledge base will be used by an AI assistant to answer customer comments and messages.

Please organize the knowledge base into the following sections:
1. INFORMACIÓN GENERAL (¿Qué hace el negocio? ¿Qué vende? Filosofía de la marca)
2. CATÁLOGO / PRODUCTOS DESTACADOS
3. POLÍTICAS DE ENVÍO, TIEMPOS Y ENTREGAS (Detallar zonas de entrega, plazos, costos)
4. POLÍTICA DE CAMBIOS Y DEVOLUCIONES (Plazos, condiciones, procesos de cambio)
5. PREGUNTAS FRECUENTES (FAQs) Y CANALES DE CONTACTO (Medios de contacto, soporte, horarios)

Keep it concise, clear, and extremely useful for generating responses. Answer in Spanish.`
          },
          {
            role: 'user',
            content: `Aquí está el texto extraído del sitio web:\n\n${combinedText}`
          }
        ],
        temperature: 0.3,
        max_tokens: 1800,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return res.status(502).json({ error: 'Error al procesar el resumen con OpenAI.', detail: errText });
    }

    const openaiData = await openaiRes.json();
    const summary = openaiData.choices?.[0]?.message?.content?.trim() || '';

    if (!summary) {
      return res.status(502).json({ error: 'OpenAI devolvió un resumen vacío.' });
    }

    // 5. Update the client profile in Supabase
    const { error: dbError } = await supabase
      .from('car_clients')
      .update({ 
        scraped_content: summary,
        website_url: targetUrl 
      })
      .eq('id', clientId);

    if (dbError) {
      return res.status(500).json({ error: 'Error al guardar el conocimiento en la base de datos.', detail: dbError.message });
    }

    return res.status(200).json({ summary });

  } catch (err: any) {
    console.error('[Web Scraper] Error:', err);
    return res.status(500).json({ error: `Error interno de servidor: ${err.message}` });
  }
}
