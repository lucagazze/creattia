import React, { useEffect, useState, useMemo } from 'react';
import { 
  Instagram, Heart, MessageCircle, Image as ImageIcon, Video, Layers, Loader2, RefreshCw, X, 
  ArrowUpRight, AlertCircle, MessageSquare
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { metaAds, CLIENT_META_MAP } from '../services/metaAds';
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
  
  // Data States
  const [loading, setLoading] = useState(true);
  const [igProfile, setIgProfile] = useState<any>(null);
  const [igMedia, setIgMedia] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // UI Filters
  const [mediaFilter, setMediaFilter] = useState<'all' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'>('all');
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string, boolean>>({});

  // Comments modal/side-sheet state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostPermalink, setSelectedPostPermalink] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);

  // Resolve IDs
  const igId = clientId ? CLIENT_META_MAP[clientId]?.igId : undefined;
  const igUsername = clientId ? CLIENT_META_MAP[clientId]?.username : undefined;

  const fetchComments = async (postId: string) => {
    setLoadingComments(true);
    setSubmitError(null);
    try {
      const res = await metaAds.getInstagramMediaComments(postId);
      setComments(res.data || []);
    } catch (err: any) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const openCommentsModal = (postId: string, permalink: string) => {
    setSelectedPostId(postId);
    setSelectedPostPermalink(permalink);
    setReplyingTo(null);
    setCommentInput('');
    setSubmitError(null);
    fetchComments(postId);
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
      if (replyingTo) {
        await metaAds.replyToInstagramComment(replyingTo.id, commentInput.trim());
      } else {
        await metaAds.createInstagramMediaComment(selectedPostId, commentInput.trim());
      }
      setCommentInput('');
      setReplyingTo(null);
      await fetchComments(selectedPostId);
    } catch (err: any) {
      console.error('Failed to submit comment/reply:', err);
      setSubmitError('Tu token de Meta es de solo lectura o no tiene los permisos necesarios para comentar/responder directamente. Podés hacer click en el botón de abajo para responder en Instagram.');
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

    const loadData = async () => {
      try {
        if (igId) {
          const [profileRes, mediaRes] = await Promise.all([
            metaAds.getInstagramProfile(igId).catch(err => {
              console.error('Error fetching Instagram Profile:', err);
              return null;
            }),
            metaAds.getInstagramMedia(igId, 24).catch(err => {
              console.error('Error fetching Instagram Media:', err);
              return [];
            })
          ]);

          if (!active) return;
          setIgProfile(profileRes);
          setIgMedia(mediaRes?.data || mediaRes || []);
        } else {
          if (!active) return;
          setIgProfile(null);
          setIgMedia([]);
        }
      } catch (err: any) {
        console.error('Failed to load social media data:', err);
        setError(err.message || 'Error al obtener los datos de redes sociales.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => { active = false; };
  }, [clientId, igId, refreshKey]);

  // Filtered Instagram media list
  const filteredMedia = useMemo(() => {
    if (mediaFilter === 'all') return igMedia;
    return igMedia.filter(post => post.media_type === mediaFilter);
  }, [igMedia, mediaFilter]);

  // Computed Instagram Organic Engagement Rate
  const igEngagementRate = useMemo(() => {
    if (!igProfile || !igProfile.followers_count || !igMedia.length) return 0;
    const totalInteractions = igMedia.reduce((sum, item) => sum + (item.like_count || 0) + (item.comments_count || 0), 0);
    const avgInteractionsPerPost = totalInteractions / igMedia.length;
    return (avgInteractionsPerPost / igProfile.followers_count) * 100;
  }, [igProfile, igMedia]);

  const toggleCaption = (id: string) => {
    setExpandedCaptions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div>
          <h1 className="text-[26px] md:text-[30px] font-black tracking-tight text-zinc-900 dark:text-white leading-none">
            Instagram Orgánico
          </h1>
          <p className="text-[12.5px] text-zinc-400 font-bold mt-1.5 flex items-center gap-1.5">
            <Instagram className="w-3.5 h-3.5 text-pink-500" />
            Publicaciones, interacciones y gestión de comentarios en tiempo real.
          </p>
        </div>

        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="self-start md:self-auto flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full text-[12px] font-black shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-colors disabled:opacity-50"
          title="Recargar datos"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Recargar
        </button>
      </div>

      {/* Loader */}
      {loading ? (
        <div className="space-y-6">
          <EmailLoader 
            loading={loading} 
            color="#ec4899" 
            labels={['Cargando perfil de Instagram...', 'Obteniendo feed orgánico...', 'Cargando comentarios e interacciones...']} 
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
      ) : !igId ? (
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
                    <span className="bg-pink-50 text-pink-600 dark:bg-pink-950/20 dark:text-pink-400 px-2 py-0.5 rounded-full text-[10px] font-bold">Orgánico</span>
                  </div>
                  <p className="text-[12.5px] text-zinc-400 font-bold mt-0.5">{igProfile.name}</p>
                </div>
              </div>

              <div className="flex gap-4 flex-wrap justify-center">
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
            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700 p-0.5 rounded-xl">
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
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
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
                      onClick={() => openCommentsModal(m.id, m.permalink)}
                      className="aspect-square w-full bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-zinc-100 dark:border-zinc-800/60 cursor-pointer"
                      title="Ver comentarios"
                    >
                      {m.media_url || m.thumbnail_url ? (
                        <img 
                          src={m.media_url || m.thumbnail_url} 
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
                          <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-snug break-words">
                            {isExpanded ? m.caption : `${m.caption.slice(0, 80)}${hasLongCaption ? '...' : ''}`}
                            {hasLongCaption && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleCaption(m.id); }}
                                className="text-violet-500 font-bold hover:underline ml-1 cursor-pointer focus:outline-none"
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
                            onClick={() => openCommentsModal(m.id, m.permalink)}
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
                            className="text-[11px] font-black text-violet-600 dark:text-violet-400 hover:text-violet-850 dark:hover:text-violet-300 flex items-center gap-1 hover:underline"
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

      {/* Instagram Comments Slide-Over Panel */}
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
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-black text-zinc-900 dark:text-white text-[15px] flex items-center gap-1.5 leading-none">
                  <Instagram className="w-4 h-4 text-pink-500" />
                  Comentarios del Post
                </h3>
                {selectedPostPermalink && (
                  <a 
                    href={selectedPostPermalink} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center gap-1 text-[11px] text-violet-500 font-bold hover:underline mt-1.5"
                  >
                    Ver post original en Instagram
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
              </div>
              <button 
                onClick={closeCommentsModal}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-zinc-50/20 dark:bg-zinc-950/20">
              {loadingComments ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                  <p className="text-[12px] text-zinc-455 font-bold">Cargando comentarios...</p>
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-5">
                  <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2.5" />
                  <p className="text-[13.5px] font-bold text-zinc-500">Sin comentarios</p>
                  <p className="text-[11.5px] text-zinc-450 mt-1">Nadie comentó en esta publicación aún.</p>
                </div>
              ) : (
                <div className="space-y-3.5">
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
                        <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-snug break-words">{comment.text}</p>
                        
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-50 dark:border-zinc-850/40">
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                            <Heart className="w-3 h-3" /> {comment.like_count || 0}
                          </span>
                          <button
                            onClick={() => setReplyingTo({ id: comment.id, username: comment.username })}
                            className="text-[11px] font-bold text-violet-500 hover:text-violet-700 dark:hover:text-violet-400 hover:underline cursor-pointer"
                          >
                            Responder
                          </button>
                        </div>
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
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30 text-[11.5px] text-violet-600 dark:text-violet-400 font-bold">
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
                      className="mt-3.5 w-full h-9 bg-amber-600 hover:bg-amber-700 text-white text-[11.5px] font-black rounded-xl transition-all flex items-center justify-center gap-1 shadow-sm shadow-amber-600/10 hover:scale-[1.01]"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      Responder en Instagram
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
                  className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-[13px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors shadow-inner"
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
