import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import { supabase } from '../services/supabase';
import { useToast } from '../components/Toast';
import {
  RefreshCw, AlertCircle, Loader2, Send, Sparkles,
  Search, CheckCircle, Clock, Inbox, ExternalLink, Bot,
  Globe, Facebook, Instagram, MessageCircle, Mail,
  BookOpen, ShoppingBag, Plus, Trash2, Link, Mic, ChevronLeft, X
} from 'lucide-react';


const fmtTime = (ts: any) => {
  if (!ts) return '';
  let d: Date;
  if (typeof ts === 'number') {
    if (ts < 10000000000) {
      d = new Date(ts * 1000);
    } else {
      d = new Date(ts);
    }
  } else if (typeof ts === 'string') {
    if (/^\d+$/.test(ts)) {
      const num = parseInt(ts, 10);
      if (num < 10000000000) {
        d = new Date(num * 1000);
      } else {
        d = new Date(num);
      }
    } else {
      d = new Date(ts);
    }
  } else {
    d = new Date(ts);
  }

  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const fmtSeconds = (s: number) => {
  if (!s || isNaN(s)) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${Math.round(s)}s`;
};

const renderMessageContent = (msg: any, contactName = 'Cliente') => {
  if (!msg) return null;

  // 1. Check if it's an email content type with HTML content
  const emailHtml = msg.content_attributes?.email?.html_content || msg.content_attributes?.html_content;
  
  // Also check if raw content is HTML
  const rawContent = msg.content || '';
  const isRawHtml = rawContent.trim().toLowerCase().startsWith('<html') || 
                    rawContent.trim().toLowerCase().startsWith('<!doctype') || 
                    (rawContent.includes('<div') && rawContent.includes('</div>')) || 
                    (rawContent.includes('<p') && rawContent.includes('</p>'));

  const hasHtml = !!emailHtml || isRawHtml;
  const htmlToRender = emailHtml || rawContent;

  let contentNode = null;

  if (hasHtml) {
    // Strip script and iframe tags to avoid XSS
    const cleanHtml = htmlToRender
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

    contentNode = (
      <div 
        className="email-content-wrapper overflow-x-auto text-left max-w-full text-zinc-800 dark:text-zinc-100 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <div 
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
          className="prose dark:prose-invert prose-sm max-w-none break-words email-body"
        />
      </div>
    );
  } else {
    // Regular text content with line breaks
    contentNode = (
      <span className="whitespace-pre-wrap break-words">{msg.content || ''}</span>
    );
  }

  // 2. Render attachments if any
  const attachments = msg.attachments;
  if (Array.isArray(attachments) && attachments.length > 0) {
    return (
      <div className="space-y-2.5">
        {msg.content && contentNode}
        <div className="space-y-2 mt-2 pt-2 border-t border-zinc-200/50 dark:border-zinc-700/50">
          {attachments.map((att: any, idx: number) => {
            const fType = (att.file_type || '').toLowerCase();
            const url = att.data_url || att.data?.url || '';
            if (!url) return null;

            if (fType.includes('image') || url.match(/\.(jpeg|jpg|gif|png|webp)/i)) {
              return (
                <div key={idx} className="relative group max-w-xs">
                  <img 
                    src={url} 
                    alt="Adjunto" 
                    className="max-h-48 rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity border border-zinc-200 dark:border-zinc-700"
                    onClick={() => window.open(url, '_blank')}
                  />
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-lg text-[10px] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ExternalLink className="w-3 h-3" /> Ver original
                  </a>
                </div>
              );
            }

            if (fType.includes('audio') || url.match(/\.(mp3|wav|ogg|m4a)/i)) {
              return (
                <div key={idx} className="mt-1">
                  <audio src={url} controls className="max-w-full h-8" />
                </div>
              );
            }

            if (fType.includes('video') || url.match(/\.(mp4|webm|mov|avi)/i)) {
              return (
                <div key={idx} className="max-w-xs mt-1">
                  <video src={url} controls className="max-h-48 rounded-xl border border-zinc-200 dark:border-zinc-700" />
                </div>
              );
            }

            // Fallback for document/file
            const fileName = url.split('/').pop()?.split('?')[0] || 'Archivo adjunto';
            return (
              <a 
                key={idx}
                href={url} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 p-2.5 bg-zinc-55 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-blue-600 dark:text-blue-400 hover:underline text-[12px] font-bold transition-all w-fit"
              >
                <Link className="w-3.5 h-3.5" />
                <span className="truncate max-w-[200px]">{fileName}</span>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  // If no attachments, return just the contentNode
  if (!msg.content && !hasHtml) {
    return <span className="italic opacity-60">📎 Archivo adjunto</span>;
  }

  return contentNode;
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500',
  resolved: 'bg-emerald-500',
  pending: 'bg-amber-500',
};

export default function MensajeriaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const isAdmin = authProfile?.is_admin;
  const { showToast } = useToast();

  const cwUrl = (profile as any)?.chatwoot_url;
  const cwToken = (profile as any)?.chatwoot_token;

  const [conversations, setConversations] = useState<any[]>([]);
  const [convMeta, setConvMeta] = useState<{ all_count: number; unassigned_count: number; assigned_count: number } | null>(null);
  const [channelMetas, setChannelMetas] = useState<Record<string, { all_count: number; unassigned_count: number; assigned_count: number }>>({});
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [loadingSuggestion, setLoadingSuggestion] = useState<string | null>(null);
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'other'>('all');
  const [listCollapsed, setListCollapsed] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [swipeTouchStartX, setSwipeTouchStartX] = useState<number | null>(null);
  
  // Sidebar State Variables
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'canned' | 'shopify'>('canned');

  const [cannedResponses, setCannedResponses] = useState<any[]>([]);
  const [cannedSearch, setCannedSearch] = useState('');
  const [loadingCanned, setLoadingCanned] = useState(false);
  const [showNewCannedForm, setShowNewCannedForm] = useState(false);
  const [newCannedTitle, setNewCannedTitle] = useState('');
  const [newCannedShortcut, setNewCannedShortcut] = useState('');
  const [newCannedContent, setNewCannedContent] = useState('');
  const [savingCanned, setSavingCanned] = useState(false);

  const [shopifySearch, setShopifySearch] = useState('');
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [customLinks, setCustomLinks] = useState<any[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; conv: any } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [failedMsgIds, setFailedMsgIds] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<any>(null);
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'priority'>('latest');
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Persist manuallyUnread in localStorage so it survives reloads
  const unreadStorageKey = `car_manually_unread_${profile?.id || 'default'}`;
  const [manuallyUnread, setManuallyUnreadRaw] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(`car_manually_unread_${(profile as any)?.id || 'default'}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const setManuallyUnread = (updater: Set<number> | ((prev: Set<number>) => Set<number>)) => {
    setManuallyUnreadRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem(unreadStorageKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const selectedRef = useRef<any>(null);
  selectedRef.current = selected;


  const getInboxIdForChannel = useCallback((chKey: string) => {
    if (chKey === 'all') return undefined;
    const inbox = inboxes.find(i => {
      const type = (i.channel_type || '').toLowerCase();
      if (chKey === 'whatsapp') return type.includes('whatsapp');
      if (chKey === 'instagram') return type.includes('instagram');
      if (chKey === 'facebook') return type.includes('facebook') || type.includes('page');
      if (chKey === 'email') return type.includes('email');
      return false;
    });
    return inbox?.id;
  }, [inboxes]);

  // Load inboxes once when credentials are ready
  useEffect(() => {
    if (!cwUrl || !cwToken) return;
    const initInboxes = async () => {
      try {
        const inboxList = await chatwoot.getInboxes(cwUrl, cwToken).catch(() => []);
        setInboxes(inboxList);
      } catch (err) {
        console.error("Error fetching inboxes on mount:", err);
      }
    };
    initInboxes();
  }, [cwUrl, cwToken]);

  // Load total counts for each channel key and overall counts immediately in parallel
  useEffect(() => {
    if (!cwUrl || !cwToken) return;

    const loadChannelMetas = async () => {
      try {
        // Fetch overall meta
        const overallMetaRes = await chatwoot.getConversationsMeta(cwUrl, cwToken, statusFilter).catch(() => null);
        const mOverall = overallMetaRes?.meta || overallMetaRes;
        if (mOverall) {
          setConvMeta({
            all_count: mOverall.all_count ?? 0,
            unassigned_count: mOverall.unassigned_count ?? 0,
            assigned_count: mOverall.assigned_count ?? 0
          });
        }

        if (inboxes.length === 0) return;

        const metas: Record<string, { all_count: number; unassigned_count: number; assigned_count: number }> = {};
        await Promise.all(inboxes.map(async (inbox: any) => {
          try {
            const metaRes = await chatwoot.getConversationsMeta(cwUrl, cwToken, statusFilter, inbox.id);
            const m = metaRes?.meta || metaRes;
            if (m) {
              const type = (inbox.channel_type || '').toLowerCase();
              let key = 'other';
              if (type.includes('whatsapp')) key = 'whatsapp';
              else if (type.includes('instagram')) key = 'instagram';
              else if (type.includes('facebook') || type.includes('page')) key = 'facebook';
              else if (type.includes('email')) key = 'email';

              if (!metas[key]) {
                metas[key] = { all_count: 0, unassigned_count: 0, assigned_count: 0 };
              }
              metas[key].all_count += m.all_count ?? 0;
              metas[key].unassigned_count += m.unassigned_count ?? 0;
              metas[key].assigned_count += m.assigned_count ?? 0;
            }
          } catch (err) {
            console.error('Error fetching meta for inbox', inbox.id, err);
          }
        }));
        setChannelMetas(metas);
      } catch (err) {
        console.error('Error loading channel metas:', err);
      }
    };

    loadChannelMetas();
  }, [cwUrl, cwToken, inboxes, statusFilter]);

  const loadConversations = useCallback(async () => {
    if (!cwUrl || !cwToken) return;
    setLoading(true);
    setError(null);
    setConversations([]);
    setCurrentPage(1);
    setHasMore(false);
    try {
      const inboxId = getInboxIdForChannel(channelFilter);
      const [firstPageRes, sm] = await Promise.all([
        chatwoot.getConversationsPage(cwUrl, cwToken, statusFilter, 1, inboxId),
        chatwoot.getSummary(cwUrl, cwToken, Math.floor(new Date().setHours(0,0,0,0)/1000), Math.floor(Date.now()/1000)).catch(() => null),
      ]);

      const { payload: firstPayload, hasMore: firstHasMore, meta } = firstPageRes;
      setSummary(sm);
      if (meta && channelFilter === 'all') {
        setConvMeta({ all_count: meta.all_count ?? 0, unassigned_count: meta.unassigned_count ?? 0, assigned_count: meta.assigned_count ?? 0 });
      }

      setConversations(firstPayload);
      setHasMore(firstHasMore);
      setCurrentPage(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [cwUrl, cwToken, statusFilter, channelFilter, getInboxIdForChannel]);

  const loadMoreConversations = useCallback(async () => {
    if (!cwUrl || !cwToken || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      const inboxId = getInboxIdForChannel(channelFilter);
      const { payload, hasMore: more } = await chatwoot.getConversationsPage(cwUrl, cwToken, statusFilter, nextPage, inboxId);
      setConversations(prev => {
        const prevIds = new Set(prev.map(c => c.id));
        const filteredPayload = payload.filter(c => !prevIds.has(c.id));
        return [...prev, ...filteredPayload];
      });
      setCurrentPage(nextPage);
      setHasMore(more);
    } catch {} finally {
      setLoadingMore(false);
    }
  }, [cwUrl, cwToken, currentPage, loadingMore, hasMore, statusFilter, channelFilter, getInboxIdForChannel]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Auto-load more pages whenever there are more available
  useEffect(() => {
    if (!hasMore || loadingMore || loading) return;
    const t = setTimeout(() => {
      if (hasMore && !loadingMore) loadMoreConversations();
    }, 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length, hasMore, loadingMore, loading]);

  // WebSocket real-time connection to Chatwoot
  useEffect(() => {
    if (!cwUrl || !cwToken) return;
    let ws: WebSocket | null = null;
    let pingInterval: any = null;
    let reconnectTimeout: any = null;

    const connect = async () => {
      try {
        const { pubsub_token } = await chatwoot.getProfile(cwUrl, cwToken);
        if (!pubsub_token) return;

        const wsUrl = cwUrl.replace(/^https?/, (m: string) => m === 'https' ? 'wss' : 'ws') + '/cable';
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          ws!.send(JSON.stringify({
            command: 'subscribe',
            identifier: JSON.stringify({ channel: 'RoomChannel', pubsub_token })
          }));
          pingInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            const frame = JSON.parse(event.data);
            if (frame.type === 'ping' || frame.type === 'welcome' || frame.type === 'confirm_subscription') return;
            const msg = frame.message;
            if (!msg?.event) return;

            if (msg.event === 'message.created') {
              const d = msg.data;
              // Update last message preview in conversation list
              setConversations(prev => prev.map(c =>
                c.id === d.conversation_id
                  ? { 
                      ...c, 
                      last_activity_at: d.created_at, 
                      messages: [d, ...(c.messages || [])], 
                      unread_count: selectedRef.current?.id === d.conversation_id ? 0 : (c.unread_count || 0) + (d?.message_type === 0 ? 1 : 0),
                      ...(d?.message_type !== 2 ? { last_non_activity_message: d } : {})
                    }
                  : c
              ));
              // Append to open chat
              if (selectedRef.current?.id === d.conversation_id) {
                setMessages(prev => {
                  if (prev.find((m: any) => m.id === d.id)) return prev;
                  return [...prev, d];
                });
              }
            } else if (msg.event === 'conversation.created') {
              const d = msg.data;
              setConversations(prev => prev.find(c => c.id === d.id) ? prev : [d, ...prev]);
            } else if (msg.event === 'conversation.read') {
              const d = msg.data;
              setConversations(prev => prev.map(c => c.id === d.id ? { ...c, unread_count: 0 } : c));
            } else if (msg.event === 'conversation.status_changed') {
              const d = msg.data;
              setConversations(prev => prev.map(c => c.id === d.id ? { ...c, status: d.status } : c));
              if (selectedRef.current?.id === d.id) setSelected((s: any) => s ? { ...s, status: d.status } : s);
            } else if (msg.event === 'conversation.updated') {
              const d = msg.data;
              setConversations(prev => prev.map(c => c.id === d.id ? { ...c, ...d } : c));
            }
          } catch {}
        };

        ws.onclose = () => {
          clearInterval(pingInterval);
          reconnectTimeout = setTimeout(connect, 5000);
        };
        ws.onerror = () => ws?.close();
      } catch {}
    };

    connect();
    return () => {
      clearInterval(pingInterval);
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [cwUrl, cwToken]);

  // Poll conversations list every 20s
  useEffect(() => {
    if (!cwUrl || !cwToken) return;
    const refreshConvList = async () => {
      try {
        const { payload } = await chatwoot.getConversationsPage(cwUrl, cwToken, statusFilter, 1);
        setConversations(prev => {
          // Merge: update existing + prepend new ones
          const prevIds = new Set(prev.map((c: any) => c.id));
          const newOnes = payload.filter((c: any) => !prevIds.has(c.id));
          const updated = prev.map((c: any) => payload.find((p: any) => p.id === c.id) || c);
          return [...newOnes, ...updated];
        });
      } catch {}
    };
    const interval = setInterval(refreshConvList, 20000);
    return () => clearInterval(interval);
  }, [cwUrl, cwToken, statusFilter]);

  const generateAiDraft = async () => {
    if (!profile?.id || !selected || messages.length === 0) return;
    setGeneratingDraft(true);
    setSendError(null);
    try {
      const realMessages = messages.filter((m: any) => m?.message_type !== 2);
      const last15 = realMessages.slice(-15);
      const lastIncoming = [...last15].reverse().find((m: any) => m?.message_type === 0);
      const lastMsg = last15[last15.length - 1];
      const history = last15.map((m: any) => {
        const who = m?.message_type === 1 ? 'Agente' : (contact(selected).name || 'Cliente');
        return `${who}: ${m?.content || '[archivo adjunto]'}`;
      });
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: profile.id,
          itemText: lastIncoming?.content || lastMsg?.content || '',
          username: contact(selected).name || contact(selected).phone_number || 'Cliente',
          conversationHistory: history,
          isDM: true,
        }),
      });
      if (!res.ok) throw new Error('Error al generar borrador');
      const data = await res.json();
      if (data.draft && selectedRef.current?.id === selected.id) {
        setReply(data.draft);
      }
    } catch (e: any) {
      setSendError('No se pudo generar el borrador con IA.');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const loadMessages = useCallback(async (conv: any) => {
    if (!cwUrl || !cwToken) return;
    setExpanded(false);
    setSelected(conv);
    if (window.innerWidth < 768) setMobileShowChat(true);
    // Clear "manually unread" when opening
    setManuallyUnread(prev => { const s = new Set(prev); s.delete(conv.id); return s; });
    setMessages([]);
    setReply('');
    setSendError(null);
    setLoadingSuggestion(null);
    setLoadingMsgs(true);
    try {
      const msgs = await chatwoot.getMessages(cwUrl, cwToken, conv.id);
      const sorted = msgs.sort((a: any, b: any) => a.created_at - b.created_at);
      setMessages(sorted);
      // Auto mark as read
      if (conv.unread_count > 0) {
        chatwoot.markAsRead(cwUrl, cwToken, conv.id).catch(() => {});
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
      }
    } catch (e: any) {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, [cwUrl, cwToken]);


  // Load conversation from URL search parameter convId if present
  useEffect(() => {
    if (conversations.length > 0 && !selected) {
      const params = new URLSearchParams(location.search);
      const convIdParam = params.get('convId');
      if (convIdParam) {
        const convId = parseInt(convIdParam, 10);
        const found = conversations.find(c => c.id === convId);
        if (found) {
          loadMessages(found);
          // Clear query param so it doesn't re-trigger on subsequent updates
          navigate('/atencion', { replace: true });
        }
      }
    }
  }, [conversations, location.search, selected, loadMessages, navigate]);

  // Poll messages of selected conversation every 5s
  useEffect(() => {
    if (!cwUrl || !cwToken || !selected) return;
    const pollMessages = async () => {
      try {
        const msgs = await chatwoot.getMessages(cwUrl, cwToken, selected.id);
        const sorted = msgs.sort((a: any, b: any) => a.created_at - b.created_at);
        setMessages(prev => {
          if (sorted.length === prev.length && sorted[sorted.length - 1]?.id === prev[prev.length - 1]?.id) return prev;
          return sorted;
        });
      } catch {}
    };
    const interval = setInterval(pollMessages, 5000);
    return () => clearInterval(interval);
  }, [cwUrl, cwToken, selected?.id]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isAtBottom) container.scrollTop = container.scrollHeight;
  }, [messages]);

  // Lock body scroll when mobile chat is open (prevents iOS from scrolling page behind)
  useEffect(() => {
    if (mobileShowChat) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      window.scrollTo(0, 0);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [mobileShowChat]);

  // Scroll to bottom when chat opens (not on every message update)
  const prevSelectedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (selected?.id && selected.id !== prevSelectedIdRef.current) {
      prevSelectedIdRef.current = selected.id;
      if (!loadingMsgs && messages.length > 0) {
        messagesContainerRef.current?.scrollTo({ top: messagesContainerRef.current.scrollHeight });
      }
    }
  }, [selected?.id, loadingMsgs, messages.length]);

  const loadCannedResponses = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingCanned(true);
    try {
      const { data, error } = await supabase
        .from('car_canned_responses')
        .select('*')
        .eq('client_id', profile.id)
        .order('title');

      if (error) throw error;
      setCannedResponses(data || []);
    } catch (err) {
      console.warn('Error loading canned responses from Supabase, falling back to localStorage:', err);
      const localDataStr = localStorage.getItem(`car_canned_responses_${profile.id}`);
      if (localDataStr) {
        try {
          setCannedResponses(JSON.parse(localDataStr));
        } catch {
          setupDefaultCannedResponses();
        }
      } else {
        setupDefaultCannedResponses();
      }
    } finally {
      setLoadingCanned(false);
    }
  }, [profile?.id]);

  const setupDefaultCannedResponses = useCallback(() => {
    const defaults = [
      {
        id: 'default_saludo',
        title: 'Saludo Inicial',
        shortcut: 'saludo',
        content: '¡Hola! ¿Cómo estás? Gracias por contactarte con nosotros. ¿En qué te puedo ayudar hoy? 😊'
      },
      {
        id: 'default_ubicacion',
        title: 'Ubicación y Horarios',
        shortcut: 'ubicacion',
        content: 'Nuestras oficinas y local principal están ubicados en Buenos Aires. Atendemos de Lunes a Viernes de 9:00 a 18:00 hs. ¡Te esperamos! 📍'
      },
      {
        id: 'default_envios',
        title: 'Envíos y Tiempos de Entrega',
        shortcut: 'envios',
        content: 'Hacemos envíos a todo el país. Los despachos se realizan dentro de las 24-48 horas hábiles de confirmada la compra. El tiempo estimado de entrega es de 3 a 5 días hábiles según la localidad. 🚚'
      },
      {
        id: 'default_pagos',
        title: 'Medios de Pago',
        shortcut: 'pagos',
        content: 'Aceptamos Mercado Pago (tarjetas de crédito y débito, transferencia y efectivo en Rapipago/Pago Fácil) y transferencia bancaria directa con un 10% de descuento. 💳'
      },
      {
        id: 'default_cambios',
        title: 'Cambios y Devoluciones',
        shortcut: 'cambios',
        content: 'Podés realizar cambios dentro de los 30 días de haber recibido tu compra. El producto debe estar en perfectas condiciones, con etiqueta y en su empaque original. Escribinos para coordinar el cambio. 📦'
      }
    ];
    setCannedResponses(defaults);
    if (profile?.id) {
      localStorage.setItem(`car_canned_responses_${profile.id}`, JSON.stringify(defaults));
    }
  }, [profile?.id]);

  const handleCreateCannedResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id || !newCannedTitle.trim() || !newCannedContent.trim()) return;
    setSavingCanned(true);
    const newResponse = {
      client_id: profile.id,
      shortcut: newCannedShortcut.trim().toLowerCase() || newCannedTitle.trim().toLowerCase().replace(/\s+/g, '-'),
      title: newCannedTitle.trim(),
      content: newCannedContent.trim()
    };

    try {
      const { data, error } = await supabase
        .from('car_canned_responses')
        .insert([newResponse])
        .select();

      if (error) throw error;
      setCannedResponses(prev => [...prev, ...(data || [])].sort((a,b) => a.title.localeCompare(b.title)));
      
      setNewCannedTitle('');
      setNewCannedShortcut('');
      setNewCannedContent('');
      setShowNewCannedForm(false);
    } catch (err) {
      console.warn('Error saving canned response to Supabase, saving to localStorage:', err);
      const updated = [
        ...cannedResponses,
        {
          id: `local_${Date.now()}`,
          ...newResponse
        }
      ].sort((a,b) => a.title.localeCompare(b.title));
      setCannedResponses(updated);
      localStorage.setItem(`car_canned_responses_${profile.id}`, JSON.stringify(updated));

      setNewCannedTitle('');
      setNewCannedShortcut('');
      setNewCannedContent('');
      setShowNewCannedForm(false);
    } finally {
      setSavingCanned(false);
    }
  };

  const handleDeleteCannedResponse = async (id: any) => {
    if (!profile?.id) return;
    if (!window.confirm('¿Seguro que querés eliminar esta respuesta rápida?')) return;
    try {
      if (typeof id === 'number' || (typeof id === 'string' && !id.startsWith('default_') && !id.startsWith('local_'))) {
        const { error } = await supabase
          .from('car_canned_responses')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }
      const updated = cannedResponses.filter(r => r.id !== id);
      setCannedResponses(updated);
      localStorage.setItem(`car_canned_responses_${profile.id}`, JSON.stringify(updated));
    } catch (err) {
      console.error('Error deleting canned response:', err);
      const updated = cannedResponses.filter(r => r.id !== id);
      setCannedResponses(updated);
      localStorage.setItem(`car_canned_responses_${profile.id}`, JSON.stringify(updated));
    }
  };

  const loadCustomLinks = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingLinks(true);
    try {
      const { data, error } = await supabase
        .from('car_links')
        .select('*')
        .eq('client_id', profile.id)
        .order('sort_order');
      if (error) throw error;
      setCustomLinks(data || []);
    } catch (err) {
      console.error('Error loading custom links:', err);
    } finally {
      setLoadingLinks(false);
    }
  }, [profile?.id]);

  const searchShopifyProducts = useCallback(async (query: string) => {
    if (!profile?.shopify_domain || !profile?.shopify_access_token) return;
    setLoadingProducts(true);
    try {
      const cleanDomain = profile.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const url = `/api/shopify/products.json?limit=15${query ? `&title=${encodeURIComponent(query)}` : ''}`;
      
      const res = await fetch(url, {
        headers: {
          'x-shopify-domain': cleanDomain,
          'x-shopify-access-token': profile.shopify_access_token
        }
      });
      if (res.ok) {
        const data = await res.json();
        setShopifyProducts(data.products || []);
      } else {
        console.error('Failed to fetch shopify products');
      }
    } catch (err) {
      console.error('Error searching Shopify products:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, [profile?.shopify_domain, profile?.shopify_access_token]);

  useEffect(() => {
    if (profile?.id) {
      loadCannedResponses();
      loadCustomLinks();
      if (profile.shopify_domain && profile.shopify_access_token) {
        searchShopifyProducts('');
      }
    }
  }, [profile?.id, loadCannedResponses, loadCustomLinks, searchShopifyProducts, profile?.shopify_domain, profile?.shopify_access_token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (profile?.shopify_domain && profile?.shopify_access_token) {
        searchShopifyProducts(shopifySearch);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [shopifySearch, searchShopifyProducts, profile?.shopify_domain, profile?.shopify_access_token]);


  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !selected || !cwUrl || !cwToken) return;
    setSending(true);
    setSendError(null);
    const tempId = `local_${Date.now()}`;
    const tempMsg = { id: tempId, content: reply.trim(), message_type: 1, created_at: Date.now() / 1000, pending: true };
    
    // Update active chat messages
    setMessages(prev => [...prev, tempMsg]);
    
    // Update conversations list preview immediately with temp message
    setConversations(prev => prev.map(c => 
      c.id === selected.id 
        ? { 
            ...c, 
            last_activity_at: tempMsg.created_at, 
            messages: [tempMsg, ...(c.messages || [])],
            last_non_activity_message: tempMsg
          } 
        : c
    ));

    const sentText = reply.trim();
    setReply('');
    try {
      const sent = await chatwoot.sendMessage(cwUrl, cwToken, selected.id, sentText);
      // Replace temp with real message in active chat
      setMessages(prev => prev.map((m: any) => m.id === tempId ? { ...sent, created_at: sent?.created_at || Date.now()/1000 } : m));
      // Replace temp with real message in conversations list preview
      setConversations(prev => prev.map(c => 
        c.id === selected.id 
          ? { 
              ...c, 
              last_activity_at: sent?.created_at || Date.now()/1000, 
              messages: [sent, ...(c.messages || []).filter((m: any) => m.id !== tempId)],
              last_non_activity_message: sent
            } 
          : c
      ));
    } catch (e: any) {
      // Mark temp message as failed in active chat
      setFailedMsgIds(prev => new Set([...prev, tempId]));
      setSendError(e.message || 'No se pudo enviar el mensaje.');
      // Remove temp message from conversation list on failure
      setConversations(prev => prev.map(c => 
        c.id === selected.id 
          ? { 
              ...c, 
              messages: (c.messages || []).filter((m: any) => m.id !== tempId) 
            } 
          : c
      ));
    } finally {
      setSending(false);
    }
  };

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCtxAction = async (action: string, conv: any) => {
    setCtxMenu(null);
    if (!cwUrl || !cwToken) return;

    // ── Mark as unread ────────────────────────────────────────────────
    if (action === 'unread') {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 1 } : c));
      setManuallyUnread(prev => new Set([...prev, conv.id]));
      showToast('Marcado como no leído', 'success');
      chatwoot.markAsUnread(cwUrl, cwToken, conv.id).catch(() => {});
      return;
    }

    // ── Optimistic UI update FIRST, then API ──────────────────────────
    if (action === 'read') {
      // Update UI immediately
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
      setManuallyUnread(prev => { const s = new Set(prev); s.delete(conv.id); return s; });
      showToast('Marcado como leído', 'success');
      // Fire API in background — ignore errors (UI already updated)
      chatwoot.markAsRead(cwUrl, cwToken, conv.id).catch(() => {});
      return;
    }

    if (action === 'resolved' || action === 'open' || action === 'pending') {
      const newStatus = action;
      // Optimistic: remove or update in list
      const shouldRemove = statusFilter !== 'all' && statusFilter !== newStatus;
      setConversations(prev => shouldRemove
        ? prev.filter(c => c.id !== conv.id)
        : prev.map(c => c.id === conv.id ? { ...c, status: newStatus } : c)
      );
      if (shouldRemove && selected?.id === conv.id) { setSelected(null); setMessages([]); }
      else if (selected?.id === conv.id) setSelected((s: any) => s ? { ...s, status: newStatus } : s);
      const labels: Record<string, string> = { resolved: 'Resuelta ✅', open: 'Abierta 📂', pending: 'Pendiente ⏳' };
      showToast(labels[newStatus], 'success');
      // API in background
      chatwoot.updateStatus(cwUrl, cwToken, conv.id, newStatus).catch(e => {
        showToast(`No se pudo sincronizar: ${e.message}`, 'error');
      });
      return;
    }

    if (action === 'snooze') {
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      if (selected?.id === conv.id) { setSelected(null); setMessages([]); }
      showToast('Pospuesto 1 hora ⏰', 'success');
      const snoozed_until = Math.floor(Date.now() / 1000) + 3600;
      chatwoot.updateStatus(cwUrl, cwToken, conv.id, 'snoozed', { snoozed_until }).catch(e => {
        showToast(`No se pudo sincronizar: ${e.message}`, 'error');
      });
      return;
    }

    if (action === 'priority_high') {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, priority: 'high' } : c));
      showToast('Prioridad alta 🔴', 'success');
      chatwoot.updatePriority(cwUrl, cwToken, conv.id, 'high').catch(() => {});
      return;
    }

    if (action === 'priority_none') {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, priority: 'none' } : c));
      showToast('Sin prioridad ⚪', 'success');
      chatwoot.updatePriority(cwUrl, cwToken, conv.id, 'none').catch(() => {});
      return;
    }

    if (action === 'delete') {
      if (!window.confirm('¿Eliminar esta conversación? Esta acción no se puede deshacer.')) return;
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      if (selected?.id === conv.id) { setSelected(null); setMessages([]); }
      showToast('Conversación eliminada', 'success');
      chatwoot.deleteConversation(cwUrl, cwToken, conv.id).catch(e => {
        showToast(`No se pudo eliminar en servidor: ${e.message}`, 'error');
      });
    }
  };



  const contact = (c: any) => {
    if (!c) return {};
    return c.meta?.sender || c.contact_inbox?.contact || {};
  };
  const getChannel = (c: any) => {
    if (!c) return 'other';
    const inbox = c.inbox || inboxes.find((i: any) => i.id === c.inbox_id);
    const ch = (c.channel || inbox?.channel_type || '').toLowerCase();
    if (ch.includes('whatsapp')) return 'whatsapp';
    if (ch.includes('instagram')) return 'instagram';
    if (ch.includes('facebook') || ch.includes('page')) return 'facebook';
    if (ch.includes('email')) return 'email';
    return 'other';
  };

  const getChannelBadgeClass = (c: any, isSelected: boolean) => {
    const ch = getChannel(c);
    if (isSelected) {
      return 'bg-white/20 text-white border-transparent';
    }
    if (ch === 'whatsapp') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30';
    if (ch === 'instagram') return 'bg-pink-50 text-pink-700 dark:bg-pink-950/30 dark:text-pink-400 border border-pink-200/50 dark:border-pink-900/30';
    if (ch === 'facebook') return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200/50 dark:border-blue-900/30';
    if (ch === 'email') return 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400 border border-violet-200/50 dark:border-violet-800/30';
    return 'bg-zinc-50 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700';
  };

  const isChannelActive = (channelKey: string) => {
    if (channelKey === 'all') return true;
    const hasInbox = inboxes.some(inbox => {
      const type = (inbox.channel_type || '').toLowerCase();
      if (channelKey === 'whatsapp') return type.includes('whatsapp');
      if (channelKey === 'instagram') return type.includes('instagram');
      if (channelKey === 'facebook') return type.includes('facebook') || type.includes('page');
      if (channelKey === 'email') return type.includes('email');
      if (channelKey === 'other') {
        return !type.includes('whatsapp') && 
               !type.includes('instagram') && 
               !type.includes('facebook') && 
               !type.includes('page') && 
               !type.includes('email');
      }
      return false;
    });
    if (hasInbox) return true;
    return conversations.some(c => getChannel(c) === channelKey);
  };

  const getChannelCount = (channelKey: string) => {
    if (channelKey === 'all') {
      return convMeta?.all_count !== undefined ? convMeta.all_count : conversations.length;
    }
    return channelMetas[channelKey]?.all_count !== undefined
      ? channelMetas[channelKey].all_count
      : conversations.filter(c => getChannel(c) === channelKey).length;
  };

  const CHANNEL_ICON: Record<string, string> = { whatsapp: '📱', instagram: '📸', facebook: '📘', email: '📧', other: '💬' };
  const CHANNEL_COLOR: Record<string, string> = { whatsapp: 'bg-emerald-500', instagram: 'bg-pink-500', facebook: 'bg-blue-600', email: 'bg-violet-500', other: 'bg-zinc-500' };

  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-pink-500 to-rose-500 text-white',
      'from-violet-500 to-purple-500 text-white',
      'from-blue-500 to-indigo-500 text-white',
      'from-emerald-500 to-teal-500 text-white',
      'from-amber-500 to-orange-500 text-white',
      'from-sky-500 to-cyan-500 text-white',
    ];
    if (!name) return gradients[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  };

  const getChannelLabel = (c: any) => {
    if (!c) return 'Canal';
    const ch = getChannel(c);
    if (ch === 'whatsapp') return 'WhatsApp';
    if (ch === 'instagram') return 'Instagram';
    if (ch === 'facebook') return 'Facebook';
    if (ch === 'email') return 'Email';
    if (c.inbox?.name) {
      return c.inbox.name.replace(/\+?\d[\d\s-]{5,}/g, '').trim() || 'Canal';
    }
    return 'Canal';
  };

  const renderAvatar = (conv: any) => {
    const c = contact(conv);
    const name = c.name || '';
    const initials = name
      ? name.split(' ').filter(Boolean).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
      : '';
    
    const ch = getChannel(conv);
    const gradient = getAvatarGradient(name || String(conv.id));

    return (
      <div className="relative flex-shrink-0 select-none">
        {initials ? (
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-black bg-gradient-to-br shadow-inner ${gradient}`}>
            {initials}
          </div>
        ) : (
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[15px] bg-gradient-to-br ${gradient}`}>
            {CHANNEL_ICON[ch]}
          </div>
        )}
        <span className="absolute -bottom-1.5 -right-1.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] shadow bg-white dark:bg-zinc-900 border border-zinc-150/80 dark:border-zinc-800 select-none">
          {CHANNEL_ICON[ch]}
        </span>
      </div>
    );
  };

  const getComputedActivityTimestamp = (c: any) => {
    const ts = c?.last_non_activity_message?.created_at || c?.last_activity_at || c?.created_at;
    if (!ts) return 0;
    if (typeof ts === 'number') return ts > 10000000000 ? ts / 1000 : ts;
    const d = new Date(ts).getTime();
    return isNaN(d) ? 0 : d / 1000;
  };

  const sortedConversations = [...conversations].sort((a, b) => {
    const tsA = getComputedActivityTimestamp(a);
    const tsB = getComputedActivityTimestamp(b);
    if (sortBy === 'oldest') return tsA - tsB;
    if (sortBy === 'priority') {
      const p: any = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      return (p[a.priority] ?? 4) - (p[b.priority] ?? 4);
    }
    return tsB - tsA;
  });

  const channelFilteredConversations = sortedConversations.filter(c => {
    if (channelFilter === 'all') return true;
    return getChannel(c) === channelFilter;
  });

  const assignFiltered = channelFilteredConversations.filter(c => {
    if (assignFilter === 'unassigned') return !c.meta?.assignee;
    if (assignFilter === 'mine') return !!c.meta?.assignee;
    return true;
  });

  const filtered = assignFiltered.filter(c => {
    if (!c) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const name = (c.meta?.sender?.name || '').toLowerCase();
    const phone = c.meta?.sender?.phone_number || '';
    const email = (c.meta?.sender?.email || '').toLowerCase();
    const lastReal = c.messages?.find((m: any) => m?.message_type !== 2) || c.last_non_activity_message;
    const lastMsg = (lastReal?.content || '').toLowerCase();
    return name.includes(s) || phone.includes(s) || email.includes(s) || String(c.id).includes(s) || lastMsg.includes(s);
  });

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(c => c.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkAction = async (action: string) => {
    if (!cwUrl || !cwToken || selectedIds.size === 0) return;
    if (action === 'delete') {
      if (!window.confirm(`¿Eliminar ${selectedIds.size} conversación${selectedIds.size > 1 ? 'es' : ''}? Esta acción no se puede deshacer.`)) return;
    }
    const ids = [...selectedIds];
    // Optimistic UI update immediately
    if (action === 'delete') {
      setConversations(prev => prev.filter(c => !selectedIds.has(c.id)));
      if (selected && selectedIds.has(selected.id)) { setSelected(null); setMessages([]); }
    }
    if (action === 'read') {
      setConversations(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, unread_count: 0 } : c));
      setManuallyUnread(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s; });
    }
    if (action === 'unread') {
      setConversations(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, unread_count: 1 } : c));
      setManuallyUnread(prev => new Set([...prev, ...ids]));
    }
    clearSelection();
    setBulkLoading(true);
    try {
      await Promise.all(ids.map(id => {
        if (action === 'delete') return chatwoot.deleteConversation(cwUrl, cwToken, id);
        if (action === 'unread') return chatwoot.markAsUnread(cwUrl, cwToken, id);
        if (action === 'read') return chatwoot.markAsRead(cwUrl, cwToken, id);
        return Promise.resolve();
      }));
      const labels: Record<string, string> = { read: `${ids.length} marcados como leídos`, unread: `${ids.length} marcados como no leídos`, delete: `${ids.length} conversaciones eliminadas` };
      showToast(labels[action] || 'Listo', 'success');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const channelFilteredRaw = conversations.filter(c => {
    if (channelFilter === 'all') return true;
    return getChannel(c) === channelFilter;
  });

  const totalCount = channelFilter === 'all'
    ? (convMeta?.all_count !== undefined ? convMeta.all_count : conversations.length)
    : (channelMetas[channelFilter]?.all_count !== undefined ? channelMetas[channelFilter].all_count : channelFilteredRaw.length);

  const unassignedCount = channelFilter === 'all'
    ? (convMeta?.unassigned_count !== undefined ? convMeta.unassigned_count : conversations.filter(c => !c.meta?.assignee).length)
    : (channelMetas[channelFilter]?.unassigned_count !== undefined ? channelMetas[channelFilter].unassigned_count : channelFilteredRaw.filter(c => !c.meta?.assignee).length);

  const assignedCount = channelFilter === 'all'
    ? (convMeta?.assigned_count !== undefined ? convMeta.assigned_count : conversations.filter(c => !!c.meta?.assignee).length)
    : (channelMetas[channelFilter]?.assigned_count !== undefined ? channelMetas[channelFilter].assigned_count : channelFilteredRaw.filter(c => !!c.meta?.assignee).length);

  const adjustMobileTextarea = useCallback(() => {
    requestAnimationFrame(() => {
      const ta = mobileTextareaRef.current;
      if (!ta) return;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
    });
  }, []);

  const handleMicPress = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' });
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const mimeType = mr.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setTranscribing(true);
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = (reader.result as string).split(',')[1];
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: base64, mimeType }),
            });
            const data = await res.json();
            if (data.text) {
              setReply(prev => (prev ? prev + ' ' : '') + data.text);
              setTimeout(adjustMobileTextarea, 50);
            }
          };
          reader.readAsDataURL(blob);
        } catch (e) { console.error('Transcription error', e); }
        finally { setTranscribing(false); }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (e) {
      alert('No se pudo acceder al micrófono. Verificá los permisos.');
    }
  };

  if (!cwUrl || !cwToken) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="bg-amber-50 dark:bg-amber-955/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 max-w-md flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-800 dark:text-amber-400 text-[14px]">Canal de atención no configurado</h3>
            <p className="text-[12px] text-amber-600 dark:text-amber-500 mt-1">Completá la URL y el token en Administración → Gestión de Clientes.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a0a]">

      {/* Top Header Bar */}
      <div className="flex items-center gap-2 p-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0 w-full animate-in fade-in duration-200">
        {/* Left Section: Status filter + Channel Filter Pills (Desktop only) */}
        <div className="hidden md:flex items-center gap-2 overflow-x-auto no-scrollbar flex-1">
          {[
            { key: 'all',       label: 'Todos',     icon: Inbox,         activeClass: 'bg-zinc-900 border-zinc-900 dark:bg-zinc-100 dark:border-zinc-100 text-white dark:text-zinc-900', iconColor: '' },
            { key: 'whatsapp',  label: 'WhatsApp',  icon: MessageCircle, activeClass: 'bg-green-500 border-green-500 text-white',                                                         iconColor: 'text-green-500' },
            { key: 'instagram', label: 'Instagram', icon: Instagram,     activeClass: 'bg-pink-500 border-pink-500 text-white',                                                           iconColor: 'text-pink-500' },
            { key: 'facebook',  label: 'Facebook',  icon: Facebook,      activeClass: 'bg-blue-600 border-blue-600 text-white',                                                           iconColor: 'text-blue-500' },
            { key: 'email',     label: 'Email',     icon: Mail,          activeClass: 'bg-sky-500 border-sky-500 text-white',                                                             iconColor: 'text-sky-500' },
            { key: 'other',     label: 'Otros',     icon: Globe,         activeClass: 'bg-zinc-900 border-zinc-900 dark:bg-zinc-100 dark:border-zinc-100 text-white dark:text-zinc-900', iconColor: '' },
          ].filter(ch => isChannelActive(ch.key)).map(ch => {
            const Icon = ch.icon;
            const isActive = channelFilter === ch.key;
            const count = getChannelCount(ch.key);
            return (
              <button
                key={ch.key}
                onClick={() => setChannelFilter(ch.key as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all duration-200 whitespace-nowrap border ${
                  isActive
                    ? `${ch.activeClass} shadow-sm`
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? '' : ch.iconColor}`} />
                <span>{ch.label}</span>
                {count > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.25 rounded-full font-black ${
                    isActive ? 'bg-white/20 text-white dark:bg-black/10 dark:text-inherit' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Section: Search & Controls (Controls hidden on mobile) */}
        <div className="flex items-center gap-2 flex-1 md:flex-initial md:ml-auto">
          {/* Search Input (Full width on mobile) */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Buscar contacto, teléfono..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-zinc-750 dark:text-zinc-300 transition-all" 
            />
          </div>

          {/* Sort button (Desktop only) */}
          <div className="hidden md:block relative group">
            <button className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Ordenar">
              <svg className="w-4 h-4 text-zinc-550" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h10M4 18h7" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="absolute right-0 top-full pt-1.5 z-50 hidden group-hover:block">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl py-1 min-w-[150px]">
                {[
                  { value: 'latest', label: '↓ Más reciente' },
                  { value: 'oldest', label: '↑ Más antiguo' },
                  { value: 'priority', label: '🔴 Por prioridad' },
                ].map(s => (
                  <button key={s.value} onClick={() => setSortBy(s.value as any)}
                    className={`w-full text-left px-3 py-2 text-[12px] transition-colors ${sortBy === s.value ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Expand button (Desktop only) */}
          <button 
            onClick={() => setExpanded(e => !e)}
            className="hidden md:block p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" 
            title={expanded ? 'Contraer' : 'Expandir lista'}
          >
            <svg className="w-4 h-4 text-zinc-550" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {expanded
                ? <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        <div className={`
          ${listCollapsed ? 'hidden' : expanded ? 'w-full' : mobileShowChat ? 'hidden md:flex md:w-[320px]' : 'w-full md:w-[320px]'}
          flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-300
        `}>

          {/* Assign tabs */}


          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800/40 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black text-blue-700 dark:text-blue-400">{selectedIds.size} seleccionados</span>
              <button onClick={selectAll} className="text-[10px] text-blue-600 dark:text-blue-400 underline">Todos</button>
              <button onClick={clearSelection} className="text-[10px] text-zinc-500 underline">Limpiar</button>
              <div className="flex gap-1 ml-auto">
                {[
                  { action: 'read', label: '✓ Leído' },
                  { action: 'unread', label: '● No leído' },
                  { action: 'delete', label: '🗑 Eliminar' },
                ].map(b => (
                  <button key={b.action} onClick={() => handleBulkAction(b.action)} disabled={bulkLoading}
                    className={`px-2 py-1 text-[10px] font-bold bg-white dark:bg-zinc-800 border rounded-lg transition-colors disabled:opacity-50 ${b.action === 'delete' ? 'border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* List */}
          <div
            className="flex-1 overflow-y-auto py-2 space-y-1 pb-20 md:pb-2"
            style={{ overflowAnchor: 'none' }}
            onScroll={(e) => {
              const target = e.currentTarget;
              if (target.scrollHeight - target.scrollTop - target.clientHeight < 100) {
                loadMoreConversations();
              }
            }}
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                <p className="text-[11px] text-zinc-400">Cargando chats...</p>
              </div>
            ) : error ? (
              <div className="p-4 text-[11px] text-red-500">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-400">
                <Inbox className="w-6 h-6" />
                <p className="text-[12px] font-medium">Sin conversaciones</p>
              </div>
            ) : filtered.map(conv => {
              const c = contact(conv);
              const sortedMsgs = [...(conv?.messages || [])].sort((x, y) => {
                const timeX = typeof x.created_at === 'number' ? x.created_at : new Date(x.created_at).getTime() / 1000;
                const timeY = typeof y.created_at === 'number' ? y.created_at : new Date(y.created_at).getTime() / 1000;
                return timeX - timeY;
              });
              const lastRealMsg = [...sortedMsgs].reverse().find((m: any) => m?.message_type !== 2) || 
                                  conv?.last_non_activity_message || 
                                  (sortedMsgs.length > 0 ? sortedMsgs[sortedMsgs.length - 1] : null);
              const lastMsg = lastRealMsg;
              const isSelected = selected?.id === conv?.id;
              const isManualUnread = manuallyUnread.has(conv?.id);
              const unread = isManualUnread ? Math.max(1, conv?.unread_count || 0) : (conv?.unread_count || 0);
              const isUnread = unread > 0 || isManualUnread;
              const activityTimestamp = lastRealMsg?.created_at || conv?.last_non_activity_message?.created_at || conv?.last_activity_at || conv?.created_at;
              return (
                <div key={conv.id}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, conv }); }}
                  onClick={() => loadMessages(conv)}
                  className={`mx-2 my-0.5 px-3 py-2.5 flex items-start gap-2.5 transition-all duration-200 cursor-pointer rounded-xl group/conv ${
                    isSelected 
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/10' 
                      : isUnread 
                        ? 'bg-zinc-50/80 dark:bg-zinc-900/60' 
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/30'
                  }`}
                >
                  {/* Selection dot — only visible when this conv is selected */}
                  {selectedIds.has(conv.id) && (
                    <div className="flex-shrink-0 mt-2.5 w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
                  
                  {/* Card content click target */}
                  <div className="flex-1 flex items-start gap-2.5 min-w-0">
                    {renderAvatar(conv)}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        {/* Contact name as primary */}
                        <span className={`text-[12.5px] truncate ${
                          isSelected ? 'font-bold text-white'
                          : isUnread ? 'font-black text-zinc-900 dark:text-white'
                          : 'font-semibold text-zinc-700 dark:text-zinc-300'
                        }`}>
                          {c.name || `#${conv.id}`}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[10px] ${isSelected ? 'text-blue-200' : 'text-zinc-400'}`}>
                            {fmtTime(activityTimestamp)}
                          </span>
                          {unread > 0 && !isSelected && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 shadow-sm">
                              {unread > 9 ? '9+' : unread}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Channel badge — no phone number */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[8.5px] px-1.5 py-0.5 rounded-full uppercase font-black tracking-wider ${getChannelBadgeClass(conv, isSelected)}`}>
                          {getChannelLabel(conv)}
                        </span>
                      </div>
                      
                      {(lastMsg?.content || lastMsg?.attachments?.length > 0) && (
                        <p className={`text-[11px] truncate mt-0.5 ${
                          isSelected 
                            ? 'text-blue-100' 
                            : isUnread 
                              ? 'text-zinc-700 dark:text-zinc-300 font-semibold' 
                              : 'text-zinc-450 italic'
                        }`}>
                          {lastMsg?.message_type === 1 && (
                            <span className={`font-bold mr-1 ${isSelected ? 'text-blue-100' : 'text-zinc-550 dark:text-zinc-400'}`}>Vos:</span>
                          )}
                          {lastMsg?.content || <span className="opacity-60">📎 Archivo adjunto</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Scroll sentinel — loads more when reached */}
            {hasMore && (
              <div className="flex items-center justify-center py-3 text-[10px] text-zinc-400 gap-1.5">
                {loadingMore ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Cargando más...</>
                ) : (
                  <span className="opacity-50">↓ Más conversaciones</span>
                )}
              </div>
            )}

          </div>

          {/* Mobile Floating Bottom Bar */}
          {/* Mobile bottom tab bar — full width, stuck to bottom */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex items-stretch z-40 select-none safe-area-bottom">
            {[
              { key: 'all', icon: Inbox, label: 'Todos' },
              { key: 'whatsapp', icon: MessageCircle, label: 'WhatsApp' },
              { key: 'instagram', icon: Instagram, label: 'Instagram' },
              { key: 'facebook', icon: Facebook, label: 'Facebook' },
              { key: 'email', icon: Mail, label: 'Email' },
            ].filter(ch => isChannelActive(ch.key)).map(ch => {
              const Icon = ch.icon;
              const isActive = channelFilter === ch.key;
              const count = getChannelCount(ch.key);
              return (
                <button
                  key={ch.key}
                  onClick={() => setChannelFilter(ch.key as any)}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-all ${
                    isActive
                      ? 'text-zinc-900 dark:text-white'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-zinc-900 dark:bg-white rounded-full" />}
                  <div className="relative">
                    <Icon className="w-5 h-5" />
                    {count > 0 && !isActive && (
                      <span className="absolute -top-1.5 -right-2 bg-emerald-500 text-white text-[8px] font-black min-w-[16px] h-4 rounded-full flex items-center justify-center px-0.5 border border-white dark:border-zinc-950">
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </div>
                  <span className={`text-[9px] font-bold leading-none ${isActive ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'}`}>{ch.label}</span>
                </button>
              );
            })}

          </div>
        </div>

        {/* RIGHT: chat panel */}
        {/* Mobile: fixed fullscreen overlay. Desktop: flex-1 split view (unchanged) */}
        <div className={`
          overflow-hidden
          ${mobileShowChat && selected
            ? 'fixed inset-x-0 top-0 h-[100dvh] z-[250] flex flex-col bg-white dark:bg-zinc-950 md:static md:h-auto md:inset-auto md:z-auto md:flex-1 md:bg-zinc-50 md:dark:bg-zinc-900/30 overscroll-none'
            : selected
            ? 'hidden md:flex md:flex-1 bg-zinc-50 dark:bg-zinc-900/30'
            : 'hidden md:flex md:flex-1 bg-zinc-50 dark:bg-zinc-900/30'}
        `}
          id={mobileShowChat && selected ? 'mobile-chat-panel' : undefined}
        >

          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">💬</div>
              <p className="text-[14px] font-medium">Seleccioná una conversación</p>
            </div>
          ) : (
            <>
              {/* Main Chat Area */}
              <div
                className="flex-1 flex flex-col overflow-hidden h-full md:border-r border-zinc-200 dark:border-zinc-800 min-h-0"
                onTouchStart={e => { if (e.touches[0].clientX < 35) setSwipeTouchStartX(e.touches[0].clientX); }}
                onTouchEnd={e => { if (swipeTouchStartX !== null && e.changedTouches[0].clientX - swipeTouchStartX > 70) { setSelected(null); setMobileShowChat(false); } setSwipeTouchStartX(null); }}
              >
                {/* MOBILE header — AIChatFloat style, always visible */}
                <div className="md:hidden flex items-center justify-between px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/60 flex-shrink-0 select-none sticky top-0 z-10">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-black flex-shrink-0 ${CHANNEL_COLOR[getChannel(selected)]}`}>
                      {(contact(selected).name || '?').slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[13.5px] font-black text-zinc-800 dark:text-zinc-200 leading-none">{contact(selected).name || `Chat #${selected.id}`}</p>
                      {contact(selected).phone_number && <p className="text-[9.5px] text-zinc-400 font-bold mt-0.5 leading-none">{contact(selected).phone_number}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelected(null); setMobileShowChat(false); }}
                    className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-300 flex items-center justify-center transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* DESKTOP header */}
                <div className="hidden md:flex px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 items-center gap-3 flex-shrink-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-black flex-shrink-0 ${CHANNEL_COLOR[getChannel(selected)]}`}>
                    {CHANNEL_ICON[getChannel(selected)]}
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-zinc-900 dark:text-white">{contact(selected).name || `Conversación #${selected.id}`}</p>
                    <div className="flex items-center gap-2">
                      {contact(selected).phone_number && <span className="text-[11px] text-zinc-400 font-mono">{contact(selected).phone_number}</span>}
                      <span className="text-[9px] font-black bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-400 px-1.5 py-0.5 rounded-full uppercase">{getChannelLabel(selected)}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full text-white ${STATUS_COLORS[selected.status] || 'bg-zinc-400'}`}>
                        {selected.status === 'open' ? 'Abierto' : selected.status === 'resolved' ? 'Resuelto' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 24-hour warning banner */}
                {(() => {
                  const ch = getChannel(selected);
                  const isMetaConv = ['whatsapp', 'instagram', 'facebook'].includes(ch);
                  const lastIncoming = [...messages].reverse().find((m: any) => m?.message_type === 0);
                  const over24h = isMetaConv && lastIncoming && (Date.now()/1000 - lastIncoming.created_at) > 86400;
                  const noIncoming = isMetaConv && !lastIncoming;
                  const isClosed = selected.can_reply === false || (selected.can_reply === undefined && isMetaConv && !loadingMsgs && (over24h || noIncoming));
                  if (isClosed) {
                    return (
                      <div className="bg-red-50/45 dark:bg-red-950/5 border-b border-red-100/50 dark:border-red-900/10 px-5 py-2 flex items-center gap-2 text-[11px] text-red-750 dark:text-red-400 font-semibold select-none flex-shrink-0 animate-in slide-in-from-top duration-200">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <span>Solo se admiten respuestas mediante plantilla debido a la restricción de las 24 horas.</span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Messages list */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 md:px-5 py-4 md:space-y-3 space-y-2 bg-zinc-50/50 dark:bg-zinc-950">
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12 text-zinc-400 text-[13px]">Sin mensajes</div>
                  ) : messages.map((msg: any) => {
                    const isMe = msg?.message_type === 1;
                    const isActivity = msg?.message_type === 2;
                    if (isActivity) return (
                      <div key={msg.id} className="flex justify-center my-1">
                        <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{msg?.content}</span>
                      </div>
                    );
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[9px] text-zinc-400 font-medium mb-0.5 px-2">
                          {isMe ? 'Agente' : (contact(selected).name || 'Cliente')} · {fmtTime(msg.created_at)}
                        </span>
                        <div className={`max-w-[80%] rounded-[18px] px-4 py-2.5 text-[14px] leading-relaxed ${
                          failedMsgIds.has(msg.id)
                            ? 'bg-red-100 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                            : isMe
                              ? `bg-blue-600 text-white shadow-sm ${msg.pending ? 'opacity-60' : ''}`
                              : 'bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm'
                        }`}>
                          {renderMessageContent(msg, contact(selected).name)}
                          {failedMsgIds.has(msg.id) && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-red-500 font-bold">
                              <AlertCircle className="w-3 h-3" /> Error al enviar
                            </div>
                          )}
                          {msg.pending && !failedMsgIds.has(msg.id) && (
                            <span className="text-[10px] opacity-50 ml-1">enviando...</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* MOBILE reply bar — WhatsApp pill style */}
                {(() => {
                  const ch = getChannel(selected);
                  const isMetaConv = ['whatsapp', 'instagram', 'facebook'].includes(ch);
                  const lastIncoming = [...messages].reverse().find((m: any) => m?.message_type === 0);
                  const over24h = isMetaConv && lastIncoming && (Date.now()/1000 - lastIncoming.created_at) > 86400;
                  const noIncoming = isMetaConv && !lastIncoming;
                  const isClosed = selected.can_reply === false || (selected.can_reply === undefined && isMetaConv && !loadingMsgs && (over24h || noIncoming));
                  if (isClosed) {
                    const cleanPhone = contact(selected).phone_number?.replace(/\D/g, '') || '';
                    const senderIdentifier = selected?.meta?.sender?.identifier || selected?.meta?.sender?.username || '';
                    const contactUrl =
                      ch === 'whatsapp' && cleanPhone ? `https://wa.me/${cleanPhone}` :
                      ch === 'instagram' && senderIdentifier ? `https://ig.me/m/${senderIdentifier}` :
                      ch === 'instagram' ? 'https://www.instagram.com/direct/inbox/' :
                      ch === 'facebook' && senderIdentifier ? `https://m.me/${senderIdentifier}` :
                      ch === 'facebook' ? 'https://www.facebook.com/messages' : null;
                    const contactLabel =
                      ch === 'whatsapp' ? 'Escribir por WhatsApp' :
                      ch === 'instagram' ? 'Escribir por Instagram' :
                      ch === 'facebook' ? 'Escribir por Messenger' : null;
                    const btnColor =
                      ch === 'whatsapp' ? 'bg-emerald-500' :
                      ch === 'instagram' ? 'bg-pink-500' : 'bg-blue-600';
                    if (!contactUrl || !contactLabel) return null;
                    return (
                      <div className="md:hidden px-4 py-3 bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-100 dark:border-zinc-900 sticky bottom-0 z-10">
                        <a href={contactUrl} target="_blank" rel="noreferrer"
                          className={`w-full flex items-center justify-center gap-2 py-3 ${btnColor} text-white text-[14px] font-black rounded-2xl active:scale-[0.98] transition-transform shadow-sm`}>
                          <MessageCircle className="w-5 h-5" />
                          {contactLabel}
                        </a>
                      </div>
                    );
                  }
                  return (
                    <div className="md:hidden flex items-end gap-2 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-100 dark:border-zinc-900 flex-shrink-0 sticky bottom-0 z-10">
                      <div className="flex-1 flex items-end bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-3xl px-4 py-2.5 min-h-[44px]">
                        <textarea
                          ref={mobileTextareaRef}
                          value={reply}
                          onChange={e => { setReply(e.target.value); adjustMobileTextarea(); }}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }}}
                          onFocus={() => { requestAnimationFrame(() => { messagesContainerRef.current && (messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight); }); }}
                          placeholder={transcribing ? 'Transcribiendo...' : isRecording ? '● Grabando...' : 'Mensaje...'}
                          rows={1}
                          disabled={transcribing}
                          className="flex-1 w-full bg-transparent text-zinc-800 dark:text-zinc-100 text-[14px] outline-none resize-none placeholder-zinc-400 leading-snug overflow-hidden"
                          style={{ maxHeight: '150px' }}
                        />
                      </div>
                      <button
                        onClick={generateAiDraft}
                        disabled={generatingDraft || sending || messages.length === 0}
                        className="p-2.5 bg-violet-600 rounded-full flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
                      >
                        {generatingDraft ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Bot className="w-5 h-5 text-white" />}
                      </button>
                      {reply.trim() ? (
                        <button onClick={handleSend as any} disabled={sending}
                          className="p-2.5 bg-[#00a884] rounded-full flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform">
                          {sending ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Send className="w-5 h-5 text-white" />}
                        </button>
                      ) : (
                        <button
                          onClick={handleMicPress}
                          disabled={transcribing}
                          className={`p-2.5 rounded-full flex-shrink-0 active:scale-95 transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-[#00a884]'} disabled:opacity-40`}
                        >
                          {transcribing ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Mic className="w-5 h-5 text-white" />}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* DESKTOP Reply Box area */}
                <div className="hidden md:block border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0">
                  {(() => {
                    const ch = getChannel(selected);
                    const isMetaConv = ['whatsapp', 'instagram', 'facebook'].includes(ch);
                    const lastIncoming = [...messages].reverse().find((m: any) => m?.message_type === 0);
                    const over24h = isMetaConv && lastIncoming && (Date.now()/1000 - lastIncoming.created_at) > 86400;
                    const noIncoming = isMetaConv && !lastIncoming;
                    const isClosed = selected.can_reply === false || (selected.can_reply === undefined && isMetaConv && !loadingMsgs && (over24h || noIncoming));

                    if (isClosed) {
                      const ch = getChannel(selected);
                      const cleanPhone = contact(selected).phone_number?.replace(/\D/g, '') || '';
                      const senderIdentifier = selected?.meta?.sender?.identifier || selected?.meta?.sender?.username || '';
                      const contactUrl =
                        ch === 'whatsapp' && cleanPhone ? `https://wa.me/${cleanPhone}` :
                        ch === 'instagram' && senderIdentifier ? `https://ig.me/m/${senderIdentifier}` :
                        ch === 'instagram' ? 'https://www.instagram.com/direct/inbox/' :
                        ch === 'facebook' && senderIdentifier ? `https://m.me/${senderIdentifier}` :
                        ch === 'facebook' ? 'https://www.facebook.com/messages' :
                        null;
                      const contactLabel =
                        ch === 'whatsapp' ? 'Escribir por WhatsApp' :
                        ch === 'instagram' ? 'Escribir por Instagram' :
                        ch === 'facebook' ? 'Escribir por Messenger' : null;
                      const contactColor =
                        ch === 'whatsapp' ? 'bg-emerald-600 hover:bg-emerald-700' :
                        ch === 'instagram' ? 'bg-pink-500 hover:bg-pink-600' :
                        'bg-blue-600 hover:bg-blue-700';

                      return (
                        <div className="px-4 py-3 space-y-2.5 animate-in fade-in duration-200">
                          <div className="flex items-start gap-2 p-3 bg-red-50/50 dark:bg-red-950/10 border border-red-200/50 dark:border-red-900/20 rounded-2xl">
                            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-red-700 dark:text-red-400 leading-snug">
                              Ventana de 24hs cerrada. Solo podés responder con plantilla o contactando directamente.
                            </p>
                          </div>
                          {contactUrl && contactLabel && (
                            <a href={contactUrl} target="_blank" rel="noreferrer"
                              className={`w-full flex items-center justify-center gap-2 py-2.5 ${contactColor} text-white text-[12px] font-black rounded-xl transition-all shadow-sm active:scale-[0.98]`}>
                              <MessageCircle className="w-4 h-4" />
                              {contactLabel}
                            </a>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="px-5 py-4 space-y-3">
                        {sendError && (
                          <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl text-[11px] text-red-650 dark:text-red-400 flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold">Error al enviar</p>
                              <p className="mt-0.5">{sendError}</p>
                              {sendError.toLowerCase().includes('template') && (
                                <a href={`${cwUrl}`} target="_blank" rel="noreferrer" className="underline mt-1 block">Abrir panel para usar plantilla →</a>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <textarea
                            value={reply}
                            onChange={e => setReply(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }}}
                            placeholder="Escribí tu respuesta... (Enter para enviar)"
                            rows={3}
                            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-[13px] text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={generateAiDraft} disabled={generatingDraft || sending || messages.length === 0}
                              className="flex items-center gap-1.5 px-4 py-2.5 bg-violet-600 dark:bg-violet-600 hover:bg-violet-700 dark:hover:bg-violet-700 text-white rounded-xl text-[12px] font-bold shadow-md transition-all active:scale-[0.98] disabled:opacity-50">
                              {generatingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Bot className="w-3.5 h-3.5 text-white animate-pulse" />}
                              Responder con IA
                            </button>

                            <button onClick={handleSend as any} disabled={!reply.trim() || sending}
                              className="ml-auto flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[13px] font-bold rounded-xl transition-all shadow-sm">
                              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              Enviar
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
      </div>


      {/* Context Menu */}
      {ctxMenu && (
        <div ref={ctxRef}
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl py-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100">
          {/* Seleccionar option */}
          <button
            onClick={() => {
              setSelectedIds(prev => { const next = new Set(prev); next.has(ctxMenu.conv.id) ? next.delete(ctxMenu.conv.id) : next.add(ctxMenu.conv.id); return next; });
              setCtxMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-[12px] font-medium flex items-center gap-2.5 transition-colors text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <span>☑</span> {selectedIds.has(ctxMenu.conv.id) ? 'Deseleccionar' : 'Seleccionar'}
          </button>
          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
          {[
            { action: 'read',   label: 'Marcar como leído',   icon: '✓' },
            { action: 'unread', label: 'Marcar como no leído', icon: '●' },
            null,
            { action: 'delete', label: 'Eliminar conversación', icon: '🗑️', danger: true },
          ].map((item, i) =>
            item === null ? (
              <div key={i} className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
            ) : (
              <button key={item.action} onClick={() => handleCtxAction(item.action, ctxMenu.conv)}
                className={`w-full text-left px-4 py-2 text-[12px] font-medium flex items-center gap-2.5 transition-colors ${
                  item.danger
                    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}>
                <span>{item.icon}</span> {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
