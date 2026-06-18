import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock3, Facebook, Film, Instagram,
  Loader2, PlayCircle, Send, Sparkles, UploadCloud, Youtube, Zap
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
  color: string;
  icon: React.ReactNode;
}

const MAX_VIDEO_MB = 500;

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

  const channels = useMemo<ChannelConfig[]>(() => {
    const p: any = profile || {};
    return [
      {
        id: 'instagram',
        label: 'Instagram',
        connected: !!(p.ig_business_id && p.fb_page_access_token),
        detail: p.ig_username ? `@${p.ig_username}` : 'Requiere Instagram profesional conectado a Meta',
        color: 'from-pink-500 to-orange-400',
        icon: <Instagram className="w-4 h-4" />
      },
      {
        id: 'facebook',
        label: 'Facebook',
        connected: !!(p.fb_page_id && p.fb_page_access_token),
        detail: p.fb_page_name || 'Requiere página de Facebook conectada',
        color: 'from-blue-600 to-sky-500',
        icon: <Facebook className="w-4 h-4" />
      },
      {
        id: 'tiktok',
        label: 'TikTok',
        connected: !!p.tiktok_content_access_token,
        detail: p.tiktok_content_display_name || p.connection_statuses?.tiktok_content_display_name || 'Requiere TikTok conectado desde Integraciones',
        color: 'from-zinc-900 to-zinc-650',
        icon: <img src="/assets/logotiktok.png" alt="" className="w-4 h-4 object-contain invert dark:invert-0" />
      },
      {
        id: 'youtube',
        label: 'YouTube Shorts',
        connected: !!p.youtube_access_token,
        detail: p.youtube_channel_title || p.connection_statuses?.youtube_channel_title || 'Requiere YouTube conectado desde Integraciones',
        color: 'from-red-600 to-red-500',
        icon: <Youtube className="w-4 h-4" />
      }
    ];
  }, [profile]);

  const connectedCount = channels.filter(c => c.connected).length;
  const selectedConnected = selectedChannels.filter(id => channels.find(c => c.id === id)?.connected);
  const captionLength = caption.trim().length;
  const selectedChannelLabels = selectedConnected
    .map(id => channels.find(c => c.id === id)?.label)
    .filter(Boolean);
  const scheduledLabel = publishMode === 'scheduled' && scheduledAt
    ? new Date(scheduledAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Ahora';
  const monthDays = useMemo(() => {
    const base = scheduledAt ? new Date(scheduledAt) : new Date();
    const year = base.getFullYear();
    const month = base.getMonth();
    const first = new Date(year, month, 1);
    const total = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: total }, (_, index) => new Date(year, month, index + 1))
    ];
  }, [scheduledAt]);

  React.useEffect(() => {
    let active = true;
    if (!profile?.id) return;
    supabase
      .from('car_social_publications')
      .select('id, caption, selected_channels, status, scheduled_at, created_at')
      .eq('client_id', profile.id)
      .in('status', ['scheduled', 'published', 'processing'])
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(40)
      .then(({ data }) => {
        if (active) setScheduledItems(data || []);
      });
    return () => { active = false; };
  }, [profile?.id, results]);

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
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
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

  const resolveActiveClientId = async () => {
    if (profile?.id && profile.id !== 'default') return profile.id;
    if (!user?.id) throw new Error('Falta sesión activa.');

    const { data: owned } = await supabase
      .from('car_clients')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (owned?.id) return owned.id;

    const { data: association } = await supabase
      .from('car_business_accounts')
      .select('business_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (association?.business_id) return association.business_id;

    throw new Error('Cliente no encontrado para esta sesión.');
  };

  const uploadVideo = async (clientId: string) => {
    if (!videoFile || !clientId || !user?.id) throw new Error('Falta video o sesión activa.');
    const ext = videoFile.name.includes('.') ? videoFile.name.split('.').pop() : 'mp4';
    const path = `${user.id}/${clientId}/${Date.now()}-${cleanFileName(videoFile.name || `video.${ext}`)}`;
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

  const handlePublish = async () => {
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
    if (publishMode === 'scheduled') {
      const target = scheduledAt ? new Date(scheduledAt) : null;
      if (!target || Number.isNaN(target.getTime()) || target.getTime() <= Date.now() + 30 * 1000) {
        showToast('Elegí una fecha y hora futura para programar.', 'warning');
        return;
      }
    }

    setPublishing(true);
    setResults(null);
    try {
      const clientId = await resolveActiveClientId();
      const upload = await uploadVideo(clientId);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('La sesión expiró. Volvé a iniciar sesión.');
      const res = await fetch('/api/oauth?action=social-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          clientId,
          userId: user?.id,
          caption: caption.trim(),
          videoUrl: upload.publicUrl,
          videoPath: upload.path,
          channels: selectedConnected,
          scheduledAt: publishMode === 'scheduled' ? scheduledAt : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo publicar.');
      setResults(data.results || {});
      const okCount = Object.values(data.results || {}).filter((item: any) => item.status === 'published' || item.status === 'processing').length;
      if (data.scheduled) {
        showToast('Publicación programada en el calendario.', 'success');
      } else {
        showToast(okCount > 0 ? 'Publicación enviada a los canales disponibles.' : 'No se pudo publicar en los canales elegidos.', okCount > 0 ? 'success' : 'warning');
      }
    } catch (err: any) {
      showToast(err.message || 'Error al publicar.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="w-full max-w-[1680px] mx-auto space-y-5">
      <header className="rounded-3xl border border-zinc-200/70 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-sm px-4 py-4 sm:px-5 lg:px-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-600/20 shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[28px] sm:text-[34px] font-black tracking-tight text-zinc-950 dark:text-white leading-none">Publicador</h1>
            <p className="mt-2 text-[13px] sm:text-[14px] font-semibold text-zinc-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Subí un video una sola vez, elegí canales conectados y publicalo desde Algoritmia.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            <span className="h-10 px-3 rounded-xl bg-zinc-100 dark:bg-white/5 text-[11px] font-black text-zinc-600 dark:text-zinc-350 inline-flex items-center justify-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              {connectedCount} conectados
            </span>
            <span className="h-10 px-3 rounded-xl bg-zinc-100 dark:bg-white/5 text-[11px] font-black text-zinc-600 dark:text-zinc-350 inline-flex items-center justify-center gap-2">
              <CalendarDays className="w-3.5 h-3.5 text-violet-500" />
              {scheduledItems.filter(item => item.status === 'scheduled').length} programadas
            </span>
          </div>
          <button
            onClick={() => navigate('/integraciones')}
            className="h-10 px-4 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-[12px] font-black flex items-center justify-center gap-2 hover:opacity-90 shadow-lg shadow-zinc-900/10"
          >
            <Zap className="w-4 h-4" />
            Conectar canales
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5">
        <section className="rounded-3xl border border-zinc-200/70 dark:border-white/10 bg-white dark:bg-[#18181b] overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-white/10 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">Contenido</p>
              <h2 className="text-[18px] font-black text-zinc-950 dark:text-white">Video y descripción</h2>
            </div>
            <span className="hidden sm:inline-flex h-8 px-3 rounded-full bg-violet-50 dark:bg-violet-500/10 text-[11px] font-black text-violet-600 dark:text-violet-300 items-center">
              {publishMode === 'scheduled' ? 'Programada' : 'Lista para publicar'}
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(420px,1.08fr)_minmax(420px,0.92fr)] items-start gap-5 p-4 sm:p-5 lg:p-6">
            <label className="group relative min-h-[340px] lg:min-h-[430px] xl:min-h-[540px] rounded-[26px] border border-dashed border-zinc-300 dark:border-white/15 bg-[radial-gradient(circle_at_top,#faf7ff,transparent_42%),#fafafa] dark:bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.12),transparent_42%),rgba(9,9,11,0.45)] overflow-hidden flex items-center justify-center cursor-pointer">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/*"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
              {videoPreview ? (
                <video src={videoPreview} controls playsInline className="w-full h-full object-contain bg-black" />
              ) : (
                <div className="text-center px-8 max-w-[310px]">
                  <div className="w-16 h-16 rounded-[22px] bg-violet-600 text-white flex items-center justify-center mx-auto mb-4 shadow-xl shadow-violet-600/25 group-hover:scale-105 transition-transform">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <p className="text-[18px] font-black text-zinc-900 dark:text-white">Subir video</p>
                  <p className="mt-2 text-[12px] font-bold leading-relaxed text-zinc-500 dark:text-zinc-400">
                    MP4, MOV o WEBM. Ideal vertical 9:16 para Reels, Shorts y TikTok.
                  </p>
                  <span className="mt-5 inline-flex h-9 px-4 rounded-full bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-[11px] font-black text-zinc-500 dark:text-zinc-350 items-center">
                    Hasta {MAX_VIDEO_MB} MB
                  </span>
                </div>
              )}
            </label>

            <div className="space-y-4 min-w-0">
              <div className="rounded-[24px] border border-zinc-200/70 dark:border-white/10 bg-zinc-50/70 dark:bg-zinc-950/20 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[12px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Texto del post</label>
                  <span className="text-[11px] font-bold text-zinc-400">{captionLength} caracteres</span>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Escribí el copy, CTA, hashtags y menciones..."
                  className="w-full min-h-[160px] resize-y rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/40 px-4 py-3 text-[14px] font-semibold text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-violet-500/30"
                />
              </div>

              <div className="rounded-[24px] border border-zinc-200/70 dark:border-white/10 bg-white dark:bg-zinc-950/15 p-4 sm:p-5">
                <p className="text-[12px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">Programación</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { id: 'now', label: 'Ahora', icon: Send },
                    { id: 'scheduled', label: 'Programar', icon: CalendarDays }
                  ].map(option => {
                    const Icon = option.icon;
                    const active = publishMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setPublishMode(option.id as 'now' | 'scheduled')}
                        className={`h-11 rounded-xl border text-[12px] font-black flex items-center justify-center gap-2 transition-all ${
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
                {publishMode === 'scheduled' && (
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_150px] gap-3">
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                      className="h-11 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/40 px-3 text-[13px] font-bold text-zinc-800 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                    <div className="h-11 rounded-xl bg-zinc-100 dark:bg-white/5 text-[11px] font-black text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-2">
                      <Clock3 className="w-4 h-4" />
                      Hora local
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[24px] border border-zinc-200/70 dark:border-white/10 bg-white dark:bg-zinc-950/15 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-[12px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Canales</p>
                  <span className="text-[11px] font-black text-zinc-400">{selectedConnected.length}/{connectedCount}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {channels.map((channel) => {
                    const selected = selectedChannels.includes(channel.id);
                    return (
                      <button
                        key={channel.id}
                        onClick={() => toggleChannel(channel.id)}
                        className={`text-left rounded-2xl border p-3.5 transition-all active:scale-[0.99] ${
                          selected
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 shadow-sm shadow-violet-500/10'
                            : 'border-zinc-200 dark:border-white/10 bg-zinc-50/70 dark:bg-zinc-950/25 hover:bg-zinc-100 dark:hover:bg-white/[0.04]'
                        } ${!channel.connected ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${channel.color} text-white flex items-center justify-center shrink-0`}>
                            {channel.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-black text-zinc-950 dark:text-white truncate">{channel.label}</p>
                            <p className="mt-0.5 text-[11px] font-semibold leading-snug text-zinc-500 dark:text-zinc-400 line-clamp-2">{channel.detail}</p>
                          </div>
                          <span className="shrink-0 pt-0.5">
                            {channel.connected ? (
                              selected ? <CheckCircle2 className="w-5 h-5 text-violet-500" /> : <span className="block w-5 h-5 rounded-full border border-zinc-300 dark:border-white/20" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-zinc-400" />
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[24px] border border-zinc-200/70 dark:border-white/10 bg-zinc-950 dark:bg-violet-600 p-2 shadow-xl shadow-zinc-900/10 dark:shadow-violet-600/20">
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="w-full min-h-[58px] rounded-[18px] bg-white/0 hover:bg-white/10 disabled:opacity-60 text-white text-[14px] sm:text-[15px] font-black flex items-center justify-center gap-2 transition-all"
                >
                  {publishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  <span>{publishing ? (publishMode === 'scheduled' ? 'Programando...' : 'Publicando...') : (publishMode === 'scheduled' ? 'Programar publicación' : 'Publicar ahora')}</span>
                </button>
                <p className="px-3 pb-2 text-center text-[11px] font-bold text-white/70">
                  {selectedChannelLabels.length ? `Se enviará a ${selectedChannelLabels.join(', ')}` : 'Elegí canales conectados para habilitar la publicación'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <aside className="grid grid-cols-1 xl:grid-cols-[0.82fr_1.18fr] gap-5 self-start">
          <section className="rounded-3xl border border-zinc-200/70 dark:border-white/10 bg-white dark:bg-[#18181b] p-4 sm:p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">Estado</p>
                <h2 className="mt-1 text-[18px] font-black text-zinc-950 dark:text-white">Salida</h2>
              </div>
              <span className={`h-8 px-3 rounded-full text-[11px] font-black inline-flex items-center ${
                publishMode === 'scheduled'
                  ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-300'
                  : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
              }`}>
                {publishMode === 'scheduled' ? 'Programar' : 'Ahora'}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              {[
                { icon: Film, label: videoFile ? videoFile.name : 'Sin video cargado' },
                { icon: PlayCircle, label: selectedChannelLabels.length ? selectedChannelLabels.join(', ') : 'Sin canales seleccionados' },
                { icon: CalendarDays, label: scheduledLabel }
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={index} className="min-h-11 rounded-2xl bg-zinc-50 dark:bg-zinc-950/30 border border-zinc-100 dark:border-white/10 px-3 py-2.5 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-white dark:bg-white/5 border border-zinc-100 dark:border-white/10 flex items-center justify-center text-violet-500 shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <p className="text-[12.5px] font-black text-zinc-700 dark:text-zinc-200 truncate">{item.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-500/20 p-3.5">
              <p className="text-[11.5px] font-bold leading-relaxed text-amber-800 dark:text-amber-200">
                Facebook e Instagram usan Meta. TikTok puede pedir confirmación final desde la app.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200/70 dark:border-white/10 bg-white dark:bg-[#18181b] p-4 sm:p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">Calendario</p>
                <h2 className="mt-1 text-[18px] font-black text-zinc-950 dark:text-white">
                  {new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                </h2>
              </div>
              <span className="h-8 px-3 rounded-full bg-zinc-100 dark:bg-white/5 text-[11px] font-black text-zinc-500 dark:text-zinc-400 inline-flex items-center">
                {scheduledItems.filter(item => item.status === 'scheduled').length} programadas
              </span>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1.5 text-center">
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => (
                <span key={`${day}-${index}`} className="text-[10px] font-black text-zinc-400">{day}</span>
              ))}
              {monthDays.map((day, index) => {
                const iso = day ? day.toISOString().slice(0, 10) : '';
                const count = scheduledItems.filter(item => (item.scheduled_at || item.created_at || '').slice(0, 10) === iso).length;
                const isToday = day && day.toDateString() === new Date().toDateString();
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      if (!day) return;
                      const hour = scheduledAt ? scheduledAt.slice(11, 16) : '10:00';
                      setPublishMode('scheduled');
                      setScheduledAt(`${iso}T${hour}`);
                    }}
                    className={`aspect-square min-h-9 rounded-xl text-[11px] font-black flex flex-col items-center justify-center gap-0.5 transition-all ${
                      day
                        ? isToday
                          ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
                          : 'bg-zinc-50 dark:bg-zinc-950/35 text-zinc-700 dark:text-zinc-200 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300'
                        : 'opacity-0'
                    }`}
                  >
                    {day?.getDate()}
                    {count > 0 && <span className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-violet-500'}`} />}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-2">
              {scheduledItems.filter(item => item.status === 'scheduled').slice(0, 4).map(item => (
                <div key={item.id} className="rounded-xl border border-zinc-100 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/30 p-3">
                  <p className="text-[12px] font-black text-zinc-800 dark:text-white truncate">{item.caption || 'Publicación sin texto'}</p>
                  <p className="mt-1 text-[10px] font-bold text-zinc-400">
                    {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin fecha'} · {(item.selected_channels || []).join(', ')}
                  </p>
                </div>
              ))}
              {scheduledItems.filter(item => item.status === 'scheduled').length === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 p-4 text-center">
                  <CalendarDays className="w-5 h-5 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                  <p className="text-[12px] font-semibold text-zinc-400">Todavía no hay publicaciones programadas.</p>
                </div>
              )}
            </div>
          </section>

          {results && (
            <section className="rounded-3xl border border-zinc-200/70 dark:border-white/10 bg-white dark:bg-[#18181b] p-5 shadow-sm xl:col-span-2">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-500">Resultado</p>
              <div className="mt-4 space-y-3">
                {Object.entries(results).map(([channel, result]: any) => (
                  <div key={channel} className="rounded-2xl bg-zinc-50 dark:bg-zinc-950/30 border border-zinc-100 dark:border-white/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="capitalize text-[13px] font-black text-zinc-950 dark:text-white">{channel}</p>
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
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
        </aside>
      </div>
    </div>
  );
}
