import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type CreattiaAd = {
  title: string;
  subtitle: string;
  cta: string;
  format: 'feed' | 'story';
  aspectRatio?: '9:16' | '1:1' | '4:5' | '3:4';
  imageUrl?: string;
  color?: string;
  angle?: string;
  ring?: string;
  visualDirection?: string;
  conversionReason?: string;
};

const normalizeAspectRatio = (input: unknown, fallbackIndex: number): '9:16' | '1:1' | '4:5' | '3:4' => {
  const raw = String(input || '').toLowerCase();
  if (raw.includes('9:16') || raw.includes('story') || raw.includes('reel')) return '9:16';
  if (raw.includes('1:1') || raw.includes('square') || raw.includes('carousel')) return '1:1';
  if (raw.includes('3:4')) return '3:4';
  if (raw.includes('4:5') || raw.includes('feed')) return '4:5';
  return (['9:16', '1:1', '4:5', '3:4'] as const)[fallbackIndex % 4];
};

const normalizeSelectedList = (input: unknown, fallback: string[]) => {
  const values = Array.isArray(input)
    ? input.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return values.length ? values : fallback;
};

const formatFromAspectRatio = (aspectRatio: '9:16' | '1:1' | '4:5' | '3:4'): 'feed' | 'story' => (
  aspectRatio === '9:16' ? 'story' : 'feed'
);

const creattiaColorPresets = [
  'from-[#2b160e] via-[#7a4327] to-[#c38b5d]',
  'from-[#1d120d] via-[#5d321f] to-[#9c7048]',
  'from-[#321c11] via-[#805033] to-[#d6a56f]',
  'from-[#e9e3d8] via-[#9f7559] to-[#4b2a1e]',
  'from-[#101828] via-[#245c57] to-[#78e3d1]',
  'from-[#172033] via-[#6d5dfc] to-[#f7d56b]',
  'from-[#111827] via-[#dc6f55] to-[#ffe8c2]',
  'from-[#0f251d] via-[#38a993] to-[#d7ff3f]',
];

// ── audio-proxy helpers ──────────────────────────────────────────────────────

function isAllowedAudioUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'https:') return false;
    const h = url.hostname;
    return !/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/.test(h);
  } catch { return false; }
}

function float32ToWav(channelData: Float32Array[], sampleRate: number): Buffer {
  const ch = channelData.length;
  const n = channelData[0].length;
  const blockAlign = ch * 2;
  const dataSize = n * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28); buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
  let off = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channelData[c][i]));
      buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), off); off += 2;
    }
  return buf;
}

async function handleAudioProxy(req: VercelRequest, res: VercelResponse) {
  const url = Array.isArray(req.query.url) ? req.query.url[0] : (req.query.url as string);
  if (!url || !isAllowedAudioUrl(url)) return res.status(400).json({ error: 'Invalid URL' });

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  } catch { return res.status(502).json({ error: 'Failed to fetch audio' }); }
  if (!upstream.ok) return res.status(upstream.status).json({ error: 'Upstream error' });

  const ct = upstream.headers.get('content-type') || '';
  if (!ct.includes('ogg') && !ct.includes('opus')) {
    res.setHeader('Content-Type', ct || 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OggOpusDecoder } = require('ogg-opus-decoder');
    const audioData = new Uint8Array(await upstream.arrayBuffer());
    const decoder = new OggOpusDecoder();
    await decoder.ready;
    const { channelData, samplesDecoded, sampleRate } = await decoder.decode(audioData);
    await decoder.free();
    if (!samplesDecoded) return res.status(422).json({ error: 'No audio decoded' });
    const wav = float32ToWav(channelData, sampleRate);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wav.length));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(wav);
  } catch { return res.status(500).json({ error: 'Conversion failed' }); }
}

// ── Creattia AI generation ───────────────────────────────────────────────────

function normalizeCreattiaUrl(input: string) {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL inválida');
  if (
    /(^|\.)localhost$/i.test(url.hostname) ||
    /^(127\.|10\.|0\.0\.0\.0|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) ||
    url.hostname.includes('::1')
  ) {
    throw new Error('No se permiten URLs locales o privadas');
  }
  return url.toString();
}

function stripCreattiaHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCreattiaImages(html: string, baseUrl: string) {
  const candidates: string[] = [];
  const pushImage = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return;
    try {
      const firstSrcsetUrl = raw.split(',')[0]?.trim().split(/\s+/)[0] || raw;
      const url = new URL(firstSrcsetUrl, baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      const href = url.toString();
      if (/\.(svg|gif)(\?|$)/i.test(href)) return;
      if (/logo|icon|favicon|sprite|placeholder/i.test(href)) return;
      candidates.push(href);
    } catch {
      // Ignore malformed image URLs from third-party storefronts.
    }
  };

  for (const pattern of [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/gi,
    /<img[^>]+(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["']/gi,
    /<img[^>]+(?:srcset|data-srcset)=["']([^"']+)["']/gi,
    /<source[^>]+srcset=["']([^"']+)["']/gi,
  ]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) pushImage(match[1]);
  }

  return [...new Set(candidates)].slice(0, 12);
}

function extractCreattiaJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('La IA no devolvió JSON');
  return JSON.parse(source.slice(start, end + 1));
}

function cleanCreattiaKey(value?: string) {
  const clean = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  return clean || undefined;
}

async function fetchCreattiaSite(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'CreatteAIBot/1.0 (+https://creattia.vercel.app)',
      },
    });
    if (!response.ok) throw new Error(`No pudimos leer la tienda (${response.status})`);
    const html = await response.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
    const text = stripCreattiaHtml(html).slice(0, 20000);
    const images = extractCreattiaImages(html, url);
    return { title, description, text, images };
  } finally {
    clearTimeout(timeout);
  }
}

async function callCreattiaGemini(key: string, systemPrompt: string, userPrompt: unknown) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 6500,
        responseMimeType: 'application/json',
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${JSON.stringify(userPrompt)}` }],
        },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini: ${response.status} ${text.slice(0, 300)}`);
  }
  const data = await response.json() as any;
  return data.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('\n') || '{}';
}

async function callCreattiaOpenAI(key: string, systemPrompt: string, userPrompt: unknown) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      response_format: { type: 'json_object' },
      temperature: 0.75,
      max_tokens: 6500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPrompt) },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI: ${response.status} ${text.slice(0, 300)}`);
  }
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '{}';
}

async function handleCreattiaGenerate(req: VercelRequest, res: VercelResponse) {
  try {
    const geminiKey = cleanCreattiaKey(process.env.GOOGLE_AI_API_KEY) || cleanCreattiaKey(process.env.GEMINI_API_KEY) || cleanCreattiaKey(process.env.GOOGLE_GEMINI_API_KEY);
    const openAiKey = cleanCreattiaKey(process.env.OPENAI_API_KEY) || cleanCreattiaKey(process.env.OPENAI_KEY);
    if (!geminiKey && !openAiKey) {
      return res.status(503).json({
        error: 'AI_NOT_CONFIGURED',
        detail: 'Falta configurar GOOGLE_AI_API_KEY/GEMINI_API_KEY u OPENAI_API_KEY en Vercel para que CreatteAI genere campañas reales.',
      });
    }

    const url = normalizeCreattiaUrl(String(req.body?.url || ''));
    const instagramUrl = String(req.body?.instagramUrl || '').trim();
    const businessType = String(req.body?.businessType || 'Ambos');
    const preferences = req.body?.preferences || {};
    const requestedAds = Math.max(4, Math.min(16, Number(req.body?.creativeCount || 4)));
    const requestedFormatRatios = normalizeSelectedList(preferences?.formats, ['9:16 Stories/Reels', '1:1 Feed/Carousel', '4:5 Feed vertical', '3:4 Grid preview'])
      .map((format, index) => normalizeAspectRatio(format, index));
    const requestedAngles = normalizeSelectedList(preferences?.angles, ['Punto de dolor', 'Demo', 'Objeciones', 'Oferta']);
    const requestedRings = normalizeSelectedList(preferences?.rings, ['Dolor', 'Prueba', 'Mecanismo', 'Oferta']);
    let site;
    try {
      site = await fetchCreattiaSite(url);
    } catch (siteError: any) {
      site = {
        title: new URL(url).hostname.replace(/^www\./, ''),
        description: '',
        text: `No se pudo leer la web en este intento (${siteError?.message || 'fetch failed'}). Usá el dominio, Instagram declarado, tipo de negocio y preferencias del usuario como contexto principal. Generá creativos igualmente y evitá inventar datos muy específicos no inferibles.`,
        images: [],
        fetchWarning: siteError?.message || 'No pudimos leer la web completa.',
      };
    }
    const systemPrompt = [
      'Sos CreatteAI, un agente senior de performance creative para ecommerce y páginas de servicios.',
      'Analizás web, Instagram declarado, propuesta de valor, puntos de dolor, objeciones, prueba social, oferta, rings creativos y formatos.',
      'Generás solo creativos estáticos para Meta/Instagram. Ratios disponibles: 9:16 Stories/Reels, 1:1 Feed/Carousel, 4:5 Feed vertical y 3:4 Grid preview. No generes video.',
      'Cada anuncio debe tener una razón estratégica clara, un punto de dolor específico, un ring y una estructura de conversión. Evitá promesas exageradas, médicas o imposibles de probar.',
      'No repitas el mismo ángulo con distintas palabras: cada creativo tiene que aportar una hipótesis creativa distinta para testear en Meta Ads.',
      'Usá español rioplatense premium y claro. No uses comparaciones agresivas ni ataques directos a competidores.',
      'Respondé únicamente JSON válido. Sin markdown.',
    ].join('\n');

    const userPrompt = {
      task: `Generá exactamente ${requestedAds} ads estáticos para Meta/Instagram a partir de esta marca.`,
      requestedAds,
      url,
      instagramUrl,
      businessType,
      preferences,
      site,
      required_json_shape: {
        brandName: 'string',
        businessSummary: 'string',
        brandDna: {
          voice: 'string',
          customer: 'string',
          visual: 'string',
          objections: 'string',
        },
        ads: [
          {
            title: 'string max 52 chars',
            subtitle: 'string max 75 chars',
            cta: 'string max 58 chars',
            format: 'feed|story',
            aspectRatio: '9:16|1:1|4:5|3:4',
            imageUrl: 'string optional, use one detected site image when relevant',
            angle: 'string',
            ring: 'Deseo|Dolor|Prueba|Mecanismo|Oferta',
            visualDirection: 'string',
            conversionReason: 'string'
          },
        ],
        products: [
          { name: 'string', tag: 'string', price: 'string', insight: 'string' },
        ],
      },
    };

    let raw = '';
    let parsed: any;
    try {
      raw = geminiKey ? await callCreattiaGemini(geminiKey, systemPrompt, userPrompt) : await callCreattiaOpenAI(openAiKey, systemPrompt, userPrompt);
    } catch (primaryError: any) {
      if (!geminiKey || !openAiKey) throw primaryError;
      raw = await callCreattiaOpenAI(openAiKey, systemPrompt, userPrompt);
    }

    try {
      parsed = extractCreattiaJson(raw);
    } catch (parseError: any) {
      if (!openAiKey || !geminiKey) throw parseError;
      raw = await callCreattiaOpenAI(openAiKey, systemPrompt, userPrompt);
      parsed = extractCreattiaJson(raw);
    }
    const ads = (Array.isArray(parsed.ads) ? parsed.ads : []).slice(0, requestedAds).map((ad: CreattiaAd, index: number) => {
      const aspectRatio = requestedFormatRatios[index % requestedFormatRatios.length];
      const siteImages = Array.isArray(site.images) ? site.images : [];
      return {
        title: String(ad.title || 'Una pieza que vende mejor').slice(0, 80),
        subtitle: String(ad.subtitle || 'Concepto generado con IA para tu tienda.').slice(0, 110),
        cta: String(ad.cta || 'Descubrí la diferencia').slice(0, 90),
        aspectRatio,
        format: formatFromAspectRatio(aspectRatio),
        imageUrl: siteImages[index % Math.max(1, siteImages.length)] || String(ad.imageUrl || ''),
        angle: requestedAngles[index % requestedAngles.length],
        ring: requestedRings[index % requestedRings.length],
        visualDirection: String(ad.visualDirection || '').slice(0, 150),
        conversionReason: String(ad.conversionReason || '').slice(0, 120),
        color: creattiaColorPresets[index % creattiaColorPresets.length],
      };
    });

    return res.status(200).json({
      sourceUrl: url,
      brandName: parsed.brandName || site.title || 'Tu marca',
      businessSummary: parsed.businessSummary || site.description || '',
      brandDna: parsed.brandDna || null,
      products: Array.isArray(parsed.products) ? parsed.products.slice(0, 3) : [],
      images: Array.isArray(site.images) ? site.images : [],
      ads: ads.length ? ads : Array.from({ length: requestedAds }, (_, index) => {
        const color = creattiaColorPresets[index % creattiaColorPresets.length];
        const aspectRatio = requestedFormatRatios[index % requestedFormatRatios.length];
        const siteImages = Array.isArray(site.images) ? site.images : [];
        return {
        title: ['Tu producto, mejor contado', 'La razón para elegirte', 'Menos dudas, más compras', 'Una historia que convierte'][index % 4],
        subtitle: 'Concepto generado con IA para tu tienda.',
        cta: 'Ver más',
        aspectRatio,
        format: formatFromAspectRatio(aspectRatio),
        imageUrl: siteImages[index % Math.max(1, siteImages.length)] || '',
        angle: requestedAngles[index % requestedAngles.length],
        ring: requestedRings[index % requestedRings.length],
        visualDirection: 'Pieza estática clara, con jerarquía fuerte, producto o servicio protagonista y CTA visible.',
        conversionReason: 'Testea una hipótesis creativa distinta para Meta Ads.',
        color,
      };
      }),
    });
  } catch (error: any) {
    return res.status(400).json({
      error: 'CREATTIA_GENERATE_FAILED',
      detail: error?.message || 'No pudimos generar la campaña.',
    });
  }
}

// ── main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // GET → audio proxy (OGG→WAV conversion for Safari/iOS)
  if (req.method === 'GET') return handleAudioProxy(req, res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (req.body?.action === 'creattia_generate') {
    return handleCreattiaGenerate(req, res);
  }

  // POST → Chatwoot API proxy
  const { chatwoot_url, chatwoot_token, path, body: cwBody, method: cwMethod } = req.body;
  if (!chatwoot_url || !chatwoot_token || !path) {
    return res.status(400).json({ error: 'Missing chatwoot params' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: client } = await supabase
      .from('car_clients')
      .select('id')
      .eq('chatwoot_token', chatwoot_token)
      .single();
    if (!client) return res.status(403).json({ error: 'Unauthorized' });
  } catch { return res.status(403).json({ error: 'Auth check failed' }); }

  try {
    const method = cwMethod || (cwBody !== undefined ? 'POST' : 'GET');
    const hasBody = cwBody !== undefined && method !== 'DELETE' && method !== 'GET';
    const upstream = await fetch(`${String(chatwoot_url).replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'api_access_token': chatwoot_token, 'Content-Type': 'application/json' },
      ...(hasBody ? { body: JSON.stringify(cwBody) } : {}),
    });
    const text = await upstream.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return res.status(upstream.status).json(data);
  } catch (err: any) { return res.status(500).json({ error: err.message }); }
}
