import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { supabase } from '../services/supabase';
import { metaAds } from '../services/metaAds';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import {
  Upload, Film, Image, Zap, CheckCircle, AlertCircle, XCircle,
  RefreshCw, Loader2, Target, Brain, Eye, ChevronRight, Layers,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';

const clampDuration = (seconds?: number | null) => {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(900, Math.round(n))) : 30;
};

const formatDuration = (seconds?: number | null) => {
  const total = clampDuration(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const getRemoteVideoDuration = (url?: string | null): Promise<number> => {
  if (!url) return Promise.resolve(0);
  return new Promise(resolve => {
    const video = document.createElement('video');
    let done = false;
    const finish = (value = 0) => {
      if (done) return;
      done = true;
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(0), 5000);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.onerror = () => {
      window.clearTimeout(timer);
      finish(0);
    };
    video.src = url;
  });
};

// Generate a second-by-second attention/emotion/impact curve across the creative duration.
const genTimeline = (attn: number, emot: number, cogLoad: number, seed: number, durationSec = 30): { t: number; attn: number; emot: number; impact: number }[] => {
  const duration = clampDuration(durationSec);
  return Array.from({ length: duration + 1 }, (_, t) => {
    const progress = duration <= 1 ? 0 : t / duration;
    const hookBoost = Math.max(0, 1 - t / 3) * 0.22;
    const midDip = Math.sin(progress * Math.PI) * -0.08;
    const endLift = progress > 0.72 ? (progress - 0.72) * 0.22 : 0;
    const noise = (((seed + t * 17) % 13) - 6) / 100;
    const emotionArc = -0.12 + Math.sin(progress * Math.PI * 1.15) * 0.18 + endLift * 0.45;
    const a = Math.max(8, Math.min(99, Math.round(attn * (1 + hookBoost + midDip + noise))));
    const e = Math.max(8, Math.min(99, Math.round(emot * (1 + emotionArc + noise * 0.7))));
    const imp = Math.max(8, Math.min(99, Math.round(a * 0.4 + e * 0.4 + (100 - cogLoad) * 0.2)));
    return { t, attn: a, emot: e, impact: imp };
  });
};

const TimelineTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-950/95 px-3 py-2 shadow-xl backdrop-blur-md">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mb-1">{label}s</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-[11px] font-bold">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="text-zinc-800 dark:text-zinc-100">{entry.value}%</span>
        </div>
      ))}
    </div>
  );
};

// ── Frame extractor ───────────────────────────────────────────────────────────
async function extractFrames(file: File, maxFrames = 12): Promise<{ frames: string[]; durationSec: number }> {
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

// ── Score badge ───────────────────────────────────────────────────────────────
const scoreCls = (score: number) =>
  score >= 80 ? 'bg-emerald-500 text-white shadow-emerald-200' :
  score >= 60 ? 'bg-amber-500 text-white shadow-amber-200' :
  'bg-red-500 text-white shadow-red-200';

const scoreLabel = (score: number) =>
  score >= 80 ? 'Listo para escalar' : score >= 60 ? 'Requiere ajustes' : 'Revisar antes de pautar';

const providerLabel = (provider?: string) => {
  if (provider === 'tribev2') return 'TRIBE v2';
  return 'TRIBE v2';
};

const firstAttachmentImage = (post: any) => {
  const attachment = post?.attachments?.data?.[0];
  return attachment?.media?.image?.src || attachment?.subattachments?.data?.[0]?.media?.image?.src || post?.full_picture || '';
};

const normalizeCreativeItem = (item: any) => ({
  ...item,
  id: String(item.id),
  name: item.name || item.caption || item.message || item.title || `Creativo ${item.id}`,
  platformLabel: item.platformLabel || 'Cuenta',
});

// ── Bar metric ────────────────────────────────────────────────────────────────
const MetricBar = ({ label, value, color, reason, threshold }: { label: string; value: number; color: string; reason?: string; threshold?: string }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">{label}</span>
        {threshold && <span className="text-[9px] text-zinc-400 dark:text-zinc-600 font-semibold">{threshold}</span>}
      </div>
      <span className={`text-[13px] font-black ${color.includes('emerald') ? 'text-emerald-600 dark:text-emerald-400' : color.includes('amber') ? 'text-amber-600 dark:text-amber-400' : color.includes('red') ? 'text-red-500' : 'text-zinc-900 dark:text-white'}`}>{value}%</span>
    </div>
    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${value}%` }} />
    </div>
    {reason && <p className="text-[10px] text-zinc-400 mt-1 leading-snug">{reason}</p>}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
export default function CreativeTesterPage() {
  const { profile: authProfile, loading: authLoading, session } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const [pageLoading, setPageLoading] = useState(true);
  useEffect(() => {
    if (!authLoading) {
      setPageLoading(false);
    }
  }, [authLoading]);

  const [activeSource, setActiveSource] = useState<'upload' | 'account'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle');
  const [step, setStep] = useState('');
  const [result, setResult] = useState<any>(null);
  const [score, setScore] = useState(0);
  const [analysisError, setAnalysisError] = useState('');
  const [timeline, setTimeline] = useState<{ t: number; attn: number; emot: number; impact: number }[]>([]);
  const [analysisDurationSec, setAnalysisDurationSec] = useState(30);

  // For account creatives
  const [accountAds, setAccountAds] = useState<any[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [resolvedDetails, setResolvedDetails] = useState<Record<string, any>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAccountAds = async () => {
    const clientId = (profile as any)?.id;
    if (!clientId) return;
    setAdsLoading(true);
    try {
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || '';
      const accountId = (profile as any)?.meta_account_id;
      const igId = (profile as any)?.ig_business_id;
      const fbPageId = (profile as any)?.fb_page_id;
      const youtubeConnected = !!((profile as any)?.youtube_access_token || (profile as any)?.youtube_channel_id);

      const resolveAd = async (ad: any) => {
        const params = new URLSearchParams();
        if (ad.id) params.set('adId', ad.id);
        if (ad.creative?.id) params.set('creativeId', ad.creative.id);
        if (ad.creative?.video_id) params.set('videoId', ad.creative.video_id);
        if (clientId) params.set('clientId', clientId);
        const r = await fetch(`/api/meta-video?${params}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).catch(() => null);
        if (r?.ok) {
          const d = await r.json();
          setResolvedDetails(prev => ({ ...prev, [ad.id]: d }));
          return;
        }

        if (ad.creative?.video_id && token) {
          const videoParams = new URLSearchParams({
            action: 'graph',
            path: String(ad.creative.video_id),
            fields: 'source,picture,format',
          });
          if (clientId) videoParams.set('clientId', clientId);
          const graphRes = await fetch(`/api/meta-video?${videoParams}`, {
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => null);
          if (graphRes?.ok) {
            const data = await graphRes.json();
            const formats = Array.isArray(data?.format) ? data.format : [];
            const best = [...formats].sort((a: any, b: any) => (b.width || 0) - (a.width || 0))[0];
            setResolvedDetails(prev => ({
              ...prev,
              [ad.id]: {
                type: 'video_source',
                source: data?.source || null,
                picture: best?.picture || data?.picture || ad.creative?.thumbnail_url || ad.creative?.image_url || null,
              },
            }));
          }
        }
      };

      const loaded: any[] = [];

      if (accountId) {
        const res = await metaAds.getAccountAds(accountId);
        loaded.push(...(res.data || [])
          .filter((a: any) => (a.effective_status || a.status) === 'ACTIVE')
          .map((ad: any) => normalizeCreativeItem({ ...ad, platformLabel: 'Meta Ads', sourceType: 'meta_ad' })));
      }

      if (igId) {
        const igRes = await metaAds.getInstagramMedia(igId, 18, undefined, fbPageId || undefined).catch(() => ({ data: [] }));
        loaded.push(...(igRes.data || []).map((post: any) => normalizeCreativeItem({
          id: `ig_${post.id}`,
          originalId: post.id,
          name: post.caption || 'Post de Instagram',
          platformLabel: 'Instagram',
          sourceType: 'instagram_post',
          creative: {
            image_url: post.media_url,
            thumbnail_url: post.thumbnail_url || post.children?.data?.[0]?.thumbnail_url || post.children?.data?.[0]?.media_url,
          },
          mediaUrl: post.media_url,
          permalink: post.permalink,
          isVideo: post.media_type === 'VIDEO' || post.media_type === 'REELS',
        })));
      }

      if (fbPageId) {
        const fbRes = await metaAds.getFacebookPageFeed(fbPageId, 18).catch(() => ({ data: [] }));
        loaded.push(...(fbRes.data || []).map((post: any) => normalizeCreativeItem({
          id: `fb_${post.id}`,
          originalId: post.id,
          name: post.message || 'Post de Facebook',
          platformLabel: 'Facebook',
          sourceType: 'facebook_post',
          creative: {
            image_url: firstAttachmentImage(post),
            thumbnail_url: firstAttachmentImage(post),
          },
          mediaUrl: firstAttachmentImage(post),
          permalink: post.permalink_url,
          isVideo: post.attachments?.data?.some((a: any) => String(a.type || '').includes('video')),
        })));
      }

      if (youtubeConnected) {
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const ytRes = await fetch(`/api/oauth?action=youtube-posts&clientId=${encodeURIComponent(clientId)}`, { headers }).then(r => r.json()).catch(() => ({ items: [] }));
        loaded.push(...(ytRes.items || []).map((item: any) => normalizeCreativeItem({
          id: `yt_${item.id?.videoId || item.id || item.etag}`,
          originalId: item.id?.videoId || item.id,
          name: item.snippet?.title || 'YouTube Short',
          platformLabel: 'YouTube Shorts',
          sourceType: 'youtube_short',
          creative: {
            image_url: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
            thumbnail_url: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
          },
          mediaUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
          permalink: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : '',
          isVideo: true,
        })));
      }

      const { data: publishedRows } = await supabase
        .from('car_social_publications')
        .select('id, caption, video_url, selected_channels, status, published_at, created_at')
        .eq('client_id', clientId)
        .in('status', ['published', 'processing', 'scheduled'])
        .order('created_at', { ascending: false })
        .limit(24);
      loaded.push(...(publishedRows || []).map((row: any) => normalizeCreativeItem({
        id: `pub_${row.id}`,
        originalId: row.id,
        name: row.caption || 'Publicación del publicador',
        platformLabel: Array.isArray(row.selected_channels) ? row.selected_channels.join(', ') : 'Publicador',
        sourceType: 'published_post',
        creative: { image_url: row.video_url, thumbnail_url: row.video_url },
        mediaUrl: row.video_url,
        isVideo: true,
      })));

      const unique = Array.from(new Map(loaded.filter(item => item.creative?.image_url || item.creative?.thumbnail_url || item.mediaUrl).map(item => [item.id, item])).values());
      setAccountAds(unique);
      setAdsLoading(false);

      const ads = unique.filter((item: any) => item.sourceType === 'meta_ad');
      for (let i = 0; i < ads.length; i += 6) {
        await Promise.allSettled(ads.slice(i, i + 6).map(resolveAd));
        await new Promise(resolve => window.setTimeout(resolve, 120));
      }
    } catch (e) { /* ignore */ }
    setAdsLoading(false);
  };

  const handleFile = (f: File) => {
    const isValid = f.type.startsWith('video') || f.type.startsWith('image');
    if (!isValid) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStatus('idle');
    setResult(null);
    setTimeline([]);
    setAnalysisDurationSec(30);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const analyze = async (sourceFile?: File, adThumbnailUrl?: string, adName?: string, options?: { isVideo?: boolean; durationSec?: number; videoUrl?: string | null }) => {
    setStatus('analyzing');
    setResult(null);
    setAnalysisError('');
    const isVideo = sourceFile ? sourceFile.type.startsWith('video') : !!options?.isVideo;
    let durationSec = isVideo ? clampDuration(options?.durationSec) : 30;

    try {
      let frames: string[] = [];
      if (sourceFile) {
        setStep('Extrayendo fotogramas...');
        const extracted = await extractFrames(sourceFile);
        frames = extracted.frames;
        durationSec = isVideo ? clampDuration(extracted.durationSec) : 30;
      } else if (adThumbnailUrl) {
        setStep('Cargando imagen del anuncio...');
        if (isVideo && options?.videoUrl && !options?.durationSec) {
          const remoteDuration = await getRemoteVideoDuration(options.videoUrl);
          durationSec = clampDuration(remoteDuration || durationSec);
        }
        // Fetch thumbnail as base64
        try {
          const r = await fetch(adThumbnailUrl);
          const blob = await r.blob();
          const b64 = await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target?.result as string);
            reader.readAsDataURL(blob);
          });
          const canvas = document.createElement('canvas');
          const img = document.createElement('img');
          await new Promise(resolve => { img.onload = resolve; img.src = b64; });
          const scale = Math.min(1, 256 / Math.max(img.width, 1));
          canvas.width = Math.floor(img.width * scale);
          canvas.height = Math.floor(img.height * scale);
          canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
          frames = [canvas.toDataURL('image/jpeg', 0.6)];
        } catch { frames = []; }
      }

      setStep('Analizando respuesta visual...');
      let analysisResult: any = null;

      if (frames.length > 0) {
        try {
          const { data: { session: freshSession } } = await supabase.auth.getSession();
          const token = freshSession?.access_token || '';
          const r = await fetch('/api/scrape-all', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ type: 'analyze-creative', frames, isVideo, durationSec }),
          });
          const payload = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(payload.detail || payload.error || 'TRIBE v2 no pudo analizar el creativo.');
          analysisResult = payload;
        } catch (err: any) {
          throw new Error(err?.message || 'TRIBE v2 no pudo analizar el creativo.');
        }
      }

      if (!analysisResult) {
        throw new Error('No se pudo preparar el creativo para TRIBE v2.');
      }

      const finalScore = Math.floor(
        analysisResult.attentionPct * 0.4 +
        analysisResult.emotionPct * 0.4 +
        (100 - analysisResult.cogLoad) * 0.2
      );
      setScore(finalScore);
      setResult(analysisResult);
      setAnalysisDurationSec(durationSec);
      setTimeline(genTimeline(analysisResult.attentionPct, analysisResult.emotionPct, analysisResult.cogLoad, finalScore, durationSec));
      setStatus('done');
    } catch (err: any) {
      setStatus('error');
      setAnalysisError(err?.message || 'Error al analizar el creativo con TRIBE v2.');
      setStep('TRIBE v2 no pudo completar el análisis.');
    }
  };

  const handleAnalyzeUpload = () => { if (file) analyze(file); };

  const handleSelectAd = (ad: any) => {
    setSelectedAd(ad);
    setStatus('idle');
    setResult(null);
    setTimeline([]);
    setAnalysisDurationSec(30);
  };

  const handleAnalyzeSelectedAd = () => {
    if (!selectedAd) return;
    const details = resolvedDetails[selectedAd.id];
    const thumbUrl = details?.picture || details?.url || details?.cards?.[0]?.url || selectedAd.creative?.image_url || selectedAd.creative?.thumbnail_url || selectedAd.mediaUrl;
    const isVid = selectedAd.isVideo || details?.type === 'video_source' || !!selectedAd.creative?.video_id;
    if (thumbUrl) analyze(undefined, thumbUrl, selectedAd.name || 'anuncio', {
      isVideo: isVid,
      durationSec: details?.duration || details?.durationSec,
      videoUrl: details?.source || selectedAd.mediaUrl,
    });
    else {
      setResult(null);
      setTimeline([]);
      setAnalysisError('Este anuncio no tiene imagen o video disponible para enviar a TRIBE v2.');
      setStatus('error');
    }
  };

  return (
    <CenteredPageLoader isLoading={pageLoading || authLoading}>
      <div className="w-full animate-fade-in pb-20 pt-3 md:pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Creativos Tester</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium">Análisis Creativo — Simulación de respuesta visual y emocional.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* LEFT — Source selector */}
          <div className="space-y-4">
            {/* Source tabs */}
            <div className="flex items-center gap-1 border-b border-zinc-100 dark:border-zinc-800 mb-4">
              {[
                { id: 'upload', label: 'Subir archivo', icon: Upload },
                { id: 'account', label: 'Desde cuenta', icon: Layers },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveSource(t.id as any);
                    if (t.id === 'account' && accountAds.length === 0) loadAccountAds();
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold border-b-2 -mb-px transition-all ${activeSource === t.id ? 'border-violet-500 text-violet-600 dark:text-violet-400' : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
                >
                  <t.icon className="w-3.5 h-3.5" />{t.label}
                </button>
              ))}
            </div>

            {activeSource === 'upload' && (
              <div className="space-y-4">
                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-violet-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/30'}`}
                >
                  <input ref={fileInputRef} type="file" accept="video/*,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  {previewUrl && file ? (
                    <div className="space-y-3">
                      {file.type.startsWith('video') ? (
                        <video src={previewUrl} className="max-h-48 mx-auto rounded-xl" controls muted {...{ referrerPolicy: "no-referrer" }} />
                      ) : (
                        <img src={previewUrl} alt="preview" className="max-h-48 mx-auto rounded-xl object-contain" referrerPolicy="no-referrer" />
                      )}
                      <div className="flex items-center justify-center gap-2 text-[12px] text-zinc-500">
                        {file.type.startsWith('video') ? <Film className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />}
                        <span className="font-medium truncate max-w-[200px]">{file.name}</span>
                        <span className="text-zinc-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                      </div>
                      <p className="text-[11px] text-violet-500 font-bold">Clic para cambiar</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center mx-auto">
                        <Upload className="w-6 h-6 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-[14px] font-bold text-zinc-700 dark:text-zinc-300">Arrastrá o hacé clic</p>
                        <p className="text-[12px] text-zinc-400 mt-1">Video (.mp4, .mov, .webm) o Imagen (.jpg, .png, .webp)</p>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleAnalyzeUpload}
                  disabled={!file || status === 'analyzing'}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-[13px] font-black shadow-lg shadow-violet-200 dark:shadow-none transition-all"
                >
                  {status === 'analyzing' ? <><Loader2 className="w-4 h-4 animate-spin" />{step || 'Analizando...'}</> : <><Zap className="w-4 h-4" />Analizar creativo</>}
                </button>
              </div>
            )}

            {activeSource === 'account' && (
              <div className="space-y-3">
                {!((profile as any)?.meta_account_id || (profile as any)?.ig_business_id || (profile as any)?.fb_page_id || (profile as any)?.youtube_access_token || (profile as any)?.tiktok_content_access_token) && (
                  <div className="text-center py-8 text-[12px] text-zinc-400">No hay cuentas sociales conectadas para traer creativos.</div>
                )}
                {adsLoading && <div className="flex items-center justify-center py-12 gap-2 text-[12px] text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" />Cargando creativos...</div>}
                {!adsLoading && accountAds.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-1">
                      {accountAds.map(ad => {
                        const det = resolvedDetails[ad.id];
                        const thumb = det?.picture || det?.url || det?.cards?.[0]?.url || ad.creative?.image_url || ad.creative?.thumbnail_url;
                        const isSelected = selectedAd?.id === ad.id;
                        return (
                          <button
                            key={ad.id}
                            onClick={() => handleSelectAd(ad)}
                            className={`rounded-xl overflow-hidden border-2 transition-all text-left ${isSelected ? 'border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700' : 'border-zinc-200 dark:border-zinc-700 hover:border-violet-400'}`}
                          >
                            <div className="aspect-square bg-zinc-100 dark:bg-zinc-800 relative flex items-center justify-center overflow-hidden">
                              {thumb ? (
                                <>
                                  <img src={thumb} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-40" aria-hidden />
                                  <img src={thumb} alt={ad.name} referrerPolicy="no-referrer" className="relative z-10 w-full h-full object-contain" />
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center"><Film className="w-6 h-6 text-zinc-400" /></div>
                              )}
                            </div>
                            <div className="p-2">
                              <span className="mb-1 inline-flex max-w-full rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-500 truncate">{ad.platformLabel}</span>
                              <p className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 truncate">{ad.name || `Anuncio ${ad.id}`}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {selectedAd && (
                      <button
                        onClick={handleAnalyzeSelectedAd}
                        disabled={status === 'analyzing'}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-[13px] font-black shadow-lg shadow-violet-200 dark:shadow-none transition-all"
                      >
                        {status === 'analyzing' ? <><Loader2 className="w-4 h-4 animate-spin" />{step || 'Analizando...'}</> : <><Zap className="w-4 h-4" />Analizar creativo seleccionado</>}
                      </button>
                    )}
                  </>
                )}
                {!adsLoading && accountAds.length === 0 && ((profile as any)?.meta_account_id || (profile as any)?.ig_business_id || (profile as any)?.fb_page_id || (profile as any)?.youtube_access_token || (profile as any)?.tiktok_content_access_token) && (
                  <div className="text-center py-8">
                    <p className="text-[12px] text-zinc-400">Sin creativos encontrados en las cuentas conectadas.</p>
                    <button onClick={loadAccountAds} className="mt-2 text-[11px] text-violet-500 hover:underline font-bold flex items-center gap-1 mx-auto"><RefreshCw className="w-3 h-3" />Recargar</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — Results */}
          <div>
            {status === 'idle' && !result && (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <Target className="w-7 h-7 text-zinc-400" />
                </div>
                <p className="text-[14px] font-semibold text-zinc-550">Subí un creativo o elegí un anuncio</p>
                <p className="text-[12px] text-zinc-400 max-w-xs">Analizará la atención, emoción y carga cognitiva de tu creativo.</p>
              </div>
            )}

            {status === 'analyzing' && (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4">
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-4 border-violet-200 dark:border-violet-900" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-violet-600 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Brain className="w-7 h-7 text-violet-500" />
                  </div>
                </div>
                <p className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">{step || 'Procesando...'}</p>
                <p className="text-[11px] text-zinc-400">Analizando respuesta visual y emocional...</p>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/25 border border-red-100 dark:border-red-900/50 flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 text-red-500" />
                </div>
                <div>
                  <p className="text-[14px] font-black text-zinc-900 dark:text-white">TRIBE v2 no pudo analizar este creativo</p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 max-w-sm mt-2">
                    {analysisError || 'Revisá que TRIBE_V2_API_URL esté configurado y que el servicio esté activo.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setStatus('idle'); setAnalysisError(''); }}
                  className="h-10 px-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[12px] font-bold"
                >
                  Reintentar
                </button>
              </div>
            )}

            {status === 'done' && result && (
              <div className="space-y-5">
                {/* Score circle */}
                <div className="flex items-center gap-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5">
                  <div className={`w-20 h-20 rounded-full flex flex-col items-center justify-center shadow-lg ${scoreCls(score)}`}>
                    <span className="text-[24px] font-black leading-none">{score}</span>
                    <span className="text-[9px] font-bold opacity-80">/100</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-black text-zinc-900 dark:text-white">{scoreLabel(score)}</p>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Motor: <span className="font-bold text-violet-600 dark:text-violet-400">{providerLabel(result.provider)}</span>
                      <span className="mx-1.5">·</span>
                      Región dominante: <span className="font-bold text-violet-600 dark:text-violet-400">{result.highestRegion}</span>
                    </p>
                  </div>
                </div>

                {/* Metrics */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
                  <MetricBar
                    label="Atención"
                    value={result.attentionPct}
                    color={result.attentionPct >= 75 ? 'bg-emerald-500' : result.attentionPct >= 60 ? 'bg-amber-500' : 'bg-red-500'}
                    reason={result.attentionReason}
                    threshold="bueno ≥75%"
                  />
                  <MetricBar
                    label="Emoción"
                    value={result.emotionPct}
                    color={result.emotionPct >= 70 ? 'bg-emerald-500' : result.emotionPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}
                    reason={result.emotionReason}
                    threshold="bueno ≥70%"
                  />
                  <MetricBar
                    label="Carga Cognitiva"
                    value={result.cogLoad}
                    color={result.cogLoad <= 30 ? 'bg-emerald-500' : result.cogLoad <= 50 ? 'bg-amber-500' : 'bg-red-500'}
                    reason={result.cogLoadReason}
                    threshold="óptimo ≤30%"
                  />
                </div>

                {/* Curva de Atención, Emoción e Impacto en el tiempo */}
                {timeline.length > 0 && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Curva de Respuesta ({formatDuration(analysisDurationSec)})</p>
                      <div className="flex items-center gap-3 text-[9px] font-bold text-zinc-400">
                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded-full" />Atención</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-violet-500 inline-block rounded-full" />Emoción</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block rounded-full" />Impacto</span>
                      </div>
                    </div>
                    <div className="h-[150px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeline} margin={{ left: -15, right: 4, top: 4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" className="dark:[stroke:rgba(255,255,255,0.04)]" />
                          <XAxis dataKey="t" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}s`} />
                          <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}`} width={22} />
                          <Tooltip content={<TimelineTooltip />} cursor={{ stroke: '#a78bfa', strokeWidth: 1, strokeDasharray: '3 3' }} />
                          <Line type="monotone" dataKey="attn" name="Atención" stroke="#10b981" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="emot" name="Emoción" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="impact" name="Impacto" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <button onClick={() => { setStatus('idle'); setResult(null); setFile(null); setPreviewUrl(null); setSelectedAd(null); setTimeline([]); setAnalysisDurationSec(30); }} className="w-full text-[12px] font-bold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 py-2 transition-colors">
                  Analizar otro creativo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </CenteredPageLoader>
  );
}
