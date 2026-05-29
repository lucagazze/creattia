import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  Instagram, Loader2, RefreshCw, AlertCircle, Inbox, Sparkles, Send,
  Search, MessageSquare, Clock, CheckCheck, ChevronsUp
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
    const localRef = useRef<HTMLTextAreaElement>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || localRef;
    useEffect(() => {
      const el = textareaRef.current;
      if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
    }, [value, textareaRef]);
    return <textarea ref={textareaRef} value={value} rows={1} className={`${className} overflow-hidden resize-none`} {...props} />;
  }
);
AutoResizeTextarea.displayName = 'AutoResizeTextarea';

type ConvItem = {
  id: string;
  platform: 'instagram' | 'facebook';
  username: string;
  lastMessage: string;
  timestamp: string;
  isPending: boolean;
  rawItem: any;
};

export default function MensajesDMPage() {
  const { isViewingAs, viewAsProfile } = useViewAs();
  const { profile: authProfile, user } = useAuth();
  const profile  = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;
  const fbPageId = (profile as any)?.fb_page_id;
  const igId     = (profile as any)?.ig_business_id;

  // ── Conversation list state ──────────────────────────────────────
  const [loading, setLoading]         = useState(true);
  const [igError, setIgError]         = useState<string | null>(null);
  const [fbError, setFbError]         = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConvItem[]>([]);

  // Pagination cursors (paging.cursors.after from Meta)
  const [igNextCursor, setIgNextCursor] = useState<string | null>(null);
  const [fbNextCursor, setFbNextCursor] = useState<string | null>(null);
  const [igHasMore, setIgHasMore] = useState(false);
  const [fbHasMore, setFbHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [refreshKey, setRefreshKey]   = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'facebook'>('all');
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  // ── Selected conversation / chat state ──────────────────────────
  const [selectedConv, setSelectedConv]     = useState<ConvItem | null>(null);
  const [convMessages, setConvMessages]     = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [msgNextCursor, setMsgNextCursor]   = useState<string | null>(null);
  const [msgHasMore, setMsgHasMore]         = useState(false);
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);

  const [replyText, setReplyText]       = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError]     = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const listEndRef            = useRef<HTMLDivElement>(null);
  const listContainerRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fbPageId) localStorage.setItem('active_fb_page_id', fbPageId);
  }, [fbPageId]);

  // Auto-scroll chat to bottom on new messages (but not when loading older ones)
  const prevMsgCount = useRef(0);
  useEffect(() => {
    const newCount = convMessages.length;
    const added    = newCount - prevMsgCount.current;
    prevMsgCount.current = newCount;
    // Only scroll down when new messages were appended (not prepended)
    if (added > 0 && messagesContainerRef.current && added === newCount) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [convMessages]);

  // ── Build a ConvItem from raw API data ─────────────────────────
  const buildConv = useCallback((conv: any, platform: 'instagram' | 'facebook'): ConvItem => {
    const lastMsg  = conv.messages?.data?.[0];
    const other    = conv.participants?.data?.find((p: any) => p.id !== fbPageId);
    const isFromMe = lastMsg?.from?.id === fbPageId;
    return {
      id: conv.id,
      platform,
      username: other?.name || lastMsg?.from?.name || lastMsg?.from?.username
        || (platform === 'instagram' ? 'Usuario de Instagram' : 'Usuario de Messenger'),
      lastMessage: lastMsg?.message || (platform === 'instagram' ? '(toca para ver)' : '(Archivo adjunto)'),
      timestamp: lastMsg?.created_time || conv.updated_time || new Date().toISOString(),
      isPending: lastMsg ? !isFromMe : conv.unread_count > 0,
      rawItem: conv,
    };
  }, [fbPageId]);

  // Background preview loader helper for Instagram conversations
  const fetchInstagramPreviews = useCallback((items: ConvItem[], activeSignal = { active: true }) => {
    const igItems = items.filter(c => c.platform === 'instagram');
    igItems.forEach(async (conv) => {
      try {
        const res = await metaAds.getConversationMessages(conv.id, 1);
        if (!activeSignal.active) return;
        const msg = res?.data?.[0];
        if (msg) {
          const isFromMe = msg.from?.id === fbPageId;
          setConversations(prev => {
            const exists = prev.some(c => c.id === conv.id);
            if (!exists) return prev;
            return prev.map(c => {
              if (c.id === conv.id) {
                return {
                  ...c,
                  lastMessage: msg.message || '📎 Archivo adjunto o mensaje de voz',
                  isPending: !isFromMe,
                  timestamp: msg.created_time || c.timestamp
                };
              }
              return c;
            }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          });
        }
      } catch (e) {
        console.error('Error loading dynamic IG preview:', e);
      }
    });
  }, [fbPageId]);

  // ── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    if (!fbPageId) return;
    let active = true;
    setLoading(true);
    setIgError(null);
    setFbError(null);
    setConversations([]);
    setIgNextCursor(null);
    setFbNextCursor(null);
    setIgHasMore(false);
    setFbHasMore(false);
    setSelectedConv(null);

    const load = async () => {
      const [igRes, fbRes] = await Promise.all([
        igId
          ? metaAds.getInstagramConversations(fbPageId, igId, undefined, 15).catch(err => {
              if (active) setIgError(err.message);
              return null;
            })
          : Promise.resolve(null),
        metaAds.getPageConversations(fbPageId, 'messenger', undefined, 15).catch(err => {
          if (active) setFbError(err.message);
          return null;
        }),
      ]);
      if (!active) return;

      const items: ConvItem[] = [];

      if (igRes?.data) {
        igRes.data.forEach((c: any) => items.push(buildConv(c, 'instagram')));
        const after = igRes?.paging?.cursors?.after;
        if (after && igRes?.paging?.next) { setIgNextCursor(after); setIgHasMore(true); }
      }
      if (fbRes?.data) {
        fbRes.data.forEach((c: any) => items.push(buildConv(c, 'facebook')));
        const after = fbRes?.paging?.cursors?.after;
        if (after && fbRes?.paging?.next) { setFbNextCursor(after); setFbHasMore(true); }
      }

      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setConversations(items);
      setLoading(false);
      fetchInstagramPreviews(items, { active });
    };

    load();
    return () => { active = false; };
  }, [fbPageId, igId, refreshKey, buildConv]);

  // ── Load more conversations (pagination) ───────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || (!igHasMore && !fbHasMore)) return;
    setLoadingMore(true);
    try {
      const [igRes, fbRes] = await Promise.all([
        igHasMore && igId && igNextCursor
          ? metaAds.getInstagramConversations(fbPageId, igId, igNextCursor, 15).catch(() => null)
          : Promise.resolve(null),
        fbHasMore && fbNextCursor
          ? metaAds.getPageConversations(fbPageId, 'messenger', fbNextCursor, 15).catch(() => null)
          : Promise.resolve(null),
      ]);

      const newItems: ConvItem[] = [];
      if (igRes?.data) {
        igRes.data.forEach((c: any) => newItems.push(buildConv(c, 'instagram')));
        const after = igRes?.paging?.cursors?.after;
        setIgNextCursor(after && igRes?.paging?.next ? after : null);
        setIgHasMore(!!(after && igRes?.paging?.next));
      }
      if (fbRes?.data) {
        fbRes.data.forEach((c: any) => newItems.push(buildConv(c, 'facebook')));
        const after = fbRes?.paging?.cursors?.after;
        setFbNextCursor(after && fbRes?.paging?.next ? after : null);
        setFbHasMore(!!(after && fbRes?.paging?.next));
      }
      setConversations(prev => {
        const seen = new Set(prev.map(c => c.id));
        const unique = newItems.filter(c => !seen.has(c.id));
        return [...prev, ...unique].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
      });
      fetchInstagramPreviews(newItems);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, igHasMore, fbHasMore, igNextCursor, fbNextCursor, fbPageId, igId, buildConv]);

  // Infinite scroll observer for conversation list
  useEffect(() => {
    const sentinel = listEndRef.current;
    const container = listContainerRef.current;
    if (!sentinel || !container) return;
    const obs = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore(); },
      { root: container, rootMargin: '350px' }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadMore]);

  // ── Load chat history ──────────────────────────────────────────
  const loadHistory = useCallback(async (conv: ConvItem) => {
    setLoadingMessages(true);
    setConvMessages([]);
    setMsgNextCursor(null);
    setMsgHasMore(false);
    setReplyText('');
    setReplyError(null);
    try {
      const res = await metaAds.getConversationMessages(conv.id);
      const msgs = (res?.data || []).reverse();
      setConvMessages(msgs);

      // Update local conversation preview and status with actual message
      if (res?.data && res.data.length > 0) {
        const latestMsg = res.data[0]; // res.data is ordered newest first
        const latestText = latestMsg.message || '📎 Archivo adjunto o mensaje de voz';
        const isFromMe = latestMsg.from?.id === fbPageId;
        
        setConversations(prev => prev.map(c => {
          if (c.id === conv.id) {
            return {
              ...c,
              lastMessage: latestText,
              isPending: !isFromMe
            };
          }
          return c;
        }));
        
        setSelectedConv(prev => {
          if (prev && prev.id === conv.id) {
            return {
              ...prev,
              lastMessage: latestText,
              isPending: !isFromMe
            };
          }
          return prev;
        });
      }

      // cursor for older messages (before the current batch)
      const before = res?.paging?.cursors?.before;
      if (before && res?.paging?.previous) {
        setMsgNextCursor(before);
        setMsgHasMore(true);
      }
      // scroll to bottom
      setTimeout(() => {
        if (messagesContainerRef.current)
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }, 50);
    } catch {
      setConvMessages(conv.rawItem?.messages?.data
        ? [...conv.rawItem.messages.data].reverse()
        : []);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Load older messages (scroll up to reveal)
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderMsgs || !msgHasMore || !selectedConv || !msgNextCursor) return;
    setLoadingOlderMsgs(true);
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;
    try {
      // Use the before cursor to get older messages
      const res = await metaAds.getConversationMessages(selectedConv.id, 15);
      if (res?.data) {
        const older = [...res.data].reverse();
        setConvMessages(prev => [...older, ...prev]);
        const before = res?.paging?.cursors?.before;
        setMsgNextCursor(before && res?.paging?.previous ? before : null);
        setMsgHasMore(!!(before && res?.paging?.previous));
        // maintain scroll position after prepend
        setTimeout(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        }, 20);
      }
    } finally {
      setLoadingOlderMsgs(false);
    }
  }, [loadingOlderMsgs, msgHasMore, selectedConv, msgNextCursor]);

  const handleSelect = (conv: ConvItem) => {
    setSelectedConv(conv);
    loadHistory(conv);
  };

  // ── Send reply ─────────────────────────────────────────────────
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedConv) return;
    setSendingReply(true);
    setReplyError(null);
    try {
      await metaAds.replyToConversation(selectedConv.id, replyText.trim());
      if (user?.id && clientId) {
        db.activity.log(user.id, clientId, 'reply_sent', {
          reply_text: replyText.trim(),
          incoming_text: selectedConv.lastMessage || '',
          platform: selectedConv.platform,
          item_id: selectedConv.id,
          user_email: user.email || '',
        }).catch(() => {});
      }
      const newMsg = {
        id: `local_${Date.now()}`,
        from: { id: fbPageId },
        message: replyText.trim(),
        created_time: new Date().toISOString(),
      };
      setConvMessages(prev => [...prev, newMsg]);
      setReplyText('');
      setConversations(prev =>
        prev.map(c =>
          c.id === selectedConv.id
            ? { ...c, lastMessage: replyText.trim(), isPending: false, timestamp: new Date().toISOString() }
            : c
        )
      );
      setSelectedConv(prev => prev ? { ...prev, isPending: false } : prev);
      setTimeout(() => {
        if (messagesContainerRef.current)
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }, 50);
    } catch {
      setReplyError('No se pudo enviar el mensaje. Verificá los permisos del token.');
    } finally {
      setSendingReply(false);
    }
  };

  // ── AI draft ───────────────────────────────────────────────────
  const generateDraft = async () => {
    if (!selectedConv || !clientId) return;
    setLoadingDraft(true);
    setReplyError(null);
    try {
      const history = convMessages.slice(-15).map(m => {
        const isMe = m.from?.id === fbPageId;
        return `${isMe ? 'Marca' : selectedConv.username}: ${m.message || '(archivo)'}`;
      });
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          itemText: selectedConv.lastMessage || '',
          username: selectedConv.username || '',
          postCaption: '',
          otherComments: [],
          conversationHistory: history,
          isDM: true,
        }),
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

  // ── Derived counts / filters ───────────────────────────────────
  const pendingCount = useMemo(() => conversations.filter(c => c.isPending).length, [conversations]);
  const igCount      = useMemo(() => conversations.filter(c => c.platform === 'instagram').length, [conversations]);
  const fbCount      = useMemo(() => conversations.filter(c => c.platform === 'facebook').length, [conversations]);

  const filtered = useMemo(() => {
    let list = conversations;
    if (showPendingOnly)     list = list.filter(c => c.isPending);
    if (platformFilter !== 'all') list = list.filter(c => c.platform === platformFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.username.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q));
    }
    return list;
  }, [conversations, showPendingOnly, platformFilter, searchQuery]);

  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d    = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000)     return 'Ahora';
    if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  // ── No accounts ───────────────────────────────────────────────
  if (!fbPageId && !igId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          <Inbox className="w-8 h-8 text-zinc-400" />
        </div>
        <h2 className="text-[18px] font-black text-zinc-800 dark:text-zinc-200">Sin cuentas conectadas</h2>
        <p className="text-[13px] text-zinc-500 max-w-sm">Conectá tu cuenta en la configuración del cliente.</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full max-w-none animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60 flex-shrink-0">
        <div>
          <h1 className="text-[24px] font-black tracking-tight text-zinc-900 dark:text-white leading-none flex items-center gap-2">
            <Inbox className="w-6 h-6 text-violet-500" />
            Mensajes Directos
          </h1>
          <p className="text-[12px] text-zinc-400 font-bold mt-1 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gradient-to-r from-yellow-400 to-pink-500 inline-block" />
              Instagram: {igCount}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Facebook: {fbCount}
            </span>
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 text-amber-500 font-black">
                <Clock className="w-3 h-3" />
                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowPendingOnly(v => !v)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-black border shadow-sm transition-all ${
              showPendingOnly
                ? 'bg-amber-500 text-white border-amber-500 shadow-amber-400/30'
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 dark:hover:text-amber-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            {showPendingOnly ? `${filtered.length} pendiente${filtered.length !== 1 ? 's' : ''}` : `Pendientes (${pendingCount})`}
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

      {/* Loading state */}
      {loading ? (
        <div className="pt-6 flex-1">
          <EmailLoader loading={loading} color="#8b5cf6" labels={['Cargando DMs de Instagram...', 'Cargando Messenger de Facebook...']} />
        </div>
      ) : (
        <div className="flex-1 flex gap-0 overflow-hidden mt-4 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm">

          {/* ── LEFT: Conversation list ── */}
          <div className="w-full md:w-[340px] lg:w-[380px] flex-shrink-0 border-r border-zinc-150 dark:border-zinc-800 flex flex-col overflow-hidden">

            {/* Search + filter */}
            <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 space-y-2 flex-shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar conversación..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:border-violet-500 transition-all text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>
              <div className="flex gap-1.5">
                {(['all', 'instagram', 'facebook'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition-all border ${
                      platformFilter === p
                        ? p === 'instagram' ? 'bg-pink-500 text-white border-pink-500'
                          : p === 'facebook' ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-violet-600 text-white border-violet-600'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    {p === 'all' ? 'Todos' : p === 'instagram' ? '📷 Instagram' : '💬 Facebook'}
                  </button>
                ))}
              </div>
            </div>

            {/* Errors */}
            {(igError || fbError) && (
              <div className="mx-3 mt-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold leading-snug">
                  {[igError && `IG: ${igError}`, fbError && `FB: ${fbError}`].filter(Boolean).join(' | ')}
                </p>
              </div>
            )}

            {/* Scrollable list */}
            <div ref={listContainerRef} className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
                  <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                  <p className="text-[12px] font-bold text-zinc-400">
                    {showPendingOnly ? '¡Sin pendientes! Todo respondido 🎉' : 'Sin conversaciones'}
                  </p>
                  {showPendingOnly && (
                    <button onClick={() => setShowPendingOnly(false)} className="text-[11px] font-black text-violet-600 hover:underline">Ver todos</button>
                  )}
                </div>
              ) : (
                <>
                  {filtered.map(conv => {
                    const isSelected = selectedConv?.id === conv.id;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => handleSelect(conv)}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all border-b border-zinc-100/60 dark:border-zinc-800/40 ${
                          isSelected
                            ? 'bg-violet-50 dark:bg-violet-950/20 border-l-2 border-l-violet-500'
                            : 'hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 border-l-2 border-l-transparent'
                        }`}
                      >
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-black text-xs ${
                          conv.platform === 'instagram'
                            ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'
                            : 'bg-blue-600'
                        }`}>
                          {conv.platform === 'instagram'
                            ? <Instagram className="w-4 h-4" />
                            : <span className="text-sm font-black">f</span>
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-[12.5px] font-black truncate ${conv.isPending ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                              {conv.username}
                            </span>
                            <span className="text-[9px] text-zinc-400 flex-shrink-0 font-bold">{formatTime(conv.timestamp)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <p className={`text-[11px] truncate ${conv.isPending ? 'text-zinc-700 dark:text-zinc-300 font-semibold' : 'text-zinc-400 font-medium italic'}`}>
                              {conv.lastMessage}
                            </p>
                            <div className="flex-shrink-0">
                              {conv.isPending
                                ? <span className="w-2 h-2 rounded-full bg-amber-500 block animate-pulse" />
                                : <CheckCheck className="w-3 h-3 text-emerald-500" />
                              }
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                              conv.platform === 'instagram'
                                ? 'bg-pink-50 text-pink-600 dark:bg-pink-950/20 dark:text-pink-400'
                                : 'bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400'
                            }`}>
                              {conv.platform === 'instagram' ? 'Instagram Direct' : 'Messenger'}
                            </span>
                            {conv.isPending && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">Pendiente</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {/* Infinite scroll sentinel */}
                  <div ref={listEndRef} className="py-2 flex items-center justify-center">
                    {loadingMore ? (
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-bold">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Cargando más...
                      </div>
                    ) : (igHasMore || fbHasMore) ? (
                      <button onClick={loadMore} className="text-[11px] font-black text-violet-500 hover:text-violet-700 py-2 px-4 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-all">
                        Cargar más conversaciones
                      </button>
                    ) : conversations.length > 0 ? (
                      <span className="text-[10px] text-zinc-300 dark:text-zinc-700 font-bold py-2">Fin de las conversaciones</span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── RIGHT: Chat thread ── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/10">
            {!selectedConv ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                </div>
                <div>
                  <h3 className="text-[15px] font-black text-zinc-600 dark:text-zinc-400">Seleccioná una conversación</h3>
                  <p className="text-[12px] text-zinc-400 mt-1">Hacé click en un chat de la izquierda para ver el historial y responder.</p>
                  {pendingCount > 0 && (
                    <button
                      onClick={() => setShowPendingOnly(true)}
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
                {/* Chat header */}
                <div className="px-5 py-3 border-b border-zinc-150 dark:border-zinc-800 flex items-center gap-3 bg-white dark:bg-zinc-900 flex-shrink-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-xs flex-shrink-0 ${
                    selectedConv.platform === 'instagram'
                      ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'
                      : 'bg-blue-600'
                  }`}>
                    {selectedConv.platform === 'instagram' ? <Instagram className="w-4 h-4" /> : <span className="text-sm font-black">f</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-black text-zinc-900 dark:text-white truncate">{selectedConv.username}</h3>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        selectedConv.platform === 'instagram'
                          ? 'bg-pink-100 text-pink-700 dark:bg-pink-950/30 dark:text-pink-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                      }`}>
                        {selectedConv.platform === 'instagram' ? 'Instagram Direct' : 'Facebook Messenger'}
                      </span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        selectedConv.isPending
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400'
                      }`}>
                        {selectedConv.isPending ? 'Sin responder' : 'Respondido'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                  {/* Load older messages button */}
                  {msgHasMore && (
                    <div className="flex justify-center">
                      <button
                        onClick={loadOlderMessages}
                        disabled={loadingOlderMsgs}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-[11px] font-black text-zinc-500 dark:text-zinc-400 transition-all"
                      >
                        {loadingOlderMsgs ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronsUp className="w-3 h-3" />}
                        Cargar mensajes anteriores
                      </button>
                    </div>
                  )}

                  {loadingMessages ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                      <p className="text-[12px] text-zinc-400 font-bold">Cargando historial...</p>
                    </div>
                  ) : convMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                      <MessageSquare className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                      <p className="text-[12px] text-zinc-400 font-bold">No hay mensajes en este chat todavía.</p>
                    </div>
                  ) : (
                    convMessages.map((msg: any) => {
                      const isMe    = msg.from?.id === fbPageId;
                      const timeStr = msg.created_time
                        ? new Date(msg.created_time).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '';
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <span className="text-[9px] text-zinc-400 font-bold mb-1 px-1">
                            {isMe ? 'Yo' : selectedConv.username} · {timeStr}
                          </span>
                          {msg.message ? (
                            <div className={`max-w-[75%] rounded-[18px] px-4 py-2.5 text-[13px] leading-relaxed font-medium shadow-sm ${
                              isMe
                                ? 'bg-violet-600 text-white'
                                : 'bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100'
                            }`}>
                              {msg.message}
                            </div>
                          ) : (
                            <div className={`max-w-[75%] rounded-[18px] px-4 py-2.5 text-[11px] italic opacity-60 ${
                              isMe
                                ? 'bg-violet-400 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700'
                            }`}>
                              📎 Archivo adjunto o mensaje de voz
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Reply box */}
                <div className="p-4 border-t border-zinc-150 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2 flex-shrink-0">
                  {replyError && (
                    <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-xl flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
                      {replyError}
                    </div>
                  )}
                  <form onSubmit={handleSendReply} className="flex flex-col gap-2">
                    <AutoResizeTextarea
                      placeholder={`Responder a ${selectedConv.username}...`}
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      disabled={sendingReply || loadingDraft}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 outline-none transition-all min-h-[60px] shadow-inner font-medium"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={generateDraft}
                        disabled={sendingReply || loadingDraft}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/20 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-xl text-[12px] font-black border border-violet-100/50 dark:border-violet-900/20 transition-all"
                      >
                        {loadingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Borrador IA
                      </button>
                      <button
                        type="submit"
                        disabled={sendingReply || loadingDraft || !replyText.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-[12.5px] font-black shadow-md shadow-violet-600/20 transition-all"
                      >
                        {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        Enviar
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
