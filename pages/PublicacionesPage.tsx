import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock3, ExternalLink, FileVideo,
  History, Loader2, Search, ShieldCheck, XCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { supabase } from '../services/supabase';

type StatusFilter = 'all' | 'published' | 'scheduled' | 'processing' | 'failed';
type ChannelFilter = 'all' | 'instagram' | 'facebook' | 'tiktok' | 'youtube';

const STATUS_META: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  published: { label: 'Publicado', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  processing: { label: 'Procesando', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-300', icon: <Clock3 className="w-3.5 h-3.5" /> },
  scheduled: { label: 'Programado', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-300', icon: <CalendarDays className="w-3.5 h-3.5" /> },
  failed: { label: 'Falló', cls: 'bg-red-500/10 text-red-600 dark:text-red-300', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const fmtDate = (value?: string | null) => {
  if (!value) return 'Sin fecha';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
};

const getChannelAccount = (item: any, channel: string) => {
  const direct = item.results?.[channel]?.account;
  const audit = item.results?.audit?.accounts?.[channel];
  return direct || audit || null;
};

const getAccountLabel = (account: any, channel: string) => {
  if (!account) return 'Cuenta no registrada en auditoría';
  if (channel === 'instagram') return account.username ? `@${account.username}` : account.account_id || 'Instagram';
  if (channel === 'facebook') return account.page_name || account.page_id || 'Facebook';
  if (channel === 'tiktok') return account.display_name || account.open_id || 'TikTok';
  if (channel === 'youtube') return account.channel_title || account.channel_id || 'YouTube Shorts';
  return account.account_id || account.page_id || account.channel_id || account.open_id || channel;
};

export default function PublicacionesPage() {
  const { profile: authProfile, user } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [query, setQuery] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    if (!clientId) return;
    setLoading(true);
    supabase
      .from('car_social_publications')
      .select('id, client_id, user_id, caption, video_url, video_path, selected_channels, results, status, created_at, published_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(120)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setItems([]);
        else setItems(data || []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [clientId, refreshTick]);

  const processDuePublications = async () => {
    if (!clientId) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData.session?.access_token || '';
      const expiresAtMs = sessionData.session?.expires_at ? sessionData.session.expires_at * 1000 : 0;
      if (!accessToken || (expiresAtMs && expiresAtMs < Date.now() + 120000)) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        accessToken = refreshed.session?.access_token || '';
      }
      if (!accessToken) return;
      const res = await fetch('/api/oauth?action=social-publish-due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ clientId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.processed > 0) setRefreshTick(tick => tick + 1);
    } catch (err) {
      console.warn('[Publication History] due publish check failed', err);
    }
  };

  useEffect(() => {
    processDuePublications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      const channels = item.selected_channels || [];
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (channelFilter !== 'all' && !channels.includes(channelFilter)) return false;
      if (!q) return true;
      return `${item.caption || ''} ${item.video_path || ''} ${channels.join(' ')}`.toLowerCase().includes(q);
    });
  }, [items, statusFilter, channelFilter, query]);

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-4 animate-in fade-in duration-200">
      <header className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-sm px-4 py-4 sm:px-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-sm shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[24px] sm:text-[30px] font-black tracking-tight text-zinc-950 dark:text-white leading-none">Historial de publicaciones</h1>
            <p className="mt-1 text-[12.5px] font-semibold text-zinc-500 dark:text-zinc-400">
              Auditoría por cliente, cuenta, canal, archivo, usuario y resultado.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-3 py-2 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
          <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-200">Cliente actual: {profile?.business_name || profile?.email || clientId}</span>
        </div>
      </header>

      <section className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-sm p-3 sm:p-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por copy, archivo o canal..."
              className="w-full h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/30 pl-9 pr-3 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-violet-500/25"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/30 px-3 text-[12px] font-black">
            <option value="all">Todos los estados</option>
            <option value="published">Publicados</option>
            <option value="scheduled">Programados</option>
            <option value="processing">Procesando</option>
            <option value="failed">Fallidos</option>
          </select>
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value as ChannelFilter)} className="h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/30 px-3 text-[12px] font-black">
            <option value="all">Todos los canales</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
          </select>
        </div>
      </section>

      {loading ? (
        <div className="min-h-[260px] flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 bg-white dark:bg-[#18181b] p-10 text-center">
          <FileVideo className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <h2 className="text-[17px] font-black text-zinc-900 dark:text-white">Sin publicaciones para mostrar</h2>
          <p className="mt-1 text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">Cuando publiques o programes contenido, va a quedar auditado acá.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const status = STATUS_META[item.status] || { label: item.status, cls: 'bg-zinc-100 dark:bg-white/10 text-zinc-500', icon: <AlertCircle className="w-3.5 h-3.5" /> };
            const channels = item.selected_channels || [];
            return (
              <article key={item.id} className="rounded-2xl border border-zinc-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] shadow-sm overflow-hidden">
                <div className="p-4 grid grid-cols-1 lg:grid-cols-[160px_minmax(0,1fr)] gap-4">
                  <div className="rounded-xl bg-zinc-100 dark:bg-zinc-950/35 aspect-video lg:aspect-[9/12] overflow-hidden flex items-center justify-center">
                    {item.video_url ? (
                      <video src={item.video_url} className="w-full h-full object-cover" muted playsInline />
                    ) : (
                      <FileVideo className="w-8 h-8 text-zinc-400" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-black ${status.cls}`}>
                            {status.icon}
                            {status.label}
                          </span>
                          <span className="text-[11px] font-bold text-zinc-400">Creado: {fmtDate(item.created_at)}</span>
                        </div>
                        <p className="mt-2 text-[14px] font-bold text-zinc-900 dark:text-white line-clamp-2">{item.caption || 'Publicación sin copy'}</p>
                      </div>
                      {item.video_url && (
                        <a href={item.video_url} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-xl border border-zinc-200 dark:border-white/10 text-[11px] font-black text-zinc-600 dark:text-zinc-300 flex items-center gap-2 hover:bg-zinc-50 dark:hover:bg-white/5">
                          Archivo
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                      {channels.map((channel: string) => {
                        const result = item.results?.[channel] || {};
                        const account = getChannelAccount(item, channel);
                        return (
                          <div key={channel} className="rounded-xl border border-zinc-100 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950/25 p-3">
                            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400">{channel}</p>
                            <p className="mt-1 text-[12px] font-black text-zinc-900 dark:text-white truncate">{getAccountLabel(account, channel)}</p>
                            <p className="mt-1 text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400 truncate">
                              {result.status || item.status}
                            </p>
                            {result.url && (
                              <a href={result.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[10.5px] font-black text-violet-500 hover:underline">
                                Ver publicación
                              </a>
                            )}
                            {result.attempts && (
                              <p className="mt-1 text-[10px] font-bold text-zinc-400">Intentos: {result.attempts}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {(item.results?.error || Object.values(item.results || {}).some((result: any) => result?.message && (result.status === 'error' || result.status === 'missing_connection'))) && (
                      <div className="rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-3 text-[11px] font-bold text-red-700 dark:text-red-300">
                        {item.results?.error || Object.values(item.results || {}).map((result: any) => result?.message).filter(Boolean)[0]}
                      </div>
                    )}

                    <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950/20 border border-zinc-100 dark:border-white/10 p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <p><span className="font-black text-zinc-400 uppercase">Cliente:</span> <span className="font-bold text-zinc-700 dark:text-zinc-300">{item.results?.audit?.client?.business_name || profile?.business_name || item.client_id}</span></p>
                      <p><span className="font-black text-zinc-400 uppercase">Usuario:</span> <span className="font-bold text-zinc-700 dark:text-zinc-300">{item.user_id || user?.id || 'No registrado'}</span></p>
                      <p><span className="font-black text-zinc-400 uppercase">Fecha salida:</span> <span className="font-bold text-zinc-700 dark:text-zinc-300">{fmtDate(item.published_at || item.results?.scheduled_at)}</span></p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
