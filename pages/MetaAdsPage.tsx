import React, { useEffect, useState } from 'react';
import { metaAds, daysAgo, today } from '../services/metaAds';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import {
  Layers, Film, X, Download, Loader2, ImageIcon, RefreshCw
} from 'lucide-react';

// ── Creative Preview Modal ─────────────────────────────────────────────
const CreativePreviewModal = ({ preview, onClose }: {
  preview: { url: string; isVideo: boolean; videoId?: string; adId?: string; creativeId?: string; name?: string; effectiveObjectStoryId?: string; };
  onClose: () => void;
}) => {
  const [imgLoaded, setImgLoaded] = React.useState(false);
  const [videoSrc, setVideoSrc] = React.useState<string | null>(null);
  const [embedHtml, setEmbedHtml] = React.useState<string | null>(null);
  const [videoLoading, setVideoLoading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (!preview.isVideo) return;
    if (!preview.adId && !preview.creativeId && !preview.videoId) return;
    setVideoLoading(true); setVideoSrc(null); setEmbedHtml(null);
    const params = new URLSearchParams();
    if (preview.adId) params.set('adId', preview.adId);
    if (preview.creativeId) params.set('creativeId', preview.creativeId);
    if (preview.videoId) params.set('videoId', preview.videoId);
    fetch(`/api/meta-video?${params}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.source) setVideoSrc(d.source); if (d?.embed_html) setEmbedHtml(d.embed_html); }).catch(() => {}).finally(() => setVideoLoading(false));
  }, [preview.adId, preview.creativeId, preview.videoId, preview.isVideo]);

  React.useEffect(() => {
    if (preview.isVideo) return;
    setImgLoaded(false); setProgress(0);
    const start = Date.now();
    const tick = setInterval(() => { setProgress(Math.min(80, ((Date.now() - start) / 2000) * 80)); }, 50);
    return () => clearInterval(tick);
  }, [preview.url, preview.isVideo]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-150" onClick={onClose}>
      {!preview.isVideo && !imgLoaded && (<div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5 z-20"><div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-200 rounded-full" style={{ width: `${progress}%` }} /></div>)}
      <button onClick={onClose} className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-20"><X className="w-5 h-5" /></button>
      {preview.name && (<div className="absolute top-4 left-4 right-16 z-20"><p className="text-white/80 text-[13px] font-bold truncate max-w-[70vw]">{preview.name}</p>{preview.isVideo && (<div className="inline-flex items-center gap-1 mt-1 bg-white/10 px-2 py-0.5 rounded-full"><Film className="w-3 h-3 text-white/60" /><span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Video</span></div>)}</div>)}
      <div className="relative animate-in zoom-in-95 duration-200 flex items-center justify-center" style={{ maxWidth: '90vw', maxHeight: '88vh' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        {preview.isVideo ? (
          videoLoading ? (<div className="w-[min(90vw,560px)] h-[min(88vh,420px)] rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center gap-4"><div className="w-12 h-12 rounded-full border-2 border-zinc-700 border-t-violet-500 animate-spin" /><span className="text-[12px] font-bold text-zinc-500">Cargando video...</span></div>)
          : videoSrc ? (<div className="flex flex-col items-center gap-4"><video src={videoSrc} controls autoPlay playsInline className="rounded-2xl shadow-2xl border border-white/10 bg-black" style={{ maxWidth: '90vw', maxHeight: '70vh', minWidth: 'min(90vw, 400px)' }} /><a href={videoSrc} download={`video-${preview.videoId || 'creative'}.mp4`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-[12.5px] font-bold rounded-full transition-all shadow-lg" onClick={e => e.stopPropagation()}><Download className="w-4 h-4" />Descargar Video</a></div>)
          : embedHtml ? (<div className="rounded-2xl overflow-hidden shadow-2xl bg-zinc-900 border border-white/10" style={{ width: 'min(90vw, 420px)', maxHeight: '90vh' }} onClick={(e: React.MouseEvent) => e.stopPropagation()} dangerouslySetInnerHTML={{ __html: embedHtml.replace(/width="\d+"/g, 'width="100%"').replace(/width:\s*\d+px/g, 'width:100%').replace(/<iframe/g, '<iframe style="width:100%;max-height:80vh;border:none;"') }} />)
          : (<div className="flex flex-col items-center gap-4" onClick={(e: React.MouseEvent) => e.stopPropagation()}><div className="relative rounded-2xl overflow-hidden" style={{ maxWidth: 'min(90vw, 500px)' }}><img src={preview.url} alt={preview.name} className="w-full rounded-2xl shadow-2xl border border-white/10" style={{ maxHeight: '70vh', objectFit: 'contain' }} /><div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-16 h-16 rounded-full bg-white/10 border border-white/30 flex items-center justify-center backdrop-blur-sm"><svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div></div><a href={preview.effectiveObjectStoryId ? (preview.effectiveObjectStoryId.includes('_') ? (() => { const [pId, ptId] = preview.effectiveObjectStoryId!.split('_'); return `https://www.facebook.com/permalink.php?story_fbid=${ptId}&id=${pId}`; })() : `https://facebook.com/${preview.effectiveObjectStoryId}`) : `https://www.facebook.com/ads/library/?id=${preview.creativeId || preview.adId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white text-[13px] font-bold rounded-full transition-all shadow-lg"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Ver en Facebook</a></div>)
        ) : (
          <>{!imgLoaded && (<div className="absolute inset-0 rounded-2xl bg-zinc-900 animate-pulse flex items-center justify-center" style={{ minWidth: 280, minHeight: 280 }}><div className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-violet-500 animate-spin" /></div>)}<img src={preview.url} alt={preview.name || 'Creative'} onLoad={() => { setProgress(100); setTimeout(() => setImgLoaded(true), 150); }} className={`rounded-2xl shadow-2xl border border-white/10 transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`} style={{ maxWidth: '90vw', maxHeight: '88vh', width: 'auto', height: 'auto', minWidth: 'min(90vw, 320px)', objectFit: 'contain' }} /></>
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

  const fetchAds = () => {
    const accountId = (profile as any)?.meta_account_id;
    if (!accountId) return;
    setLoading(true);
    const tr = { since: daysAgo(28), until: today() };
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

  useEffect(() => { fetchAds(); }, [profile?.id]);

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
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Layers className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Creativos Activos</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium">Anuncios en circulación y su rendimiento — últimos 28 días.</p>
          </div>
        </div>
        <button
          onClick={fetchAds}
          disabled={loading}
          className="flex items-center gap-2 px-4 h-10 bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-xl text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
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

      {/* Loading skeletons */}
      {accountId && loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50 flex flex-col animate-pulse">
              <div className="h-52 bg-zinc-200 dark:bg-zinc-700" />
              <div className="p-4 space-y-3">
                <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
                <div className="grid grid-cols-4 gap-2">{[...Array(4)].map((_, j) => <div key={j} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}</div>
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
      {accountId && !loading && activeAds.length > 0 && (() => {
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
          <div className="space-y-10">
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
                    const thumbUrl = ad.creative?.image_url || ad.creative?.thumbnail_url;

                    return (
                      <div key={ad.id} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 flex flex-col">
                        {/* Thumbnail */}
                        <div
                          className="relative w-full h-52 bg-zinc-100 dark:bg-zinc-800 cursor-pointer group overflow-hidden flex-shrink-0"
                          onClick={() => thumbUrl && setActivePreview({ url: thumbUrl, isVideo, videoId: ad.creative?.video_id, adId: ad.id, creativeId: ad.creative?.id, name: ad.name, effectiveObjectStoryId: ad.creative?.effective_object_story_id })}
                        >
                          {thumbUrl ? (<>
                            <img src={thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60" aria-hidden />
                            <img src={thumbUrl} alt={ad.name} className="relative z-10 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                            <div className="absolute inset-0 z-20 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
                              <div className={`flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all duration-200 ${isVideo ? 'bg-white/90 scale-90 group-hover:scale-100' : 'bg-black/50 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'}`}>
                                {isVideo ? (<svg className="w-6 h-6 text-zinc-900 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>) : (<ImageIcon className="w-6 h-6 text-white" />)}
                              </div>
                            </div>
                          </>) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                              {isVideo ? <Film className="w-10 h-10 opacity-20" /> : <ImageIcon className="w-10 h-10 opacity-20" />}
                              <span className="text-[11px] text-zinc-400 font-semibold">Sin preview</span>
                            </div>
                          )}
                          {isVideo && (<div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-black/60 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase backdrop-blur-sm"><Film className="w-3 h-3" /> Video</div>)}
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
                              onClick={() => thumbUrl && setActivePreview({ url: thumbUrl, isVideo, videoId: ad.creative?.video_id, adId: ad.id, creativeId: ad.creative?.id, name: ad.name, effectiveObjectStoryId: ad.creative?.effective_object_story_id })}
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

      {activePreview && <CreativePreviewModal preview={activePreview} onClose={() => setActivePreview(null)} />}
    </div>
  );
}
