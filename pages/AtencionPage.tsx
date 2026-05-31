import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import {
  TrendingUp, MessageCircle, Inbox, Send, Clock, CheckCircle, Users, ChevronDown, Calendar, Loader2, AlertCircle, Activity, HelpCircle
} from 'lucide-react';
import { chatwoot } from '../services/chatwoot';
import { getPrevPeriod, today, daysAgo, presetToRange } from '../services/metaAds';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import EmailLoader from '../components/ui/EmailLoader';

const VIOLET = '#8b5cf6';

interface MetricKeyData {
  key: string;
  label: string;
  icon: any;
  color: string;
  isTime?: boolean;
}

const METRICS_CONFIG: MetricKeyData[] = [
  { key: 'conversations_count', label: 'Conversaciones Totales', icon: MessageCircle, color: '#8b5cf6' },
  { key: 'incoming_messages_count', label: 'Mensajes Entrantes', icon: Inbox, color: '#10b981' },
  { key: 'outgoing_messages_count', label: 'Mensajes Salientes', icon: Send, color: '#3b82f6' },
  { key: 'avg_first_response_time', label: 'Tiempo Resp. Promedio', icon: Clock, color: '#f59e0b', isTime: true },
  { key: 'avg_resolution_time', label: 'Tiempo Res. Promedio', icon: CheckCircle, color: '#ec4899', isTime: true },
  { key: 'resolutions_count', label: 'Conversaciones Resueltas', icon: CheckCircle, color: '#6366f1' },
];

export default function AtencionPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;

  // Active dates
  const [activePreset, setActivePreset] = useState<any>('last_14d');
  const [activeSince, setActiveSince] = useState(daysAgo(14));
  const [activeUntil, setActiveUntil] = useState(today());
  const [refreshKey, setRefreshKey] = useState(0);

  // Picker modal state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<any>('last_14d');
  const [pendingSince, setPendingSince] = useState(daysAgo(14));
  const [pendingUntil, setPendingUntil] = useState(today());
  const [hovering, setHovering] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Scope filters
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedInboxId, setSelectedInboxId] = useState<string>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');

  // Dashboard Data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [prevSummaryData, setPrevSummaryData] = useState<any>(null);

  // Live state counters
  const [liveMetaOpen, setLiveMetaOpen] = useState<any>(null);
  const [liveMetaPending, setLiveMetaPending] = useState<any>(null);
  const [loadingLive, setLoadingLive] = useState(false);

  // Time-Series Chart details
  const [expandedMetric, setExpandedMetric] = useState<string | null>('conversations_count');
  const [chartData, setChartData] = useState<any[]>([]);
  const [prevChartData, setPrevChartData] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);

  // Breakdown tables data
  const [inboxBreakdowns, setInboxBreakdowns] = useState<any[]>([]);
  const [loadingBreakdowns, setLoadingBreakdowns] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch scope filters (Inboxes and Agents list) once
  useEffect(() => {
    if (!profile?.chatwoot_url || !profile?.chatwoot_token) return;

    const loadFilters = async () => {
      try {
        const [inboxList, agentList] = await Promise.all([
          chatwoot.getInboxes(profile.chatwoot_url, profile.chatwoot_token),
          chatwoot.getAgents(profile.chatwoot_url, profile.chatwoot_token),
        ]);
        setInboxes(inboxList || []);
        setAgents(agentList || []);
      } catch (err) {
        console.error('Error loading Chatwoot filters:', err);
      }
    };
    loadFilters();
  }, [profile?.chatwoot_url, profile?.chatwoot_token]);

  // Convert dates to unix seconds
  const toUnix = (dateStr: string, endOfDay = false) => {
    const d = new Date(dateStr + (endOfDay ? 'T23:59:59Z' : 'T00:00:00Z'));
    return Math.floor(d.getTime() / 1000);
  };

  // Helper for human-friendly durations (response time / resolution time)
  const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = seconds / 60;
    if (mins < 60) return `${Math.round(mins)}m`;
    const hrs = mins / 60;
    if (hrs < 24) {
      const rMins = Math.round((hrs - Math.floor(hrs)) * 60);
      return `${Math.floor(hrs)}h ${rMins > 0 ? rMins + 'm' : ''}`;
    }
    const days = hrs / 24;
    const rHrs = Math.round((days - Math.floor(days)) * 24);
    return `${Math.floor(days)}d ${rHrs > 0 ? rHrs + 'h' : ''}`;
  };

  // Fetch Live Statistics (open & pending counts)
  const fetchLiveStats = async () => {
    if (!profile?.chatwoot_url || !profile?.chatwoot_token) return;
    try {
      setLoadingLive(true);
      const [openMeta, pendingMeta] = await Promise.all([
        chatwoot.getConversationsMeta(profile.chatwoot_url, profile.chatwoot_token, 'open'),
        chatwoot.getConversationsMeta(profile.chatwoot_url, profile.chatwoot_token, 'pending'),
      ]);
      setLiveMetaOpen(openMeta?.meta || openMeta || null);
      setLiveMetaPending(pendingMeta?.meta || pendingMeta || null);
    } catch (err) {
      console.error('Error fetching live stats:', err);
    } finally {
      setLoadingLive(false);
    }
  };

  // Fetch Live stats on load and refresh
  useEffect(() => {
    fetchLiveStats();
  }, [profile?.chatwoot_url, profile?.chatwoot_token, refreshKey]);

  // Fetch Main Summary report
  useEffect(() => {
    let cancelled = false;
    const fetchSummary = async () => {
      if (!profile?.chatwoot_url || !profile?.chatwoot_token) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const sinceSecs = toUnix(activeSince);
      const untilSecs = toUnix(activeUntil, true);

      const prevRange = getPrevPeriod(activeSince, activeUntil);
      const prevSinceSecs = toUnix(prevRange.since);
      const prevUntilSecs = toUnix(prevRange.until, true);

      let scopeType = 'account';
      let scopeId: number | undefined = undefined;

      if (selectedAgentId !== 'all') {
        scopeType = 'agent';
        scopeId = Number(selectedAgentId);
      } else if (selectedInboxId !== 'all') {
        scopeType = 'inbox';
        scopeId = Number(selectedInboxId);
      }

      try {
        const [currRes, prevRes] = await Promise.all([
          chatwoot.getReportsSummary(profile.chatwoot_url, profile.chatwoot_token, sinceSecs, untilSecs, scopeType, scopeId),
          chatwoot.getReportsSummary(profile.chatwoot_url, profile.chatwoot_token, prevSinceSecs, prevUntilSecs, scopeType, scopeId),
        ]);

        if (cancelled) return;
        setSummaryData(currRes || {});
        setPrevSummaryData(prevRes || {});
      } catch (err: any) {
        console.error('Error fetching reports summary:', err);
        if (!cancelled) setError(err.message || 'Error al obtener resumen de informes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSummary();
    return () => { cancelled = true; };
  }, [profile?.chatwoot_url, profile?.chatwoot_token, activeSince, activeUntil, selectedInboxId, selectedAgentId, refreshKey]);

  // Fetch Chart Time Series Data for selected expanded metric
  useEffect(() => {
    let cancelled = false;
    const fetchChartSeries = async () => {
      if (!profile?.chatwoot_url || !profile?.chatwoot_token || !expandedMetric || loading) return;

      setLoadingChart(true);
      const sinceSecs = toUnix(activeSince);
      const untilSecs = toUnix(activeUntil, true);

      const prevRange = getPrevPeriod(activeSince, activeUntil);
      const prevSinceSecs = toUnix(prevRange.since);
      const prevUntilSecs = toUnix(prevRange.until, true);

      let scopeType = 'account';
      let scopeId: number | undefined = undefined;

      if (selectedAgentId !== 'all') {
        scopeType = 'agent';
        scopeId = Number(selectedAgentId);
      } else if (selectedInboxId !== 'all') {
        scopeType = 'inbox';
        scopeId = Number(selectedInboxId);
      }

      try {
        const [currSeries, prevSeries] = await Promise.all([
          chatwoot.getReportsTimeSeries(profile.chatwoot_url, profile.chatwoot_token, expandedMetric, sinceSecs, untilSecs, scopeType, scopeId),
          chatwoot.getReportsTimeSeries(profile.chatwoot_url, profile.chatwoot_token, expandedMetric, prevSinceSecs, prevUntilSecs, scopeType, scopeId),
        ]);

        if (cancelled) return;

        const parseSeries = (data: any) => {
          const list = Array.isArray(data) ? data : (data?.data || data?.payload || []);
          return list.map((item: any) => ({
            val: Number(item.value || 0),
            date: new Date((item.timestamp > 10000000000 ? item.timestamp : item.timestamp * 1000)).toISOString().split('T')[0],
          }));
        };

        setChartData(parseSeries(currSeries));
        setPrevChartData(parseSeries(prevSeries));
      } catch (err) {
        console.error('Error fetching reports time series:', err);
      } finally {
        if (!cancelled) setLoadingChart(false);
      }
    };

    fetchChartSeries();
    return () => { cancelled = true; };
  }, [profile?.chatwoot_url, profile?.chatwoot_token, expandedMetric, activeSince, activeUntil, selectedInboxId, selectedAgentId, loading, refreshKey]);

  // Fetch breakdown tables reports
  useEffect(() => {
    let cancelled = false;
    const fetchBreakdowns = async () => {
      if (!profile?.chatwoot_url || !profile?.chatwoot_token || loading || inboxes.length === 0) return;

      setLoadingBreakdowns(true);
      const sinceSecs = toUnix(activeSince);
      const untilSecs = toUnix(activeUntil, true);

      try {
        const inboxRequests = inboxes.map(async (inbox) => {
          try {
            const res = await chatwoot.getReportsSummary(profile.chatwoot_url, profile.chatwoot_token, sinceSecs, untilSecs, 'inbox', inbox.id);
            return {
              id: inbox.id,
              name: inbox.name,
              channel_type: inbox.channel_type,
              ...res,
            };
          } catch {
            return { id: inbox.id, name: inbox.name, channel_type: inbox.channel_type };
          }
        });

        const inboxResults = await Promise.all(inboxRequests);

        if (cancelled) return;
        setInboxBreakdowns(inboxResults);
      } catch (err) {
        console.error('Error fetching breakdowns:', err);
      } finally {
        if (!cancelled) setLoadingBreakdowns(false);
      }
    };

    fetchBreakdowns();
    return () => { cancelled = true; };
  }, [profile?.chatwoot_url, profile?.chatwoot_token, activeSince, activeUntil, inboxes, loading, refreshKey]);

  const handleApplyDate = () => {
    setActivePreset(pendingPreset);
    setActiveSince(pendingSince);
    setActiveUntil(pendingUntil || pendingSince);
    setRefreshKey(prev => prev + 1);
    setShowDatePicker(false);
  };

  const fmtDateRange = (d: string, showYearForce = false) => {
    if (!d) return '';
    const parts = d.split('-');
    const year = parts[0];
    const month = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][parseInt(parts[1]) - 1];
    const day = parts[2];
    const currentYear = new Date().getFullYear().toString();
    if (year === currentYear && !showYearForce) return `${day} ${month}`;
    return `${day} ${month} ${year}`;
  };

  // Mini Calendar renderer for the date picker
  const MiniCal = ({ year, month, since, until, hovering, onDay, onHover, onPrev, onNext }: any) => {
    const days: any[] = [];
    const first = new Date(year, month, 1).getDay();
    const startOffset = first === 0 ? 6 : first - 1;
    for (let i = 0; i < startOffset; i++) days.push(null);
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= lastDay; i++) {
      const d = new Date(year, month, i);
      days.push(d.toISOString().split('T')[0]);
    }
    const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const todayStr = new Date().toISOString().split('T')[0];

    return (
      <div className="w-[240px]">
        <div className="flex items-center mb-4 px-1">
          <button onClick={onPrev} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <ChevronDown className="w-4 h-4 rotate-90" />
          </button>
          <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 text-center">
            {MONTHS_ES[month]} {year}
          </span>
          <button onClick={onNext} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <ChevronDown className="w-4 h-4 -rotate-90" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="text-[10px] font-bold text-zinc-300 text-center pb-2 uppercase tracking-tighter">{d}</div>)}
          {days.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} />;
            const isToday = d === todayStr;
            const isFuture = d > todayStr;
            const isSelected = d === since || d === until;
            const isInRange = since && until && d > since && d < until;
            const isHovering = since && !until && hovering && ((d > since && d <= hovering) || (d < since && d >= hovering));

            return (
              <button
                key={d}
                onMouseEnter={() => !isFuture && onHover(d)}
                onClick={() => !isFuture && onDay(d)}
                disabled={isFuture}
                className={`h-8 w-8 text-[11px] font-bold transition-all relative flex items-center justify-center ${
                  isSelected ? 'bg-violet-600 text-white rounded-full z-10 shadow-md shadow-violet-200 dark:shadow-none' :
                  (isInRange || isHovering) ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-600' :
                  isFuture ? 'text-zinc-200 dark:text-zinc-800 cursor-default' :
                  'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full'
                } ${isToday && !isSelected ? 'text-violet-600 dark:text-violet-500 ring-1 ring-violet-100 dark:ring-violet-900/30' : ''}`}
              >
                {d.split('-')[2]}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!profile || !profile.chatwoot_token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-16 h-16 bg-violet-100 dark:bg-violet-500/10 rounded-full flex items-center justify-center mb-6">
          <Activity className="w-8 h-8 text-violet-600 dark:text-violet-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Chatwoot no configurado</h2>
        <p className="text-[15px] text-zinc-500 max-w-md text-center leading-relaxed">
          Para ver las métricas y reportes de atención, necesitas conectar tu cuenta de Chatwoot desde el panel de administración.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-in pb-20 pt-6 px-4 md:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-violet-500" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Informes de Atención</h1>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium">Estadísticas detalladas del rendimiento y volumen de conversaciones en Chatwoot.</p>
        </div>

        {/* Date Selector & Refresh */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setRefreshKey(prev => prev + 1)}
            disabled={loading || loadingLive}
            className="flex items-center justify-center w-11 h-11 bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            title="Recargar datos"
          >
            <Loader2 className={`w-4 h-4 ${(loading || loadingLive) ? 'animate-spin' : ''}`} />
          </button>

          {/* Datepicker trigger */}
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1.5 py-1 shadow-sm h-11 relative" ref={datePickerRef}>
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-2 px-4 h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group"
            >
              <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-violet-500 transition-colors" />
              <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">
                {activePreset === 'custom'
                  ? (activeSince === activeUntil ? fmtDateRange(activeSince) : `${fmtDateRange(activeSince)} - ${fmtDateRange(activeUntil)}`)
                  : ({
                      'today': 'Hoy',
                      'yesterday': 'Ayer',
                      'last_7d': 'Últimos 7 días',
                      'last_14d': 'Últimos 14 días',
                      'last_28d': 'Últimos 28 días',
                      'last_30d': 'Últimos 30 días',
                      'last_90d': 'Últimos 90 días',
                      'this_month': 'Este mes',
                      'last_month': 'Mes pasado',
                      'this_year': 'Este año',
                      'last_year': 'Año pasado'
                    } as any)[activePreset] || activePreset
                }
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>

            {showDatePicker && (
              <div className="absolute left-0 md:left-auto md:right-0 top-full mt-3 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-30 flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 w-[290px] sm:w-[320px] md:w-auto origin-top-left md:origin-top-right">
                <div className="w-full md:w-[160px] border-b md:border-b-0 md:border-r border-zinc-50 dark:border-zinc-800 p-2 md:p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-hide">
                  {[{ id: 'today', label: 'Hoy' }, { id: 'yesterday', label: 'Ayer' }, { id: 'last_7d', label: 'Últimos 7 días' }, { id: 'last_14d', label: 'Últimos 14 días' }, { id: 'last_28d', label: 'Últimos 28 días' }, { id: 'last_30d', label: 'Últimos 30 días' }, { id: 'last_90d', label: 'Últimos 90 días' }, { id: 'this_month', label: 'Este mes' }, { id: 'last_month', label: 'Mes pasado' }, { id: 'this_year', label: 'Este año' }, { id: 'last_year', label: 'Año pasado' }].map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        const r = presetToRange(p.id as any);
                        setPendingPreset(p.id as any);
                        setPendingSince(r.since);
                        setPendingUntil(r.until);
                      }}
                      className={`flex-shrink-0 text-center md:text-left px-3 md:px-4 py-1.5 rounded-[10px] text-[11px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-violet-600 text-white shadow-md shadow-violet-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="p-4 md:p-5 flex flex-col items-center md:items-stretch">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                    <MiniCal
                      year={calYear}
                      month={calMonth}
                      since={pendingSince}
                      until={pendingUntil}
                      hovering={hovering}
                      onDay={(iso: string) => {
                        setPendingPreset('custom');
                        if (!pendingSince || (pendingSince && pendingUntil)) {
                          setPendingSince(iso);
                          setPendingUntil('');
                        } else {
                          if (iso < pendingSince) {
                            setPendingUntil(pendingSince);
                            setPendingSince(iso);
                          } else {
                            setPendingUntil(iso);
                          }
                        }
                      }}
                      onHover={setHovering}
                      onPrev={() => {
                        if (calMonth === 0) {
                          setCalYear(calYear - 1);
                          setCalMonth(11);
                        } else {
                          setCalMonth(calMonth - 1);
                        }
                      }}
                      onNext={() => {
                        if (calMonth === 11) {
                          setCalYear(calYear + 1);
                          setCalMonth(0);
                        } else {
                          setCalMonth(calMonth + 1);
                        }
                      }}
                    />
                    <div className="hidden md:block">
                      <MiniCal
                        year={calMonth === 11 ? calYear + 1 : calYear}
                        month={calMonth === 11 ? 0 : calMonth + 1}
                        since={pendingSince}
                        until={pendingUntil}
                        hovering={hovering}
                        onDay={(iso: string) => {
                          setPendingPreset('custom');
                          if (!pendingSince || (pendingSince && pendingUntil)) {
                            setPendingSince(iso);
                            setPendingUntil('');
                          } else {
                            if (iso < pendingSince) {
                              setPendingUntil(pendingSince);
                              setPendingSince(iso);
                            } else {
                              setPendingUntil(iso);
                            }
                          }
                        }}
                        onHover={setHovering}
                        onPrev={() => {
                          if (calMonth === 0) {
                            setCalYear(calYear - 1);
                            setCalMonth(11);
                          } else {
                            setCalMonth(calMonth - 1);
                          }
                        }}
                        onNext={() => {
                          if (calMonth === 11) {
                            setCalYear(calYear + 1);
                            setCalMonth(0);
                          } else {
                            setCalMonth(calMonth + 1);
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-full flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <button onClick={() => setShowDatePicker(false)} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-zinc-500">Cancelar</button>
                    <button onClick={handleApplyDate} className="px-5 py-1.5 rounded-lg bg-violet-600 text-white text-[12px] font-bold shadow-md hover:bg-violet-700 transition-colors">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scope Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 bg-white/50 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.03] p-4 rounded-2xl">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-1">Bandeja de Entrada</label>
          <div className="relative">
            <select
              value={selectedInboxId}
              onChange={(e) => {
                setSelectedInboxId(e.target.value);
                setSelectedAgentId('all');
              }}
              className="w-full h-11 bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-xl px-4 text-[13px] font-bold appearance-none cursor-pointer text-zinc-700 dark:text-zinc-200 outline-none focus:border-violet-500 transition-all shadow-sm"
            >
              <option value="all">Todas las bandejas</option>
              {inboxes.map(inbox => (
                <option key={inbox.id} value={inbox.id}>{inbox.name} ({inbox.channel_type === 'Channel::FacebookPage' ? 'Facebook' : inbox.channel_type === 'Channel::Whatsapp' ? 'WhatsApp' : inbox.channel_type === 'Channel::WebWidget' ? 'Sitio Web' : inbox.channel_type.split('::')[1] || inbox.channel_type})</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-1">Agente</label>
          <div className="relative">
            <select
              value={selectedAgentId}
              onChange={(e) => {
                setSelectedAgentId(e.target.value);
                setSelectedInboxId('all');
              }}
              className="w-full h-11 bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-xl px-4 text-[13px] font-bold appearance-none cursor-pointer text-zinc-700 dark:text-zinc-200 outline-none focus:border-violet-500 transition-all shadow-sm"
            >
              <option value="all">Todos los agentes</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name} ({agent.email})</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Live Chats Counter Card */}
      <div className="mb-8 bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-6 shadow-sm flex flex-col relative overflow-hidden">
        <div className="flex items-center justify-between mb-5 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">Conversaciones Abiertas</h3>
              <p className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> En vivo
              </p>
            </div>
          </div>
        </div>

        {loadingLive && !liveMetaOpen ? (
          <div className="flex-1 flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.03]">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Abiertas</p>
              <p className="text-[28px] font-black text-zinc-900 dark:text-white mt-1">
                {liveMetaOpen?.all_count !== undefined ? liveMetaOpen.all_count : '-'}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.03]">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sin Asignar</p>
              <p className="text-[28px] font-black text-amber-600 dark:text-amber-500 mt-1">
                {liveMetaOpen?.unassigned_count !== undefined ? liveMetaOpen.unassigned_count : '-'}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.03]">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Mías (Asignadas)</p>
              <p className="text-[28px] font-black text-violet-600 dark:text-violet-400 mt-1">
                {liveMetaOpen?.mine_count !== undefined ? liveMetaOpen.mine_count : '-'}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.03]">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pendientes</p>
              <p className="text-[28px] font-black text-zinc-400 mt-1">
                {liveMetaPending?.all_count !== undefined ? liveMetaPending.all_count : '-'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main Error Indicator */}
      {error && (
        <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-[13px] font-bold">{error}</p>
        </div>
      )}

      {loading ? (
        <EmailLoader loading={loading} color={VIOLET} labels={['Conversaciones', 'Mensajes', 'Tiempo de Respuesta']} />
      ) : summaryData ? (
        <div className="space-y-6">
          {/* Key Metrics Period Cards Grid */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
            {METRICS_CONFIG.map((metric) => {
              const val = Number(summaryData[metric.key] || 0);
              const prevVal = Number(prevSummaryData[metric.key] || 0);

              let displayVal = metric.isTime ? formatDuration(val) : val.toLocaleString('es-AR', { maximumFractionDigits: 0 });
              if (metric.key === 'conversations_count' && val === 0) displayVal = '0';

              let change: number | undefined = undefined;
              if (prevVal > 0) {
                change = ((val - prevVal) / prevVal) * 100;
              } else if (val > 0 && prevVal === 0) {
                change = 100;
              }

              const isTimeMetric = metric.isTime;
              const trendDirection = val >= prevVal ? (isTimeMetric ? 'down' : 'up') : (isTimeMetric ? 'up' : 'down');

              return (
                <DashboardMetric
                  key={metric.key}
                  icon={metric.icon}
                  label={metric.label}
                  value={displayVal}
                  change={change}
                  trend={trendDirection}
                  data={[]}
                  color={metric.color}
                  loading={loading}
                  active={expandedMetric === metric.key}
                  onClick={() => setExpandedMetric(expandedMetric === metric.key ? null : metric.key)}
                />
              );
            })}
          </div>

          {/* Time Series Detail Charts */}
          {expandedMetric && (
            <div className="relative">
              {loadingChart && (
                <div className="absolute inset-0 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-[20px]">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                </div>
              )}
              {(() => {
                const config = METRICS_CONFIG.find(m => m.key === expandedMetric);
                if (!config) return null;
                return (
                  <MetricDetailChart
                    label={config.label}
                    color={config.color}
                    data={chartData}
                    prevData={prevChartData}
                  />
                );
              })()}
            </div>
          )}

          {/* Rendimiento por Canal */}
          <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-6 shadow-sm flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-violet-500" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">Rendimiento por Canal</h3>
                <p className="text-[11px] text-zinc-400">Comparativa entre bandejas de entrada</p>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-[12px] min-w-[400px]">
                <thead>
                  <tr className="border-b border-black/[0.04] dark:border-white/[0.04] text-zinc-400 font-bold">
                    <th className="pb-3 pr-2">Canal / Bandeja</th>
                    <th className="pb-3 px-2 text-right">Chats</th>
                    <th className="pb-3 px-2 text-right">Resp. Prom.</th>
                    <th className="pb-3 pl-2 text-right">Res. Prom.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.03] dark:divide-white/[0.03]">
                  {inboxBreakdowns.map((inbox) => (
                    <tr key={inbox.id} className="text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50/55 dark:hover:bg-white/[0.01]">
                      <td className="py-3 pr-2 font-bold text-zinc-900 dark:text-white">
                        <p>{inbox.name}</p>
                        <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-tighter">
                          {inbox.channel_type === 'Channel::Whatsapp' ? 'WhatsApp' : inbox.channel_type === 'Channel::FacebookPage' ? 'Facebook' : 'Sitio Web'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right font-black text-violet-600 dark:text-violet-400">
                        {inbox.conversations_count !== undefined ? inbox.conversations_count : '-'}
                      </td>
                      <td className="py-3 px-2 text-right text-zinc-500 dark:text-zinc-400">
                        {inbox.avg_first_response_time ? formatDuration(inbox.avg_first_response_time) : '-'}
                      </td>
                      <td className="py-3 pl-2 text-right text-zinc-500 dark:text-zinc-400">
                        {inbox.avg_resolution_time ? formatDuration(inbox.avg_resolution_time) : '-'}
                      </td>
                    </tr>
                  ))}
                  {inboxBreakdowns.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-zinc-400">
                        {loadingBreakdowns ? 'Cargando canales...' : 'No hay canales conectados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
