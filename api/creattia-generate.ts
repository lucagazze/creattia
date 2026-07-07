import type { VercelRequest, VercelResponse } from '@vercel/node';

declare const process: any;

type GeneratedAd = {
  title: string;
  subtitle: string;
  cta: string;
  format: 'feed' | 'story';
  color?: string;
};

const colorPresets = [
  'from-[#2b160e] via-[#7a4327] to-[#c38b5d]',
  'from-[#1d120d] via-[#5d321f] to-[#9c7048]',
  'from-[#321c11] via-[#805033] to-[#d6a56f]',
  'from-[#e9e3d8] via-[#9f7559] to-[#4b2a1e]',
];

function normalizeUrl(input: string) {
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

function stripHtml(html: string) {
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

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('La IA no devolvió JSON');
  return JSON.parse(source.slice(start, end + 1));
}

async function callGemini(key: string, systemPrompt: string, userPrompt: unknown) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.75,
        maxOutputTokens: 1700,
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

async function callOpenAI(key: string, systemPrompt: string, userPrompt: unknown) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.75,
      max_tokens: 1700,
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

async function fetchSite(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'CreattiaBot/1.0 (+https://creattia.vercel.app)',
      },
    });
    if (!response.ok) throw new Error(`No pudimos leer la tienda (${response.status})`);
    const html = await response.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
    const text = stripHtml(html).slice(0, 14000);
    return { title, description, text };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const geminiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
    if (!geminiKey && !openAiKey) {
      return res.status(503).json({
        error: 'AI_NOT_CONFIGURED',
        detail: 'Falta configurar GOOGLE_AI_API_KEY/GEMINI_API_KEY u OPENAI_API_KEY en Vercel para que Creattia genere campañas reales.',
      });
    }

    const url = normalizeUrl(String(req.body?.url || ''));
    const site = await fetchSite(url);
    const systemPrompt = [
      'Sos Creattia, un agente experto en performance creative para ecommerce.',
      'Analizás una tienda y devolvés conceptos de ads en español rioplatense, listos para renderizar.',
      'Respondé únicamente JSON válido. Sin markdown.',
    ].join('\n');

    const userPrompt = {
      task: 'Generá una campaña de prueba con 4 ads para Meta/Instagram a partir de esta tienda.',
      url,
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
          { title: 'string max 52 chars', subtitle: 'string max 75 chars', cta: 'string max 58 chars', format: 'feed|story' },
        ],
        products: [
          { name: 'string', tag: 'string', price: 'string', insight: 'string' },
        ],
      },
    };

    let raw = '';
    try {
      raw = geminiKey ? await callGemini(geminiKey, systemPrompt, userPrompt) : await callOpenAI(openAiKey, systemPrompt, userPrompt);
    } catch (primaryError: any) {
      if (!geminiKey || !openAiKey) throw primaryError;
      raw = await callOpenAI(openAiKey, systemPrompt, userPrompt);
    }

    const parsed = extractJson(raw);
    const ads = (Array.isArray(parsed.ads) ? parsed.ads : []).slice(0, 4).map((ad: GeneratedAd, index: number) => ({
      title: String(ad.title || 'Una pieza que vende mejor').slice(0, 80),
      subtitle: String(ad.subtitle || 'Concepto generado con IA para tu tienda.').slice(0, 110),
      cta: String(ad.cta || 'Descubrí la diferencia').slice(0, 90),
      format: ad.format === 'story' ? 'story' : 'feed',
      color: colorPresets[index % colorPresets.length],
    }));

    return res.status(200).json({
      sourceUrl: url,
      brandName: parsed.brandName || site.title || 'Tu marca',
      businessSummary: parsed.businessSummary || site.description || '',
      brandDna: parsed.brandDna || null,
      products: Array.isArray(parsed.products) ? parsed.products.slice(0, 3) : [],
      ads: ads.length ? ads : colorPresets.map((color, index) => ({
        title: ['Tu producto, mejor contado', 'La razón para elegirte', 'Menos dudas, más compras', 'Una historia que convierte'][index],
        subtitle: 'Concepto generado con IA para tu tienda.',
        cta: 'Ver más',
        format: index === 3 ? 'story' : 'feed',
        color,
      })),
    });
  } catch (error: any) {
    return res.status(400).json({
      error: 'CREATTIA_GENERATE_FAILED',
      detail: error?.message || 'No pudimos generar la campaña.',
    });
  }
}
