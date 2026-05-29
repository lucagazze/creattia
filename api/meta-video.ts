import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let tokenCache: { value: string; expiresAt: number } | null = null;

async function getMetaToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.value;
  const { data } = await supabase.from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
  const value = data?.value || '';
  tokenCache = { value, expiresAt: now + 5 * 60 * 1000 };
  return value;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { videoId } = req.query;
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'videoId required' });
  }

  try {
    const token = await getMetaToken();
    if (!token) return res.status(500).json({ error: 'No Meta token configured' });

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${videoId}?fields=source,picture,embed_html,embeddable,format&access_token=${token}`
    );

    if (!metaRes.ok) {
      const err = await metaRes.text();
      return res.status(metaRes.status).json({ error: `Meta API error: ${err}` });
    }

    const data = await metaRes.json();

    // Try to extract highest quality thumbnail from format array
    let bestThumbnail = data.picture || null;
    if (Array.isArray(data.format)) {
      const sorted = [...data.format].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
      if (sorted[0]?.picture) bestThumbnail = sorted[0].picture;
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({
      source: data.source || null,
      picture: bestThumbnail,
      embed_html: data.embed_html || null,
      embeddable: data.embeddable || false,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
