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
  const { adId, creativeId, videoId } = req.query;

  if (!adId && !creativeId && !videoId) {
    return res.status(400).json({ error: 'adId, creativeId or videoId required' });
  }

  try {
    const token = await getMetaToken();
    if (!token) return res.status(500).json({ error: 'No Meta token configured' });

    const base = 'https://graph.facebook.com/v21.0';

    // Strategy 1: Use Meta Ad Previews API on the Creative ID (most reliable)
    if (creativeId && typeof creativeId === 'string') {
      const previewRes = await fetch(
        `${base}/${creativeId}/previews?ad_format=MOBILE_FEED_STANDARD&access_token=${token}`
      );

      if (previewRes.ok) {
        const previewData = await previewRes.json();
        const previewHtml = previewData?.data?.[0]?.body;
        if (previewHtml) {
          res.setHeader('Cache-Control', 'public, max-age=1800');
          return res.status(200).json({
            source: null,
            embed_html: previewHtml,
            type: 'ad_preview',
          });
        }
      }
    }

    // Strategy 1b: Use Meta Ad Previews API on the Ad ID
    if (adId && typeof adId === 'string') {
      const previewRes = await fetch(
        `${base}/${adId}/previews?ad_format=MOBILE_FEED_STANDARD&access_token=${token}`
      );

      if (previewRes.ok) {
        const previewData = await previewRes.json();
        const previewHtml = previewData?.data?.[0]?.body;
        if (previewHtml) {
          res.setHeader('Cache-Control', 'public, max-age=1800');
          return res.status(200).json({
            source: null,
            embed_html: previewHtml,
            type: 'ad_preview',
          });
        }
      }
    }

    // Strategy 2: Try video source URL (may 403 on some tokens)
    if (videoId && typeof videoId === 'string') {
      const videoRes = await fetch(
        `${base}/${videoId}?fields=source,picture,format&access_token=${token}`
      );

      if (videoRes.ok) {
        const data = await videoRes.json();
        let bestThumbnail = data.picture || null;
        if (Array.isArray(data.format)) {
          const sorted = [...data.format].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
          if (sorted[0]?.picture) bestThumbnail = sorted[0].picture;
        }

        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.status(200).json({
          source: data.source || null,
          picture: bestThumbnail,
          embed_html: null,
          type: 'video_source',
        });
      }
    }

    // No preview available
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ source: null, embed_html: null, type: 'none' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
