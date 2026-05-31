import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  Instagram, Heart, MessageCircle, Image as ImageIcon, Video, Layers, Loader2, RefreshCw, X, 
  ArrowUpRight, AlertCircle, ThumbsUp, MessageSquare, Sparkles, Play
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { metaAds } from '../services/metaAds';
import EmailLoader from '../components/ui/EmailLoader';
import { db } from '../services/db';

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
  const { isViewingAs, viewAsProfile } = useViewAs();
  const { profile: authProfile, user } = useAuth();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;

  const [refreshKey, setRefreshKey] = useState(0);
  
  // Tab State (Instagram vs Facebook)
  const [activeTab, setActiveTab] = useState<'instagram' | 'facebook'>('instagram');

  // Loading and Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);

  // Data States
  const [igProfile, setIgProfile] = useState<any>(null);
  const [igMedia, setIgMedia] = useState<any[]>([]);
  
  const [fbProfile, setFbProfile] = useState<any>(null);
  const [fbMedia, setFbMedia] = useState<any[]>([]);

  // UI Filters
  const [mediaFilter, setMediaFilter] = useState<'all' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'>('all');
  const [fbMediaFilter, setFbMediaFilter] = useState<'all' | 'PHOTO' | 'TEXT'>('all');
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string, boolean>>({});
  const [expandedFbCaptions, setExpandedFbCaptions] = useState<Record<string, boolean>>({});

  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  // Infinite scroll: how many posts to show in each feed
  const [visibleIgCount, setVisibleIgCount] = useState(12);
  const [visibleFbCount, setVisibleFbCount] = useState(12);
  const igSentinelRef = useRef<HTMLDivElement>(null);
  const fbSentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when filters change
  useEffect(() => { setVisibleIgCount(12); }, [mediaFilter]);
  useEffect(() => { setVisibleFbCount(12); }, [fbMediaFilter]);

  // Comments modal/side-sheet state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostPermalink, setSelectedPostPermalink] = useState<string | null>(null);
  const [selectedPostType, setSelectedPostType] = useState<'instagram' | 'facebook'>('instagram');
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
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
  const [bulkDraftsLoading, setBulkDraftsLoading] = useState(false);

  // Likes local state optimization
  const [likedCommentIds, setLikedCommentIds] = useState<Record<string, boolean>>({});
  const [likingCommentIds, setLikingCommentIds] = useState<Record<string, boolean>>({});

  // Resolve IDs from client profile
  const igId = (profile as any)?.ig_business_id;
  const igUsername = (profile as any)?.ig_username;
  const fbPageId = (profile as any)?.fb_page_id;

  // Helper to determine if a comment thread is unanswered/pending
  const isCommentPending = (comment: any) => {
    const isFromPage = comment.username === igUsername || comment.from?.id === fbPageId;
    if (isFromPage) return false;
    
    const repliesList = comment.replies?.data || [];
    if (repliesList.length === 0) return true;
    
    const sortedReplies = [...repliesList].sort(
      (a, b) => new Date(a.timestamp || a.created_time).getTime() - new Date(b.timestamp || b.created_time).getTime()
    );
    const latestReply = sortedReplies[sortedReplies.length - 1];
    const lastIsFromPage = latestReply.username === igUsername || latestReply.from?.id === fbPageId;
    return !lastIsFromPage;
  };

  // Bulk draft generation for all pending comments in the modal
  const handleBulkDrafts = async () => {
    const pendingComments = comments.filter(c => isCommentPending(c));
    if (pendingComments.length === 0) return;
    
    setBulkDraftsLoading(true);
    
    const postCaptionContext = igMedia.find(m => m.id === selectedPostId)?.caption || fbMedia.find(m => m.id === selectedPostId)?.message || '';
    
    const promises = pendingComments.map(async (comment) => {
      setCommentRepliesLoadingDraft(prev => ({ ...prev, [comment.id]: true }));
      try {
        const usernameStr = comment.username || comment.from?.name || 'usuario';
        const itemTextStr = comment.text || comment.message || '';
        
        // Collect other comments in this post for context
        const otherCommentsList = comments
          .filter(c => c.id !== comment.id)
          .map(c => `@${c.username || c.from?.name || 'usuario'}: ${c.text || c.message || ''}`);

        const res = await fetch('/api/draft-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            itemText: itemTextStr,
            username: usernameStr,
            postCaption: postCaptionContext,
            otherComments: otherCommentsList,
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.draft) {
            setCommentReplies(prev => ({ ...prev, [comment.id]: data.draft }));
          }
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

  // Submit response for a specific comment (inline)
  const handleSubmitPerComment = async (e: React.FormEvent, commentId: string) => {
    e.preventDefault();
    const replyText = commentReplies[commentId]?.trim();
    if (!replyText || !selectedPostId) return;
    
    setCommentRepliesSubmitting(prev => ({ ...prev, [commentId]: true }));
    setCommentRepliesErrors(prev => ({ ...prev, [commentId]: null }));
    
    try {
      if (selectedPostType === 'instagram') {
        await metaAds.replyToInstagramComment(commentId, replyText);
      } else {
        await metaAds.replyToFacebookComment(commentId, replyText);
      }

      // Log the reply action in car_user_activity for few-shot learning
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
      
      // Clear input and reload comments
      setCommentReplies(prev => {
        const copy = { ...prev };
        delete copy[commentId];
        return copy;
      });
      
      // Hide the input block
      setActiveReplyCommentIds(prev => ({ ...prev, [commentId]: false }));
      
      await fetchComments(selectedPostId, selectedPostType);
    } catch (err: any) {
      console.error(`Failed to submit reply to comment ${commentId}:`, err);
      setCommentRepliesErrors(prev => ({
        ...prev,
        [commentId]: 'No se pudo enviar la respuesta. Verifica tus permisos o hazlo desde la plataforma original.'
      }));
    } finally {
      setCommentRepliesSubmitting(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Single comment AI draft generator (inline)
  const handleSingleCommentDraft = async (commentId: string, itemText: string, username: string) => {
    setCommentRepliesLoadingDraft(prev => ({ ...prev, [commentId]: true }));
    setCommentRepliesErrors(prev => ({ ...prev, [commentId]: null }));
    try {
      const postCaptionContext = igMedia.find(m => m.id === selectedPostId)?.caption || fbMedia.find(m => m.id === selectedPostId)?.message || '';
      const otherCommentsList = comments
        .filter(c => c.id !== commentId)
        .map(c => `@${c.username || c.from?.name || 'usuario'}: ${c.text || c.message || ''}`);

      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          itemText,
          username,
          postCaption: postCaptionContext,
          otherComments: otherCommentsList,
        }),
      });
      if (!res.ok) throw new Error(`Draft reply error: ${res.status}`);
      const data = await res.json();
      if (data.draft) {
        setCommentReplies(prev => ({ ...prev, [commentId]: data.draft }));
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
        await metaAds.unlikeComment(commentId, selectedPostType, igId);
        setLikedCommentIds(prev => ({ ...prev, [commentId]: false }));
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, like_count: Math.max(0, (c.like_count || 0) - 1) } : c));
      } else {
        await metaAds.likeComment(commentId, selectedPostType, igId);
        setLikedCommentIds(prev => ({ ...prev, [commentId]: true }));
        setComments(prev => prev.map(c => c.id === commentId ? { ...c, like_count: (c.like_count || 0) + 1 } : c));
      }
    } catch (err) {
      console.error('Error toggling comment like:', err);
    } finally {
      setLikingCommentIds(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Track page ID in localStorage to enable token retrieval in services
  useEffect(() => {
    if (fbPageId) {
      localStorage.setItem('active_fb_page_id', fbPageId);
    }
  }, [fbPageId]);

  const generateSocialCommentDraft = async () => {
    if (!replyingTo || !selectedPostId) return;
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          itemText: commentToReply.text || commentToReply.message || '',
          username: replyingTo.username,
          postCaption: postCaptionContext,
          otherComments: otherCommentsList,
        }),
      });
      if (!res.ok) throw new Error(`Draft reply error: ${res.status}`);
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
        const res = await metaAds.getInstagramMediaComments(postId);
        setComments(res.data || []);
      } else {
        const res = await metaAds.getFacebookPostComments(postId);
        // Normalize comments for Facebook to fit same rendering structure.
        // IMPORTANT: preserve the original `from` object so isCommentPending can
        // compare from.id against fbPageId to detect page-owned replies.
        const normalized = (res.data || []).map((c: any, idx: number) => ({
          id: c.id,
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
    setSelectedPostPermalink(permalink);
    setSelectedPostType(type);
    setReplyingTo(null);
    setCommentInput('');
    setSubmitError(null);
    fetchComments(postId, type);
  };

  const closeCommentsModal = () => {
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
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim() || !selectedPostId) return;
    setSubmittingReply(true);
    setSubmitError(null);
    try {
      if (selectedPostType === 'instagram') {
        if (replyingTo) {
          await metaAds.replyToInstagramComment(replyingTo.id, commentInput.trim());
        } else {
          await metaAds.createInstagramMediaComment(selectedPostId, commentInput.trim());
        }
      } else {
        if (replyingTo) {
          await metaAds.replyToFacebookComment(replyingTo.id, commentInput.trim());
        } else {
          await metaAds.replyToFacebookComment(selectedPostId, commentInput.trim());
        }
      }

      // Log the reply action in car_user_activity for few-shot learning
      if (user?.id && clientId) {
        let incomingText = '';
        if (replyingTo) {
          const parentComment = comments.find(c => c.id === replyingTo.id);
          incomingText = parentComment ? (parentComment.text || parentComment.message || '') : '';
        } else {
          incomingText = '[Top-Level Comment on Post]';
        }
        db.activity.log(user.id, clientId, 'reply_sent', {
          reply_text: commentInput.trim(),
          incoming_text: incomingText,
          platform: selectedPostType,
          item_id: replyingTo?.id || selectedPostId,
          user_email: user.email || 'Desconocido'
        }).catch(err => console.error('Error logging comment/reply activity:', err));
      }

      setCommentInput('');
      setReplyingTo(null);
      await fetchComments(selectedPostId, selectedPostType);
    } catch (err: any) {
      console.error('Failed to submit comment/reply:', err);
      setSubmitError('Tu token de Meta es de solo lectura o no tiene los permisos necesarios para comentar/responder directamente. Podés hacer click en el botón de abajo para responder en la plataforma.');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Fetch all metrics
  useEffect(() => {
    if (!clientId) return;

    let active = true;
    setLoading(true);
    setError(null);
    setFbError(null);

    const loadData = async () => {
      try {
        const promises: Promise<any>[] = [];
        
        let igProfilePromise = Promise.resolve<any>(null);
        let igMediaPromise = Promise.resolve<any[]>([]);
        let fbProfilePromise = Promise.resolve<any>(null);
        let fbMediaPromise = Promise.resolve<any[]>([]);

        // Fetch Instagram
        if (igId) {
          igProfilePromise = metaAds.getInstagramProfile(igId).catch(err => {
            console.error('Error fetching Instagram Profile:', err);
            return null;
          });
          igMediaPromise = metaAds.getInstagramMedia(igId, 24).catch(err => {
            console.error('Error fetching Instagram Media:', err);
            return [];
          });
        }

        // Fetch Facebook Page Info & Feed
        if (fbPageId) {
          fbProfilePromise = metaAds.getFacebookPageInfo(fbPageId).catch(err => {
            console.error('Error fetching Facebook Page Info:', err);
            return null;
          });
          fbMediaPromise = metaAds.getFacebookPageFeed(fbPageId, 24).catch(err => {
            console.error('Error fetching Facebook Page Feed:', err);
            setFbError(err.message || String(err));
            return [];
          });
        }

        const [
          igProfileRes, igMediaRes,
          fbProfileRes, fbMediaRes
        ] = await Promise.all([
          igProfilePromise, igMediaPromise,
          fbProfilePromise, fbMediaPromise
        ]);

        if (!active) return;

        // Save Results
        setIgProfile(igProfileRes);
        const resolvedIgMedia = (igMediaRes as any)?.data || igMediaRes || [];
        setIgMedia(resolvedIgMedia);

        setFbProfile(fbProfileRes);
        const resolvedFbMedia = ((fbMediaRes as any)?.data || fbMediaRes || []).map((post: any) => ({
          ...post,
          source: post.source || post.attachments?.data?.[0]?.media?.source || null
        }));
        setFbMedia(resolvedFbMedia);

      } catch (err: any) {
        console.error('Failed to load social media data:', err);
        setError(err.message || 'Error al obtener los datos de redes sociales.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => { active = false; };
  }, [clientId, igId, fbPageId, refreshKey]);

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

  // IntersectionObserver for Instagram feed sentinel (must be after filteredMedia useMemo)
  useEffect(() => {
    if (!igSentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleIgCount(prev => prev + 12);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(igSentinelRef.current);
    return () => observer.disconnect();
  }, [filteredMedia]);

  // IntersectionObserver for Facebook feed sentinel (must be after filteredFbMedia useMemo)
  useEffect(() => {
    if (!fbSentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleFbCount(prev => prev + 12);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(fbSentinelRef.current);
    return () => observer.disconnect();
  }, [filteredFbMedia]);


  const igEngagementRate = useMemo(() => {
    if (!igProfile || !igProfile.followers_count || !igMedia.length) return 0;
    const totalInteractions = igMedia.reduce((sum, item) => sum + (item.like_count || 0) + (item.comments_count || 0), 0);
    const avgInteractionsPerPost = totalInteractions / igMedia.length;
    return (avgInteractionsPerPost / igProfile.followers_count) * 100;
  }, [igProfile, igMedia]);

  // FB Engagement Rate
  const fbEngagementRate = useMemo(() => {
    if (!fbProfile || !(fbProfile.followers_count || fbProfile.fan_count) || !fbMedia.length) return 0;
    const totalInteractions = fbMedia.reduce((sum, item) => {
      const likesCount = item.likes?.summary?.total_count || 0;
      const commentsCount = item.comments?.summary?.total_count || 0;
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
    <div className="space-y-6 md:space-y-8 w-full pt-6 px-4 md:px-6 lg:px-8 animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div>
          <h1 className="text-[26px] md:text-[30px] font-black tracking-tight text-zinc-900 dark:text-white leading-none flex items-center gap-2">
            Rendimiento Orgánico
          </h1>
          <p className="text-[12.5px] text-zinc-400 font-bold mt-1.5 flex items-center gap-1.5">
            Publicaciones, interacciones y métricas clave de tus perfiles sociales en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab Selector Buttons */}
          <div className="flex items-center gap-1.5 bg-zinc-150/80 dark:bg-zinc-800/60 p-1 rounded-2xl border border-zinc-250/20 dark:border-zinc-700/60">
            <button
              onClick={() => setActiveTab('instagram')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-black transition-all ${
                activeTab === 'instagram'
                  ? 'bg-pink-500 text-white shadow-md shadow-pink-500/20'
                  : 'text-zinc-550 hover:text-zinc-850 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'
              }`}
            >
              <Instagram className="w-4 h-4" />
              Instagram
            </button>
            <button
              onClick={() => setActiveTab('facebook')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-black transition-all ${
                activeTab === 'facebook'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-zinc-555 hover:text-zinc-850 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'
              }`}
            >
              <span className="w-4 h-4 font-black flex items-center justify-center text-[16px] leading-none">f</span>
              Facebook
            </button>
          </div>

          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-250/60 dark:border-zinc-800 rounded-full text-[12px] font-black shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-colors disabled:opacity-50"
            title="Recargar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        </div>
      </div>

      {/* Main Container */}
      {loading ? (
        <div className="space-y-6">
          <EmailLoader 
            loading={loading} 
            color="#ec4899" 
            labels={['Cargando perfil de Instagram...', 'Obteniendo posts orgánicos...', 'Sincronizando feed de Facebook...']} 
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="aspect-square bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl animate-pulse" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-5 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-800 dark:text-red-400 text-[14.5px]">Error al obtener datos</h3>
            <p className="text-[13px] text-red-600 dark:text-red-500 mt-1">{error}</p>
          </div>
        </div>
      ) : !igId && !fbPageId ? (
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
              
              {!igId ? (
                <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm animate-in fade-in duration-200">
                  <Instagram className="w-12 h-12 text-zinc-400 mx-auto" />
                  <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Instagram no configurado</h3>
                  <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    Parece que la cuenta de Instagram no está configurada para este cliente. No puedo acceder a las publicaciones en este momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 md:space-y-8 animate-in fade-in duration-200">
                  
                  {/* Profile Bar */}
                  {igProfile && (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
                      <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                        {igProfile.profile_picture_url ? (
                          <img 
                            src={igProfile.profile_picture_url} 
                            alt={igUsername} 
                            className="w-16 h-16 rounded-full object-cover ring-2 ring-pink-500/30" 
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

                      <div className="flex gap-4 flex-wrap justify-center font-semibold">
                        <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center min-w-[90px]">
                          <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(igProfile.followers_count)}</p>
                          <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Seguidores</p>
                        </div>
                        <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center min-w-[90px]">
                          <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(igProfile.media_count)}</p>
                          <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Publicaciones</p>
                        </div>
                        <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center min-w-[90px]">
                          <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtPercent(igEngagementRate)}</p>
                          <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Engagement</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Feed Filters */}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700 p-0.5 rounded-xl">
                      {[
                        { id: 'all', label: 'Todo', icon: Instagram },
                        { id: 'IMAGE', label: 'Imágenes', icon: ImageIcon },
                        { id: 'VIDEO', label: 'Videos/Reels', icon: Video },
                        { id: 'CAROUSEL_ALBUM', label: 'Caruseles', icon: Layers }
                      ].map(f => {
                        const Icon = f.icon;
                        return (
                          <button
                            key={f.id}
                            onClick={() => setMediaFilter(f.id as any)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                              mediaFilter === f.id
                                ? 'bg-white dark:bg-zinc-900 text-zinc-850 dark:text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12.5px] text-zinc-400 font-bold">{filteredMedia.length} posts encontrados</p>
                  </div>

                  {/* Grid of posts */}
                  {filteredMedia.length === 0 ? (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-12 text-center">
                      <ImageIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                      <p className="text-[13.5px] font-bold text-zinc-550">No se encontraron publicaciones</p>
                      <p className="text-[12px] text-zinc-400 mt-1">Intentá cambiando el filtro o cargando más adelante.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                      {filteredMedia.slice(0, visibleIgCount).map((m: any) => {
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
                                    <img 
                                      src={m.media_type === 'VIDEO' ? (m.thumbnail_url || m.media_url) : (m.media_url || m.thumbnail_url)} 
                                      alt="" 
                                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" 
                                      loading="lazy"
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
                                            <span>{fmtNumber(m.comments_count || 0)}</span>
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
                                          <span>{fmtNumber(m.comments_count || 0)}</span>
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
                                  <span className="uppercase text-[9px] tracking-widest text-zinc-350 dark:text-zinc-555">{m.media_type}</span>
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
                                <div className="flex items-center gap-3 text-zinc-555 dark:text-zinc-400 text-[12px] font-bold">
                                  <span className="flex items-center gap-1 cursor-default"><Heart className="w-3.5 h-3.5 text-zinc-450" /> {m.like_count || 0}</span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openCommentsModal(m.id, m.permalink, 'instagram'); }}
                                    className="flex items-center gap-1 hover:text-pink-500 transition-colors cursor-pointer"
                                    title="Ver y responder comentarios"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-zinc-450" /> {m.comments_count || 0}
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

                </div>
              )}

            </div>
          )}

          {/* TAB 2: FACEBOOK ORGANICO */}
          {activeTab === 'facebook' && (
            <div className="space-y-6">
              
              {!fbPageId ? (
                <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm animate-in fade-in duration-200">
                  <span className="w-12 h-12 text-zinc-400 mx-auto font-black text-4xl flex items-center justify-center">f</span>
                  <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Facebook no configurado</h3>
                  <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    Parece que la página de Facebook no está configurada para este cliente. No puedo acceder al feed en este momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 md:space-y-8 animate-in fade-in duration-200">
                  
                  {/* Profile Bar */}
                  {fbProfile && (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
                      <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                        {fbProfile.picture?.data?.url ? (
                          <img 
                            src={fbProfile.picture.data.url} 
                            alt={fbProfile.name} 
                            className="w-16 h-16 rounded-full object-cover ring-2 ring-blue-500/30" 
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

                      <div className="flex gap-4 flex-wrap justify-center font-semibold">
                        <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center min-w-[90px]">
                          <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(fbProfile.followers_count || fbProfile.fan_count)}</p>
                          <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Seguidores</p>
                        </div>
                        <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center min-w-[90px]">
                          <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(fbProfile.fan_count)}</p>
                          <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Likes</p>
                        </div>
                        <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center min-w-[90px]">
                          <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtPercent(fbEngagementRate)}</p>
                          <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Engagement</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {fbError && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-4.5 rounded-3xl flex items-start gap-3 animate-in fade-in duration-200">
                      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-amber-800 dark:text-amber-400 text-[13.5px]">Error de permisos de Facebook</h4>
                        <p className="text-[12px] text-amber-600 dark:text-amber-500 mt-1 leading-relaxed">
                          No se pudo cargar el feed orgánico. Esto ocurre si el token de acceso del usuario no tiene los permisos necesarios de administrador sobre la página de Facebook del cliente:
                        </p>
                        <code className="block mt-2.5 p-2 bg-amber-100/60 dark:bg-amber-950/40 rounded-xl text-[11px] font-mono break-all text-amber-800 dark:text-amber-300">
                          {fbError}
                        </code>
                      </div>
                    </div>
                  )}

                  {/* Feed Filters */}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700 p-0.5 rounded-xl">
                      {[
                        { id: 'all', label: 'Todo', icon: MessageCircle },
                        { id: 'PHOTO', label: 'Con Fotos', icon: ImageIcon },
                        { id: 'TEXT', label: 'Solo Texto', icon: MessageSquare }
                      ].map(f => {
                        const Icon = f.icon;
                        return (
                          <button
                            key={f.id}
                            onClick={() => setFbMediaFilter(f.id as any)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                              fbMediaFilter === f.id
                                ? 'bg-white dark:bg-zinc-900 text-zinc-850 dark:text-white shadow-sm'
                                : 'text-zinc-550 hover:text-zinc-850 dark:hover:text-zinc-200'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12.5px] text-zinc-400 font-bold">{filteredFbMedia.length} posts encontrados</p>
                  </div>

                  {/* Grid of Facebook posts */}
                  {filteredFbMedia.length === 0 ? (
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-12 text-center">
                      <ImageIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                      <p className="text-[13.5px] font-bold text-zinc-550">No se encontraron publicaciones</p>
                      <p className="text-[12px] text-zinc-400 mt-1">Intentá cambiando el filtro o cargando más adelante.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                      {filteredFbMedia.slice(0, visibleFbCount).map((m: any) => {
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
                                  className="w-full h-full object-contain bg-black" 
                                />
                              ) : (
                                <div 
                                  onClick={() => openCommentsModal(m.id, m.permalink_url, 'facebook')}
                                  className="w-full h-full relative cursor-pointer"
                                  title="Ver comentarios"
                                >
                                  {m.full_picture ? (
                                    <img 
                                      src={m.full_picture} 
                                      alt="" 
                                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" 
                                      loading="lazy"
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
                                      <span>{fmtNumber(m.comments?.summary?.total_count || 0)}</span>
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
                                  <span className="uppercase text-[9px] tracking-widest text-zinc-350 dark:text-zinc-550">
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
                                <div className="flex items-center gap-3 text-zinc-555 dark:text-zinc-400 text-[12px] font-bold">
                                  <span className="flex items-center gap-1 cursor-default"><ThumbsUp className="w-3.5 h-3.5 text-zinc-450" /> {m.likes?.summary?.total_count || 0}</span>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); openCommentsModal(m.id, m.permalink_url, 'facebook'); }}
                                    className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                                    title="Ver y responder comentarios"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-zinc-450" /> {m.comments?.summary?.total_count || 0}
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
                  {visibleFbCount < filteredFbMedia.length && (
                    <div ref={fbSentinelRef} className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
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

        return (
          <div className="fixed inset-0 z-[350] flex justify-end animate-in fade-in duration-200">
            {/* Backdrop */}
            <div 
              onClick={closeCommentsModal}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            />
            
            {/* Slide-over panel container */}
            <div className="relative w-full max-w-4xl h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300 ease-out z-10">
              
              {/* Header */}
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/85 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="font-black text-zinc-900 dark:text-white text-[15px] flex items-center gap-1.5 leading-none">
                    {selectedPostType === 'instagram' ? (
                      <Instagram className="w-4 h-4 text-pink-500" />
                    ) : (
                      <span className="w-4 h-4 bg-blue-600 text-white font-bold rounded flex items-center justify-center text-[11px]">f</span>
                    )}
                    Comentarios del Post
                  </h3>
                  {selectedPostPermalink && (
                    <a 
                      href={selectedPostPermalink} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="inline-flex items-center gap-1 text-[11px] text-violet-500 font-bold hover:underline mt-1.5"
                    >
                      Ver original en la plataforma
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                <button 
                  onClick={closeCommentsModal}
                  className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-xl text-zinc-400 hover:text-zinc-655 dark:hover:text-zinc-200 transition-colors"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Split Body Container */}
              <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-5 h-full">
                
                {/* Column 1: Post Media Context (Left Side - 40% width on md/lg, hidden on mobile) */}
                <div className="hidden md:flex md:col-span-2 flex-col justify-start border-r border-zinc-150 dark:border-zinc-800 bg-zinc-50/15 dark:bg-zinc-950/10 p-5 overflow-y-auto h-full space-y-4">
                  {activePost ? (
                    <>
                      {/* Media Player */}
                      {activePost.media_type === 'VIDEO' || activePost.media_url?.includes('.mp4') || activePost.source ? (
                        <div className="rounded-2xl overflow-hidden bg-black border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm mx-auto w-full aspect-square relative flex items-center justify-center">
                          <video
                            src={activePost.media_url || activePost.source}
                            poster={activePost.thumbnail_url || activePost.full_picture}
                            controls
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (activePost.media_url || activePost.full_picture) ? (
                        <div className="rounded-2xl overflow-hidden bg-zinc-105 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm mx-auto w-full aspect-square relative flex items-center justify-center">
                          <img
                            src={activePost.media_url || activePost.full_picture}
                            alt="Contexto"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 aspect-square w-full flex flex-col items-center justify-center text-zinc-400 gap-1.5 p-4 text-center">
                          <ImageIcon className="w-8 h-8" />
                          <span className="text-[11.5px] font-bold">Publicación sin imagen/video</span>
                        </div>
                      )}

                      {/* Post Caption/Message */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Descripción del Post</span>
                        <div className="p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/80 rounded-2xl text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300 font-medium whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {activePost.caption || activePost.message || <span className="italic text-zinc-400">Sin descripción.</span>}
                        </div>
                      </div>

                      {/* Engagement Metrics */}
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-850/60 rounded-2xl text-center">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-0.5">Me gusta</span>
                          <span className="text-[14px] font-extrabold text-zinc-800 dark:text-zinc-200">{fmtNumber(activePost.like_count || activePost.likes?.summary?.total_count || 0)}</span>
                        </div>
                        <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-850/60 rounded-2xl text-center">
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-0.5">Comentarios</span>
                          <span className="text-[14px] font-extrabold text-zinc-800 dark:text-zinc-200">{fmtNumber(activePost.comments_count || activePost.comments?.summary?.total_count || 0)}</span>
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
                <div className="col-span-1 md:col-span-3 flex flex-col justify-between h-full overflow-hidden">
                  
                  {/* Comments List */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-zinc-50/10 dark:bg-zinc-950/5">
                    {loadingComments ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                        <p className="text-[12px] text-zinc-450 font-bold">Cargando comentarios...</p>
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center p-5">
                        <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2.5" />
                        <p className="text-[13.5px] font-bold text-zinc-550">Sin comentarios</p>
                        <p className="text-[11.5px] text-zinc-450 mt-1">Nadie comentó en esta publicación aún.</p>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {comments.some(isCommentPending) && (
                          <button
                            onClick={handleBulkDrafts}
                            disabled={bulkDraftsLoading}
                            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-violet-600 hover:bg-violet-750 text-white rounded-xl text-[12.5px] font-black transition-all shadow-md shadow-violet-500/10 cursor-pointer disabled:opacity-50"
                          >
                            {bulkDraftsLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                            Generar borradores con IA para todos ({comments.filter(isCommentPending).length})
                          </button>
                        )}

                        {comments.map((comment: any) => {
                          const commentUser = comment.username || comment.from?.name || 'Usuario';
                          const commentText = comment.text || comment.message || '';
                          const commentDate = comment.timestamp || comment.created_time;
                          const dateStr = commentDate
                            ? new Date(commentDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : '';
                          const isLiked = !!likedCommentIds[comment.id];
                          const isLiking = !!likingCommentIds[comment.id];
                          const isPending = isCommentPending(comment);
                          const showInlineForm = isPending || !!activeReplyCommentIds[comment.id];

                          return (
                            <div 
                              key={comment.id}
                              className="flex gap-3 items-start text-[12.5px] py-3 border-b border-zinc-150/60 dark:border-zinc-800/50 last:border-b-0"
                            >
                              {/* Avatar circle */}
                              <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-850 flex items-center justify-center font-bold text-[10px] text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                                {commentUser ? commentUser.slice(0,2).toUpperCase() : 'U'}
                              </div>

                              <div className="flex-1 min-w-0">
                                {/* Username and text inline */}
                                <div className="leading-snug break-words">
                                  <span className="font-extrabold text-zinc-900 dark:text-white mr-1.5">@{commentUser}</span>
                                  <span className="text-zinc-700 dark:text-zinc-100 font-medium">{commentText}</span>
                                </div>

                                {/* Meta row */}
                                <div className="flex items-center gap-3.5 mt-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold">
                                  <span>{dateStr}</span>
                                  {isPending && (
                                    <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                                      Pendiente
                                    </span>
                                  )}
                                  <button
                                    onClick={() => {
                                      setActiveReplyCommentIds(prev => ({ ...prev, [comment.id]: !prev[comment.id] }));
                                      setReplyingTo({ id: comment.id, username: commentUser });
                                    }}
                                    className="text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
                                  >
                                    Responder
                                  </button>
                                </div>

                                {/* Inline Form */}
                                {showInlineForm && (
                                  <form onSubmit={(e) => handleSubmitPerComment(e, comment.id)} className="mt-3.5 space-y-2 pt-3 border-t border-zinc-100 dark:border-zinc-850/40">
                                    <div className="flex gap-2">
                                      <AutoResizeTextarea
                                        placeholder={`Responder a @${commentUser}...`}
                                        value={commentReplies[comment.id] || ''}
                                        onChange={(e) => setCommentReplies(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                        className="flex-1 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl text-[12px] text-zinc-850 dark:text-zinc-200 placeholder:text-zinc-450 focus:outline-none focus:ring-1 focus:ring-violet-500 leading-normal"
                                        disabled={commentRepliesSubmitting[comment.id] || commentRepliesLoadingDraft[comment.id]}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleSingleCommentDraft(comment.id, commentText, commentUser)}
                                        disabled={commentRepliesLoadingDraft[comment.id] || commentRepliesSubmitting[comment.id]}
                                        className="px-2.5 py-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/25 dark:hover:bg-violet-900/40 text-violet-650 dark:text-violet-400 rounded-xl text-[11px] font-bold border border-violet-100/50 dark:border-violet-900/25 flex items-center justify-center cursor-pointer"
                                        title="Generar borrador con IA"
                                      >
                                        {commentRepliesLoadingDraft[comment.id] ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Sparkles className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                      <button
                                        type="submit"
                                        disabled={commentRepliesSubmitting[comment.id] || commentRepliesLoadingDraft[comment.id] || !commentReplies[comment.id]?.trim()}
                                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-750 text-white rounded-xl text-[11px] font-bold disabled:opacity-50 flex items-center justify-center cursor-pointer"
                                      >
                                        {commentRepliesSubmitting[comment.id] ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          'Enviar'
                                        )}
                                      </button>
                                    </div>
                                    {commentRepliesErrors[comment.id] && (
                                      <p className="text-[10px] text-red-500 font-semibold">{commentRepliesErrors[comment.id]}</p>
                                    )}
                                  </form>
                                )}

                                {/* Nested Replies */}
                                {comment.replies?.data && comment.replies.data.length > 0 && (
                                  <div className="pl-4 mt-3.5 space-y-3 border-l border-zinc-150 dark:border-zinc-800">
                                    {comment.replies.data.map((reply: any) => {
                                      const rDateStr = reply.timestamp || reply.created_time
                                        ? new Date(reply.timestamp || reply.created_time).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                        : '';
                                      const replyUser = reply.username || reply.from?.name || 'Página';
                                      const isPage = replyUser === igUsername || reply.from?.id === fbPageId;
                                      return (
                                        <div key={reply.id} className="flex gap-2.5 items-start text-[11.5px]">
                                          <div className="w-5.5 h-5.5 rounded-full bg-zinc-105 dark:bg-zinc-850 flex items-center justify-center font-bold text-[9px] text-zinc-500 dark:text-zinc-400 flex-shrink-0">
                                            {replyUser.slice(0,2).toUpperCase()}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="leading-snug break-words">
                                              <span className="font-extrabold text-zinc-800 dark:text-white mr-1.5">@{replyUser}</span>
                                              <span className="text-zinc-600 dark:text-zinc-200 font-medium">{reply.text || reply.message}</span>
                                            </div>
                                            <div className="text-[9px] text-zinc-400 mt-1 font-bold">{rDateStr}</div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Like Heart/ThumbsUp floating on the right side of the comment! */}
                              <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pr-1 select-none">
                                <button
                                  onClick={() => handleLikeComment(comment.id)}
                                  disabled={isLiking}
                                  className={`p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-850/60 transition-colors disabled:opacity-50 cursor-pointer ${
                                    isLiked 
                                      ? selectedPostType === 'instagram' 
                                        ? 'text-red-500' 
                                        : 'text-blue-600' 
                                      : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-350'
                                  }`}
                                  title={isLiked ? "Quitar me gusta" : "Dar me gusta"}
                                >
                                  {selectedPostType === 'instagram' ? (
                                    <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-red-500' : ''}`} />
                                  ) : (
                                    <ThumbsUp className={`w-3.5 h-3.5 ${isLiked ? 'fill-current text-blue-600' : ''}`} />
                                  )}
                                </button>
                                {comment.like_count > 0 && (
                                  <span className="text-[10px] text-zinc-400 font-bold leading-none">{comment.like_count}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Bottom Actions & Input */}
                  <div className="p-4 border-t border-zinc-150/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 space-y-3 flex-shrink-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {replyingTo ? (
                        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                          <span>Respondiendo a <strong>@{replyingTo.username}</strong></span>
                          <button 
                            onClick={() => setReplyingTo(null)}
                            className="text-red-500 hover:underline font-bold ml-1.5"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11.5px] text-zinc-400 font-bold">
                          Elegí un comentario para responder directamente.
                        </div>
                      )}

                      {replyingTo && (
                        <button
                          type="button"
                          onClick={generateSocialCommentDraft}
                          disabled={submittingReply || loadingDraft}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/25 dark:hover:bg-violet-900/40 text-violet-650 dark:text-violet-400 rounded-xl text-[11px] font-black border border-violet-100/50 dark:border-violet-900/25 transition-all shadow-sm cursor-pointer"
                        >
                          {loadingDraft ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          Borrador con IA (Algor)
                        </button>
                      )}
                    </div>

                    {submitError && (
                      <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed font-semibold">
                        <div className="flex items-start gap-1.5">
                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5 animate-bounce" />
                          <span>{submitError}</span>
                        </div>
                        {selectedPostPermalink && (
                          <a
                            href={selectedPostPermalink}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 w-full h-9 bg-amber-600 hover:bg-amber-700 text-white text-[11.5px] font-black rounded-xl transition-all flex items-center justify-center gap-1 shadow-sm shadow-amber-600/10 hover:scale-[1.01]"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                            Responder en la Plataforma
                          </a>
                        )}
                      </div>
                    )}

                    <form onSubmit={handleSubmitComment} className="flex gap-2">
                      <AutoResizeTextarea 
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder={replyingTo ? `Escribí tu respuesta...` : `Escribí tu comentario...`}
                        disabled={submittingReply}
                        className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-[13px] text-zinc-850 dark:text-zinc-100 placeholder:text-zinc-450 outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors shadow-inner font-medium leading-normal"
                      />
                      <button
                        type="submit"
                        disabled={submittingReply || !commentInput.trim()}
                        className="px-4.5 bg-violet-600 hover:bg-violet-750 disabled:opacity-50 text-white text-[12.5px] font-black rounded-xl transition-all flex items-center justify-center gap-1 flex-shrink-0 cursor-pointer shadow-md shadow-violet-600/15"
                      >
                        {submittingReply ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Enviar'
                        )}
                      </button>
                    </form>
                  </div>

                </div>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
