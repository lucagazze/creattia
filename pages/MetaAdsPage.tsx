import React, { useEffect, useState, useRef } from 'react';
import { metaAds, daysAgo, today, presetToRange } from '../services/metaAds';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import {
  Layers, Film, X, Download, Loader2, ImageIcon, RefreshCw, ChevronLeft, ChevronRight, Calendar, ChevronDown
} from 'lucide-react';

// ── Creative Preview Modal ─────────────────────────────────────────────
const CreativePreviewModal = ({ preview, prefetchedData, onClose }: {
  preview: { url: string; isVideo: boolean; videoId?: string; adId?: string; creativeId?: string; name?: string; effectiveObjectStoryId?: string; };
  prefetchedData?: any;
  onClose: () => void;
}) => {
  const [loading, setLoading] = React.useState(true);
  const [mediaData, setMediaData] = React.useState<{
    type: 'video_source' | 'carousel' | 'image' | 'ad_preview' | 'none';
    source?: string | null;
    picture?: string | null;
    embed_html?: string | null;
    url?: string | null;
    cards?: Array<{ url: string; isVideo: boolean; videoSrc?: string; name?: string }>;
  } | null>(null);

  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    if (prefetchedData && prefetchedData.type && prefetchedData.type !== 'failed' && prefetchedData.type !== 'none') {
      setMediaData(prefetchedData);
      setLoading(false);
      setActiveIndex(0);
      return;
    }

    setLoading(true);
    setMediaData(null);
    setActiveIndex(0);

    const params = new URLSearchParams();
    if (preview.adId) params.set('adId', preview.adId);
    if (preview.creativeId) params.set('creativeId', preview.creativeId);
    if (preview.videoId) params.set('videoId', preview.videoId);

    fetch(`/api/meta-video?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.type && d.type !== 'none') {
          setMediaData(d);
        } else {
          setMediaData({
            type: preview.isVideo ? 'none' : 'image',
            url: preview.url,
            embed_html: null
          });
        }
      })
      .catch(() => {
        setMediaData({
          type: preview.isVideo ? 'none' : 'image',
          url: preview.url,
          embed_html: null
        });
      })
      .finally(() => setLoading(false));
  }, [preview.adId, preview.creativeId, preview.videoId, preview.isVideo, preview.url, prefetchedData]);
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const nextSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!mediaData?.cards) return;
    setActiveIndex((prev) => (prev + 1) % mediaData.cards!.length);
  };

  const prevSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!mediaData?.cards) return;
    setActiveIndex((prev) => (prev - 1 + mediaData.cards!.length) % mediaData.cards!.length);
  };

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-150" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-20"><X className="w-5 h-5" /></button>
      {preview.name && (
        <div className="absolute top-4 left-4 right-16 z-20">
          <p className="text-white/80 text-[13px] font-bold truncate max-w-[70vw]">{preview.name}</p>
          {preview.isVideo && (
            <div className="inline-flex items-center gap-1 mt-1 bg-white/10 px-2 py-0.5 rounded-full">
              <Film className="w-3 h-3 text-white/60" />
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Video</span>
            </div>
          )}
        </div>
      )}
      <div className="relative animate-in zoom-in-95 duration-200 flex items-center justify-center" style={{ maxWidth: '90vw', maxHeight: '88vh' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        {loading ? (
          <div className="w-[min(90vw,560px)] h-[min(88vh,420px)] rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-zinc-700 border-t-violet-500 animate-spin" />
            <span className="text-[12px] font-bold text-zinc-500">Cargando creativo...</span>
          </div>
        ) : mediaData ? (
          <>
            {mediaData.type === 'carousel' && mediaData.cards && mediaData.cards.length > 0 && (() => {
              const activeCard = mediaData.cards[activeIndex];
              return (
                <div className="flex flex-col items-center">
                  <div className="relative flex items-center justify-center min-h-[300px]" style={{ maxWidth: '90vw' }}>
                    {mediaData.cards.length > 1 && (
                      <>
                        <button onClick={prevSlide} className="absolute left-2 md:left-[-60px] p-2.5 md:p-3 rounded-full bg-white/15 md:bg-white/10 hover:bg-white/25 md:hover:bg-white/20 text-white transition-all hover:scale-105 z-30">
                          <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
                        </button>
                        <button onClick={nextSlide} className="absolute right-2 md:right-[-60px] p-2.5 md:p-3 rounded-full bg-white/15 md:bg-white/10 hover:bg-white/25 md:hover:bg-white/20 text-white transition-all hover:scale-105 z-30">
                          <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                        </button>
                      </>
                    )}
                    {activeCard.isVideo && activeCard.videoSrc ? (
                      <div className="flex flex-col items-center gap-4">
                        <video src={activeCard.videoSrc} controls autoPlay={false} playsInline className="rounded-2xl shadow-2xl border border-white/10 bg-black" style={{ maxWidth: '90vw', maxHeight: '60vh', minWidth: 'min(90vw, 320px)' }} />
                        <a href={activeCard.videoSrc} download={`video-carousel-${activeIndex}.mp4`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-full transition-all shadow-lg" onClick={e => e.stopPropagation()}><Download className="w-3.5 h-3.5" />Descargar Video</a>
                      </div>
                    ) : (
                      <img src={activeCard.url} alt={activeCard.name || `Slide ${activeIndex + 1}`} className="rounded-2xl shadow-2xl border border-white/10 max-h-[60vh] max-w-[90vw] object-contain transition-all duration-300" />
                    )}
                  </div>
                  <div className="text-center mt-4">
                    {activeCard.name && <p className="text-white font-semibold text-[13.5px] mb-1">{activeCard.name}</p>}
                    <span className="text-white/40 text-[10px] font-bold uppercase tracking-wider">Slide {activeIndex + 1} de {mediaData.cards.length}</span>
                  </div>
                  {mediaData.cards.length > 1 && (
                    <div className="flex justify-center gap-1.5 mt-3.5 z-30">
                      {mediaData.cards.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={(e) => { e.stopPropagation(); setActiveIndex(idx); }}
                          className={`w-2 h-2 rounded-full transition-all ${idx === activeIndex ? 'bg-violet-500 scale-125' : 'bg-white/30 hover:bg-white/50'}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {mediaData.type === 'video_source' && (
              <div className="flex flex-col items-center gap-4">
                <video src={mediaData.source || undefined} controls autoPlay playsInline className="rounded-2xl shadow-2xl border border-white/10 bg-black" style={{ maxWidth: '90vw', maxHeight: '70vh', minWidth: 'min(90vw, 400px)' }} />
                <a href={mediaData.source || undefined} download={`video-${preview.videoId || 'creative'}.mp4`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-[12.5px] font-bold rounded-full transition-all shadow-lg" onClick={e => e.stopPropagation()}><Download className="w-4 h-4" />Descargar Video</a>
              </div>
            )}

            {mediaData.type === 'image' && (
              <img src={mediaData.url || undefined} alt={preview.name || 'Creative'} className="rounded-2xl shadow-2xl border border-white/10 max-h-[88vh] max-w-[90vw] object-contain" />
            )}

            {mediaData.type === 'ad_preview' && mediaData.embed_html && (
              <div className="rounded-2xl overflow-hidden shadow-2xl bg-zinc-900 border border-white/10" style={{ width: 'min(90vw, 420px)', maxHeight: '90vh' }} onClick={(e: React.MouseEvent) => e.stopPropagation()} dangerouslySetInnerHTML={{ __html: mediaData.embed_html.replace(/width="\d+"/g, 'width="100%"').replace(/width:\s*\d+px/g, 'width:100%').replace(/<iframe/g, '<iframe style="width:100%;max-height:80vh;border:none;"') }} />
            )}

            {mediaData.type === 'none' && (
              <div className="flex flex-col items-center gap-4">
                <div className="relative rounded-2xl overflow-hidden" style={{ maxWidth: 'min(90vw, 500px)' }}>
                  <img src={preview.url} alt={preview.name} className="w-full rounded-2xl shadow-2xl border border-white/10" style={{ maxHeight: '70vh', objectFit: 'contain' }} />
                </div>
                <p className="text-white/60 text-xs">No pudimos cargar una vista previa interactiva.</p>
                <a href={preview.effectiveObjectStoryId ? (preview.effectiveObjectStoryId.includes('_') ? (() => { const [pId, ptId] = preview.effectiveObjectStoryId!.split('_'); return `https://www.facebook.com/permalink.php?story_fbid=${ptId}&id=${pId}`; })() : `https://facebook.com/${preview.effectiveObjectStoryId}`) : `https://www.facebook.com/ads/library/?id=${preview.creativeId || preview.adId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white text-[13px] font-bold rounded-full transition-all shadow-lg"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Ver en Facebook</a>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="relative rounded-2xl overflow-hidden" style={{ maxWidth: 'min(90vw, 500px)' }}>
              <img src={preview.url} alt={preview.name} className="w-full rounded-2xl shadow-2xl border border-white/10" style={{ maxHeight: '70vh', objectFit: 'contain' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function MetaAdsPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const [activeAds, setActiveAds] = useState<any[]>([]);
  const [adInsightsMap, setAdInsightsMap] = useState<Record<string, any>>({});
  const [campaignMap, setCampaignMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [activePreview, setActivePreview] = useState<any | null>(null);

  const [resolvedThumbnails, setResolvedThumbnails] = useState<Record<string, string>>({});
  const [resolvedDetails, setResolvedDetails] = useState<Record<string, any>>({});
  const [resolvingIds, setResolvingIds] = useState<Record<string, boolean>>({});

  // Date picker state
  const [activePreset, setActivePreset] = useState<string>('last_14d');
  const [activeSince, setActiveSince] = useState(daysAgo(28));
  const [activeUntil, setActiveUntil] = useState(today());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<string>('last_14d');
  const [pendingSince, setPendingSince] = useState(daysAgo(28));
  const [pendingUntil, setPendingUntil] = useState(today());
  const [hovering, setHovering] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const datePickerRef = useRef<HTMLDivElement>(null);

  const [prevProfileId, setPrevProfileId] = useState(profile?.id);
  if (profile?.id !== prevProfileId) {
    setPrevProfileId(profile?.id);
    setActiveAds([]);
    setAdInsightsMap({});
    setCampaignMap({});
    setResolvedThumbnails({});
    setResolvedDetails({});
    setResolvingIds({});
    setLoading(true);
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const PRESETS = [
    { id: 'last_7d', label: 'Últimos 7 días' }, { id: 'last_14d', label: 'Últimos 14 días' },
    { id: 'last_28d', label: 'Últimos 28 días' }, { id: 'last_30d', label: 'Últimos 30 días' },
    { id: 'last_90d', label: 'Últimos 90 días' }, { id: 'this_month', label: 'Este mes' },
    { id: 'last_month', label: 'Mes pasado' }, { id: 'this_year', label: 'Este año' },
  ];
  const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const todayStr = today();

  const MiniCalMeta = ({ year, month, since, until, hovering: hov, onDay, onHover, onPrev, onNext }: any) => {
    const days: any[] = [];
    const first = new Date(year, month, 1).getDay();
    const startOffset = first === 0 ? 6 : first - 1;
    for (let i = 0; i < startOffset; i++) days.push(null);
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= lastDay; i++) {
      const d = new Date(year, month, i);
      days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return (
      <div className="w-[240px]">
        <div className="flex items-center mb-4 px-1">
          <div className="w-8 flex justify-start">{onPrev && <button onClick={onPrev} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md"><ChevronLeft className="w-4 h-4 text-zinc-400" /></button>}</div>
          <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 text-center">{MONTHS_ES[month]} {year}</span>
          <div className="w-8 flex justify-end">{onNext && <button onClick={onNext} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md"><ChevronRight className="w-4 h-4 text-zinc-400" /></button>}</div>
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {['L','M','M','J','V','S','D'].map((d, i) => <div key={i} className="text-[10px] font-bold text-zinc-300 text-center pb-2 uppercase tracking-tighter">{d}</div>)}
          {days.map((d, i) => {
            if (!d) return <div key={`e-${i}`} />;
            const isFut = d > todayStr;
            const isSel = d === since || d === until;
            const isRange = since && until && d > since && d < until;
            const isHov = since && !until && hov && ((d > since && d <= hov) || (d < since && d >= hov));
            return <button key={d} onMouseEnter={() => !isFut && onHover(d)} onClick={() => !isFut && onDay(d)} disabled={isFut} className={`h-8 w-8 text-[11px] font-bold transition-all flex items-center justify-center rounded-full ${isSel ? 'bg-blue-600 text-white' : (isRange || isHov) ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' : isFut ? 'text-zinc-200 dark:text-zinc-800 cursor-default' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>{d.split('-')[2]}</button>;
          })}
        </div>
      </div>
    );
  };

  const handleApplyDate = () => {
    setActivePreset(pendingPreset);
    setActiveSince(pendingSince);
    setActiveUntil(pendingUntil || pendingSince);
    setShowDatePicker(false);
    // fetchAds will be triggered by the useEffect below
  };

  const fmtD = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${day}/${m}/${y.slice(2)}`; };
  const presetLabel = PRESETS.find(p => p.id === activePreset)?.label || `${fmtD(activeSince)} – ${fmtD(activeUntil)}`;

  const fetchAds = (since?: string, until?: string) => {
    const accountId = (profile as any)?.meta_account_id;
    if (!accountId) {
      setActiveAds([]);
      setAdInsightsMap({});
      setCampaignMap({});
      setResolvedThumbnails({});
      setResolvedDetails({});
      setResolvingIds({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setResolvedThumbnails({});
    setResolvedDetails({});
    setResolvingIds({});
    const tr = { since: since || activeSince, until: until || activeUntil };
    const adFields = 'ad_id,spend,impressions,reach,inline_link_click_ctr,inline_link_clicks,actions,cost_per_action_type,action_values,purchase_roas';
    Promise.all([
      metaAds.getAccountAds(accountId),
      metaAds.getAdInsightsForAccount(accountId, adFields, tr).catch(() => []),
      metaAds.getCampaigns(accountId).catch(() => ({ data: [] })),
    ]).then(([adsRes, insightsRes, campsRes]) => {
      setActiveAds((adsRes.data || []).filter((ad: any) => ad.status === 'ACTIVE'));
      const byAdId: Record<string, any> = {};
      (insightsRes || []).forEach((i: any) => { if (i.ad_id) byAdId[i.ad_id] = i; });
      setAdInsightsMap(byAdId);
      const cMap: Record<string, string> = {};
      ((campsRes as any).data || []).forEach((c: any) => { if (c.id) cMap[c.id] = c.name; });
      setCampaignMap(cMap);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAds(activeSince, activeUntil); }, [profile?.id, activeSince, activeUntil]);



  // Sequential concurrent sliding window batch thumbnail and asset resolver (limit: 4 parallel requests)
  useEffect(() => {
    const accountId = (profile as any)?.meta_account_id;
    if (!accountId || activeAds.length === 0) return;

    let isMounted = true;
    const activeCount = Object.keys(resolvingIds).length;
    if (activeCount >= 4) return;

    // Identify ads that have not been resolved yet and are not currently resolving
    const toResolve = activeAds.filter(ad => {
      return !resolvedDetails[ad.id] && !resolvingIds[ad.id];
    });

    if (toResolve.length === 0) return;

    // Take up to remaining slots in sliding window
    const limit = 4 - activeCount;
    const batch = toResolve.slice(0, limit);
    if (batch.length === 0) return;

    // Mark as resolving
    setResolvingIds(prev => {
      const next = { ...prev };
      batch.forEach(ad => {
        next[ad.id] = true;
      });
      return next;
    });

    // Run fetches
    batch.forEach(async (ad) => {
      const params = new URLSearchParams();
      if (ad.id) params.set('adId', ad.id);
      if (ad.creative?.id) params.set('creativeId', ad.creative.id);
      if (ad.creative?.video_id) params.set('videoId', ad.creative.video_id);

      try {
        const res = await fetch(`/api/meta-video?${params}`);
        if (!res.ok) throw new Error('Fetch failed');
        const data = await res.json();
        
        if (!isMounted) return;

        let thumbnail: string | null = null;
        if (data.type === 'carousel' && data.cards?.[0]?.url) {
          thumbnail = data.cards[0].url;
        } else if (data.type === 'video_source' && data.picture) {
          thumbnail = data.picture;
        } else if (data.type === 'image' && data.url) {
          thumbnail = data.url;
        }

        setResolvedDetails(prev => ({ ...prev, [ad.id]: data }));
        if (thumbnail) {
          setResolvedThumbnails(prev => ({ ...prev, [ad.id]: thumbnail }));
        }
      } catch (err) {
        console.error(`Error resolving ad ${ad.id}:`, err);
        if (isMounted) {
          setResolvedDetails(prev => ({ ...prev, [ad.id]: { type: 'failed' } }));
        }
      } finally {
        if (isMounted) {
          setResolvingIds(prev => {
            const next = { ...prev };
            delete next[ad.id];
            return next;
          });
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeAds, resolvedDetails, resolvingIds, profile]);

  const fmtN = (n: any) => {
    const v = parseInt(n);
    if (isNaN(v)) return '—';
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return String(v);
  };

  const accountId = (profile as any)?.meta_account_id;

  return (
    <div className="w-full animate-fade-in pb-20 pt-6 px-4 md:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Layers className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Creativos Activos</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium">Anuncios en circulación y su rendimiento.</p>
          </div>
        </div>
        {/* Date picker */}
        <div className="relative" ref={datePickerRef}>
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center gap-2 px-4 h-9 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full text-[12px] font-bold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm"
          >
            {loading && activeAds.length > 0 ? (
              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
            ) : (
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
            )}
            {presetLabel}
            <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
          </button>
          {showDatePicker && (
            <div className="absolute right-0 top-full mt-2 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl z-50 flex flex-col sm:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-150 max-w-[calc(100vw-2rem)] w-[min(430px,calc(100vw-2rem))]">
              {/* Presets — horizontal scroll on mobile, vertical list on sm+ */}
              <div className="sm:w-[140px] border-b sm:border-b-0 sm:border-r border-zinc-100 dark:border-zinc-800 p-2 flex flex-row sm:flex-col gap-0.5 overflow-x-auto sm:overflow-x-visible no-scrollbar">
                {PRESETS.map(p => (
                  <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id); setPendingSince(r.since); setPendingUntil(r.until); }} className={`flex-shrink-0 sm:flex-shrink text-left px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap ${pendingPreset === p.id ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
                ))}
              </div>
              <div className="p-4 flex flex-col gap-4">
                <MiniCalMeta year={calYear} month={calMonth} since={pendingSince} until={pendingUntil} hovering={hovering}
                  onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { setPendingUntil(iso < pendingSince ? (setPendingSince(iso), pendingSince) : iso); } }}
                  onHover={setHovering}
                  onPrev={() => { if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); } else setCalMonth(calMonth - 1); }}
                  onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else setCalMonth(calMonth + 1); }}
                />
                <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <button onClick={() => setShowDatePicker(false)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
                  <button onClick={handleApplyDate} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-colors">Aplicar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* No account configured */}
      {!accountId && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <Layers className="w-7 h-7 text-zinc-400" />
          </div>
          <p className="text-[15px] font-semibold text-zinc-500">No hay cuenta de Meta Ads configurada</p>
          <p className="text-[13px] text-zinc-400">Configurá el ID de cuenta en el panel de administración.</p>
        </div>
      )}

      {/* Skeletons while loading */}
      {accountId && loading && activeAds.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50 flex flex-col">
              <div className="h-52 bg-zinc-100 dark:bg-zinc-800" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-3/4 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
                <div className="grid grid-cols-4 gap-2">{[...Array(4)].map((_, j) => <div key={j} className="h-12 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No ads */}
      {accountId && !loading && activeAds.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <Layers className="w-7 h-7 text-zinc-400" />
          </div>
          <p className="text-[15px] font-semibold text-zinc-500">No hay anuncios activos</p>
          <p className="text-[13px] text-zinc-400">No se encontraron anuncios con estado ACTIVE en esta cuenta.</p>
        </div>
      )}

      {/* Ads grid */}
      {accountId && activeAds.length > 0 && (() => {
        const adsWithSpend = activeAds.filter(ad => parseFloat(adInsightsMap[ad.id]?.spend || 0) > 0);
        const grouped: Record<string, { campaignName: string; ads: any[] }> = {};
        adsWithSpend.forEach(ad => {
          const cid = ad.campaign_id || 'other';
          const cname = campaignMap[cid] || 'Sin campaña';
          if (!grouped[cid]) grouped[cid] = { campaignName: cname, ads: [] };
          grouped[cid].ads.push(ad);
        });

        if (Object.keys(grouped).length === 0) return (
          <p className="text-sm text-zinc-400 text-center py-16">Hay {activeAds.length} anuncios activos pero sin gasto registrado en los últimos 28 días.</p>
        );

        return (
          <div className={`space-y-10 transition-opacity duration-200 ${loading ? 'opacity-65 pointer-events-none' : ''}`}>
            {Object.entries(grouped).map(([cid, group]) => (
              <div key={cid}>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-1 h-5 rounded-full bg-blue-500 flex-shrink-0" />
                  <h4 className="text-[14px] font-black text-zinc-800 dark:text-zinc-100 tracking-tight truncate">{group.campaignName}</h4>
                  <span className="text-[11px] font-bold text-zinc-400 flex-shrink-0">{group.ads.length} creativos</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {group.ads.map(ad => {
                    const insights = adInsightsMap[ad.id];
                    const adSpend = parseFloat(insights?.spend || 0);
                    const adActions = insights?.actions || [];
                    const getR = (type: string) => { const a = adActions.find((x: any) => x.action_type === type || x.action_type === `offsite_conversion.fb_pixel_${type}`); return a ? parseInt(a.value) : 0; };
                    const purchases = getR('purchase'); const leads = getR('lead'); const messages = getR('onsite_conversion.messaging_conversation_started_7d');
                    const adResults = purchases || leads || messages;
                    const adCpa = adResults > 0 ? adSpend / adResults : 0;
                    const adImpr = parseInt(insights?.impressions || 0);
                    const adCtr = parseFloat(insights?.inline_link_click_ctr || 0);
                    const adRoas = parseFloat(insights?.purchase_roas?.[0]?.value || 0);
                    const resultLabel = purchases > 0 ? 'Ventas' : leads > 0 ? 'Leads' : messages > 0 ? 'Msgs' : 'Result.';
                    const isVideo = ad.creative?.object_type === 'VIDEO' || !!ad.creative?.video_id;
                    const isCarousel = resolvedDetails[ad.id]?.type === 'carousel' || ad.creative?.object_type === 'CAROUSEL';
                    const resolvedThumb = resolvedThumbnails[ad.id];
                    const thumbUrl = resolvedThumb || ad.creative?.image_url || ad.creative?.thumbnail_url;
                    const isResolving = resolvingIds[ad.id];

                    return (
                      <div key={ad.id} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 flex flex-col">
                        {/* Thumbnail */}
                        <div
                          className="relative w-full h-52 bg-zinc-100 dark:bg-zinc-800 cursor-pointer group overflow-hidden flex-shrink-0"
                          onClick={() => setActivePreview({ url: thumbUrl || '', isVideo, videoId: ad.creative?.video_id, adId: ad.id, creativeId: ad.creative?.id, name: ad.name, effectiveObjectStoryId: ad.creative?.effective_object_story_id })}
                        >
                          {thumbUrl ? (<>
                            <img src={thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60" aria-hidden />
                            <img src={thumbUrl} alt={ad.name} className="relative z-10 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                            <div className="absolute inset-0 z-20 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
                              <div className={`flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all duration-200 ${isVideo ? 'bg-white/90 scale-90 group-hover:scale-100' : 'bg-black/50 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'}`}>
                                {isVideo ? (<svg className="w-6 h-6 text-zinc-900 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>) : isCarousel ? (<Layers className="w-6 h-6 text-white" />) : (<ImageIcon className="w-6 h-6 text-white" />)}
                              </div>
                            </div>
                          </>) : isResolving ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-50 dark:bg-zinc-900/50">
                              <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Cargando...</span>
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                              {isVideo ? <Film className="w-10 h-10 opacity-20" /> : isCarousel ? <Layers className="w-10 h-10 opacity-20" /> : <ImageIcon className="w-10 h-10 opacity-20" />}
                              <span className="text-[11px] text-zinc-400 font-semibold">Sin preview</span>
                            </div>
                          )}
                          {isVideo && (<div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-black/60 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase backdrop-blur-sm"><Film className="w-3 h-3" /> Video</div>)}
                          {!isVideo && isCarousel && (<div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-black/60 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase backdrop-blur-sm"><Layers className="w-3 h-3" /> Carousel</div>)}
                          <div className="absolute top-2 left-2 z-30"><span className="text-[9px] font-black px-2 py-1 rounded-lg bg-emerald-500/90 backdrop-blur-sm text-white uppercase tracking-wider">Activo</span></div>
                        </div>

                        {/* Info */}
                        <div className="p-4 flex flex-col gap-3 flex-1">
                          <div>
                            <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">{ad.name || 'Sin nombre'}</p>
                            {ad.creative?.object_type && (<p className="text-[10px] text-zinc-400 mt-0.5 font-semibold uppercase tracking-wider">{ad.creative.object_type}</p>)}
                          </div>

                          {insights && (
                            <div className="grid grid-cols-4 gap-2">
                              {[
                                { label: 'Gasto', val: `$${adSpend.toFixed(0)}`, highlight: false },
                                { label: resultLabel, val: adResults > 0 ? String(adResults) : '—', highlight: adResults > 0 },
                                { label: 'CPA', val: adCpa > 0 ? `$${adCpa.toFixed(0)}` : '—', highlight: false },
                                { label: adRoas > 0 ? 'ROAS' : 'CTR', val: adRoas > 0 ? `${adRoas.toFixed(2)}x` : adCtr > 0 ? `${adCtr.toFixed(1)}%` : '—', highlight: adRoas > 1 },
                                { label: 'Impr.', val: fmtN(adImpr), highlight: false },
                              ].map(({ label, val, highlight }) => (
                                <div key={label} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-2.5 border border-zinc-100 dark:border-white/[0.04]">
                                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
                                  <p className={`text-[12px] font-bold leading-none ${highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-800 dark:text-zinc-100'}`}>{val}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-auto">
                            <button
                              onClick={() => setActivePreview({ url: thumbUrl || '', isVideo, videoId: ad.creative?.video_id, adId: ad.id, creativeId: ad.creative?.id, name: ad.name, effectiveObjectStoryId: ad.creative?.effective_object_story_id })}
                              className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg text-[10px] font-bold text-zinc-500 bg-zinc-100 dark:bg-white/[0.05] hover:text-zinc-900 dark:hover:text-white"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                              Ver
                            </button>
                            <a href={ad.creative?.effective_object_story_id ? (ad.creative.effective_object_story_id.includes('_') ? (() => { const [pId, ptId] = ad.creative.effective_object_story_id.split('_'); return `https://www.facebook.com/permalink.php?story_fbid=${ptId}&id=${pId}`; })() : `https://facebook.com/${ad.creative.effective_object_story_id}`) : `https://www.facebook.com/ads/library/?id=${ad.creative?.id || ad.id}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg text-[10px] font-bold text-[#1877F2] bg-[#1877F2]/8 dark:bg-[#1877F2]/10 hover:bg-[#1877F2]/15">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>FB
                            </a>
                            <a href={ad.creative?.instagram_permalink_url || 'https://www.instagram.com/'} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg text-[10px] font-bold text-pink-500 bg-pink-50 dark:bg-pink-500/10 hover:bg-pink-100" style={{ opacity: ad.creative?.instagram_permalink_url ? 1 : 0.35, pointerEvents: ad.creative?.instagram_permalink_url ? 'auto' : 'none' }}>
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>IG
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {activePreview && (
        <CreativePreviewModal 
          preview={activePreview} 
          prefetchedData={resolvedDetails[activePreview.adId]} 
          onClose={() => setActivePreview(null)} 
        />
      )}
    </div>
  );
}
