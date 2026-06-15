import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAIGate } from '../hooks/useAIGate';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { supabase } from '../services/supabase';
import { metaAds } from '../services/metaAds';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import {
  Upload, Film, Image, Zap, CheckCircle, AlertCircle, XCircle,
  RefreshCw, Loader2, Target, Brain, Eye, ChevronRight, Layers,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

// Generate realistic attention/emotion/impact curve for a ~30s creative
const genTimeline = (attn: number, emot: number, cogLoad: number, seed: number): { t: number; attn: number; emot: number; impact: number }[] => {
  const attnOff = [0.22, 0.28, 0.10, -0.04, -0.10, 0.00, 0.06, -0.02, 0.04, -0.04];
  const emotOff = [-0.28, -0.18, -0.05, 0.05, 0.10, 0.05, 0.03, 0.12, 0.02, -0.03];
  return attnOff.map((ao, i) => {
    const a = Math.max(8, Math.min(99, Math.round(attn * (1 + ao) + ((seed * 3 + i * 7) % 8) - 4)));
    const e = Math.max(8, Math.min(99, Math.round(emot * (1 + emotOff[i]) + ((seed * 5 + i * 11) % 8) - 4)));
    const imp = Math.max(8, Math.min(99, Math.round(a * 0.4 + e * 0.4 + (100 - cogLoad) * 0.2)));
    return { t: Math.round(i * 30 / (attnOff.length - 1)), attn: a, emot: e, impact: imp };
  });
};

// ── Seeded mock fallback ──────────────────────────────────────────────────────
function mockAnalysis(file: { name: string; size: number; type: string; lastModified: number }, isVideo: boolean) {
  const seedStr = file.name + file.size + file.lastModified;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) { seed = ((seed << 5) - seed) + seedStr.charCodeAt(i); seed |= 0; }
  const rng = () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const attentionPct = Math.min(97, Math.floor((isVideo ? 65 : 70) + rng() * 25));
  const emotionPct = Math.min(97, Math.floor((isVideo ? 68 : 60) + rng() * 25));
  const cogLoad = Math.max(12, Math.floor(20 + rng() * 30));
  const regions = ['V1', 'FFA', 'EBA', 'Amígdala', 'A1'];
  const highestRegion = regions[Math.floor(rng() * regions.length)];
  return {
    attentionPct, attentionReason: 'Análisis simulado — conectá una API key de Gemini para análisis real.',
    emotionPct, emotionReason: 'Análisis simulado.',
    cogLoad, cogLoadReason: 'Análisis simulado.',
    highestRegion,
    textInsight: 'Análisis de base generado sin IA real. Los valores son estimaciones según el tipo y peso del archivo.',
    actionItems: [
      isVideo ? 'Asegurate de que el gancho sea en los primeros 3 segundos.' : 'El elemento visual principal debe detener el scroll.',
      'Reducí la carga cognitiva limitando el texto a una sola idea central.',
      'Incluí subtítulos si es video — el 80% se ve sin sonido.',
      'Mostrá el producto o resultado deseado en los primeros cuadros.',
    ],
  };
}

// ── Frame extractor ───────────────────────────────────────────────────────────
async function extractFrames(file: File, maxFrames = 5): Promise<string[]> {
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
          resolve([canvas.toDataURL('image/jpeg', 0.6)]);
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
      const dur = video.duration;
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
        else { URL.revokeObjectURL(video.src); resolve(frames); }
      };
      video.currentTime = timestamps[0];
    };
    video.onerror = () => { URL.revokeObjectURL(video.src); resolve([]); };
  });
}

// ── Score badge ───────────────────────────────────────────────────────────────
const scoreCls = (score: number) =>
  score >= 80 ? 'bg-emerald-500 text-white shadow-emerald-200' :
  score >= 60 ? 'bg-amber-500 text-white shadow-amber-200' :
  'bg-red-500 text-white shadow-red-200';

const scoreLabel = (score: number) =>
  score >= 80 ? 'Listo para escalar' : score >= 60 ? 'Requiere ajustes' : 'Revisar antes de pautar';

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
  const { gate, isReady: aiReady, AIGate } = useAIGate();
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
  const [usedMock, setUsedMock] = useState(false);
  const [timeline, setTimeline] = useState<{ t: number; attn: number; emot: number }[]>([]);

  // For account ads
  const [accountAds, setAccountAds] = useState<any[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [resolvedDetails, setResolvedDetails] = useState<Record<string, any>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAccountAds = async () => {
    const accountId = (profile as any)?.meta_account_id;
    if (!accountId) return;
    setAdsLoading(true);
    try {
      const res = await metaAds.getAccountAds(accountId);
      const ads = (res.data || []).filter((a: any) => a.status === 'ACTIVE').slice(0, 24);
      setAccountAds(ads);
      // Batch resolve thumbnails
      ads.slice(0, 8).forEach(async (ad: any) => {
        const params = new URLSearchParams();
        if (ad.id) params.set('adId', ad.id);
        if (ad.creative?.id) params.set('creativeId', ad.creative.id);
        const clientId = (profile as any)?.id;
        if (clientId) params.set('clientId', clientId);
        const r = await fetch(`/api/meta-video?${params}`).catch(() => null);
        if (r?.ok) {
          const d = await r.json();
          setResolvedDetails(prev => ({ ...prev, [ad.id]: d }));
        }
      });
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
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const analyze = async (sourceFile?: File, adThumbnailUrl?: string, adName?: string) => {
    if (!aiReady) { gate(() => analyze(sourceFile, adThumbnailUrl, adName)); return; }
    setStatus('analyzing');
    setResult(null);
    setUsedMock(false);
    const isVideo = sourceFile ? sourceFile.type.startsWith('video') : false;

    try {
      let frames: string[] = [];
      if (sourceFile) {
        setStep('Extrayendo fotogramas...');
        frames = await extractFrames(sourceFile);
      } else if (adThumbnailUrl) {
        setStep('Cargando imagen del anuncio...');
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
            body: JSON.stringify({ type: 'analyze-creative', frames, isVideo }),
          });
          if (r.ok) analysisResult = await r.json();
        } catch { /* fall through to mock */ }
      }

      if (!analysisResult) {
        const mockSrc = sourceFile || { name: adName || 'ad', size: 100000, type: isVideo ? 'video/mp4' : 'image/jpeg', lastModified: Date.now() };
        analysisResult = mockAnalysis(mockSrc as any, isVideo);
        setUsedMock(true);
      }

      const finalScore = Math.floor(
        analysisResult.attentionPct * 0.4 +
        analysisResult.emotionPct * 0.4 +
        (100 - analysisResult.cogLoad) * 0.2
      );
      setScore(finalScore);
      setResult(analysisResult);
      setTimeline(genTimeline(analysisResult.attentionPct, analysisResult.emotionPct, analysisResult.cogLoad, finalScore));
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setStep('Error al analizar el creativo.');
    }
  };

  const handleAnalyzeUpload = () => { if (file) analyze(file); };

  const handleSelectAd = (ad: any) => {
    setSelectedAd(ad);
    setStatus('idle');
    setResult(null);
    setTimeline([]);
  };

  const handleAnalyzeSelectedAd = () => {
    if (!selectedAd) return;
    const details = resolvedDetails[selectedAd.id];
    const thumbUrl = details?.picture || details?.url || selectedAd.creative?.image_url;
    const isVid = details?.type === 'video_source';
    if (thumbUrl) analyze(undefined, thumbUrl, selectedAd.name || 'anuncio');
    else {
      const mockSrc = { name: selectedAd.name || 'anuncio', size: 100000, type: 'image/jpeg', lastModified: Date.now() };
      const r = mockAnalysis(mockSrc, isVid);
      const s = Math.floor(r.attentionPct * 0.4 + r.emotionPct * 0.4 + (100 - r.cogLoad) * 0.2);
      setScore(s); setResult(r); setUsedMock(true); setTimeline(genTimeline(r.attentionPct, r.emotionPct, r.cogLoad, s)); setStatus('done');
    }
  };

  return (
    <CenteredPageLoader isLoading={pageLoading || authLoading}>
      {AIGate}
      <div className="w-full animate-fade-in pb-20 pt-4 md:pt-6 px-4 md:px-0">
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
                {!(profile as any)?.meta_account_id && (
                  <div className="text-center py-8 text-[12px] text-zinc-400">No hay cuenta de Meta Ads configurada.</div>
                )}
                {adsLoading && <div className="flex items-center justify-center py-12 gap-2 text-[12px] text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" />Cargando anuncios...</div>}
                {!adsLoading && accountAds.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto pr-1">
                      {accountAds.map(ad => {
                        const det = resolvedDetails[ad.id];
                        const thumb = det?.picture || det?.url;
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
                {!adsLoading && accountAds.length === 0 && (profile as any)?.meta_account_id && (
                  <div className="text-center py-8">
                    <p className="text-[12px] text-zinc-400">Sin anuncios activos.</p>
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

            {status === 'done' && result && (
              <div className="space-y-5">
                {usedMock && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Análisis simulado — configurá Gemini para análisis real.
                  </div>
                )}

                {/* Score circle */}
                <div className="flex items-center gap-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5">
                  <div className={`w-20 h-20 rounded-full flex flex-col items-center justify-center shadow-lg ${scoreCls(score)}`}>
                    <span className="text-[24px] font-black leading-none">{score}</span>
                    <span className="text-[9px] font-bold opacity-80">/100</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-black text-zinc-900 dark:text-white">{scoreLabel(score)}</p>
                    <p className="text-[10px] text-zinc-400 mt-1">Región dominante: <span className="font-bold text-violet-600 dark:text-violet-400">{result.highestRegion}</span></p>
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
                      <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Curva de Respuesta (30s)</p>
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
                          <Line type="monotone" dataKey="attn" name="Atención" stroke="#10b981" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="emot" name="Emoción" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="impact" name="Impacto" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <button onClick={() => { setStatus('idle'); setResult(null); setFile(null); setPreviewUrl(null); setSelectedAd(null); setTimeline([]); }} className="w-full text-[12px] font-bold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 py-2 transition-colors">
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
