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

    // Helper function to resolve video source
    async function resolveVideoSource(vidId: string) {
      const videoRes = await fetch(
        `${base}/${vidId}?fields=source,picture,format&access_token=${token}`
      );
      if (videoRes.ok) {
        const data = await videoRes.json();
        let bestThumbnail = data.picture || null;
        if (Array.isArray(data.format)) {
          const sorted = [...data.format].sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
          if (sorted[0]?.picture) bestThumbnail = sorted[0].picture;
        }
        return { source: data.source || null, picture: bestThumbnail };
      }
      return null;
    }

    // 1. If videoId is provided directly, resolve it
    if (videoId && typeof videoId === 'string') {
      const resolved = await resolveVideoSource(videoId);
      if (resolved && resolved.source) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.status(200).json({
          type: 'video_source',
          source: resolved.source,
          picture: resolved.picture,
        });
      }
    }

    // 2. If creativeId is provided, query creative specs
    if (creativeId && typeof creativeId === 'string') {
      const creativeRes = await fetch(
        `${base}/${creativeId}?fields=video_id,object_story_spec,asset_feed_spec,object_type,image_url,thumbnail_url,account_id,effective_object_story_id,effective_instagram_story_id&access_token=${token}`
      );

      if (creativeRes.ok) {
        const creativeData = await creativeRes.json();

        // 2a. Check if it is a carousel
        const childAttachments = creativeData.object_story_spec?.link_data?.child_attachments;
        if (Array.isArray(childAttachments) && childAttachments.length > 0) {
          const accountId = creativeData.account_id;
          const hashToUrlMap: Record<string, string> = {};

          if (accountId) {
            const hashes = childAttachments.map((c: any) => c.image_hash).filter(Boolean);
            if (hashes.length > 0) {
              try {
                const imagesRes = await fetch(
                  `${base}/act_${accountId}/adimages?hashes=${JSON.stringify(hashes)}&fields=url,hash&access_token=${token}`
                );
                if (imagesRes.ok) {
                  const imagesData = await imagesRes.json();
                  (imagesData?.data || []).forEach((img: any) => {
                    hashToUrlMap[img.hash] = img.url;
                  });
                }
              } catch (err) {
                console.error("Error resolving carousel image hashes:", err);
              }
            }
          }

          const cards = await Promise.all(
            childAttachments.map(async (att: any) => {
              if (att.video_id) {
                const resolvedVideo = await resolveVideoSource(att.video_id);
                if (resolvedVideo && resolvedVideo.source) {
                  return {
                    url: resolvedVideo.picture || hashToUrlMap[att.image_hash] || att.picture || '',
                    isVideo: true,
                    videoSrc: resolvedVideo.source,
                    name: att.name || '',
                  };
                }
              }
              return {
                url: hashToUrlMap[att.image_hash] || att.picture || '',
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
          creativeData.asset_feed_spec?.videos?.[0]?.video_id ||
          creativeData.video_id;

        if (resolvedVideoId) {
          const resolved = await resolveVideoSource(resolvedVideoId);
          if (resolved && resolved.source) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.status(200).json({
              type: 'video_source',
              source: resolved.source,
              picture: resolved.picture || creativeData.image_url || creativeData.thumbnail_url || null,
            });
          }
        }

        // 2b-2. Try resolving via effective_instagram_story_id (Instagram Reels and Posts)
        const instagramStoryId = creativeData.effective_instagram_story_id;
        if (instagramStoryId) {
          try {
            const igRes = await fetch(
              `${base}/${instagramStoryId}?fields=media_url,media_type,thumbnail_url,permalink,children{media_url,media_type,thumbnail_url}&access_token=${token}`
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

        // 2b-3. Try resolving via effective_object_story_id (e.g. Facebook Reels or organic posts used in Ads)
        const storyId = creativeData.effective_object_story_id;
        if (storyId) {
          try {
            const postRes = await fetch(
              `${base}/${storyId}?fields=attachments,source,type,object_id,message,full_picture&access_token=${token}`
            );
            if (postRes.ok) {
              const postData = await postRes.json();
              
              // If the post has a direct playable video source (common for reels / video posts)
              if (postData.source) {
                res.setHeader('Cache-Control', 'public, max-age=3600');
                return res.status(200).json({
                  type: 'video_source',
                  source: postData.source,
                  picture: postData.full_picture || postData.picture || creativeData.image_url || creativeData.thumbnail_url || null,
                });
              }

              // Extra check if object_id points to a video
              if (postData.object_id && (postData.type === 'video' || postData.attachments?.data?.[0]?.type?.includes('video'))) {
                const resolved = await resolveVideoSource(postData.object_id);
                if (resolved && resolved.source) {
                  res.setHeader('Cache-Control', 'public, max-age=3600');
                  return res.status(200).json({
                    type: 'video_source',
                    source: resolved.source,
                    picture: resolved.picture || postData.full_picture || creativeData.image_url || null,
                  });
                }
              }
              
              // Check attachments for video or image
              const attachments = postData.attachments?.data;
              if (Array.isArray(attachments) && attachments.length > 0) {
                const first = attachments[0];
                
                // If it is a video attachment
                if (first.target?.id && (first.type?.includes('video') || postData.type === 'video')) {
                  const resolved = await resolveVideoSource(first.target.id);
                  if (resolved && resolved.source) {
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                    return res.status(200).json({
                      type: 'video_source',
                      source: resolved.source,
                      picture: resolved.picture || first.media?.image?.src || postData.full_picture || creativeData.image_url || null,
                    });
                  }
                }
                
                // If it's a carousel attachment (subattachments)
                const subAttachments = first.subattachments?.data;
                if (Array.isArray(subAttachments) && subAttachments.length > 0) {
                  const cards = await Promise.all(
                    subAttachments.map(async (sub: any) => {
                      if (sub.target?.id && (sub.type?.includes('video') || sub.type === 'video_inline')) {
                        const resolvedVideo = await resolveVideoSource(sub.target.id);
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

        // 2c. Check if single image creative
        const imageUrl = creativeData.image_url || creativeData.thumbnail_url;
        if (imageUrl) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.status(200).json({
            type: 'image',
            url: imageUrl,
          });
        }
      }
    }

    // 3. Fallback to Meta Ad Previews API (on creative ID first)
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
            type: 'ad_preview',
            embed_html: previewHtml,
          });
        }
      }
    }

    // 4. Fallback to Meta Ad Previews API (on ad ID)
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
            type: 'ad_preview',
            embed_html: previewHtml,
          });
        }
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ type: 'none' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
