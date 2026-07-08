import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type CreattiaAd = {
  title: string;
  subtitle: string;
  cta: string;
  format: 'feed' | 'story';
  aspectRatio?: '9:16' | '1:1' | '4:5' | '3:4';
  imageUrl?: string;
  visualPrompt?: string;
  color?: string;
  angle?: string;
  ring?: string;
  visualDirection?: string;
  conversionReason?: string;
};

type CreattiaProduct = {
  name: string;
  tag?: string;
  price?: string;
  insight?: string;
  imageUrl?: string;
};

type UserAdReference = {
  id: string;
  sourceFile?: string;
  localPath?: string;
  archetype: string;
  industry?: string;
  angle?: string;
  ring?: string;
  layout?: string;
  promptNotes?: string;
  width?: number;
  height?: number;
  aspectRatio?: number;
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

const creattiaAdReferenceLibrary = [
  {
    name: 'Benefit-first product hero',
    principle: 'One clear product/category hero with the main benefit instantly readable through the scene.',
    visual: 'premium product ad composition, bold central subject, clean negative space for headline, editorial lighting, crisp commercial finish',
  },
  {
    name: 'Problem-solution contrast',
    principle: 'A visual before/after or messy-to-clean metaphor that makes the pain obvious without ugly design.',
    visual: 'split-scene commercial composition, left side friction, right side premium solution, elegant contrast, no text',
  },
  {
    name: 'Proof of craft',
    principle: 'Show why the product is trustworthy through process, material, hands, tools, or expert handling.',
    visual: 'high-end documentary product photography, expert hands, real materials, workshop detail, cinematic depth of field',
  },
  {
    name: 'Aspirational outcome',
    principle: 'Show the end result the buyer wants, not just the object being sold.',
    visual: 'finished desirable result, lifestyle/editorial environment, premium warm light, emotionally satisfying composition',
  },
  {
    name: 'Offer-led creative',
    principle: 'Visual supports a strong promo, discount, bundle, or price/value message with room for overlay copy.',
    visual: 'bright high-contrast product layout, clean offer area, energetic ecommerce set design, premium not cheap',
  },
  {
    name: 'Shipping urgency',
    principle: 'Make fast delivery, availability, or immediate gratification feel concrete and trustworthy.',
    visual: 'premium packing table, product ready to ship, subtle motion, clean boxes, logistics cue, polished commercial scene',
  },
  {
    name: 'UGC premium testimonial',
    principle: 'Native human proof, but composed cleanly enough to feel like a top-performing paid social asset.',
    visual: 'creator-style vertical photo, natural person using product, authentic but sharp, phone-native framing, premium color grading',
  },
  {
    name: 'Objection breaker',
    principle: 'Visualize guidance, guarantee, quality, sizing, fit, safety, or ease of choice.',
    visual: 'expert consultation moment, reassuring close-up, decision support cues, premium calm atmosphere, no text',
  },
  {
    name: 'Bundle and collection',
    principle: 'Show range, abundance, kit value, or multiple variants in a clean shoppable layout.',
    visual: 'organized product grid or bundle flat lay, premium shadows, colorful but restrained, e-commerce catalog meets editorial',
  },
  {
    name: 'Authority and award',
    principle: 'Suggest best-in-class status, durability, reviews, or expert approval without fake badges.',
    visual: 'hero product with trophy-like lighting, premium pedestal, review/proof mood, elegant dark-to-light contrast, no literal award text',
  },
  {
    name: 'Sensory craving',
    principle: 'Make the viewer feel texture, taste, smell, touch, comfort, or material quality immediately.',
    visual: 'extreme tactile macro, rich texture, sensory detail, saturated premium color, appetizing/material-focused lighting',
  },
  {
    name: 'Clean comparison',
    principle: 'Suggest a smarter choice versus alternatives without naming or attacking competitors.',
    visual: 'two-zone visual metaphor, clutter versus premium clarity, sharp composition, clean contrast, no labels',
  },
] as const;

let cachedUserReferenceCatalog: UserAdReference[] | null = null;

function loadUserReferenceCatalog() {
  if (cachedUserReferenceCatalog) return cachedUserReferenceCatalog;
  try {
    const catalogPath = path.join(process.cwd(), 'public', 'creattia', 'reference-ads', 'catalog.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    cachedUserReferenceCatalog = Array.isArray(catalog.references) ? catalog.references : [];
  } catch {
    cachedUserReferenceCatalog = [];
  }
  return cachedUserReferenceCatalog;
}

function selectUserReference(ad: CreattiaAd, index: number) {
  const catalog = loadUserReferenceCatalog();
  if (!catalog.length) return null;
  const ring = String(ad.ring || '').toLowerCase();
  const angle = String(ad.angle || '').toLowerCase();
  const scored = catalog
    .map((reference, referenceIndex) => {
      let score = 0;
      const refRing = String(reference.ring || '').toLowerCase();
      const refAngle = String(reference.angle || '').toLowerCase();
      const refArchetype = String(reference.archetype || '').toLowerCase();
      if (ring && (refRing.includes(ring) || ring.includes(refRing))) score += 4;
      if (angle && (refAngle.includes(angle) || refArchetype.includes(angle))) score += 3;
      if (/dolor|pain|objec/i.test(`${angle} ${ring}`) && /problem|objection|pain|regret/.test(refArchetype)) score += 3;
      if (/demo|mecan/i.test(`${angle} ${ring}`) && /mechanism|comparison|feature|proof/.test(refArchetype)) score += 3;
      if (/oferta|offer/i.test(`${angle} ${ring}`) && /offer|product|bundle|catalog/.test(refArchetype)) score += 3;
      if (/prueba|proof|autor/i.test(`${angle} ${ring}`) && /proof|authority|testimonial|ugc/.test(refArchetype)) score += 3;
      return { reference, score: score + ((index + referenceIndex) % 3) / 10 };
    })
    .sort((a, b) => b.score - a.score);
  return scored[index % Math.min(4, scored.length)]?.reference || catalog[index % catalog.length];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const raw = String(value || '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
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

function extractCreattiaProducts(html: string, images: string[]): CreattiaProduct[] {
  const products: CreattiaProduct[] = [];
  const addProduct = (item: any) => {
    const name = String(item?.name || item?.title || '').trim();
    if (!name || name.length < 2 || /home|catalog|shop all/i.test(name)) return;
    const priceValue = item?.offers?.price || item?.price || item?.variants?.[0]?.price;
    const price = priceValue ? `$${String(priceValue).replace(/\.0+$/, '')}` : '';
    const imageValue = Array.isArray(item?.image) ? item.image[0] : item?.image || item?.featured_image;
    products.push({
      name: name.slice(0, 80),
      tag: item?.category || item?.type || 'Detectado',
      price,
      imageUrl: typeof imageValue === 'string' ? imageValue : '',
      insight: 'Producto detectado en la web. Se puede usar como foco del creativo.',
    });
  };

  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed['@graph']) ? parsed['@graph'] : [])];
      for (const node of nodes) {
        if (node?.['@type'] === 'Product' || (Array.isArray(node?.['@type']) && node['@type'].includes('Product'))) addProduct(node);
        if (Array.isArray(node?.itemListElement)) node.itemListElement.forEach((entry: any) => addProduct(entry?.item || entry));
      }
    } catch {
      // Ignore malformed structured data.
    }
  }

  for (const match of html.matchAll(/"title"\s*:\s*"([^"]{3,90})"[\s\S]{0,260}?"price"\s*:\s*"?([0-9.,]+)"?/gi)) {
    products.push({
      name: match[1].replace(/\\"/g, '"'),
      tag: 'Catálogo',
      price: `$${match[2]}`,
      imageUrl: images[products.length % Math.max(1, images.length)] || '',
      insight: 'Producto encontrado en datos de catálogo. Ideal para probar ángulos específicos.',
    });
  }

  const unique = new Map<string, CreattiaProduct>();
  for (const product of products) {
    const key = product.name.toLowerCase();
    if (!unique.has(key)) unique.set(key, product);
  }
  return [...unique.values()].slice(0, 8);
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
    const products = extractCreattiaProducts(html, images);
    return { title, description, text, images, products };
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

async function callCreattiaOpenAIImage(key: string, prompt: string, aspectRatio: '9:16' | '1:1' | '4:5' | '3:4') {
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const largeSize = aspectRatio === '1:1' ? '1024x1024' : '1024x1536';
  const safeSize = aspectRatio === '1:1' ? '832x832' : '768x1024';
  const preferredQuality = process.env.OPENAI_IMAGE_QUALITY || 'medium';
  const attempts = [
    { size: safeSize, quality: preferredQuality, output_format: 'jpeg', output_compression: 88 },
    { size: safeSize, quality: 'medium', output_format: 'jpeg', output_compression: 85 },
    { size: safeSize, quality: 'low', output_format: 'jpeg', output_compression: 82 },
    { size: largeSize, quality: 'medium', output_format: 'jpeg', output_compression: 86 },
    { size: safeSize, quality: 'low' },
  ];

  const requestImage = async (body: Record<string, unknown>) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28000);
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    }).finally(() => clearTimeout(timeout));
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI Images: ${response.status} ${text.slice(0, 220)}`);
    }
    const data = await response.json() as any;
    const image = data.data?.[0];
    if (image?.b64_json) return `data:image/jpeg;base64,${image.b64_json}`;
    if (image?.url) return image.url;
    throw new Error('OpenAI Images: no image returned');
  };

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await requestImage({
        model,
        prompt,
        n: 1,
        ...attempt,
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OpenAI Images failed');
}

function buildCreattiaImagePrompt(args: {
  brandName: string;
  businessSummary: string;
  businessType: string;
  siteText: string;
  selectedProduct?: CreattiaProduct | null;
  reference: typeof creattiaAdReferenceLibrary[number];
  userReference?: UserAdReference | null;
  ad: CreattiaAd & { aspectRatio?: '9:16' | '1:1' | '4:5' | '3:4' };
}) {
  const { brandName, businessSummary, businessType, siteText, selectedProduct, reference, userReference, ad } = args;
  return [
    `Create a high-end conversion-focused static ad visual for Meta Ads for the brand "${brandName}".`,
    `Business type: ${businessType}. Brand context: ${businessSummary || siteText.slice(0, 700)}.`,
    selectedProduct?.name ? `Focus product/service: ${selectedProduct.name}. Product notes: ${selectedProduct.insight || selectedProduct.tag || ''}. Price if relevant: ${selectedProduct.price || 'not specified'}.` : 'No single product selected: create a general brand/product-category visual.',
    `Use this internal high-converting ad reference archetype: "${reference.name}". Principle: ${reference.principle}. Visual style: ${reference.visual}.`,
    userReference ? `Also use this user-provided reference pattern as inspiration only, not as a copy: archetype "${userReference.archetype}", industry "${userReference.industry || 'unknown'}", angle "${userReference.angle || 'unknown'}", ring "${userReference.ring || 'unknown'}", layout "${userReference.layout || 'high-performing direct response ad layout'}", notes "${userReference.promptNotes || 'match the composition logic and conversion structure without reproducing the exact ad'}".` : '',
    `Creative angle: ${ad.angle || 'performance ad'}. Ring: ${ad.ring || 'conversion'}. Concept: ${ad.title} / ${ad.subtitle}.`,
    ad.visualPrompt ? `Specific visual direction: ${ad.visualPrompt}.` : '',
    ad.visualDirection ? `Art direction: ${ad.visualDirection}.` : '',
    'The result must feel like a curated ad-library winner, not a generic stock photo: strong commercial art direction, one clear focal idea, premium retouching, intentional layout, high contrast, tasteful props, modern paid-social composition.',
    'Reserve clean negative space in the upper or lower third for overlay headline/copy. Make the product/category unmistakable without needing text.',
    'Make this visual clearly different from other ads in the same campaign: different camera angle, scene, lighting setup, product metaphor, crop, color palette, and background composition.',
    'Avoid boring product-on-table shots unless the archetype specifically needs it. Prefer campaign-level visual ideas: sensory close-up, expert proof, problem metaphor, outcome scene, offer set design, or native creator moment.',
    'Do not recreate the exact user reference image, brand, product, text, layout one-to-one, colors one-to-one, or protected trade dress. Abstract the creative structure into a new original image for this brand.',
    'Do not include readable text, letters, logos, watermarks, UI, fake badges, labels, borders, frames, screenshots, deformed hands, malformed objects, duplicate objects, or collage artifacts.',
    'The final app will add all copy on top. Generate only the premium ad visual underneath.',
  ].filter(Boolean).join('\n');
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
    const selectedProduct = preferences?.selectedProduct && preferences.selectedProduct !== 'general'
      ? preferences.selectedProduct as CreattiaProduct
      : null;
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
        products: [],
        fetchWarning: siteError?.message || 'No pudimos leer la web completa.',
      };
    }

    if (req.body?.action === 'creattia_analyze') {
      const analysisPrompt = {
        task: 'Analizá esta web para detectar marca, ADN y productos/servicios elegibles para anuncios. No generes ads.',
        url,
        instagramUrl,
        businessType,
        site,
        extractedProducts: Array.isArray(site.products) ? site.products : [],
        required_json_shape: {
          brandName: 'string',
          businessSummary: 'string',
          brandDna: {
            voice: 'string',
            customer: 'string',
            visual: 'string',
            objections: 'string',
          },
          products: [
            { name: 'string', tag: 'string', price: 'string', insight: 'string' },
          ],
        },
      };
      const analysisSystemPrompt = [
        'Sos CreatteAI, un estratega de performance creative.',
        'Tu trabajo es detectar productos o servicios reales de una web y resumir qué conviene anunciar.',
        'Devolvé productos concretos cuando existan. Si la web es de servicios, devolvé servicios/paquetes como productos elegibles.',
        'Respondé únicamente JSON válido. Sin markdown.',
      ].join('\n');
      const analysisRaw = geminiKey
        ? await callCreattiaGemini(geminiKey, analysisSystemPrompt, analysisPrompt)
        : await callCreattiaOpenAI(openAiKey, analysisSystemPrompt, analysisPrompt);
      const analysis = extractCreattiaJson(analysisRaw);
      const products = (Array.isArray(analysis.products) && analysis.products.length ? analysis.products : site.products || [])
        .slice(0, 8)
        .map((product: CreattiaProduct, index: number) => ({
          name: String(product.name || ['Producto principal', 'Servicio principal', 'Oferta destacada'][index % 3]).slice(0, 80),
          tag: String(product.tag || ['Detectado', 'Oportunidad', 'Foco de campaña'][index % 3]).slice(0, 40),
          price: String(product.price || 'A validar').slice(0, 40),
          insight: String(product.insight || 'Buen candidato para anuncios por su claridad comercial.').slice(0, 160),
          imageUrl: product.imageUrl || site.images?.[index % Math.max(1, site.images.length)] || '',
        }));
      return res.status(200).json({
        sourceUrl: url,
        brandName: analysis.brandName || site.title || 'Tu marca',
        businessSummary: analysis.businessSummary || site.description || '',
        brandDna: analysis.brandDna || null,
        products,
      });
    }

    const systemPrompt = [
      'Sos CreatteAI, un agente senior de performance creative para ecommerce y páginas de servicios.',
      'Analizás web, Instagram declarado, propuesta de valor, puntos de dolor, objeciones, prueba social, oferta, rings creativos y formatos.',
      'Generás solo creativos estáticos para Meta/Instagram. Ratios disponibles: 9:16 Stories/Reels, 1:1 Feed/Carousel, 4:5 Feed vertical y 3:4 Grid preview. No generes video.',
      'Cada anuncio debe tener una razón estratégica clara, un punto de dolor específico, un ring y una estructura de conversión. Evitá promesas exageradas, médicas o imposibles de probar.',
      'No repitas el mismo ángulo con distintas palabras: cada creativo tiene que aportar una hipótesis creativa distinta para testear en Meta Ads.',
      'Si hay un producto elegido, todos los anuncios deben tomarlo como foco. Si el usuario eligió marca general, variá entre producto, categoría y propuesta de valor.',
      'Para cada ad generá un visualPrompt específico y ambicioso para una imagen nueva creada por IA. No pidas texto dentro de la imagen.',
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
      selectedProduct: selectedProduct || 'general brand/category campaign',
      site,
      internalReferenceArchetypes: creattiaAdReferenceLibrary,
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
            visualPrompt: 'string, describe a premium AI image to generate for this specific ad. No text in the image.',
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
      return {
        title: String(ad.title || 'Una pieza que vende mejor').slice(0, 80),
        subtitle: String(ad.subtitle || 'Concepto generado con IA para tu tienda.').slice(0, 110),
        cta: String(ad.cta || 'Descubrí la diferencia').slice(0, 90),
        aspectRatio,
        format: formatFromAspectRatio(aspectRatio),
        angle: requestedAngles[index % requestedAngles.length],
        ring: requestedRings[index % requestedRings.length],
        visualPrompt: String(ad.visualPrompt || '').slice(0, 500),
        visualDirection: String(ad.visualDirection || '').slice(0, 150),
        conversionReason: String(ad.conversionReason || '').slice(0, 120),
        color: creattiaColorPresets[index % creattiaColorPresets.length],
      };
    });

    const brandName = parsed.brandName || site.title || 'Tu marca';
    const businessSummary = parsed.businessSummary || site.description || '';
    const adsWithImages = [];
    if (openAiKey) {
      for (let index = 0; index < ads.length; index += 1) {
        const ad = ads[index];
        const reference = creattiaAdReferenceLibrary[index % creattiaAdReferenceLibrary.length];
        const userReference = selectUserReference(ad, index);
        const prompt = buildCreattiaImagePrompt({
          brandName,
          businessSummary,
          businessType,
          siteText: site.text || '',
          selectedProduct,
          reference,
          userReference,
          ad,
        });
        try {
          const imageUrl = await callCreattiaOpenAIImage(openAiKey, prompt, ad.aspectRatio || requestedFormatRatios[index % requestedFormatRatios.length]);
          adsWithImages.push({ ...ad, imageUrl, referenceName: reference.name, userReference: userReference?.archetype || null });
        } catch (error: any) {
          const message = error?.message || 'Image generation failed';
          if (/429|rate limit|try again/i.test(message)) {
            await wait(15000);
            try {
              const imageUrl = await callCreattiaOpenAIImage(openAiKey, prompt, ad.aspectRatio || requestedFormatRatios[index % requestedFormatRatios.length]);
              adsWithImages.push({ ...ad, imageUrl, referenceName: reference.name, userReference: userReference?.archetype || null });
              continue;
            } catch (retryError: any) {
              adsWithImages.push({ ...ad, imageError: retryError?.message || message });
              continue;
            }
          }
          adsWithImages.push({ ...ad, imageError: message });
        }
      }
    } else {
      adsWithImages.push(...ads);
    }

    return res.status(200).json({
      sourceUrl: url,
      brandName,
      businessSummary,
      brandDna: parsed.brandDna || null,
      products: (Array.isArray(parsed.products) && parsed.products.length ? parsed.products : site.products || []).slice(0, 8),
      references: creattiaAdReferenceLibrary,
      userReferences: loadUserReferenceCatalog().map(({ id, archetype, industry, angle, ring, localPath }) => ({ id, archetype, industry, angle, ring, localPath })),
      ads: adsWithImages.length ? adsWithImages : Array.from({ length: requestedAds }, (_, index) => {
        const color = creattiaColorPresets[index % creattiaColorPresets.length];
        const aspectRatio = requestedFormatRatios[index % requestedFormatRatios.length];
        return {
        title: ['Tu producto, mejor contado', 'La razón para elegirte', 'Menos dudas, más compras', 'Una historia que convierte'][index % 4],
        subtitle: 'Concepto generado con IA para tu tienda.',
        cta: 'Ver más',
        aspectRatio,
        format: formatFromAspectRatio(aspectRatio),
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

  if (req.body?.action === 'creattia_generate' || req.body?.action === 'creattia_analyze') {
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
