import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import {
  RefreshCw, AlertCircle, Loader2, Send, Sparkles,
  Search, CheckCircle, Clock, Inbox, ExternalLink
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

  const cwUrl = (profile as any)?.chatwoot_url;
  const cwToken = (profile as any)?.chatwoot_token;

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | 'pending'>('open');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
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
      const [{ payload: first, hasMore: more }, sm] = await Promise.all([
        chatwoot.getConversationsPage(cwUrl, cwToken, statusFilter, 1),
        chatwoot.getSummary(cwUrl, cwToken, Math.floor(new Date().setHours(0,0,0,0)/1000), Math.floor(Date.now()/1000)).catch(() => null),
      ]);
      setConversations(first);
      setHasMore(more);
      setSummary(sm);
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
    } catch (e: any) {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, [cwUrl, cwToken]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !selected || !cwUrl || !cwToken) return;
    setSending(true);
    setSendError(null);
    try {
      const sent = await chatwoot.sendMessage(cwUrl, cwToken, selected.id, reply.trim());
      setMessages(prev => [...prev, { ...sent, created_at: Date.now() / 1000 }]);
      setReply('');
    } catch (e: any) {
      setSendError('No se pudo enviar. Verificá el token de Chatwoot.');
    } finally {
      setSending(false);
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

  const assignFiltered = conversations.filter(c => {
    if (assignFilter === 'unassigned') return !c.meta?.assignee;
    if (assignFilter === 'mine') return !!c.meta?.assignee;
    return true;
  });

  const filtered = assignFiltered.filter(c => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const name = (c.meta?.sender?.name || '').toLowerCase();
    const phone = c.meta?.sender?.phone_number || '';
    const email = (c.meta?.sender?.email || '').toLowerCase();
    const lastMsg = (c.messages?.[0]?.content || '').toLowerCase();
    return name.includes(s) || phone.includes(s) || email.includes(s) || String(c.id).includes(s) || lastMsg.includes(s);
  });

  const unassignedCount = conversations.filter(c => !c.meta?.assignee).length;

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
          <a href={cwUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline">
            Abrir Chatwoot <ExternalLink className="w-3 h-3" />
          </a>
          <button onClick={loadConversations} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[11px] font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 transition-all disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: conversation list */}
        <div className="w-[300px] flex-shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">

          {/* Search */}
          <div className="p-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input type="text" placeholder="Buscar contacto, teléfono..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-400 text-zinc-700 dark:text-zinc-300" />
            </div>
          </div>

          {/* Assign tabs */}
          <div className="flex border-b border-zinc-100 dark:border-zinc-800 text-[11px] font-bold">
            {[
              { key: 'all', label: 'Todos', count: conversations.length },
              { key: 'unassigned', label: 'Sin asignar', count: unassignedCount },
              { key: 'mine', label: 'Asignados', count: conversations.length - unassignedCount },
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
                <button key={conv.id} onClick={() => loadMessages(conv)}
                  className={`w-full text-left px-3 py-3 flex items-start gap-2.5 transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-500/10' : isUnread ? 'bg-zinc-50/80 dark:bg-zinc-900/60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'}`}>
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
                </button>
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
        <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-900/30">
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
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
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
                        isMe
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 shadow-sm'
                      }`}>
                        {msg.content || <span className="italic opacity-60">📎 Archivo adjunto</span>}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply box */}
              <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-shrink-0">
                {sendError && (
                  <div className="mb-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl text-[11px] text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {sendError}
                  </div>
                )}
                <form onSubmit={handleSend} className="flex gap-3 items-end">
                  <textarea
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }}}
                    placeholder="Escribí tu respuesta... (Enter para enviar)"
                    rows={2}
                    className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-[13px] text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                  />
                  <button type="submit" disabled={!reply.trim() || sending}
                    className="flex items-center gap-1.5 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[13px] font-bold rounded-2xl transition-all shadow-sm flex-shrink-0">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
