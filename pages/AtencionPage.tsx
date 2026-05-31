import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import {
  RefreshCw, AlertCircle, Loader2, Send, Sparkles,
  Search, CheckCircle, Clock, Inbox, ExternalLink, Bot
} from 'lucide-react';

const fmtTime = (ts: number) => {
  if (!ts) return '';
  const d = new Date(ts * 1000);
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

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500',
  resolved: 'bg-emerald-500',
  pending: 'bg-amber-500',
};

export default function AtencionPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const isAdmin = authProfile?.is_admin;

  const cwUrl = (profile as any)?.chatwoot_url;
  const cwToken = (profile as any)?.chatwoot_token;

  const [conversations, setConversations] = useState<any[]>([]);
  const [convMeta, setConvMeta] = useState<{ all_count: number; unassigned_count: number; assigned_count: number } | null>(null);
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

  const loadConversations = useCallback(async () => {
    if (!cwUrl || !cwToken) return;
    setLoading(true);
    setError(null);
    setConversations([]);
    setCurrentPage(1);
    setHasMore(false);
    try {
      const [{ payload: first, hasMore: more, meta }, sm] = await Promise.all([
        chatwoot.getConversationsPage(cwUrl, cwToken, statusFilter, 1),
        chatwoot.getSummary(cwUrl, cwToken, Math.floor(new Date().setHours(0,0,0,0)/1000), Math.floor(Date.now()/1000)).catch(() => null),
      ]);
      setConversations(first);
      setHasMore(more);
      setSummary(sm);
      if (meta) setConvMeta({ all_count: meta.all_count ?? 0, unassigned_count: meta.unassigned_count ?? 0, assigned_count: meta.assigned_count ?? 0 });
      setLoading(false);

      // Auto-load remaining pages in background
      if (more) {
        let page = 2;
        while (true) {
          const { payload, hasMore: stillMore } = await chatwoot.getConversationsPage(cwUrl, cwToken, statusFilter, page);
          setConversations(prev => [...prev, ...payload]);
          if (!stillMore || page >= 20) break;
          page++;
        }
        setHasMore(false);
        setLoadingMore(false);
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }, [cwUrl, cwToken, statusFilter]);

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
                  ? { ...c, last_activity_at: d.created_at, messages: [d, ...(c.messages || [])], unread_count: selectedRef.current?.id === d.conversation_id ? 0 : (c.unread_count || 0) + (d.message_type === 0 ? 1 : 0) }
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

  const selectedRef = useRef<any>(null);
  selectedRef.current = selected;

  const loadMessages = useCallback(async (conv: any) => {
    if (!cwUrl || !cwToken) return;
    setSelected(conv);
    setMessages([]);
    setReply('');
    setSendError(null);
    setLoadingMsgs(true);
    try {
      const msgs = await chatwoot.getMessages(cwUrl, cwToken, conv.id);
      setMessages(msgs.sort((a: any, b: any) => a.created_at - b.created_at));
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
      const last20 = messages.slice(-20);
      const lastIncoming = [...last20].reverse().find((m: any) => m.message_type === 0);
      const lastMsg = last20[last20.length - 1];
      const history = last20.map((m: any) => {
        const who = m.message_type === 1 ? 'Agente' : (contact(selected).name || 'Cliente');
        return `${who}: ${m.content || '[archivo adjunto]'}`;
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !selected || !cwUrl || !cwToken) return;
    setSending(true);
    setSendError(null);
    const tempId = `local_${Date.now()}`;
    const tempMsg = { id: tempId, content: reply.trim(), message_type: 1, created_at: Date.now() / 1000, pending: true };
    setMessages(prev => [...prev, tempMsg]);
    const sentText = reply.trim();
    setReply('');
    try {
      const sent = await chatwoot.sendMessage(cwUrl, cwToken, selected.id, sentText);
      // Replace temp with real message
      setMessages(prev => prev.map((m: any) => m.id === tempId ? { ...sent, created_at: sent?.created_at || Date.now()/1000 } : m));
    } catch (e: any) {
      // Mark temp message as failed
      setFailedMsgIds(prev => new Set([...prev, tempId]));
      setSendError(e.message || 'No se pudo enviar el mensaje.');
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

  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned'>('all');

  const contact = (c: any) => c.meta?.sender || c.contact_inbox?.contact || {};
  const getChannel = (c: any) => {
    const ch = (c.channel || c.inbox?.channel_type || '').toLowerCase();
    if (ch.includes('whatsapp')) return 'whatsapp';
    if (ch.includes('instagram')) return 'instagram';
    if (ch.includes('facebook') || ch.includes('page')) return 'facebook';
    if (ch.includes('email')) return 'email';
    return 'other';
  };
  const CHANNEL_ICON: Record<string, string> = { whatsapp: '📱', instagram: '📸', facebook: '📘', email: '📧', other: '💬' };
  const CHANNEL_COLOR: Record<string, string> = { whatsapp: 'bg-emerald-500', instagram: 'bg-pink-500', facebook: 'bg-blue-600', email: 'bg-violet-500', other: 'bg-zinc-500' };

  const sortedConversations = [...conversations].sort((a, b) => {
    if (sortBy === 'oldest') return a.last_activity_at - b.last_activity_at;
    if (sortBy === 'priority') {
      const p: any = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      return (p[a.priority] ?? 4) - (p[b.priority] ?? 4);
    }
    return b.last_activity_at - a.last_activity_at;
  });

  const assignFiltered = sortedConversations.filter(c => {
    if (assignFilter === 'unassigned') return !c.meta?.assignee;
    if (assignFilter === 'mine') return !!c.meta?.assignee;
    return true;
  });

  const filtered = assignFiltered.filter(c => {
    if (canReplyOnly && c.can_reply === false) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const name = (c.meta?.sender?.name || '').toLowerCase();
    const phone = c.meta?.sender?.phone_number || '';
    const email = (c.meta?.sender?.email || '').toLowerCase();
    const lastMsg = (c.messages?.[0]?.content || '').toLowerCase();
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

  const totalCount = convMeta?.all_count ?? conversations.length;
  const unassignedCount = convMeta?.unassigned_count ?? conversations.filter(c => !c.meta?.assignee).length;
  const assignedCount = convMeta?.assigned_count ?? conversations.filter(c => !!c.meta?.assignee).length;

  if (!cwUrl || !cwToken) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 max-w-md flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-800 dark:text-amber-400 text-[14px]">Chatwoot no configurado</h3>
            <p className="text-[12px] text-amber-600 dark:text-amber-500 mt-1">Completá la URL y el token en Administración → Gestión de Clientes.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -mx-4 sm:-mx-6 lg:-mx-8 -mt-6">

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Atención · Chatwoot
          </div>
          {summary && (
            <div className="hidden sm:flex items-center gap-4 text-[11px] text-zinc-400 font-medium">
              <span><b className="text-zinc-700 dark:text-zinc-300">{summary.resolutions_count ?? 0}</b> resueltas hoy</span>
              <span><b className="text-zinc-700 dark:text-zinc-300">{fmtSeconds(summary.avg_first_response_time)}</b> 1er resp.</span>
              <span><b className="text-zinc-700 dark:text-zinc-300">{fmtSeconds(summary.avg_resolution_time)}</b> resolución</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <a href={cwUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline">
              Abrir Chatwoot <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: conversation list */}
        <div className={`${expanded ? 'w-full' : 'w-[320px]'} flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-200`}>

          {/* Search + controls */}
          <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input type="text" placeholder="Buscar contacto, teléfono..." value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-400 text-zinc-700 dark:text-zinc-300" />
              </div>
              {/* Sort button */}
              <div className="relative group">
                <button className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors" title="Ordenar">
                  <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 4h12M4 8h8M6 12h4" strokeLinecap="round"/>
                  </svg>
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl py-1 min-w-[150px] z-50 hidden group-hover:block">
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
              {/* Can reply filter */}
              <button onClick={() => setCanReplyOnly(v => !v)}
                title="Solo los que puedo responder"
                className={`p-1.5 rounded-lg transition-colors ${canReplyOnly ? 'bg-emerald-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13 8c0 2.76-2.24 5-5 5s-5-2.24-5-5 2.24-5 5-5" strokeLinecap="round"/>
                  <path d="M10 3l2 2-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {/* Expand button */}
              <button onClick={() => setExpanded(e => !e)}
                className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors" title={expanded ? 'Contraer' : 'Expandir lista'}>
                <svg className="w-3.5 h-3.5 text-zinc-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  {expanded
                    ? <path d="M10 6L6 6M10 10L6 10" strokeLinecap="round"/>
                    : <path d="M6 2L10 8L6 14" strokeLinecap="round" strokeLinejoin="round"/>
                  }
                </svg>
              </button>
            </div>
          </div>

          {/* Assign tabs */}
          <div className="flex border-b border-zinc-100 dark:border-zinc-800 text-[11px] font-bold">
            {[
              { key: 'all', label: 'Todos', count: totalCount },
              { key: 'unassigned', label: 'Sin asignar', count: unassignedCount },
              { key: 'mine', label: 'Asignados', count: assignedCount },
            ].map(t => (
              <button key={t.key} onClick={() => setAssignFilter(t.key as any)}
                className={`flex-1 py-2 flex items-center justify-center gap-1 transition-colors border-b-2 ${assignFilter === t.key ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}>
                {t.label}
                {t.count > 0 && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${assignFilter === t.key ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>{t.count}</span>}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-1 p-2 border-b border-zinc-100 dark:border-zinc-800">
            {(['open', 'resolved', 'pending'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
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
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
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
              const lastMsg = conv.messages?.[0];
              const ch = getChannel(conv);
              const isSelected = selected?.id === conv.id;
              const unread = conv.unread_count || 0;
              const isUnread = unread > 0;
              return (
                <div key={conv.id}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, conv }); }}
                  className={`w-full text-left px-3 py-3 flex items-start gap-2 transition-colors cursor-pointer group/conv ${isSelected || selectedIds.has(conv.id) ? 'bg-blue-50 dark:bg-blue-500/10' : isUnread ? 'bg-zinc-50/80 dark:bg-zinc-900/60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'}`}>
                  {/* Checkbox */}
                  <div className={`flex-shrink-0 mt-1 ${selectedIds.size > 0 ? 'opacity-100' : 'opacity-0 group-hover/conv:opacity-100'} transition-opacity`}
                    onClick={e => toggleSelect(conv.id, e)}>
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selectedIds.has(conv.id) ? 'bg-blue-600 border-blue-600' : 'border-zinc-300 dark:border-zinc-600'}`}>
                      {selectedIds.has(conv.id) && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  </div>
                  <div className="flex-1 flex items-start gap-2.5" onClick={() => loadMessages(conv)}>
                  <div className="relative flex-shrink-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-black ${CHANNEL_COLOR[ch]}`}>
                      {CHANNEL_ICON[ch]}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[12px] truncate ${isUnread ? 'font-black text-zinc-900 dark:text-white' : 'font-semibold text-zinc-700 dark:text-zinc-300'}`}>
                        {c.name || `#${conv.id}`}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-zinc-400">{fmtTime(conv.last_activity_at)}</span>
                        {unread > 0 && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] text-zinc-400 uppercase font-bold">{ch}</span>
                      {c.phone_number && <><span className="text-zinc-300 dark:text-zinc-700">·</span><span className="text-[10px] text-zinc-400 font-mono truncate">{c.phone_number}</span></>}
                    </div>
                    {lastMsg?.content && (
                      <p className={`text-[11px] truncate mt-0.5 ${isUnread ? 'text-zinc-700 dark:text-zinc-300 font-semibold' : 'text-zinc-400 italic'}`}>
                        {lastMsg.content}
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
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-950">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-3xl">💬</div>
              <p className="text-[14px] font-medium">Seleccioná una conversación</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center gap-3 flex-shrink-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-black flex-shrink-0 ${CHANNEL_COLOR[getChannel(selected)]}`}>
                  {CHANNEL_ICON[getChannel(selected)]}
                </div>
                <div>
                  <p className="text-[14px] font-bold text-zinc-900 dark:text-white">{contact(selected).name || `Conversación #${selected.id}`}</p>
                  <div className="flex items-center gap-2">
                    {contact(selected).phone_number && <span className="text-[11px] text-zinc-400 font-mono">{contact(selected).phone_number}</span>}
                    <span className="text-[9px] font-black bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded-full uppercase">{getChannel(selected)}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full text-white ${STATUS_COLORS[selected.status] || 'bg-zinc-400'}`}>
                      {selected.status === 'open' ? 'Abierto' : selected.status === 'resolved' ? 'Resuelto' : 'Pendiente'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-white dark:bg-zinc-950">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400 text-[13px]">Sin mensajes</div>
                ) : messages.map((msg: any) => {
                  const isMe = msg.message_type === 1; // 1 = outgoing
                  const isActivity = msg.message_type === 2; // 2 = activity
                  if (isActivity) return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">{msg.content}</span>
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
                        {msg.content || <span className="italic opacity-60">📎 Archivo adjunto</span>}
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

              {/* Reply box */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0">
                {(() => {
                  // Check 24h WhatsApp window
                  const lastIncoming = [...messages].reverse().find((m: any) => m.message_type === 0);
                  const isWhatsAppConv = getChannel(selected) === 'whatsapp';
                  const over24h = isWhatsAppConv && lastIncoming && (Date.now()/1000 - lastIncoming.created_at) > 86400;
                  const noIncoming = isWhatsAppConv && !lastIncoming;

                  if (over24h || noIncoming) {
                    return (
                      <div className="px-5 py-4 space-y-3">
                        <div className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl">
                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[12px] font-bold text-amber-800 dark:text-amber-400">Ventana de 24 horas cerrada</p>
                            <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">
                              Solo podés responder usando un mensaje de plantilla (template). El cliente no envió mensajes en las últimas 24 horas.
                            </p>
                          </div>
                        </div>
                        <a href={`${cwUrl}/app/accounts/${selected.account_id || ''}/conversations/${selected.id}`}
                          target="_blank" rel="noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold rounded-xl transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                          Abrir en Chatwoot para enviar template
                        </a>
                      </div>
                    );
                  }

                  return (
                    <div className="px-5 py-4 space-y-3">
                      {sendError && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl text-[11px] text-red-600 dark:text-red-400 flex items-start gap-2">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold">Error al enviar</p>
                            <p className="mt-0.5">{sendError}</p>
                            {sendError.toLowerCase().includes('template') && (
                              <a href={`${cwUrl}`} target="_blank" rel="noreferrer" className="underline mt-1 block">Abrir Chatwoot para usar template →</a>
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
                            className="flex items-center gap-1.5 px-4 py-2 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/25 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-400 rounded-xl text-[12px] font-bold border border-violet-200 dark:border-violet-800/40 transition-all disabled:opacity-50">
                            {generatingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
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
