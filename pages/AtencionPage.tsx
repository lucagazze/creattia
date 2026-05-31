import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import { supabase } from '../services/supabase';
import {
  RefreshCw, AlertCircle, Loader2, Send, Sparkles,
  Search, CheckCircle, Clock, Inbox, ExternalLink, Bot,
  Globe, Facebook, Instagram, MessageCircle, Mail,
  BookOpen, ShoppingBag, Plus, Trash2, Link
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

export default function AtencionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const isAdmin = authProfile?.is_admin;

  const cwUrl = (profile as any)?.chatwoot_url;
  const cwToken = (profile as any)?.chatwoot_token;

  const [conversations, setConversations] = useState<any[]>([]);
  const [convMeta, setConvMeta] = useState<{ all_count: number; unassigned_count: number; assigned_count: number } | null>(null);
  const [channelMetas, setChannelMetas] = useState<Record<string, { all_count: number; unassigned_count: number; assigned_count: number }>>({});
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState<string | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState<string | null>(null);
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'instagram' | 'facebook' | 'email' | 'other'>('all');
  const [listCollapsed, setListCollapsed] = useState(false);
  
  // Sidebar State Variables
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'copilot' | 'canned' | 'shopify'>('copilot');

  const [customPrompt, setCustomPrompt] = useState('');
  const [generatingCustomPrompt, setGeneratingCustomPrompt] = useState(false);

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
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'pending'>('open');
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
  const [canReplyOnly, setCanReplyOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
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

  const triggerAutoDraft = useCallback(async (conv: any, currentMessages: any[]) => {
    if (!profile?.id || !conv || currentMessages.length === 0) return;
    setGeneratingDraft(true);
    setSendError(null);
    try {
      const realMessages = currentMessages.filter((m: any) => m?.message_type !== 2);
      const last20 = realMessages.slice(-20);
      const lastIncoming = [...last20].reverse().find((m: any) => m?.message_type === 0);
      const lastMsg = last20[last20.length - 1];
      const history = last20.map((m: any) => {
        const who = m?.message_type === 1 ? 'Agente' : (contact(conv).name || 'Cliente');
        return `${who}: ${m?.content || '[archivo adjunto]'}`;
      });
      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: profile.id,
          itemText: lastIncoming?.content || lastMsg?.content || '',
          username: contact(conv).name || contact(conv).phone_number || 'Cliente',
          conversationHistory: history,
          isDM: true,
        }),
      });
      if (!res.ok) throw new Error('Error al generar borrador');
      const data = await res.json();
      if (data.draft && selectedRef.current?.id === conv.id) {
        setActiveSuggestion(data.draft);
      }
    } catch (e: any) {
      console.error('Error auto-generating draft:', e);
    } finally {
      setGeneratingDraft(false);
    }
  }, [profile?.id]);

  const loadMessages = useCallback(async (conv: any) => {
    if (!cwUrl || !cwToken) return;
    setExpanded(false);
    setSelected(conv);
    setMessages([]);
    setReply('');
    setSendError(null);
    setActiveSuggestion(null);
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
      triggerAutoDraft(conv, sorted);
    } catch (e: any) {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, [cwUrl, cwToken, triggerAutoDraft]);


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
    if (container) {
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      if (isAtBottom) container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const generateAiDraft = async () => {
    if (!profile?.id || !selected || messages.length === 0) return;
    setGeneratingDraft(true);
    setSendError(null);
    try {
      const realMessages = messages.filter((m: any) => m?.message_type !== 2);
      const last20 = realMessages.slice(-20);
      const lastIncoming = [...last20].reverse().find((m: any) => m?.message_type === 0);
      const lastMsg = last20[last20.length - 1];
      const history = last20.map((m: any) => {
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
      if (data.draft) setReply(data.draft);
    } catch (e: any) {
      setSendError('No se pudo generar el borrador con IA.');
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleTopicSuggestion = async (key: string, label: string) => {
    if (!profile?.id || !selected || messages.length === 0) return;
    setLoadingSuggestion(key);
    setActiveSuggestion(null);
    setSendError(null);
    try {
      const realMessages = messages.filter((m: any) => m?.message_type !== 2);
      const last20 = realMessages.slice(-20);
      const lastIncoming = [...last20].reverse().find((m: any) => m?.message_type === 0);
      const lastMsg = last20[last20.length - 1];

      let promptText = lastIncoming?.content || lastMsg?.content || 'Hola';
      if (key !== 'auto') {
        promptText = `Generá una respuesta específica y detallada sobre el tema: "${label}". El cliente escribió originalmente: "${lastIncoming?.content || lastMsg?.content || 'Hola'}"`;
      }

      const history = last20.map((m: any) => {
        const who = m?.message_type === 1 ? 'Agente' : (contact(selected).name || 'Cliente');
        return `${who}: ${m?.content || '[archivo adjunto]'}`;
      });

      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: profile.id,
          itemText: promptText,
          username: contact(selected).name || contact(selected).phone_number || 'Cliente',
          conversationHistory: history,
          isDM: true,
        }),
      });

      if (!res.ok) throw new Error('Error al generar sugerencia');
      const data = await res.json();
      if (data.draft) {
        setActiveSuggestion(data.draft);
      }
    } catch (e: any) {
      setSendError('No se pudo generar la sugerencia de IA para este tema.');
    } finally {
      setLoadingSuggestion(null);
    }
  };

  const handleCustomPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id || !selected || !customPrompt.trim() || messages.length === 0) return;
    setGeneratingCustomPrompt(true);
    setSendError(null);
    try {
      const realMessages = messages.filter((m: any) => m?.message_type !== 2);
      const last20 = realMessages.slice(-20);
      const lastIncoming = [...last20].reverse().find((m: any) => m?.message_type === 0);
      const lastMsg = last20[last20.length - 1];

      const directive = `Generá un borrador de respuesta siguiendo estrictamente esta instrucción: "${customPrompt.trim()}". El cliente escribió originalmente: "${lastIncoming?.content || lastMsg?.content || 'Hola'}"`;

      const history = last20.map((m: any) => {
        const who = m?.message_type === 1 ? 'Agente' : (contact(selected).name || 'Cliente');
        return `${who}: ${m?.content || '[archivo adjunto]'}`;
      });

      const res = await fetch('/api/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: profile.id,
          itemText: directive,
          username: contact(selected).name || contact(selected).phone_number || 'Cliente',
          conversationHistory: history,
          isDM: true,
        }),
      });

      if (!res.ok) throw new Error('Error al generar borrador');
      const data = await res.json();
      if (data.draft && selectedRef.current?.id === selected.id) {
        setActiveSuggestion(data.draft);
        setCustomPrompt('');
      }
    } catch (e: any) {
      setSendError('No se pudo generar el borrador personalizado.');
    } finally {
      setGeneratingCustomPrompt(false);
    }
  };

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
    try {
      if (action === 'read') {
        await chatwoot.markAsRead(cwUrl, cwToken, conv.id);
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
      } else if (['resolved','open','pending','snoozed'].includes(action)) {
        const extra = action === 'snoozed' ? { snoozed_until: Math.floor(Date.now()/1000) + 3600 } : {};
        const status = action === 'snooze' ? 'snoozed' : action;
        await chatwoot.updateStatus(cwUrl, cwToken, conv.id, status, extra);
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, status } : c));
        if (selected?.id === conv.id) setSelected((s: any) => s ? { ...s, status } : s);
      } else if (action === 'snooze') {
        const snoozed_until = Math.floor(Date.now()/1000) + 3600;
        await chatwoot.updateStatus(cwUrl, cwToken, conv.id, 'snoozed', { snoozed_until });
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, status: 'snoozed' } : c));
      } else if (action === 'priority_high') {
        await chatwoot.updatePriority(cwUrl, cwToken, conv.id, 'high');
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, priority: 'high' } : c));
      } else if (action === 'priority_none') {
        await chatwoot.updatePriority(cwUrl, cwToken, conv.id, 'none');
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, priority: 'none' } : c));
      } else if (action === 'copy') {
        const accountId = await chatwoot.getAccountId(cwUrl, cwToken);
        navigator.clipboard.writeText(`${cwUrl}/app/accounts/${accountId}/conversations/${conv.id}`);
      } else if (action === 'delete') {
        if (!window.confirm('¿Eliminar esta conversación? Esta acción no se puede deshacer.')) return;
        await chatwoot.deleteConversation(cwUrl, cwToken, conv.id);
        setConversations(prev => prev.filter(c => c.id !== conv.id));
        if (selected?.id === conv.id) { setSelected(null); setMessages([]); }
      }
    } catch (e: any) {
      alert(`Error al ejecutar acción: ${e.message}`);
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
    const sortedMsgs = [...(c?.messages || [])].sort((x, y) => {
      const timeX = typeof x.created_at === 'number' ? x.created_at : new Date(x.created_at).getTime() / 1000;
      const timeY = typeof y.created_at === 'number' ? y.created_at : new Date(y.created_at).getTime() / 1000;
      return timeX - timeY;
    });
    const lastRealMsg = [...sortedMsgs].reverse().find((m: any) => m?.message_type !== 2) || c?.last_non_activity_message;
    const ts = c?.last_activity_at || lastRealMsg?.created_at || c?.created_at;
    if (!ts) return 0;
    if (typeof ts === 'number') {
      return ts > 10000000000 ? ts / 1000 : ts;
    }
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
    if (canReplyOnly) {
      const ch = getChannel(c);
      const isMeta = ['whatsapp', 'instagram', 'facebook'].includes(ch);
      const lastIncoming = c.messages?.find((m: any) => m?.message_type === 0);
      const timeSinceLastIncoming = lastIncoming ? (Date.now() / 1000 - lastIncoming.created_at) : null;
      const canReply = c.can_reply === true || (c.can_reply !== false && (!isMeta || (timeSinceLastIncoming !== null && timeSinceLastIncoming < 86400) || (Date.now() / 1000 - (c.last_activity_at || c.created_at)) < 86400));
      if (!canReply) return false;
    }
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
    setBulkLoading(true);
    try {
      await Promise.all([...selectedIds].map(id => {
        if (action === 'resolved') return chatwoot.updateStatus(cwUrl, cwToken, id, 'resolved');
        if (action === 'open') return chatwoot.updateStatus(cwUrl, cwToken, id, 'open');
        if (action === 'pending') return chatwoot.updateStatus(cwUrl, cwToken, id, 'pending');
        if (action === 'read') return chatwoot.markAsRead(cwUrl, cwToken, id);
        return Promise.resolve();
      }));
      if (['resolved','open','pending'].includes(action)) {
        setConversations(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, status: action } : c));
      }
      if (action === 'read') {
        setConversations(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, unread_count: 0 } : c));
      }
      clearSelection();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0 w-full animate-in fade-in duration-200">
        {/* Left Section: Channel Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1">
          {[
            { key: 'all', label: 'Todos', icon: Inbox },
            { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
            { key: 'instagram', label: 'Instagram', icon: Instagram },
            { key: 'facebook', label: 'Facebook', icon: Facebook },
            { key: 'email', label: 'Email', icon: Mail },
            { key: 'other', label: 'Otros', icon: Globe },
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
                    ? 'bg-zinc-900 border-zinc-900 dark:bg-white dark:border-white text-white dark:text-zinc-950 shadow-sm'
                    : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{ch.label}</span>
                {count > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.25 rounded-full font-black ${
                    isActive
                      ? 'bg-white/20 text-white dark:bg-black/10 dark:text-zinc-900'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-550'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Section: Search & Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Search Input */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Buscar contacto, teléfono..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-zinc-750 dark:text-zinc-300 transition-all" 
            />
          </div>

          {/* Sort button */}
          <div className="relative group">
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

          {/* 24-hour window filter */}
          <button 
            onClick={() => setCanReplyOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all duration-200 select-none ${
              canReplyOnly 
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/10' 
                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-emerald-700 dark:hover:text-emerald-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Ventana Abierta</span>
          </button>

          {/* Expand button */}
          <button 
            onClick={() => setExpanded(e => !e)}
            className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" 
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
          ${listCollapsed ? 'hidden' : expanded ? 'w-full' : selected ? 'hidden md:flex md:w-[320px]' : 'w-full md:w-[320px]'}
          flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-300
        `}>

          {/* Assign tabs */}
          <div className="flex border-b border-zinc-100 dark:border-zinc-800 text-[11px] font-bold flex-shrink-0">
            {[
              { key: 'all', label: 'Todos', count: totalCount },
              { key: 'unassigned', label: 'Sin asignar', count: unassignedCount },
              { key: 'mine', label: 'Asignados', count: assignedCount },
            ].map(t => (
              <button key={t.key} onClick={() => setAssignFilter(t.key as any)}
                className={`flex-1 py-2.5 flex items-center justify-center gap-1 transition-colors border-b-2 ${assignFilter === t.key ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}>
                {t.label}
                {t.count > 0 && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ml-1 flex-shrink-0 ${assignFilter === t.key ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-550'}`}>{t.count}</span>}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-1.5 p-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-950/20 flex-shrink-0">
            {(['open', 'resolved', 'pending'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${statusFilter === s ? 'bg-blue-600 text-white shadow-sm' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-550 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                {s === 'open' ? 'Abiertos' : s === 'resolved' ? 'Resueltos' : 'Pendientes'}
              </button>
            ))}
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800/40 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black text-blue-700 dark:text-blue-400">{selectedIds.size} seleccionados</span>
              <button onClick={selectAll} className="text-[10px] text-blue-600 dark:text-blue-400 underline">Todos</button>
              <button onClick={clearSelection} className="text-[10px] text-zinc-500 underline">Limpiar</button>
              <div className="flex gap-1 ml-auto">
                {[
                  { action: 'read', label: '✓ Leído' },
                  { action: 'resolved', label: '✅ Resolver' },
                  { action: 'pending', label: '⏳ Pendiente' },
                  { action: 'open', label: '📂 Abrir' },
                ].map(b => (
                  <button key={b.action} onClick={() => handleBulkAction(b.action)} disabled={bulkLoading}
                    className="px-2 py-1 text-[10px] font-bold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50">
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* List */}
          <div 
            className="flex-1 overflow-y-auto py-2 space-y-1"
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
              const unread = conv?.unread_count || 0;
              const isUnread = unread > 0;
              const activityTimestamp = conv?.last_activity_at || lastRealMsg?.created_at || conv?.created_at;
              return (
                <div key={conv.id}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, conv }); }}
                  className={`mx-2 my-0.5 px-3 py-2.5 flex items-start gap-2.5 transition-all duration-200 cursor-pointer rounded-xl group/conv ${
                    isSelected 
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/10' 
                      : isUnread 
                        ? 'bg-zinc-50/80 dark:bg-zinc-900/60' 
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/30'
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`flex-shrink-0 mt-2.5 ${selectedIds.size > 0 ? 'opacity-100' : 'opacity-0 group-hover/conv:opacity-100'} transition-opacity`}
                    onClick={e => toggleSelect(conv.id, e)}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selectedIds.has(conv.id) ? 'bg-blue-600 border-blue-600' : 'border-zinc-300 dark:border-zinc-650'}`}>
                      {selectedIds.has(conv.id) && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  </div>
                  
                  {/* Card content click target */}
                  <div className="flex-1 flex items-start gap-2.5 min-w-0" onClick={() => loadMessages(conv)}>
                    {renderAvatar(conv)}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[12.5px] truncate ${
                          isSelected
                            ? 'font-bold text-white'
                            : isUnread 
                              ? 'font-black text-zinc-900 dark:text-white' 
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
                      
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`text-[8.5px] px-1.5 py-0.5 rounded-full uppercase font-black tracking-wider ${getChannelBadgeClass(conv, isSelected)}`}>
                          {getChannelLabel(conv)}
                        </span>
                        {c.phone_number && (
                           <>
                            <span className={isSelected ? 'text-blue-300' : 'text-zinc-300 dark:text-zinc-700'}>·</span>
                            <span className={`text-[10px] font-mono truncate ${isSelected ? 'text-blue-200' : 'text-zinc-400'}`}>
                              {c.phone_number}
                            </span>
                          </>
                        )}
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

            {/* Background loading indicator */}
            {loadingMore && (
              <div className="flex items-center justify-center gap-1.5 py-2 text-[10px] text-zinc-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando más...
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: chat panel */}
        <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 flex overflow-hidden bg-zinc-50 dark:bg-zinc-900/30`}>

          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">💬</div>
              <p className="text-[14px] font-medium">Seleccioná una conversación</p>
            </div>
          ) : (
            <>
              {/* Main Chat Area */}
              <div className="flex-1 flex flex-col overflow-hidden h-full border-r border-zinc-200 dark:border-zinc-800">
                {/* Chat header */}
                <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => setSelected(null)}
                    className="md:hidden p-1.5 -ml-1 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <button
                    onClick={() => setListCollapsed(v => !v)}
                    className="hidden md:flex p-1.5 -ml-1 rounded-lg text-zinc-550 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                    title={listCollapsed ? "Mostrar lista de chats" : "Ocultar lista de chats"}
                  >
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2" />
                      <path d="M9 3v18" />
                      {listCollapsed ? <path d="m14 15 3-3-3-3" /> : <path d="m16 9-3 3 3 3" />}
                    </svg>
                  </button>
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

                  {/* Sidebar Toggle Button */}
                  <button
                    onClick={() => setShowSidebar(v => !v)}
                    className={`ml-auto p-2 rounded-xl transition-all duration-200 border flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] ${
                      showSidebar
                        ? 'bg-violet-50 border-violet-200 text-violet-750 dark:bg-violet-955/20 dark:border-violet-900/30 dark:text-violet-400'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-850'
                    }`}
                    title={showSidebar ? "Ocultar Copiloto" : "Mostrar Copiloto"}
                  >
                    <Sparkles className={`w-4 h-4 ${showSidebar ? 'animate-pulse text-violet-500' : ''}`} />
                    <span className="text-[11px] font-bold tracking-tight">Copiloto</span>
                  </button>
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
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-white dark:bg-zinc-950">
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12 text-zinc-400 text-[13px]">Sin mensajes</div>
                  ) : messages.map((msg: any) => {
                    const isMe = msg?.message_type === 1; // 1 = outgoing
                    const isActivity = msg?.message_type === 2; // 2 = activity
                    if (isActivity) return (
                      <div key={msg.id} className="flex justify-center">
                        <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{msg?.content}</span>
                      </div>
                    );
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <span className="text-[9px] text-zinc-400 font-medium mb-0.5 px-2">
                          {isMe ? 'Agente' : (contact(selected).name || 'Cliente')} · {fmtTime(msg.created_at)}
                        </span>
                        <div className={`max-w-[70%] rounded-[18px] px-4 py-2.5 text-[13px] leading-relaxed ${
                          failedMsgIds.has(msg.id)
                            ? 'bg-red-100 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                            : isMe
                              ? `bg-blue-600 text-white shadow-sm ${msg.pending ? 'opacity-60' : ''}`
                              : 'bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm'
                        }`}>
                          {renderMessageContent(msg, contact(selected).name)}
                          {failedMsgIds.has(msg.id) && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-red-500 font-bold">
                              <AlertCircle className="w-3 h-3" /> Error al enviar — ventana de 24hs cerrada
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

                {/* Reply Box area */}
                <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0">
                  {(() => {
                    const ch = getChannel(selected);
                    const isMetaConv = ['whatsapp', 'instagram', 'facebook'].includes(ch);
                    const lastIncoming = [...messages].reverse().find((m: any) => m?.message_type === 0);
                    const over24h = isMetaConv && lastIncoming && (Date.now()/1000 - lastIncoming.created_at) > 86400;
                    const noIncoming = isMetaConv && !lastIncoming;
                    const isClosed = selected.can_reply === false || (selected.can_reply === undefined && isMetaConv && !loadingMsgs && (over24h || noIncoming));

                    if (isClosed) {
                      const cleanPhone = contact(selected).phone_number ? contact(selected).phone_number.replace(/\D/g, '') : '';
                      return (
                        <div className="px-5 py-4 space-y-3 animate-in fade-in duration-200">
                          <div className="flex items-start gap-2.5 p-3.5 bg-red-50/50 dark:bg-red-950/10 border border-red-200/50 dark:border-red-900/20 rounded-2xl">
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[12px] font-bold text-red-850 dark:text-red-400">Ventana de 24 horas cerrada</p>
                              <p className="text-[11px] text-red-650 dark:text-red-400 mt-0.5 leading-relaxed">
                                Solo podés responder utilizando una plantilla de mensaje (template) o contactándolo directamente por otros canales debido a la restricción de Meta.
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            {cleanPhone ? (
                              <a href={`https://wa.me/${cleanPhone}`}
                                target="_blank" rel="noreferrer"
                                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black rounded-xl transition-all shadow-sm active:scale-[0.98]">
                                <MessageCircle className="w-4 h-4" />
                                Escribir por WhatsApp
                              </a>
                            ) : (
                              <div className="text-[11px] text-zinc-400 text-center w-full py-2">
                                No hay teléfono de WhatsApp disponible para este contacto.
                              </div>
                            )}
                          </div>
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
                            <button type="button" onClick={() => { setShowSidebar(true); setSidebarTab('copilot'); }}
                              className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-955/20 dark:hover:bg-violet-900/30 text-violet-750 dark:text-violet-400 rounded-xl text-[11.5px] font-bold border border-violet-200 dark:border-violet-850 transition-all">
                              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                              Copiloto IA
                            </button>
                            <button type="button" onClick={() => { setShowSidebar(true); setSidebarTab('canned'); }}
                              className="flex items-center gap-1.5 px-3 py-2 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900/40 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-[11.5px] font-bold border border-zinc-200 dark:border-zinc-850 transition-all">
                              <BookOpen className="w-3.5 h-3.5 text-zinc-450" />
                              Respuestas Rápidas
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

              {/* COLLAPSIBLE RIGHT SIDEBAR */}
              {showSidebar && (
                <div className="w-[320px] bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 flex flex-col h-full flex-shrink-0 animate-in slide-in-from-right duration-250 select-none">
                  {/* Sidebar Tabs */}
                  <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-955/20 text-[11px] font-bold p-1 gap-1">
                    {[
                      { key: 'copilot', label: 'Copiloto IA', icon: Sparkles },
                      { key: 'canned', label: 'Respuestas', icon: BookOpen },
                      { key: 'shopify', label: 'Tienda/Links', icon: ShoppingBag },
                    ].map(tab => {
                      const Icon = tab.icon;
                      const isActive = sidebarTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setSidebarTab(tab.key as any)}
                          className={`flex-1 py-2 flex items-center justify-center gap-1 rounded-lg transition-all duration-200 ${
                            isActive
                              ? 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 text-blue-650 dark:text-blue-400 font-black shadow-sm'
                              : 'text-zinc-550 hover:text-zinc-800 dark:hover:text-zinc-300'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isActive && tab.key === 'copilot' ? 'text-violet-500 animate-pulse' : ''}`} />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Sidebar Scrollable Body */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
                    
                    {/* TAB 1: COPILOTO IA */}
                    {sidebarTab === 'copilot' && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        {/* Auto suggestions generator */}
                        {generatingDraft ? (
                          <div className="p-4 bg-violet-50/20 dark:bg-violet-955/5 border border-violet-100 dark:border-violet-900/20 rounded-2xl flex flex-col items-center justify-center text-center gap-3 py-6">
                            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                            <p className="text-[11px] font-bold text-violet-750 dark:text-violet-400">Pensando respuesta recomendada...</p>
                          </div>
                        ) : activeSuggestion ? (
                          <div className="p-3.5 bg-violet-50/40 dark:bg-violet-950/15 border border-violet-100/80 dark:border-violet-900/30 rounded-2xl flex flex-col gap-2.5 border-dashed border-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-violet-750 dark:text-violet-400">
                              <Bot className="w-4 h-4 text-violet-500 animate-pulse" />
                              <span>Respuesta de Copiloto IA:</span>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-zinc-700 dark:text-zinc-300 font-medium whitespace-pre-line bg-white dark:bg-zinc-950 p-3 rounded-xl border border-black/[0.03] dark:border-white/[0.03]">
                              {activeSuggestion}
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setReply(prev => prev ? prev + '\n' + activeSuggestion : activeSuggestion);
                                  setActiveSuggestion(null);
                                }}
                                className="flex-1 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[11px] font-black shadow-sm transition-all active:scale-95 text-center"
                              >
                                Insertar en chat
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveSuggestion(null)}
                                className="px-3 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                              >
                                Descartar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => triggerAutoDraft(selected, messages)}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-violet-650 hover:bg-violet-700 text-white text-[11.5px] font-black rounded-xl transition-all shadow-sm shadow-violet-650/10 active:scale-95 disabled:opacity-50"
                            disabled={messages.length === 0}
                          >
                            <Bot className="w-4 h-4" />
                            Generar Borrador de Copiloto
                          </button>
                        )}

                        <div className="border-t border-zinc-100 dark:border-zinc-850 my-1" />

                        {/* Preset Topic Chips */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Generar por Tema</span>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { key: 'auto', label: '✨ Auto-detectar' },
                              { key: 'saludo', label: '💬 Saludo Inicial' },
                              { key: 'ubicacion', label: '📍 Ubicación/Horas' },
                              { key: 'envios', label: '🚚 Envíos y Tiempos' },
                              { key: 'pagos', label: '💳 Medios de Pago' },
                              { key: 'cambios', label: '📦 Cambios/Garantías' },
                            ].map(topic => {
                              const isLoading = loadingSuggestion === topic.key;
                              return (
                                <button
                                  key={topic.key}
                                  type="button"
                                  disabled={generatingDraft || !!loadingSuggestion || sending || messages.length === 0}
                                  onClick={() => handleTopicSuggestion(topic.key, topic.label)}
                                  className={`px-2 py-2 rounded-xl text-[10.5px] font-bold border transition-all text-left flex items-center gap-1.5 active:scale-95 disabled:opacity-50 ${
                                    topic.key === 'auto'
                                      ? 'border-violet-200 bg-violet-50/30 dark:border-violet-900/30 dark:bg-violet-955/10 text-violet-705 dark:text-violet-400'
                                      : 'border-zinc-200 bg-zinc-50 dark:border-zinc-850 dark:bg-zinc-900/30 text-zinc-650 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                  }`}
                                >
                                  {isLoading ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-zinc-450" />
                                  ) : (
                                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-700 flex-shrink-0" />
                                  )}
                                  <span className="truncate">{topic.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="border-t border-zinc-100 dark:border-zinc-850 my-1" />

                        {/* Prompt Custom Instructions Redactor */}
                        <form onSubmit={handleCustomPrompt} className="space-y-2">
                          <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Redactor Personalizado</span>
                          <textarea
                            value={customPrompt}
                            onChange={e => setCustomPrompt(e.target.value)}
                            placeholder="Ej: decile que nos queda el talle L y hacemos envíos gratis..."
                            rows={3}
                            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-[11.5px] text-zinc-800 dark:text-zinc-250 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all resize-none"
                            disabled={generatingCustomPrompt || messages.length === 0}
                          />
                          <button
                            type="submit"
                            disabled={!customPrompt.trim() || generatingCustomPrompt || messages.length === 0}
                            className="w-full py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-[11px] font-black rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-50 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                          >
                            {generatingCustomPrompt ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Redactando...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" /> Redactar Respuesta
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* TAB 2: RESPUESTAS RÁPIDAS */}
                    {sidebarTab === 'canned' && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        {/* Search and Action bar */}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-400" />
                            <input
                              type="text"
                              value={cannedSearch}
                              onChange={e => setCannedSearch(e.target.value)}
                              placeholder="Buscar respuesta..."
                              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-[11.5px] text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-zinc-400 transition-all"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowNewCannedForm(v => !v)}
                            className={`p-2 border rounded-xl transition-all active:scale-95 ${
                              showNewCannedForm
                                ? 'bg-red-50 border-red-200 text-red-650 dark:bg-red-955/25 dark:border-red-900/30'
                                : 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            }`}
                            title={showNewCannedForm ? "Cancelar" : "Agregar nueva respuesta"}
                          >
                            {showNewCannedForm ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* Inline creation form */}
                        {showNewCannedForm && (
                          <form onSubmit={handleCreateCannedResponse} className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-2.5 animate-in slide-in-from-top-3 duration-250">
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block pl-1">Nueva plantilla</span>
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                value={newCannedTitle}
                                onChange={e => setNewCannedTitle(e.target.value)}
                                placeholder="Título (Ej: Políticas de envío)"
                                className="w-full bg-white dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-750 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-blue-500 text-zinc-800 dark:text-zinc-100"
                                required
                              />
                              <input
                                type="text"
                                value={newCannedShortcut}
                                onChange={e => setNewCannedShortcut(e.target.value)}
                                placeholder="Shortcut/Tag de búsqueda (opcional, ej: envios)"
                                className="w-full bg-white dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-750 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-blue-500 font-mono text-zinc-800 dark:text-zinc-100"
                              />
                              <textarea
                                value={newCannedContent}
                                onChange={e => setNewCannedContent(e.target.value)}
                                placeholder="Escribí el texto de la respuesta acá..."
                                rows={4}
                                className="w-full bg-white dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-750 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-blue-500 resize-none text-zinc-800 dark:text-zinc-100"
                                required
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={savingCanned || !newCannedTitle.trim() || !newCannedContent.trim()}
                                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10.5px] font-bold shadow-sm transition-all"
                              >
                                {savingCanned ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Guardar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowNewCannedForm(false)}
                                className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-755 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-lg text-[10.5px] font-bold"
                              >
                                Cancelar
                              </button>
                            </div>
                          </form>
                        )}

                        {/* Responses list */}
                        {loadingCanned ? (
                          <div className="flex items-center justify-center py-6 text-zinc-400 gap-1.5">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-[11px]">Cargando respuestas...</span>
                          </div>
                        ) : (() => {
                          const query = cannedSearch.toLowerCase().trim();
                          const filteredCanned = cannedResponses.filter(c =>
                            c.title.toLowerCase().includes(query) ||
                            c.content.toLowerCase().includes(query) ||
                            (c.shortcut && c.shortcut.toLowerCase().includes(query))
                          );

                          if (filteredCanned.length === 0) {
                            return (
                              <div className="text-center py-8 text-zinc-400 text-[11.5px] italic">
                                No se encontraron respuestas rápidas.
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-2">
                              {filteredCanned.map(item => (
                                <div
                                  key={item.id}
                                  className="group/canned p-3 bg-zinc-50 hover:bg-zinc-100/80 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-850 rounded-2xl transition-all cursor-pointer flex flex-col gap-1.5 relative overflow-hidden"
                                  onClick={() => setReply(prev => prev ? prev + '\n' + item.content : item.content)}
                                >
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="text-[11.5px] font-black text-zinc-850 dark:text-zinc-200 truncate pr-6">{item.title}</span>
                                    {item.shortcut && (
                                      <span className="text-[9px] bg-zinc-200 dark:bg-zinc-800 text-zinc-550 dark:text-zinc-400 px-1.5 py-0.5 rounded font-mono font-bold flex-shrink-0">
                                        {item.shortcut}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 line-clamp-3">
                                    {item.content}
                                  </p>
                                  {/* Delete action overlay */}
                                  {!item.id.toString().startsWith('default_') && (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleDeleteCannedResponse(item.id);
                                      }}
                                      className="absolute right-2 top-2 p-1.5 text-zinc-400 hover:text-red-500 opacity-0 group-hover/canned:opacity-100 transition-opacity bg-zinc-150 hover:bg-red-50 dark:bg-zinc-850 dark:hover:bg-red-950/20 rounded-md"
                                      title="Eliminar plantilla"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* TAB 3: TIENDA & LINKS */}
                    {sidebarTab === 'shopify' && (
                      <div className="space-y-4 animate-in fade-in duration-200">
                        
                        {/* Section: Shopify Products */}
                        {profile?.shopify_domain && profile?.shopify_access_token ? (
                          <div className="space-y-2">
                            <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Catálogo Shopify</span>
                            <div className="relative">
                              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-400" />
                              <input
                                type="text"
                                value={shopifySearch}
                                onChange={e => setShopifySearch(e.target.value)}
                                placeholder="Buscar en catálogo..."
                                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-[11.5px] text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-zinc-400 transition-all"
                              />
                            </div>
                            
                            {loadingProducts ? (
                              <div className="flex items-center justify-center py-4 text-zinc-400 gap-1">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span className="text-[11px]">Buscando productos...</span>
                              </div>
                            ) : shopifyProducts.length === 0 ? (
                              <div className="text-center py-4 text-[11px] text-zinc-450 italic">
                                {shopifySearch ? 'No se encontraron productos' : 'Cargando catálogo...'}
                              </div>
                            ) : (
                              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
                                {shopifyProducts.map((p: any) => {
                                  const domain = profile.shopify_domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
                                  const productUrl = `https://${domain}/products/${p.handle}`;
                                  return (
                                    <div
                                      key={p.id}
                                      onClick={() => setReply(prev => prev ? `${prev} ${p.title}: ${productUrl}` : `${p.title}: ${productUrl}`)}
                                      className="p-2 border border-zinc-100 hover:border-zinc-250 dark:border-zinc-900 dark:hover:border-zinc-800 bg-zinc-50/50 hover:bg-zinc-100 dark:bg-zinc-900/20 dark:hover:bg-zinc-900/50 rounded-xl cursor-pointer flex items-center justify-between gap-2 transition-all active:scale-[0.99]"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{p.title}</p>
                                      </div>
                                      <div className="flex-shrink-0 flex items-center gap-1 text-[9px] font-black text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30 px-1.5 py-0.5 rounded bg-blue-50/30 dark:bg-blue-955/10">
                                        <Link className="w-2.5 h-2.5" /> Enlace
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl text-[11px] text-zinc-400 text-center">
                            Tienda Shopify no vinculada en este perfil de negocio.
                          </div>
                        )}

                        <div className="border-t border-zinc-100 dark:border-zinc-850 my-1" />

                        {/* Section: Custom brand links */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Enlaces del Sitio</span>
                          
                          {loadingLinks ? (
                            <div className="flex items-center justify-center py-4 text-zinc-400 gap-1">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span className="text-[11px]">Cargando enlaces...</span>
                            </div>
                          ) : customLinks.length === 0 ? (
                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl text-[11px] text-zinc-400 text-center">
                              No hay enlaces configurados en car_links.
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {customLinks.map((link: any) => (
                                <div
                                  key={link.id}
                                  onClick={() => setReply(prev => prev ? `${prev} ${link.url}` : link.url)}
                                  className="p-2 border border-zinc-100 hover:border-zinc-250 dark:border-zinc-900 dark:hover:border-zinc-800 bg-zinc-50/50 hover:bg-zinc-100 dark:bg-zinc-900/20 dark:hover:bg-zinc-900/50 rounded-xl cursor-pointer flex items-center justify-between gap-2 transition-all active:scale-[0.99]"
                                >
                                  <div className="min-w-0 flex-1 flex items-center gap-1.5">
                                    <span className="text-base">{link.icon || '🔗'}</span>
                                    <span className="text-[11px] font-bold text-zinc-850 dark:text-zinc-200 truncate">{link.label}</span>
                                  </div>
                                  <div className="flex-shrink-0 flex items-center gap-1 text-[9px] font-black text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 rounded bg-white dark:bg-zinc-900">
                                    Insertar
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    )}

                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>


      {/* Context Menu */}
      {ctxMenu && (
        <div ref={ctxRef}
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl py-1 min-w-[200px] animate-in fade-in zoom-in-95 duration-100">
          {[
            { action: 'read',         label: 'Marcar como leído',            icon: '✓' },
            { action: 'resolved',     label: 'Marcar como resuelto',         icon: '✅' },
            { action: 'open',         label: 'Marcar como abierto',          icon: '📂' },
            { action: 'pending',      label: 'Marcar como pendiente',        icon: '⏳' },
            { action: 'snooze',       label: 'Posponer 1 hora',              icon: '⏰' },
            null,
            { action: 'priority_high',label: 'Prioridad alta',               icon: '🔴' },
            { action: 'priority_none',label: 'Sin prioridad',                icon: '⚪' },
            null,
            { action: 'copy',         label: 'Copiar enlace',                icon: '🔗' },
            null,
            { action: 'delete',       label: 'Eliminar conversación',        icon: '🗑️', danger: true },
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
