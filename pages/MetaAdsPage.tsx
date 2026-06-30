import React, { useEffect, useState, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import DOMPurify from 'dompurify';
import { useAIGate } from '../hooks/useAIGate';
import { metaAds, today, presetToRange, DatePreset } from '../services/metaAds';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import { AppleLoader } from '../components/ui/AppleLoader';
import { PortalOverlay } from '../components/ui/PortalOverlay';
import SmoothImage from '../components/ui/SmoothImage';
import { db } from '../services/db';
import { supabase } from '../services/supabase';

import {
  Layers, Film, X, Loader2, ImageIcon, ChevronLeft, ChevronRight, Calendar, ChevronDown,
  Instagram, MessageCircle, Heart, Send, Sparkles, ArrowUpRight, Play, Facebook,
  Share2, Eye, MousePointerClick, Users, Brain, AlertTriangle, EyeOff
} from 'lucide-react';

// ── AutoResizeTextarea ────────────────────────────────────────────────────────
interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}
const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ value, className = '', ...props }, ref) => {
    const localRef = React.useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || localRef;
    React.useEffect(() => {
      const ta = textareaRef.current;
      if (ta) { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; }
    }, [value, textareaRef]);
    return <textarea ref={textareaRef} value={value} className={`${className} overflow-hidden resize-none`} rows={1} {...props} />;
  }
);
AutoResizeTextarea.displayName = 'AutoResizeTextarea';

const scoreCls = (score: number) =>
  score >= 80 ? 'bg-emerald-500 text-white shadow-emerald-200 dark:shadow-none' :
  score >= 60 ? 'bg-amber-500 text-white shadow-amber-200 dark:shadow-none' :
  'bg-red-500 text-white shadow-red-200 dark:shadow-none';

const scoreLabel = (score: number) =>
  score >= 80 ? 'Listo para escalar' : score >= 60 ? 'Requiere ajustes' : 'Revisar antes de pautar';

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

const genTimeline = (attn: number, emot: number, cogLoad: number, seed: number, durationSec = 30) => {
  const duration = clampDuration(durationSec);
  const attnOff = [0.22, 0.28, 0.10, -0.04, -0.10, 0.00, 0.06, -0.02, 0.04, -0.04];
  const emotOff = [-0.28, -0.18, -0.05, 0.05, 0.10, 0.05, 0.03, 0.12, 0.02, -0.03];
  return attnOff.map((ao, i) => {
    const a = Math.max(8, Math.min(99, Math.round(attn * (1 + ao) + ((seed * 3 + i * 7) % 8) - 4)));
    const e = Math.max(8, Math.min(99, Math.round(emot * (1 + emotOff[i]) + ((seed * 5 + i * 11) % 8) - 4)));
    const imp = Math.max(8, Math.min(99, Math.round(a * 0.4 + e * 0.4 + (100 - cogLoad) * 0.2)));
    return { t: Math.round(i * duration / (attnOff.length - 1)), attn: a, emot: e, impact: imp };
  });
};

const MetricBar = ({ label, value, color, reason }: { label: string; value: number; color: string; reason?: string }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-[11px] font-bold text-zinc-650 dark:text-zinc-400 uppercase tracking-wider">{label}</span>
      <span className="text-[13px] font-black text-zinc-900 dark:text-white">{value}%</span>
    </div>
    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${value}%` }} />
    </div>
    {reason && <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 leading-snug">{reason}</p>}
  </div>
);

// ── Types ─────────────────────────────────────────────────────────────────────
type SelectedAd = {
  ad: any;
  adId: string;
  name: string;
  body: string | null;
  igStoryId: string | null;
  fbStoryId: string | null;
  igPermalink: string | null;
  fbPermalink: string | null;
};

export default function MetaAdsPage() {
  const { gate, isReady: aiReady, AIGate } = useAIGate();
  const { profile: authProfile, loading: authLoading, user } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const fbPageId = (profile as any)?.fb_page_id;
  const igId = (profile as any)?.ig_business_id;
  const igUsername = (profile as any)?.ig_username;
  const metaAccountId = (profile as any)?.meta_account_id;
  const clientId = profile?.id;

  // ── Ads state ───────────────────────────────────────────────────────────────
  const [activeAds, setActiveAds] = useState<any[]>([]);
  const [adInsightsMap, setAdInsightsMap] = useState<Record<string, any>>({});
  const [campaignMap, setCampaignMap] = useState<Record<string, string>>({});
  const [adsetMap, setAdsetMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [resolvedThumbnails, setResolvedThumbnails] = useState<Record<string, string>>({});
  const [resolvedDetails, setResolvedDetails] = useState<Record<string, any>>({});
  const [resolvingIds, setResolvingIds] = useState<Record<string, boolean>>({});
  const isDateReloading = loading && activeAds.length > 0;

  // ── Date picker state ────────────────────────────────────────────────────────
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('last_7d');
  const [activeSince, setActiveSince] = useState(presetToRange('last_7d').since);
  const [activeUntil, setActiveUntil] = useState(presetToRange('last_7d').until);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<DatePreset | 'custom'>('last_7d');
  const [pendingSince, setPendingSince] = useState(presetToRange('last_7d').since);
  const [pendingUntil, setPendingUntil] = useState(presetToRange('last_7d').until);
  const [hovering, setHovering] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const datePickerRef = useRef<HTMLDivElement>(null);

  // ── Slide-over state ─────────────────────────────────────────────────────────
  const [selectedAd, setSelectedAd] = useState<SelectedAd | null>(null);

  // Comments per platform (both fetched in parallel)
  const [commentsByPlatform, setCommentsByPlatform] = useState<{ instagram: any[]; facebook: any[] }>({ instagram: [], facebook: [] });
  const [activeCommentPlatform, setActiveCommentPlatform] = useState<'instagram' | 'facebook'>('instagram');
  const [loadingByPlatform, setLoadingByPlatform] = useState<{ instagram: boolean; facebook: boolean }>({ instagram: false, facebook: false });

  // Derived: currently visible comments + loading flag
  const comments = commentsByPlatform[activeCommentPlatform];
  const loadingComments = loadingByPlatform[activeCommentPlatform];

  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [draftLoading, setDraftLoading] = useState<Record<string, boolean>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string | null>>({});
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [ignoredIds, setIgnoredIds] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [commentFilter, setCommentFilter] = useState<'all' | 'pending'>('pending');
  const [replyLangs, setReplyLangs] = useState<Record<string, 'en' | 'es'>>({});
  const [bulkDraftLang, setBulkDraftLang] = useState<'es' | 'en'>('es');
  const [langDropdownOpen, setLangDropdownOpen] = useState<Record<string, boolean>>({});
  const [activeReplyTargets, setActiveReplyTargets] = useState<Record<string, any>>({});

  const [slideTab, setSlideTab] = useState<'comments' | 'metrics'>('comments');
  const [mobileDetailTab, setMobileDetailTab] = useState<'post' | 'comments' | 'analysis'>('post');
  const [analyzingTribe, setAnalyzingTribe] = useState(false);
  const [tribeResult, setTribeResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [analysisDurationSec, setAnalysisDurationSec] = useState(30);

  useEffect(() => {
    if (selectedAd) {
      setSlideTab('comments');
      setMobileDetailTab('post');
      setAnalyzingTribe(false);
      setTribeResult(null);
      setAnalysisError(null);
      setTimeline([]);
      setAnalysisDurationSec(30);
    }
  }, [selectedAd]);

  useEffect(() => {
    if (!clientId) {
      setIgnoredIds({});
      return;
    }
    try {
      setIgnoredIds(JSON.parse(localStorage.getItem(`car_ignored_comments_${clientId}`) || '{}'));
    } catch {
      setIgnoredIds({});
    }
  }, [clientId]);

  const analyzeCreativeUrl = async (imageUrl: string | null, isVideo: boolean): Promise<any> => {
    if (!imageUrl) throw new Error('No hay imagen disponible para analizar.');
    let frame: string | null = null;
    try {
      const r = await fetch(imageUrl);
      if (r.ok) {
        const blob = await r.blob();
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const canvas = document.createElement('canvas');
        const img = document.createElement('img');
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = b64; });
        const scale = Math.min(1, 256 / Math.max(img.width, 1));
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        frame = canvas.toDataURL('image/jpeg', 0.6);
      }
    } catch {
      frame = null;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || '';
    const res = await fetch('/api/scrape-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ type: 'analyze-creative', frames: frame ? [frame] : [], imageUrl, isVideo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || 'No se pudo analizar el creativo con IA.');
    const score = Math.max(0, Math.min(100, Math.round((Number(data.attentionPct || 0) * 0.4) + (Number(data.emotionPct || 0) * 0.4) + ((100 - Number(data.cogLoad || 0)) * 0.2))));
    return { ...data, score };
  };

  const handleTabChange = async (tab: 'comments' | 'metrics', imageUrl?: string, isVideo?: boolean, videoUrl?: string | null) => {
    if (tab === 'metrics') {
      setAnalyzingTribe(true);
      setTribeResult(null);
      setAnalysisError(null);
      setSlideTab('metrics');
      const durationSec = isVideo ? clampDuration(await getRemoteVideoDuration(videoUrl)) : 30;
      setAnalysisDurationSec(durationSec);
      analyzeCreativeUrl(imageUrl || null, isVideo || false)
        .then(result => {
          setTribeResult(result);
          setTimeline(genTimeline(result.attentionPct, result.emotionPct, result.cogLoad, result.score, durationSec));
        })
        .catch(err => setAnalysisError(err?.message || 'No se pudo analizar el creativo con IA.'))
        .finally(() => setAnalyzingTribe(false));
    } else {
      setSlideTab('comments');
    }
  };
  const [panelCarouselIndex, setPanelCarouselIndex] = useState(0);
  const [panelPlayingVideo, setPanelPlayingVideo] = useState(false);
  const [lifetimeInsights, setLifetimeInsights] = useState<any | null>(null);
  const [loadingLifetime, setLoadingLifetime] = useState(false);

  const LANGS: { code: 'en' | 'es'; flag: string; label: string }[] = [
    { code: 'en', flag: '🇬🇧', label: 'English' },
    { code: 'es', flag: '🇪🇸', label: 'Español' },
  ];

  const detectLang = (text: string): 'en' | 'es' => {
    const en = /\b(the|is|are|was|were|have|has|had|will|would|can|could|do|does|did|not|this|that|with|from|they|them|what|how|when|where|why|who|your|our|get|got|been|just|like|good|great|need|want|buy|order|price|ship|help|don't|I've|it's|you're|we're|haven't|didn't|won't|can't|i|my|me|we|us)\b/i.test(text);
    const es = /\b(es|el|la|los|las|un|una|que|de|en|por|para|con|como|pero|más|tengo|quiero|puedo|tienes|precio|envío|gracias|hola|si|no|del|al|muy|bien|cuando|también|qué|cómo|todo|este|esto)\b/i.test(text);
    if (en && !es) return 'en';
    return 'es';
  };

  // ── Reset on profile change ──────────────────────────────────────────────────
  const [prevProfileId, setPrevProfileId] = useState(profile?.id);
  if (profile?.id !== prevProfileId) {
    setPrevProfileId(profile?.id);
    setActiveAds([]); setAdInsightsMap({}); setCampaignMap({}); setAdsetMap({});
    setResolvedThumbnails({}); setResolvedDetails({}); setResolvingIds({});
    setLoading(true);
    setSelectedAd(null);
  }

  // ── Keyboard / click-outside ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedAd(null); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ── Comment helpers ──────────────────────────────────────────────────────────
  const isFromPage = useCallback((entry: any) => {
    if (!entry) return false;
    if (igUsername && entry.username && entry.username.toLowerCase() === igUsername.toLowerCase()) return true;
    if (igId && entry.from?.id && String(entry.from.id) === String(igId)) return true;
    if (fbPageId && entry.from?.id && String(entry.from.id) === String(fbPageId)) return true;
    if (metaAccountId && entry.from?.id && String(entry.from.id) === String(metaAccountId)) return true;
    return false;
  }, [igUsername, igId, fbPageId, metaAccountId]);

  const isCommentPending = useCallback((comment: any, _platform: 'instagram' | 'facebook') => {
    if (comment?._ignored || ignoredIds[comment?.id]) return false;
    if (isFromPage(comment)) return false;
    const replies = comment.replies?.data || [];
    if (replies.length === 0) return true;
    const sorted = [...replies].sort((a: any, b: any) =>
      new Date(a.timestamp || a.created_time || 0).getTime() - new Date(b.timestamp || b.created_time || 0).getTime()
    );
    return !isFromPage(sorted[sorted.length - 1]);
  }, [isFromPage, ignoredIds]);

  const getCommentThreadCount = (list: any[]) =>
    list.reduce((total, c) => total + 1 + (c.replies?.data?.length || 0), 0);

  const getLatestPendingTarget = useCallback((comment: any) => {
    const replies = comment.replies?.data || [];
    if (replies.length === 0) return comment;
    const sorted = [...replies].sort((a: any, b: any) =>
      new Date(a.timestamp || a.created_time || 0).getTime() - new Date(b.timestamp || b.created_time || 0).getTime()
    );
    const latest = sorted[sorted.length - 1];
    return isFromPage(latest) ? comment : latest;
  }, [isFromPage]);

  // Switch platform tab and reset reply UI
  const switchCommentPlatform = useCallback((platform: 'instagram' | 'facebook') => {
    setActiveCommentPlatform(platform);
    setOpenReplies({});
    setReplyTexts({});
    setReplyErrors({});
    setLikedIds({});
    setCommentFilter('pending');
  }, []);

  // ── Date picker helpers ──────────────────────────────────────────────────────
  const PRESETS: { id: DatePreset | 'custom'; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'yesterday', label: 'Ayer' },
    { id: 'last_7d', label: 'Últimos 7 días' },
    { id: 'last_14d', label: 'Últimos 14 días' },
    { id: 'last_28d', label: 'Últimos 28 días' },
    { id: 'last_30d', label: 'Últimos 30 días' },
    { id: 'last_90d', label: 'Últimos 90 días' },
    { id: 'this_month', label: 'Este mes' },
    { id: 'last_month', label: 'Mes pasado' },
    { id: 'this_year', label: 'Este año' },
  ];

  const MiniCal = ({ year, month, since, until, hovering: hov, onDay, onHover, onPrev, onNext }: any) => {
    const touchStart = useRef<number>(0);
    const handleTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
    const handleTouchEnd = (e: React.TouchEvent) => {
      const diff = touchStart.current - e.changedTouches[0].clientX;
      if (diff > 40 && onNext) onNext();
      if (diff < -40 && onPrev) onPrev();
    };
    const days: any[] = [];
    const first = new Date(year, month, 1).getDay();
    const startOffset = first === 0 ? 6 : first - 1;
    for (let i = 0; i < startOffset; i++) days.push(null);
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= lastDay; i++) days.push(new Date(year, month, i).toISOString().split('T')[0]);
    const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const todayStr = today();
    const prevDate = useRef(new Date(year, month, 1).getTime());
    const current = new Date(year, month, 1).getTime();
    let animClass = 'animate-in fade-in zoom-in-95 duration-200';
    if (current > prevDate.current) animClass = 'animate-in fade-in slide-in-from-right-16 duration-300';
    else if (current < prevDate.current) animClass = 'animate-in fade-in slide-in-from-left-16 duration-300';
    useEffect(() => { prevDate.current = current; }, [current]);
    return (
      <div className="w-[240px] overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="flex items-center mb-4 px-1">
          <div className="w-8 flex justify-start">{onPrev && <button onClick={onPrev} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group"><ChevronDown className="w-4 h-4 rotate-90 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" /></button>}</div>
          <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 text-center">{MONTHS_ES[month]} {year}</span>
          <div className="w-8 flex justify-end">{onNext && <button onClick={onNext} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group"><ChevronDown className="w-4 h-4 -rotate-90 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" /></button>}</div>
        </div>
        <div key={`${year}-${month}`} className={`grid grid-cols-7 gap-y-1 ${animClass}`}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="text-[10px] font-bold text-zinc-300 text-center pb-2 uppercase tracking-tighter">{d}</div>)}
          {days.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} />;
            const isToday = d === todayStr; const isFuture = d > todayStr; const isSelected = d === since || d === until;
            const isInRange = since && until && d > since && d < until;
            const isHovering = since && !until && hov && ((d > since && d <= hov) || (d < since && d >= hov));
            return (
              <button key={d} onMouseEnter={() => !isFuture && onHover(d)} onClick={() => !isFuture && onDay(d)} disabled={isFuture} className={`h-8 w-8 text-[11px] font-bold transition-all relative flex items-center justify-center ${isSelected ? 'bg-blue-600 text-white rounded-full z-10 shadow-md shadow-blue-200 dark:shadow-none' : (isInRange || isHovering) ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' : isFuture ? 'text-zinc-200 dark:text-zinc-800 cursor-default' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full'} ${isToday && !isSelected ? 'text-blue-600 dark:text-blue-500 ring-1 ring-blue-100 dark:ring-blue-900/30' : ''}`}>{d.split('-')[2]}</button>
            );
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
  };

  const fmtD = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${day}/${m}/${y.slice(2)}`; };
  const presetLabel = PRESETS.find(p => p.id === activePreset)?.label || `${fmtD(activeSince)} – ${fmtD(activeUntil)}`;
  const fmtDate = (ts: string) => { try { return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }); } catch { return ''; } };

  // ── Fetch ads ────────────────────────────────────────────────────────────────
  const fetchAds = (since?: string, until?: string) => {
    const accountId = metaAccountId;
    if (!accountId) {
      setActiveAds([]); setAdInsightsMap({}); setCampaignMap({}); setAdsetMap({});
      setResolvedThumbnails({}); setResolvedDetails({}); setResolvingIds({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    setResolvedThumbnails({}); setResolvedDetails({}); setResolvingIds({});
    const tr = { since: since || activeSince, until: until || activeUntil };
    const adFields = 'ad_id,spend,impressions,reach,inline_link_click_ctr,inline_link_clicks,actions,cost_per_action_type,action_values,purchase_roas,video_30_sec_watched_actions,video_p100_watched_actions';
    Promise.all([
      metaAds.getAccountAds(accountId).catch((err) => {
        console.error("Error fetching account ads:", err);
        setFetchError(err?.message || 'No se pudo conectar con la API de Meta.');
        return { data: [] };
      }),
      metaAds.getAdInsightsForAccount(accountId, adFields, tr).catch(() => []),
      metaAds.getCampaigns(accountId).catch(() => ({ data: [] })),
      metaAds.getAccountAdsets(accountId).catch(() => ({ data: [] })),
    ]).then(([adsRes, insightsRes, campsRes, adsetsRes]) => {
      const spentAdIds = new Set(
        (insightsRes || [])
          .filter((i: any) => parseFloat(i.spend || '0') > 0)
          .map((i: any) => i.ad_id)
          .filter(Boolean)
      );
      const adsWithSpend = (adsRes.data || []).filter((ad: any) => spentAdIds.has(ad.id));
      setActiveAds(adsWithSpend.length > 0 ? adsWithSpend : (adsRes.data || []));
      const byAdId: Record<string, any> = {};
      (insightsRes || []).forEach((i: any) => { if (i.ad_id) byAdId[i.ad_id] = i; });
      setAdInsightsMap(byAdId);
      const cMap: Record<string, string> = {};
      ((campsRes as any).data || []).forEach((c: any) => { if (c.id) cMap[c.id] = c.name; });
      setCampaignMap(cMap);
      const aMap: Record<string, string> = {};
      ((adsetsRes as any).data || []).forEach((adset: any) => { if (adset.id) aMap[adset.id] = adset.name; });
      setAdsetMap(aMap);
    }).catch((err) => {
      console.error(err);
      setFetchError(err?.message || 'No se pudo conectar con la API de Meta.');
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAds(activeSince, activeUntil); }, [profile?.id, activeSince, activeUntil]);

  // ── Creative resolver (shared fetch logic) ─────────────────────────────────
  const resolveCreative = useCallback(async (ad: any) => {
    const params = new URLSearchParams();
    if (ad.id) params.set('adId', ad.id);
    if (ad.creative?.id) params.set('creativeId', ad.creative.id);
    if (ad.creative?.video_id) params.set('videoId', ad.creative.video_id);
    if (clientId) params.set('clientId', clientId);
    params.set('v', '3');
    try {
      const res = await fetch(`/api/meta-video?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'No se pudo resolver el creativo.');
      }
      const data = await res.json();
      let thumbnail: string | null = null;
      if (data.type === 'carousel' && data.cards?.[0]?.url) thumbnail = data.cards[0].url;
      else if ((data.type === 'video_source' || data.type === 'ad_preview') && data.picture) thumbnail = data.picture;
      else if (data.type === 'image' && data.url) thumbnail = data.url;
      setResolvedDetails(prev => ({ ...prev, [ad.id]: data }));
      if (thumbnail) setResolvedThumbnails(prev => ({ ...prev, [ad.id]: thumbnail! }));
    } catch {
      setResolvedDetails(prev => ({ ...prev, [ad.id]: { type: 'failed' } }));
    } finally {
      // Always clear the resolving flag so the spinner doesn't get stuck
      setResolvingIds(prev => { const next = { ...prev }; delete next[ad.id]; return next; });
    }
  }, [clientId]);

  // ── Sliding-window background resolver ──────────────────────────────────────
  useEffect(() => {
    if (!metaAccountId || activeAds.length === 0) return;
    const activeCount = Object.keys(resolvingIds).length;
    if (activeCount >= 4) return;
    const toResolve = activeAds.filter(ad => !resolvedDetails[ad.id] && !resolvingIds[ad.id]);
    if (toResolve.length === 0) return;
    const batch = toResolve.slice(0, 4 - activeCount);
    if (batch.length === 0) return;
    setResolvingIds(prev => { const next = { ...prev }; batch.forEach(ad => { next[ad.id] = true; }); return next; });
    batch.forEach(ad => resolveCreative(ad));
  }, [activeAds, resolvedDetails, resolvingIds, metaAccountId, resolveCreative]);

  // ── Open ad slide-over ───────────────────────────────────────────────────────
  const openAd = useCallback(async (ad: any) => {
    const igStoryId: string | null = ad.creative?.effective_instagram_story_id || ad.creative?.instagram_story_id || null;
    const fbStoryId: string | null = ad.creative?.effective_object_story_id || null;

    const igPermalink: string | null = ad.creative?.instagram_permalink_url || null;
    let fbPermalink: string | null = null;
    if (fbStoryId?.includes('_')) {
      const [pId, ptId] = fbStoryId.split('_');
      fbPermalink = `https://www.facebook.com/permalink.php?story_fbid=${ptId}&id=${pId}`;
    }

    const body: string | null =
      ad.creative?.body ||
      ad.creative?.object_story_spec?.link_data?.message ||
      ad.creative?.object_story_spec?.video_data?.message ||
      null;

    const initialPlatform: 'instagram' | 'facebook' = igStoryId ? 'instagram' : 'facebook';

    setSelectedAd({ ad, adId: ad.id, name: ad.name, body, igStoryId, fbStoryId, igPermalink, fbPermalink });

    // Resolve creative immediately if not already loaded/in-progress
    if (!resolvedDetails[ad.id] && !resolvingIds[ad.id]) {
      setResolvingIds(prev => ({ ...prev, [ad.id]: true }));
      resolveCreative(ad);
    }

    setCommentsByPlatform({ instagram: [], facebook: [] });
    setActiveCommentPlatform(initialPlatform);
    setLoadingByPlatform({ instagram: !!igStoryId, facebook: !!fbStoryId });
    setOpenReplies({}); setReplyTexts({}); setReplyErrors({}); setLikedIds({});
    setCommentFilter('pending');
    setPanelCarouselIndex(0); setPanelPlayingVideo(false);
    setLifetimeInsights(null); setLoadingLifetime(true);
    metaAds.getAdLifetimeInsights(ad.id)
      .then(data => setLifetimeInsights(data))
      .catch(() => {})
      .finally(() => setLoadingLifetime(false));

    const resolveName = (c: any, fallback: string) =>
      c.username || c.from?.username || c.from?.name || c.name ||
      (c.from?.id ? `Usuario ${String(c.from.id).slice(-6)}` : fallback);

    const normalizeComment = (c: any, idx: number) => ({
      ...c,
      _ignored: !!ignoredIds[c.id],
      username: resolveName(c, `Usuario ${idx + 1}`),
      text: c.text || c.message || '',
      timestamp: c.timestamp || c.created_time || new Date().toISOString(),
      attachment: c.attachment || null,
      from: c.from || null,
      replies: c.replies
        ? { data: (c.replies.data || []).map((r: any, ri: number) => ({
              ...r,
              username: resolveName(r, `Usuario ${ri + 1}`),
              text: r.text || r.message || '',
              timestamp: r.timestamp || r.created_time || new Date().toISOString(),
              attachment: r.attachment || null,
              from: r.from || null,
            })) }
        : { data: [] },
    });

    const fetchForPlatform = async (storyId: string, platform: 'instagram' | 'facebook') => {
      try {
        const data = await metaAds.getAllAdCreativeComments(storyId, platform, fbPageId || undefined);
        const fresh = (data || []).filter((c: any) => !isFromPage(c)).map(normalizeComment);
        setCommentsByPlatform(prev => ({ ...prev, [platform]: fresh }));
      } catch { /* keep empty */ } finally {
        setLoadingByPlatform(prev => ({ ...prev, [platform]: false }));
      }
    };

    const fetches: Promise<void>[] = [];
    if (igStoryId) {
      fetches.push(fetchForPlatform(igStoryId, 'instagram'));
    } else if (fbStoryId) {
      // Try to find linked Instagram post via FB Graph API
      const igFallback = async () => {
        try {
          const data = await metaAds.getInstagramMediaFromFBPost(fbStoryId, fbPageId || undefined);
          const linkedIgId: string | undefined = data?.instagram_story?.id;
          if (linkedIgId) {
            setSelectedAd(prev => prev && prev.adId === ad.id ? { ...prev, igStoryId: linkedIgId } : prev);
            setLoadingByPlatform(prev => ({ ...prev, instagram: true }));
            await fetchForPlatform(linkedIgId, 'instagram');
          }
        } catch { /* silent — IG post not linked */ }
      };
      fetches.push(igFallback());
    }
    if (fbStoryId) fetches.push(fetchForPlatform(fbStoryId, 'facebook'));
    if (fetches.length === 0) setLoadingByPlatform({ instagram: false, facebook: false });

    Promise.all(fetches);
  }, [fbPageId, isFromPage]);

  // ── AI draft ─────────────────────────────────────────────────────────────────
  const generateDraft = async (comment: any, replyTarget?: any) => {
    if (!selectedAd || !clientId) return;
    if (!aiReady) { gate(() => generateDraft(comment, replyTarget)); return; }
    const target = replyTarget || comment;
    const text = target.text || target.message || '';
    const lang: 'en' | 'es' = target._forceLang || replyLangs[comment.id] || detectLang(text);
    if (!replyLangs[comment.id] || target._forceLang) setReplyLangs(prev => ({ ...prev, [comment.id]: lang }));
    setDraftLoading(prev => ({ ...prev, [comment.id]: true }));
    setReplyErrors(prev => ({ ...prev, [comment.id]: null }));
    try {
      const allComments = comments.map((c: any) => ({ username: c.username, text: c.text || c.message || '' }));
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || '';
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          clientId, itemText: text, username: target.username,
          postCaption: selectedAd.name, allComments,
          postPlatform: activeCommentPlatform, forceLang: lang,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'No se pudo generar el borrador.');
      }
      const data = await res.json();
      if (data.draft) {
        let draftText = data.draft;
        if (replyTarget) {
          const prefix = `@${replyTarget.username} `;
          if (!draftText.toLowerCase().startsWith(`@${replyTarget.username.toLowerCase()}`)) draftText = prefix + draftText;
        }
        setReplyTexts(prev => ({ ...prev, [comment.id]: draftText }));
      }
    } catch {
      setReplyErrors(prev => ({ ...prev, [comment.id]: 'No se pudo generar el borrador.' }));
    } finally {
      setDraftLoading(prev => ({ ...prev, [comment.id]: false }));
    }
  };

  // ── Bulk generate drafts ─────────────────────────────────────────────────────
  const bulkGenerateDrafts = async () => {
    if (!selectedAd || !clientId) return;
    if (!aiReady) { gate(() => bulkGenerateDrafts()); return; }
    const pending = comments.filter(c => isCommentPending(c, activeCommentPlatform));
    if (pending.length === 0) return;
    setBulkLoading(true);
    setOpenReplies(prev => { const copy = { ...prev }; pending.forEach(c => { copy[c.id] = true; }); return copy; });
    await Promise.all(pending.map(c => {
      const target = getLatestPendingTarget(c);
      setReplyLangs(prev => ({ ...prev, [c.id]: bulkDraftLang }));
      return target.id === c.id
        ? generateDraft({ ...c, _forceLang: bulkDraftLang })
        : generateDraft(c, { ...target, _forceLang: bulkDraftLang });
    }));
    setBulkLoading(false);
  };

  // ── Submit reply ─────────────────────────────────────────────────────────────
  const submitReply = async (e: React.FormEvent, comment: any) => {
    e.preventDefault();
    const text = replyTexts[comment.id]?.trim();
    if (!text || !selectedAd) return;
    const localId = `local_${Date.now()}`;
    const newReply = { id: localId, username: igUsername || 'Yo', text, timestamp: new Date().toISOString(), from: { id: fbPageId, name: 'Yo' }, isSending: true };
    const updateComments = (updater: (arr: any[]) => any[]) => {
      setCommentsByPlatform(prev => ({ ...prev, [activeCommentPlatform]: updater(prev[activeCommentPlatform]) }));
    };
    updateComments(arr => arr.map(c => c.id !== comment.id ? c : { ...c, replies: { data: [...(c.replies?.data || []), newReply] } }));
    setReplyTexts(prev => { const copy = { ...prev }; delete copy[comment.id]; return copy; });
    setOpenReplies(prev => ({ ...prev, [comment.id]: false }));
    setSubmitting(prev => ({ ...prev, [comment.id]: true }));
    setReplyErrors(prev => ({ ...prev, [comment.id]: null }));
    try {
      if (activeCommentPlatform === 'instagram') {
        await metaAds.replyToInstagramComment(comment.id, text, fbPageId || undefined);
      } else {
        await metaAds.replyToFacebookComment(comment.id, text);
      }
      setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null }));
      if (user?.id && clientId) {
        db.activity.log(user.id, clientId, 'reply_sent', {
          reply_text: text, incoming_text: comment.text || '', platform: activeCommentPlatform, item_id: comment.id, user_email: user.email || '',
        }).catch(() => {});
      }
      updateComments(arr => arr.map(c => {
        if (c.id !== comment.id) return c;
        return { ...c, replies: { data: (c.replies?.data || []).map((r: any) => r.id === localId ? { ...r, isSending: false } : r) } };
      }));
    } catch {
      updateComments(arr => arr.map(c => {
        if (c.id !== comment.id) return c;
        return { ...c, replies: { data: (c.replies?.data || []).filter((r: any) => r.id !== localId) } };
      }));
      setReplyTexts(prev => ({ ...prev, [comment.id]: text }));
      setOpenReplies(prev => ({ ...prev, [comment.id]: true }));
      setReplyErrors(prev => ({ ...prev, [comment.id]: 'Error al enviar la respuesta.' }));
    } finally {
      setSubmitting(prev => ({ ...prev, [comment.id]: false }));
    }
  };

  // ── Toggle like ──────────────────────────────────────────────────────────────
  const toggleLike = async (commentId: string) => {
    if (!selectedAd) return;
    const liked = !!likedIds[commentId];
    const updateComments = (updater: (arr: any[]) => any[]) => {
      setCommentsByPlatform(prev => ({ ...prev, [activeCommentPlatform]: updater(prev[activeCommentPlatform]) }));
    };
    try {
      if (liked) {
        await metaAds.unlikeComment(commentId, activeCommentPlatform, igId, fbPageId || undefined);
        setLikedIds(prev => ({ ...prev, [commentId]: false }));
        updateComments(arr => arr.map(c => c.id === commentId ? { ...c, like_count: Math.max(0, (c.like_count || 0) - 1) } : c));
      } else {
        await metaAds.likeComment(commentId, activeCommentPlatform, igId, fbPageId || undefined);
        setLikedIds(prev => ({ ...prev, [commentId]: true }));
        updateComments(arr => arr.map(c => c.id === commentId ? { ...c, like_count: (c.like_count || 0) + 1 } : c));
      }
    } catch { /* silent */ }
  };

  const toggleIgnore = (commentId: string) => {
    if (!clientId) return;
    let nextIgnored = false;
    setIgnoredIds(prev => {
      nextIgnored = !prev[commentId];
      const next = { ...prev, [commentId]: nextIgnored };
      if (!nextIgnored) delete next[commentId];
      try { localStorage.setItem(`car_ignored_comments_${clientId}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setCommentsByPlatform(prev => ({
      ...prev,
      [activeCommentPlatform]: prev[activeCommentPlatform].map(c => c.id === commentId ? { ...c, _ignored: nextIgnored } : c),
    }));
    setReplyTexts(prev => { const next = { ...prev }; delete next[commentId]; return next; });
    setOpenReplies(prev => ({ ...prev, [commentId]: false }));
  };

  // ── Misc helpers ─────────────────────────────────────────────────────────────
  const fmtN = (n: any) => { const v = parseInt(n); if (isNaN(v)) return '—'; if (v >= 1000) return `${(v / 1000).toFixed(1)}K`; return String(v); };
  const accountId = metaAccountId;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <CenteredPageLoader isLoading={loading || authLoading}>
      {AIGate}
      <div className="w-full animate-fade-in pb-20 pt-3 md:pt-6">

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

          {/* Date Picker (unifying design with CaptacionPage) */}
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1 py-0.5 md:py-1 shadow-sm h-9 md:h-10 relative z-50" ref={datePickerRef}>
            <button 
              onClick={() => {
                if (!showDatePicker) {
                  setPendingPreset(activePreset);
                  setPendingSince(activeSince);
                  setPendingUntil(activeUntil);
                }
                setShowDatePicker(!showDatePicker);
              }} 
              className="flex items-center gap-1.5 px-3 h-7 md:h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group text-[11px] md:text-[12.5px]"
            >
              {loading && activeAds.length > 0 ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              ) : (
                <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors" />
              )}
              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                {activePreset === 'custom' ? (activeSince === activeUntil ? fmtD(activeSince) : `${fmtD(activeSince)} - ${fmtD(activeUntil)}`) : PRESETS.find(p => p.id === activePreset)?.label || activePreset}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>
            {showDatePicker && (
              <div className="absolute left-auto right-0 top-full mt-3 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-50 flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 w-[290px] sm:w-[320px] md:w-auto origin-top-right">
                <div className="w-full md:w-[180px] border-b md:border-b-0 md:border-r border-zinc-50 dark:border-zinc-800 p-2 md:p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-hide">
                  {PRESETS.map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => { 
                        const r = presetToRange(p.id as any); 
                        setPendingPreset(p.id as any); 
                        setPendingSince(r.since); 
                        setPendingUntil(r.until); 
                      }} 
                      className={`flex-shrink-0 text-center md:text-left px-2.5 py-1 md:px-3 md:py-1.5 rounded-[10px] text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="px-1.5 py-4 md:p-5 flex flex-col items-center md:items-stretch">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                    <MiniCal 
                      year={calYear} 
                      month={calMonth} 
                      since={pendingSince} 
                      until={pendingUntil} 
                      hovering={hovering} 
                      onDay={(iso: string) => { 
                        setPendingPreset('custom'); 
                        if (!pendingSince || (pendingSince && pendingUntil)) { 
                          setPendingSince(iso); 
                          setPendingUntil(''); 
                        } else { 
                          if (iso < pendingSince) { 
                            setPendingUntil(pendingSince); 
                            setPendingSince(iso); 
                          } else { 
                            setPendingUntil(iso); 
                          } 
                        } 
                      }} 
                      onHover={setHovering} 
                      onPrev={() => { 
                        if (calMonth === 0) { 
                          setCalYear(calYear - 1); 
                          setCalMonth(11); 
                        } else { 
                          setCalMonth(calMonth - 1); 
                        } 
                      }} 
                      onNext={() => { 
                        if (calMonth === 11) { 
                          setCalYear(calYear + 1); 
                          setCalMonth(0); 
                        } else { 
                          setCalMonth(calMonth + 1); 
                        } 
                      }} 
                    />
                    <div className="hidden md:block">
                      <MiniCal 
                        year={calMonth === 11 ? calYear + 1 : calYear} 
                        month={calMonth === 11 ? 0 : calMonth + 1} 
                        since={pendingSince} 
                        until={pendingUntil} 
                        hovering={hovering} 
                        onDay={(iso: string) => { 
                          setPendingPreset('custom'); 
                          if (!pendingSince || (pendingSince && pendingUntil)) { 
                            setPendingSince(iso); 
                            setPendingUntil(''); 
                          } else { 
                            if (iso < pendingSince) { 
                              setPendingUntil(pendingSince); 
                              setPendingSince(iso); 
                            } else { 
                              setPendingUntil(iso); 
                            } 
                          } 
                        }} 
                        onHover={setHovering} 
                        onNext={() => { 
                          if (calMonth === 11) { 
                            setCalYear(calYear + 1); 
                            setCalMonth(0); 
                          } else { 
                            setCalMonth(calMonth + 1); 
                          } 
                        }} 
                      />
                    </div>
                  </div>
                  <div className="w-full flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <button onClick={() => setShowDatePicker(false)} className="px-4 h-9 rounded-xl text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5">Cancelar</button>
                    <button onClick={handleApplyDate} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90 flex items-center justify-center gap-1.5">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* No account */}
        {!accountId && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"><Layers className="w-7 h-7 text-zinc-400" /></div>
            <p className="text-[15px] font-semibold text-zinc-500">No hay cuenta de Meta Ads configurada</p>
            <p className="text-[13px] text-zinc-400">Configurá el ID de cuenta en el panel de administración.</p>
          </div>
        )}

        {/* Skeleton */}
        {accountId && loading && activeAds.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50 flex flex-col">
                <div className="h-52 bg-zinc-100 dark:bg-zinc-800" />
                <div className="p-4 space-y-3">
                  <div className="h-4 w-3/4 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
                  <div className="grid grid-cols-2 gap-2">{[...Array(8)].map((_, j) => <div key={j} className="h-9 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fetch error */}
        {accountId && !loading && fetchError && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center"><AlertTriangle className="w-7 h-7 text-red-500" /></div>
            <p className="text-[15px] font-semibold text-red-600 dark:text-red-400">No se pudieron cargar los anuncios</p>
            <p className="text-[13px] text-zinc-400 max-w-md">{fetchError}</p>
            <button onClick={() => fetchAds(activeSince, activeUntil)} className="mt-2 px-4 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-black shadow-sm hover:opacity-90 transition-all">Reintentar</button>
          </div>
        )}

        {/* No ads */}
        {accountId && !loading && !fetchError && activeAds.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"><Layers className="w-7 h-7 text-zinc-400" /></div>
            <p className="text-[15px] font-semibold text-zinc-500">No hay anuncios activos</p>
            <p className="text-[13px] text-zinc-400">No se encontraron anuncios activos ni anuncios con gasto en el período seleccionado.</p>
          </div>
        )}

        {/* Ads grid */}
        {accountId && activeAds.length > 0 && (() => {
          const getAdSpend = (ad: any) => parseFloat(adInsightsMap[ad.id]?.spend || 0);
          const grouped: Record<string, {
            campaignName: string;
            adsets: Record<string, { adsetName: string; ads: any[] }>;
          }> = {};
          activeAds.forEach(ad => {
            const cid = ad.campaign_id || 'other';
            const cname = campaignMap[cid] || 'Sin campaña';
            const adsetId = ad.adset_id || ad.adset?.id || 'other';
            const adsetName = adsetMap[adsetId] || ad.adset?.name || 'Sin conjunto de anuncios';
            if (!grouped[cid]) grouped[cid] = { campaignName: cname, adsets: {} };
            if (!grouped[cid].adsets[adsetId]) grouped[cid].adsets[adsetId] = { adsetName, ads: [] };
            grouped[cid].adsets[adsetId].ads.push(ad);
          });

          // Sort ads inside each ad set by spend descending.
          Object.keys(grouped).forEach(cid => {
            Object.keys(grouped[cid].adsets).forEach(adsetId => {
              grouped[cid].adsets[adsetId].ads.sort((a, b) => getAdSpend(b) - getAdSpend(a));
            });
          });

          // Sort campaigns by total campaign spend descending (highest spend campaign first)
          const sortedGroupedEntries = Object.entries(grouped).sort((a, b) => {
            const spendA = Object.values(a[1].adsets).reduce((sum, adset) => sum + adset.ads.reduce((s, ad) => s + getAdSpend(ad), 0), 0);
            const spendB = Object.values(b[1].adsets).reduce((sum, adset) => sum + adset.ads.reduce((s, ad) => s + getAdSpend(ad), 0), 0);
            return spendB - spendA;
          });

          return (
            <div className={`space-y-10 transition-opacity duration-200 ${isDateReloading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              {sortedGroupedEntries.map(([cid, group]) => {
                const adsetEntries = Object.entries(group.adsets).sort((a, b) => {
                  const spendA = a[1].ads.reduce((sum, ad) => sum + getAdSpend(ad), 0);
                  const spendB = b[1].ads.reduce((sum, ad) => sum + getAdSpend(ad), 0);
                  return spendB - spendA;
                });
                const campaignAdsCount = adsetEntries.reduce((sum, [, adset]) => sum + adset.ads.length, 0);
                return (
                <div key={cid}>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-5 rounded-full bg-blue-500 flex-shrink-0" />
                    <h4 className="text-[14px] font-black text-zinc-800 dark:text-zinc-100 tracking-tight truncate">{group.campaignName}</h4>
                    <span className="text-[11px] font-bold text-zinc-400 flex-shrink-0">{adsetEntries.length} conjuntos · {campaignAdsCount} creativos</span>
                  </div>
                  <div className="space-y-6">
                    {adsetEntries.map(([adsetId, adset]) => {
                      const adsetSpend = adset.ads.reduce((sum, ad) => sum + getAdSpend(ad), 0);
                      return (
                        <section key={adsetId} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/30 p-3 sm:p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-500">Conjunto de anuncios</p>
                              <h5 className="text-[13px] sm:text-[14px] font-black text-zinc-800 dark:text-zinc-100 truncate">{adset.adsetName}</h5>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-500">
                              <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1">{adset.ads.length} creativos</span>
                              <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 px-2.5 py-1">${adsetSpend.toFixed(0)} gasto</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {adset.ads.map(ad => {
                      const insights = adInsightsMap[ad.id];
                      const adSpend = parseFloat(insights?.spend || 0);
                      const adActions = insights?.actions || [];
                      const getA = (type: string) => { const a = adActions.find((x: any) => x.action_type === type || x.action_type === `offsite_conversion.fb_pixel_${type}`); return a ? parseInt(a.value) : 0; };
                      const purchases = getA('purchase');
                      const leads = getA('lead');
                      const messages = getA('onsite_conversion.messaging_conversation_started_7d') || getA('onsite_conversion.messaging_first_reply');
                      const totalResults = purchases + leads + messages;
                      const adCpa = totalResults > 0 ? adSpend / totalResults : 0;
                      const adCtr = parseFloat(insights?.inline_link_click_ctr || 0);
                      const adRoas = parseFloat(insights?.purchase_roas?.[0]?.value || 0);
                      const adReach = parseInt(insights?.reach || 0);
                      const adReactions = getA('post_reaction');
                      const adComments = getA('comment');
                      const adShares = getA('post');
                      const adClicks = parseInt(insights?.inline_link_clicks || 0);
                      const adVideoViews = parseInt(insights?.video_30_sec_watched_actions?.[0]?.value || 0) || getA('video_view');
                      const isVideo = ad.creative?.object_type === 'VIDEO' || !!ad.creative?.video_id;
                      const isCarousel = resolvedDetails[ad.id]?.type === 'carousel' || ad.creative?.object_type === 'CAROUSEL';
                      const thumbUrl = resolvedThumbnails[ad.id] || ad.creative?.image_url || ad.creative?.thumbnail_url;
                      const isResolving = resolvingIds[ad.id];

                      return (
                        <div key={ad.id} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 flex flex-col cursor-pointer" onClick={() => openAd(ad)}>
                          <div className="relative w-full h-52 bg-zinc-100 dark:bg-zinc-800 group overflow-hidden flex-shrink-0">
                            {thumbUrl ? (<>
                              <img src={thumbUrl} alt="" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60" aria-hidden />
                              <img src={thumbUrl} alt={ad.name} referrerPolicy="no-referrer" className="relative z-10 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
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
                          <div className="p-4 flex flex-col gap-3 flex-1">
                            <div>
                              <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">{ad.name || 'Sin nombre'}</p>
                            </div>
                            {insights && (<>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { label: 'Gasto', val: `$${adSpend.toFixed(0)}`, highlight: false },
                                  { label: 'Compras', val: purchases > 0 ? String(purchases) : '—', highlight: purchases > 0 },
                                  { label: 'Leads', val: leads > 0 ? String(leads) : '—', highlight: leads > 0 },
                                  { label: 'Mensajes', val: messages > 0 ? String(messages) : '—', highlight: messages > 0 },
                                  { label: 'CPA', val: adCpa > 0 ? `$${adCpa.toFixed(0)}` : '—', highlight: false },
                                  { label: 'ROAS', val: adRoas > 0 ? `${adRoas.toFixed(1)}` : '—', highlight: adRoas > 1 },
                                  { label: 'CTR', val: adCtr > 0 ? `${adCtr.toFixed(1)}%` : '—', highlight: false },
                                  { label: 'Alcance', val: fmtN(adReach), highlight: false },
                                ].map(({ label, val, highlight }) => (
                                  <div key={label} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-1.5 px-2 border border-zinc-100 dark:border-white/[0.04] flex items-center justify-between gap-1 min-w-0">
                                    <p className="text-[9px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-tight text-left min-w-0 flex-1 truncate" title={label}>{label}</p>
                                    <p className={`text-[11px] font-black text-right shrink-0 leading-none ${highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-800 dark:text-zinc-100'}`}>{val}</p>
                                  </div>
                                ))}
                              </div>
                            </>)}
                            <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-auto" onClick={e => e.stopPropagation()}>
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
                        </section>
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── SLIDE-OVER ──────────────────────────────────────────────────────── */}
        {selectedAd && (() => {
          const mediaData = resolvedDetails[selectedAd.adId];
          const insights = adInsightsMap[selectedAd.adId];
          const adSpend = parseFloat(insights?.spend || 0);
          const adActions = insights?.actions || [];
          const getR = (type: string) => { const a = adActions.find((x: any) => x.action_type === type || x.action_type === `offsite_conversion.fb_pixel_${type}`); return a ? parseInt(a.value) : 0; };
          const purchases = getR('purchase');
          const leads = getR('lead');
          const msgs = getR('onsite_conversion.messaging_conversation_started_7d') || getR('onsite_conversion.messaging_first_reply');
          const totalResults = purchases + leads + msgs;
          const adCpa = totalResults > 0 ? adSpend / totalResults : 0;
          const adRoas = parseFloat(insights?.purchase_roas?.[0]?.value || 0);
          const adCtr = parseFloat(insights?.inline_link_click_ctr || 0);
          const adReach = parseInt(insights?.reach || 0);
          const adImpr = parseInt(insights?.impressions || 0);

          // Lifetime engagement totals (fetched separately when ad is opened)
          const ltActions = lifetimeInsights?.actions || [];
          const getLT = (type: string) => { const a = ltActions.find((x: any) => x.action_type === type || x.action_type === `offsite_conversion.fb_pixel_${type}`); return a ? parseInt(a.value) : 0; };
          const ltReactions = getLT('post_reaction');
          const ltShares = getLT('post');
          const ltClicks = parseInt(lifetimeInsights?.inline_link_clicks || 0);
          const ltVideoViews = parseInt(lifetimeInsights?.video_30_sec_watched_actions?.[0]?.value || 0) || getLT('video_view');
          const ltVideoCompletions = parseInt(lifetimeInsights?.video_p100_watched_actions?.[0]?.value || 0);
          const thumbUrl = resolvedThumbnails[selectedAd.adId] || selectedAd.ad.creative?.image_url || selectedAd.ad.creative?.thumbnail_url;

          const pendingCount = comments.filter(c => isCommentPending(c, activeCommentPlatform)).length;
          const hasBothPlatforms = !!(selectedAd.igStoryId && selectedAd.fbStoryId);
          const activePermalink = activeCommentPlatform === 'instagram' ? selectedAd.igPermalink : selectedAd.fbPermalink;

          const igTotal = getCommentThreadCount(commentsByPlatform.instagram);
          const fbTotal = getCommentThreadCount(commentsByPlatform.facebook);
          const igPending = commentsByPlatform.instagram.filter(c => isCommentPending(c, 'instagram')).length;
          const fbPending = commentsByPlatform.facebook.filter(c => isCommentPending(c, 'facebook')).length;
          const ltTotalComments = igTotal + fbTotal;

          return (
            <PortalOverlay>
            <div className="fixed inset-0 z-[900] flex min-h-[100dvh] w-screen justify-end animate-in fade-in duration-200">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedAd(null)} />

              <div className="relative w-full md:max-w-5xl h-[100dvh] max-h-[100dvh] bg-white dark:bg-[#0d0d11] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 z-10">

                {/* Header */}
                <div className="px-4 md:px-6 py-3 md:py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex items-center justify-between flex-shrink-0 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white ${activeCommentPlatform === 'instagram' ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : 'bg-blue-600'}`}>
                      {activeCommentPlatform === 'instagram' ? <Instagram className="w-4 h-4" /> : <Facebook className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
	                      <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Anuncio</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Anuncio activo</span>
                        {!loadingComments && pendingCount > 0 && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">{pendingCount} sin responder</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {activePermalink && (
                      <a href={activePermalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 p-1.5 md:px-3 md:py-1.5 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl text-[11px] text-zinc-600 dark:text-zinc-300 font-bold border border-zinc-200 dark:border-zinc-700 transition-all">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">Ver original</span>
                      </a>
                    )}
                    <button onClick={() => setSelectedAd(null)} className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-750 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60 active:scale-95 transition-all shadow-sm"><X className="w-4 h-4" /></button>
                  </div>
                </div>

	                {/* Mobile detail tabs */}
	                <div className="grid grid-cols-3 md:hidden border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex-shrink-0 px-2 py-2 gap-1">
	                  <button
	                    onClick={() => setMobileDetailTab('post')}
	                    className={`h-9 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${mobileDetailTab === 'post' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 bg-zinc-100/70 dark:bg-zinc-800/70'}`}
	                  >
	                    <ImageIcon className="w-3.5 h-3.5" />
	                    Posteo
	                  </button>
	                  <button
	                    onClick={() => { setMobileDetailTab('comments'); handleTabChange('comments'); }}
	                    className={`h-9 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${mobileDetailTab === 'comments' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 bg-zinc-100/70 dark:bg-zinc-800/70'}`}
	                  >
	                    <MessageCircle className="w-3.5 h-3.5" />
	                    Comentarios
	                    {!loadingComments && comments.length > 0 && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/20 dark:bg-zinc-900/20">{getCommentThreadCount(comments)}</span>}
	                  </button>
	                  <button
	                    onClick={() => {
	                      const md = resolvedDetails[selectedAd.adId];
	                      const imageUrl = md?.type === 'video_source' ? (md.picture || thumbUrl) :
	                        md?.type === 'image' ? md.url :
	                        md?.type === 'carousel' ? (md.cards?.[0]?.url || thumbUrl) :
	                        thumbUrl;
	                      setMobileDetailTab('analysis');
	                      handleTabChange('metrics', imageUrl, md?.type === 'video_source', md?.source);
	                    }}
	                    className={`h-9 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${mobileDetailTab === 'analysis' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 bg-zinc-100/70 dark:bg-zinc-800/70'}`}
	                  >
	                    <Brain className="w-3.5 h-3.5" />
	                    Análisis
	                  </button>
	                </div>

	                {/* Desktop modal tabs */}
	                <div className="hidden md:grid grid-cols-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 flex-shrink-0">
	                  <button onClick={() => handleTabChange('comments')} className={`px-1 py-2.5 text-[10px] sm:text-[12px] font-black leading-tight transition-colors flex items-center justify-center gap-1.5 ${slideTab === 'comments' ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
	                    Comentarios
	                    {!loadingComments && comments.length > 0 && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">{getCommentThreadCount(comments)}</span>}
	                  </button>
	                  <button
	                    onClick={() => {
	                      const md = resolvedDetails[selectedAd.adId];
	                      const imageUrl = md?.type === 'video_source' ? (md.picture || thumbUrl) :
	                        md?.type === 'image' ? md.url :
	                        md?.type === 'carousel' ? (md.cards?.[0]?.url || thumbUrl) :
	                        thumbUrl;
	                      handleTabChange('metrics', imageUrl, md?.type === 'video_source', md?.source);
	                    }}
	                    className={`px-1 py-2.5 text-[10px] sm:text-[12px] font-black leading-tight transition-colors ${slideTab === 'metrics' ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500' : 'text-zinc-500 dark:text-zinc-400'}`}
	                  >Análisis de creativos</button>
	                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid grid-cols-1 md:grid-cols-5 auto-rows-max md:auto-rows-auto">

                  {/* Left: creative + info (40%) — always visible */}
	                  <div className={`${mobileDetailTab === 'post' ? 'flex' : 'hidden'} md:flex md:col-span-2 flex-col border-b md:border-b-0 md:border-r border-zinc-100 dark:border-zinc-800 p-3 md:p-4 max-h-none overflow-y-auto space-y-3 bg-zinc-50/15 dark:bg-zinc-950/10 md:h-full`}>

                    {/* Creative */}
                    {(!mediaData || resolvingIds[selectedAd.adId]) ? (
                      <div className="rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 aspect-square w-full flex-shrink-0 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
                        <span className="text-[10px] text-zinc-400 font-bold">Cargando creativo...</span>
                      </div>
                    ) : mediaData.type === 'video_source' ? (
                      <div className="rounded-2xl overflow-hidden bg-black border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm w-full aspect-square flex-shrink-0 relative flex items-center justify-center">
                        <video
                          src={mediaData.source || undefined}
                          poster={mediaData.picture || thumbUrl || undefined}
                          controls
                          preload="none"
                          playsInline
                          {...{ referrerPolicy: 'no-referrer' }}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : mediaData.type === 'carousel' && mediaData.cards?.length > 0 ? (() => {
                      const card = mediaData.cards[panelCarouselIndex];
                      return (
                        <div className="rounded-2xl overflow-hidden bg-black border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm w-full aspect-square flex-shrink-0 relative flex items-center justify-center">
                          {card.isVideo && card.videoSrc ? (
                            <video src={card.videoSrc} poster={card.url || undefined} controls preload="none" playsInline {...{ referrerPolicy: 'no-referrer' }} className="w-full h-full object-contain bg-black" />
                          ) : card.url ? (
                            <SmoothImage src={card.url} alt={card.name || `Slide ${panelCarouselIndex + 1}`} containerClassName="w-full h-full bg-zinc-950" className="object-contain" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-900"><ImageIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-600" /></div>
                          )}
                          {mediaData.cards.length > 1 && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setPanelCarouselIndex((panelCarouselIndex - 1 + mediaData.cards.length) % mediaData.cards.length); }} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center z-10"><ChevronLeft className="w-4 h-4" /></button>
                              <button onClick={(e) => { e.stopPropagation(); setPanelCarouselIndex((panelCarouselIndex + 1) % mediaData.cards.length); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center z-10"><ChevronRight className="w-4 h-4" /></button>
                            </>
                          )}
                          {mediaData.cards.length > 1 && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full flex gap-1.5">
                              {mediaData.cards.map((_: any, idx: number) => (
                                <button key={idx} onClick={(e) => { e.stopPropagation(); setPanelCarouselIndex(idx); }} className={`w-1.5 h-1.5 rounded-full transition-all ${idx === panelCarouselIndex ? 'bg-white scale-125' : 'bg-white/40'}`} />
                              ))}
                            </div>
                          )}
                          {card.name && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full max-w-[80%]">
                              <p className="text-[10px] font-black text-white truncate text-center">{card.name}</p>
                            </div>
                          )}
                        </div>
                      );
                    })() : mediaData.type === 'ad_preview' && mediaData.embed_html ? (() => {
                      const resizedHtml = mediaData.embed_html
                        .replace(/width="\d+"/g, 'width="100%"')
                        .replace(/height="\d+"/g, 'height="400"')
                        .replace(/<iframe/g, `<iframe style="width:100%;height:400px;border:none;"`);
                      const cleanHtml = DOMPurify.sanitize(resizedHtml, {
                        ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'style', 'src', 'width', 'height'],
                      });
                      return <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 w-full" style={{ height: 400 }} dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
                    })() : mediaData.type === 'image' || thumbUrl ? (
                      <div className="rounded-2xl overflow-hidden bg-black border border-zinc-200 dark:border-zinc-800 shadow-sm w-full aspect-square flex-shrink-0 relative flex items-center justify-center">
                        <SmoothImage
                          src={(mediaData.type === 'image' ? mediaData.url : thumbUrl) || ''}
                          alt={selectedAd.name}
                          containerClassName="w-full h-full"
                          className="object-contain"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 aspect-square w-full flex-shrink-0 flex flex-col items-center justify-center text-zinc-400 gap-2">
                        <ImageIcon className="w-8 h-8" />
                        <span className="text-[11px] font-bold">Sin preview disponible</span>
                      </div>
                    )}

                    {/* Ad name + description + performance — always below the creative */}
                    <div className="space-y-3">
                      <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                        <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-1">Nombre</p>
                        <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">{selectedAd.name}</p>
                      </div>
                      {selectedAd.body && (
                        <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                          <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-1">Descripción</p>
                          <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium line-clamp-5">{selectedAd.body}</p>
                        </div>
                      )}
                      {insights && (
                        <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl space-y-1.5">
                          <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-2">Rendimiento</p>
                          {[
                            { label: 'Gasto', val: `$${adSpend.toFixed(0)}` },
                            { label: 'Compras', val: purchases > 0 ? String(purchases) : '—', highlight: purchases > 0 },
                            { label: 'Leads', val: leads > 0 ? String(leads) : '—', highlight: leads > 0 },
                            { label: 'Mensajes', val: msgs > 0 ? String(msgs) : '—', highlight: msgs > 0 },
                            { label: 'CPA', val: adCpa > 0 ? `$${adCpa.toFixed(0)}` : '—' },
                            { label: 'ROAS', val: adRoas > 0 ? `${adRoas.toFixed(1)}` : '—', highlight: adRoas > 1 },
                            { label: 'CTR', val: adCtr > 0 ? `${adCtr.toFixed(1)}%` : '—' },
                            { label: 'Alcance', val: fmtN(adReach) },
                          ].map(({ label, val, highlight }: any) => (
                            <div key={label} className="flex items-center justify-between text-[12px] font-bold">
                              <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
                              <span className={highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'}>{val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Comments (60%) */}
	                  <div className={`${mobileDetailTab === 'post' ? 'hidden' : 'flex'} md:flex md:col-span-3 flex-col min-h-[calc(100dvh-126px)] md:min-h-0 overflow-visible md:overflow-hidden md:h-full`}>
                    {slideTab === 'metrics' ? (
                      <div className="flex-1 overflow-visible md:overflow-y-auto px-4 pt-4 pb-24 md:px-5 md:pt-5 md:pb-12 scroll-pb-24 md:scroll-pb-12 space-y-5">
                        {analyzingTribe ? (
                          <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4">
                            <div className="relative w-20 h-20">
                              <div className="absolute inset-0 rounded-full border-4 border-violet-200 dark:border-violet-900" />
                              <div className="absolute inset-0 rounded-full border-4 border-t-violet-600 animate-spin" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Brain className="w-7 h-7 text-violet-500 animate-pulse" />
                              </div>
                            </div>
	                            <p className="text-[13px] font-bold text-zinc-700 dark:text-zinc-350">Analizando creativo con IA...</p>
	                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Procesando respuesta visual</p>
	                          </div>
	                        ) : analysisError ? (
	                          <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 text-center">
	                            <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/50 flex items-center justify-center">
	                              <AlertTriangle className="w-7 h-7 text-amber-500" />
	                            </div>
	                            <p className="text-[13px] font-black text-zinc-800 dark:text-zinc-200">No se pudo analizar con IA</p>
	                            <p className="max-w-sm text-[12px] text-zinc-500 dark:text-zinc-400">{analysisError}</p>
	                          </div>
	                        ) : !tribeResult ? (
	                          <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 text-center">
	                            <Brain className="w-8 h-8 text-violet-500" />
	                            <p className="text-[13px] font-bold text-zinc-500 dark:text-zinc-400">Abrí el análisis para procesar este creativo con IA.</p>
	                          </div>
	                        ) : (() => {
	                          const metrics = tribeResult;
                          return (
                            <div className="space-y-5 text-left animate-in fade-in duration-200">
                              {/* Score global */}
                              <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/60 rounded-2xl flex items-center gap-4">
                                <div className={`w-16 h-16 rounded-full flex flex-col items-center justify-center shadow-lg font-black text-white shrink-0 ${scoreCls(metrics.score)}`}>
                                  <span className="text-[20px] leading-none">{metrics.score}</span>
                                  <span className="text-[8px] opacity-75">/100</span>
                                </div>
                                <div>
                                  <h4 className="text-[13.5px] font-black text-zinc-800 dark:text-zinc-150">{scoreLabel(metrics.score)}</h4>
                                  <p className="text-[10px] text-zinc-450 dark:text-zinc-500 mt-1">
                                    Región dominante: <span className="font-bold text-violet-600 dark:text-violet-400">{metrics.highestRegion}</span>
                                  </p>
                                </div>
                              </div>

                              {/* Barras de Métricas */}
                              <div className="p-5 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/60 rounded-2xl space-y-4">
                                <MetricBar label="Atención" value={metrics.attentionPct} color={metrics.attentionPct >= 75 ? 'bg-emerald-500' : metrics.attentionPct >= 60 ? 'bg-amber-500' : 'bg-red-500'} reason={metrics.attentionReason} />
                                <MetricBar label="Emoción" value={metrics.emotionPct} color={metrics.emotionPct >= 70 ? 'bg-emerald-500' : metrics.emotionPct >= 50 ? 'bg-amber-500' : 'bg-red-500'} reason={metrics.emotionReason} />
                                <MetricBar label="Carga Cognitiva" value={metrics.cogLoad} color={metrics.cogLoad <= 30 ? 'bg-emerald-500' : metrics.cogLoad <= 50 ? 'bg-amber-500' : 'bg-red-500'} reason={metrics.cogLoadReason} />
                              </div>

                              {/* Curva de Respuesta */}
                              {(() => {
                                const displayTimeline = timeline.length > 0 ? timeline : genTimeline(metrics.attentionPct, metrics.emotionPct, metrics.cogLoad, metrics.score, analysisDurationSec);
                                return (
                                  <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                      <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Curva de Respuesta ({formatDuration(analysisDurationSec)})</p>
                                      <div className="flex items-center gap-3 text-[9px] font-bold text-zinc-400">
                                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded-full" />Atención</span>
                                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-violet-500 inline-block rounded-full" />Emoción</span>
                                        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block rounded-full" />Impacto</span>
                                      </div>
                                    </div>
                                    <div className="h-[140px]">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={displayTimeline} margin={{ left: -15, right: 4, top: 4, bottom: 0 }}>
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" className="dark:[stroke:rgba(255,255,255,0.04)]" />
                                          <XAxis dataKey="t" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={v => `${v}s`} />
                                          <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#9ca3af' }} width={22} />
                                          <Line type="monotone" dataKey="attn" name="Atención" stroke="#10b981" strokeWidth={2} dot={false} />
                                          <Line type="monotone" dataKey="emot" name="Emoción" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                          <Line type="monotone" dataKey="impact" name="Impacto" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="flex flex-col flex-1 min-h-0 overflow-visible md:overflow-hidden">

                    {/* Platform switcher (right panel header) — only when both platforms */}
                    {hasBothPlatforms && (
                      <div className="flex flex-wrap md:flex-nowrap items-center gap-1.5 px-4 md:px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0 bg-zinc-50/50 dark:bg-zinc-900/40">
                        <button
                          onClick={() => switchCommentPlatform('instagram')}
                          className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl text-[9.5px] sm:text-[11px] font-black transition-all border ${activeCommentPlatform === 'instagram' ? 'bg-pink-50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 border-pink-200/60 dark:border-pink-800/30' : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        >
                          <Instagram className="w-3.5 h-3.5" />
                          Instagram
                          {loadingByPlatform.instagram
                            ? <Loader2 className="w-3 h-3 animate-spin opacity-50" />
                            : <span className={`text-[8px] sm:text-[9px] font-black px-1 py-0.5 rounded-full ${igPending > 0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'}`}>{igTotal}</span>
                          }
                        </button>
                        <button
                          onClick={() => switchCommentPlatform('facebook')}
                          className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl text-[9.5px] sm:text-[11px] font-black transition-all border ${activeCommentPlatform === 'facebook' ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/30' : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        >
                          <Facebook className="w-3.5 h-3.5" />
                          Facebook
                          {loadingByPlatform.facebook
                            ? <Loader2 className="w-3 h-3 animate-spin opacity-50" />
                            : <span className={`text-[8px] sm:text-[9px] font-black px-1 py-0.5 rounded-full ${fbPending > 0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'}`}>{fbTotal}</span>
                          }
                        </button>
                      </div>
                    )}

                    {/* Pending / all filter */}
                    {!loadingComments && comments.length > 0 && (
                      <div className="flex flex-wrap md:flex-nowrap items-center gap-1 px-4 md:px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0 bg-zinc-50/50 dark:bg-zinc-900/40">
                        <button onClick={() => setCommentFilter('pending')} className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[9.5px] sm:text-[11px] font-black transition-all ${commentFilter === 'pending' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                          Sin responder
                          <span className={`text-[8px] sm:text-[9px] min-w-[14px] h-[14px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full font-black flex items-center justify-center ${commentFilter === 'pending' ? 'bg-white/15 dark:bg-zinc-900/20 text-white dark:text-zinc-900' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}>{pendingCount}</span>
                        </button>
                        <button onClick={() => setCommentFilter('all')} className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[9.5px] sm:text-[11px] font-black transition-all ${commentFilter === 'all' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                          Todos
                          <span className={`text-[8px] sm:text-[9px] min-w-[14px] h-[14px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full font-black flex items-center justify-center ${commentFilter === 'all' ? 'bg-white/15 dark:bg-zinc-900/20 text-white dark:text-zinc-900' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}>{getCommentThreadCount(comments)}</span>
                        </button>
                        {pendingCount > 0 && (
                          <div className="ml-0 sm:ml-auto flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={bulkGenerateDrafts}
                              disabled={bulkLoading}
                              className="flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-black transition-all shadow-sm shadow-violet-500/20 cursor-pointer"
                            >
                              {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              <span>Sugerir con Ia ({pendingCount})</span>
                            </button>
                            <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
                              {LANGS.map(l => (
                                <button key={l.code} type="button" onClick={() => setBulkDraftLang(l.code)} className={`px-2 py-1 text-[10px] font-black rounded-md transition-all ${bulkDraftLang === l.code ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-300 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}>
                                  {l.code.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex-1 overflow-visible md:overflow-y-auto px-4 pt-4 pb-24 md:px-5 md:pt-5 md:pb-12 scroll-pb-24 md:scroll-pb-12 space-y-4">
                      {loadingComments ? (
                        <AppleLoader variant="table" count={4} />
                      ) : comments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                          <MessageCircle className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                          <p className="text-[13px] font-bold text-zinc-500">Sin comentarios de usuarios</p>
                          {!selectedAd.igStoryId && !selectedAd.fbStoryId && (
                            <p className="text-[11px] text-zinc-400">Este anuncio no tiene story ID disponible para cargar comentarios.</p>
                          )}
                        </div>
                      ) : (
                        [...comments]
                          .filter(c => commentFilter === 'all' || isCommentPending(c, activeCommentPlatform))
                          .sort((a, b) => new Date(b.timestamp || b.created_time || 0).getTime() - new Date(a.timestamp || a.created_time || 0).getTime())
                          .map(comment => {
	                            const isPending = isCommentPending(comment, activeCommentPlatform);
	                            const isIgnored = !!(comment._ignored || ignoredIds[comment.id]);
	                            const liked = !!likedIds[comment.id];
                            const replyOpen = !!openReplies[comment.id];
                            const replies = comment.replies?.data || [];
                            return (
                              <div key={comment.id} className={`bg-white dark:bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${isPending ? 'border-amber-200 dark:border-amber-800/40 shadow-sm' : 'border-zinc-200/60 dark:border-zinc-800/60'}`}>
                                <div className="p-4">
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[11px] font-black text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                                        {(comment.username || 'U')[0].toUpperCase()}
                                      </div>
                                      <div>
                                        <span className="text-[12px] font-black text-zinc-900 dark:text-white">@{comment.username}</span>
                                        <span className="text-[10px] text-zinc-400 ml-2">{comment.timestamp ? fmtDate(comment.timestamp) : ''}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
	                                      {isIgnored ? (
	                                        <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 uppercase">Ignorado</span>
	                                      ) : isPending ? (
	                                        <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 uppercase">Pendiente</span>
	                                      ) : (
                                        <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 uppercase">Respondido</span>
                                      )}
                                      <button onClick={() => toggleLike(comment.id)} className={`flex items-center gap-0.5 text-[11px] font-bold transition-colors ${liked ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'}`}>
                                        <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-red-500' : ''}`} />
                                        {comment.like_count || 0}
                                      </button>
                                    </div>
                                  </div>

                                  {comment.attachment?.media?.image?.src ? (
                                    <div className="ml-9 mt-1">
                                      <img src={comment.attachment.media.image.src} alt={comment.attachment.type || 'sticker'} referrerPolicy="no-referrer" className="max-w-[100px] max-h-[100px] rounded-lg object-contain" />
                                      {(comment.text || comment.message) && <p className="text-[13px] text-zinc-800 dark:text-zinc-100 leading-relaxed font-medium mt-1">{comment.text || comment.message}</p>}
                                    </div>
                                  ) : (
                                    <p className="text-[13px] text-zinc-800 dark:text-zinc-100 leading-relaxed font-medium ml-9">{comment.text || comment.message}</p>
                                  )}

                                  {replies.length > 0 && (
                                    <div className="ml-9 mt-3 space-y-2 pl-3 border-l-2 border-zinc-100 dark:border-zinc-800">
                                      {replies.map((r: any) => {
                                        const rIsMe = (r.username && igUsername && r.username.toLowerCase() === igUsername.toLowerCase()) || r.from?.id === fbPageId;
                                        return (
                                          <div key={r.id} className="space-y-0.5">
                                            <div className="flex items-center gap-1.5">
                                              <span className={`text-[10px] font-black ${rIsMe ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500'}`}>@{r.username || r.from?.username || r.from?.name || 'Yo'}</span>
                                              {r.isSending && <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-bold flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Enviando...</span>}
                                            </div>
                                            <p className={`text-[12px] leading-relaxed ${rIsMe ? (r.isSending ? 'text-violet-400 dark:text-violet-600 italic' : 'text-violet-700 dark:text-violet-300 font-semibold') : 'text-zinc-600 dark:text-zinc-400 font-medium'}`}>{r.text || r.message}</p>
                                            {!rIsMe && !r.isSending && (
                                              <button type="button" onClick={() => { setActiveReplyTargets(prev => ({ ...prev, [comment.id]: r })); setOpenReplies(prev => ({ ...prev, [comment.id]: true })); setReplyTexts(prev => ({ ...prev, [comment.id]: `@${r.username} ` })); }} className="text-[10px] font-black text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 transition-colors block mt-0.5">
                                                Responder
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

	                                  <div className="mt-3 ml-9 flex items-center gap-2">
	                                    <button onClick={() => { const nextOpen = !replyOpen; setOpenReplies(prev => ({ ...prev, [comment.id]: nextOpen })); setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null })); setReplyTexts(prev => ({ ...prev, [comment.id]: '' })); }} className="text-[11px] font-black text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 transition-colors">
	                                      {replyOpen ? 'Cancelar' : 'Responder'}
	                                    </button>
	                                    <button type="button" onClick={() => toggleIgnore(comment.id)} className={`text-[11px] font-black transition-colors ${isIgnored ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
	                                      <EyeOff className="w-3.5 h-3.5 inline mr-1" />
	                                      {isIgnored ? 'No ignorar' : 'Ignorar'}
	                                    </button>
	                                  </div>

                                  {replyOpen && (
                                    <div className="mt-3 ml-9 space-y-2 animate-in fade-in duration-200">
                                      {replyErrors[comment.id] && <p className="text-[10px] text-red-500 font-bold">{replyErrors[comment.id]}</p>}
                                      {activeReplyTargets[comment.id] && (
                                        <div className="flex items-center justify-between bg-violet-50/50 dark:bg-violet-950/10 px-3 py-1.5 rounded-lg border border-violet-100/30 dark:border-violet-900/10 text-[11px] font-bold text-violet-700 dark:text-violet-400">
                                          <span>Respondiendo a @{activeReplyTargets[comment.id].username}</span>
                                          <button type="button" onClick={() => { setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null })); setReplyTexts(prev => ({ ...prev, [comment.id]: '' })); }} className="text-violet-400 hover:text-violet-600 dark:hover:text-violet-300"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                      )}
                                      <form onSubmit={e => submitReply(e, comment)} className="space-y-2">
                                        <AutoResizeTextarea
                                          placeholder={activeReplyTargets[comment.id] ? `Responder a @${activeReplyTargets[comment.id].username}...` : `Responder a @${comment.username}...`}
                                          value={replyTexts[comment.id] || ''}
                                          onChange={e => setReplyTexts(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                          disabled={submitting[comment.id] || draftLoading[comment.id]}
                                          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-[12.5px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 outline-none transition-all min-h-[50px] font-medium shadow-inner"
                                        />
                                        <div className="flex items-center gap-2">
                                          <button type="button" onClick={() => generateDraft(comment, activeReplyTargets[comment.id])} disabled={submitting[comment.id] || draftLoading[comment.id]} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-[12px] font-black shadow-sm shadow-violet-500/25 transition-all">
                                            {draftLoading[comment.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                            IA
                                          </button>
                                          <div className="relative">
                                            <button type="button" onClick={() => setLangDropdownOpen(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))} className="flex items-center gap-0.5 px-2 py-1.5 text-[11px] bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 rounded-lg transition-all">
                                              {(() => { const cur = replyLangs[comment.id] || detectLang(comment.text || comment.message || ''); return LANGS.find(l => l.code === cur)?.flag ?? '🇪🇸'; })()}
                                              <svg className="w-2.5 h-2.5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                            </button>
                                            {langDropdownOpen[comment.id] && (
                                              <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[110px]">
                                                {LANGS.map(l => {
                                                  const cur = replyLangs[comment.id] || detectLang(comment.text || comment.message || '');
                                                  return (
                                                    <button key={l.code} type="button" onClick={() => { const target = activeReplyTargets[comment.id]; setReplyLangs(prev => ({ ...prev, [comment.id]: l.code })); setLangDropdownOpen(prev => ({ ...prev, [comment.id]: false })); if (target) generateDraft(comment, { ...target, _forceLang: l.code }); else generateDraft({ ...comment, _forceLang: l.code }); }} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all ${cur === l.code ? 'font-bold text-violet-600 dark:text-violet-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                                      {l.flag} {l.label}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                          <button type="submit" disabled={submitting[comment.id] || draftLoading[comment.id] || !(replyTexts[comment.id] || '').trim()} className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-black shadow-sm transition-all">
                                            {submitting[comment.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
                                            Enviar
                                          </button>
                                        </div>
                                      </form>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            </PortalOverlay>
          );
        })()}

      </div>
    </CenteredPageLoader>
  );
}
