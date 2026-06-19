import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://czocbnyoenjbpxmcqobn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const TIKTOK_CONTENT_CLIENT_KEY = process.env.TIKTOK_CONTENT_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || '';
const TIKTOK_CONTENT_CLIENT_SECRET = process.env.TIKTOK_CONTENT_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || '';
const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

type SocialChannel = 'instagram' | 'facebook' | 'tiktok' | 'youtube';

const postGraph = async (url: string, body: Record<string, any>) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.error) {
    throw new Error(json?.error?.message || `Graph API error ${response.status}`);
  }
  return json;
};

const getGraph = async (url: string) => {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.error) {
    throw new Error(json?.error?.message || `Graph API error ${response.status}`);
  }
  return json;
};

const validateSocialVideoOwnership = (clientId: string, videoUrl: string, videoPath: string | null) => {
  if (!videoPath) throw new Error('videoPath requerido para publicar de forma segura.');
  const pathParts = videoPath.split('/').filter(Boolean);
  if (pathParts.length < 3 || pathParts[1] !== clientId) {
    throw new Error('El video no pertenece al cliente seleccionado.');
  }
  const decodedPathname = decodeURIComponent(new URL(videoUrl).pathname);
  const expectedPath = `/storage/v1/object/public/car-social-videos/${videoPath}`;
  if (!decodedPathname.endsWith(expectedPath)) {
    throw new Error('La URL pública no coincide con el archivo validado del cliente.');
  }
};

async function publishFacebookVideo(pageId: string, pageToken: string, videoUrl: string, caption: string) {
  const json = await postGraph(`https://graph.facebook.com/v21.0/${pageId}/videos`, {
    file_url: videoUrl,
    description: caption,
    access_token: pageToken
  });
  const videoId = json?.id || '';
  return {
    status: 'published',
    id: videoId,
    url: videoId ? `https://www.facebook.com/${videoId}` : undefined,
    message: 'Video enviado a la página de Facebook.'
  };
}

async function publishInstagramReel(igBusinessId: string, pageToken: string, videoUrl: string, caption: string) {
  const container = await postGraph(`https://graph.facebook.com/v21.0/${igBusinessId}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: true,
    access_token: pageToken
  });
  const creationId = container?.id;
  if (!creationId) throw new Error('Instagram no devolvió creation_id.');

  let statusCode = '';
  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, i === 0 ? 2500 : 5000));
    const status = await getGraph(`https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(pageToken)}`);
    statusCode = status?.status_code || '';
    if (statusCode === 'FINISHED') break;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') throw new Error(`Instagram no pudo procesar el video (${statusCode}).`);
  }

  if (statusCode !== 'FINISHED') {
    return {
      status: 'processing',
      id: creationId,
      message: 'Instagram recibió el video y sigue procesándolo.'
    };
  }

  const published = await postGraph(`https://graph.facebook.com/v21.0/${igBusinessId}/media_publish`, {
    creation_id: creationId,
    access_token: pageToken
  });
  return {
    status: 'published',
    id: published?.id || creationId,
    url: published?.id ? `https://www.instagram.com/p/${published.id}/` : undefined,
    message: 'Reel enviado a Instagram.'
  };
}

async function getValidTiktokContentToken(clientId: string, supabase: any): Promise<string | null> {
  const { data: client } = await supabase
    .from('car_clients')
    .select('tiktok_content_access_token, tiktok_content_refresh_token, tiktok_content_expiration')
    .eq('id', clientId)
    .maybeSingle();

  if (!client?.tiktok_content_access_token) return null;
  const expiration = client.tiktok_content_expiration ? new Date(client.tiktok_content_expiration).getTime() : 0;
  if (expiration && Date.now() < expiration - 30 * 60 * 1000) return client.tiktok_content_access_token;
  if (!client.tiktok_content_refresh_token || !TIKTOK_CONTENT_CLIENT_KEY || !TIKTOK_CONTENT_CLIENT_SECRET) return client.tiktok_content_access_token;

  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CONTENT_CLIENT_KEY,
        client_secret: TIKTOK_CONTENT_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: client.tiktok_content_refresh_token
      }).toString()
    });
    const json = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || json.error) return client.tiktok_content_access_token;
    await supabase.from('car_clients').update({
      tiktok_content_access_token: json.access_token,
      tiktok_content_refresh_token: json.refresh_token || client.tiktok_content_refresh_token,
      tiktok_content_expiration: new Date(Date.now() + Number(json.expires_in || 86400) * 1000).toISOString()
    }).eq('id', clientId);
    return json.access_token;
  } catch {
    return client.tiktok_content_access_token;
  }
}

async function publishTiktokInboxVideo(accessToken: string, videoUrl: string) {
  const sourceRes = await fetch(videoUrl);
  if (!sourceRes.ok) throw new Error(`No se pudo leer el video para TikTok (${sourceRes.status}).`);
  const contentType = sourceRes.headers.get('content-type') || 'video/mp4';
  const videoBuffer = Buffer.from(await sourceRes.arrayBuffer());
  const videoSize = videoBuffer.byteLength;
  if (!videoSize) throw new Error('El video está vacío.');

  const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1
      }
    })
  });
  const initJson = await initRes.json().catch(() => ({}));
  if (!initRes.ok || initJson?.error) {
    throw new Error(initJson?.error?.message || initJson?.error_description || `TikTok init error ${initRes.status}`);
  }

  const uploadUrl = initJson?.data?.upload_url;
  const publishId = initJson?.data?.publish_id;
  if (!uploadUrl) throw new Error('TikTok no devolvió upload_url.');

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType.includes('video/') ? contentType : 'video/mp4',
      'Content-Length': String(videoSize),
      'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`
    },
    body: videoBuffer
  });
  if (!uploadRes.ok) throw new Error(`TikTok upload error ${uploadRes.status}: ${(await uploadRes.text()).slice(0, 160)}`);
  return {
    status: 'processing',
    id: publishId,
    message: 'Video enviado a TikTok. El usuario debe revisar y publicar desde TikTok.'
  };
}

async function getValidYoutubeToken(clientId: string, supabase: any) {
  const { data: client } = await supabase
    .from('car_clients')
    .select('youtube_access_token, youtube_refresh_token, youtube_expiration')
    .eq('id', clientId)
    .maybeSingle();

  if (!client?.youtube_access_token) return null;
  const expiration = client.youtube_expiration ? new Date(client.youtube_expiration).getTime() : 0;
  if (!expiration || expiration > Date.now() + 120000) return client.youtube_access_token;
  if (!client.youtube_refresh_token || !YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) return client.youtube_access_token;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        refresh_token: client.youtube_refresh_token,
        grant_type: 'refresh_token'
      }).toString()
    });
    const json = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !json.access_token) return client.youtube_access_token;
    await supabase.from('car_clients').update({
      youtube_access_token: json.access_token,
      youtube_expiration: new Date(Date.now() + Number(json.expires_in || 3600) * 1000).toISOString()
    }).eq('id', clientId);
    return json.access_token;
  } catch {
    return client.youtube_access_token;
  }
}

async function publishYoutubeShort(clientId: string, supabase: any, videoUrl: string, caption: string) {
  const accessToken = await getValidYoutubeToken(clientId, supabase);
  if (!accessToken) return { status: 'missing_connection', message: 'Falta conectar YouTube desde Integraciones.' };

  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error('No se pudo descargar el video para YouTube.');
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const metadata = {
    snippet: { title: caption.slice(0, 90) || 'Short', description: caption, categoryId: '22' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
  };
  const boundary = `algoritmia_${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: video/*\r\n\r\n`),
    videoBuffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const uploadRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length)
    },
    body
  });
  const json = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || json?.error) throw new Error(json?.error?.message || 'YouTube rechazó la publicación.');
  return {
    status: 'published',
    id: json.id,
    url: json.id ? `https://www.youtube.com/shorts/${json.id}` : undefined,
    message: 'Short enviado a YouTube.'
  };
}

const buildAccountSnapshot = (clientId: string, client: any, channels: SocialChannel[]) => ({
  client: {
    id: clientId,
    business_name: client.business_name || client.email || ''
  },
  requested_channels: channels,
  accounts: {
    instagram: client.ig_business_id ? {
      platform: 'instagram',
      account_id: client.ig_business_id,
      username: client.ig_username || '',
      page_id: client.fb_page_id || '',
      page_name: client.fb_page_name || ''
    } : null,
    facebook: client.fb_page_id ? {
      platform: 'facebook',
      page_id: client.fb_page_id,
      page_name: client.fb_page_name || ''
    } : null,
    tiktok: (client.tiktok_content_open_id || client.tiktok_content_display_name) ? {
      platform: 'tiktok',
      open_id: client.tiktok_content_open_id || '',
      display_name: client.tiktok_content_display_name || client.connection_statuses?.tiktok_content_display_name || ''
    } : null,
    youtube: (client.youtube_channel_id || client.youtube_channel_title) ? {
      platform: 'youtube',
      channel_id: client.youtube_channel_id || '',
      channel_title: client.youtube_channel_title || client.connection_statuses?.youtube_channel_title || ''
    } : null
  }
});

async function publishChannel(channel: SocialChannel, clientId: string, client: any, supabase: any, videoUrl: string, caption: string, accountSnapshot: any) {
  try {
    if (channel === 'facebook') {
      if (!client.fb_page_id || !client.fb_page_access_token) {
        return { channel, result: { status: 'missing_connection', account: accountSnapshot.accounts.facebook, message: 'Falta conectar una página de Facebook con permiso de publicación.' } };
      }
      return { channel, result: { ...(await publishFacebookVideo(client.fb_page_id, client.fb_page_access_token, videoUrl, caption)), account: accountSnapshot.accounts.facebook } };
    }
    if (channel === 'instagram') {
      if (!client.ig_business_id || !client.fb_page_access_token) {
        return { channel, result: { status: 'missing_connection', account: accountSnapshot.accounts.instagram, message: 'Falta conectar Instagram profesional desde Meta.' } };
      }
      return { channel, result: { ...(await publishInstagramReel(client.ig_business_id, client.fb_page_access_token, videoUrl, caption)), account: accountSnapshot.accounts.instagram } };
    }
    if (channel === 'tiktok') {
      const token = await getValidTiktokContentToken(clientId, supabase);
      if (!token) {
        return { channel, result: { status: 'missing_connection', account: accountSnapshot.accounts.tiktok, message: 'Falta conectar TikTok orgánico desde Integraciones.' } };
      }
      return { channel, result: { ...(await publishTiktokInboxVideo(token, videoUrl)), account: accountSnapshot.accounts.tiktok } };
    }
    return { channel, result: { ...(await publishYoutubeShort(clientId, supabase, videoUrl, caption)), account: accountSnapshot.accounts.youtube } };
  } catch (err: any) {
    return { channel, result: { status: 'error', message: err?.message || 'Error al publicar.' } };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Servidor no configurado.' });

  const authHeader = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : (req.headers.authorization || '');
  const cronHeader = Array.isArray(req.headers['x-vercel-cron']) ? req.headers['x-vercel-cron'][0] : req.headers['x-vercel-cron'];
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && !cronHeader) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: jobs, error } = await supabase
    .from('car_social_publications')
    .select('id, client_id, user_id, caption, video_url, video_path, selected_channels, results, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(5);

  if (error) return res.status(500).json({ error: error.message });
  if (!jobs?.length) return res.status(200).json({ ok: true, processed: 0 });

  const processed: Array<{ id: string; status: string; results?: Record<string, any>; error?: string }> = [];

  for (const job of jobs) {
    const previousResults = job.results && typeof job.results === 'object' ? job.results : {};
    const processingAt = new Date().toISOString();
    await supabase
      .from('car_social_publications')
      .update({ status: 'processing', results: { ...previousResults, processing_at: processingAt } })
      .eq('id', job.id)
      .eq('status', 'scheduled');

    try {
      const channels = Array.isArray(job.selected_channels)
        ? job.selected_channels.filter((c: string) => ['instagram', 'facebook', 'tiktok', 'youtube'].includes(c)) as SocialChannel[]
        : [];
      if (channels.length === 0) throw new Error('La publicación programada no tiene canales válidos.');
      if (!job.video_url || !/^https:\/\//i.test(job.video_url)) throw new Error('videoUrl público HTTPS requerido.');
      validateSocialVideoOwnership(job.client_id, job.video_url, job.video_path || null);

      const { data: client, error: clientError } = await supabase
        .from('car_clients')
        .select('*')
        .eq('id', job.client_id)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client) throw new Error('Cliente no encontrado.');

      const accountSnapshot = buildAccountSnapshot(job.client_id, client, channels);
      const channelResults = await Promise.all(channels.map(channel => publishChannel(channel, job.client_id, client, supabase, job.video_url, job.caption || '', accountSnapshot)));
      const results = channelResults.reduce((acc, item) => {
        acc[item.channel] = item.result;
        return acc;
      }, {} as Record<string, any>);
      const publishedCount = Object.values(results).filter((item: any) => item.status === 'published' || item.status === 'processing').length;
      const finalStatus = publishedCount > 0 ? 'published' : 'failed';

      await supabase
        .from('car_social_publications')
        .update({
          status: finalStatus,
          results: { ...results, audit: accountSnapshot, scheduled_at: job.scheduled_at, processed_at: new Date().toISOString() },
          published_at: publishedCount > 0 ? new Date().toISOString() : null
        })
        .eq('id', job.id);

      processed.push({ id: job.id, status: finalStatus, results });
    } catch (err: any) {
      await supabase
        .from('car_social_publications')
        .update({
          status: 'failed',
          results: { ...previousResults, error: err?.message || 'Error al publicar programación.', processed_at: new Date().toISOString() }
        })
        .eq('id', job.id);
      processed.push({ id: job.id, status: 'failed', error: err?.message || 'Error al publicar programación.' });
    }
  }

  return res.status(200).json({ ok: true, processed: processed.length, jobs: processed });
}
