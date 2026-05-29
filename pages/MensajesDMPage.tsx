import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  Instagram, Loader2, RefreshCw, AlertCircle, Inbox, Sparkles, Send,
  Search, MessageSquare, Clock, CheckCheck, Check, MessageCircle, X,
  ArrowUpRight, Heart, Play, Filter
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { metaAds } from '../services/metaAds';
import { db } from '../services/db';
import EmailLoader from '../components/ui/EmailLoader';

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
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
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

type InboxItem = {
  id: string;
  type: 'fb_dm' | 'ig_dm' | 'ig_comment' | 'fb_comment';
  platform: 'instagram' | 'facebook';
  username: string;
  lastMessage: string;
  timestamp: string;
  isPending: boolean;
  unread?: boolean;
  rawItem: any;
  // For comment threads:
  postCaption?: string;
  postThumbnail?: string;
  permalink?: string;
  comments?: any[];
  pendingCount?: number;
  totalCount?: number;
};

export default function MensajesDMPage() {
  const { isViewingAs, viewAsProfile } = useViewAs();
  const { profile: authProfile, user } = useAuth();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;

  const fbPageId = (profile as any)?.fb_page_id;
  const igId = (profile as any)?.ig_business_id;
  const igUsername = (profile as any)?.ig_username;

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'facebook'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'responded'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'dms' | 'comments'>('all');

  const [conversations, setConversations] = useState<InboxItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);

  // DM chat state
  const [convMessages, setConvMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  // Comment thread state
  const [commentReplies, setCommentReplies] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});
  const [commentErrors, setCommentErrors] = useState<Record<string, string | null>>({});
  const [loadingCommentDraft, setLoadingCommentDraft] = useState<Record<string, boolean>>({});
  const [openReplyIds, setOpenReplyIds] = useState<Record<string, boolean>>({});
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fbPageId) localStorage.setItem('active_fb_page_id', fbPageId);
  }, [fbPageId]);

  // Auto-scroll chat
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [convMessages]);

  const isCommentPending = useCallback((comment: any) => {
    const isFromPage = comment.username === igUsername || comment.from?.id === fbPageId;
    if (isFromPage) return false;
    const replies = comment.replies?.data || [];
    if (replies.length === 0) return true;
    const sorted = [...replies].sort(
      (a, b) => new Date(a.timestamp || a.created_time).getTime() - new Date(b.timestamp || b.created_time).getTime()
    );
    const latest = sorted[sorted.length - 1];
    return !(latest.username === igUsername || latest.from?.id === fbPageId);
  }, [igUsername, fbPageId]);

  // Load all data
  useEffect(() => {
    if (!fbPageId && !igId) return;
    let active = true;
    setLoading(true);
    setErrors([]);

    const load = async () => {
      try {
        const errs: string[] = [];

        const [fbDMs, igDMs, igMedia, fbMedia] = await Promise.all([
          fbPageId
            ? metaAds.getPageConversations(fbPageId, 'messenger').catch(err => {
                errs.push(`Facebook DMs: ${err.message}`);
                return null;
              })
            : Promise.resolve(null),
          fbPageId
            ? metaAds.getPageConversations(fbPageId, 'instagram').catch(err => {
                // silently ignore — IG DM API often returns empty or requires advanced access
                return null;
              })
            : Promise.resolve(null),
          igId
            ? metaAds.getInstagramMedia(igId, 30).catch(err => {
                errs.push(`Instagram publicaciones: ${err.message}`);
                return [];
              })
            : Promise.resolve([]),
          fbPageId
            ? metaAds.getFacebookPageFeed(fbPageId, 24).catch(err => {
                errs.push(`Facebook publicaciones: ${err.message}`);
                return [];
              })
            : Promise.resolve([]),
        ]);

        if (!active) return;

        const items: InboxItem[] = [];

        // Facebook Messenger DMs
        if (fbDMs?.data) {
          fbDMs.data.forEach((conv: any) => {
            const lastMsg = conv.messages?.data?.[0];
            const participant = conv.participants?.data?.find((p: any) => p.id !== fbPageId);
            const isFromMe = lastMsg?.from?.id === fbPageId;
            items.push({
              id: conv.id,
              type: 'fb_dm',
              platform: 'facebook',
              username: participant?.name || lastMsg?.from?.name || 'Usuario de Messenger',
              lastMessage: lastMsg?.message || '(Archivo adjunto)',
              timestamp: lastMsg?.created_time || conv.updated_time,
              isPending: !isFromMe,
              unread: conv.unread_count > 0,
              rawItem: conv,
            });
          });
        }

        // Instagram DMs (if available)
        if (igDMs?.data?.length) {
          igDMs.data.forEach((conv: any) => {
            const lastMsg = conv.messages?.data?.[0];
            const participant = conv.participants?.data?.find((p: any) => p.id !== fbPageId);
            const isFromMe = lastMsg?.from?.id === fbPageId;
            items.push({
              id: conv.id,
              type: 'ig_dm',
              platform: 'instagram',
              username: participant?.name || lastMsg?.from?.username || 'Usuario de Instagram',
              lastMessage: lastMsg?.message || '(Archivo adjunto)',
              timestamp: lastMsg?.created_time || conv.updated_time,
              isPending: !isFromMe,
              unread: conv.unread_count > 0,
              rawItem: conv,
            });
          });
        }

        // Instagram Comments (grouped by post)
        const resolvedIgMedia = (igMedia as any)?.data || igMedia || [];
        resolvedIgMedia.forEach((post: any) => {
          const allComments = post.comments?.data || [];
          const userComments = allComments.filter((c: any) => c.username !== igUsername);
          if (userComments.length === 0) return;
          const pendingList = userComments.filter((c: any) => isCommentPending(c));
          let latestTimestamp = post.timestamp || new Date().toISOString();
          userComments.forEach((c: any) => {
            if (new Date(c.timestamp).getTime() > new Date(latestTimestamp).getTime()) latestTimestamp = c.timestamp;
            (c.replies?.data || []).forEach((r: any) => {
              const rt = r.timestamp || r.created_time;
              if (rt && new Date(rt).getTime() > new Date(latestTimestamp).getTime()) latestTimestamp = rt;
            });
          });
          items.push({
            id: post.id,
            type: 'ig_comment',
            platform: 'instagram',
            username: post.caption ? post.caption.slice(0, 40) + (post.caption.length > 40 ? '…' : '') : 'Publicación de Instagram',
            lastMessage: `${userComments.length} comentario${userComments.length !== 1 ? 's' : ''}${pendingList.length > 0 ? ` · ${pendingList.length} sin responder` : ''}`,
            timestamp: latestTimestamp,
            isPending: pendingList.length > 0,
            rawItem: post,
            postCaption: post.caption,
            postThumbnail: post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url,
            permalink: post.permalink,
            comments: userComments,
            pendingCount: pendingList.length,
            totalCount: userComments.length,
          });
        });

        // Facebook Comments (grouped by post)
        const resolvedFbMedia = (fbMedia as any)?.data || fbMedia || [];
        resolvedFbMedia.forEach((post: any) => {
          const allComments = post.comments?.data || [];
          const userComments = allComments.filter((c: any) => c.from?.id !== fbPageId);
          if (userComments.length === 0) return;
          const normalized = userComments.map((c: any, i: number) => ({
            ...c,
            username: c.from?.name || `Comentarista ${i + 1}`,
            text: c.text || c.message || '',
            from: c.from || null,
          }));
          const pendingList = normalized.filter((c: any) => isCommentPending(c));
          let latestTimestamp = post.created_time || new Date().toISOString();
          normalized.forEach((c: any) => {
            if (new Date(c.created_time).getTime() > new Date(latestTimestamp).getTime()) latestTimestamp = c.created_time;
          });
          items.push({
            id: post.id,
            type: 'fb_comment',
            platform: 'facebook',
            username: post.message ? post.message.slice(0, 40) + (post.message.length > 40 ? '…' : '') : 'Publicación de Facebook',
            lastMessage: `${normalized.length} comentario${normalized.length !== 1 ? 's' : ''}${pendingList.length > 0 ? ` · ${pendingList.length} sin responder` : ''}`,
            timestamp: latestTimestamp,
            isPending: pendingList.length > 0,
            rawItem: post,
            postCaption: post.message,
            postThumbnail: post.full_picture,
            permalink: post.permalink_url,
            comments: normalized,
            pendingCount: pendingList.length,
            totalCount: normalized.length,
          });
        });

        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setConversations(items);
        if (errs.length > 0) setErrors(errs);
      } catch (err: any) {
        if (active) setErrors([err.message || 'Error al cargar mensajes.']);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [fbPageId, igId, igUsername, refreshKey, isCommentPending]);

  // Load DM history
  const loadConversationHistory = useCallback(async (item: InboxItem) => {
    setLoadingMessages(true);
    setConvMessages([]);
    setReplyText('');
    setReplyError(null);
    try {
      const res = await metaAds.getConversationMessages(item.id);
      setConvMessages((res?.data || []).reverse());
    } catch {
      const fallback = item.rawItem?.messages?.data ? [...item.rawItem.messages.data].reverse() : [];
      setConvMessages(fallback);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const handleSelectItem = (item: InboxItem) => {
    setSelectedItem(item);
    setOpenReplyIds({});
    setCommentReplies({});
    setCommentErrors({});
    setReplyError(null);
    if (item.type === 'fb_dm' || item.type === 'ig_dm') {
      loadConversationHistory(item);
    }
  };

  // Send DM reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedItem) return;
    setSendingReply(true);
    setReplyError(null);
    try {
      await metaAds.replyToConversation(selectedItem.id, replyText.trim());
      if (user?.id && clientId) {
        db.activity.log(user.id, clientId, 'reply_sent', {
          reply_text: replyText.trim(),
          incoming_text: selectedItem.lastMessage || '',
          platform: selectedItem.type,
          item_id: selectedItem.id,
          user_email: user.email || '',
        }).catch(() => {});
      }
      const newMsg = { id: `local_${Date.now()}`, from: { id: fbPageId }, message: replyText.trim(), created_time: new Date().toISOString() };
      setConvMessages(prev => [...prev, newMsg]);
      setReplyText('');
      setConversations(prev => prev.map(c =>
        c.id === selectedItem.id ? { ...c, lastMessage: replyText.trim(), isPending: false, timestamp: new Date().toISOString() } : c
      ));
      setSelectedItem(prev => prev ? { ...prev, isPending: false } : prev);
    } catch {
      setReplyError('No se pudo enviar el mensaje. Verificá los permisos del token.');
    } finally {
      setSendingReply(false);
    }
  };

  // Generate AI draft for DM
  const generateAiDraft = async () => {
    if (!selectedItem || !clientId) return;
    setLoadingDraft(true);
    setReplyError(null);
    try {
      const last15 = convMessages.slice(-15).map(msg => {
        const isMe = msg.from?.id === fbPageId;
        return `${isMe ? 'Marca' : selectedItem.username}: ${msg.message || '(archivo)'}`;
      });
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, itemText: selectedItem.lastMessage || '', username: selectedItem.username || '', postCaption: '', otherComments: [], conversationHistory: last15, isDM: true }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.draft) setReplyText(data.draft);
    } catch {
      setReplyError('No se pudo generar el borrador con IA.');
    } finally {
      setLoadingDraft(false);
    }
  };

  // Generate AI draft for comment
  const generateCommentDraft = async (comment: any) => {
    if (!clientId || !selectedItem) return;
    setLoadingCommentDraft(prev => ({ ...prev, [comment.id]: true }));
    setCommentErrors(prev => ({ ...prev, [comment.id]: null }));
    try {
      const others = (selectedItem.comments || []).filter((c: any) => c.id !== comment.id).map((c: any) => `@${c.username || c.from?.name}: ${c.text || c.message || ''}`);
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, itemText: comment.text || comment.message || '', username: comment.username || comment.from?.name || '', postCaption: selectedItem.postCaption || '', otherComments: others }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.draft) setCommentReplies(prev => ({ ...prev, [comment.id]: data.draft }));
    } catch {
      setCommentErrors(prev => ({ ...prev, [comment.id]: 'No se pudo generar el borrador.' }));
    } finally {
      setLoadingCommentDraft(prev => ({ ...prev, [comment.id]: false }));
    }
  };

  // Submit comment reply
  const submitCommentReply = async (e: React.FormEvent, comment: any) => {
    e.preventDefault();
    const text = commentReplies[comment.id]?.trim();
    if (!text || !selectedItem) return;
    setSubmittingComment(prev => ({ ...prev, [comment.id]: true }));
    setCommentErrors(prev => ({ ...prev, [comment.id]: null }));
    try {
      if (selectedItem.platform === 'instagram') {
        await metaAds.replyToInstagramComment(comment.id, text);
      } else {
        await metaAds.replyToFacebookComment(comment.id, text);
      }
      if (user?.id && clientId) {
        db.activity.log(user.id, clientId, 'reply_sent', { reply_text: text, incoming_text: comment.text || comment.message || '', platform: selectedItem.platform, item_id: comment.id, user_email: user.email || '' }).catch(() => {});
      }
      const newReply = { id: `local_${Date.now()}`, username: igUsername || 'Yo', text, timestamp: new Date().toISOString(), from: { id: fbPageId } };
      setSelectedItem(prev => {
        if (!prev?.comments) return prev;
        return { ...prev, comments: prev.comments.map((c: any) => c.id === comment.id ? { ...c, replies: { data: [...(c.replies?.data || []), newReply] } } : c) };
      });
      setCommentReplies(prev => { const copy = { ...prev }; delete copy[comment.id]; return copy; });
      setOpenReplyIds(prev => ({ ...prev, [comment.id]: false }));
      setConversations(prev => prev.map(p => {
        if (p.id !== selectedItem?.id) return p;
        const newPending = Math.max(0, (p.pendingCount || 0) - 1);
        return { ...p, pendingCount: newPending, isPending: newPending > 0, lastMessage: `${p.totalCount} comentarios · ${newPending} sin responder` };
      }));
    } catch {
      setCommentErrors(prev => ({ ...prev, [comment.id]: 'Error al enviar la respuesta.' }));
    } finally {
      setSubmittingComment(prev => ({ ...prev, [comment.id]: false }));
    }
  };

  const toggleLike = async (commentId: string) => {
    if (!selectedItem) return;
    const liked = !!likedIds[commentId];
    try {
      if (liked) {
        await metaAds.unlikeComment(commentId, selectedItem.platform, igId);
        setLikedIds(prev => ({ ...prev, [commentId]: false }));
      } else {
        await metaAds.likeComment(commentId, selectedItem.platform, igId);
        setLikedIds(prev => ({ ...prev, [commentId]: true }));
      }
    } catch { /* silently ignore */ }
  };

  // Filtered list
  const filteredItems = useMemo(() => {
    let list = conversations;
    if (platformFilter !== 'all') list = list.filter(c => c.platform === platformFilter);
    if (statusFilter === 'pending') list = list.filter(c => c.isPending);
    if (statusFilter === 'responded') list = list.filter(c => !c.isPending);
    if (typeFilter === 'dms') list = list.filter(c => c.type === 'fb_dm' || c.type === 'ig_dm');
    if (typeFilter === 'comments') list = list.filter(c => c.type === 'ig_comment' || c.type === 'fb_comment');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.username.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q));
    }
    return list;
  }, [conversations, platformFilter, statusFilter, typeFilter, searchQuery]);

  const pendingCount = useMemo(() => conversations.filter(c => c.isPending).length, [conversations]);
  const igCount = useMemo(() => conversations.filter(c => c.platform === 'instagram').length, [conversations]);
  const fbCount = useMemo(() => conversations.filter(c => c.platform === 'facebook').length, [conversations]);
  const dmCount = useMemo(() => conversations.filter(c => c.type === 'fb_dm' || c.type === 'ig_dm').length, [conversations]);
  const commentCount = useMemo(() => conversations.filter(c => c.type === 'ig_comment' || c.type === 'fb_comment').length, [conversations]);

  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'Ahora';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  const isDM = selectedItem?.type === 'fb_dm' || selectedItem?.type === 'ig_dm';
  const isComment = selectedItem?.type === 'ig_comment' || selectedItem?.type === 'fb_comment';

  if (!fbPageId && !igId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <Inbox className="w-8 h-8 text-zinc-400" />
        </div>
        <h2 className="text-[18px] font-black text-zinc-800 dark:text-zinc-200">Sin cuentas conectadas</h2>
        <p className="text-[13px] text-zinc-500 max-w-sm">Necesitás conectar tu cuenta de Instagram o Facebook en la sección de configuración.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-[1400px] mx-auto animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60 flex-shrink-0">
        <div>
          <h1 className="text-[24px] font-black tracking-tight text-zinc-900 dark:text-white leading-none flex items-center gap-2">
            <Inbox className="w-6 h-6 text-violet-500" />
            Mensajes y Comentarios
          </h1>
          <p className="text-[12px] text-zinc-400 font-bold mt-1 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gradient-to-r from-yellow-400 to-pink-500 inline-block" />
              Instagram: {igCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Facebook: {fbCount}
            </span>
            <span className="flex items-center gap-1 text-zinc-400">
              <MessageSquare className="w-3 h-3" /> DMs: {dmCount}
            </span>
            <span className="flex items-center gap-1 text-zinc-400">
              <MessageCircle className="w-3 h-3" /> Comentarios: {commentCount}
            </span>
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 text-amber-500 font-black">
                <Clock className="w-3 h-3" />
                {pendingCount} pendientes
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* PENDING BUTTON — prominent shortcut */}
          <button
            onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-black shadow-sm transition-all border ${
              statusFilter === 'pending'
                ? 'bg-amber-500 text-white border-amber-500 shadow-amber-500/30'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {statusFilter === 'pending' ? `${filteredItems.length} pendientes` : `Ver pendientes (${pendingCount})`}
          </button>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full text-[12px] font-bold shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="pt-6 flex-1">
          <EmailLoader loading={loading} color="#8b5cf6" labels={['Cargando DMs de Facebook...', 'Cargando comentarios de Instagram...', 'Cargando comentarios de Facebook...']} />
        </div>
      ) : (
        <div className="flex-1 flex gap-0 overflow-hidden mt-4 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm">

          {/* LEFT: List */}
          <div className="w-full md:w-[340px] lg:w-[380px] flex-shrink-0 border-r border-zinc-150 dark:border-zinc-800 flex flex-col overflow-hidden">

            {/* Filters */}
            <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 space-y-2 flex-shrink-0">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-violet-500 transition-all text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>

              {/* Platform filter */}
              <div className="flex items-center gap-1 flex-wrap">
                {(['all', 'instagram', 'facebook'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition-all border ${
                      platformFilter === p
                        ? p === 'instagram' ? 'bg-pink-500 text-white border-pink-500'
                          : p === 'facebook' ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-violet-600 text-white border-violet-600'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-350'
                    }`}
                  >
                    {p === 'all' ? 'Todos' : p === 'instagram' ? '📷 IG' : '💬 FB'}
                  </button>
                ))}
                <span className="text-zinc-200 dark:text-zinc-700 mx-0.5">|</span>
                {(['all', 'dms', 'comments'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition-all border ${
                      typeFilter === t
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    {t === 'all' ? 'Todo' : t === 'dms' ? '💬 DMs' : '🗨 Comentarios'}
                  </button>
                ))}
              </div>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="mx-3 mt-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold leading-normal">{errors.join(' | ')}</p>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
                  <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                  <p className="text-[12px] font-bold text-zinc-400">
                    {statusFilter === 'pending' ? '¡Sin mensajes pendientes! Todo respondido 🎉' : 'No se encontraron conversaciones'}
                  </p>
                  {statusFilter === 'pending' && (
                    <button onClick={() => setStatusFilter('all')} className="text-[11px] font-black text-violet-600 hover:text-violet-800 underline">
                      Ver todos
                    </button>
                  )}
                </div>
              ) : (
                filteredItems.map(item => {
                  const isSelected = selectedItem?.id === item.id;
                  const isDmItem = item.type === 'fb_dm' || item.type === 'ig_dm';
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all border-b border-zinc-100/60 dark:border-zinc-800/40 ${
                        isSelected
                          ? 'bg-violet-50 dark:bg-violet-950/20 border-l-2 border-l-violet-500'
                          : 'hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 border-l-2 border-l-transparent'
                      }`}
                    >
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-xs relative ${
                        item.platform === 'instagram'
                          ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'
                          : 'bg-blue-600'
                      }`}>
                        {item.platform === 'instagram' ? <Instagram className="w-4 h-4" /> : <span className="text-sm font-black">f</span>}
                        {/* Type badge */}
                        <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] ${
                          isDmItem ? 'bg-violet-600' : 'bg-zinc-600'
                        }`}>
                          {isDmItem ? <MessageSquare className="w-2.5 h-2.5" /> : <MessageCircle className="w-2.5 h-2.5" />}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[12.5px] font-black truncate ${item.isPending ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400'}`}>
                            {item.username}
                          </span>
                          <span className="text-[9px] text-zinc-400 flex-shrink-0 font-bold">{formatTime(item.timestamp)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <p className={`text-[11px] truncate ${item.isPending ? 'text-zinc-700 dark:text-zinc-300 font-semibold' : 'text-zinc-400 font-medium italic'}`}>
                            {item.lastMessage}
                          </p>
                          <div className="flex-shrink-0">
                            {item.isPending
                              ? <span className="w-2 h-2 rounded-full bg-amber-500 block animate-pulse" title="Pendiente" />
                              : <CheckCheck className="w-3 h-3 text-emerald-500" />
                            }
                          </div>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                            item.platform === 'instagram'
                              ? 'bg-pink-50 text-pink-600 dark:bg-pink-950/20 dark:text-pink-400'
                              : 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400'
                          }`}>
                            {isDmItem ? (item.platform === 'instagram' ? 'Instagram DM' : 'Messenger') : (item.platform === 'instagram' ? 'Comentarios IG' : 'Comentarios FB')}
                          </span>
                          {item.isPending && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
                              Pendiente{item.pendingCount && item.pendingCount > 1 ? ` (${item.pendingCount})` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Detail */}
          <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/10">
            {!selectedItem ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-black text-zinc-600 dark:text-zinc-400">Seleccioná una conversación</h3>
                  <p className="text-[12px] text-zinc-400 mt-1">Hacé click en un mensaje o comentario de la izquierda para responder.</p>
                  {pendingCount > 0 && (
                    <button
                      onClick={() => setStatusFilter('pending')}
                      className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[13px] font-black shadow-md shadow-amber-500/20 transition-all mx-auto"
                    >
                      <Clock className="w-4 h-4" />
                      Ver {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Detail header */}
                <div className="px-5 py-3 border-b border-zinc-150 dark:border-zinc-800 flex items-center gap-3 bg-white dark:bg-zinc-900 flex-shrink-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-xs flex-shrink-0 ${
                    selectedItem.platform === 'instagram'
                      ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'
                      : 'bg-blue-600'
                  }`}>
                    {selectedItem.platform === 'instagram' ? <Instagram className="w-4 h-4" /> : <span className="text-sm font-black">f</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-black text-zinc-900 dark:text-white truncate">{selectedItem.username}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        selectedItem.platform === 'instagram'
                          ? 'bg-pink-100 text-pink-700 dark:bg-pink-950/30 dark:text-pink-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                      }`}>
                        {isDM ? (selectedItem.platform === 'instagram' ? 'Instagram Direct' : 'Facebook Messenger') : (selectedItem.platform === 'instagram' ? 'Comentarios de Instagram' : 'Comentarios de Facebook')}
                      </span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        selectedItem.isPending
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                      }`}>
                        {selectedItem.isPending ? `Pendiente${selectedItem.pendingCount && selectedItem.pendingCount > 1 ? ` (${selectedItem.pendingCount})` : ''}` : 'Respondido'}
                      </span>
                      {selectedItem.permalink && (
                        <a href={selectedItem.permalink} target="_blank" rel="noreferrer" className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-violet-600 flex items-center gap-0.5 transition-colors">
                          Ver original <ArrowUpRight className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* DM Chat view */}
                {isDM && (
                  <>
                    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                      {loadingMessages ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                          <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                          <p className="text-[12px] text-zinc-400 font-bold">Cargando historial...</p>
                        </div>
                      ) : convMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                          <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                          <p className="text-[12px] text-zinc-400 font-bold">No se encontraron mensajes en este chat.</p>
                        </div>
                      ) : (
                        convMessages.map((msg: any) => {
                          const isMe = msg.from?.id === fbPageId;
                          const timeStr = msg.created_time ? new Date(msg.created_time).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                          return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              <span className="text-[9px] text-zinc-400 font-bold mb-1 px-1">{isMe ? 'Yo' : selectedItem.username} · {timeStr}</span>
                              {msg.message ? (
                                <div className={`max-w-[75%] rounded-[18px] px-4 py-2.5 text-[13px] leading-relaxed font-medium shadow-sm ${isMe ? 'bg-violet-600 text-white' : 'bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100'}`}>
                                  {msg.message}
                                </div>
                              ) : (
                                <div className={`max-w-[75%] rounded-[18px] px-4 py-2.5 text-[11px] leading-relaxed italic opacity-60 ${isMe ? 'bg-violet-400 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700'}`}>
                                  📎 Archivo adjunto o mensaje de voz
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    {/* DM Reply box */}
                    <div className="p-4 border-t border-zinc-150 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2 flex-shrink-0">
                      {replyError && (
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
                          {replyError}
                        </div>
                      )}
                      <form onSubmit={handleSendReply} className="flex flex-col gap-2">
                        <AutoResizeTextarea
                          placeholder={`Responder a ${selectedItem.username}...`}
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          disabled={sendingReply || loadingDraft}
                          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 outline-none transition-all min-h-[60px] shadow-inner font-medium"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <button type="button" onClick={generateAiDraft} disabled={sendingReply || loadingDraft} className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 rounded-xl text-[12px] font-black border border-violet-100/50 transition-all">
                            {loadingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            Borrador IA
                          </button>
                          <button type="submit" disabled={sendingReply || loadingDraft || !replyText.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-[12.5px] font-black shadow-md shadow-violet-600/20 transition-all">
                            {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            Enviar
                          </button>
                        </div>
                      </form>
                    </div>
                  </>
                )}

                {/* Comment thread view */}
                {isComment && (
                  <div className="flex-1 overflow-y-auto">
                    {/* Post preview */}
                    {(selectedItem.postThumbnail || selectedItem.postCaption) && (
                      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/10 flex gap-3">
                        {selectedItem.postThumbnail && (
                          <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-zinc-200 dark:border-zinc-700">
                            {selectedItem.rawItem?.media_type === 'VIDEO' && selectedItem.type === 'ig_comment' ? (
                              playingVideoId === selectedItem.id ? (
                                <video src={selectedItem.rawItem?.media_url} controls autoPlay className="w-full h-full object-cover" />
                              ) : (
                                <div className="relative cursor-pointer w-full h-full" onClick={() => setPlayingVideoId(selectedItem.id)}>
                                  <img src={selectedItem.postThumbnail} alt="" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <Play className="w-5 h-5 fill-white text-white" />
                                  </div>
                                </div>
                              )
                            ) : (
                              <img src={selectedItem.postThumbnail} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {selectedItem.postCaption && <p className="text-[11.5px] text-zinc-700 dark:text-zinc-300 font-medium line-clamp-3 leading-snug">{selectedItem.postCaption}</p>}
                          <p className="text-[10px] text-zinc-400 font-bold mt-1">{selectedItem.totalCount} comentarios · {selectedItem.pendingCount || 0} pendientes</p>
                        </div>
                      </div>
                    )}

                    {/* Comments */}
                    <div className="p-4 space-y-3">
                      {(selectedItem.comments || []).map((comment: any) => {
                        const isPending = isCommentPending(comment);
                        const liked = !!likedIds[comment.id];
                        const replyOpen = !!openReplyIds[comment.id];
                        const replies = comment.replies?.data || [];
                        return (
                          <div key={comment.id} className={`bg-white dark:bg-zinc-900 border rounded-2xl overflow-hidden ${isPending ? 'border-amber-200 dark:border-amber-800/40 shadow-sm' : 'border-zinc-200/60 dark:border-zinc-800/60'}`}>
                            <div className="p-4">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[11px] font-black text-zinc-500 flex-shrink-0">
                                    {(comment.username || 'U')[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="text-[12px] font-black text-zinc-900 dark:text-white">@{comment.username || comment.from?.name}</span>
                                    <span className="text-[10px] text-zinc-400 ml-2">
                                      {comment.timestamp ? new Date(comment.timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : ''}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isPending && <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 uppercase">Pendiente</span>}
                                  {!isPending && <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 uppercase">Respondido</span>}
                                  <button onClick={() => toggleLike(comment.id)} className={`flex items-center gap-0.5 text-[11px] font-bold transition-colors ${liked ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'}`}>
                                    <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-red-500' : ''}`} />
                                    {comment.like_count || 0}
                                  </button>
                                </div>
                              </div>
                              <p className="text-[13px] text-zinc-800 dark:text-zinc-100 leading-relaxed font-medium ml-9">
                                {comment.text || comment.message}
                              </p>
                              {/* Existing replies */}
                              {replies.length > 0 && (
                                <div className="ml-9 mt-3 space-y-2 pl-3 border-l-2 border-zinc-100 dark:border-zinc-800">
                                  {replies.map((r: any) => {
                                    const rIsMe = r.username === igUsername || r.from?.id === fbPageId;
                                    return (
                                      <div key={r.id} className="space-y-0.5">
                                        <span className={`text-[10px] font-black ${rIsMe ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500'}`}>
                                          @{r.username || r.from?.name || 'Yo'}
                                        </span>
                                        <p className={`text-[12px] leading-relaxed ${rIsMe ? 'text-violet-700 dark:text-violet-300 font-semibold' : 'text-zinc-600 dark:text-zinc-400 font-medium'}`}>
                                          {r.text || r.message}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <div className="mt-3 ml-9">
                                <button onClick={() => setOpenReplyIds(prev => ({ ...prev, [comment.id]: !prev[comment.id] }))} className="text-[11px] font-black text-violet-600 dark:text-violet-400 hover:text-violet-800 transition-colors">
                                  {replyOpen ? 'Cancelar' : 'Responder'}
                                </button>
                              </div>
                              {replyOpen && (
                                <div className="mt-3 ml-9 space-y-2">
                                  {commentErrors[comment.id] && <p className="text-[10px] text-red-500 font-bold">{commentErrors[comment.id]}</p>}
                                  <form onSubmit={e => submitCommentReply(e, comment)} className="space-y-2">
                                    <AutoResizeTextarea
                                      placeholder={`Responder a @${comment.username || comment.from?.name}...`}
                                      value={commentReplies[comment.id] || ''}
                                      onChange={e => setCommentReplies(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                      disabled={submittingComment[comment.id] || loadingCommentDraft[comment.id]}
                                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 text-[12.5px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 outline-none transition-all min-h-[50px] font-medium shadow-inner"
                                    />
                                    <div className="flex items-center gap-2">
                                      <button type="button" onClick={() => generateCommentDraft(comment)} disabled={submittingComment[comment.id] || loadingCommentDraft[comment.id]} className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 rounded-lg text-[11px] font-black border border-violet-100/50 transition-all">
                                        {loadingCommentDraft[comment.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                        IA
                                      </button>
                                      <button type="submit" disabled={submittingComment[comment.id] || loadingCommentDraft[comment.id] || !(commentReplies[comment.id] || '').trim()} className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-black shadow-sm transition-all">
                                        {submittingComment[comment.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
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
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
