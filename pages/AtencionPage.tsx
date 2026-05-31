import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { chatwoot } from '../services/chatwoot';
import {
  MessageSquare, Clock, CheckCircle, RefreshCw, AlertCircle,
  Loader2, ExternalLink, Inbox, Users, TrendingUp, Zap
} from 'lucide-react';

const fmtSeconds = (secs: number) => {
  if (!secs || isNaN(secs)) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(secs)}s`;
};

const fmtTime = (ts: number) => {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const StatCard = ({ label, value, sub, icon: Icon, color }: any) => (
  <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-2xl p-5 flex flex-col gap-3">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">{label}</span>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
    </div>
    <div>
      <p className="text-[28px] font-black text-zinc-900 dark:text-white leading-none">{value}</p>
      {sub && <p className="text-[11px] text-zinc-400 font-medium mt-1">{sub}</p>}
    </div>
  </div>
);

export default function AtencionPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  const chatwootUrl = (profile as any)?.chatwoot_url;
  const chatwootToken = (profile as any)?.chatwoot_token;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [openConvs, setOpenConvs] = useState<any[]>([]);
  const [resolvedConvs, setResolvedConvs] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    if (!chatwootUrl || !chatwootToken) return;
    setLoading(true);
    setError(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const [ov, sm, opens, resolved] = await Promise.all([
        chatwoot.getOverview(chatwootUrl, chatwootToken).catch(() => null),
        chatwoot.getSummary(chatwootUrl, chatwootToken, startOfDay, now).catch(() => null),
        chatwoot.getConversations(chatwootUrl, chatwootToken, 'open').catch(() => []),
        chatwoot.getConversations(chatwootUrl, chatwootToken, 'resolved').catch(() => []),
      ]);
      setOverview(ov);
      setSummary(sm);
      setOpenConvs(opens);
      setResolvedConvs(resolved.slice(0, 10));
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Error al conectar con Chatwoot');
    } finally {
      setLoading(false);
    }
  }, [chatwootUrl, chatwootToken]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!chatwootUrl || !chatwootToken) {
    return (
      <div className="max-w-[900px] mx-auto space-y-8 animate-in fade-in duration-300">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Módulo A
          </div>
          <h1 className="text-[24px] font-bold tracking-tight text-zinc-900 dark:text-white">Atención al Cliente</h1>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-800 dark:text-amber-400 text-[14px]">Chatwoot no configurado</h3>
            <p className="text-[12px] text-amber-600 dark:text-amber-500 mt-1">
              Este cliente no tiene Chatwoot configurado. Completá la URL y el token en Administración → Gestión de Clientes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const openCount = overview?.open_conversations_count ?? openConvs.length;
  const pendingCount = overview?.pending_conversations_count ?? 0;
  const unattendedCount = overview?.unattended_conversations_count ?? 0;
  const avgFirstResponse = summary?.avg_first_response_time ?? 0;
  const avgResolution = summary?.avg_resolution_time ?? 0;
  const resolvedToday = summary?.resolutions_count ?? resolvedConvs.length;

  return (
    <div className="max-w-[1200px] mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            En vivo · Chatwoot
          </div>
          <h1 className="text-[24px] font-bold tracking-tight text-zinc-900 dark:text-white">Atención al Cliente</h1>
          {lastUpdated && (
            <p className="text-[11px] text-zinc-400 mt-0.5">Actualizado {lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
          )}
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[12px] font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-red-700 dark:text-red-400 text-[13px]">Error al conectar con Chatwoot</h4>
            <code className="text-[11px] text-red-600 dark:text-red-500">{error}</code>
          </div>
        </div>
      )}

      {loading && !overview && !openConvs.length ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
          <p className="text-[13px] text-zinc-400 font-medium">Cargando datos de Chatwoot...</p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Conversaciones abiertas" value={openCount} sub="En este momento" icon={Inbox} color="bg-blue-500" />
            <StatCard label="Resueltas hoy" value={resolvedToday} sub="Desde las 00:00" icon={CheckCircle} color="bg-emerald-500" />
            <StatCard label="1er tiempo de respuesta" value={fmtSeconds(avgFirstResponse)} sub="Promedio hoy" icon={Clock} color="bg-violet-500" />
            <StatCard label="Tiempo de resolución" value={fmtSeconds(avgResolution)} sub="Promedio hoy" icon={TrendingUp} color="bg-orange-500" />
          </div>

          {/* Secondary stats */}
          {(pendingCount > 0 || unattendedCount > 0) && (
            <div className="grid grid-cols-2 gap-4">
              {pendingCount > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-4 flex items-center gap-3">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-[20px] font-black text-amber-700 dark:text-amber-400">{pendingCount}</p>
                    <p className="text-[11px] text-amber-600 dark:text-amber-500 font-bold">Pendientes de asignar</p>
                  </div>
                </div>
              )}
              {unattendedCount > 0 && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl p-4 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="text-[20px] font-black text-red-700 dark:text-red-400">{unattendedCount}</p>
                    <p className="text-[11px] text-red-600 dark:text-red-500 font-bold">Sin atender</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Agents overview */}
          {overview?.agents && overview.agents.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-400" />
                <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Agentes activos</h3>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {overview.agents.map((agent: any) => (
                  <div key={agent.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center text-[12px] font-black text-violet-600 dark:text-violet-400">
                          {agent.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 ${
                          agent.availability_status === 'online' ? 'bg-emerald-400' :
                          agent.availability_status === 'busy' ? 'bg-amber-400' : 'bg-zinc-300'
                        }`} />
                      </div>
                      <div>
                        <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">{agent.name}</p>
                        <p className="text-[10px] text-zinc-400 capitalize">{agent.availability_status || 'offline'}</p>
                      </div>
                    </div>
                    <span className="text-[12px] font-black text-zinc-600 dark:text-zinc-300">
                      {agent.open_conversations_count ?? 0} <span className="text-zinc-400 font-normal">conv.</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open conversations list */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-zinc-400" />
                <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Conversaciones abiertas</h3>
              </div>
              <a
                href={chatwootUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
              >
                Abrir Chatwoot <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {openConvs.length === 0 ? (
              <div className="py-12 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-[13px] text-zinc-400 font-semibold">Sin conversaciones abiertas</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {openConvs.slice(0, 15).map((conv: any) => {
                  const contact = conv.meta?.sender || conv.contact_inbox?.contact || {};
                  const lastMsg = conv.messages?.[0];
                  const channel = conv.channel || conv.inbox?.channel_type || '';
                  const isWhatsApp = channel.toLowerCase().includes('whatsapp');
                  return (
                    <div key={conv.id} className="px-5 py-3 flex items-center gap-4 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] flex-shrink-0 ${isWhatsApp ? 'bg-emerald-500' : 'bg-violet-500'}`}>
                        {isWhatsApp ? '📱' : contact.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{contact.name || `Conv #${conv.id}`}</span>
                          {contact.phone_number && <span className="text-[10px] text-zinc-400 font-mono flex-shrink-0">{contact.phone_number}</span>}
                          {isWhatsApp && <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 px-1.5 py-0.5 rounded-full flex-shrink-0">WhatsApp</span>}
                        </div>
                        {lastMsg?.content && (
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5 italic">"{lastMsg.content}"</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-[10px] text-zinc-400">{fmtTime(conv.last_activity_at)}</p>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full mt-0.5 inline-block ${
                          conv.status === 'open' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {conv.status === 'open' ? 'Abierto' : conv.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
