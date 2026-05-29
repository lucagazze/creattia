import React, { useEffect, useState, useMemo } from 'react';
import { 
  Instagram, Heart, MessageCircle, Image as ImageIcon, Video, Layers, Loader2, RefreshCw, X, 
  ArrowUpRight, AlertCircle, MessageSquare, CheckCircle2, Users, ThumbsUp, Share2, Inbox, Info
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { metaAds } from '../services/metaAds';
import EmailLoader from '../components/ui/EmailLoader';

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

export default function RedesSocialesPage() {
  const { isViewingAs, viewAsProfile } = useViewAs();
  const { profile: authProfile } = useAuth();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;

  const [refreshKey, setRefreshKey] = useState(0);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'inbox' | 'instagram' | 'facebook'>('inbox');

  // Loading and Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data States
  const [igProfile, setIgProfile] = useState<any>(null);
  const [igMedia, setIgMedia] = useState<any[]>([]);
  
  const [fbProfile, setFbProfile] = useState<any>(null);
  const [fbMedia, setFbMedia] = useState<any[]>([]);

  // Inbox States
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [inboxReplies, setInboxReplies] = useState<Record<string, string>>({});
  const [submittingInboxReply, setSubmittingInboxReply] = useState<Record<string, boolean>>({});
  const [inboxReplyErrors, setInboxReplyErrors] = useState<Record<string, string | null>>({});

  // UI Filters
  const [mediaFilter, setMediaFilter] = useState<'all' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'>('all');
  const [fbMediaFilter, setFbMediaFilter] = useState<'all' | 'PHOTO' | 'TEXT'>('all');
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string, boolean>>({});
  const [expandedFbCaptions, setExpandedFbCaptions] = useState<Record<string, boolean>>({});

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

  // Resolve IDs from client profile (stored in DB)
  const igId = (profile as any)?.ig_business_id;
  const igUsername = (profile as any)?.ig_username;
  const fbPageId = (profile as any)?.fb_page_id;
  const fbPageName = (profile as any)?.fb_page_name;
  const metaAccountId = (profile as any)?.meta_account_id;

  const fetchComments = async (postId: string, type: 'instagram' | 'facebook') => {
    setLoadingComments(true);
    setSubmitError(null);
    try {
      if (type === 'instagram') {
        const res = await metaAds.getInstagramMediaComments(postId);
        setComments(res.data || []);
      } else {
        const res = await metaAds.getFacebookPostComments(postId);
        // Normalize comments for Facebook to fit same rendering structure
        const normalized = (res.data || []).map((c: any) => ({
          id: c.id,
          username: c.from?.name || c.username || 'Usuario de Facebook',
          text: c.text || c.message || '',
          timestamp: c.timestamp || c.created_time,
          like_count: c.like_count || 0,
          replies: c.replies
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
        // Facebook replies and comments use replyToFacebookComment
        if (replyingTo) {
          await metaAds.replyToFacebookComment(replyingTo.id, commentInput.trim());
        } else {
          await metaAds.replyToFacebookComment(selectedPostId, commentInput.trim());
        }
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

  const handleInboxReply = async (e: React.FormEvent, item: any) => {
    e.preventDefault();
    const replyText = inboxReplies[item.id]?.trim();
    if (!replyText) return;

    setSubmittingInboxReply(prev => ({ ...prev, [item.id]: true }));
    setInboxReplyErrors(prev => ({ ...prev, [item.id]: null }));

    try {
      if (item.type === 'ig_dm' || item.type === 'fb_dm') {
        await metaAds.replyToConversation(item.id, replyText);
      } else if (item.type === 'ig_comment') {
        await metaAds.replyToInstagramComment(item.id, replyText);
      } else if (item.type === 'fb_comment' || item.type === 'ad_comment') {
        await metaAds.replyToFacebookComment(item.id, replyText);
      }

      // Resolve and remove item from list with transition
      setPendingItems(prev => prev.filter(p => p.id !== item.id));
      setInboxReplies(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    } catch (err: any) {
      console.error('Error replying from inbox:', err);
      setInboxReplyErrors(prev => ({
        ...prev,
        [item.id]: 'No se pudo enviar la respuesta. Puede que el token no tenga permisos de escritura o haya expirado. Intentá responder directamente en la plataforma.',
      }));
    } finally {
      setSubmittingInboxReply(prev => ({ ...prev, [item.id]: false }));
    }
  };

  // Fetch all metrics & build pending inbox
  useEffect(() => {
    if (!clientId) return;

    let active = true;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const promises: Promise<any>[] = [];
        
        let igProfilePromise = Promise.resolve<any>(null);
        let igMediaPromise = Promise.resolve<any[]>([]);
        let fbProfilePromise = Promise.resolve<any>(null);
        let fbMediaPromise = Promise.resolve<any[]>([]);
        let fbDMsPromise = Promise.resolve<any>(null);
        let igDMsPromise = Promise.resolve<any>(null);
        let adsPromise = Promise.resolve<any>(null);

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

        // Fetch Facebook Page Info & Feed & DMs
        if (fbPageId) {
          fbProfilePromise = metaAds.getFacebookPageInfo(fbPageId).catch(err => {
            console.error('Error fetching Facebook Page Info:', err);
            return null;
          });
          fbMediaPromise = metaAds.getFacebookPageFeed(fbPageId, 24).catch(err => {
            console.error('Error fetching Facebook Page Feed:', err);
            return [];
          });
          fbDMsPromise = metaAds.getPageConversations(fbPageId, 'messenger').catch(err => {
            console.error('Error fetching Facebook DMs:', err);
            return null;
          });
          igDMsPromise = metaAds.getPageConversations(fbPageId, 'instagram').catch(err => {
            console.error('Error fetching Instagram DMs via Page:', err);
            return null;
          });
        }

        // Fetch Ads to lookup creative comments
        if (metaAccountId) {
          adsPromise = metaAds.getAccountAds(metaAccountId).catch(err => {
            console.error('Error fetching Account Ads:', err);
            return null;
          });
        }

        const [
          igProfileRes, igMediaRes,
          fbProfileRes, fbMediaRes,
          fbDMsRes, igDMsRes,
          adsRes
        ] = await Promise.all([
          igProfilePromise, igMediaPromise,
          fbProfilePromise, fbMediaPromise,
          fbDMsPromise, igDMsPromise,
          adsPromise
        ]);

        if (!active) return;

        // Save Results
        setIgProfile(igProfileRes);
        const resolvedIgMedia = igMediaRes?.data || igMediaRes || [];
        setIgMedia(resolvedIgMedia);

        setFbProfile(fbProfileRes);
        const resolvedFbMedia = fbMediaRes?.data || fbMediaRes || [];
        setFbMedia(resolvedFbMedia);

        // Process unified pending inbox
        const inboxItems: any[] = [];

        // 1. Instagram Direct Messages (Unread)
        if (igDMsRes?.data) {
          igDMsRes.data.forEach((conv: any) => {
            if (conv.unread_count > 0) {
              const lastMsg = conv.messages?.data?.[0];
              const participant = conv.participants?.data?.find((p: any) => p.id !== fbPageId);
              inboxItems.push({
                id: conv.id,
                type: 'ig_dm',
                platform: 'instagram',
                username: participant?.name || lastMsg?.from?.username || 'Usuario de Instagram',
                text: lastMsg?.message || '(Mensaje de voz o archivo de imagen)',
                timestamp: lastMsg?.created_time || conv.updated_time,
                rawItem: conv,
              });
            }
          });
        }

        // 2. Facebook Messenger Messages (Unread)
        if (fbDMsRes?.data) {
          fbDMsRes.data.forEach((conv: any) => {
            if (conv.unread_count > 0) {
              const lastMsg = conv.messages?.data?.[0];
              const participant = conv.participants?.data?.find((p: any) => p.id !== fbPageId);
              inboxItems.push({
                id: conv.id,
                type: 'fb_dm',
                platform: 'facebook',
                username: participant?.name || lastMsg?.from?.name || 'Usuario de Messenger',
                text: lastMsg?.message || '(Mensaje de voz o archivo de imagen)',
                timestamp: lastMsg?.created_time || conv.updated_time,
                rawItem: conv,
              });
            }
          });
        }

        // 3. Unanswered IG Organic Comments
        resolvedIgMedia.forEach((post: any) => {
          const commentsList = post.comments?.data || [];
          commentsList.forEach((comment: any) => {
            const isFromPage = comment.username === igUsername;
            const repliesList = comment.replies?.data || [];
            const hasPageReply = repliesList.some((reply: any) => reply.username === igUsername);

            if (!isFromPage && !hasPageReply) {
              inboxItems.push({
                id: comment.id,
                type: 'ig_comment',
                platform: 'instagram',
                username: comment.username,
                text: comment.text,
                timestamp: comment.timestamp,
                postCaption: post.caption,
                postThumbnail: post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url,
                permalink: post.permalink,
                rawItem: comment,
              });
            }
          });
        });

        // 4. Unanswered FB Organic Comments
        resolvedFbMedia.forEach((post: any) => {
          const commentsList = post.comments?.data || [];
          commentsList.forEach((comment: any) => {
            const isFromPage = comment.from?.id === fbPageId;
            const repliesList = comment.replies?.data || [];
            const hasPageReply = repliesList.some((reply: any) => reply.from?.id === fbPageId || reply.username === igUsername);

            if (!isFromPage && !hasPageReply) {
              inboxItems.push({
                id: comment.id,
                type: 'fb_comment',
                platform: 'facebook',
                username: comment.from?.name || comment.username || 'Usuario de Facebook',
                text: comment.message,
                timestamp: comment.created_time,
                postMessage: post.message,
                postThumbnail: post.full_picture,
                permalink: post.permalink_url,
                rawItem: comment,
              });
            }
          });
        });

        // 5. Unanswered Meta Ads Comments (Active campaigns only)
        if (adsRes?.data) {
          const activeAds = adsRes.data.filter((ad: any) => ad.status === 'ACTIVE' && ad.creative?.effective_object_story_id);
          const activeStoryIds = Array.from(new Set(activeAds.map((ad: any) => ad.creative.effective_object_story_id))) as string[];
          
          if (activeStoryIds.length > 0) {
            const adCommentsPromises = activeStoryIds.map(async (storyId) => {
              try {
                const res = await metaAds.getAdCreativeComments(storyId);
                const adForStory = activeAds.find((ad: any) => ad.creative.effective_object_story_id === storyId);
                return {
                  storyId,
                  adName: adForStory?.name || 'Anuncio',
                  comments: res?.data || [],
                  adPermalink: adForStory?.creative?.instagram_permalink_url || adForStory?.preview_shareable_link
                };
              } catch (err) {
                console.error(`Error fetching comments for story ID ${storyId}:`, err);
                return { storyId, adName: 'Anuncio', comments: [], adPermalink: null };
              }
            });

            const adCommentsResults = await Promise.all(adCommentsPromises);
            
            adCommentsResults.forEach((result) => {
              result.comments.forEach((comment: any) => {
                const isFromPage = comment.from?.id === fbPageId || comment.username === igUsername;
                const repliesList = comment.replies?.data || [];
                const hasPageReply = repliesList.some((reply: any) => reply.from?.id === fbPageId || reply.username === igUsername);

                if (!isFromPage && !hasPageReply) {
                  inboxItems.push({
                    id: comment.id,
                    type: 'ad_comment',
                    platform: comment.username ? 'instagram' : 'facebook',
                    username: comment.username || comment.from?.name || 'Usuario de Ads',
                    text: comment.text || comment.message || '',
                    timestamp: comment.timestamp || comment.created_time,
                    adName: result.adName,
                    postThumbnail: null,
                    permalink: result.adPermalink,
                    rawItem: comment,
                  });
                }
              });
            });
          }
        }

        // Sort items by date descending (newest first)
        inboxItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setPendingItems(inboxItems);

      } catch (err: any) {
        console.error('Failed to load social media data:', err);
        setError(err.message || 'Error al obtener los datos de redes sociales.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => { active = false; };
  }, [clientId, igId, fbPageId, metaAccountId, refreshKey]);

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

  // IG Engagement Rate
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
    <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div>
          <h1 className="text-[26px] md:text-[30px] font-black tracking-tight text-zinc-900 dark:text-white leading-none flex items-center gap-2">
            Social Hub
          </h1>
          <p className="text-[12.5px] text-zinc-400 font-bold mt-1.5 flex items-center gap-1.5">
            <Inbox className="w-3.5 h-3.5 text-violet-500" />
            Inbox unificado, métricas y gestión de perfiles de Meta en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab Selector Buttons */}
          <div className="flex items-center gap-1 bg-zinc-150/80 dark:bg-zinc-800/60 p-1 rounded-2xl border border-zinc-250/20 dark:border-zinc-700/60">
            <button
              onClick={() => setActiveTab('inbox')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-black transition-all ${
                activeTab === 'inbox'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-850 dark:text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200'
              }`}
            >
              <Inbox className="w-3.5 h-3.5 text-violet-500" />
              Pendientes
              {pendingItems.length > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9px] font-black bg-red-500 text-white rounded-full">
                  {pendingItems.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('instagram')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-black transition-all ${
                activeTab === 'instagram'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-850 dark:text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200'
              }`}
            >
              <Instagram className="w-3.5 h-3.5 text-pink-500" />
              Instagram
            </button>
            <button
              onClick={() => setActiveTab('facebook')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-black transition-all ${
                activeTab === 'facebook'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-850 dark:text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200'
              }`}
            >
              <span className="w-3.5 h-3.5 text-blue-500 font-black flex items-center justify-center text-[14px]">f</span>
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
            color="#8b5cf6" 
            labels={['Cargando DMs de Instagram y Facebook...', 'Buscando comentarios orgánicos...', 'Consultando comentarios en Meta Ads...', 'Sincronizando feed de publicaciones...']} 
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(n => (
              <div key={n} className="h-48 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl animate-pulse" />
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
          <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Redes sociales no vinculadas</h3>
          <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
            Este cliente no tiene una cuenta de Instagram o Página de Facebook vinculada. Habilitalo en la sección de Gestión de Clientes seleccionando su cuenta descubierta de Meta.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* TAB 1: BANDEJA DE PENDIENTES */}
          {activeTab === 'inbox' && (
            <div className="space-y-6">
              
              {/* Inbox Summary Banner */}
              <div className="flex items-center justify-between p-4 bg-violet-50/50 dark:bg-violet-950/10 border border-violet-100/50 dark:border-violet-900/20 rounded-2xl">
                <div className="flex items-center gap-2 text-violet-750 dark:text-violet-400">
                  <Info className="w-4 h-4" />
                  <p className="text-[12px] font-bold">
                    El inbox se alimenta de DMs sin leer y comentarios donde la página no ha respondido. Al enviar una respuesta rápida, el item se resuelve y desaparece.
                  </p>
                </div>
                {!fbPageId && (
                  <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                    FB Sin Sincronizar
                  </span>
                )}
              </div>

              {pendingItems.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4">
                  <div className="w-16 h-16 bg-green-50 dark:bg-green-950/20 rounded-full flex items-center justify-center mx-auto text-green-500">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">¡Al día!</h3>
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400 font-semibold leading-relaxed">
                    No tenés mensajes sin leer ni comentarios pendientes de respuesta en Instagram, Facebook o Campañas de Ads.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {pendingItems.map((item: any) => (
                    <div 
                      key={item.id} 
                      className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 shadow-sm space-y-4 hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 flex flex-col justify-between"
                    >
                      <div className="space-y-4">
                        {/* Header: Platform, Type, and Time */}
                        <div className="flex items-center justify-between border-b border-zinc-150/40 dark:border-zinc-850/40 pb-3">
                          <div className="flex items-center gap-2">
                            {item.platform === 'instagram' ? (
                              <div className="w-8 h-8 bg-pink-50 dark:bg-pink-950/20 rounded-full flex items-center justify-center text-pink-500">
                                <Instagram className="w-4 h-4" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center text-blue-500">
                                <span className="font-black text-sm">f</span>
                              </div>
                            )}
                            <div>
                              <span className="text-[12px] font-black text-zinc-800 dark:text-zinc-250 block leading-tight">
                                {item.type === 'ig_dm' && 'Mensaje Directo (Instagram)'}
                                {item.type === 'fb_dm' && 'Mensaje de Messenger (Facebook)'}
                                {item.type === 'ig_comment' && 'Comentario Orgánico (Instagram)'}
                                {item.type === 'fb_comment' && 'Comentario Orgánico (Facebook)'}
                                {item.type === 'ad_comment' && `Comentario en Anuncio (Ads)`}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-bold block mt-0.5">
                                {new Date(item.timestamp).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          
                          {/* Post Thumbnail if it's a comment */}
                          {(item.postThumbnail || item.type === 'ad_comment') && (
                            <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-750 flex-shrink-0">
                              {item.postThumbnail ? (
                                <img src={item.postThumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center text-violet-500">
                                  <Layers className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* User and Message Body */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-black text-zinc-900 dark:text-white">
                              @{item.username}
                            </span>
                            {item.type === 'ad_comment' && (
                              <span className="bg-violet-50 text-violet-600 dark:bg-violet-950/20 dark:text-violet-400 text-[9px] font-bold px-1.5 py-0.5 rounded">
                                Ads: {item.adName || 'Campaña'}
                              </span>
                            )}
                          </div>
                          
                          <p className="text-[13px] text-zinc-700 dark:text-zinc-300 leading-relaxed font-semibold italic bg-zinc-50 dark:bg-zinc-950/30 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-850/50">
                            "{item.text}"
                          </p>

                          {/* Post caption context snippet */}
                          {(item.postCaption || item.postMessage) && (
                            <p className="text-[11px] text-zinc-400 font-semibold truncate mt-1">
                              En: {item.postCaption || item.postMessage}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions: Direct reply box */}
                      <div className="space-y-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-850/40 mt-4">
                        {inboxReplyErrors[item.id] && (
                          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-[11px] text-amber-700 dark:text-amber-400 font-semibold flex flex-col gap-2">
                            <div className="flex items-start gap-1.5">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                              <span>{inboxReplyErrors[item.id]}</span>
                            </div>
                            {item.permalink && (
                              <a
                                href={item.permalink}
                                target="_blank"
                                rel="noreferrer"
                                className="self-start inline-flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black rounded-lg transition-all shadow-sm"
                              >
                                Responder en Plataforma
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        )}

                        <form onSubmit={(e) => handleInboxReply(e, item)} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Escribí una respuesta rápida..."
                            value={inboxReplies[item.id] || ''}
                            onChange={(e) => setInboxReplies(prev => ({ ...prev, [item.id]: e.target.value }))}
                            disabled={submittingInboxReply[item.id]}
                            className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl px-3.5 py-1.5 text-[12px] text-zinc-850 dark:text-zinc-100 placeholder:text-zinc-450 focus:bg-white dark:focus:bg-zinc-950 focus:border-violet-500 outline-none transition-all shadow-inner"
                          />
                          <button
                            type="submit"
                            disabled={submittingInboxReply[item.id] || !(inboxReplies[item.id] || '').trim()}
                            className="px-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[12px] font-black rounded-xl transition-all flex items-center justify-center gap-1 shadow-md shadow-violet-600/10 cursor-pointer"
                          >
                            {submittingInboxReply[item.id] ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'Resolver'
                            )}
                          </button>
                        </form>
                        
                        {item.permalink && (
                          <div className="flex justify-end">
                            <a
                              href={item.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] font-bold text-violet-550 hover:text-violet-750 dark:hover:text-violet-400 flex items-center gap-0.5 hover:underline"
                            >
                              Ver original
                              <ArrowUpRight className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* TAB 2: INSTAGRAM ORGANICO */}
          {activeTab === 'instagram' && (
            <div className="space-y-6">
              
              {!igId ? (
                <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm">
                  <Instagram className="w-12 h-12 text-zinc-400 mx-auto" />
                  <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Instagram no configurado</h3>
                  <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    Parece que la cuenta de Instagram no está configurada para este cliente. No puedo acceder a las publicaciones en este momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 md:space-y-8">
                  
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
                                ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
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
                      <p className="text-[13.5px] font-bold text-zinc-500">No se encontraron publicaciones</p>
                      <p className="text-[12px] text-zinc-400 mt-1">Intentá cambiando el filtro o cargando más adelante.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
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
                            <div 
                              onClick={() => openCommentsModal(m.id, m.permalink, 'instagram')}
                              className="aspect-square w-full bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-zinc-100 dark:border-zinc-800/60 cursor-pointer"
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
                              
                              {/* Media Type Indicator Icon */}
                              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white p-1.5 rounded-lg text-xs flex items-center justify-center">
                                {m.media_type === 'VIDEO' && <Video className="w-3.5 h-3.5" />}
                                {m.media_type === 'CAROUSEL_ALBUM' && <Layers className="w-3.5 h-3.5" />}
                                {m.media_type === 'IMAGE' && <ImageIcon className="w-3.5 h-3.5" />}
                              </div>

                              {/* Hover statistics overlay */}
                              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-6 text-white font-bold select-none">
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

                            {/* Description & metadata */}
                            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
                                  <span>{dateStr}</span>
                                  <span className="uppercase text-[9px] tracking-widest text-zinc-350 dark:text-zinc-550">{m.media_type}</span>
                                </div>

                                {m.caption && (
                                  <p className="text-[12.5px] text-zinc-750 dark:text-zinc-300 leading-snug break-words font-medium">
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
                                    onClick={() => openCommentsModal(m.id, m.permalink, 'instagram')}
                                    className="flex items-center gap-1 hover:text-pink-500 transition-colors cursor-pointer"
                                    title="Ver y responder comentarios"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-zinc-450" /> {m.comments_count || 0}
                                  </button>
                                </div>
                                
                                {m.permalink && (
                                  <a 
                                    href={m.permalink} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-[11px] font-black text-pink-600 dark:text-pink-400 hover:text-pink-850 dark:hover:text-pink-300 flex items-center gap-1 hover:underline"
                                  >
                                    Abrir post
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </a>
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

          {/* TAB 3: FACEBOOK ORGANICO */}
          {activeTab === 'facebook' && (
            <div className="space-y-6">
              
              {!fbPageId ? (
                <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-8 rounded-3xl text-center max-w-lg mx-auto space-y-4 shadow-sm">
                  <span className="w-12 h-12 text-zinc-400 mx-auto font-black text-4xl flex items-center justify-center">f</span>
                  <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Facebook no configurado</h3>
                  <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
                    Parece que la página de Facebook no está configurada para este cliente. No puedo acceder al feed en este momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 md:space-y-8">
                  
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
                                ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
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
                      <p className="text-[13.5px] font-bold text-zinc-500">No se encontraron publicaciones</p>
                      <p className="text-[12px] text-zinc-400 mt-1">Intentá cambiando el filtro o cargando más adelante.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
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
                            {/* Photo / Thumbnail Container */}
                            <div 
                              onClick={() => openCommentsModal(m.id, m.permalink_url, 'facebook')}
                              className="aspect-square w-full bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-zinc-100 dark:border-zinc-800/60 cursor-pointer"
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

                              {/* Hover statistics overlay */}
                              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-6 text-white font-bold select-none">
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

                            {/* Description & metadata */}
                            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
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
                                    onClick={() => openCommentsModal(m.id, m.permalink_url, 'facebook')}
                                    className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
                                    title="Ver y responder comentarios"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5 text-zinc-450" /> {m.comments?.summary?.total_count || 0}
                                  </button>
                                </div>
                                
                                {m.permalink_url && (
                                  <a 
                                    href={m.permalink_url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-[11px] font-black text-blue-600 dark:text-blue-400 hover:text-blue-850 dark:hover:text-blue-300 flex items-center gap-1 hover:underline"
                                  >
                                    Abrir post
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </a>
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

        </div>
      )}

      {/* Slide-Over Comments Panel (Unified for Instagram & Facebook) */}
      {selectedPostId && (
        <div className="fixed inset-0 z-[350] flex justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            onClick={closeCommentsModal}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
          />
          
          {/* Slide-over panel container */}
          <div className="relative w-full max-w-md md:max-w-lg h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300 ease-out z-10">
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

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-zinc-50/20 dark:bg-zinc-950/20">
              {loadingComments ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                  <p className="text-[12px] text-zinc-450 font-bold">Cargando comentarios...</p>
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-5">
                  <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2.5" />
                  <p className="text-[13.5px] font-bold text-zinc-500">Sin comentarios</p>
                  <p className="text-[11.5px] text-zinc-450 mt-1">Nadie comentó en esta publicación aún.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment: any) => {
                    const dateStr = comment.timestamp
                      ? new Date(comment.timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : '';
                    return (
                      <div 
                        key={comment.id}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 p-4 rounded-2xl shadow-sm space-y-2.5 hover:border-zinc-350 dark:hover:border-zinc-700/60 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[13px] text-zinc-800 dark:text-zinc-200">@{comment.username}</span>
                          <span className="text-[10px] text-zinc-400">{dateStr}</span>
                        </div>
                        <p className="text-[12.5px] text-zinc-705 dark:text-zinc-300 leading-snug break-words font-medium">{comment.text}</p>
                        
                        <div className="flex items-center justify-between pt-1.5 border-t border-zinc-50 dark:border-zinc-850/40">
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                            {selectedPostType === 'instagram' ? <Heart className="w-3 h-3 text-zinc-400" /> : <ThumbsUp className="w-3 h-3 text-zinc-400" />}
                            {comment.like_count || 0}
                          </span>
                          <button
                            onClick={() => setReplyingTo({ id: comment.id, username: comment.username })}
                            className="text-[11px] font-bold text-violet-550 hover:text-violet-750 dark:hover:text-violet-400 hover:underline cursor-pointer"
                          >
                            Responder
                          </button>
                        </div>

                        {/* Nested Replies */}
                        {comment.replies?.data && comment.replies.data.length > 0 && (
                          <div className="pl-4 mt-2 space-y-2 border-l-2 border-zinc-100 dark:border-zinc-800">
                            {comment.replies.data.map((reply: any) => {
                              const rDateStr = reply.timestamp || reply.created_time
                                ? new Date(reply.timestamp || reply.created_time).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                                : '';
                              return (
                                <div key={reply.id} className="bg-zinc-50 dark:bg-zinc-950/40 p-2.5 rounded-xl text-[11.5px] space-y-1">
                                  <div className="flex items-center justify-between font-bold text-zinc-600 dark:text-zinc-400">
                                    <span>@{reply.username || reply.from?.name || 'Página'}</span>
                                    <span className="text-[9px] text-zinc-400 font-normal">{rDateStr}</span>
                                  </div>
                                  <p className="text-zinc-650 dark:text-zinc-300 leading-snug font-medium">{reply.text || reply.message}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Input Area */}
            <div className="p-4 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/40 space-y-3 flex-shrink-0">
              {/* Replying indicator */}
              {replyingTo && (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30 text-[11.5px] text-violet-600 dark:text-violet-400 font-bold animate-in fade-in duration-100">
                  <span>Respondiendo a @{replyingTo.username}</span>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="p-0.5 hover:bg-violet-150 dark:hover:bg-violet-900/30 rounded-lg text-violet-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Error messages / Fallback */}
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

              {/* Input form */}
              <form onSubmit={handleSubmitComment} className="flex gap-2">
                <input 
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder={replyingTo ? `Escribí tu respuesta...` : `Escribí tu comentario...`}
                  disabled={submittingReply}
                  className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-[13px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors shadow-inner font-medium"
                />
                <button
                  type="submit"
                  disabled={submittingReply || !commentInput.trim()}
                  className="px-4.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[12.5px] font-black rounded-xl transition-all flex items-center justify-center gap-1 flex-shrink-0 cursor-pointer shadow-md shadow-violet-600/15"
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
      )}

    </div>
  );
}
