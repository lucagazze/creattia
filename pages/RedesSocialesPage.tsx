import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useAIGate } from '../hooks/useAIGate';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import { PortalOverlay } from '../components/ui/PortalOverlay';
import {
  Instagram, Heart, MessageCircle, Image as ImageIcon, Video, Layers, Loader2, RefreshCw, X,
  ArrowUpRight, AlertCircle, ThumbsUp, MessageSquare, Sparkles, Play, Send, Brain,
  ChevronLeft, ChevronRight, EyeOff, Music2, Youtube
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { supabase } from '../services/supabase';
import { metaAds } from '../services/metaAds';
import EmailLoader from '../components/ui/EmailLoader';
import { AppleLoader } from '../components/ui/AppleLoader';
import { db } from '../services/db';
import SmoothImage from '../components/ui/SmoothImage';

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

// Formatting utilities
const fmtNumber = (v: any) => {
  const n = parseInt(v);
  if (isNaN(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('es-AR');
};

const fmtPercent = (v: any) => {
  const n = parseFloat(v);
  return isNaN(n) ? '—' : `${n.toFixed(2)}%`;
};

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

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ value, className = '', ...props }, ref) => {
    const localRef = React.useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || localRef;

    React.useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        const adjustHeight = () => {
          textarea.style.height = 'auto';
          textarea.style.height = `${textarea.scrollHeight}px`;
        };
        adjustHeight();
        const t = setTimeout(adjustHeight, 50);
        return () => clearTimeout(t);
      }
    }, [value, textareaRef]);

    return (
      <textarea
        ref={textareaRef}
        value={value}
        className={`${className} overflow-hidden resize-none`}
        rows={1}
        {...props}
      />
    );
  }
);
AutoResizeTextarea.displayName = 'AutoResizeTextarea';

export default function RedesSocialesPage() {
  const { gate, isReady: aiReady, AIGate } = useAIGate();
  const { isViewingAs, viewAsProfile } = useViewAs();
  const { profile: authProfile, user, loading: authLoading, session } = useAuth();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;

  const [refreshKey, setRefreshKey] = useState(0);
  
  // Tab State (Instagram vs Facebook)
  const [activeTab, setActiveTab] = useState<'instagram' | 'facebook' | 'tiktok' | 'youtube'>('instagram');

  // Loading and Error States
  const [igLoading, setIgLoading] = useState(true);
  const [fbLoading, setFbLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);

  // Data States
  const [igProfile, setIgProfile] = useState<any>(null);
  const [igMedia, setIgMedia] = useState<any[]>([]);
  
  const [fbProfile, setFbProfile] = useState<any>(null);
  const [fbMedia, setFbMedia] = useState<any[]>([]);
  const [youtubeProfile, setYoutubeProfile] = useState<any>(null);
  const [youtubeMedia, setYoutubeMedia] = useState<any[]>([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);

  // UI Filters
  const [mediaFilter, setMediaFilter] = useState<'all' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'>('all');
  const [fbMediaFilter, setFbMediaFilter] = useState<'all' | 'PHOTO' | 'TEXT'>('all');
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string, boolean>>({});
  const [expandedFbCaptions, setExpandedFbCaptions] = useState<Record<string, boolean>>({});

  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  // Cursor-based pagination
  const [igNextCursor, setIgNextCursor] = useState<string | null>(null);
  const [fbNextCursor, setFbNextCursor] = useState<string | null>(null);
  const [loadingMoreIg, setLoadingMoreIg] = useState(false);
  const [loadingMoreFb, setLoadingMoreFb] = useState(false);
  const igSentinelRef = useRef<HTMLDivElement>(null);
  const fbSentinelRef = useRef<HTMLDivElement>(null);

  // Comments modal/side-sheet state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostPermalink, setSelectedPostPermalink] = useState<string | null>(null);
  const [selectedPostType, setSelectedPostType] = useState<'instagram' | 'facebook'>('instagram');
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const [slideTab, setSlideTab] = useState<'comments' | 'metrics'>('comments');
  const [mobileDetailTab, setMobileDetailTab] = useState<'post' | 'comments' | 'analysis'>('post');
  const [analyzingTribe, setAnalyzingTribe] = useState(false);
  const [tribeResult, setTribeResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [analysisDurationSec, setAnalysisDurationSec] = useState(30);
  const [commentFilter, setCommentFilter] = useState<'all' | 'pending'>('pending');

  useEffect(() => {
    if (selectedPostId) {
      setSlideTab('comments');
      setMobileDetailTab('post');
      setAnalyzingTribe(false);
      setTribeResult(null);
      setAnalysisError(null);
      setTimeline([]);
      setAnalysisDurationSec(30);
      setCommentFilter('pending');
    }
  }, [selectedPostId]);

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
  const [commentInput, setCommentInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);

  // States for per-comment replies
  const [commentReplies, setCommentReplies] = useState<Record<string, string>>({});
  const [commentRepliesLoadingDraft, setCommentRepliesLoadingDraft] = useState<Record<string, boolean>>({});
  const [commentRepliesSubmitting, setCommentRepliesSubmitting] = useState<Record<string, boolean>>({});
  const [commentRepliesErrors, setCommentRepliesErrors] = useState<Record<string, string | null>>({});
  const [activeReplyCommentIds, setActiveReplyCommentIds] = useState<Record<string, boolean>>({});
  const [replyLangs, setReplyLangs] = useState<Record<string, 'en' | 'es'>>({});
  const [bulkDraftLang, setBulkDraftLang] = useState<'es' | 'en'>('es');
  const [langDropdownOpen, setLangDropdownOpen] = useState<Record<string, boolean>>({});
  const [activeReplyTargets, setActiveReplyTargets] = useState<Record<string, any>>({});
  const [bulkDraftsLoading, setBulkDraftsLoading] = useState(false);

  // Likes local state optimization
  const [likedCommentIds, setLikedCommentIds] = useState<Record<string, boolean>>({});
  const [likingCommentIds, setLikingCommentIds] = useState<Record<string, boolean>>({});
  const [ignoredIds, setIgnoredIds] = useState<Record<string, boolean>>({});

  // ── Pending Comments Panel ────────────────────────────────────────────
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [allCommentsCache, setAllCommentsCache] = useState<Record<string, any[]>>({});
  const [pendingItems, setPendingItems] = useState<Array<{ network: 'instagram' | 'facebook'; postId: string; postCaption: string; postThumb?: string; comment: any }>>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [pendingReplies, setPendingReplies] = useState<Record<string, string>>({});
  const [pendingRepliesSubmitting, setPendingRepliesSubmitting] = useState<Record<string, boolean>>({});
  const [pendingReplied, setPendingReplied] = useState<Record<string, boolean>>({});
  const [pendingDraftLoading, setPendingDraftLoading] = useState<Record<string, boolean>>({});
  const [pendingNetworkFilter, setPendingNetworkFilter] = useState<'all' | 'instagram' | 'facebook'>('all');

  // Resolve IDs from client profile
  const igId = (profile as any)?.ig_business_id;
  const igUsername = (profile as any)?.ig_username;
  const fbPageId = (profile as any)?.fb_page_id;
  const metaAccountId = (profile as any)?.meta_account_id;
  const tiktokConnected = !!((profile as any)?.tiktok_content_access_token || (profile as any)?.tiktok_advertiser_id);
  const youtubeConnected = !!((profile as any)?.youtube_access_token || (profile as any)?.youtube_channel_id);
  const visibleTabs = useMemo(() => ([
    igId ? { id: 'instagram', label: 'Instagram', short: 'IG', icon: Instagram, active: 'bg-pink-500 text-white shadow-md shadow-pink-500/20' } : null,
    fbPageId ? { id: 'facebook', label: 'Facebook', short: 'FB', icon: null, active: 'bg-blue-600 text-white shadow-md shadow-blue-600/20' } : null,
    tiktokConnected ? { id: 'tiktok', label: 'TikTok', short: 'TT', icon: Music2, active: 'bg-zinc-950 text-white shadow-md shadow-zinc-900/20' } : null,
    youtubeConnected ? { id: 'youtube', label: 'YouTube', short: 'YT', icon: Youtube, active: 'bg-red-600 text-white shadow-md shadow-red-600/20' } : null,
  ].filter(Boolean) as Array<{ id: 'instagram' | 'facebook' | 'tiktok' | 'youtube'; label: string; short: string; icon: any; active: string }>), [igId, fbPageId, tiktokConnected, youtubeConnected]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some(tab => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, visibleTabs]);

  // Unified loading states to prevent flashing empty/unconnected pages
  const loading = authLoading || (profile === undefined) || igLoading || fbLoading || youtubeLoading;

  const isFromPage = useCallback((entry: any) => {
    if (!entry) return false;
    if (igUsername && entry.username && entry.username.toLowerCase() === igUsername.toLowerCase()) return true;
    if (igId && entry.from?.id && String(entry.from.id) === String(igId)) return true;
    if (fbPageId && entry.from?.id && String(entry.from.id) === String(fbPageId)) return true;
    if (metaAccountId && entry.from?.id && String(entry.from.id) === String(metaAccountId)) return true;
    return false;
  }, [igUsername, igId, fbPageId, metaAccountId]);

  const isCommentPending = useCallback((comment: any) => {
    if (comment?._ignored || ignoredIds[comment?.id]) return false;
    if (isFromPage(comment)) return false;
    const repliesList = comment.replies?.data || [];
    if (repliesList.length === 0) return true;
    const sorted = [...repliesList].sort(
      (a, b) => new Date(a.timestamp || a.created_time || 0).getTime() - new Date(b.timestamp || b.created_time || 0).getTime()
    );
    return !isFromPage(sorted[sorted.length - 1]);
  }, [isFromPage, ignoredIds]);

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

  const getCommentThreadCount = (list: any[]) =>
    list.reduce((total, c) => total + 1 + (c.replies?.data?.length || 0), 0);

  const getMediaCommentCount = (media: any) => {
    const inline = media?.comments?.data || [];
    if (inline.length > 0) return getCommentThreadCount(inline);
    return media?.comments_count || media?.comments?.summary?.total_count || 0;
  };

  const getLatestPendingTarget = useCallback((comment: any) => {
    const repliesList = comment.replies?.data || [];
    if (repliesList.length === 0) return comment;
    const sorted = [...repliesList].sort(
      (a, b) => new Date(a.timestamp || a.created_time || 0).getTime() - new Date(b.timestamp || b.created_time || 0).getTime()
    );
    const latest = sorted[sorted.length - 1];
    return isFromPage(latest) ? comment : latest;
  }, [isFromPage]);

  // Bulk draft generation for all pending comments in the modal
  const handleBulkDrafts = async () => {
    if (!aiReady) { gate(() => handleBulkDrafts()); return; }
    const pendingComments = comments.filter(c => isCommentPending(c));
    if (pendingComments.length === 0) return;
    
    setBulkDraftsLoading(true);
    
    const postCaptionContext = igMedia.find(m => m.id === selectedPostId)?.caption || fbMedia.find(m => m.id === selectedPostId)?.message || '';
    
    const promises = pendingComments.map(async (comment) => {
      const target = getLatestPendingTarget(comment);
      setCommentRepliesLoadingDraft(prev => ({ ...prev, [comment.id]: true }));
      try {
        const usernameStr = target.username || target.from?.name || 'usuario';
        const itemTextStr = target.text || target.message || '';
        setReplyLangs(prev => ({ ...prev, [comment.id]: bulkDraftLang }));
        
        // Collect other comments in this post for context
        const otherCommentsList = comments
          .filter(c => c.id !== comment.id)
          .map(c => `@${c.username || c.from?.name || 'usuario'}: ${c.text || c.message || ''}`);

        const { data: { session: freshSession } } = await supabase.auth.getSession();
        const token = freshSession?.access_token || '';
        const res = await fetch('/api/draft-reply', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            clientId,
            itemText: itemTextStr,
            username: usernameStr,
            postCaption: postCaptionContext,
            otherComments: otherCommentsList,
            forceLang: bulkDraftLang,
          }),
        });
        
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || err.error || 'No se pudo generar el borrador.');
        }
        const data = await res.json();
        if (data.draft) {
          let draftText = data.draft;
          if (target.id !== comment.id) {
            const prefix = `@${usernameStr} `;
            if (!draftText.toLowerCase().startsWith(`@${usernameStr.toLowerCase()}`)) draftText = prefix + draftText;
          }
          setCommentReplies(prev => ({ ...prev, [comment.id]: draftText }));
        }
      } catch (err) {
        console.error(`Error generating bulk draft for comment ${comment.id}:`, err);
      } finally {
        setCommentRepliesLoadingDraft(prev => ({ ...prev, [comment.id]: false }));
      }
    });
    
    await Promise.all(promises);
    setBulkDraftsLoading(false);
  };

  // ── Fetch all pending comments across all recent posts ────────────────
  const fetchAllPendingComments = async () => {
    setLoadingPending(true);
    setPendingReplied({});
    const newCache: Record<string, any[]> = {};
    try {
      const igPosts = igMedia.slice(0, 12);
      const fbPosts = fbMedia.slice(0, 12);

      const [igResults, fbResults] = await Promise.all([
        Promise.all(igPosts.map(async (post) => {
          try {
            const cs = await metaAds.getAllInstagramMediaComments(post.id, fbPageId || undefined);
            newCache[post.id] = cs; // cache ALL comments for AI context
            return cs.filter(isCommentPending).map((c: any) => ({
              network: 'instagram' as const,
              postId: post.id,
              postCaption: post.caption || '',
              postThumb: post.thumbnail_url || post.media_url,
              comment: c,
            }));
          } catch { return []; }
        })),
        Promise.all(fbPosts.map(async (post) => {
          try {
            const cs = await metaAds.getAllFacebookPostComments(post.id);
            newCache[post.id] = cs; // cache ALL comments for AI context
            return cs.filter(isCommentPending).map((c: any) => ({
              network: 'facebook' as const,
              postId: post.id,
              postCaption: post.message || '',
              postThumb: post.full_picture,
              comment: c,
            }));
          } catch { return []; }
        })),
      ]);

      setAllCommentsCache(newCache);
      setPendingItems([...igResults.flat(), ...fbResults.flat()]);
      setPendingLoaded(true);
    } catch (err) {
      console.error('Error fetching pending comments:', err);
    } finally {
      setLoadingPending(false);
    }
  };

  const handleOpenPendingPanel = () => {
    setShowPendingPanel(true);
    if (!pendingLoaded) fetchAllPendingComments();
  };

  const handlePendingReply = async (item: { network: 'instagram' | 'facebook'; comment: any }) => {
    const text = pendingReplies[item.comment.id]?.trim();
    if (!text) return;
    setPendingRepliesSubmitting(prev => ({ ...prev, [item.comment.id]: true }));
    try {
      if (item.network === 'instagram') {
        await metaAds.replyToInstagramComment(item.comment.id, text, fbPageId || undefined);
      } else {
        await metaAds.replyToFacebookComment(item.comment.id, text);
      }
      setPendingReplied(prev => ({ ...prev, [item.comment.id]: true }));
      setPendingReplies(prev => { const c = { ...prev }; delete c[item.comment.id]; return c; });
    } catch (err) {
      console.error('Error submitting pending reply:', err);
    } finally {
      setPendingRepliesSubmitting(prev => ({ ...prev, [item.comment.id]: false }));
    }
  };

  const handlePendingDraft = async (item: { postCaption: string; postId: string; network: string; comment: any }) => {
    if (!aiReady) { gate(() => handlePendingDraft(item)); return; }
    const commentId = item.comment.id;
    setPendingDraftLoading(prev => ({ ...prev, [commentId]: true }));
    try {
      // All other comments in the post = context for the AI
      const allPostComments = allCommentsCache[item.postId] || [];
      const otherComments = allPostComments
        .filter(c => c.id !== commentId)
        .map(c => `@${c.username || c.from?.name || 'usuario'}: ${c.text || c.message || ''}`)
        .slice(0, 25);

      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || '';
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId,
          itemText: item.comment.text || item.comment.message || '',
          username: item.comment.username || item.comment.from?.name || 'usuario',
          postCaption: item.postCaption,
          otherComments,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'No se pudo generar el borrador.');
      }
      const data = await res.json();
      if (data.draft) setPendingReplies(prev => ({ ...prev, [commentId]: data.draft }));
    } catch (err) {
      console.error('Error generating draft:', err);
    } finally {
      setPendingDraftLoading(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Submit response for a specific comment (inline) (Optimistic UI)
  const handleSubmitPerComment = async (e: React.FormEvent, commentId: string) => {
    e.preventDefault();
    const replyText = commentReplies[commentId]?.trim();
    if (!replyText || !selectedPostId) return;

    const localId = `local_${Date.now()}`;
    const newReply = {
      id: localId,
      username: igUsername || 'Yo',
      text: replyText,
      timestamp: new Date().toISOString(),
      from: { id: fbPageId, name: 'Yo' },
      isSending: true,
    };

    // 1. Instantly append the reply locally
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      return { ...c, replies: { data: [...(c.replies?.data || []), newReply] } };
    }));
    
    // Clear input and close input block
    setCommentReplies(prev => {
      const copy = { ...prev };
      delete copy[commentId];
      return copy;
    });
    setActiveReplyCommentIds(prev => ({ ...prev, [commentId]: false }));

    setCommentRepliesSubmitting(prev => ({ ...prev, [commentId]: true }));
    setCommentRepliesErrors(prev => ({ ...prev, [commentId]: null }));
    
    try {
      if (selectedPostType === 'instagram') {
        await metaAds.replyToInstagramComment(commentId, replyText, fbPageId || undefined);
      } else {
        await metaAds.replyToFacebookComment(commentId, replyText);
      }

      if (user?.id && clientId) {
        const parentComment = comments.find(c => c.id === commentId);
        const incomingText = parentComment ? (parentComment.text || parentComment.message || '') : '';
        db.activity.log(user.id, clientId, 'reply_sent', {
          reply_text: replyText,
          incoming_text: incomingText,
          platform: selectedPostType,
          item_id: commentId,
          user_email: user.email || 'Desconocido'
        }).catch(err => console.error('Error logging inline comment reply activity:', err));
      }
      
      // 2. Mark reply as sent (remove isSending)
      setComments(prev => prev.map(c => {
        if (c.id !== commentId) return c;
        const updatedReplies = (c.replies?.data || []).map((r: any) => 
          r.id === localId ? { ...r, isSending: false } : r
        );
        return { ...c, replies: { data: updatedReplies } };
      }));
    } catch (err: any) {
      console.error(`Failed to submit reply to comment ${commentId}:`, err);
      // 3. On error, remove optimistic reply and restore text input
      setComments(prev => prev.map(c => {
        if (c.id !== commentId) return c;
        const filteredReplies = (c.replies?.data || []).filter((r: any) => r.id !== localId);
        return { ...c, replies: { data: filteredReplies } };
      }));
      setCommentReplies(prev => ({ ...prev, [commentId]: replyText }));
      setActiveReplyCommentIds(prev => ({ ...prev, [commentId]: true }));
      setCommentRepliesErrors(prev => ({
        ...prev,
        [commentId]: 'No se pudo enviar la respuesta. Verifica tus permisos o hazlo desde la plataforma original.'
      }));
    } finally {
      setCommentRepliesSubmitting(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Single comment AI draft generator (inline)
  const handleSingleCommentDraft = async (commentId: string, itemText: string, username: string, replyTarget?: any) => {
    if (!aiReady) { gate(() => handleSingleCommentDraft(commentId, itemText, username, replyTarget)); return; }
    const target = replyTarget || { text: itemText, username };
    const text = target.text || target.message || '';
    const lang: 'en' | 'es' = target._forceLang || replyLangs[commentId] || detectLang(text);
    if (!replyLangs[commentId] || target._forceLang) setReplyLangs(prev => ({ ...prev, [commentId]: lang }));
    setCommentRepliesLoadingDraft(prev => ({ ...prev, [commentId]: true }));
    setCommentRepliesErrors(prev => ({ ...prev, [commentId]: null }));
    try {
      const postCaptionContext = igMedia.find(m => m.id === selectedPostId)?.caption || fbMedia.find(m => m.id === selectedPostId)?.message || '';
      const otherCommentsList = comments
        .filter(c => c.id !== commentId)
        .map(c => `@${c.username || c.from?.name || 'usuario'}: ${c.text || c.message || ''}`);

      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || '';
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId,
          itemText: text,
          username: target.username,
          postCaption: postCaptionContext,
          otherComments: otherCommentsList,
          forceLang: lang,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `Draft reply error: ${res.status}`);
      }
      const data = await res.json();
      if (data.draft) {
        let draftText = data.draft;
        if (replyTarget) {
          const prefix = `@${replyTarget.username} `;
          if (!draftText.toLowerCase().startsWith(`@${replyTarget.username.toLowerCase()}`)) {
            draftText = prefix + draftText;
          }
        }
        setCommentReplies(prev => ({ ...prev, [commentId]: draftText }));
      }
    } catch (err: any) {
      console.error(`Failed to generate draft for comment ${commentId}:`, err);
      setCommentRepliesErrors(prev => ({ ...prev, [commentId]: 'No se pudo generar el borrador.' }));
    } finally {
      setCommentRepliesLoadingDraft(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Toggle liking a comment (local updates for high responsiveness)
  const handleLikeComment = async (commentId: string) => {
    if (likingCommentIds[commentId]) return;
    setLikingCommentIds(prev => ({ ...prev, [commentId]: true }));
    
    const isCurrentlyLiked = !!likedCommentIds[commentId];
    try {
      if (isCurrentlyLiked) {
        await metaAds.unlikeComment(commentId, selectedPostType, igId, fbPageId || undefined);
        setLikedCommentIds(prev => ({ ...prev, [commentId]: false }));
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, like_count: Math.max(0, (c.like_count || 0) - 1) } : c));
      } else {
        await metaAds.likeComment(commentId, selectedPostType, igId, fbPageId || undefined);
        setLikedCommentIds(prev => ({ ...prev, [commentId]: true }));
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, like_count: (c.like_count || 0) + 1 } : c));
      }
    } catch (err) {
      console.error('Error toggling comment like:', err);
    } finally {
      setLikingCommentIds(prev => ({ ...prev, [commentId]: false }));
    }
  };

  const handleIgnoreComment = (commentId: string) => {
    if (!clientId) return;
    let nextIgnored = false;
    setIgnoredIds(prev => {
      nextIgnored = !prev[commentId];
      const next = { ...prev, [commentId]: nextIgnored };
      if (!nextIgnored) delete next[commentId];
      try { localStorage.setItem(`car_ignored_comments_${clientId}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, _ignored: nextIgnored } : c));
    setCommentReplies(prev => { const next = { ...prev }; delete next[commentId]; return next; });
    setActiveReplyCommentIds(prev => ({ ...prev, [commentId]: false }));
  };

  // Track page ID in localStorage to enable token retrieval in services
  useEffect(() => {
    if (fbPageId) {
      try { localStorage.setItem('active_fb_page_id', fbPageId); } catch {}
    }
  }, [fbPageId]);

  const generateSocialCommentDraft = async () => {
    if (!replyingTo || !selectedPostId) return;
    if (!aiReady) { gate(() => generateSocialCommentDraft()); return; }
    const commentToReply = comments.find(c => c.id === replyingTo.id);
    if (!commentToReply) return;

    setLoadingDraft(true);
    setSubmitError(null);
    try {
      // Build context: post caption + all other comments in the thread
      const postCaptionContext = igMedia.find(m => m.id === selectedPostId)?.caption
        || fbMedia.find(m => m.id === selectedPostId)?.message || '';
      const otherCommentsList = comments
        .filter(c => c.id !== commentToReply.id)
        .map(c => `@${c.username || c.from?.name || 'usuario'}: ${c.text || c.message || ''}`);

      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          clientId,
          itemText: commentToReply.text || commentToReply.message || '',
          username: replyingTo.username,
          postCaption: postCaptionContext,
          otherComments: otherCommentsList,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || `Draft reply error: ${res.status}`);
      }
      const data = await res.json();
      if (data.draft) {
        setCommentInput(data.draft);
      } else {
        throw new Error('El borrador generado está vacío.');
      }
    } catch (err: any) {
      console.error('Failed to generate AI draft:', err);
      setSubmitError('No se pudo generar el borrador con IA. Reintentá o respondé manualmente.');
    } finally {
      setLoadingDraft(false);
    }
  };

  const fetchComments = async (postId: string, type: 'instagram' | 'facebook') => {
    setLoadingComments(true);
    setSubmitError(null);
    try {
      if (type === 'instagram') {
        let commentsData: any[] = [];
        try {
          commentsData = await metaAds.getAllInstagramMediaComments(postId, fbPageId || undefined);
        } catch (apiErr) {
          // Fallback: use inline comments already fetched with the media
          const cachedMedia = igMedia.find(m => m.id === postId);
          commentsData = cachedMedia?.comments?.data || [];
          console.warn('Using cached inline comments (API fetch failed):', apiErr);
        }
        setComments((commentsData || []).map((c: any) => ({ ...c, _ignored: !!ignoredIds[c.id] })));
      } else {
        const commentsData = await metaAds.getAllFacebookPostComments(postId);
        // Normalize comments for Facebook to fit same rendering structure.
        // IMPORTANT: preserve the original `from` object so isCommentPending can
        // compare from.id against fbPageId to detect page-owned replies.
        const normalized = (commentsData || []).map((c: any, idx: number) => ({
          id: c.id,
          _ignored: !!ignoredIds[c.id],
          // Use from.name if available; fall back to a numbered label so comments are distinguishable
          username: c.from?.name || c.name || c.username || `Comentarista ${idx + 1}`,
          text: c.text || c.message || '',
          timestamp: c.timestamp || c.created_time,
          like_count: c.like_count || 0,
          replies: c.replies,
          // Preserve original from so isCommentPending can check from.id === fbPageId
          from: c.from || null,
        }));
        setComments(normalized);
      }
    } catch (err: any) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const openCommentsModal = (postId: string, permalink: string, type: 'instagram' | 'facebook') => {
    setSelectedPostId(postId);
    setSelectedMediaIndex(0);
    const normalizedPermalink = type === 'instagram' && permalink
      ? permalink.replace('www.instagram.com/reel/', 'www.instagram.com/p/').replace('www.instagram.com/tv/', 'www.instagram.com/p/')
      : permalink;
    setSelectedPostPermalink(normalizedPermalink);
    setSelectedPostType(type);
    setReplyingTo(null);
    setCommentInput('');
    setSubmitError(null);
    fetchComments(postId, type);
  };

  const closeCommentsModal = () => {
    setSelectedPostId(null);
    setSelectedPostPermalink(null);
    setSelectedMediaIndex(0);
    setComments([]);
    setReplyingTo(null);
    setCommentInput('');
    setSubmitError(null);
    setCommentReplies({});
    setCommentRepliesLoadingDraft({});
    setCommentRepliesSubmitting({});
    setCommentRepliesErrors({});
    setActiveReplyCommentIds({});
    setReplyLangs({});
    setLangDropdownOpen({});
    setActiveReplyTargets({});
    setLikedCommentIds({});
    setLikingCommentIds({});
  };


  // Global keydown listeners for Escape to close slide-over
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPostId(null);
        setShowPendingPanel(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Load Instagram from cache first
  useEffect(() => {
    if (!clientId || !igId) return;
    const cacheKey = `ig_cache_${clientId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.igProfile) setIgProfile(parsed.igProfile);
        if (parsed.igMedia) setIgMedia(parsed.igMedia);
        if (parsed.igNextCursor) setIgNextCursor(parsed.igNextCursor);
      } catch (e) {
        console.error('Error parsing IG cache:', e);
      }
    }
  }, [clientId, igId]);

  // Load Facebook from cache first
  useEffect(() => {
    if (!clientId || !fbPageId) return;
    const cacheKey = `fb_cache_${clientId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.fbProfile) setFbProfile(parsed.fbProfile);
        if (parsed.fbMedia) setFbMedia(parsed.fbMedia);
        if (parsed.fbNextCursor) setFbNextCursor(parsed.fbNextCursor);
      } catch (e) {
        console.error('Error parsing FB cache:', e);
      }
    }
  }, [clientId, fbPageId]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim() || !selectedPostId) return;
    const text = commentInput.trim();

    const localId = `local_${Date.now()}`;
    
    // If replying to a specific comment inside the sheet
    if (replyingTo) {
      const commentId = replyingTo.id;
      const newReply = {
        id: localId,
        username: igUsername || 'Yo',
        text,
        timestamp: new Date().toISOString(),
        from: { id: fbPageId, name: 'Yo' },
        isSending: true,
      };

      // Instantly show local reply
      setComments(prev => prev.map(c => {
        if (c.id !== commentId) return c;
        return { ...c, replies: { data: [...(c.replies?.data || []), newReply] } };
      }));
    } else {
      // Top level comment on the post
      const newComment = {
        id: localId,
        username: igUsername || 'Yo',
        text,
        timestamp: new Date().toISOString(),
        from: { id: fbPageId, name: 'Yo' },
        like_count: 0,
        replies: { data: [] },
        isSending: true,
      };

      // Instantly show local comment
      setComments(prev => [newComment, ...prev]);
    }

    setCommentInput('');
    const prevReplyingTo = replyingTo;
    setReplyingTo(null);

    setSubmittingReply(true);
    setSubmitError(null);
    try {
      if (selectedPostType === 'instagram') {
        if (prevReplyingTo) {
          await metaAds.replyToInstagramComment(prevReplyingTo.id, text, fbPageId || undefined);
        } else {
          await metaAds.createInstagramMediaComment(selectedPostId, text, fbPageId || undefined);
        }
      } else {
        if (prevReplyingTo) {
          await metaAds.replyToFacebookComment(prevReplyingTo.id, text);
        } else {
          await metaAds.replyToFacebookComment(selectedPostId, text);
        }
      }

      // Log the reply action in car_user_activity for few-shot learning
      if (user?.id && clientId) {
        let incomingText = '';
        if (prevReplyingTo) {
          const parentComment = comments.find(c => c.id === prevReplyingTo.id);
          incomingText = parentComment ? (parentComment.text || parentComment.message || '') : '';
        } else {
          incomingText = '[Top-Level Comment on Post]';
        }
        db.activity.log(user.id, clientId, 'reply_sent', {
          reply_text: text,
          incoming_text: incomingText,
          platform: selectedPostType,
          item_id: prevReplyingTo?.id || selectedPostId,
          user_email: user.email || 'Desconocido'
        }).catch(err => console.error('Error logging comment/reply activity:', err));
      }

      // Mark local item as sent
      setComments(prev => prev.map(c => {
        if (c.id === localId) {
          return { ...c, isSending: false };
        }
        if (prevReplyingTo && c.id === prevReplyingTo.id) {
          const updatedReplies = (c.replies?.data || []).map((r: any) => 
            r.id === localId ? { ...r, isSending: false } : r
          );
          return { ...c, replies: { data: updatedReplies } };
        }
        return c;
      }));
    } catch (err: any) {
      console.error('Failed to submit comment/reply:', err);
      // Revert optimistic changes on failure
      setComments(prev => {
        if (prevReplyingTo) {
          return prev.map(c => {
            if (c.id !== prevReplyingTo.id) return c;
            const filteredReplies = (c.replies?.data || []).filter((r: any) => r.id !== localId);
            return { ...c, replies: { data: filteredReplies } };
          });
        } else {
          return prev.filter(c => c.id !== localId);
        }
      });
      setCommentInput(text);
      setReplyingTo(prevReplyingTo);
      setSubmitError('Tu token de Meta es de solo lectura o no tiene los permisos necesarios para comentar/responder directamente. Podés hacer click en el botón de abajo para responder en la plataforma.');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Reset loaded states when refreshKey changes so they will be re-fetched on demand
  useEffect(() => {
    setFbProfile(null);
    setFbMedia([]);
    setFbLoading(true);
  }, [refreshKey]);

  // Reset all states when client changes
  useEffect(() => {
    setIgProfile(null);
    setIgMedia([]);
    setIgNextCursor(null);
    setIgLoading(true);
    setError(null);
    
    setFbProfile(null);
    setFbMedia([]);
    setFbNextCursor(null);
    setFbLoading(false);
    setFbError(null);

    setPlayingVideoId(null);
    setSelectedPostId(null);
    setSelectedPostPermalink(null);
    setComments([]);
    setReplyingTo(null);
    setCommentInput('');
    setSubmitError(null);
    setCommentReplies({});
    setCommentRepliesLoadingDraft({});
    setCommentRepliesSubmitting({});
    setCommentRepliesErrors({});
    setActiveReplyCommentIds({});
    setLikedCommentIds({});
    setLikingCommentIds({});

    setShowPendingPanel(false);
    setPendingItems([]);
    setPendingLoaded(false);
  }, [clientId]);

  // Auto-select Facebook if only Facebook is configured
  useEffect(() => {
    if (!igId && fbPageId) {
      setActiveTab('facebook');
    }
  }, [igId, fbPageId]);

  // Load Instagram independently (SWR)
  useEffect(() => {
    if (!clientId) return;

    let active = true;
    setIgLoading(!!igId);
    setError(null);
    setIgNextCursor(null);

    if (igId) {
      Promise.all([
        metaAds.getInstagramProfile(igId, fbPageId || undefined).catch(() => null),
        metaAds.getInstagramMedia(igId, 8, undefined, fbPageId || undefined).catch(() => []),
      ]).then(([profileRes, mediaRes]) => {
        if (!active) return;
        setIgProfile(profileRes);
        const media = (mediaRes as any)?.data || mediaRes || [];
        setIgMedia(media);
        const nextCursor = (mediaRes as any)?.paging?.cursors?.after || null;
        setIgNextCursor(nextCursor);

        // Update Cache
        try {
          sessionStorage.setItem(`ig_cache_${clientId}`, JSON.stringify({
            igProfile: profileRes,
            igMedia: media,
            igNextCursor: nextCursor
          }));
        } catch (e) { /* quota exceeded — ignore */ }
      }).catch(err => {
        if (active) setError(err.message || 'Error al obtener datos de Instagram.');
      }).finally(() => { if (active) setIgLoading(false); });
    } else {
      setIgLoading(false);
    }

    return () => { active = false; };
  }, [clientId, igId, refreshKey]);

  // Load Facebook independently on demand (SWR)
  useEffect(() => {
    if (!clientId) return;
    if (!fbPageId) {
      setFbLoading(false);
      return;
    }
    if (activeTab !== 'facebook') return;
    if (fbProfile !== null) return; // Prevent refetching if already loaded for the current refreshKey

    let active = true;
    const cacheKey = `fb_cache_${clientId}`;
    const hasCache = sessionStorage.getItem(cacheKey);

    // Restore from cache immediately to prevent flash on tab switch
    if (hasCache) {
      try {
        const parsed = JSON.parse(hasCache);
        if (parsed.fbProfile) setFbProfile(parsed.fbProfile);
        if (parsed.fbMedia) setFbMedia(parsed.fbMedia);
        if (parsed.fbNextCursor) setFbNextCursor(parsed.fbNextCursor);
      } catch (e) { /* ignore parse error */ }
    }
    setFbLoading(!!fbPageId);
    setFbError(null);
    setFbNextCursor(null);

    Promise.all([
      metaAds.getFacebookPageInfo(fbPageId).catch(() => null),
      metaAds.getFacebookPageFeed(fbPageId, 8).catch(err => { setFbError(err.message || String(err)); return []; }),
    ]).then(([profileRes, feedRes]) => {
      if (!active) return;
      setFbProfile(profileRes);
      const media = ((feedRes as any)?.data || feedRes || []).map((p: any) => ({ ...p, source: p.source || p.attachments?.data?.[0]?.media?.source || null }));
      setFbMedia(media);
      const nextCursor = (feedRes as any)?.paging?.cursors?.after || null;
      setFbNextCursor(nextCursor);

      // Update Cache
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({
          fbProfile: profileRes,
          fbMedia: media,
          fbNextCursor: nextCursor
        }));
      } catch (e) { /* quota exceeded — ignore */ }
    }).finally(() => { if (active) setFbLoading(false); });

    return () => { active = false; };
  }, [clientId, fbPageId, activeTab, refreshKey, fbProfile]);

  useEffect(() => {
    if (!clientId || activeTab !== 'youtube' || !youtubeConnected) return;
    let active = true;
    setYoutubeLoading(true);
    setYoutubeError(null);
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      return Promise.all([
        fetch(`/api/oauth?action=youtube-profile&clientId=${encodeURIComponent(clientId)}`, { headers }).then(r => r.json()),
        fetch(`/api/oauth?action=youtube-posts&clientId=${encodeURIComponent(clientId)}`, { headers }).then(r => r.json())
      ]);
    }).then(([profileJson, postsJson]) => {
      if (!active) return;
      if (profileJson.error) throw new Error(profileJson.error);
      if (postsJson.error) throw new Error(postsJson.error);
      setYoutubeProfile(profileJson.items?.[0] || null);
      setYoutubeMedia(postsJson.items || []);
    }).catch(err => {
      if (active) setYoutubeError(err.message || 'No se pudo obtener YouTube.');
    }).finally(() => { if (active) setYoutubeLoading(false); });
    return () => { active = false; };
  }, [clientId, activeTab, youtubeConnected, refreshKey]);

  // Filters for Instagram Feed
  const filteredMedia = useMemo(() => {
    if (mediaFilter === 'all') return igMedia;
    return igMedia.filter(post => post.media_type === mediaFilter);
  }, [igMedia, mediaFilter]);

  // Filters for Facebook Feed
  const filteredFbMedia = useMemo(() => {
    if (fbMediaFilter === 'all') return fbMedia;
    if (fbMediaFilter === 'PHOTO') return fbMedia.filter(post => post.full_picture);
    return fbMedia.filter(post => !post.full_picture);
  }, [fbMedia, fbMediaFilter]);

  const loadMoreIg = async () => {
    if (!igId || !igNextCursor || loadingMoreIg) return;
    setLoadingMoreIg(true);
    try {
      const res = await metaAds.getInstagramMedia(igId, 8, igNextCursor, fbPageId || undefined);
      const newPosts = res?.data || [];
      setIgMedia(prev => [...prev, ...newPosts]);
      setIgNextCursor(res?.paging?.cursors?.after || null);
    } catch (e) { console.error(e); }
    finally { setLoadingMoreIg(false); }
  };

  const loadMoreFb = async () => {
    if (!fbPageId || !fbNextCursor || loadingMoreFb) return;
    setLoadingMoreFb(true);
    try {
      const res = await metaAds.getFacebookPageFeed(fbPageId, 8, fbNextCursor);
      const newPosts = (res?.data || []).map((p: any) => ({ ...p, source: p.source || p.attachments?.data?.[0]?.media?.source || null }));
      setFbMedia(prev => [...prev, ...newPosts]);
      setFbNextCursor(res?.paging?.cursors?.after || null);
    } catch (e) { console.error(e); }
    finally { setLoadingMoreFb(false); }
  };

  // IntersectionObserver for Instagram sentinel
  useEffect(() => {
    if (!igSentinelRef.current || activeTab !== 'instagram') return;
    const scrollRoot = document.getElementById('main-scroll-container');
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && igNextCursor && !loadingMoreIg) loadMoreIg(); },
      { root: scrollRoot, rootMargin: '700px 0px', threshold: 0.01 }
    );
    observer.observe(igSentinelRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, igNextCursor, loadingMoreIg, igId]);

  // IntersectionObserver for Facebook sentinel
  useEffect(() => {
    if (!fbSentinelRef.current || activeTab !== 'facebook') return;
    const scrollRoot = document.getElementById('main-scroll-container');
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && fbNextCursor && !loadingMoreFb) loadMoreFb(); },
      { root: scrollRoot, rootMargin: '700px 0px', threshold: 0.01 }
    );
    observer.observe(fbSentinelRef.current);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fbNextCursor, loadingMoreFb, fbPageId]);

  // Fallback scroll trigger: some mobile/tablet browsers do not reliably fire
  // IntersectionObserver inside the app shell. This keeps infinite loading
  // working when the user reaches the bottom of the page.
  useEffect(() => {
    const scrollRoot = document.getElementById('main-scroll-container');
    let raf = 0;

    const checkNearBottom = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const scrollTop = scrollRoot ? scrollRoot.scrollTop : window.scrollY;
        const clientHeight = scrollRoot ? scrollRoot.clientHeight : window.innerHeight;
        const scrollHeight = scrollRoot ? scrollRoot.scrollHeight : document.documentElement.scrollHeight;
        const nearBottom = scrollHeight - scrollTop - clientHeight < 900;

        if (!nearBottom) return;
        if (activeTab === 'instagram' && igNextCursor && !loadingMoreIg) {
          loadMoreIg();
        }
        if (activeTab === 'facebook' && fbNextCursor && !loadingMoreFb) {
          loadMoreFb();
        }
      });
    };

    const target: any = scrollRoot || window;
    target.addEventListener('scroll', checkNearBottom, { passive: true });
    checkNearBottom();
    return () => {
      cancelAnimationFrame(raf);
      target.removeEventListener('scroll', checkNearBottom);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, igNextCursor, fbNextCursor, loadingMoreIg, loadingMoreFb, igId, fbPageId]);


  const igEngagementRate = useMemo(() => {
    if (!igProfile || !igProfile.followers_count || !igMedia.length) return 0;
    const totalInteractions = igMedia.reduce((sum, item) => sum + (item.like_count || 0) + getMediaCommentCount(item), 0);
    const avgInteractionsPerPost = totalInteractions / igMedia.length;
    return (avgInteractionsPerPost / igProfile.followers_count) * 100;
  }, [igProfile, igMedia]);

  // FB Engagement Rate
  const fbEngagementRate = useMemo(() => {
    if (!fbProfile || !(fbProfile.followers_count || fbProfile.fan_count) || !fbMedia.length) return 0;
    const totalInteractions = fbMedia.reduce((sum, item) => {
      const likesCount = item.likes?.summary?.total_count || 0;
      const commentsCount = getMediaCommentCount(item);
      return sum + likesCount + commentsCount;
    }, 0);
    const avgInteractionsPerPost = totalInteractions / fbMedia.length;
    const divisor = fbProfile.followers_count || fbProfile.fan_count || 1;
    return (avgInteractionsPerPost / divisor) * 100;
  }, [fbProfile, fbMedia]);

  const toggleCaption = (id: string) => {
    setExpandedCaptions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFbCaption = (id: string) => {
    setExpandedFbCaptions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <CenteredPageLoader isLoading={authLoading || profile === undefined}>
    {AIGate}
    <div className="space-y-5 md:space-y-8 w-full pt-3 md:pt-6 animate-in fade-in duration-300">

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div>
          <h1 className="text-[26px] md:text-[30px] font-black tracking-tight text-zinc-900 dark:text-white leading-none flex items-center gap-2">
            Contenido Orgánico
          </h1>
          <p className="text-[12.5px] text-zinc-400 font-bold mt-1.5 flex items-center gap-1.5">
            Publicaciones, interacciones y métricas clave de tus perfiles sociales en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-start md:justify-end">
          {/* Tab Selector Buttons */}
          <div className="flex items-center gap-1 bg-zinc-100/80 dark:bg-zinc-800/60 p-1 rounded-2xl border border-zinc-200/20 dark:border-zinc-700/60">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl text-[10.5px] sm:text-[12px] font-black transition-all ${
                    activeTab === tab.id
                      ? tab.active
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  {Icon ? <Icon className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 font-black flex items-center justify-center text-[15px] leading-none">f</span>}
                  <span className="hidden xs:inline">{tab.label}</span>
                  <span className="xs:hidden">{tab.short}</span>
                </button>
              );
            })}
          </div>


        </div>
      </div>

      {/* Main Container */}
      {error ? (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-5 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-800 dark:text-red-400 text-[14.5px]">Error al obtener datos</h3>
            <p className="text-[13px] text-red-600 dark:text-red-500 mt-1">{error}</p>
          </div>
        </div>
      ) : (authLoading || (!clientId && !igId && !fbPageId && !tiktokConnected && !youtubeConnected)) ? (
        <AppleLoader variant="page" />
      ) : !igId && !fbPageId && !tiktokConnected && !youtubeConnected ? (
        <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm">
          <Instagram className="w-12 h-12 text-zinc-400 mx-auto" />
          <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Perfiles no configurados</h3>
          <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
            Asociá tus perfiles sociales desde la Gestión de Clientes para poder analizar y visualizar los datos en este panel.
          </p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* TAB 1: INSTAGRAM ORGANICO */}
          {activeTab === 'instagram' && (
            <div className="space-y-6">
              
              {authLoading || !clientId ? (
                <AppleLoader variant="page" />
              ) : !igId ? (
                <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm animate-in fade-in duration-200">
                  <Instagram className="w-12 h-12 text-zinc-400 mx-auto" />
                  <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Instagram no configurado</h3>
                  <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    Parece que la cuenta de Instagram no está configurada para este cliente. No puedo acceder a las publicaciones en este momento.
                  </p>
                </div>
              ) : igLoading ? (
                <AppleLoader variant="page" />
              ) : (
                <div className="space-y-6 md:space-y-8 animate-in fade-in duration-200">

                  {/* Profile Bar */}
                  {igProfile && (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
                      <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                        {igProfile.profile_picture_url ? (
                          <SmoothImage 
                            src={igProfile.profile_picture_url} 
                            alt={igUsername} 
                            containerClassName="w-16 h-16 rounded-full ring-2 ring-pink-500/30" 
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 flex items-center justify-center text-white">
                            <Instagram className="w-7 h-7" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2 justify-center md:justify-start">
                            <h2 className="text-[18px] font-black text-zinc-900 dark:text-white">@{igProfile.username}</h2>
                            <span className="bg-pink-50 text-pink-600 dark:bg-pink-950/20 dark:text-pink-400 px-2 py-0.5 rounded-full text-[10px] font-bold">Instagram</span>
                          </div>
                          <p className="text-[12.5px] text-zinc-400 font-bold mt-0.5">{igProfile.name}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 sm:gap-4 flex-nowrap justify-center font-semibold">
                        <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center flex-1 sm:flex-none sm:min-w-[90px]">
                          <p className="text-[14px] sm:text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(igProfile.followers_count)}</p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold mt-1 sm:mt-1.5 uppercase">Seguidores</p>
                        </div>
                        <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center flex-1 sm:flex-none sm:min-w-[90px]">
                          <p className="text-[14px] sm:text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(igProfile.media_count)}</p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold mt-1 sm:mt-1.5 uppercase">Publicaciones</p>
                        </div>
                        <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center flex-1 sm:flex-none sm:min-w-[90px]">
                          <p className="text-[14px] sm:text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtPercent(igEngagementRate)}</p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold mt-1 sm:mt-1.5 uppercase">Engagement</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Feed Filters */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex flex-wrap items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700 p-0.5 rounded-xl flex-shrink-0">
                      {[
                        { id: 'all', label: 'Todo', labelMobile: 'Todo', icon: Instagram },
                        { id: 'IMAGE', label: 'Imágenes', labelMobile: 'Fotos', icon: ImageIcon },
                        { id: 'VIDEO', label: 'Videos', labelMobile: 'Videos', icon: Video },
                        { id: 'CAROUSEL_ALBUM', label: 'Carruseles', labelMobile: 'Álbums', icon: Layers }
                      ].map(f => {
                        const Icon = f.icon;
                        return (
                          <button
                            key={f.id}
                            onClick={() => setMediaFilter(f.id as any)}
                            className={`flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[11px] font-black transition-all whitespace-nowrap ${
                              mediaFilter === f.id
                                ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="hidden sm:inline">{f.label}</span>
                            <span className="sm:hidden">{f.labelMobile}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12px] text-zinc-400 font-bold flex-shrink-0">{filteredMedia.length} posts</p>
                  </div>

                  {/* Grid of posts */}
                  {filteredMedia.length === 0 ? (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-12 text-center">
                      <ImageIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                      <p className="text-[13.5px] font-bold text-zinc-500">No se encontraron publicaciones</p>
                      <p className="text-[12px] text-zinc-400 mt-1">Intentá cambiando el filtro o cargando más adelante.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {filteredMedia.map((m: any) => {
                        const hasLongCaption = m.caption && m.caption.length > 80;
                        const isExpanded = !!expandedCaptions[m.id];
                        const dateStr = m.timestamp 
                          ? new Date(m.timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '';

                        return (
                          <div 
                            key={m.id} 
                            className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300 flex flex-col justify-between"
                          >
                             {/* Thumbnail Container */}
                            <div className="aspect-square w-full bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-zinc-100 dark:border-zinc-800/60">
                              {playingVideoId === m.id ? (
                                <video
                                  src={m.media_url}
                                  controls
                                  autoPlay
                                  preload="none"
                                  {...{ referrerPolicy: "no-referrer" }}
                                  className="w-full h-full object-contain bg-black"
                                />
                              ) : (
                                <div 
                                  onClick={() => {
                                    openCommentsModal(m.id, m.permalink, 'instagram');
                                  }}
                                  className="w-full h-full relative cursor-pointer"
                                  title="Ver comentarios"
                                >
                                  {m.media_url || m.thumbnail_url ? (
                                    <SmoothImage 
                                      src={m.media_type === 'VIDEO' ? (m.thumbnail_url || m.media_url) : (m.media_url || m.thumbnail_url)} 
                                      alt="" 
                                      containerClassName="w-full h-full"
                                      className="object-cover group-hover:scale-[1.03] transition-transform duration-500" 
                                    />
                                  ) : (
                                    <ImageIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-700 animate-pulse" />
                                  )}

                                  {/* Play Icon/Button - Always visible for videos, handles click to play in-place */}
                                  {m.media_type === 'VIDEO' && (
                                    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPlayingVideoId(m.id);
                                        }}
                                        className="pointer-events-auto w-14 h-14 rounded-full bg-white/90 hover:bg-white text-pink-600 flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer"
                                        title="Reproducir video"
                                      >
                                        <svg className="w-6 h-6 fill-current ml-1" viewBox="0 0 24 24">
                                          <path d="M8 5v14l11-7z" />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                  
                                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white p-1.5 rounded-lg text-xs flex items-center justify-center z-10">
                                    {m.media_type === 'VIDEO' && <Video className="w-3.5 h-3.5" />}
                                    {m.media_type === 'CAROUSEL_ALBUM' && <Layers className="w-3.5 h-3.5" />}
                                    {m.media_type === 'IMAGE' && <ImageIcon className="w-3.5 h-3.5" />}
                                  </div>

                                  {/* Hover Overlay: Likes & Comments */}
                                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-6 text-white font-bold select-none z-10">
                                    {m.media_type === 'VIDEO' ? (
                                      <div className="flex flex-col items-center justify-end h-full pb-8 gap-4">
                                        <div className="flex items-center gap-6">
                                          <div className="flex items-center gap-1.5 text-[14px]">
                                            <Heart className="w-5 h-5 fill-white text-white" />
                                            <span>{fmtNumber(m.like_count || 0)}</span>
                                          </div>
                                          <div className="flex items-center gap-1.5 text-[14px]">
                                            <MessageCircle className="w-5 h-5 fill-white text-white" />
                                            <span>{fmtNumber(getMediaCommentCount(m))}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex items-center gap-1.5 text-[14px]">
                                          <Heart className="w-5 h-5 fill-white text-white" />
                                          <span>{fmtNumber(m.like_count || 0)}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[14px]">
                                          <MessageCircle className="w-5 h-5 fill-white text-white" />
                                          <span>{fmtNumber(getMediaCommentCount(m))}</span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Description & metadata */}
                            <div 
                              onClick={() => openCommentsModal(m.id, m.permalink, 'instagram')}
                              className="p-4 flex-1 flex flex-col justify-between space-y-3 cursor-pointer"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
                                  <span>{dateStr}</span>
                                  <span className="uppercase text-[9px] tracking-widest text-zinc-350 dark:text-zinc-500">{m.media_type}</span>
                                </div>

                                {m.caption && (
                                  <p className="text-[12.5px] text-zinc-755 dark:text-zinc-300 leading-snug break-words font-medium">
                                    {isExpanded ? m.caption : `${m.caption.slice(0, 80)}${hasLongCaption ? '...' : ''}`}
                                    {hasLongCaption && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleCaption(m.id); }}
                                        className="text-pink-500 font-bold hover:underline ml-1 cursor-pointer focus:outline-none"
                                      >
                                        {isExpanded ? 'Ver menos' : 'Ver más'}
                                      </button>
                                    )}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800/60 mt-auto">
                                <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400 text-[12px] font-bold">
                                  <span className="flex items-center gap-1 cursor-default"><Heart className="w-3.5 h-3.5 text-zinc-450" /> {m.like_count || 0}</span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openCommentsModal(m.id, m.permalink, 'instagram'); }}
                                    className="flex items-center gap-1 hover:text-pink-500 transition-colors cursor-pointer"
                                    title="Ver y responder comentarios"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-zinc-450" /> {getMediaCommentCount(m)}
                                  </button>
                                </div>
                                
                                {m.permalink && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openCommentsModal(m.id, m.permalink, 'instagram'); }}
                                    className="text-[11px] font-black text-pink-600 dark:text-pink-400 hover:text-pink-850 dark:hover:text-pink-300 flex items-center gap-1 hover:underline cursor-pointer"
                                  >
                                    Abrir post
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* IG scroll sentinel */}
                  {igNextCursor && (
                    <div ref={igSentinelRef} className="flex justify-center py-4">
                      {loadingMoreIg && <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-pink-500 rounded-full animate-spin" />}
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

          {/* TAB 2: FACEBOOK ORGANICO */}
          {activeTab === 'facebook' && (
            <div className="space-y-6">

              {authLoading || !clientId ? (
                <AppleLoader variant="page" />
              ) : !fbPageId ? (
                <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm animate-in fade-in duration-200">
                  <span className="w-12 h-12 text-zinc-400 mx-auto font-black text-4xl flex items-center justify-center">f</span>
                  <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Facebook no configurado</h3>
                  <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    Parece que la página de Facebook no está configurada para este cliente. No puedo acceder al feed en este momento.
                  </p>
                </div>
              ) : fbLoading ? (
                <AppleLoader variant="page" />
              ) : (
                <div className="space-y-6 md:space-y-8 animate-in fade-in duration-200">

                  {/* Profile Bar */}
                  {fbProfile && (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
                      <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                        {fbProfile.picture?.data?.url ? (
                          <SmoothImage 
                            src={fbProfile.picture.data.url} 
                            alt={fbProfile.name} 
                            containerClassName="w-16 h-16 rounded-full ring-2 ring-blue-500/30" 
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-3xl">
                            f
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2 justify-center md:justify-start">
                            <h2 className="text-[18px] font-black text-zinc-900 dark:text-white">{fbProfile.name}</h2>
                            <span className="bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 px-2 py-0.5 rounded-full text-[10px] font-bold">Facebook</span>
                          </div>
                          {fbProfile.about && (
                            <p className="text-[12.5px] text-zinc-400 font-bold mt-0.5 max-w-md line-clamp-1">{fbProfile.about}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 sm:gap-4 flex-nowrap justify-center font-semibold">
                        <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center flex-1 sm:flex-none sm:min-w-[90px]">
                          <p className="text-[14px] sm:text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(fbProfile.followers_count || fbProfile.fan_count)}</p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold mt-1 sm:mt-1.5 uppercase">Seguidores</p>
                        </div>
                        <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center flex-1 sm:flex-none sm:min-w-[90px]">
                          <p className="text-[14px] sm:text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(fbProfile.fan_count)}</p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold mt-1 sm:mt-1.5 uppercase">Likes</p>
                        </div>
                        <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center flex-1 sm:flex-none sm:min-w-[90px]">
                          <p className="text-[14px] sm:text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtPercent(fbEngagementRate)}</p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold mt-1 sm:mt-1.5 uppercase">Engagement</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {fbError && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-4.5 rounded-3xl flex items-start gap-3 animate-in fade-in duration-200">
                      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-amber-800 dark:text-amber-400 text-[13.5px]">Error de permisos de Facebook</h4>
                        <p className="text-[12px] text-amber-600 dark:amber-500 mt-1 leading-relaxed">
                          No se pudo cargar el feed orgánico. Esto ocurre si el token de acceso del usuario no tiene los permisos necesarios de administrador sobre la página de Facebook del cliente:
                        </p>
                        <code className="block mt-2.5 p-2 bg-amber-100/60 dark:bg-amber-950/40 rounded-xl text-[11px] font-mono break-all text-amber-800 dark:text-amber-300">
                          {fbError}
                        </code>
                      </div>
                    </div>
                  )}

                  {/* Feed Filters */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex flex-wrap items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700 p-0.5 rounded-xl flex-shrink-0">
                      {[
                        { id: 'all', label: 'Todo', icon: MessageCircle },
                        { id: 'PHOTO', label: 'Con Fotos', icon: ImageIcon },
                        { id: 'TEXT', label: 'Texto', icon: MessageSquare }
                      ].map(f => {
                        const Icon = f.icon;
                        return (
                          <button
                            key={f.id}
                            onClick={() => setFbMediaFilter(f.id as any)}
                            className={`flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[11px] font-black transition-all whitespace-nowrap ${
                              fbMediaFilter === f.id
                                ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12px] text-zinc-400 font-bold flex-shrink-0">{filteredFbMedia.length} posts</p>
                  </div>

                  {/* Grid of Facebook posts */}
                  {filteredFbMedia.length === 0 ? (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-12 text-center">
                      <ImageIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                      <p className="text-[13.5px] font-bold text-zinc-500">No se encontraron publicaciones</p>
                      <p className="text-[12px] text-zinc-400 mt-1">Intentá cambiando el filtro o cargando más adelante.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {filteredFbMedia.map((m: any) => {
                        const hasLongCaption = m.message && m.message.length > 80;
                        const isExpanded = !!expandedFbCaptions[m.id];
                        const dateStr = m.created_time 
                          ? new Date(m.created_time).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '';

                        return (
                          <div 
                            key={m.id} 
                            className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300 flex flex-col justify-between"
                          >
                            <div className="aspect-square w-full bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-zinc-100 dark:border-zinc-800/60">
                              {playingVideoId === m.id ? (
                                <video
                                  src={m.source}
                                  controls
                                  autoPlay
                                  preload="none"
                                  {...{ referrerPolicy: "no-referrer" }}
                                  className="w-full h-full object-contain bg-black"
                                />
                              ) : (
                                <div 
                                  onClick={() => openCommentsModal(m.id, m.permalink_url, 'facebook')}
                                  className="w-full h-full relative cursor-pointer"
                                  title="Ver comentarios"
                                >
                                  {m.full_picture ? (
                                    <SmoothImage 
                                      src={m.full_picture} 
                                      alt="" 
                                      containerClassName="w-full h-full"
                                      className="object-cover group-hover:scale-[1.03] transition-transform duration-500" 
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-blue-50 dark:bg-blue-950/20 flex flex-col items-center justify-center p-6 text-center text-blue-600/70 dark:text-blue-400/70">
                                      <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
                                      <span className="text-[12px] font-bold">Publicación de Estado</span>
                                    </div>
                                  )}

                                  {/* Play Icon/Button - If source is present (meaning it is a video post on Facebook) */}
                                  {m.source && (
                                    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPlayingVideoId(m.id);
                                        }}
                                        className="pointer-events-auto w-14 h-14 rounded-full bg-white/90 hover:bg-white text-blue-600 flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer"
                                      >
                                        <Play className="w-6 h-6 fill-blue-600 text-blue-600 ml-1" />
                                      </button>
                                    </div>
                                  )}

                                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-6 text-white font-bold select-none z-10">
                                    <div className="flex items-center gap-1.5 text-[14px]">
                                      <ThumbsUp className="w-5 h-5 fill-white text-white" />
                                      <span>{fmtNumber(m.likes?.summary?.total_count || 0)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[14px]">
                                      <MessageCircle className="w-5 h-5 fill-white text-white" />
                                      <span>{fmtNumber(getMediaCommentCount(m))}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Description & metadata */}
                            <div 
                              onClick={() => openCommentsModal(m.id, m.permalink_url, 'facebook')}
                              className="p-4 flex-1 flex flex-col justify-between space-y-3 cursor-pointer"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
                                  <span>{dateStr}</span>
                                  <span className="uppercase text-[9px] tracking-widest text-zinc-350 dark:text-zinc-500">
                                    {m.full_picture ? 'FOTO/VIDEO' : 'ESTADO'}
                                  </span>
                                </div>

                                {m.message && (
                                  <p className="text-[12.5px] text-zinc-750 dark:text-zinc-300 leading-snug break-words font-medium">
                                    {isExpanded ? m.message : `${m.message.slice(0, 80)}${hasLongCaption ? '...' : ''}`}
                                    {hasLongCaption && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleFbCaption(m.id); }}
                                        className="text-blue-600 font-bold hover:underline ml-1 cursor-pointer focus:outline-none"
                                      >
                                        {isExpanded ? 'Ver menos' : 'Ver más'}
                                      </button>
                                    )}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800/60 mt-auto">
                                <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400 text-[12px] font-bold">
                                  <span className="flex items-center gap-1 cursor-default"><ThumbsUp className="w-3.5 h-3.5 text-zinc-450" /> {m.likes?.summary?.total_count || 0}</span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openCommentsModal(m.id, m.permalink_url, 'facebook'); }}
                                    className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                                    title="Ver y responder comentarios"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-zinc-450" /> {getMediaCommentCount(m)}
                                  </button>
                                </div>
                                
                                {m.permalink_url && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openCommentsModal(m.id, m.permalink_url, 'facebook'); }}
                                    className="text-[11px] font-black text-blue-600 dark:text-blue-400 hover:text-blue-850 dark:hover:text-blue-300 flex items-center gap-1 hover:underline cursor-pointer"
                                  >
                                    Abrir post
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Sentinel: triggers loading more FB posts as user scrolls */}
                  {fbNextCursor && (
                    <div ref={fbSentinelRef} className="flex justify-center py-4">
                      {loadingMoreFb && <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />}
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

          {/* TAB 3: TIKTOK */}
          {activeTab === 'tiktok' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {!tiktokConnected ? (
                <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm">
                  <Music2 className="w-12 h-12 text-zinc-400 mx-auto" />
                  <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">TikTok no configurado</h3>
                  <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    Conectá TikTok desde Integraciones para publicar videos y centralizar esta red en el panel.
                  </p>
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-6 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {(profile as any)?.tiktok_content_avatar_url ? (
                        <SmoothImage
                          src={(profile as any).tiktok_content_avatar_url}
                          alt={(profile as any)?.tiktok_content_display_name || 'TikTok'}
                          containerClassName="w-16 h-16 rounded-full"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-zinc-950 flex items-center justify-center text-white">
                          <Music2 className="w-7 h-7" />
                        </div>
                      )}
                      <div>
                        <h2 className="text-[18px] font-black text-zinc-900 dark:text-white">
                          {(profile as any)?.tiktok_content_display_name || (profile as any)?.connection_statuses?.tiktok_content_display_name || 'TikTok conectado'}
                        </h2>
                        <p className="text-[12.5px] text-zinc-400 font-bold mt-0.5">Cuenta lista para usar en el Publicador</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 text-white px-3 py-1.5 text-[11px] font-black">
                      <Music2 className="w-3.5 h-3.5" />
                      TikTok
                    </span>
                  </div>
                  <div className="mt-6 rounded-2xl bg-zinc-50 dark:bg-zinc-950/35 border border-zinc-100 dark:border-white/10 p-5">
                    <p className="text-[13px] font-bold leading-relaxed text-zinc-600 dark:text-zinc-350">
                      TikTok Content Posting permite enviar videos desde el Publicador. La API orgánica no siempre devuelve el historial completo de publicaciones para todas las apps; cuando TikTok habilite ese permiso en la app, este tab ya queda listo para mostrarlo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: YOUTUBE */}
          {activeTab === 'youtube' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {!youtubeConnected ? (
                <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm">
                  <Youtube className="w-12 h-12 text-zinc-400 mx-auto" />
                  <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">YouTube no configurado</h3>
                  <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    Conectá YouTube desde Integraciones para ver videos del canal y subir Shorts desde el Publicador.
                  </p>
                </div>
              ) : youtubeError ? (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-5 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-red-800 dark:text-red-400 text-[14.5px]">Error al obtener YouTube</h3>
                    <p className="text-[13px] text-red-600 dark:text-red-500 mt-1">{youtubeError}</p>
                  </div>
                </div>
              ) : youtubeLoading ? (
                <AppleLoader variant="page" />
              ) : (
                <div className="space-y-6">
                  {youtubeProfile && (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
                      <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                        {youtubeProfile.snippet?.thumbnails?.default?.url ? (
                          <SmoothImage
                            src={youtubeProfile.snippet.thumbnails.default.url}
                            alt={youtubeProfile.snippet?.title || 'YouTube'}
                            containerClassName="w-16 h-16 rounded-full ring-2 ring-red-500/30"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center text-white">
                            <Youtube className="w-7 h-7" />
                          </div>
                        )}
                        <div>
                          <h2 className="text-[18px] font-black text-zinc-900 dark:text-white">{youtubeProfile.snippet?.title || 'YouTube'}</h2>
                          <p className="text-[12.5px] text-zinc-400 font-bold mt-0.5">Canal conectado</p>
                        </div>
                      </div>
                      <div className="flex gap-2 sm:gap-4 flex-nowrap justify-center font-semibold">
                        <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center">
                          <p className="text-[14px] sm:text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(youtubeProfile.statistics?.subscriberCount)}</p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold mt-1 sm:mt-1.5 uppercase">Suscriptores</p>
                        </div>
                        <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center">
                          <p className="text-[14px] sm:text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(youtubeProfile.statistics?.videoCount)}</p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold mt-1 sm:mt-1.5 uppercase">Videos</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {youtubeMedia.length === 0 ? (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-12 text-center">
                      <Youtube className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                      <p className="text-[13.5px] font-bold text-zinc-500">No se encontraron videos</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {youtubeMedia.map((item: any) => {
                        const thumb = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url;
                        const videoId = item.id?.videoId || item.id;
                        const published = item.snippet?.publishedAt
                          ? new Date(item.snippet.publishedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '';
                        return (
                          <a
                            key={videoId}
                            href={videoId ? `https://www.youtube.com/watch?v=${videoId}` : '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300"
                          >
                            <div className="aspect-video w-full bg-zinc-100 dark:bg-zinc-950 relative overflow-hidden">
                              {thumb ? (
                                <SmoothImage src={thumb} alt="" containerClassName="w-full h-full" className="object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                              ) : (
                                <Youtube className="w-10 h-10 text-zinc-300 m-auto" />
                              )}
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                <Play className="w-10 h-10 text-white fill-white" />
                              </div>
                            </div>
                            <div className="p-4">
                              <p className="text-[11px] font-bold text-zinc-400 mb-1">{published}</p>
                              <h3 className="text-[13px] font-black text-zinc-850 dark:text-white leading-snug line-clamp-2">{item.snippet?.title}</h3>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Slide-Over Comments Panel (Unified for Instagram & Facebook) */}
      {selectedPostId && (() => {
        const activePost = selectedPostType === 'instagram'
          ? igMedia.find(m => m.id === selectedPostId)
          : fbMedia.find(m => m.id === selectedPostId);
        const carouselItems = activePost
          ? selectedPostType === 'instagram'
            ? ((activePost.children?.data || []) as any[])
                .map((child: any) => ({
                  mediaUrl: child.media_url || child.thumbnail_url || null,
                  thumbnailUrl: child.thumbnail_url || child.media_url || null,
                  mediaType: child.media_type || 'IMAGE',
                  permalink: child.permalink || activePost.permalink,
                }))
                .filter((child: any) => child.mediaUrl || child.thumbnailUrl)
            : ((activePost.attachments?.data || []) as any[])
                .flatMap((att: any) => att.subattachments?.data?.length ? att.subattachments.data : [att])
                .map((att: any) => ({
                  mediaUrl: att.media?.image?.src || att.media?.source || att.url || activePost.full_picture || null,
                  thumbnailUrl: att.media?.image?.src || activePost.full_picture || null,
                  mediaType: String(att.type || activePost.media_type || '').toUpperCase().includes('VIDEO') ? 'VIDEO' : 'IMAGE',
                  permalink: att.target?.url || activePost.permalink_url,
                }))
                .filter((att: any) => att.mediaUrl || att.thumbnailUrl)
          : [];
        const activeMedia = carouselItems[selectedMediaIndex] || carouselItems[0] || null;
        const activeMediaUrl = activeMedia?.mediaUrl || activePost?.media_url || activePost?.source || activePost?.full_picture || null;
        const activePosterUrl = activeMedia?.thumbnailUrl || activePost?.thumbnail_url || activePost?.full_picture || null;
        const activeMediaType = activeMedia?.mediaType || activePost?.media_type;
        const hasCarousel = carouselItems.length > 1;

        return (
          <PortalOverlay>
          <div className="fixed inset-0 z-[900] flex min-h-[100dvh] w-screen justify-end animate-in fade-in duration-200">
            {/* Backdrop */}
            <div
              onClick={closeCommentsModal}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            />

            {/* Slide-over panel container */}
            <div className="relative w-full md:max-w-4xl h-[100dvh] max-h-[100dvh] bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right transition-spring duration-300 ease-out z-10">
              
              {/* Header */}
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/85 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between flex-shrink-0">
                <div className="min-w-0 flex items-center gap-2">
                  <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Publicación</p>
                  {!loadingComments && comments.filter(isCommentPending).length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[10px] font-black">
                      {comments.filter(isCommentPending).length} sin responder
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {selectedPostPermalink && (
                    <a
                      href={selectedPostPermalink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 p-1.5 md:px-3 md:py-1.5 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl text-[11px] text-zinc-600 dark:text-zinc-300 font-bold border border-zinc-200 dark:border-zinc-700 transition-all"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Ver original</span>
                    </a>
                  )}
                  <button
                    onClick={closeCommentsModal}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-750 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60 active:scale-95 transition-all shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
                  {!loadingComments && comments.length > 0 && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/20 dark:bg-zinc-900/20">{getCommentThreadCount(comments)}</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    const imageUrl = activePosterUrl || activeMediaUrl;
                    const isVid = activeMediaType === 'VIDEO' || !!activePost?.source;
                    setMobileDetailTab('analysis');
                    handleTabChange('metrics', imageUrl, isVid, activeMediaUrl || activePost?.source);
                  }}
                  className={`h-9 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 ${mobileDetailTab === 'analysis' ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 bg-zinc-100/70 dark:bg-zinc-800/70'}`}
                >
                  <Brain className="w-3.5 h-3.5" />
                  Análisis
                </button>
              </div>

              {/* Desktop modal tabs */}
              <div className="hidden md:grid grid-cols-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 flex-shrink-0">
                <button
                  onClick={() => handleTabChange('comments')}
                  className={`px-1 py-2.5 text-[10px] sm:text-[12px] font-black leading-tight transition-colors flex items-center justify-center gap-1.5 ${
                    slideTab === 'comments'
                      ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  Comentarios
                  {!loadingComments && comments.length > 0 && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">{getCommentThreadCount(comments)}</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    const imageUrl = activePosterUrl || activeMediaUrl;
                    const isVid = activeMediaType === 'VIDEO' || !!activePost?.source;
                    handleTabChange('metrics', imageUrl, isVid, activeMediaUrl || activePost?.source);
                  }}
                  className={`px-1 py-2.5 text-[10px] sm:text-[12px] font-black leading-tight transition-colors ${
                    slideTab === 'metrics'
                      ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >Análisis de creativos</button>
              </div>

              {/* Split Body Container */}
              <div className="grid flex-1 min-h-0 overflow-y-auto md:overflow-hidden grid-cols-1 md:grid-cols-5 auto-rows-max md:auto-rows-auto">

                {/* Column 1: Post Media Context (Left Side - always visible) */}
                <div className={`${mobileDetailTab === 'post' ? 'flex' : 'hidden'} md:flex md:col-span-2 flex-col justify-start border-b md:border-b-0 md:border-r border-zinc-100 dark:border-zinc-800 bg-zinc-50/15 dark:bg-zinc-950/10 p-3 md:p-5 max-h-none overflow-y-auto md:h-full space-y-4`}>
                  {activePost ? (
                    <>
                      {/* Media Player */}
                      {activeMediaType === 'VIDEO' || activeMediaUrl?.includes('.mp4') || activePost.source ? (
                        <div className="rounded-2xl overflow-hidden bg-black border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm mx-auto w-full aspect-square shrink-0 relative flex items-center justify-center">
                          <video
                            src={activeMediaUrl || activePost.source}
                            poster={activePosterUrl || undefined}
                            controls
                            preload="none"
                            {...{ referrerPolicy: "no-referrer" }}
                            className="w-full h-full object-contain"
                          />
                          {hasCarousel && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedMediaIndex((selectedMediaIndex - 1 + carouselItems.length) % carouselItems.length); }} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center z-10"><ChevronLeft className="w-4 h-4" /></button>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedMediaIndex((selectedMediaIndex + 1) % carouselItems.length); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center z-10"><ChevronRight className="w-4 h-4" /></button>
                            </>
                          )}
                        </div>
                      ) : (activeMediaUrl || activePosterUrl) ? (
                        <div className="rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm mx-auto w-full aspect-square shrink-0 relative flex items-center justify-center">
                          <SmoothImage
                            src={activeMediaUrl || activePosterUrl}
                            alt="Contexto"
                            containerClassName="w-full h-full"
                            className="object-contain"
                          />
                          {hasCarousel && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedMediaIndex((selectedMediaIndex - 1 + carouselItems.length) % carouselItems.length); }} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center z-10"><ChevronLeft className="w-4 h-4" /></button>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedMediaIndex((selectedMediaIndex + 1) % carouselItems.length); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center z-10"><ChevronRight className="w-4 h-4" /></button>
                              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full flex gap-1.5">
                                {carouselItems.map((_: any, idx: number) => (
                                  <button key={idx} onClick={(e) => { e.stopPropagation(); setSelectedMediaIndex(idx); }} className={`w-1.5 h-1.5 rounded-full transition-all ${idx === selectedMediaIndex ? 'bg-white scale-125' : 'bg-white/40'}`} />
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 aspect-square w-full shrink-0 flex flex-col items-center justify-center text-zinc-400 gap-1.5 p-4 text-center">
                          <ImageIcon className="w-8 h-8" />
                          <span className="text-[11.5px] font-bold">Publicación sin imagen/video</span>
                        </div>
                      )}

                      {/* Post Caption/Message + Engagement — always below the media */}
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Descripción del Post</span>
                          <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/80 rounded-2xl text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300 font-medium whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {activePost.caption || activePost.message || <span className="italic text-zinc-400">Sin descripción.</span>}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/60 rounded-2xl text-center">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-0.5">Me gusta</span>
                            <span className="text-[14px] font-extrabold text-zinc-800 dark:text-zinc-200">{fmtNumber(activePost.like_count || activePost.likes?.summary?.total_count || 0)}</span>
                          </div>
                          <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/60 rounded-2xl text-center">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-0.5">Comentarios</span>
                            <span className="text-[14px] font-extrabold text-zinc-800 dark:text-zinc-200">{fmtNumber(getMediaCommentCount(activePost))}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-zinc-450 gap-1 p-5">
                      <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
                      <p className="text-[12px] font-bold">No se encontró información del post</p>
                    </div>
                  )}
                </div>

                {/* Column 2: Comments List & Inputs (Right Side - 60% width on md/lg, full width on mobile) */}
                <div className={`${mobileDetailTab === 'post' ? 'hidden' : 'flex'} md:flex col-span-1 md:col-span-3 flex-col min-h-[calc(100dvh-126px)] md:min-h-0 md:h-full overflow-visible md:overflow-hidden`}>
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
	                          <p className="text-[13px] font-bold text-zinc-700 dark:text-zinc-305">Analizando creativo con IA...</p>
	                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Procesando el creativo real</p>
	                        </div>
	                      ) : analysisError ? (
	                        <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 text-center">
	                          <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/50 flex items-center justify-center">
	                            <AlertCircle className="w-7 h-7 text-amber-500" />
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
                      {/* Filter toggle + bulk draft */}
                      {!loadingComments && comments.length > 0 && (
                        <div className="flex flex-wrap md:flex-nowrap items-center gap-1 px-4 md:px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0 bg-zinc-50/50 dark:bg-zinc-900/40">
                          <button
                            onClick={() => setCommentFilter('pending')}
                            className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] font-black transition-all ${commentFilter === 'pending' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                          >
                            Sin responder
                            <span className={`text-[8px] sm:text-[9px] min-w-[14px] h-[14px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full font-black flex items-center justify-center ${commentFilter === 'pending' ? 'bg-white/15 dark:bg-zinc-900/20 text-white dark:text-zinc-900' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}>
                              {comments.filter(isCommentPending).length}
                            </span>
                          </button>
                          <button
                            onClick={() => setCommentFilter('all')}
                            className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] font-black transition-all ${commentFilter === 'all' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                          >
                            Todos
                            <span className={`text-[8px] sm:text-[9px] min-w-[14px] h-[14px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full font-black flex items-center justify-center ${commentFilter === 'all' ? 'bg-white/15 dark:bg-zinc-900/20 text-white dark:text-zinc-900' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}>
                              {getCommentThreadCount(comments)}
                            </span>
                          </button>
                          {(() => {
                            const suggestionsCount = comments.filter(isCommentPending).length;
                            return suggestionsCount > 0 && (
                              <div className="ml-0 sm:ml-auto flex flex-wrap items-center gap-1.5">
                                <button
                                  onClick={handleBulkDrafts}
                                  disabled={bulkDraftsLoading}
                                  className="flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-black transition-all shadow-sm shadow-violet-500/20 cursor-pointer"
                                >
                                  {bulkDraftsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                  <span>Sugerir con Ia ({suggestionsCount})</span>
                                </button>
                                <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
                                  {LANGS.map(l => (
                                    <button key={l.code} type="button" onClick={() => setBulkDraftLang(l.code)} className={`px-2 py-1 text-[10px] font-black rounded-md transition-all ${bulkDraftLang === l.code ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-300 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}>
                                      {l.code.toUpperCase()}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {/* Comments List */}
                  <div className="flex-1 overflow-visible md:overflow-y-auto px-4 pt-4 pb-24 md:px-5 md:pt-5 md:pb-12 scroll-pb-24 md:scroll-pb-12 space-y-4 bg-zinc-50/10 dark:bg-zinc-950/5">
                    {loadingComments ? (
                      <AppleLoader variant="table" count={3} />
                    ) : comments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center p-5">
                        <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2.5" />
                        <p className="text-[13.5px] font-bold text-zinc-500">Sin comentarios</p>
                        <p className="text-[11.5px] text-zinc-450 mt-1">Nadie comentó en esta publicación aún.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {[...comments]
                          .filter(c => commentFilter === 'all' || isCommentPending(c))
                          .sort((a, b) => new Date(b.timestamp || b.created_time || 0).getTime() - new Date(a.timestamp || a.created_time || 0).getTime())
                          .map((comment: any) => {
                          const commentUser = comment.username || comment.from?.name || 'Usuario';
                          const commentText = comment.text || comment.message || '';
                          const commentDate = comment.timestamp || comment.created_time;
                          const dateStr = commentDate
                            ? new Date(commentDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                            : '';
                          const isIgnored = !!(comment._ignored || ignoredIds[comment.id]);
                          const isLiked = !!likedCommentIds[comment.id];
                          const isLiking = !!likingCommentIds[comment.id];
                          const isPending = isCommentPending(comment);
                          const replyOpen = !!activeReplyCommentIds[comment.id];
                          const replies = comment.replies?.data || [];

                          return (
                            <div 
                              key={comment.id}
                              className={`bg-white dark:bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${
                                isPending
                                  ? 'border-amber-200 dark:border-amber-800/40 shadow-sm'
                                  : 'border-zinc-200/60 dark:border-zinc-800/60'
                              }`}
                            >
                              <div className="p-4">
                                {/* Comment header */}
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-[10px] text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                                      {commentUser ? commentUser.slice(0, 2).toUpperCase() : 'U'}
                                    </div>
                                    <div>
                                      <span className="text-[12px] font-black text-zinc-900 dark:text-white">@{commentUser}</span>
                                      <span className="text-[10px] text-zinc-400 ml-2">{dateStr}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
	                                    {isIgnored ? (
	                                      <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 uppercase">
	                                        Ignorado
	                                      </span>
	                                    ) : isPending && (
	                                      <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 uppercase">
	                                        Pendiente
	                                      </span>
	                                    )}
	                                    {!isIgnored && !isPending && (
	                                      <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 uppercase">
	                                        Respondido
                                      </span>
                                    )}
	                                  <button
                                      onClick={() => handleLikeComment(comment.id)}
                                      disabled={isLiking}
                                      className={`flex items-center gap-0.5 text-[11px] font-bold transition-colors ${
                                        isLiked 
                                          ? selectedPostType === 'instagram' 
                                            ? 'text-red-500' 
                                            : 'text-blue-600' 
                                          : 'text-zinc-400 hover:text-red-500'
                                      }`}
                                    >
                                      {selectedPostType === 'instagram' ? (
                                        <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                                      ) : (
                                        <ThumbsUp className={`w-3.5 h-3.5 ${isLiked ? 'fill-blue-600 text-blue-600' : ''}`} />
                                      )}
                                      {comment.like_count || 0}
                                    </button>
                                  </div>
                                </div>

                                {/* Comment text / sticker / gift */}
                                {comment.attachment?.media?.image?.src ? (
                                  <div className="ml-9 mt-1">
                                    <img
                                      src={comment.attachment.media.image.src}
                                      alt={comment.attachment.type || 'sticker'}
                                      referrerPolicy="no-referrer"
                                      className="max-w-[100px] max-h-[100px] rounded-lg object-contain"
                                    />
                                    {commentText && (
                                      <p className="text-[13px] text-zinc-800 dark:text-zinc-100 leading-relaxed font-medium mt-1">{commentText}</p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[13px] text-zinc-800 dark:text-zinc-100 leading-relaxed font-medium ml-9">
                                    {commentText}
                                  </p>
                                )}

                                {/* Existing replies */}
                                {replies.length > 0 && (
                                  <div className="ml-9 mt-3 space-y-2 pl-3 border-l-2 border-zinc-100 dark:border-zinc-800">
                                    {replies.map((r: any) => {
                                      const rIsMe = isFromPage(r);
                                      return (
                                        <div key={r.id} className="space-y-0.5">
                                          <div className="flex items-center gap-1.5">
                                            <span className={`text-[10px] font-black ${rIsMe ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500'}`}>
                                              @{r.username || r.from?.username || r.from?.name || 'Yo'}
                                            </span>
                                            {r.isSending && (
                                              <span className="text-[9px] text-zinc-400 dark:text-zinc-505 font-bold flex items-center gap-1">
                                                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Enviando...
                                              </span>
                                            )}
                                          </div>
                                          <p className={`text-[12px] leading-relaxed ${rIsMe ? (r.isSending ? 'text-violet-400 dark:text-violet-600 italic' : 'text-violet-700 dark:text-violet-300 font-semibold') : 'text-zinc-600 dark:text-zinc-400 font-medium'}`}>
                                            {r.text || r.message}
                                          </p>
                                          {!rIsMe && !r.isSending && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveReplyTargets(prev => ({ ...prev, [comment.id]: r }));
                                                setActiveReplyCommentIds(prev => ({ ...prev, [comment.id]: true }));
                                                setCommentReplies(prev => ({ ...prev, [comment.id]: `@${r.username} ` }));
                                              }}
                                              className="text-[10px] font-black text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 transition-colors block mt-0.5"
                                            >
                                              Responder
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Action buttons */}
                                <div className="mt-3 ml-9 flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      const nextOpen = !replyOpen;
                                      setActiveReplyCommentIds(prev => ({ ...prev, [comment.id]: nextOpen }));
                                      if (nextOpen) {
                                        setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null }));
                                        setCommentReplies(prev => ({ ...prev, [comment.id]: '' }));
                                      } else {
                                        setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null }));
                                        setCommentReplies(prev => ({ ...prev, [comment.id]: '' }));
                                      }
                                    }}
                                    className="text-[11px] font-black text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 transition-colors"
	                                  >
	                                    {replyOpen ? 'Cancelar' : 'Responder'}
	                                  </button>
	                                  <button
	                                    type="button"
	                                    onClick={() => handleIgnoreComment(comment.id)}
	                                    className={`text-[11px] font-black transition-colors ${isIgnored ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
	                                    title={isIgnored ? 'Volver a marcar como pendiente si corresponde' : 'Ignorar comentario'}
	                                  >
	                                    <EyeOff className="w-3.5 h-3.5 inline mr-1" />
	                                    {isIgnored ? 'No ignorar' : 'Ignorar'}
	                                  </button>
	                                </div>

                                {/* Reply box */}
                                {replyOpen && (
                                  <div className="mt-3 ml-9 space-y-2 animate-in fade-in duration-200">
                                    {commentRepliesErrors[comment.id] && (
                                      <p className="text-[10px] text-red-500 font-bold">{commentRepliesErrors[comment.id]}</p>
                                    )}
                                    {activeReplyTargets[comment.id] && (
                                      <div className="flex items-center justify-between bg-violet-50/50 dark:bg-violet-950/10 px-3 py-1.5 rounded-lg border border-violet-100/30 dark:border-violet-900/10 text-[11px] font-bold text-violet-700 dark:text-violet-400">
                                        <span>Respondiendo a @{activeReplyTargets[comment.id].username}</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null }));
                                            setCommentReplies(prev => ({ ...prev, [comment.id]: '' }));
                                          }}
                                          className="text-violet-400 hover:text-violet-600 dark:hover:text-violet-300"
                                          title="Quitar respuesta dirigida"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                    <form onSubmit={e => handleSubmitPerComment(e, comment.id)} className="space-y-2">
                                      <AutoResizeTextarea
                                        placeholder={activeReplyTargets[comment.id] ? `Responder a @${activeReplyTargets[comment.id].username}...` : `Responder a @${commentUser}...`}
                                        value={commentReplies[comment.id] || ''}
                                        onChange={e => setCommentReplies(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                        disabled={commentRepliesSubmitting[comment.id] || commentRepliesLoadingDraft[comment.id]}
                                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-[12.5px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-450 focus:border-violet-500 outline-none transition-all min-h-[50px] font-medium shadow-inner"
                                      />
                                      <div className="flex items-center gap-2">
                                        {/* IA button — main action */}
                                        <button
                                          type="button"
                                          onClick={() => handleSingleCommentDraft(comment.id, commentText, commentUser, activeReplyTargets[comment.id])}
                                          disabled={commentRepliesSubmitting[comment.id] || commentRepliesLoadingDraft[comment.id]}
                                          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-[12px] font-black shadow-sm shadow-violet-500/25 transition-all"
                                        >
                                          {commentRepliesLoadingDraft[comment.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                          IA
                                        </button>
                                        {/* Language selector — secondary */}
                                        <div className="relative">
                                          <button
                                            type="button"
                                            onClick={() => setLangDropdownOpen(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                                            className="flex items-center gap-0.5 px-2 py-1.5 text-[11px] bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 rounded-lg transition-all"
                                            title="Cambiar idioma"
                                          >
                                            {(() => {
                                              const cur = replyLangs[comment.id] || detectLang(commentText);
                                              return LANGS.find(l => l.code === cur)?.flag ?? '🇪🇸';
                                            })()}
                                            <svg className="w-2.5 h-2.5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                          </button>
                                          {langDropdownOpen[comment.id] && (
                                            <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[110px]">
                                              {LANGS.map(l => {
                                                const cur = replyLangs[comment.id] || detectLang(commentText);
                                                return (
                                                  <button
                                                    key={l.code}
                                                    type="button"
                                                    onClick={() => {
                                                      const target = activeReplyTargets[comment.id];
                                                      setReplyLangs(prev => ({ ...prev, [comment.id]: l.code }));
                                                      setLangDropdownOpen(prev => ({ ...prev, [comment.id]: false }));
                                                      if (target) {
                                                        handleSingleCommentDraft(comment.id, commentText, commentUser, { ...target, _forceLang: l.code });
                                                      } else {
                                                        handleSingleCommentDraft(comment.id, commentText, commentUser, { text: commentText, username: commentUser, _forceLang: l.code });
                                                      }
                                                    }}
                                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all ${cur === l.code ? 'font-bold text-violet-600 dark:text-violet-400' : 'text-zinc-700 dark:text-zinc-300'}`}
                                                  >
                                                    {l.flag} {l.label}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                        <button
                                          type="submit"
                                          disabled={commentRepliesSubmitting[comment.id] || commentRepliesLoadingDraft[comment.id] || !(commentReplies[comment.id] || '').trim()}
                                          className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-black shadow-sm transition-all"
                                        >
                                          {commentRepliesSubmitting[comment.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
                                          Enviar
                                        </button>
                                      </div>
                                    </form>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bottom Actions & Input */}
                  <div className="p-4 border-t border-zinc-100/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 flex-shrink-0">
                    {submitError && (
                      <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed font-semibold mb-3">
                        <div className="flex items-start gap-1.5">
                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5 animate-bounce" />
                          <span>{submitError}</span>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmitComment} className="flex gap-2">
                      <AutoResizeTextarea 
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder="Escribí un nuevo comentario en el post..."
                        disabled={submittingReply}
                        className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-[13px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-450 outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors shadow-inner font-medium leading-normal"
                      />
                      <button
                        type="submit"
                        disabled={submittingReply || !commentInput.trim()}
                        className="px-4.5 bg-violet-600 hover:bg-violet-750 disabled:opacity-50 text-white text-[12.5px] font-black rounded-xl transition-all flex items-center justify-center gap-1 flex-shrink-0 cursor-pointer shadow-md shadow-violet-600/15"
                      >
                        {submittingReply ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Comentar'
                        )}
                      </button>
                    </form>
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

      {/* ── Pending Comments Drawer ───────────────────────────────────── */}
      {showPendingPanel && (
        <PortalOverlay>
        <div className="fixed inset-0 z-[900] flex min-h-[100dvh] w-screen">
          {/* Backdrop */}
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setShowPendingPanel(false)} />

          {/* Panel */}
          <div className="w-full sm:max-w-[520px] bg-white dark:bg-zinc-950 flex flex-col h-full shadow-2xl border-l border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-right duration-250">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-[15px] font-black text-zinc-900 dark:text-white">Comentarios Pendientes</h2>
                  {pendingLoaded && !loadingPending && (
                    <p className="text-[11px] text-zinc-400">
                      {pendingItems.filter(i => !pendingReplied[i.comment.id]).length} sin responder
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowPendingPanel(false)} className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-750 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60 active:scale-95 transition-all shadow-sm">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Network filter */}
            <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex gap-2 flex-shrink-0">
              {(['all', 'instagram', 'facebook'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setPendingNetworkFilter(f)}
                  className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[9.5px] sm:text-[10px] font-black transition-all ${
                    pendingNetworkFilter === f
                      ? f === 'instagram' ? 'bg-pink-500 text-white' : f === 'facebook' ? 'bg-blue-600 text-white' : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {f === 'all' ? 'Todos' : f === 'instagram' ? 'Instagram' : 'Facebook'}
                  {pendingLoaded && (
                    <span className="ml-1.5 opacity-70">
                      ({pendingItems.filter(i => !pendingReplied[i.comment.id] && (f === 'all' || i.network === f)).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loadingPending ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                  <p className="text-[13px] text-zinc-400 font-semibold">Cargando comentarios...</p>
                  <p className="text-[11px] text-zinc-300 dark:text-zinc-600">Revisando los últimos 24 posts de cada red</p>
                </div>
              ) : (() => {
                const filtered = pendingItems.filter(i =>
                  (pendingNetworkFilter === 'all' || i.network === pendingNetworkFilter) &&
                  !pendingReplied[i.comment.id]
                );
                const replied = pendingItems.filter(i => pendingReplied[i.comment.id] && (pendingNetworkFilter === 'all' || i.network === pendingNetworkFilter));

                if (filtered.length === 0 && replied.length === 0) return (
                  <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-2xl">✅</div>
                    <p className="text-[14px] font-black text-zinc-700 dark:text-zinc-300">Todo al día</p>
                    <p className="text-[12px] text-zinc-400">No hay comentarios pendientes de respuesta en los últimos posts.</p>
                  </div>
                );

                return (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {filtered.map(item => {
                      const c = item.comment;
                      const username = c.username || c.from?.name || 'Usuario';
                      const text = c.text || c.message || '';
                      const isSubmitting = pendingRepliesSubmitting[c.id];
                      const isDraftLoading = pendingDraftLoading[c.id];
                      const replyText = pendingReplies[c.id] || '';

                      return (
                        <div key={c.id} className="px-5 py-4 hover:bg-zinc-50/60 dark:hover:bg-white/[0.01] transition-colors">
                          {/* Network badge + post thumbnail + caption */}
                          <div className="flex gap-3 mb-3">
                            {/* Thumbnail */}
                            {item.postThumb && (
                              <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-zinc-100 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800">
                                <SmoothImage src={item.postThumb} alt="" containerClassName="w-full h-full" className="object-cover" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              {/* Network */}
                              <div className="mb-1.5">
                                {item.network === 'instagram' ? (
                                  <span className="inline-flex items-center gap-1 bg-gradient-to-r from-pink-500 to-violet-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                                    <Instagram className="w-2.5 h-2.5" /> Instagram
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                                    <span className="font-black text-[10px]">f</span> Facebook
                                  </span>
                                )}
                              </div>
                              {/* Caption */}
                              {item.postCaption && (
                                <p className="text-[10px] text-zinc-400 leading-snug line-clamp-2">{item.postCaption}</p>
                              )}
                              {/* Comment count context */}
                              {allCommentsCache[item.postId] && (
                                <p className="text-[9px] text-zinc-300 dark:text-zinc-600 mt-1">
                                  {allCommentsCache[item.postId].length} comentarios en esta publicación
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Comment */}
                          <div className="flex gap-2.5 mb-3 pl-1">
                            <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[11px] font-black text-zinc-600 dark:text-zinc-300 flex-shrink-0 uppercase">
                              {username[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-0.5">@{username}</p>
                              <p className="text-[13px] text-zinc-800 dark:text-zinc-200 leading-snug">{text}</p>
                            </div>
                          </div>

                          {/* Reply area */}
                          <div className="ml-1">
                            <textarea
                              value={replyText}
                              onChange={e => setPendingReplies(prev => ({ ...prev, [c.id]: e.target.value }))}
                              placeholder="Escribí tu respuesta..."
                              rows={2}
                              className="w-full text-[12px] px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 dark:focus:ring-amber-500 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => handlePendingDraft(item)}
                                disabled={isDraftLoading}
                                title={allCommentsCache[item.postId] ? `Leerá ${allCommentsCache[item.postId].length} comentarios + publicación + catálogo de productos` : 'Generar borrador con IA'}
                                className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-500/20 text-[11px] font-black transition-all disabled:opacity-50"
                              >
                                {isDraftLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                {isDraftLoading ? 'Generando...' : 'IA'}
                              </button>
                              <button
                                onClick={() => handlePendingReply(item)}
                                disabled={isSubmitting || !replyText.trim()}
                                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-[11px] font-black transition-all"
                              >
                                {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                {isSubmitting ? 'Enviando...' : 'Responder'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Already replied section */}
                    {replied.length > 0 && (
                      <div className="px-5 py-3 bg-emerald-50/50 dark:bg-emerald-500/5">
                        <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                          Respondidos en esta sesión ({replied.length})
                        </p>
                        {replied.map(item => (
                          <div key={item.comment.id} className="mt-2 flex items-center gap-2 text-[12px] text-zinc-400 line-through">
                            <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            </span>
                            <span className="truncate">{item.comment.username || item.comment.from?.name} — {(item.comment.text || item.comment.message || '').slice(0, 50)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        </PortalOverlay>
      )}
      
      {/* Keyframes inyectados inline para la barra de progreso superior */}
      <style>{`
        @keyframes top-bar-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
    </CenteredPageLoader>
  );
}
