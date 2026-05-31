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
    /faq/i, /pregunta/i, /ayuda/i, /soporte/i,
    /nosotros/i, /about/i, /quienes/i, /contacto/i, /contact/i
  ];
  const matches = links.filter(link => {
    return keywords.some(regex => regex.test(link));
  });
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

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  const { clientId, url, action } = req.body as { clientId: string; url?: string; action?: 'scrape-all' | 'scrape-website' | 'sync-instagram' };

  if (!clientId) {
    return res.status(400).json({ error: 'Missing clientId' });
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
              model: 'gpt-4.1-mini',
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
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4.1-mini',
              messages: [
                {
                  role: 'system',
                  content: `Analiza el texto de la web del negocio "${business_name}" y genera una base de conocimiento estructurada y limpia en español.
Organízala en estas secciones:
1. INFORMACIÓN GENERAL (Descripción del negocio, qué vende y marca)
2. CATÁLOGO / PRODUCTOS DESTACADOS
3. POLÍTICAS DE ENVÍO Y ENTREGAS (Tiempos, zonas, costos)
4. POLÍTICAS DE CAMBIOS Y DEVOLUCIONES (Condiciones, plazos)
5. PREGUNTAS FRECUENTES Y CONTACTO (Horarios, medios de soporte)`
                },
                { role: 'user', content: combinedText }
              ],
              temperature: 0.3,
              max_tokens: 1500,
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

      return res.status(200).json({ scraped_content: finalWebSummary, website_url: targetUrl, brain_updated_at: nowTimestamp });
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
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openAiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            messages: [
              {
                role: 'system',
                content: `Analiza el texto de la web del negocio "${business_name}" y genera una base de conocimiento estructurada y limpia en español.
Organízala en estas secciones:
1. INFORMACIÓN GENERAL (Descripción del negocio, qué vende y marca)
2. CATÁLOGO / PRODUCTOS DESTACADOS
3. POLÍTICAS DE ENVÍO Y ENTREGAS (Tiempos, zonas, costos)
4. POLÍTICAS DE CAMBIOS Y DEVOLUCIONES (Condiciones, plazos)
5. PREGUNTAS FRECUENTES Y CONTACTO (Horarios, medios de soporte)`
              },
              { role: 'user', content: combinedText }
            ],
            temperature: 0.3,
            max_tokens: 1500,
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
            model: 'gpt-4.1-mini',
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
          model: 'gpt-4.1',
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
