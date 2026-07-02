import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44";
const READ_ONLY_DENY = new Set(['access_token']);

const META_DOMAINS = ['fbcdn.net', 'facebook.com', 'facebookmobi.com', 'cdninstagram.com', 'instagram.com', 'fb.com'];
function isMetaUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    return META_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch { return false; }
}

const supabase = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let tokenCache: { value: string; expiresAt: number } | null = null;
let pageTokensCache: { [pageId: string]: { value: string; expiresAt: number } } = {};

async function getMetaToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.value;
  if (!supabase) return '';
  const { data } = await supabase.from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
  const value = data?.value || '';
  tokenCache = { value, expiresAt: now + 5 * 60 * 1000 };
  return value;
}

function getBearer(req: VercelRequest): string {
  const header = req.headers.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

function normalizeGraphPath(path: unknown): string {
  const value = Array.isArray(path) ? path[0] : path;
  const clean = String(value || '').trim().replace(/^\/+/, '');
  if (!clean || clean.includes('://') || clean.includes('..') || clean.includes('\\')) return '';
  return clean;
}

async function getClientMetaTokens(clientId: string, bearer: string): Promise<{ userToken: string; pageToken: string }> {
  if (!clientId) return { userToken: '', pageToken: '' };
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data } = await supabaseUser
    .from('car_clients')
    .select('facebook_access_token, fb_page_access_token')
    .eq('id', clientId)
    .maybeSingle();
  return {
    userToken: data?.facebook_access_token || '',
    pageToken: data?.fb_page_access_token || '',
  };
}

async function handleGraphProxy(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const bearer = getBearer(req);
  if (!bearer) return res.status(401).json({ error: 'Missing Authorization header' });

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(bearer);
  if (authError || !user) return res.status(401).json({ error: 'Invalid auth token' });

  const graphPath = normalizeGraphPath(req.query.path);
  if (!graphPath) return res.status(400).json({ error: 'Invalid Meta path' });

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });

  // Un usuario solo puede consultar cuentas publicitarias (act_) de sus propios clientes.
  // El select corre con el token del usuario: RLS limita las filas (los admins ven todas).
  if (graphPath.startsWith('act_')) {
    const actId = graphPath.split('/')[0];
    const { data: myClients } = await supabaseUser.from('car_clients').select('meta_account_id');
    const allowed = (myClients || []).some((r: any) => String(r.meta_account_id || '').trim() === actId);
    if (!allowed) return res.status(403).json({ error: 'No autorizado para esta cuenta publicitaria' });
  }

  const clientIdRaw = Array.isArray(req.query.clientId) ? req.query.clientId[0] : req.query.clientId;
  const graphClientId = typeof clientIdRaw === 'string' ? clientIdRaw.trim() : '';
  const clientTokens = await getClientMetaTokens(graphClientId, bearer);

  // Paths me/* con el token de agencia listan activos de TODA la agencia: solo admins.
  // Con token propio del cliente (OAuth), me/* devuelve sus propios activos y está permitido.
  if ((graphPath === 'me' || graphPath.startsWith('me/')) && !clientTokens.userToken && !clientTokens.pageToken) {
    const { data: adminRow } = await supabaseUser
      .from('car_clients')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_admin', true)
      .maybeSingle();
    if (!adminRow) return res.status(403).json({ error: 'No autorizado' });
  }

  const token = graphPath.startsWith('act_')
    ? (clientTokens.userToken || await getMetaToken())
    : (clientTokens.pageToken || clientTokens.userToken || await getMetaToken());
  if (!token) return res.status(500).json({ error: 'No Meta token configured' });

  const graphUrl = new URL(`https://graph.facebook.com/v21.0/${graphPath}`);
  Object.entries(req.query).forEach(([key, raw]) => {
    if (key === 'action' || key === 'path' || key === 'clientId' || READ_ONLY_DENY.has(key)) return;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined) graphUrl.searchParams.set(key, String(value));
  });
  graphUrl.searchParams.set('access_token', token);

  try {
    const metaRes = await fetch(graphUrl.toString());
    const data = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok || data?.error) {
      return res.status(metaRes.ok ? 502 : metaRes.status).json({
        error: data?.error?.message || `Meta API error ${metaRes.status}`,
        metaError: data?.error || null,
      });
    }
    // Las URLs de paging de Meta incluyen el access_token del servidor: redactarlo
    // antes de responder. El cliente pagina con paging.cursors.after vía este proxy.
    if (data?.paging) {
      for (const key of ['next', 'previous']) {
        if (typeof data.paging[key] === 'string') {
          data.paging[key] = data.paging[key].replace(/access_token=[^&]+/g, 'access_token=redacted');
        }
      }
    }
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'Meta API request failed' });
  }
}

async function getPageToken(pageId: string, systemToken: string): Promise<string | null> {
  const now = Date.now();
  if (pageTokensCache[pageId] && pageTokensCache[pageId].expiresAt > now) {
    return pageTokensCache[pageId].value;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${systemToken}&limit=100`);
    if (res.ok) {
      const data = await res.json();
      const page = (data.data || []).find((p: any) => String(p.id) === String(pageId));
      if (page && page.access_token) {
        pageTokensCache[pageId] = { value: page.access_token, expiresAt: now + 15 * 60 * 1000 };
        return page.access_token;
      }
    }
  } catch (err) {
    console.error("Error fetching page token:", err);
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { adId, creativeId, videoId, action, url, filename, clientId } = req.query;

  if (action === 'graph') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return handleGraphProxy(req, res);
  }

  if (action === 'download') {
    if (!url || typeof url !== 'string' || !isMetaUrl(url)) {
      return res.status(400).json({ error: 'url must be a valid Meta/Facebook CDN URL' });
    }
    try {
      const mediaRes = await fetch(url);
      if (!mediaRes.ok) {
        return res.status(mediaRes.status).json({ error: `Failed to fetch media: ${mediaRes.statusText}` });
      }
      const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream';
      const contentLength = mediaRes.headers.get('content-length');

      const finalFilename = typeof filename === 'string' ? filename : 'download.mp4';
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalFilename)}"`);
      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (!mediaRes.body) {
        return res.status(500).json({ error: 'No media body returned' });
      }

      const arrayBuffer = await mediaRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return res.status(200).send(buffer);
    } catch (error: any) {
      console.error("Download proxy error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (!adId && !creativeId && !videoId) {
    return res.status(400).json({ error: 'adId, creativeId, videoId, or action=download is required' });
  }

  try {
    let clientToken: string | null = null;
    let dbPageToken: string | null = null;
    if (clientId && typeof clientId === 'string' && supabase) {
      const { data: clientData } = await supabase
        .from('car_clients')
        .select('facebook_access_token, fb_page_access_token')
        .eq('id', clientId)
        .maybeSingle();
      clientToken = clientData?.facebook_access_token || null;
      dbPageToken = clientData?.fb_page_access_token || null;
    }

    const token = clientToken || await getMetaToken();
    if (!token) return res.status(500).json({ error: 'No Meta token configured' });

    const base = 'https://graph.facebook.com/v21.0';

    // Helper function to resolve video source
    async function resolveVideoSource(vidId: string, useToken?: string) {
      const activeToken = useToken || token;
      const videoRes = await fetch(
        `${base}/${vidId}?fields=source,picture,format&access_token=${activeToken}`
      );
      if (videoRes.ok) {
        const data = await videoRes.json();
        let bestThumbnail = data.picture || null;
        let embedHtml: string | null = null;
        if (Array.isArray(data.format)) {
          const sorted = [...data.format].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
          if (sorted[0]?.picture) bestThumbnail = sorted[0].picture;
          const withEmbed = sorted.find((f: any) => f.embed_html);
          if (withEmbed) embedHtml = withEmbed.embed_html;
        }
        return { source: data.source || null, picture: bestThumbnail, embedHtml };
      }
      return null;
    }

    async function resolveAdImageHashes(accountId: string | null | undefined, hashes: Array<string | null | undefined>) {
      const cleanHashes = Array.from(new Set(hashes.filter(Boolean).map(String)));
      const hashToUrlMap: Record<string, string> = {};
      if (!accountId || cleanHashes.length === 0) return hashToUrlMap;
      try {
        const imagesRes = await fetch(
          `${base}/act_${accountId}/adimages?hashes=${encodeURIComponent(JSON.stringify(cleanHashes))}&fields=url,permalink_url,hash,width,height&access_token=${token}`
        );
        if (imagesRes.ok) {
          const imagesData = await imagesRes.json();
          (imagesData?.data || []).forEach((img: any) => {
            if (img.hash && (img.url || img.permalink_url)) {
              hashToUrlMap[img.hash] = img.url || img.permalink_url;
            }
          });
        }
      } catch (err) {
        console.error("Error resolving ad image hashes:", err);
      }
      return hashToUrlMap;
    }

    const firstUsableUrl = (...urls: Array<string | null | undefined>): string | null =>
      urls.find((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u)) || null;

    let activeToken = dbPageToken || token;
    let pageToken: string | null = null;
    let creativeData: any = null;

    // Fetch creative spec first (if creativeId is provided) so we can extract Page ID & token
    if (creativeId && typeof creativeId === 'string') {
      const creativeRes = await fetch(
        `${base}/${creativeId}?fields=id,video_id,image_hash,object_story_spec,asset_feed_spec,object_type,image_url,thumbnail_url,account_id,effective_object_story_id,effective_instagram_story_id,object_story_id&access_token=${token}`
      );

      if (creativeRes.ok) {
        creativeData = await creativeRes.json();
        const pageId =
          creativeData.object_story_spec?.page_id ||
          (creativeData.effective_object_story_id ? creativeData.effective_object_story_id.split('_')[0] : null) ||
          (creativeData.object_story_id ? creativeData.object_story_id.split('_')[0] : null);

        pageToken = dbPageToken || (pageId ? await getPageToken(pageId, token) : null);
        if (pageToken) {
          activeToken = pageToken;
        }
      }
    }

    // 1. If videoId is provided directly, resolve it
    if (videoId && typeof videoId === 'string') {
      const resolved = await resolveVideoSource(videoId, activeToken);
      if (resolved) {
        if (resolved.source) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.status(200).json({
            type: 'video_source',
            source: resolved.source,
            picture: resolved.picture,
          });
        } else if (resolved.embedHtml) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.status(200).json({
            type: 'ad_preview',
            embed_html: resolved.embedHtml,
            picture: resolved.picture,
          });
        }
      }
    }

    // 2. Process creative specs if creative data was retrieved
    if (creativeData) {
      // 2a. Check if it is a carousel
      const childAttachments = creativeData.object_story_spec?.link_data?.child_attachments;
      if (Array.isArray(childAttachments) && childAttachments.length > 0) {
        const accountId = creativeData.account_id;
        const hashToUrlMap = await resolveAdImageHashes(accountId, childAttachments.map((c: any) => c.image_hash));

        const cards = await Promise.all(
          childAttachments.map(async (att: any) => {
            if (att.video_id) {
              const resolvedVideo = await resolveVideoSource(att.video_id, activeToken);
              if (resolvedVideo && resolvedVideo.source) {
                return {
                  url: resolvedVideo.picture || hashToUrlMap[att.image_hash] || att.picture || '',
                  isVideo: true,
                  videoSrc: resolvedVideo.source,
                  name: att.name || '',
                };
              }
            }
            const cardImageUrl = firstUsableUrl(
              hashToUrlMap[att.image_hash],
              att.picture,
              att.image_url,
              att.thumbnail_url,
              att.media?.image?.src
            );
            return {
              url: cardImageUrl || '',
              isVideo: false,
              name: att.name || '',
            };
          })
        );

        res.setHeader('Cache-Control', 'public, max-age=1800');
        return res.status(200).json({
          type: 'carousel',
          cards,
        });
      }

      // 2b. Check if single video creative
      const resolvedVideoId =
        creativeData.object_story_spec?.video_data?.video_id ||
        creativeData.object_story_spec?.link_data?.video_id ||
        creativeData.asset_feed_spec?.videos?.[0]?.video_id ||
        creativeData.video_id;

      if (resolvedVideoId) {
        const resolved = await resolveVideoSource(resolvedVideoId, activeToken);
        if (resolved) {
          if (resolved.source) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.status(200).json({
              type: 'video_source',
              source: resolved.source,
              picture: resolved.picture || creativeData.image_url || creativeData.thumbnail_url || null,
            });
          } else if (resolved.embedHtml) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.status(200).json({
              type: 'ad_preview',
              embed_html: resolved.embedHtml,
              picture: resolved.picture || creativeData.image_url || creativeData.thumbnail_url || null,
            });
          }
        }
      }

      // 2b-1. Resolve static ad images by image_hash before falling back to low-res thumbnail_url.
      const linkData = creativeData.object_story_spec?.link_data;
      const photoData = creativeData.object_story_spec?.photo_data;
      const templateImages = Array.isArray(creativeData.asset_feed_spec?.images)
        ? creativeData.asset_feed_spec.images
        : [];
      const staticImageHashes = [
        creativeData.image_hash,
        linkData?.image_hash,
        photoData?.image_hash,
        ...templateImages.map((img: any) => img.hash || img.image_hash),
      ];
      const staticHashMap = await resolveAdImageHashes(creativeData.account_id, staticImageHashes);
      const hashUrl = (hash: any) => hash ? staticHashMap[String(hash)] : undefined;
      const hashedImageUrl = firstUsableUrl(
        hashUrl(creativeData.image_hash),
        hashUrl(linkData?.image_hash),
        hashUrl(photoData?.image_hash),
        ...templateImages.map((img: any) => hashUrl(img.hash || img.image_hash) || img.url || img.permalink_url),
        linkData?.picture,
        photoData?.url
      );
      if (hashedImageUrl) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.status(200).json({
          type: 'image',
          url: hashedImageUrl,
        });
      }

      // 2b-2. Try resolving via effective_instagram_story_id (Instagram Reels and Posts)
      const instagramStoryId = creativeData.effective_instagram_story_id;
      if (instagramStoryId) {
        try {
          const igRes = await fetch(
            `${base}/${instagramStoryId}?fields=media_url,media_type,thumbnail_url,permalink,children{media_url,media_type,thumbnail_url}&access_token=${activeToken}`
          );
          if (igRes.ok) {
            const igData = await igRes.json();
            if (igData.media_type === 'VIDEO') {
              res.setHeader('Cache-Control', 'public, max-age=3600');
              return res.status(200).json({
                type: 'video_source',
                source: igData.media_url,
                picture: igData.thumbnail_url || creativeData.image_url || null,
              });
            } else if (igData.media_type === 'CAROUSEL_ALBUM' && igData.children?.data) {
              const cards = igData.children.data.map((c: any) => ({
                url: c.media_type === 'VIDEO' ? (c.thumbnail_url || c.media_url) : c.media_url,
                isVideo: c.media_type === 'VIDEO',
                videoSrc: c.media_type === 'VIDEO' ? c.media_url : undefined,
              }));
              res.setHeader('Cache-Control', 'public, max-age=1800');
              return res.status(200).json({
                type: 'carousel',
                cards,
              });
            } else if (igData.media_url) {
              res.setHeader('Cache-Control', 'public, max-age=3600');
              return res.status(200).json({
                type: 'image',
                url: igData.media_url,
              });
            }
          }
        } catch (err) {
          console.error(`Error resolving effective_instagram_story_id ${instagramStoryId}:`, err);
        }
      }

      // 2b-3. Try resolving via effective_object_story_id or object_story_id (e.g. Facebook Reels or organic posts used in Ads)
      const storyId = creativeData.effective_object_story_id || creativeData.object_story_id;
      if (storyId) {
        try {
          const postRes = await fetch(
            `${base}/${storyId}?fields=attachments,message,full_picture&access_token=${activeToken}`
          );
          if (postRes.ok) {
            const postData = await postRes.json();
            
            // Check attachments for video or image
            const attachments = postData.attachments?.data;
            if (Array.isArray(attachments) && attachments.length > 0) {
              const first = attachments[0];
              
              // If it is a video attachment
              if (first.target?.id && first.type?.includes('video')) {
                const resolved = await resolveVideoSource(first.target.id, activeToken);
                if (resolved) {
                  if (resolved.source) {
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                    return res.status(200).json({
                      type: 'video_source',
                      source: resolved.source,
                      picture: resolved.picture || first.media?.image?.src || postData.full_picture || creativeData.image_url || null,
                    });
                  } else if (resolved.embedHtml) {
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                    return res.status(200).json({
                      type: 'ad_preview',
                      embed_html: resolved.embedHtml,
                      picture: resolved.picture || first.media?.image?.src || postData.full_picture || creativeData.image_url || null,
                    });
                  }
                }
              }
              
              // If it's a carousel attachment (subattachments)
              const subAttachments = first.subattachments?.data;
              if (Array.isArray(subAttachments) && subAttachments.length > 0) {
                const cards = await Promise.all(
                  subAttachments.map(async (sub: any) => {
                    if (sub.target?.id && (sub.type?.includes('video') || sub.type === 'video_inline')) {
                      const resolvedVideo = await resolveVideoSource(sub.target.id, activeToken);
                      if (resolvedVideo && resolvedVideo.source) {
                        return {
                          url: resolvedVideo.picture || sub.media?.image?.src || '',
                          isVideo: true,
                          videoSrc: resolvedVideo.source,
                          name: sub.title || '',
                        };
                      }
                    }
                    return {
                      url: sub.media?.image?.src || '',
                      isVideo: false,
                      name: sub.title || '',
                    };
                  })
                );
                
                res.setHeader('Cache-Control', 'public, max-age=1800');
                return res.status(200).json({
                  type: 'carousel',
                  cards,
                });
              }

              // If it's a single image in attachment
              if (first.media?.image?.src) {
                res.setHeader('Cache-Control', 'public, max-age=3600');
                return res.status(200).json({
                  type: 'image',
                  url: first.media.image.src,
                });
              }
            }

            // Fallback to post full picture
            if (postData.full_picture || postData.picture) {
              res.setHeader('Cache-Control', 'public, max-age=3600');
              return res.status(200).json({
                type: 'image',
                url: postData.full_picture || postData.picture,
              });
            }
          }
        } catch (err) {
          console.error(`Error resolving effective_object_story_id ${storyId}:`, err);
        }
      }

    }

    // 3. Fallback to Meta Ad Previews API (on creative ID first)
    if (creativeId && typeof creativeId === 'string') {
      const previewRes = await fetch(
        `${base}/${creativeId}/previews?ad_format=MOBILE_FEED_STANDARD&access_token=${activeToken}`
      );

      if (previewRes.ok) {
        const previewData = await previewRes.json();
        const previewHtml = previewData?.data?.[0]?.body;
        if (previewHtml) {
          res.setHeader('Cache-Control', 'public, max-age=1800');
          return res.status(200).json({
            type: 'ad_preview',
            embed_html: previewHtml,
          });
        }
      }
    }

    // 4. Fallback to Meta Ad Previews API (on ad ID)
    if (adId && typeof adId === 'string') {
      const previewRes = await fetch(
        `${base}/${adId}/previews?ad_format=MOBILE_FEED_STANDARD&access_token=${activeToken}`
      );

      if (previewRes.ok) {
        const previewData = await previewRes.json();
        const previewHtml = previewData?.data?.[0]?.body;
        if (previewHtml) {
          res.setHeader('Cache-Control', 'public, max-age=1800');
          return res.status(200).json({
            type: 'ad_preview',
            embed_html: previewHtml,
          });
        }
      }
    }

    // 5. Last-resort static creative image. Avoid thumbnail_url here because Meta often
    // returns 64px thumbnails that look broken when opened in the detail panel.
    if (creativeData?.image_url) {
      res.setHeader('Cache-Control', 'public, max-age=1800');
      return res.status(200).json({
        type: 'image',
        url: creativeData.image_url,
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ type: 'none' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
