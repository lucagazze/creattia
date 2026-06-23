import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock3, Facebook, Instagram,
  Loader2, Send, Sparkles, UploadCloud, Youtube, Zap,
  X, ShoppingBag, BookOpen, Award, Tag, ChevronDown, Check, HelpCircle,
  Search, RefreshCw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useToast } from '../components/Toast';
import { supabase } from '../services/supabase';
import { ecommerce } from '../services/ecommerce';

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
  expectedAccounts: Partial<Record<ChannelId, string>>;
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

const getExpectedAccountId = (channel: Pick<ChannelConfig, 'accountId'>) =>
  channel.accountId ? String(channel.accountId) : '';

const clampDuration = (seconds?: number | null) => {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(900, Math.round(n))) : 30;
};

async function extractFrames(file: File, maxFrames = 4): Promise<{ frames: string[]; durationSec: number }> {
  const isVideo = file.type.startsWith('video');
  if (!isVideo) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = document.createElement('img');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 256 / Math.max(img.width, img.height));
          canvas.width = Math.floor(img.width * scale);
          canvas.height = Math.floor(img.height * scale);
          canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ frames: [canvas.toDataURL('image/jpeg', 0.6)], durationSec: 30 });
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }
  return new Promise(resolve => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    const frames: string[] = [];
    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 30;
      const timestamps = Array.from({ length: maxFrames }, (_, i) => (dur / maxFrames) * i + dur / maxFrames / 2);
      let idx = 0;
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 256 / Math.max(video.videoWidth, 1));
        canvas.width = Math.floor(video.videoWidth * scale);
        canvas.height = Math.floor(video.videoHeight * scale);
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.6));
        idx++;
        if (idx < timestamps.length) video.currentTime = timestamps[idx];
        else { URL.revokeObjectURL(video.src); resolve({ frames, durationSec: dur }); }
      };
      video.currentTime = timestamps[0];
    };
    video.onerror = () => { URL.revokeObjectURL(video.src); resolve({ frames: [], durationSec: 30 }); };
  });
}

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
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [creativeDescription, setCreativeDescription] = useState('');

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [productMode, setProductMode] = useState<'single' | 'multiple' | 'none'>('none');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [manualProductName, setManualProductName] = useState('');
  const [manualProductPrice, setManualProductPrice] = useState('');
  const [manualProductUrl, setManualProductUrl] = useState('');
  const [videoFocus, setVideoFocus] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [postGoal, setPostGoal] = useState<'promo' | 'sales' | 'viral' | 'edu' | 'interactive'>('viral');
  const [postTone, setPostTone] = useState<'default' | 'casual' | 'energetic' | 'professional' | 'direct' | 'storytelling'>('default');
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);

  const handleForceSyncCatalog = async () => {
    if (!activeClientId) return;
    setSyncingCatalog(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';

      const r = await fetch('/api/scrape-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: activeClientId, action: 'sync-catalog' })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al sincronizar el catálogo.');
      
      if (data.catalog && Array.isArray(data.catalog)) {
        setCatalog(data.catalog);
        showToast(`Catálogo sincronizado: ${data.catalog.length} productos.`, 'success');
      } else {
        throw new Error('El backend no devolvió ningún catálogo válido.');
      }
    } catch (err: any) {
      showToast(err.message || 'Error al sincronizar el catálogo.', 'error');
    } finally {
      setSyncingCatalog(false);
    }
  };

  const handleGenerateAiCaption = async () => {
    if (!activeClientId) {
      showToast('Seleccioná un cliente primero.', 'warning');
      return;
    }
    setGeneratingCaption(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';

      const selectedProduct = productMode === 'single'
        ? (selectedProductId === 'manual' || !selectedProductId
          ? { title: manualProductName, price: manualProductPrice, url: manualProductUrl }
          : catalog.find((p: any) => (p.id || p.title) === selectedProductId))
        : null;

      const selectedProducts = productMode === 'multiple'
        ? selectedProductIds.map(id => catalog.find((p: any) => (p.id || p.title) === id)).filter(Boolean)
        : [];
      
      const res = await fetch('/api/oauth?action=social-draft-caption', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: activeClientId,
          creativeDescription,
          videoFocus,
          postGoal,
          postTone,
          productMode,
          selectedProduct,
          selectedProducts
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo generar el pie de foto.');
      if (data.caption) {
        setCaption(data.caption);
        setIsAiModalOpen(false);
        showToast('Pie de foto generado con IA ✓', 'success');
      } else {
        throw new Error('La IA devolvió un pie de foto vacío.');
      }
    } catch (err: any) {
      showToast(err.message || 'Error al generar el pie de foto.', 'error');
    } finally {
      setGeneratingCaption(false);
    }
  };

  React.useEffect(() => {
    setSelectedChannels([]);
    setResults(null);
    setScheduledItems([]);
    setVideoFile(null);
    setVideoMeta(null);
    setCaption('');
    setCreativeDescription('');
    setConfirmation(null);
    setPublishMode('now');
    setScheduledAt('');
    setVideoPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    setCatalog([]);
    setSelectedProductId('');
    setSelectedProductIds([]);
    setProductMode('none');
    setPostGoal('viral');
    setPostTone('default');
    setManualProductName('');
    setManualProductPrice('');
    setManualProductUrl('');
    setVideoFocus('');
    setShowProductDropdown(false);
    setProductSearchTerm('');

    if (activeClientId) {
      setLoadingCatalog(true);
      supabase
        .from('car_clients')
        .select('*')
        .eq('id', activeClientId)
        .maybeSingle()
        .then(async ({ data: clientData, error }) => {
          if (error || !clientData) {
            console.error('Error fetching client details:', error);
            setLoadingCatalog(false);
            return;
          }

          let parsedCatalog: any[] = [];
          if (clientData.products_catalog) {
            try {
              const parsed = typeof clientData.products_catalog === 'string'
                ? JSON.parse(clientData.products_catalog)
                : clientData.products_catalog;
              if (Array.isArray(parsed)) {
                parsedCatalog = parsed;
              }
            } catch (e) {
              console.error('Error parsing products_catalog:', e);
            }
          }

          // If the cached database catalog is empty, trigger the backend sync-catalog as fallback!
          if (parsedCatalog.length === 0) {
            try {
              console.log('[SocialPublisherPage] Database catalog is empty, calling sync-catalog backend API...');
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData.session?.access_token || '';

              const r = await fetch('/api/scrape-all', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ clientId: activeClientId, action: 'sync-catalog' })
              });
              if (r.ok) {
                const syncRes = await r.json();
                if (syncRes.catalog && Array.isArray(syncRes.catalog)) {
                  parsedCatalog = syncRes.catalog;
                  console.log('[SocialPublisherPage] Successfully synced catalog from backend:', parsedCatalog.length);
                }
              }
            } catch (fetchErr) {
              console.error('[SocialPublisherPage] Live catalog sync failed:', fetchErr);
            }
          }

          setCatalog(parsedCatalog);
          setLoadingCatalog(false);
        });
    }
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
        connected: !!(p.tiktok_content_access_token && p.tiktok_content_open_id),
        detail: p.tiktok_content_display_name || p.connection_statuses?.tiktok_content_display_name || 'Requiere reconectar TikTok desde Integraciones',
        accountId: p.tiktok_content_open_id,
        avatarUrl: p.tiktok_content_avatar_url,
        color: 'from-zinc-900 to-zinc-650',
        icon: <img src="/assets/logotiktok.png" alt="" className="w-4 h-4 object-contain invert dark:invert-0" />
      },
      {
        id: 'youtube',
        label: 'YouTube Shorts',
        connected: !!(p.youtube_access_token && p.youtube_channel_id),
        detail: p.youtube_channel_title || p.connection_statuses?.youtube_channel_title || 'Requiere reconectar YouTube desde Integraciones',
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

  const uploadVideo = async (targetClientId: string) => {
    if (!videoFile || !user?.id) throw new Error('Falta video o sesión activa.');
    if (!targetClientId) throw new Error('No hay un cliente seleccionado para publicar.');
    const ext = videoFile.name.includes('.') ? videoFile.name.split('.').pop() : 'mp4';
    const path = `${user.id}/${targetClientId}/${Date.now()}-${cleanFileName(videoFile.name || `video.${ext}`)}`;
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

  const sendPublishRequest = async (
    targetClientId: string,
    upload: { publicUrl: string; path: string },
    accessToken: string,
    channelsToPublish: ChannelId[],
    expectedAccounts: Partial<Record<ChannelId, string>>
  ) => {
    return fetch('/api/oauth?action=social-publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({
        clientId: targetClientId,
        userId: user?.id,
        caption: caption.trim(),
        videoUrl: upload.publicUrl,
        videoPath: upload.path,
        channels: channelsToPublish,
        expectedAccounts,
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
        expectedAccounts: channelsToConfirm.reduce((acc, channel) => {
          acc[channel.id] = getExpectedAccountId(channel);
          return acc;
        }, {} as Partial<Record<ChannelId, string>>),
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
      let [accessToken, upload] = await Promise.all([getFreshAccessToken(), uploadVideo(confirmation.clientId)]);
      let res = await sendPublishRequest(confirmation.clientId, upload, accessToken, channelsToPublish, confirmation.expectedAccounts);
      if (res.status === 401) {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (error || !refreshed.session?.access_token) {
          throw new Error('Tu sesión de Algoritmia expiró. Cerrá sesión y volvé a entrar.');
        }
        accessToken = refreshed.session.access_token;
        res = await sendPublishRequest(confirmation.clientId, upload, accessToken, channelsToPublish, confirmation.expectedAccounts);
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
    <div className="w-full max-w-[1400px] mx-auto space-y-3">
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

          <div className="p-3 sm:p-4 space-y-4">
            {/* Top row: Video + Canales + Button */}
            <div className="grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)] gap-4">
              {/* Left Column: Video */}
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

              {/* Right Column: Canales + Button */}
              <div className="min-w-0 flex flex-col gap-3 justify-between">
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

                <div className="flex flex-col gap-1">
                  <button
                    onClick={handlePublish}
                    disabled={publishing || checkingPublish}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-[13px] font-black flex items-center justify-center gap-2 shadow-md shadow-violet-500/10 hover:shadow-lg hover:shadow-violet-500/20 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {publishing || checkingPublish ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>
                      {publishing
                        ? (publishMode === 'scheduled' ? 'Programando...' : 'Publicando...')
                        : checkingPublish
                          ? 'Verificando cuentas...'
                          : (publishMode === 'scheduled' ? 'Revisar y programar' : 'Revisar y publicar')}
                    </span>
                  </button>
                  <p className="text-center text-[10.5px] font-semibold text-zinc-400 dark:text-zinc-500 truncate">
                    {selectedChannelLabels.length ? `Se enviará a ${selectedChannelLabels.join(', ')}` : 'Elegí canales conectados para publicar'}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom row: Full-width Pie de foto (Wide & tall) */}
            <div className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-zinc-50/70 dark:bg-zinc-950/20 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-[11.5px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Pie de foto</label>
                  <span className="text-[11px] font-bold text-zinc-450">({captionLength} caracteres)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!activeClientId) {
                      showToast('Seleccioná un cliente primero.', 'warning');
                      return;
                    }
                    setIsAiModalOpen(true);
                  }}
                  className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 hover:from-violet-500 hover:via-fuchsia-500 hover:to-pink-500 text-white text-[12px] font-extrabold flex items-center justify-center gap-1.5 shadow-md shadow-violet-500/10 hover:shadow-lg hover:shadow-violet-500/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-violet-200" />
                  <span>Generar con IA</span>
                </button>
              </div>

              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Copy, CTA, hashtags y menciones..."
                rows={24}
                className="w-full min-h-[550px] resize-y rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/40 px-4 py-3 text-[13.5px] font-semibold text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-violet-500/30 leading-relaxed"
                style={{ minHeight: '550px' }}
              />
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

      {isAiModalOpen && (
        <div className="fixed inset-0 z-[80] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-[820px] rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-white/10 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-600/10 text-violet-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <h3 className="text-[18px] font-black text-zinc-950 dark:text-white leading-none">Asistente de Copys con IA</h3>
                  <p className="mt-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                    Definí el enfoque para redactar un pie de foto optimizado.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(false)}
                className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto flex-1 text-left">
              {/* 1. PRODUCT MODE SELECTION */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  ¿De qué trata el post?
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'none', label: 'General / Negocio', icon: HelpCircle, desc: 'Usa la descripción general de tu negocio.' },
                    { id: 'single', label: 'Un Producto', icon: ShoppingBag, desc: 'Menciona y enlaza a un producto específico.' },
                    { id: 'multiple', label: 'Varios Productos', icon: Tag, desc: 'Muestra múltiples productos del catálogo.' }
                  ].map(opt => {
                    const Icon = opt.icon;
                    const active = productMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setProductMode(opt.id as any);
                          if (opt.id !== 'single') setSelectedProductId('');
                          if (opt.id !== 'multiple') setSelectedProductIds([]);
                          setShowProductDropdown(false);
                          setProductSearchTerm('');
                        }}
                        className={`p-3 rounded-xl border text-left flex flex-col gap-2 transition-all active:scale-[0.99] ${
                          active
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 shadow-sm shadow-violet-500/5'
                            : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/20 hover:bg-zinc-50 dark:hover:bg-white/[0.02]'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${active ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400'}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <div>
                          <p className={`text-[12px] font-black ${active ? 'text-violet-600 dark:text-violet-300' : 'text-zinc-800 dark:text-zinc-200'}`}>{opt.label}</p>
                          <p className="mt-0.5 text-[9.5px] font-semibold leading-tight text-zinc-400 dark:text-zinc-500">{opt.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {productMode === 'single' && (
                  <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-150">
                    <div className="space-y-1.5">
                      <label className="text-[10.5px] font-bold text-zinc-500 dark:text-zinc-400 flex items-center justify-between w-full">
                        <span>Seleccionar producto del catálogo</span>
                        <button
                          type="button"
                          onClick={handleForceSyncCatalog}
                          disabled={syncingCatalog || loadingCatalog}
                          className="text-[10px] text-violet-400 hover:text-violet-300 font-black flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {syncingCatalog ? (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              <span>Sincronizando...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-2.5 h-2.5" />
                              <span>Sincronizar</span>
                            </>
                          )}
                        </button>
                      </label>
                      <div className="relative">
                        {loadingCatalog ? (
                          <div className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-950 text-white px-3 text-[12px] flex items-center gap-2" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Cargando catálogo...</span>
                          </div>
                        ) : (
                          <div className="relative">
                            {/* Trigger Button */}
                            <button
                              type="button"
                              onClick={() => setShowProductDropdown(!showProductDropdown)}
                              className="w-full h-12 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-900 text-white px-3 pr-10 text-[12.5px] font-bold flex items-center gap-2.5 outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer text-left"
                              style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                            >
                              {selectedProductId === 'manual' ? (
                                <>
                                  <span className="w-7 h-7 rounded bg-violet-900/40 text-violet-400 flex items-center justify-center shrink-0">✍</span>
                                  <span className="truncate">✍ Escribir producto manualmente...</span>
                                </>
                              ) : selectedProductId ? (
                                (() => {
                                  const prod = catalog.find(p => (p.id || p.title) === selectedProductId);
                                  return (
                                    <>
                                      {prod?.image ? (
                                        <img src={prod.image} alt="" className="w-7 h-7 rounded object-cover shrink-0 bg-white" />
                                      ) : (
                                        <div className="w-7 h-7 rounded bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-400">
                                          <ShoppingBag className="w-3.5 h-3.5" />
                                        </div>
                                      )}
                                      <div className="truncate flex-1 min-w-0">
                                        <p className="truncate font-black">{prod?.title}</p>
                                        {prod?.price && <p className="text-[10px] text-emerald-400 leading-none mt-0.5">{prod.price}</p>}
                                      </div>
                                    </>
                                  );
                                })()
                              ) : (
                                <>
                                  <div className="w-7 h-7 rounded bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-400">
                                    <ShoppingBag className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="text-zinc-400 font-bold">-- Elegir del catálogo --</span>
                                </>
                              )}
                              <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-4 pointer-events-none" />
                            </button>

                            {/* Dropdown Panel */}
                            {showProductDropdown && (
                              <div className="absolute left-0 right-0 mt-1.5 z-50 rounded-xl border border-zinc-200 dark:border-white/10 bg-[#18181b] shadow-2xl p-2 max-h-[300px] flex flex-col animate-in fade-in slide-in-from-top-2 duration-100" style={{ backgroundColor: '#18181b' }}>
                                {/* Search box */}
                                <div className="relative mb-2">
                                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                                  <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    value={productSearchTerm}
                                    onChange={(e) => setProductSearchTerm(e.target.value)}
                                    className="w-full h-9 pl-9 pr-8 rounded-lg bg-zinc-900 border border-zinc-200 dark:border-white/10 text-white text-[12px] font-semibold outline-none focus:ring-1 focus:ring-violet-500/30"
                                    style={{ backgroundColor: '#09090b', color: '#ffffff' }}
                                  />
                                  {productSearchTerm && (
                                    <button
                                      type="button"
                                      onClick={() => setProductSearchTerm('')}
                                      className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-white"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>

                                {/* Scrollable list */}
                                <div className="overflow-y-auto flex-1 space-y-1 pr-1 custom-scrollbar">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedProductId('');
                                      setShowProductDropdown(false);
                                      setProductSearchTerm('');
                                      setManualProductName('');
                                      setManualProductPrice('');
                                      setManualProductUrl('');
                                    }}
                                    className={`w-full p-2 rounded-lg text-left text-[12px] font-bold flex items-center gap-2.5 hover:bg-zinc-900 transition-colors ${!selectedProductId ? 'bg-zinc-900 text-violet-400' : 'text-zinc-300'}`}
                                  >
                                    <div className="w-7 h-7 rounded bg-zinc-900 flex items-center justify-center shrink-0 border border-dashed border-zinc-700 text-zinc-500">
                                      <X className="w-3.5 h-3.5" />
                                    </div>
                                    <span>Ninguno / Deseleccionar</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedProductId('manual');
                                      setShowProductDropdown(false);
                                      setProductSearchTerm('');
                                    }}
                                    className={`w-full p-2 rounded-lg text-left text-[12px] font-bold flex items-center gap-2.5 hover:bg-zinc-900 transition-colors ${selectedProductId === 'manual' ? 'bg-zinc-900 text-violet-400' : 'text-zinc-300'}`}
                                  >
                                    <div className="w-7 h-7 rounded bg-zinc-900 flex items-center justify-center shrink-0 border border-dashed border-zinc-700 text-zinc-400 font-bold">
                                      ✍
                                    </div>
                                    <span>✍ Escribir producto manualmente...</span>
                                  </button>

                                  {catalog
                                    .filter(p => !productSearchTerm || p.title.toLowerCase().includes(productSearchTerm.toLowerCase()))
                                    .map((p) => {
                                      const isSel = selectedProductId === (p.id || p.title);
                                      return (
                                        <button
                                          key={p.id || p.title}
                                          type="button"
                                          onClick={() => {
                                            setSelectedProductId(p.id || p.title);
                                            setShowProductDropdown(false);
                                            setProductSearchTerm('');
                                          }}
                                          className={`w-full p-2 rounded-lg text-left text-[12px] font-bold flex items-center gap-2.5 hover:bg-zinc-900 transition-colors ${isSel ? 'bg-zinc-900 text-violet-400' : 'text-zinc-300'}`}
                                        >
                                          {p.image ? (
                                            <img src={p.image} alt="" className="w-7 h-7 rounded object-cover shrink-0 bg-white" />
                                          ) : (
                                            <div className="w-7 h-7 rounded bg-zinc-900 flex items-center justify-center shrink-0 text-zinc-500 border border-zinc-800">
                                              <ShoppingBag className="w-3.5 h-3.5" />
                                            </div>
                                          )}
                                          <div className="truncate flex-1 min-w-0">
                                            <p className="truncate font-black">{p.title}</p>
                                            {p.price && <p className="text-[10px] text-emerald-400 leading-none mt-0.5">{p.price}</p>}
                                          </div>
                                          {isSel && <Check className="w-4 h-4 text-violet-400 shrink-0" />}
                                        </button>
                                      );
                                    })}

                                  {catalog.filter(p => !productSearchTerm || p.title.toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && productSearchTerm && (
                                    <p className="text-[11px] text-zinc-500 text-center py-4">No se encontraron productos.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {(selectedProductId === 'manual' || catalog.length === 0) && (
                      <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-zinc-950/30 space-y-3 mt-2 animate-in slide-in-from-top-1">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[10.5px] font-bold text-zinc-500 dark:text-zinc-400">Nombre del producto</label>
                            <input
                              type="text"
                              value={manualProductName}
                              onChange={(e) => setManualProductName(e.target.value)}
                              placeholder="Ej: Crema Hidratante"
                              className="w-full h-9 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-900 text-white px-3 text-[12px] font-semibold placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-violet-500/30"
                              style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10.5px] font-bold text-zinc-500 dark:text-zinc-400">Precio (opcional)</label>
                            <input
                              type="text"
                              value={manualProductPrice}
                              onChange={(e) => setManualProductPrice(e.target.value)}
                              placeholder="Ej: $4500"
                              className="w-full h-9 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-900 text-white px-3 text-[12px] font-semibold placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-violet-500/30"
                              style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10.5px] font-bold text-zinc-500 dark:text-zinc-400">Enlace de compra (opcional)</label>
                          <input
                            type="text"
                            value={manualProductUrl}
                            onChange={(e) => setManualProductUrl(e.target.value)}
                            placeholder="https://mitienda.com/productos/crema"
                            className="w-full h-9 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-900 text-white px-3 text-[12px] font-semibold placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-violet-500/30"
                            style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {productMode === 'multiple' && (
                  <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-150">
                    <div className="space-y-1.5">
                      <label className="text-[10.5px] font-bold text-zinc-500 dark:text-zinc-400 flex items-center justify-between w-full">
                        <span>Seleccionar productos del catálogo ({selectedProductIds.length})</span>
                        <button
                          type="button"
                          onClick={handleForceSyncCatalog}
                          disabled={syncingCatalog || loadingCatalog}
                          className="text-[10px] text-violet-400 hover:text-violet-300 font-black flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {syncingCatalog ? (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              <span>Sincronizando...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-2.5 h-2.5" />
                              <span>Sincronizar</span>
                            </>
                          )}
                        </button>
                      </label>

                      <div className="relative">
                        {loadingCatalog ? (
                          <div className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-950 text-white px-3 text-[12px] flex items-center gap-2" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Cargando catálogo...</span>
                          </div>
                        ) : (
                          <div className="relative">
                            {/* Trigger Button */}
                            <button
                              type="button"
                              onClick={() => setShowProductDropdown(!showProductDropdown)}
                              className="w-full min-h-[48px] rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-900 text-white px-3 py-2 pr-10 text-[12.5px] font-bold flex flex-wrap items-center gap-2 outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer text-left"
                              style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                            >
                              {selectedProductIds.length === 0 ? (
                                <>
                                  <div className="w-7 h-7 rounded bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-400">
                                    <ShoppingBag className="w-3.5 h-3.5" />
                                  </div>
                                  <span className="text-zinc-400 font-bold">-- Elegir productos --</span>
                                </>
                              ) : (
                                <div className="flex flex-wrap gap-1.5 py-0.5">
                                  {selectedProductIds.map(id => {
                                    const prod = catalog.find(p => (p.id || p.title) === id);
                                    if (!prod) return null;
                                    return (
                                      <div key={id} className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 text-white rounded-lg pl-1.5 pr-1 py-0.5 text-[11px] font-bold animate-in zoom-in-95">
                                        {prod.image && <img src={prod.image} alt="" className="w-4 h-4 rounded-sm object-cover bg-white" />}
                                        <span className="max-w-[120px] truncate">{prod.title}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedProductIds(prev => prev.filter(x => x !== id));
                                          }}
                                          className="w-4 h-4 rounded-full hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white"
                                        >
                                          <X className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-4 pointer-events-none" />
                            </button>

                            {/* Dropdown Panel */}
                            {showProductDropdown && (
                              <div className="absolute left-0 right-0 mt-1.5 z-50 rounded-xl border border-zinc-200 dark:border-white/10 bg-[#18181b] shadow-2xl p-2 max-h-[300px] flex flex-col animate-in fade-in slide-in-from-top-2 duration-100" style={{ backgroundColor: '#18181b' }}>
                                {/* Search box */}
                                <div className="relative mb-2">
                                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                                  <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    value={productSearchTerm}
                                    onChange={(e) => setProductSearchTerm(e.target.value)}
                                    className="w-full h-9 pl-9 pr-8 rounded-lg bg-zinc-900 border border-zinc-200 dark:border-white/10 text-white text-[12px] font-semibold outline-none focus:ring-1 focus:ring-violet-500/30"
                                    style={{ backgroundColor: '#09090b', color: '#ffffff' }}
                                  />
                                  {productSearchTerm && (
                                    <button
                                      type="button"
                                      onClick={() => setProductSearchTerm('')}
                                      className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-white"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>

                                {/* Scrollable list */}
                                <div className="overflow-y-auto flex-1 space-y-1 pr-1 custom-scrollbar">
                                  {catalog
                                    .filter(p => !productSearchTerm || p.title.toLowerCase().includes(productSearchTerm.toLowerCase()))
                                    .map((p) => {
                                      const pId = p.id || p.title;
                                      const isSel = selectedProductIds.includes(pId);
                                      return (
                                        <button
                                          key={pId}
                                          type="button"
                                          onClick={() => {
                                            setSelectedProductIds(prev =>
                                              prev.includes(pId)
                                                ? prev.filter(id => id !== pId)
                                                : [...prev, pId]
                                            );
                                          }}
                                          className={`w-full p-2 rounded-lg text-left text-[12px] font-bold flex items-center gap-2.5 hover:bg-zinc-900 transition-colors ${isSel ? 'bg-zinc-900 text-violet-400' : 'text-zinc-300'}`}
                                        >
                                          {p.image ? (
                                            <img src={p.image} alt="" className="w-7 h-7 rounded object-cover shrink-0 bg-white" />
                                          ) : (
                                            <div className="w-7 h-7 rounded bg-zinc-900 flex items-center justify-center shrink-0 text-zinc-500 border border-zinc-800">
                                              <ShoppingBag className="w-3.5 h-3.5" />
                                            </div>
                                          )}
                                          <div className="truncate flex-1 min-w-0">
                                            <p className="truncate font-black">{p.title}</p>
                                            {p.price && <p className="text-[10px] text-emerald-400 leading-none mt-0.5">{p.price}</p>}
                                          </div>
                                          {isSel && <Check className="w-4 h-4 text-violet-400 shrink-0" />}
                                        </button>
                                      );
                                    })}

                                  {catalog.filter(p => !productSearchTerm || p.title.toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && productSearchTerm && (
                                    <p className="text-[11px] text-zinc-500 text-center py-4">No se encontraron productos.</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. POST GOAL */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Objetivo de la publicación
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: 'viral', label: 'Viral / Interacción', icon: Sparkles, desc: 'Enganchar rápido, viralizar y compartir.' },
                    { id: 'sales', label: 'Venta Directa', icon: ShoppingBag, desc: 'Llamado a la acción directo de compra.' },
                    { id: 'edu', label: 'Educativo / Valor', icon: BookOpen, desc: 'Tutoriales, tips, beneficios y cómo usar.' },
                    { id: 'promo', label: 'Promocional', icon: Tag, desc: 'Destacar ofertas, descuentos o ventajas.' },
                    { id: 'interactive', label: 'Interacción / Sorteo', icon: Award, desc: 'Generar comentarios, sorteos, preguntas.' }
                  ].map(opt => {
                    const Icon = opt.icon;
                    const active = postGoal === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPostGoal(opt.id as any)}
                        className={`p-2.5 rounded-xl border text-left flex gap-2.5 items-start transition-all active:scale-[0.99] ${
                          active
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 shadow-sm shadow-violet-500/5'
                            : 'border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950/20 hover:bg-zinc-50 dark:hover:bg-white/[0.02]'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-violet-500 text-white' : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400'}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className={`text-[12.5px] font-black leading-tight truncate ${active ? 'text-violet-600 dark:text-violet-300' : 'text-zinc-800 dark:text-zinc-200'}`}>{opt.label}</p>
                          <p className="mt-0.5 text-[9px] font-semibold leading-snug text-zinc-400 dark:text-zinc-500 line-clamp-2">{opt.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. POST TONE */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Tono del Post
                </label>
                <div className="relative">
                  <select
                    value={postTone}
                    onChange={(e) => setPostTone(e.target.value as any)}
                    className="w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-900 text-white px-3 pr-8 text-[12.5px] font-bold outline-none focus:ring-2 focus:ring-violet-500/30 appearance-none cursor-pointer"
                    style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                  >
                    <option value="default" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>Por defecto (usar tono del negocio)</option>
                    <option value="casual" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>Casual (cercano, divertido, directo)</option>
                    <option value="energetic" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>Enérgico (motivador, entusiasta, persuasivo)</option>
                    <option value="professional" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>Profesional (educado, serio, formal)</option>
                    <option value="direct" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>Directo al grano (minimalista, limpio)</option>
                    <option value="storytelling" style={{ backgroundColor: '#18181b', color: '#ffffff' }}>Storytelling (narrativo, enfocado en anécdota)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* 4. CREATIVE DESCRIPTION */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  ¿De qué trata el video?
                </label>
                <textarea
                  value={creativeDescription}
                  onChange={(e) => setCreativeDescription(e.target.value)}
                  placeholder="Ej: Un video mostrando los pasos para aplicar la mascarilla de noche y el brillo hidratado de la piel al despertar..."
                  className="w-full min-h-[76px] max-h-[140px] resize-y rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-900 text-white px-3 py-2 text-[12.5px] font-semibold placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-violet-500/30"
                  style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                />
              </div>

              {/* 5. COPY FOCUS */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  ¿Cómo quieres que se enfoque el copy / video?
                </label>
                <textarea
                  value={videoFocus}
                  onChange={(e) => setVideoFocus(e.target.value)}
                  placeholder="Ej: Enfocarse en los ingredientes naturales, en los resultados rápidos o en el descuento del 15%..."
                  className="w-full min-h-[76px] max-h-[140px] resize-y rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-900 text-white px-3 py-2 text-[12.5px] font-semibold placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-violet-500/30"
                  style={{ backgroundColor: '#18181b', color: '#ffffff' }}
                />
              </div>
            </div>

            <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-950/25 border-t border-zinc-100 dark:border-white/10 flex flex-col sm:flex-row gap-2 sm:justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsAiModalOpen(false)}
                disabled={generatingCaption}
                className="h-11 px-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-[13px] font-black text-zinc-600 dark:text-zinc-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateAiCaption}
                disabled={generatingCaption || (productMode === 'single' && !selectedProductId && !manualProductName.trim())}
                className="h-11 px-5 rounded-xl bg-zinc-950 dark:bg-violet-600 text-white text-[13px] font-black flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {generatingCaption ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generar Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
