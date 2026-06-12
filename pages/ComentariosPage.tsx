import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Instagram, MessageCircle, Loader2, RefreshCw, AlertCircle, MessageSquare,
  Sparkles, Send, Heart, X, ArrowUpRight, CheckCircle2, ThumbsUp, Play, Facebook,
  ArrowUpDown, ArrowDown, ArrowUp
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useUnread } from '../contexts/UnreadContext';
import { metaAds } from '../services/metaAds';
import { db } from '../services/db';
import { supabase, supabaseAdmin } from '../services/supabase';
import { TopLoadingBar } from '../components/ui/TopLoadingBar';
import { AppleLoader } from '../components/ui/AppleLoader';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import SmoothImage from '../components/ui/SmoothImage';
import DOMPurify from 'dompurify';

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

type PostItem = {
  id: string;
  platform: 'instagram' | 'facebook';
  thumbnail: string | null;
  caption: string;
  permalink: string | null;
  timestamp: string;
  totalComments: number;
  pendingComments: number;
  comments: any[];
  raw: any;
  mediaType?: string;
  mediaUrl?: string;
  isAd?: boolean;
};

export default function ComentariosPage() {
  const { isViewingAs, viewAsProfile } = useViewAs();
  const { profile: authProfile, user, session } = useAuth();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;
  const { setPendingCommentsCount } = useUnread();

  const fbPageId = (profile as any)?.fb_page_id;
  const igId = (profile as any)?.ig_business_id;
  const igUsername = (profile as any)?.ig_username;
  const metaAccountId = (profile as any)?.meta_account_id;

  const [loading, setLoading] = useState(true);
  const [igError, setIgError] = useState<string | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [resolvedThumbnails, setResolvedThumbnails] = useState<Record<string, string>>({});
  const [resolvedDetails, setResolvedDetails] = useState<Record<string, any>>({});
  const [resolvingIds, setResolvingIds] = useState<Record<string, boolean>>({});
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'facebook' | 'ads'>('all');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Slide-over state
  const [selectedPost, setSelectedPost] = useState<PostItem | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [draftLoading, setDraftLoading] = useState<Record<string, boolean>>({});
  const [replyErrors, setReplyErrors] = useState<Record<string, string | null>>({});
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [commentFilter, setCommentFilter] = useState<'all' | 'pending'>('pending');
  const [replyLangs, setReplyLangs] = useState<Record<string, 'en' | 'es'>>({});
  const [langDropdownOpen, setLangDropdownOpen] = useState<Record<string, boolean>>({});
  const [activeReplyTargets, setActiveReplyTargets] = useState<Record<string, any>>({});
  const [mobileTab, setMobileTab] = useState<'post' | 'comments'>('comments');

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

  // ── Connection flow state ─────────────────────────────────────────
  const [connectingUserToken, setConnectingUserToken] = useState<string | null>(null);
  const [selectablePages, setSelectablePages] = useState<any[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [errorConnecting, setErrorConnecting] = useState<string | null>(null);

  // Handle Facebook Login Redirect Callback (Hash Parameters)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token=")) {
      const match = hash.match(/access_token=([^&]+)/);
      const userToken = match ? match[1] : null;
      if (userToken) {
        // Clear hash from URL immediately to prevent re-triggering
        window.history.replaceState(null, "", window.location.pathname + window.location.search + '#/comentarios');
        
        // Open modal and load user pages
        setConnectingUserToken(userToken);
        setShowConnectModal(true);
        loadUserPages(userToken);
      }
    }
  }, []);

  const loadUserPages = async (token: string) => {
    setLoadingPages(true);
    setErrorConnecting(null);
    try {
      const url = `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&limit=100&fields=id,name,access_token,instagram_business_account{id,username,name}`;
      const res = await fetch(url).then(r => r.json());
      if (res.error) throw new Error(res.error.message || 'Error de Facebook');
      
      setSelectablePages(res.data || []);
    } catch (err: any) {
      console.error(err);
      setErrorConnecting(err.message || 'No se pudieron cargar tus páginas.');
    } finally {
      setLoadingPages(false);
    }
  };

  const handleStartConnection = () => {
    const appId = '1248660836711922'; // Meta App ID
    const redirectUri = window.location.origin + window.location.pathname + '#/comentarios';
    const scopes = [
      'pages_show_list',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_comments',
      'instagram_manage_insights',
      'instagram_manage_messages',
      'pages_read_engagement',
      'pages_manage_metadata',
      'pages_read_user_content',
      'pages_manage_ads',
      'pages_manage_posts',
      'pages_manage_engagement'
    ].join(',');

    const oauthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=token`;
    window.location.href = oauthUrl;
  };

  const handleLinkPage = async (page: any) => {
    if (!clientId) return;
    setLoadingPages(true);
    try {
      const igId = page.instagram_business_account?.id || null;
      const igUsername = page.instagram_business_account?.username || null;
      
      const currentStatuses = (profile as any)?.connection_statuses || {};
      const newStatuses = {
        ...currentStatuses,
        facebook: 'ok',
        ...(igId ? { instagram: 'ok' } : {})
      };

      // Update in Supabase via standard supabase client (RLS updated)
      const { error } = await supabase
        .from('car_clients')
        .update({
          fb_page_id: page.id,
          fb_page_name: page.name,
          ig_business_id: igId,
          ig_username: igUsername,
          fb_page_access_token: page.access_token,
          connection_statuses: newStatuses
        })
        .eq('id', clientId);
        
      if (error) throw error;
      
      // Reload page state
      alert(`¡Vinculado con éxito! Página: ${page.name}${igUsername ? `, Instagram: @${igUsername}` : ''}`);
      setShowConnectModal(false);
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      setErrorConnecting(err.message || 'Error al guardar la vinculación.');
    } finally {
      setLoadingPages(false);
    }
  };

  const renderConnectModal = () => {
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConnectModal(false)} />
        <div className="relative bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 max-w-[450px] w-full text-left flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="pb-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <h3 className="text-[16px] font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Facebook className="w-5 h-5 text-blue-600" />
              Seleccioná tu página
            </h3>
            <button onClick={() => setShowConnectModal(false)} className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {loadingPages ? (
              <AppleLoader variant="inline" title="Buscando tus páginas comerciales..." />
            ) : errorConnecting ? (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-xl flex items-start gap-2 text-[11px] text-red-700 dark:text-red-400 font-bold">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                {errorConnecting}
              </div>
            ) : selectablePages.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <p className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400">No encontramos páginas vinculadas.</p>
                <p className="text-[11px] text-zinc-400">Asegurate de iniciar sesión con una cuenta de Facebook que administre tu página comercial de Instagram.</p>
              </div>
            ) : (
              <>
                <p className="text-[12px] text-zinc-450 font-bold mb-1">
                  Elegí la página de Facebook que querés conectar. Si tiene una cuenta de Instagram vinculada, se conectará automáticamente.
                </p>
                {selectablePages.map(page => {
                  const hasIg = !!page.instagram_business_account;
                  return (
                    <button
                      key={page.id}
                      onClick={() => handleLinkPage(page)}
                      className="w-full text-left p-3 border border-zinc-200 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-800 hover:bg-violet-50/20 dark:hover:bg-violet-950/10 rounded-2xl flex items-center justify-between transition-all group active:scale-[0.99]"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400">{page.name}</p>
                        <p className="text-[10px] text-zinc-400 font-bold mt-0.5 uppercase tracking-wider flex items-center gap-1">
                           <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                           FB Page
                        </p>
                      </div>
                      {hasIg ? (
                        <div className="flex-shrink-0 bg-pink-50 dark:bg-pink-950/20 border border-pink-100 dark:border-pink-900/30 px-2.5 py-1 rounded-xl flex items-center gap-1.5">
                          <Instagram className="w-3.5 h-3.5 text-pink-600 dark:text-pink-400" />
                          <span className="text-[10.5px] font-black text-pink-600 dark:text-pink-400">@{page.instagram_business_account.username}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] bg-zinc-50 dark:bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-lg font-bold">Sin Instagram</span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Helper: is a username/from the page?
  const isFromPage = useCallback((entry: any) => {
    if (!entry) return false;
    // Instagram: match by username
    if (igUsername && entry.username && entry.username.toLowerCase() === igUsername.toLowerCase()) return true;
    // Instagram: match by IG Business Account ID (from.id on replies when username is not stored)
    if (igId && entry.from?.id && String(entry.from.id) === String(igId)) return true;
    // Facebook: match by page ID
    if (fbPageId && entry.from?.id && String(entry.from.id) === String(fbPageId)) return true;
    // Ads: match by Meta account ID fallback
    if (metaAccountId && entry.from?.id && String(entry.from.id) === String(metaAccountId)) return true;
    return false;
  }, [igUsername, igId, fbPageId, metaAccountId]);

  // Helper: is comment pending? = last message in thread was from customer (not page)
  const isCommentPending = useCallback((comment: any, _postPlatform: 'instagram' | 'facebook') => {
    // If the top-level comment itself is from the page, not pending
    if (isFromPage(comment)) return false;
    const replies = comment.replies?.data || [];
    if (replies.length === 0) return true; // no reply yet → pending
    // Sort replies oldest→newest, check if last one is from page
    const sorted = [...replies].sort((a, b) =>
      new Date(a.timestamp || a.created_time || 0).getTime() - new Date(b.timestamp || b.created_time || 0).getTime()
    );
    const latest = sorted[sorted.length - 1];
    return !isFromPage(latest);
  }, [isFromPage]);

  // Track fb page id
  useEffect(() => {
    if (fbPageId) {
      try {
        localStorage.setItem('active_fb_page_id', fbPageId);
      } catch (e) {
        console.warn("Storage full: could not save active_fb_page_id", e);
      }
    }
  }, [fbPageId]);

  // Global keydown listeners for Escape to close slide-over
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPost(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Clear states when client changes to prevent stale leakage
  useEffect(() => {
    setPosts([]);
    setSelectedPost(null);
    setLoading(true);
    setFbError(null);
    setIgError(null);
  }, [clientId]);

  // Load from cache initially
  useEffect(() => {
    if (!clientId) return;
    const cacheKey = `comentarios_cache_${clientId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.posts) setPosts(parsed.posts);
        setLoading(false);
      } catch (e) {
        console.error('Error parsing comments cache:', e);
      }
    }
  }, [clientId]);

  // Load data
  useEffect(() => {
    if (!clientId || (!fbPageId && !igId)) return;
    let active = true;
    const hasCache = sessionStorage.getItem(`comentarios_cache_${clientId}`);
    setLoading(!hasCache);
    setIgError(null);
    setFbError(null);

    const processMediaRes = (igRes: any, fbRes: any, activeAds: any[] = [], adsComments: any[] = []) => {
      const items: PostItem[] = [];

      // Instagram
      const igMedia = (igRes as any)?.data || igRes || [];
      igMedia.forEach((post: any) => {
        const rawComments = post.comments?.data || [];
        const userComments = rawComments.filter((c: any) => 
          c.username && igUsername ? c.username.toLowerCase() !== igUsername.toLowerCase() : true
        );
        const pending = userComments.filter((c: any) => isCommentPending(c, 'instagram'));
        items.push({
          id: post.id,
          platform: 'instagram',
          thumbnail: post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url,
          caption: post.caption || '',
          permalink: post.permalink || null,
          timestamp: post.timestamp,
          totalComments: userComments.length,
          pendingComments: pending.length,
          comments: userComments,
          raw: post,
          mediaType: post.media_type,
          mediaUrl: post.media_url,
        });
      });

      // Facebook
      const fbMedia = (fbRes as any)?.data || fbRes || [];
      fbMedia.forEach((post: any) => {
        const rawComments = post.comments?.data || [];
        const userComments = rawComments.filter((c: any) => c.from?.id !== fbPageId);
        const resolveFbName = (c: any, fb: string) =>
          c.username || c.from?.username || c.from?.name || c.name ||
          (c.from?.id ? `Usuario ${String(c.from.id).slice(-6)}` : fb);
        const normalized = userComments.map((c: any, i: number) => ({
          ...c,
          username: resolveFbName(c, `Comentarista ${i + 1}`),
          text: c.text || c.message || '',
          attachment: c.attachment || null,
          from: c.from || null,
          replies: c.replies
            ? {
                data: (c.replies.data || []).map((r: any, ri: number) => ({
                  ...r,
                  username: resolveFbName(r, `Usuario ${ri + 1}`),
                  text: r.text || r.message || '',
                  timestamp: r.timestamp || r.created_time || '',
                  attachment: r.attachment || null,
                  from: r.from || null,
                })),
              }
            : { data: [] },
        }));
        const pending = normalized.filter((c: any) => isCommentPending(c, 'facebook'));
        items.push({
          id: post.id,
          platform: 'facebook',
          thumbnail: post.full_picture || null,
          caption: post.message || '',
          permalink: post.permalink_url,
          timestamp: post.created_time || new Date().toISOString(),
          totalComments: normalized.length,
          pendingComments: pending.length,
          comments: normalized,
          raw: post,
          mediaType: post.source ? 'VIDEO' : 'IMAGE',
          mediaUrl: post.full_picture || null,
        });
      });

      // Ads
      adsComments.forEach(({ storyId, platform, comments: rawComments }) => {
        const matchingAd = activeAds.find((ad: any) => 
          platform === 'instagram'
            ? ad.creative.effective_instagram_story_id === storyId
            : ad.creative.effective_object_story_id === storyId
        );
        if (!matchingAd) return;

        const isIgAd = platform === 'instagram';
        const userComments = rawComments.filter((c: any) => {
          return isIgAd 
            ? (c.username && igUsername ? c.username.toLowerCase() !== igUsername.toLowerCase() : true) 
            : c.from?.id !== fbPageId;
        });

        const normalized = userComments.map((c: any, i: number) => ({
          ...c,
          username: c.username || c.from?.username || c.from?.name || `Usuario ${i + 1}`,
          text: c.text || c.message || '',
          timestamp: c.timestamp || c.created_time || new Date().toISOString(),
          from: c.from || null,
        }));

        const pending = normalized.filter((c: any) => isCommentPending(c, isIgAd ? 'instagram' : 'facebook'));

        items.push({
          id: storyId,
          platform: isIgAd ? 'instagram' : 'facebook',
          thumbnail: matchingAd.creative.thumbnail_url || matchingAd.creative.image_url || null,
          caption: matchingAd.creative.name || matchingAd.name || 'Anuncio',
          permalink: isIgAd
            ? (matchingAd.creative.instagram_permalink_url || null)
            : (() => {
                const sid = matchingAd.creative.effective_object_story_id;
                if (!sid) return null;
                const idx = sid.indexOf('_');
                if (idx === -1) return null;
                const pageId = sid.slice(0, idx);
                const postId = sid.slice(idx + 1);
                return `https://www.facebook.com/permalink.php?story_fbid=${postId}&id=${pageId}`;
              })(),
          timestamp: new Date().toISOString(),
          totalComments: normalized.length,
          pendingComments: pending.length,
          comments: normalized,
          raw: matchingAd,
          isAd: true,
        });
      });

      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return items;
    };

    const load = async () => {
      try {
        // Unified deep fetch of 50 items + ads list
        const [igMediaRes50, fbMediaRes50, adsRes] = await Promise.all([
          igId
            ? metaAds.getInstagramMedia(igId, 50, undefined, fbPageId || undefined).catch(err => { setIgError(err.message); return []; })
            : Promise.resolve([]),
          fbPageId
            ? metaAds.getFacebookPageFeed(fbPageId, 50).catch(err => { setFbError(err.message); return []; })
            : Promise.resolve([]),
          metaAccountId
            ? metaAds.getAccountAds(metaAccountId).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);

        if (!active) return;

        const ads = adsRes?.data || [];
        const relevantAds = ads.filter((ad: any) => 
          ad.creative && (ad.creative.effective_object_story_id || ad.creative.effective_instagram_story_id)
        );

        const targets: { storyId: string; platform: 'instagram' | 'facebook' }[] = [];
        relevantAds.forEach((ad: any) => {
          if (ad.creative.effective_object_story_id) {
            targets.push({ storyId: ad.creative.effective_object_story_id, platform: 'facebook' });
          }
          if (ad.creative.effective_instagram_story_id) {
            targets.push({ storyId: ad.creative.effective_instagram_story_id, platform: 'instagram' });
          }
        });

        const uniqueTargetsMap: Record<string, { storyId: string; platform: 'instagram' | 'facebook' }> = {};
        targets.forEach(t => {
          uniqueTargetsMap[`${t.storyId}_${t.platform}`] = t;
        });
        const uniqueTargets = Object.values(uniqueTargetsMap);

        let adsCommentsResults50: any[] = [];
        if (uniqueTargets.length > 0) {
          const topTargets = uniqueTargets.slice(0, 40);
          const commentsPromises = topTargets.map(async (target) => {
            try {
              const res = await metaAds.getAdCreativeComments(target.storyId, target.platform, fbPageId || undefined);
              return { storyId: target.storyId, platform: target.platform, comments: res.data || [] };
            } catch {
              return { storyId: target.storyId, platform: target.platform, comments: [] };
            }
          });
          adsCommentsResults50 = await Promise.all(commentsPromises);
        }

        const allItems = processMediaRes(igMediaRes50, fbMediaRes50, relevantAds, adsCommentsResults50);
        setPosts(allItems);
        
        // Update badge with final accurate count from full deep-fetch
        const countFinal = allItems.reduce((sum, p) => sum + (p.pendingComments || 0), 0);
        setPendingCommentsCount(countFinal);
        if (clientId) { try { localStorage.setItem(`car_pending_comments_count_${clientId}`, String(countFinal)); } catch { /* ignore */ } }
        try { sessionStorage.setItem(`comentarios_cache_${clientId}`, JSON.stringify({ posts: allItems })); } catch { /* quota exceeded — skip cache */ }

      } catch (err) {
        console.error('Error loading comments feed:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [clientId, igId, fbPageId, igUsername, metaAccountId, refreshKey, isCommentPending]);

  // Sync sidebar badge when load completes — update count directly instead of a full API refetch
  // Note: badge is also updated inline inside load() at each step for responsiveness
  useEffect(() => {
    if (!loading) {
      const count = posts.reduce((sum, p) => sum + (p.pendingComments || 0), 0);
      setPendingCommentsCount(count);
      if (clientId) {
        try { localStorage.setItem(`car_pending_comments_count_${clientId}`, String(count)); } catch { /* ignore */ }
      }
    }
  }, [loading, posts, setPendingCommentsCount, clientId]);

  // Background resolver for ad thumbnails and details in ComentariosPage
  useEffect(() => {
    const adsToResolve = posts.filter(p => p.isAd && !p.thumbnail && !resolvedDetails[p.id] && !resolvingIds[p.id]);
    if (adsToResolve.length === 0) return;

    adsToResolve.forEach(async (post) => {
      const ad = post.raw;
      if (!ad) return;
      
      setResolvingIds(prev => ({ ...prev, [post.id]: true }));
      
      const params = new URLSearchParams();
      if (ad.id) params.set('adId', ad.id);
      if (ad.creative?.id) params.set('creativeId', ad.creative.id);
      if (ad.creative?.video_id) params.set('videoId', ad.creative.video_id);
      if (clientId) params.set('clientId', clientId);

      try {
        const res = await fetch(`/api/meta-video?${params}`);
        if (res.ok) {
          const data = await res.json();
          setResolvedDetails(prev => ({ ...prev, [post.id]: data }));
          let thumbnail: string | null = null;
          if (data.type === 'carousel' && data.cards?.[0]?.url) thumbnail = data.cards[0].url;
          else if ((data.type === 'video_source' || data.type === 'ad_preview') && data.picture) thumbnail = data.picture;
          else if (data.type === 'image' && data.url) thumbnail = data.url;
          if (thumbnail) {
            setResolvedThumbnails(prev => ({ ...prev, [post.id]: thumbnail! }));
          }
        }
      } catch (err) {
        console.error("Error resolving ad thumbnail in ComentariosPage:", err);
      } finally {
        setResolvingIds(prev => { const next = { ...prev }; delete next[post.id]; return next; });
      }
    });
  }, [posts, clientId, resolvedDetails, resolvingIds]);

  // Open post slide-over — reload comments from API for freshness
  const openPost = async (post: PostItem) => {
    setSelectedPost(post);
    setComments(post.comments);
    setOpenReplies({});
    setReplyTexts({});
    setReplyErrors({});
    setLikedIds({});
    setPlayingVideoId(null);
    setCommentFilter('pending');
    setMobileTab('comments'); // always land on comments tab on mobile

    // Always fetch fresh IG permalink and normalize to /p/ format (avoids reel player redirect)
    if (post.platform === 'instagram') {
      const capturedId = post.id;
      const toPostUrl = (url: string) => url.replace('www.instagram.com/reel/', 'www.instagram.com/p/').replace('www.instagram.com/tv/', 'www.instagram.com/p/');
      metaAds.getInstagramMediaPermalink(capturedId, fbPageId || undefined)
        .then((res: any) => {
          const raw = res?.permalink || (res?.shortcode ? `https://www.instagram.com/p/${res.shortcode}/` : null);
          const url = raw ? toPostUrl(raw) : null;
          if (url) setSelectedPost(prev => prev?.id === capturedId ? { ...prev, permalink: url } : prev);
        })
        .catch(() => {
          // Normalize existing permalink if we already have one
          if (post.permalink) {
            const url = toPostUrl(post.permalink);
            setSelectedPost(prev => prev?.id === capturedId ? { ...prev, permalink: url } : prev);
          }
        });
    }

    // Reload fresh comments from API
    setLoadingComments(true);
    try {
      const resolveName = (c: any, fallback: string) =>
        c.username || c.from?.username || c.from?.name || c.name ||
        (c.from?.id ? `Usuario ${String(c.from.id).slice(-6)}` : fallback);

      const normalizeComment = (c: any, idx: number) => ({
        ...c,
        username: resolveName(c, `Usuario ${idx + 1}`),
        text: c.text || c.message || '',
        timestamp: c.timestamp || c.created_time || new Date().toISOString(),
        attachment: c.attachment || null,
        from: c.from || null,
        replies: c.replies
          ? {
              data: (c.replies.data || []).map((r: any, ri: number) => ({
                ...r,
                username: resolveName(r, `Usuario ${ri + 1}`),
                text: r.text || r.message || '',
                timestamp: r.timestamp || r.created_time || new Date().toISOString(),
                attachment: r.attachment || null,
                from: r.from || null,
              })),
            }
          : { data: [] },
      });

      if (post.isAd) {
        const res = await metaAds.getAdCreativeComments(post.id, post.platform, fbPageId || undefined);
        const fresh = (res.data || [])
          .filter((c: any) => !isFromPage(c))
          .map(normalizeComment);
        setComments(fresh);
      } else if (post.platform === 'instagram') {
        const res = await metaAds.getInstagramMediaComments(post.id, fbPageId || undefined);
        const fresh = (res.data || [])
          .filter((c: any) => !isFromPage(c))
          .map(normalizeComment);
        setComments(fresh);
      } else {
        const res = await metaAds.getFacebookPostComments(post.id);
        const fresh = (res.data || [])
          .filter((c: any) => !isFromPage(c))
          .map(normalizeComment);
        setComments(fresh);

        // Batch lookup names for FB users where from.name was null
        if (fbPageId) {
          const missingIds = new Set<string>();
          fresh.forEach((c: any) => {
            if (c.from?.id && !c.from?.name) missingIds.add(c.from.id);
            (c.replies?.data || []).forEach((r: any) => {
              if (r.from?.id && !r.from?.name) missingIds.add(r.from.id);
            });
          });
          if (missingIds.size > 0) {
            const nameMap: Record<string, string> = {};
            await Promise.all([...missingIds].map(async (uid) => {
              try {
                const r = await metaAds.getFacebookUserName(uid, fbPageId);
                if (r?.name) nameMap[uid] = r.name;
              } catch { /* skip */ }
            }));
            if (Object.keys(nameMap).length > 0) {
              setComments(prev => prev.map((c: any) => ({
                ...c,
                username: nameMap[c.from?.id] || c.username,
                replies: c.replies ? {
                  data: (c.replies.data || []).map((r: any) => ({
                    ...r,
                    username: nameMap[r.from?.id] || r.username,
                  })),
                } : c.replies,
              })));
            }
          }
        }
      }
    } catch (err) {
      // Keep initial comments on error
    } finally {
      setLoadingComments(false);
    }
  };

  // Generate AI draft for one comment
  const generateDraft = async (comment: any, replyTarget?: any) => {
    if (!selectedPost || !clientId) return;
    const target = replyTarget || comment;
    const text = target.text || target.message || '';
    // _forceLang comes from clicking a specific flag in the dropdown
    const lang: 'en' | 'es' = target._forceLang || replyLangs[comment.id] || detectLang(text);
    if (!replyLangs[comment.id] || target._forceLang) setReplyLangs(prev => ({ ...prev, [comment.id]: lang }));
    setDraftLoading(prev => ({ ...prev, [comment.id]: true }));
    setReplyErrors(prev => ({ ...prev, [comment.id]: null }));
    try {
      const postCaption = selectedPost.caption;
      const allComments = comments.map((c: any) => ({
        username: c.username,
        text: c.text || c.message || '',
        reply: c.reply || undefined,
      }));
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const token = freshSession?.access_token || '';
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId, itemText: text, username: target.username,
          postCaption, allComments,
          postMediaUrl: selectedPost.thumbnail || selectedPost.mediaUrl || undefined,
          postPlatform: selectedPost.platform || undefined,
          forceLang: lang,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.draft) {
        let draftText = data.draft;
        if (replyTarget) {
          const prefix = `@${replyTarget.username} `;
          if (!draftText.toLowerCase().startsWith(`@${replyTarget.username.toLowerCase()}`)) {
            draftText = prefix + draftText;
          }
        }
        setReplyTexts(prev => ({ ...prev, [comment.id]: draftText }));
      }
    } catch {
      setReplyErrors(prev => ({ ...prev, [comment.id]: 'No se pudo generar el borrador.' }));
    } finally {
      setDraftLoading(prev => ({ ...prev, [comment.id]: false }));
    }
  };

  // Bulk generate drafts for all pending
  const bulkGenerateDrafts = async () => {
    if (!selectedPost || !clientId) return;
    setBulkLoading(true);
    const pending = comments.filter(c => isCommentPending(c, selectedPost.platform));
    
    // Auto-open reply textareas for all pending comments so drafts can be seen loading/suggested
    setOpenReplies(prev => {
      const copy = { ...prev };
      pending.forEach(c => {
        copy[c.id] = true;
      });
      return copy;
    });

    await Promise.all(pending.map(c => generateDraft(c)));
    setBulkLoading(false);
  };

  // Submit reply to a comment
  const submitReply = async (e: React.FormEvent, comment: any) => {
    e.preventDefault();
    const text = replyTexts[comment.id]?.trim();
    if (!text || !selectedPost) return;

    const localId = `local_${Date.now()}`;
    const newReply = {
      id: localId,
      username: igUsername || 'Yo',
      text,
      timestamp: new Date().toISOString(),
      from: { id: fbPageId, name: 'Yo' },
      isSending: true,
    };

    // 1. Instantly show the reply in the UI & clear input
    setComments(prev => prev.map(c => {
      if (c.id !== comment.id) return c;
      return { ...c, replies: { data: [...(c.replies?.data || []), newReply] } };
    }));
    setReplyTexts(prev => { const copy = { ...prev }; delete copy[comment.id]; return copy; });
    setOpenReplies(prev => ({ ...prev, [comment.id]: false }));
    setSubmitting(prev => ({ ...prev, [comment.id]: true }));
    setReplyErrors(prev => ({ ...prev, [comment.id]: null }));

    try {
      if (selectedPost.platform === 'instagram') {
        await metaAds.replyToInstagramComment(comment.id, text, fbPageId || undefined);
      } else {
        await metaAds.replyToFacebookComment(comment.id, text);
      }

      setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null }));

      if (user?.id && clientId) {
        db.activity.log(user.id, clientId, 'reply_sent', {
          reply_text: text,
          incoming_text: comment.text || comment.message || '',
          platform: selectedPost.platform,
          item_id: comment.id,
          user_email: user.email || '',
        }).catch(() => {});
      }

      // 2. Mark reply as sent (remove isSending)
      setComments(prev => prev.map(c => {
        if (c.id !== comment.id) return c;
        const updatedReplies = (c.replies?.data || []).map((r: any) => 
          r.id === localId ? { ...r, isSending: false } : r
        );
        return { ...c, replies: { data: updatedReplies } };
      }));

      // Update post pending count
      setPosts(prev => prev.map(p => {
        if (p.id !== selectedPost.id) return p;
        return { ...p, pendingComments: Math.max(0, p.pendingComments - 1) };
      }));

      // Dispatch comments update to refresh sidebar badge
      window.dispatchEvent(new Event('car_comments_update'));
    } catch (err: any) {
      // 3. On error: remove the optimistic reply and restore text
      setComments(prev => prev.map(c => {
        if (c.id !== comment.id) return c;
        const filteredReplies = (c.replies?.data || []).filter((r: any) => r.id !== localId);
        return { ...c, replies: { data: filteredReplies } };
      }));
      setReplyTexts(prev => ({ ...prev, [comment.id]: text }));
      setOpenReplies(prev => ({ ...prev, [comment.id]: true }));
      setReplyErrors(prev => ({ ...prev, [comment.id]: 'Error al enviar la respuesta.' }));
    } finally {
      setSubmitting(prev => ({ ...prev, [comment.id]: false }));
    }
  };

  // Toggle like
  const toggleLike = async (commentId: string) => {
    if (!selectedPost) return;
    const liked = !!likedIds[commentId];
    try {
      if (liked) {
        await metaAds.unlikeComment(commentId, selectedPost.platform, igId, fbPageId || undefined);
        setLikedIds(prev => ({ ...prev, [commentId]: false }));
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, like_count: Math.max(0, (c.like_count || 0) - 1) } : c));
      } else {
        await metaAds.likeComment(commentId, selectedPost.platform, igId, fbPageId || undefined);
        setLikedIds(prev => ({ ...prev, [commentId]: true }));
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, like_count: (c.like_count || 0) + 1 } : c));
      }
    } catch (err) {
      console.error('Error toggling like:', err);
    }
  };

  const platformCounts = useMemo(() => {
    let all = 0;
    let instagram = 0;
    let facebook = 0;
    let ads = 0;

    posts.forEach(p => {
      const pending = p.pendingComments || 0;
      all += pending;
      if (p.isAd) {
        ads += pending;
      } else if (p.platform === 'instagram') {
        instagram += pending;
      } else if (p.platform === 'facebook') {
        facebook += pending;
      }
    });

    return { all, instagram, facebook, ads };
  }, [posts]);

  const filteredPosts = useMemo(() => {
    let list = posts;
    if (platformFilter === 'instagram') list = list.filter(p => p.platform === 'instagram' && !p.isAd);
    else if (platformFilter === 'facebook') list = list.filter(p => p.platform === 'facebook' && !p.isAd);
    else if (platformFilter === 'ads') list = list.filter(p => p.isAd);
    if (statusFilter === 'pending') list = list.filter(p => p.pendingComments > 0);
    // Sort by most recent incoming comment (user comment only, not our replies)
    list = [...list].sort((a, b) => {
      const lastTs = (post: PostItem) => {
        const all = post.comments.map((c: any) => c.timestamp || c.created_time || post.timestamp).filter(Boolean);
        const latest = all.length ? all.reduce((mx, ts) => ts > mx ? ts : mx) : post.timestamp;
        return new Date(latest).getTime();
      };
      return sortOrder === 'newest' ? lastTs(b) - lastTs(a) : lastTs(a) - lastTs(b);
    });
    return list;
  }, [posts, platformFilter, statusFilter, sortOrder]);

  const totalPending = platformCounts.all;

  const fmtDate = (ts: string) => {
    try {
      return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    } catch { return ''; }
  };

  if (!loading && !fbPageId && !igId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center max-w-lg mx-auto space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
          <MessageSquare className="w-8 h-8 text-violet-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-[20px] font-black text-zinc-900 dark:text-white tracking-tight">Conectá tu cuenta de Instagram y Facebook</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-450 leading-relaxed font-semibold">
            Vinculá tus redes sociales en segundos para poder recibir, leer y responder todos tus comentarios de Instagram y Facebook directamente desde esta bandeja de entrada unificada.
          </p>
        </div>
        
        <button
          onClick={handleStartConnection}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[13.5px] font-black shadow-md shadow-blue-600/20 transition-all active:scale-[0.98]"
        >
          <Facebook className="w-4 h-4" />
          Conectar con Facebook
        </button>

        {/* Modal for selecting pages */}
        {showConnectModal && renderConnectModal()}
      </div>
    );
  }

  return (
    <CenteredPageLoader isLoading={loading}>
    <div className="space-y-6 w-full pt-6 px-4 md:px-6 lg:px-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="page-header pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div>
          <h1 className="page-title">
            <MessageSquare className="w-6 h-6 text-violet-500 shrink-0" />
            Comentarios
          </h1>
          <p className="page-subtitle mt-1">
            {totalPending > 0
              ? `${totalPending} comentarios pendientes de respuesta en ${posts.filter(p => p.pendingComments > 0).length} publicaciones`
              : 'Todos los comentarios están respondidos'}
          </p>
        </div>
      </div>

      {/* Filters + Sort */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
        <div 
          className="flex flex-wrap items-center gap-2 w-full sm:w-auto"
        >
          {(['all', 'instagram', 'facebook', 'ads'] as const).map(p => {
            const count = p === 'all' ? platformCounts.all
              : p === 'instagram' ? platformCounts.instagram
              : p === 'facebook' ? platformCounts.facebook
              : platformCounts.ads;
            const label = p === 'all' ? 'Todas' : p === 'instagram' ? 'Instagram' : p === 'facebook' ? 'Facebook' : 'Anuncios';
            const isActive = platformFilter === p;
            // Badge colors per platform
            const badgeColor = p === 'instagram'
              ? isActive ? 'bg-pink-500 text-white' : 'bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400'
              : p === 'facebook'
              ? isActive ? 'bg-blue-500 text-white' : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
              : p === 'ads'
              ? isActive ? 'bg-amber-500 text-white' : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
              : isActive ? 'bg-violet-500 text-white' : 'bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400';

            return (
              <button
                key={p}
                onClick={() => setPlatformFilter(p)}
                className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] font-black transition-all border flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-sm'
                    : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <span>{label}</span>
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[14px] h-[14px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full text-[8px] sm:text-[9px] font-black leading-none ${badgeColor}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sort toggle */}
        <button
          onClick={() => setSortOrder(o => o === 'newest' ? 'oldest' : 'newest')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all"
        >
          {sortOrder === 'newest' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
          {sortOrder === 'newest' ? 'Más reciente' : 'Más antiguo'}
        </button>
      </div>

      {/* Errors */}
      {(igError || fbError) && (
        <div className="space-y-2">
          {igError && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span><strong>Instagram:</strong> {igError}</span>
            </div>
          )}
          {fbError && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span><strong>Facebook:</strong> {fbError}</span>
            </div>
          )}
        </div>
      )}


      {/* Content */}
      {loading ? null : filteredPosts.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-16 text-center max-w-md mx-auto space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">
            {statusFilter === 'pending' ? '¡Sin comentarios pendientes!' : 'Sin publicaciones con comentarios'}
          </h3>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            {statusFilter === 'pending' ? 'Buen trabajo. Todas las publicaciones están respondidas.' : 'No se encontraron publicaciones con comentarios en este período.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {filteredPosts.map(post => (
            <button
              key={post.id}
              onClick={() => openPost(post)}
              className="group relative bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 text-left flex flex-col"
            >
              {/* Thumbnail */}
              <div className="aspect-square w-full bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden">
                {(() => {
                  const thumb = post.thumbnail || resolvedThumbnails[post.id];
                  if (thumb) {
                    return <SmoothImage src={thumb} alt="" containerClassName="w-full h-full" className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-500" />;
                  }
                  return (
                    <div className="w-full h-full flex items-center justify-center">
                      <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                    </div>
                  );
                })()}

                {/* Platform badge */}
                <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-white shadow-md ${
                  post.platform === 'instagram'
                    ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'
                    : 'bg-blue-600'
                }`}>
                  {post.platform === 'instagram'
                    ? <Instagram className="w-3 h-3" />
                    : <span className="text-[10px] font-black">f</span>
                  }
                </div>

                {/* Ad badge */}
                {post.isAd && (
                  <div className="absolute bottom-2 left-2 bg-violet-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-md uppercase tracking-wider">
                    Anuncio
                  </div>
                )}

                {/* Pending badge */}
                {post.pendingComments > 0 && (
                  <div className="absolute top-2 right-2 bg-amber-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md animate-pulse">
                    {post.pendingComments} pend.
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-1 text-white">
                  <MessageCircle className="w-6 h-6" />
                  <span className="text-[11px] font-black">{post.totalComments} comentarios</span>
                  {post.pendingComments > 0 && (
                    <span className="text-[10px] font-bold text-amber-300">{post.pendingComments} sin responder</span>
                  )}
                </div>
              </div>

              {/* Caption */}
              <div className="p-2.5 flex-1">
                <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 font-bold mb-1">{fmtDate(post.timestamp)}</p>
                {post.caption && (
                  <p className="text-[11px] text-zinc-700 dark:text-zinc-300 font-medium line-clamp-2 leading-snug">
                    {post.caption}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[9px] font-black text-zinc-400">{post.totalComments} com.</span>
                  {post.pendingComments > 0 && (
                    <span className="text-[9px] font-black text-amber-600 dark:text-amber-400">· {post.pendingComments} pend.</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* === SLIDE-OVER: Comments detail (same as RedesSocialesPage) === */}
      {selectedPost && (
        <div className="fixed inset-0 z-[400] flex justify-end animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedPost(null)} />

          <div className="relative w-full md:max-w-5xl h-full bg-white dark:bg-[#0d0d11] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right transition-spring duration-300 z-10">

            {/* Header */}
            <div className="px-4 md:px-6 py-3 md:py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex items-center justify-between flex-shrink-0 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white ${
                  selectedPost.platform === 'instagram'
                    ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'
                    : 'bg-blue-600'
                }`}>
                  {selectedPost.platform === 'instagram' ? <Instagram className="w-4 h-4" /> : <span className="font-black text-sm">f</span>}
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-zinc-900 dark:text-white text-[13px] md:text-[15px] leading-tight truncate">
                    {selectedPost.platform === 'instagram' ? 'Instagram' : 'Facebook'}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-zinc-400 font-bold">{fmtDate(selectedPost.timestamp)}</span>
                    {comments.filter(c => isCommentPending(c, selectedPost.platform)).length > 0 && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                        {comments.filter(c => isCommentPending(c, selectedPost.platform)).length} sin responder
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Bulk drafts — compact on mobile, full on desktop */}
                <button
                  onClick={bulkGenerateDrafts}
                  disabled={bulkLoading || comments.filter(c => isCommentPending(c, selectedPost.platform)).length === 0}
                  className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/20 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-xl text-[11px] font-black border border-violet-100/50 dark:border-violet-900/20 transition-all disabled:opacity-50"
                  title="Generar borradores para todos los pendientes"
                >
                  {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">Generar borradores para todos ({comments.filter(c => isCommentPending(c, selectedPost.platform)).length})</span>
                  <span className="md:hidden">{comments.filter(c => isCommentPending(c, selectedPost.platform)).length > 0 && <span className="text-[10px] font-black">{comments.filter(c => isCommentPending(c, selectedPost.platform)).length}</span>}</span>
                </button>
                {selectedPost.permalink && (
                  <a href={selectedPost.permalink} target="_blank" rel="noreferrer"
                    title={selectedPost.permalink}
                    className="inline-flex items-center gap-1 p-1.5 md:px-3 md:py-1.5 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl text-[11px] text-zinc-600 dark:text-zinc-300 font-bold border border-zinc-200 dark:border-zinc-700 transition-all">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Ver original</span>
                  </a>
                )}
                <button onClick={() => setSelectedPost(null)} className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700/60 active:scale-95 transition-all shadow-sm">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mobile tab bar */}
            <div className="md:hidden flex border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 flex-shrink-0">
              <button
                onClick={() => setMobileTab('post')}
                className={`flex-1 py-2.5 text-[12px] font-black transition-colors ${
                  mobileTab === 'post'
                    ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                Publicación
              </button>
              <button
                onClick={() => setMobileTab('comments')}
                className={`flex-1 py-2.5 text-[12px] font-black transition-colors flex items-center justify-center gap-1.5 ${
                  mobileTab === 'comments'
                    ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-500'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                Comentarios
                {!loadingComments && comments.length > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">{comments.length}</span>
                )}
              </button>
            </div>

            {/* Body: post preview + comments */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

              {/* Left: Post media + caption — hidden on mobile when comments tab active */}
              <div className={`${
                mobileTab === 'comments' ? 'hidden md:flex' : 'flex'
              } md:w-[300px] flex-shrink-0 flex-col border-r border-zinc-100 dark:border-zinc-800 p-5 overflow-y-auto space-y-4 bg-zinc-50/30 dark:bg-zinc-950/10`}>
                {/* Media */}
                {(() => {
                  const mediaData = resolvedDetails[selectedPost.id];
                  const displayThumb = selectedPost.thumbnail || resolvedThumbnails[selectedPost.id] || '';

                  if (selectedPost.isAd && mediaData) {
                    if (mediaData.type === 'video_source') {
                      return (
                        <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm bg-black aspect-[4/5] w-full">
                          <video
                            src={mediaData.source || undefined}
                            poster={mediaData.picture || displayThumb || undefined}
                            controls
                            preload="none"
                            playsInline
                            {...{ referrerPolicy: 'no-referrer' }}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      );
                    }
                    if (mediaData.type === 'carousel' && mediaData.cards?.length > 0) {
                      const firstCard = mediaData.cards[0];
                      return (
                        <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm bg-zinc-100 dark:bg-zinc-900 w-full">
                          <SmoothImage
                            src={firstCard.url || displayThumb}
                            alt=""
                            containerClassName="w-full h-full"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      );
                    }
                    if (mediaData.type === 'ad_preview' && mediaData.embed_html) {
                      const resizedHtml = mediaData.embed_html
                        .replace(/width="\d+"/g, 'width="100%"')
                        .replace(/height="\d+"/g, 'height="320"')
                        .replace(/<iframe/g, `<iframe style="width:100%;height:320px;border:none;"`);
                      const cleanHtml = DOMPurify.sanitize(resizedHtml, {
                        ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'style', 'src', 'width', 'height'],
                      });
                      return (
                        <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 w-full" style={{ height: 320 }} dangerouslySetInnerHTML={{ __html: cleanHtml }} />
                      );
                    }
                    if (mediaData.type === 'image' && mediaData.url) {
                      return (
                        <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm bg-zinc-100 dark:bg-zinc-900 w-full">
                          <SmoothImage
                            src={mediaData.url}
                            alt=""
                            containerClassName="w-full h-full"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      );
                    }
                  }

                  if (displayThumb || selectedPost.mediaUrl) {
                    return (
                      <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm bg-zinc-100 dark:bg-zinc-900 w-full">
                        {selectedPost.mediaType === 'VIDEO' ? (
                          playingVideoId === selectedPost.id ? (
                            <video src={selectedPost.mediaUrl || displayThumb || ''} controls autoPlay {...{ referrerPolicy: "no-referrer" }} className="w-full max-h-64 object-contain bg-black" />
                          ) : (
                            <div className="relative cursor-pointer" onClick={() => setPlayingVideoId(selectedPost.id)}>
                              <img src={displayThumb || ''} alt="" referrerPolicy="no-referrer" className="w-full max-h-64 object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                                  <Play className="w-6 h-6 fill-zinc-900 text-zinc-900 ml-1" />
                                </div>
                              </div>
                            </div>
                          )
                        ) : (
                          <img src={displayThumb || selectedPost.mediaUrl || ''} alt="" referrerPolicy="no-referrer" className="w-full max-h-64 object-cover" loading="lazy" />
                        )}
                      </div>
                    );
                  }

                  return null;
                })()}

                {/* Caption */}
                {selectedPost.caption && (
                  <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-1">Descripción</p>
                    <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">{selectedPost.caption}</p>
                  </div>
                )}

                {/* Stats */}
                <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl space-y-1.5">
                  <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Comentarios</p>
                  <div className="flex items-center justify-between text-[12px] font-bold">
                    <span className="text-zinc-600 dark:text-zinc-400">Total</span>
                    <span className="text-zinc-900 dark:text-white">{comments.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] font-bold">
                    <span className="text-amber-600 dark:text-amber-400">Sin responder</span>
                    <span className="text-amber-600 dark:text-amber-400">{comments.filter(c => isCommentPending(c, selectedPost.platform)).length}</span>
                  </div>
                </div>
              </div>

              {/* Right: Comments list — hidden on mobile when post tab active */}
              <div className={`${
                mobileTab === 'post' ? 'hidden md:flex' : 'flex'
              } flex-1 overflow-y-auto flex-col`}>
                {/* Filter toggle */}
                {!loadingComments && comments.length > 0 && (
                  <div className="flex items-center gap-1 px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0 bg-zinc-50/50 dark:bg-zinc-900/40">
                    <button
                      onClick={() => setCommentFilter('pending')}
                      className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] font-black transition-all ${
                        commentFilter === 'pending'
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      Sin responder
                      <span className={`text-[8px] sm:text-[9px] min-w-[14px] h-[14px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full font-black flex items-center justify-center ${
                        commentFilter === 'pending'
                          ? 'bg-white/15 dark:bg-zinc-900/20 text-white dark:text-zinc-900'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                      }`}>
                        {comments.filter(c => isCommentPending(c, selectedPost!.platform)).length}
                      </span>
                    </button>
                    <button
                      onClick={() => setCommentFilter('all')}
                      className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] font-black transition-all ${
                        commentFilter === 'all'
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      Todos
                      <span className={`text-[8px] sm:text-[9px] min-w-[14px] h-[14px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full font-black flex items-center justify-center ${
                        commentFilter === 'all'
                          ? 'bg-white/15 dark:bg-zinc-900/20 text-white dark:text-zinc-900'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                      }`}>
                        {comments.length}
                      </span>
                    </button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {loadingComments ? (
                  <AppleLoader variant="table" count={4} />
                ) : comments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <MessageCircle className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                    <p className="text-[13px] font-bold text-zinc-500">Sin comentarios de usuarios</p>
                  </div>
                ) : (
                  [...comments]
                    .filter(c => commentFilter === 'all' || isCommentPending(c, selectedPost!.platform))
                    .sort((a, b) =>
                      new Date(b.timestamp || b.created_time || 0).getTime() -
                      new Date(a.timestamp || a.created_time || 0).getTime()
                    ).map(comment => {
                    const isPending = isCommentPending(comment, selectedPost.platform);
                    const liked = !!likedIds[comment.id];
                    const replyOpen = !!openReplies[comment.id];
                    const replies = comment.replies?.data || [];

                    return (
                      <div key={comment.id} className={`bg-white dark:bg-zinc-900 border rounded-2xl overflow-hidden transition-all ${
                        isPending
                          ? 'border-amber-200 dark:border-amber-800/40 shadow-sm'
                          : 'border-zinc-200/60 dark:border-zinc-800/60'
                      }`}>
                        <div className="p-4">
                          {/* Comment header */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[11px] font-black text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                                {(comment.username || 'U')[0].toUpperCase()}
                              </div>
                              <div>
                                <span className="text-[12px] font-black text-zinc-900 dark:text-white">@{comment.username}</span>
                                <span className="text-[10px] text-zinc-400 ml-2">{comment.timestamp ? new Date(comment.timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : ''}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {isPending && (
                                <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 uppercase">
                                  Pendiente
                                </span>
                              )}
                              {!isPending && (
                                <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 uppercase">
                                  Respondido
                                </span>
                              )}
                              <button
                                onClick={() => toggleLike(comment.id)}
                                className={`flex items-center gap-0.5 text-[11px] font-bold transition-colors ${liked ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'}`}
                              >
                                <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-red-500' : ''}`} />
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
                              {(comment.text || comment.message) && (
                                <p className="text-[13px] text-zinc-800 dark:text-zinc-100 leading-relaxed font-medium mt-1">{comment.text || comment.message}</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[13px] text-zinc-800 dark:text-zinc-100 leading-relaxed font-medium ml-9">
                              {comment.text || comment.message}
                            </p>
                          )}

                          {/* Existing replies */}
                          {replies.length > 0 && (
                            <div className="ml-9 mt-3 space-y-2 pl-3 border-l-2 border-zinc-100 dark:border-zinc-800">
                              {replies.map((r: any) => {
                                const rIsMe = (r.username && igUsername && r.username.toLowerCase() === igUsername.toLowerCase()) || 
                                              r.from?.id === fbPageId;
                                return (
                                  <div key={r.id} className="space-y-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-[10px] font-black ${rIsMe ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500'}`}>
                                        @{r.username || r.from?.username || r.from?.name || 'Yo'}
                                      </span>
                                      {r.isSending && (
                                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-bold flex items-center gap-1">
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
                                          setOpenReplies(prev => ({ ...prev, [comment.id]: true }));
                                          setReplyTexts(prev => ({ ...prev, [comment.id]: `@${r.username} ` }));
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
                                setOpenReplies(prev => ({ ...prev, [comment.id]: nextOpen }));
                                if (nextOpen) {
                                  setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null }));
                                  setReplyTexts(prev => ({ ...prev, [comment.id]: '' }));
                                } else {
                                  setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null }));
                                  setReplyTexts(prev => ({ ...prev, [comment.id]: '' }));
                                }
                              }}
                              className="text-[11px] font-black text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 transition-colors"
                            >
                              {replyOpen ? 'Cancelar' : 'Responder'}
                            </button>
                          </div>

                          {/* Reply box */}
                          {replyOpen && (
                            <div className="mt-3 ml-9 space-y-2 animate-in fade-in duration-200">
                              {replyErrors[comment.id] && (
                                <p className="text-[10px] text-red-500 font-bold">{replyErrors[comment.id]}</p>
                              )}
                              {activeReplyTargets[comment.id] && (
                                <div className="flex items-center justify-between bg-violet-50/50 dark:bg-violet-950/10 px-3 py-1.5 rounded-lg border border-violet-100/30 dark:border-violet-900/10 text-[11px] font-bold text-violet-700 dark:text-violet-400">
                                  <span>Respondiendo a @{activeReplyTargets[comment.id].username}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveReplyTargets(prev => ({ ...prev, [comment.id]: null }));
                                      setReplyTexts(prev => ({ ...prev, [comment.id]: '' }));
                                    }}
                                    className="text-violet-400 hover:text-violet-600 dark:hover:text-violet-300"
                                    title="Quitar respuesta dirigida"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
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
                                  {/* IA button — main action */}
                                  <button
                                    type="button"
                                    onClick={() => generateDraft(comment, activeReplyTargets[comment.id])}
                                    disabled={submitting[comment.id] || draftLoading[comment.id]}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-[12px] font-black shadow-sm shadow-violet-500/25 transition-all"
                                  >
                                    {draftLoading[comment.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
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
                                        const cur = replyLangs[comment.id] || detectLang(comment.text || comment.message || '');
                                        return LANGS.find(l => l.code === cur)?.flag ?? '🇪🇸';
                                      })()}
                                      <svg className="w-2.5 h-2.5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                    {langDropdownOpen[comment.id] && (
                                      <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[110px]">
                                        {LANGS.map(l => {
                                          const cur = replyLangs[comment.id] || detectLang(comment.text || comment.message || '');
                                          return (
                                            <button
                                              key={l.code}
                                              type="button"
                                              onClick={() => {
                                                const target = activeReplyTargets[comment.id];
                                                setReplyLangs(prev => ({ ...prev, [comment.id]: l.code }));
                                                setLangDropdownOpen(prev => ({ ...prev, [comment.id]: false }));
                                                if (target) {
                                                  generateDraft(comment, { ...target, _forceLang: l.code });
                                                } else {
                                                  generateDraft({ ...comment, _forceLang: l.code });
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
                                    disabled={submitting[comment.id] || draftLoading[comment.id] || !(replyTexts[comment.id] || '').trim()}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-black shadow-sm transition-all"
                                  >
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
            </div>
          </div>
        </div>
      )}
    </div>
    </CenteredPageLoader>
  );
}
