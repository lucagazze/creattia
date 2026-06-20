import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock3, Facebook, Instagram,
  Loader2, Send, Sparkles, UploadCloud, Youtube, Zap
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useToast } from '../components/Toast';
import { supabase } from '../services/supabase';

type ChannelId = 'instagram' | 'facebook' | 'tiktok' | 'youtube';

interface ChannelConfig {
  id: ChannelId;
  label: string;
  connected: boolean;
  detail: string;
  accountId?: string;
  avatarUrl?: string;
  color: string;
  icon: React.ReactNode;
}

interface PublishConfirmation {
  clientId: string;
  businessName: string;
  channels: Array<Pick<ChannelConfig, 'id' | 'label' | 'detail' | 'accountId' | 'avatarUrl' | 'color' | 'icon'>>;
  fileName: string;
  scheduledLabel: string;
}

const MAX_VIDEO_MB = 500;
type VideoMeta = { duration: number; width: number; height: number };

const cleanFileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export default function SocialPublisherPage() {
  const navigate = useNavigate();
  const { profile: authProfile, user } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const activeClientId = profile?.id && profile.id !== 'default' ? profile.id : '';
  const { showToast } = useToast();

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<ChannelId[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<Record<string, any> | null>(null);
  const [publishMode, setPublishMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduledItems, setScheduledItems] = useState<any[]>([]);
  const [checkingPublish, setCheckingPublish] = useState(false);
  const [confirmation, setConfirmation] = useState<PublishConfirmation | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);

  React.useEffect(() => {
    setSelectedChannels([]);
    setResults(null);
    setScheduledItems([]);
    setVideoFile(null);
    setVideoMeta(null);
    setVideoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [activeClientId]);

  const buildChannelConfigs = (source: any): ChannelConfig[] => {
    const p: any = source || {};
    return [
      {
        id: 'instagram',
        label: 'Instagram',
        connected: !!(p.ig_business_id && p.fb_page_access_token),
        detail: p.ig_username ? `@${p.ig_username}` : 'Requiere Instagram profesional conectado a Meta',
        accountId: p.ig_business_id,
        color: 'from-pink-500 to-orange-400',
        icon: <Instagram className="w-4 h-4" />
      },
      {
        id: 'facebook',
        label: 'Facebook',
        connected: !!(p.fb_page_id && p.fb_page_access_token),
        detail: p.fb_page_name || 'Requiere página de Facebook conectada',
        accountId: p.fb_page_id,
        color: 'from-blue-600 to-sky-500',
        icon: <Facebook className="w-4 h-4" />
      },
      {
        id: 'tiktok',
        label: 'TikTok',
        connected: !!p.tiktok_content_access_token,
        detail: p.tiktok_content_display_name || p.connection_statuses?.tiktok_content_display_name || 'Requiere TikTok conectado desde Integraciones',
        accountId: p.tiktok_content_open_id,
        avatarUrl: p.tiktok_content_avatar_url,
        color: 'from-zinc-900 to-zinc-650',
        icon: <img src="/assets/logotiktok.png" alt="" className="w-4 h-4 object-contain invert dark:invert-0" />
      },
      {
        id: 'youtube',
        label: 'YouTube Shorts',
        connected: !!p.youtube_access_token,
        detail: p.youtube_channel_title || p.connection_statuses?.youtube_channel_title || 'Requiere YouTube conectado desde Integraciones',
        accountId: p.youtube_channel_id,
        color: 'from-red-600 to-red-500',
        icon: <Youtube className="w-4 h-4" />
      }
    ];
  };

  const channels = useMemo<ChannelConfig[]>(() => buildChannelConfigs(profile), [profile]);

  const connectedCount = channels.filter(c => c.connected).length;
  const selectedConnected = selectedChannels.filter(id => channels.find(c => c.id === id)?.connected);
  const captionLength = caption.trim().length;
  const selectedChannelLabels = selectedConnected
    .map(id => channels.find(c => c.id === id)?.label)
    .filter(Boolean);
  const scheduledLabel = publishMode === 'scheduled' && scheduledAt
    ? new Date(scheduledAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Ahora';
  const selectedDateIso = scheduledAt ? scheduledAt.slice(0, 10) : '';
  const calendarBase = scheduledAt ? new Date(scheduledAt) : new Date();
  const monthDays = useMemo(() => {
    const year = calendarBase.getFullYear();
    const month = calendarBase.getMonth();
    const first = new Date(year, month, 1);
    const total = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: total }, (_, index) => new Date(year, month, index + 1))
    ];
  }, [calendarBase.getFullYear(), calendarBase.getMonth()]);

  React.useEffect(() => {
    let active = true;
    if (!activeClientId) return;
    supabase
      .from('car_social_publications')
      .select('id, caption, selected_channels, results, status, created_at')
      .eq('client_id', activeClientId)
      .in('status', ['scheduled', 'published', 'processing'])
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (active) setScheduledItems(data || []);
      });
    return () => { active = false; };
  }, [activeClientId, results]);

  const readVideoMeta = (url: string): Promise<VideoMeta> => new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve({ duration: video.duration || 0, width: video.videoWidth || 0, height: video.videoHeight || 0 });
    video.onerror = () => reject(new Error('No se pudo leer la metadata del video.'));
    video.src = url;
  });

  const validateVideoForChannels = (channelIds: ChannelId[]) => {
    if (!videoFile) return 'Primero subí un video.';
    if (!videoFile.type.startsWith('video/')) return 'El archivo debe ser un video.';
    if (videoFile.size > MAX_VIDEO_MB * 1024 * 1024) return `El video no puede superar ${MAX_VIDEO_MB} MB.`;
    if (!videoMeta) return null;
    const verticalOrSquare = videoMeta.height >= videoMeta.width;
    if (channelIds.includes('youtube') && videoMeta.duration > 180) return 'YouTube Shorts admite videos cortos. Usá un video de hasta 3 minutos.';
    if ((channelIds.includes('instagram') || channelIds.includes('facebook') || channelIds.includes('tiktok')) && videoMeta.duration > 15 * 60) {
      return 'Para Reels/TikTok usá un video de hasta 15 minutos.';
    }
    if ((channelIds.includes('instagram') || channelIds.includes('tiktok') || channelIds.includes('youtube')) && !verticalOrSquare) {
      return 'Para Reels, TikTok y Shorts el video tiene que ser vertical o cuadrado.';
    }
    if (videoMeta.width < 360 || videoMeta.height < 360) return 'El video es demasiado chico. Usá al menos 360px de ancho y alto.';
    return null;
  };

  const handleFileChange = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      showToast('Subí un archivo de video.', 'warning');
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      showToast(`El video no puede superar ${MAX_VIDEO_MB} MB.`, 'warning');
      return;
    }
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoMeta(null);
    setVideoFile(file);
    const nextPreview = URL.createObjectURL(file);
    setVideoPreview(nextPreview);
    readVideoMeta(nextPreview)
      .then(setVideoMeta)
      .catch(() => showToast('No pude leer duración/dimensiones del video. Igual podés intentar subirlo.', 'warning'));
    setResults(null);
  };

  const toggleChannel = (id: ChannelId) => {
    const channel = channels.find(c => c.id === id);
    if (!channel?.connected) {
      showToast(`${channel?.label || 'Este canal'} todavía no está listo para publicar.`, 'info');
      return;
    }
    setSelectedChannels(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const uploadVideo = async () => {
    if (!videoFile || !user?.id) throw new Error('Falta video o sesión activa.');
    if (!activeClientId) throw new Error('No hay un cliente seleccionado para publicar.');
    const ext = videoFile.name.includes('.') ? videoFile.name.split('.').pop() : 'mp4';
    const path = `${user.id}/${activeClientId}/${Date.now()}-${cleanFileName(videoFile.name || `video.${ext}`)}`;
    const { error } = await supabase.storage
      .from('car-social-videos')
      .upload(path, videoFile, { upsert: false, contentType: videoFile.type || 'video/mp4' });

    if (error) {
      throw new Error(error.message.includes('Bucket not found')
        ? 'Falta crear el bucket car-social-videos en Supabase. Ejecutá supabase_social_publisher.sql.'
        : error.message
      );
    }

    const { data } = supabase.storage.from('car-social-videos').getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('No se pudo obtener la URL pública del video.');
    return { path, publicUrl: data.publicUrl };
  };

  const getFreshAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    let accessToken = sessionData.session?.access_token || '';
    const expiresAtMs = sessionData.session?.expires_at ? sessionData.session.expires_at * 1000 : 0;

    if (!accessToken || (expiresAtMs && expiresAtMs < Date.now() + 120000)) {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error) throw new Error('Tu sesión de Algoritmia expiró. Cerrá sesión y volvé a entrar.');
      accessToken = refreshed.session?.access_token || '';
    }

    if (!accessToken) throw new Error('Tu sesión de Algoritmia expiró. Cerrá sesión y volvé a entrar.');
    return accessToken;
  };

  const processDuePublications = async () => {
    if (!activeClientId) return;
    try {
      const accessToken = await getFreshAccessToken();
      const res = await fetch('/api/oauth?action=social-publish-due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ clientId: activeClientId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.processed > 0) {
        setResults({ scheduled: { status: 'processing', message: `${data.processed} publicación programada procesada.` } });
        showToast(`${data.processed} publicación programada fue procesada.`, 'success');
      }
    } catch (err) {
      console.warn('[Social Publisher] due publish check failed', err);
    }
  };

  React.useEffect(() => {
    if (!activeClientId) return;
    processDuePublications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientId]);

  const sendPublishRequest = async (upload: { publicUrl: string; path: string }, accessToken: string, channelsToPublish: ChannelId[]) => {
    return fetch('/api/oauth?action=social-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({
        clientId: activeClientId,
        userId: user?.id,
        caption: caption.trim(),
        videoUrl: upload.publicUrl,
        videoPath: upload.path,
        channels: channelsToPublish,
        scheduledAt: publishMode === 'scheduled' ? scheduledAt : null
      })
    });
  };

  const handlePublish = async () => {
    if (!activeClientId) {
      showToast('No hay un cliente seleccionado para publicar.', 'warning');
      return;
    }
    if (!videoFile) {
      showToast('Primero subí un video.', 'warning');
      return;
    }
    if (!caption.trim()) {
      showToast('Escribí el texto que va a acompañar el video.', 'warning');
      return;
    }
    if (selectedConnected.length === 0) {
      showToast('Elegí al menos un canal conectado.', 'warning');
      return;
    }
    const validationError = validateVideoForChannels(selectedConnected);
    if (validationError) {
      showToast(validationError, 'warning');
      return;
    }
    if (publishMode === 'scheduled') {
      const target = scheduledAt ? new Date(scheduledAt) : null;
      if (!target || Number.isNaN(target.getTime()) || target.getTime() <= Date.now() + 30 * 1000) {
        showToast('Elegí una fecha y hora futura para programar.', 'warning');
        return;
      }
    }

    setCheckingPublish(true);
    try {
      const { data: freshClient, error } = await supabase
        .from('car_clients')
        .select('*')
        .eq('id', activeClientId)
        .maybeSingle();

      if (error) throw error;
      if (!freshClient) throw new Error('No se pudo confirmar el cliente activo.');
      if (freshClient.id !== activeClientId) throw new Error('El cliente activo cambió. Volvé a abrir el Publicador.');

      const freshChannels = buildChannelConfigs(freshClient);
      const unavailable = selectedChannels.filter(id => !freshChannels.find(channel => channel.id === id)?.connected);
      if (unavailable.length > 0) {
        const names = unavailable
          .map(id => freshChannels.find(channel => channel.id === id)?.label || id)
          .join(', ');
        throw new Error(`${names} ya no está conectado en este cliente. Revisá Integraciones.`);
      }

      const channelsToConfirm = selectedChannels
        .map(id => freshChannels.find(channel => channel.id === id))
        .filter((channel): channel is ChannelConfig => !!channel && channel.connected)
        .map(channel => ({
          id: channel.id,
          label: channel.label,
          detail: channel.detail,
          accountId: channel.accountId,
          avatarUrl: channel.avatarUrl,
          color: channel.color,
          icon: channel.icon
        }));

      if (channelsToConfirm.length === 0) throw new Error('No hay canales conectados para este cliente.');

      setConfirmation({
        clientId: freshClient.id,
        businessName: freshClient.business_name || freshClient.email || 'Cliente sin nombre',
        channels: channelsToConfirm,
        fileName: videoFile.name,
        scheduledLabel
      });
    } catch (err: any) {
      showToast(err.message || 'No se pudo confirmar la publicación.', 'error');
    } finally {
      setCheckingPublish(false);
    }
  };

  const executeConfirmedPublish = async () => {
    if (!confirmation) return;
    const channelsToPublish = confirmation.channels.map(channel => channel.id);

    setPublishing(true);
    setResults(null);
    try {
      let [accessToken, upload] = await Promise.all([getFreshAccessToken(), uploadVideo()]);
      let res = await sendPublishRequest(upload, accessToken, channelsToPublish);
      if (res.status === 401) {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (error || !refreshed.session?.access_token) {
          throw new Error('Tu sesión de Algoritmia expiró. Cerrá sesión y volvé a entrar.');
        }
        accessToken = refreshed.session.access_token;
        res = await sendPublishRequest(upload, accessToken, channelsToPublish);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo publicar.');
      setConfirmation(null);
      setResults(data.results || {});
      const okCount = Object.values(data.results || {}).filter((item: any) => item.status === 'published' || item.status === 'processing').length;
      const firstError = Object.values(data.results || {}).find((item: any) => item.status === 'error' || item.status === 'missing_connection') as any;
      if (data.scheduled) {
        showToast('Publicación programada en el calendario.', 'success');
      } else {
        showToast(
          okCount > 0
            ? 'Publicación enviada a los canales disponibles.'
            : (firstError?.message || 'No se pudo publicar en los canales elegidos.'),
          okCount > 0 ? 'success' : 'warning'
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Error al publicar.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="w-full max-w-[1320px] mx-auto space-y-3">
      <header className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-sm px-4 py-3 sm:px-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-sm shrink-0">
            <Send className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[23px] sm:text-[28px] font-black tracking-tight text-zinc-950 dark:text-white leading-none">Publicador</h1>
            <p className="mt-1 text-[12.5px] font-semibold text-zinc-500 dark:text-zinc-400 leading-snug">
              Armá el contenido, elegí redes y programalo desde un solo lugar.
            </p>
          </div>
        </div>
        <div className="w-full lg:w-auto flex flex-wrap items-center gap-2">
          <span className="h-8 px-3 rounded-lg bg-zinc-100 dark:bg-white/5 text-[11px] font-black text-zinc-600 dark:text-zinc-350 inline-flex items-center gap-2 whitespace-nowrap flex-1 sm:flex-none justify-center">
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            {connectedCount} conectados
          </span>
          <span className="h-8 px-3 rounded-lg bg-zinc-100 dark:bg-white/5 text-[11px] font-black text-zinc-600 dark:text-zinc-350 inline-flex items-center gap-2 whitespace-nowrap flex-1 sm:flex-none justify-center">
            <CalendarDays className="w-3.5 h-3.5 text-violet-500" />
            {scheduledItems.filter(item => item.status === 'scheduled').length} programadas
          </span>
          <button
            onClick={() => navigate('/integraciones')}
            className="h-8 px-3 rounded-lg bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-[11px] font-black flex items-center justify-center gap-2 hover:opacity-90 whitespace-nowrap flex-1 sm:flex-none min-w-[104px]"
          >
            <Zap className="w-3.5 h-3.5" />
            Conectar
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
        <section className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/10 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">Contenido</p>
              <h2 className="text-[16px] font-black text-zinc-950 dark:text-white">Video, copy y canales</h2>
            </div>
            <span className="hidden sm:inline-flex h-7 px-3 rounded-full bg-zinc-100 dark:bg-white/5 text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 items-center">
              {videoFile ? videoFile.name : 'Sin archivo'}
            </span>
          </div>

          <div className="p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)] gap-4">
            <div className="space-y-3">
              <label className="group relative h-[240px] sm:h-[270px] lg:h-[300px] rounded-2xl border border-dashed border-zinc-300 dark:border-white/15 bg-zinc-50 dark:bg-zinc-950/25 overflow-hidden flex items-center justify-center cursor-pointer">
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                />
                {videoPreview ? (
                  <video src={videoPreview} controls playsInline className="w-full h-full object-contain bg-black" />
                ) : (
                  <div className="text-center px-6 max-w-[240px]">
                    <div className="w-12 h-12 rounded-2xl bg-violet-600 text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-violet-600/20 group-hover:scale-105 transition-transform">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <p className="text-[15px] font-black text-zinc-900 dark:text-white">Subir video</p>
                    <p className="mt-2 text-[11.5px] font-bold leading-relaxed text-zinc-500 dark:text-zinc-400">
                      MP4, MOV o WEBM vertical para Reels, Shorts y TikTok.
                    </p>
                    <span className="mt-4 inline-flex h-8 px-3 rounded-lg bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-[10.5px] font-black text-zinc-500 dark:text-zinc-350 items-center">
                      Hasta {MAX_VIDEO_MB} MB
                    </span>
                  </div>
                )}
              </label>

              <div className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/70 dark:bg-zinc-950/20 p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Pie de foto</label>
                  <span className="text-[10.5px] font-bold text-zinc-400">{captionLength}</span>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Copy, CTA, hashtags y menciones..."
                  className="w-full min-h-[118px] resize-y rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/40 px-3 py-2.5 text-[13px] font-semibold text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>
            </div>

            <div className="min-w-0 flex flex-col gap-3">
              <div className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/70 dark:bg-zinc-950/20 p-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Canales</p>
                    <p className="text-[11px] font-semibold text-zinc-400">{selectedConnected.length} seleccionados de {connectedCount} disponibles</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2.5">
                  {channels.map((channel) => {
                    const selected = selectedChannels.includes(channel.id);
                    return (
                      <button
                        key={channel.id}
                        onClick={() => toggleChannel(channel.id)}
                        className={`min-h-[64px] text-left rounded-xl border p-2.5 transition-all active:scale-[0.99] ${
                          selected
                            ? 'border-violet-500 bg-white dark:bg-violet-500/10 shadow-sm shadow-violet-500/10'
                            : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/25 hover:bg-zinc-100 dark:hover:bg-white/[0.04]'
                        } ${!channel.connected ? 'opacity-55' : ''}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className={`w-8 h-8 rounded-xl bg-gradient-to-br ${channel.color} text-white flex items-center justify-center shrink-0`}>
                            {channel.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-black text-zinc-950 dark:text-white truncate">{channel.label}</p>
                            <p className="mt-0.5 text-[10.5px] font-semibold leading-snug text-zinc-500 dark:text-zinc-400 truncate">{channel.detail}</p>
                          </div>
                          {channel.connected ? (
                            selected ? <CheckCircle2 className="w-5 h-5 text-violet-500 shrink-0" /> : <span className="block w-5 h-5 rounded-full border border-zinc-300 dark:border-white/20 shrink-0" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-zinc-400 shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-auto rounded-2xl bg-zinc-950 dark:bg-violet-600 p-1.5 shadow-lg shadow-zinc-900/10 dark:shadow-violet-600/20">
                <button
                  onClick={handlePublish}
                  disabled={publishing || checkingPublish}
                  className="w-full min-h-[46px] rounded-xl bg-white/0 hover:bg-white/10 disabled:opacity-60 text-white text-[13px] sm:text-[14px] font-black flex items-center justify-center gap-2 transition-all"
                >
                  {publishing || checkingPublish ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  <span>
                    {publishing
                      ? (publishMode === 'scheduled' ? 'Programando...' : 'Publicando...')
                      : checkingPublish
                        ? 'Verificando cuentas...'
                        : (publishMode === 'scheduled' ? 'Revisar y programar' : 'Revisar y publicar')}
                  </span>
                </button>
                <p className="px-3 pb-2 text-center text-[10.5px] font-bold text-white/70 truncate">
                  {selectedChannelLabels.length ? `Se enviará a ${selectedChannelLabels.join(', ')}` : 'Elegí canales conectados para publicar'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-sm p-3 sm:p-4 xl:sticky xl:top-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">Programación</p>
              <h2 className="mt-1 text-[16px] font-black text-zinc-950 dark:text-white">Cuándo publicarlo</h2>
            </div>
            <span className={`h-7 px-3 rounded-full text-[10.5px] font-black inline-flex items-center ${
              publishMode === 'scheduled'
                ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300'
                : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
            }`}>
              {publishMode === 'scheduled' ? 'Programado' : 'Ahora'}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { id: 'now', label: 'Ahora', icon: Send },
              { id: 'scheduled', label: 'Fecha', icon: CalendarDays }
            ].map(option => {
              const Icon = option.icon;
              const active = publishMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPublishMode(option.id as 'now' | 'scheduled')}
                  className={`h-10 rounded-xl border text-[12px] font-black flex items-center justify-center gap-2 transition-all ${
                    active
                      ? 'border-violet-500 bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300'
                      : 'border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/25 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/80 dark:bg-zinc-950/20 p-3">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-[14px] font-black text-zinc-950 dark:text-white">
                {calendarBase.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
              </h3>
              <span className="h-7 px-2.5 rounded-lg bg-white dark:bg-white/5 text-[10.5px] font-black text-zinc-500 dark:text-zinc-400 inline-flex items-center">
                {scheduledItems.filter(item => item.status === 'scheduled').length}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => (
                <span key={`${day}-${index}`} className="text-[9.5px] font-black text-zinc-400">{day}</span>
              ))}
              {monthDays.map((day, index) => {
                const iso = day ? day.toISOString().slice(0, 10) : '';
                const count = scheduledItems.filter(item => (item.results?.scheduled_at || item.created_at || '').slice(0, 10) === iso).length;
                const isToday = day && day.toDateString() === new Date().toDateString();
                const isSelected = !!day && iso === selectedDateIso;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      if (!day) return;
                      const now = new Date();
                      const isPickedToday = day.toDateString() === now.toDateString();
                      const defaultHour = `${String(Math.min(23, now.getHours() + 1)).padStart(2, '0')}:00`;
                      const hour = scheduledAt ? scheduledAt.slice(11, 16) : (isPickedToday ? defaultHour : '10:00');
                      setPublishMode('scheduled');
                      setScheduledAt(`${iso}T${hour}`);
                    }}
                    className={`aspect-square min-h-8 rounded-lg text-[11px] font-black flex flex-col items-center justify-center gap-0.5 transition-all ${
                      day
                        ? isSelected
                          ? 'bg-zinc-950 dark:bg-violet-500 text-white shadow-md shadow-zinc-900/15 ring-2 ring-violet-300/60'
                          : isToday
                            ? 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-200'
                          : 'bg-white dark:bg-zinc-950/35 text-zinc-700 dark:text-zinc-200 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300'
                        : 'opacity-0'
                    }`}
                  >
                    {day?.getDate()}
                    {count > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-violet-500'}`} />}
                  </button>
                );
              })}
            </div>
          </div>

          {publishMode === 'scheduled' && (
            <div className="mt-3 rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-zinc-950/15 p-3">
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Fecha y hora</label>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_34px] gap-2">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                  className="h-10 min-w-0 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/40 px-3 text-[12.5px] font-bold text-zinc-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/30"
                />
                <div className="h-10 rounded-xl bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 flex items-center justify-center">
                  <Clock3 className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {scheduledItems.filter(item => item.status === 'scheduled').slice(0, 3).map(item => (
              <div key={item.id} className="rounded-xl border border-zinc-100 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/30 p-3">
                <p className="text-[12px] font-black text-zinc-800 dark:text-white truncate">{item.caption || 'Publicación sin texto'}</p>
                <p className="mt-1 text-[10px] font-bold text-zinc-400">
                  {item.results?.scheduled_at ? new Date(item.results.scheduled_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha'} · {(item.selected_channels || []).join(', ')}
                </p>
              </div>
            ))}
            {scheduledItems.filter(item => item.status === 'scheduled').length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 p-3 text-center">
                <CalendarDays className="w-5 h-5 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-[11.5px] font-semibold text-zinc-400">Sin publicaciones programadas.</p>
              </div>
            )}
          </div>
        </aside>

        {results && (
          <section className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] p-4 shadow-sm xl:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">Resultado</p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
              {Object.entries(results).map(([channel, result]: any) => (
                <div key={channel} className="rounded-xl bg-zinc-50 dark:bg-zinc-950/30 border border-zinc-100 dark:border-white/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="capitalize text-[12.5px] font-black text-zinc-950 dark:text-white">{channel}</p>
                    <span className={`text-[9.5px] font-black uppercase px-2 py-1 rounded-full ${
                      result.status === 'published' || result.status === 'processing'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {result.status}
                    </span>
                  </div>
                  {result.message && <p className="mt-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{result.message}</p>}
                  {result.url && (
                    <a href={result.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[11px] font-black text-violet-500 hover:underline">
                      Ver publicación
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {confirmation && (
        <div className="fixed inset-0 z-[80] bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-[520px] rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/10 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">Confirmar publicación</p>
                <h3 className="mt-1 text-[20px] font-black text-zinc-950 dark:text-white">Revisá la cuenta antes de subir</h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                disabled={publishing}
                className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/25 p-4">
                <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Cliente activo</p>
                <p className="mt-1 text-[17px] font-black text-zinc-950 dark:text-white">{confirmation.businessName}</p>
                <p className="mt-1 text-[11px] font-bold text-zinc-400">ID: {confirmation.clientId}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {confirmation.channels.map(channel => (
                  <div key={channel.id} className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/20 p-3 flex items-start gap-3">
                    <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${channel.color} text-white flex items-center justify-center shrink-0`}>
                      {channel.avatarUrl ? <img src={channel.avatarUrl} alt="" className="w-full h-full rounded-xl object-cover" /> : channel.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-black text-zinc-950 dark:text-white">{channel.label}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 break-words">{channel.detail}</p>
                      {channel.accountId && (
                        <p className="mt-1 text-[9.5px] font-black uppercase tracking-wider text-zinc-350 dark:text-zinc-600 break-all">
                          ID cuenta: {channel.accountId}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/25 border border-zinc-100 dark:border-white/10 p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Archivo</p>
                  <p className="mt-1 text-[12px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{confirmation.fileName}</p>
                </div>
                <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/25 border border-zinc-100 dark:border-white/10 p-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Cuándo</p>
                  <p className="mt-1 text-[12px] font-bold text-zinc-800 dark:text-zinc-200">{confirmation.scheduledLabel}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-3">
                <p className="text-[12px] font-bold leading-relaxed text-amber-800 dark:text-amber-200">
                  Vas a publicar únicamente en las cuentas listadas arriba para el cliente {confirmation.businessName}. Si alguna cuenta no coincide, cancelá y revisá Integraciones.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-950/25 border-t border-zinc-100 dark:border-white/10 flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                disabled={publishing}
                className="h-11 px-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-[13px] font-black text-zinc-600 dark:text-zinc-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeConfirmedPublish}
                disabled={publishing}
                className="h-11 px-5 rounded-xl bg-zinc-950 dark:bg-violet-600 text-white text-[13px] font-black flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {publishMode === 'scheduled' ? 'Confirmar programación' : 'Confirmar publicación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
