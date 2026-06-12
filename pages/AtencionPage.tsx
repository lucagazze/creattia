import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import {
  TrendingUp, MessageCircle, Inbox, Send, Clock, CheckCircle, Users, ChevronDown, Calendar, Loader2, AlertCircle, Activity, Globe, Mail
} from 'lucide-react';
import { chatwoot } from '../services/chatwoot';
import { getPrevPeriod, today, daysAgo, presetToRange } from '../services/metaAds';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import EmailLoader from '../components/ui/EmailLoader';
import { AppleLoader } from '../components/ui/AppleLoader';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';


const VIOLET = '#8b5cf6';

interface MetricKeyData {
  key: string;
  label: string;
  icon: any;
  color: string;
  isTime?: boolean;
  info?: string;
}

const METRICS_CONFIG: MetricKeyData[] = [
  { key: 'conversations_count', label: 'Conversaciones Totales', icon: MessageCircle, color: '#8b5cf6', info: 'Cantidad total de conversaciones iniciadas con clientes en el período seleccionado, en todos los canales.' },
  { key: 'incoming_messages_count', label: 'Mensajes Entrantes', icon: Inbox, color: '#8b5cf6', info: 'Total de mensajes recibidos de clientes. Refleja el volumen de consultas y demanda de atención.' },
  { key: 'outgoing_messages_count', label: 'Mensajes Salientes', icon: Send, color: '#8b5cf6', info: 'Total de mensajes enviados por el equipo. Indica cuántas respuestas se dieron a los clientes.' },
  { key: 'avg_first_response_time', label: 'Tiempo Resp. Promedio', icon: Clock, color: '#8b5cf6', isTime: true, info: 'Tiempo promedio que tarda el equipo en dar la primera respuesta. Menos tiempo = mejor experiencia del cliente.' },
];

const MiniCal = ({ year, month, since, until, hovering, onDay, onHover, onPrev, onNext }: any) => {
  const days: any[] = [];
  const first = new Date(year, month, 1).getDay();
  const startOffset = first === 0 ? 6 : first - 1;
  for (let i = 0; i < startOffset; i++) days.push(null);
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= lastDay; i++) {
    const d = new Date(year, month, i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const todayStr = today();

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
  const isDateReloading = loading && !!summaryData;

  // Live state counters
  const [liveMetaOpen, setLiveMetaOpen] = useState<any>(null);
  const [liveMetaPending, setLiveMetaPending] = useState<any>(null);
  const [loadingLive, setLoadingLive] = useState(false);

  // Time-Series Chart details
  const [expandedMetric, setExpandedMetric] = useState<string | null>('conversations_count');
  const [chartData, setChartData] = useState<any[]>([]);
  const [prevChartData, setPrevChartData] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [allSeriesData, setAllSeriesData] = useState<Record<string, any[]>>({});
  const [allPrevSeriesData, setAllPrevSeriesData] = useState<Record<string, any[]>>({});

  // Breakdown tables data
  const [inboxBreakdowns, setInboxBreakdowns] = useState<any[]>([]);
  const [loadingBreakdowns, setLoadingBreakdowns] = useState(false);

  // Traffic heatmap: rows = last 7 days (date strings), cols = 24h
  const [heatmapRows, setHeatmapRows] = useState<{ date: string; label: string; hours: number[] }[]>([]);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [heatmapHover, setHeatmapHover] = useState<{ day: string; hour: number; val: number; x: number; y: number } | null>(null);

  // Reset all data states when client profile changes to prevent stale data leakage immediately in render
  const [prevProfileId, setPrevProfileId] = useState(profile?.id);
  if (profile?.id !== prevProfileId) {
    setPrevProfileId(profile?.id);
    setInboxes([]);
    setAgents([]);
    setSummaryData(null);
    setPrevSummaryData(null);
    setLiveMetaOpen(null);
    setLiveMetaPending(null);
    setChartData([]);
    setPrevChartData([]);
    setAllSeriesData({});
    setAllPrevSeriesData({});
    setInboxBreakdowns([]);
    setHeatmapRows([]);
    setLoading(true);
  }

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
          chatwoot.getInboxes(profile.chatwoot_url!, profile.chatwoot_token!),
          chatwoot.getAgents(profile.chatwoot_url!, profile.chatwoot_token!),
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
          return list.map((item: any) => {
            let dateStr = today();
            try {
              const ts = Number(item?.timestamp || 0);
              if (!isNaN(ts) && ts > 0) {
                const dateObj = new Date(ts > 10000000000 ? ts : ts * 1000);
                if (!isNaN(dateObj.getTime())) {
                  dateStr = dateObj.toISOString().split('T')[0];
                }
              }
            } catch (e) {}
            return {
              val: Number(item?.value || 0),
              date: dateStr,
            };
          });
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
            const res = await chatwoot.getReportsSummary(profile.chatwoot_url!, profile.chatwoot_token!, sinceSecs, untilSecs, 'inbox', inbox.id);
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

  // Pre-fetch sparklines for all 4 metrics when summary loads
  useEffect(() => {
    if (!summaryData || loading) return;
    let cancelled = false;
    const fetchAllSeries = async () => {
      if (!profile?.chatwoot_url || !profile?.chatwoot_token) return;
      const sinceSecs = toUnix(activeSince);
      const untilSecs = toUnix(activeUntil, true);
      const prevRange = getPrevPeriod(activeSince, activeUntil);
      const prevSinceSecs = toUnix(prevRange.since);
      const prevUntilSecs = toUnix(prevRange.until, true);

      let scopeType = 'account';
      let scopeId: number | undefined = undefined;
      if (selectedAgentId !== 'all') { scopeType = 'agent'; scopeId = Number(selectedAgentId); }
      else if (selectedInboxId !== 'all') { scopeType = 'inbox'; scopeId = Number(selectedInboxId); }

      const parseSeries = (data: any) => {
        const list = Array.isArray(data) ? data : (data?.data || data?.payload || []);
        return list.map((item: any) => {
          let dateStr = today();
          try {
            const ts = Number(item?.timestamp || 0);
            if (!isNaN(ts) && ts > 0) {
              const dateObj = new Date(ts > 10000000000 ? ts : ts * 1000);
              if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toISOString().split('T')[0];
              }
            }
          } catch (e) {}
          return {
            val: Number(item?.value || 0),
            date: dateStr,
          };
        });
      };

      const keys = METRICS_CONFIG.map(m => m.key);
      const results = await Promise.allSettled(
        keys.map(k => Promise.all([
          chatwoot.getReportsTimeSeries(profile.chatwoot_url!, profile.chatwoot_token!, k, sinceSecs, untilSecs, scopeType, scopeId),
          chatwoot.getReportsTimeSeries(profile.chatwoot_url!, profile.chatwoot_token!, k, prevSinceSecs, prevUntilSecs, scopeType, scopeId),
        ]).then(([curr, prev]) => ({ key: k, curr: parseSeries(curr), prev: parseSeries(prev) })))
      );
      if (cancelled) return;
      const curr: Record<string, any[]> = {};
      const prev: Record<string, any[]> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') { curr[keys[i]] = r.value.curr; prev[keys[i]] = r.value.prev; }
      });
      setAllSeriesData(curr);
      setAllPrevSeriesData(prev);
    };
    fetchAllSeries();
    return () => { cancelled = true; };
  }, [summaryData, profile?.chatwoot_url, profile?.chatwoot_token, activeSince, activeUntil, selectedInboxId, selectedAgentId]);

  // Fetch heatmap data (conversations by hour, last 7 days regardless of date picker)
  useEffect(() => {
    let cancelled = false;
    const fetchHeatmap = async () => {
      if (!profile?.chatwoot_url || !profile?.chatwoot_token || loading) return;
      setLoadingHeatmap(true);
      try {
        const now = Date.now();
        const untilSecs = Math.floor(now / 1000);
        const sinceSecs = untilSecs - 7 * 24 * 3600;

        const data = await chatwoot.getHeatmapData(
          profile.chatwoot_url, profile.chatwoot_token, sinceSecs, untilSecs,
          selectedInboxId !== 'all' ? selectedInboxId : undefined
        );

        // Build rows keyed by local date string YYYY-MM-DD
        const byDate: Record<string, number[]> = {};
        const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

        (data || []).forEach((pt: any) => {
          const ts = pt.timestamp ?? pt.ts ?? 0;
          const d = new Date(ts * 1000);
          const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (!byDate[dateKey]) byDate[dateKey] = new Array(24).fill(0);
          const hour = d.getHours();
          byDate[dateKey][hour] += (pt.value ?? pt.count ?? 0);
        });

        // Build last 7 days in order (oldest → newest)
        const rows: { date: string; label: string; hours: number[] }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now - i * 24 * 3600 * 1000);
          const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const dayName = DAYS_ES[d.getDay()];
          const label = `${dayName} ${d.getDate()} ${MONTHS_ES[d.getMonth()]}`;
          rows.push({ date: dateKey, label, hours: byDate[dateKey] || new Array(24).fill(0) });
        }

        if (!cancelled) setHeatmapRows(rows);
      } catch (e) {
        console.error('Heatmap error:', e);
      } finally {
        if (!cancelled) setLoadingHeatmap(false);
      }
    };
    fetchHeatmap();
    return () => { cancelled = true; };
  }, [profile?.chatwoot_url, profile?.chatwoot_token, loading, refreshKey, selectedInboxId]);

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
    <CenteredPageLoader isLoading={false}>

    <div className="w-full animate-fade-in pb-20 pt-4 md:pt-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-800/50 flex items-center justify-center overflow-hidden shrink-0">
              <MessageCircle className="w-5 h-5 text-violet-500" />
            </div>
            <h1 className="page-title">Informes de Atención</h1>
          </div>
          <p className="page-subtitle">Estadísticas detalladas del rendimiento y volumen de conversaciones en Chatwoot.</p>
        </div>

        {/* Date Selector */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Datepicker trigger */}
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1 py-0.5 md:py-1 shadow-sm h-9 md:h-10 relative" ref={datePickerRef}>
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-1.5 px-3 h-7 md:h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group text-[11px] md:text-[12.5px]"
            >
              {loading && summaryData ? (
                <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
              ) : (
                <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-violet-500 transition-colors" />
              )}
              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
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
                <div className="w-full md:w-[180px] border-b md:border-b-0 md:border-r border-zinc-50 dark:border-zinc-800 p-2 md:p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-hide">
                  {[{ id: 'today', label: 'Hoy' }, { id: 'yesterday', label: 'Ayer' }, { id: 'last_7d', label: 'Últimos 7 días' }, { id: 'last_14d', label: 'Últimos 14 días' }, { id: 'last_28d', label: 'Últimos 28 días' }, { id: 'last_30d', label: 'Últimos 30 días' }, { id: 'last_90d', label: 'Últimos 90 días' }, { id: 'this_month', label: 'Este mes' }, { id: 'last_month', label: 'Mes pasado' }, { id: 'this_year', label: 'Este año' }, { id: 'last_year', label: 'Año pasado' }].map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        const r = presetToRange(p.id as any);
                        setPendingPreset(p.id as any);
                        setPendingSince(r.since);
                        setPendingUntil(r.until);
                      }}
                      className={`flex-shrink-0 text-center md:text-left px-2.5 py-1 md:px-3 md:py-1.5 rounded-[10px] text-[12px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-violet-600 text-white shadow-md shadow-violet-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="px-1.5 py-4 md:p-5 flex flex-col items-center md:items-stretch">
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
                    <button onClick={() => setShowDatePicker(false)} className="px-4 h-9 rounded-xl text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5">Cancelar</button>
                    <button onClick={handleApplyDate} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90 flex items-center justify-center gap-1.5">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Channel / Inbox Selector */}
      {inboxes.length > 0 && (
        <div 
          className="mb-8 flex flex-wrap items-center gap-2 w-full sm:w-auto"
        >
          {/* All */}
          <button
            onClick={() => { setSelectedInboxId('all'); setSelectedAgentId('all'); }}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all border ${
              selectedInboxId === 'all'
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            Todas
          </button>
 
          {/* Per inbox */}
          {inboxes.map(inbox => {
            const isActive = selectedInboxId === String(inbox.id);
            const ct = inbox.channel_type || '';
            const isWA  = ct.includes('Whatsapp');
            const isFB  = ct.includes('FacebookPage') || ct.includes('Facebook');
            const isIG  = ct.includes('Instagram');
            const isWeb = ct.includes('WebWidget');
            const isMail = ct.includes('Email') || ct.includes('email');
 
            const colorActive = isWA ? 'bg-[#25D366] text-white border-[#25D366] shadow-[#25D366]/20'
              : isFB  ? 'bg-[#1877F2] text-white border-[#1877F2] shadow-[#1877F2]/20'
              : isIG  ? 'bg-gradient-to-r from-pink-500 to-violet-500 text-white border-pink-500 shadow-pink-500/20'
              : isWeb ? 'bg-violet-600 text-white border-violet-600 shadow-violet-500/20'
              : isMail ? 'bg-blue-500 text-white border-blue-500 shadow-blue-500/20'
              : 'bg-zinc-700 text-white border-zinc-700';
 
            const colorInactive = isWA ? 'text-[#25D366] border-[#25D366]/30 bg-[#25D366]/5 hover:bg-[#25D366]/10 hover:border-[#25D366]/60'
              : isFB  ? 'text-[#1877F2] border-[#1877F2]/30 bg-[#1877F2]/5 hover:bg-[#1877F2]/10 hover:border-[#1877F2]/60'
              : isIG  ? 'text-pink-500 border-pink-400/30 bg-pink-500/5 hover:bg-pink-500/10 hover:border-pink-400/60'
              : isWeb ? 'text-violet-500 border-violet-400/30 bg-violet-500/5 hover:bg-violet-500/10 hover:border-violet-400/60'
              : isMail ? 'text-blue-500 border-blue-400/30 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-400/60'
              : 'text-zinc-500 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800';
 
            const Icon = () => isWA ? (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            ) : isFB ? (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            ) : isIG ? (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            ) : isWeb ? (
              <Globe className="w-3.5 h-3.5" />
            ) : (
              <Mail className="w-3.5 h-3.5" />
            );
 
            return (
              <button
                key={inbox.id}
                onClick={() => { setSelectedInboxId(String(inbox.id)); setSelectedAgentId('all'); }}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all border whitespace-nowrap ${
                  isActive ? `${colorActive} shadow-sm` : `${colorInactive} hover:text-zinc-800 dark:hover:text-zinc-200`
                }`}
              >
                <Icon />
                <span className="max-w-[140px] truncate">{inbox.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Error Indicator */}
      {error && (
        <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-[13px] font-bold">{error}</p>
        </div>
      )}

      <div>
      {summaryData || loading ? (
        <div className="space-y-6">
          {/* Key Metrics Period Cards Grid */}
          <EmailLoader
            loading={loading}
            color={VIOLET}
            labels={['Conversaciones Totales', 'Mensajes Entrantes', 'Mensajes Salientes', 'Tiempo Resp. Promedio']}
            duration={900}
          >
            {summaryData ? (
              <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
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
                  data={expandedMetric === metric.key && chartData.length > 0 ? chartData : (allSeriesData[metric.key] || [])}
                  color={metric.color}
                  loading={loading}
                  active={expandedMetric === metric.key}
                  onClick={() => setExpandedMetric(expandedMetric === metric.key ? null : metric.key)}
                  info={metric.info}
                />
              );
            })}
          </div>
            ) : null}
          </EmailLoader>

          <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          {summaryData && (
            <>
              {/* Time Series Detail Charts */}
          {expandedMetric && !loading && (
            <div className="relative">
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

          {/* Traffic Heatmap */}
          {(loadingHeatmap || heatmapRows.length > 0) && (() => {
            const allVals = heatmapRows.flatMap(r => r.hours);
            const maxVal = Math.max(1, ...allVals);
            const activeInboxName = selectedInboxId !== 'all' ? inboxes.find(i => String(i.id) === selectedInboxId)?.name : null;
            return (
              <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm relative">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-violet-500" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">Tráfico de Conversación</h3>
                    <p className="text-[11px] text-zinc-400">
                      {activeInboxName ? `${activeInboxName} — ` : ''}Conversaciones por hora — últimos 7 días
                    </p>
                  </div>
                </div>
                {loadingHeatmap ? (
                  <div className="h-40 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[560px]">
                      {/* Hour labels */}
                      <div className="flex ml-[100px] mb-1">
                        {Array.from({ length: 24 }, (_, h) => (
                          <div key={h} className="flex-1 text-center text-[9px] text-zinc-400 font-medium">{h}</div>
                        ))}
                      </div>
                      {/* Rows — one per actual date */}
                      {heatmapRows.map((row) => (
                        <div key={row.date} className="flex items-center mb-1">
                          <div className="w-[100px] text-[10px] text-zinc-400 font-medium shrink-0 pr-2 text-right leading-tight">{row.label}</div>
                          {Array.from({ length: 24 }, (_, h) => {
                            const val = row.hours[h] ?? 0;
                            const intensity = val / maxVal;
                            const bg = val === 0
                              ? 'bg-zinc-100 dark:bg-zinc-800/50'
                              : intensity > 0.75 ? 'bg-violet-700'
                              : intensity > 0.5  ? 'bg-violet-600'
                              : intensity > 0.25 ? 'bg-violet-500'
                              : 'bg-violet-400';
                            // text contrast: white on dark cells, dark on light cells
                            const textCls = val === 0 ? '' : intensity > 0.25 ? 'text-white' : 'text-violet-900 font-extrabold';
                            const isHov = heatmapHover?.day === row.date && heatmapHover?.hour === h;
                            return (
                              <div
                                key={h}
                                className={`relative flex-1 mx-px h-7 rounded-sm ${bg} cursor-default transition-all ${isHov ? 'ring-2 ring-white/60 brightness-110' : ''} flex items-center justify-center`}
                                onMouseEnter={(e) => {
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  setHeatmapHover({ day: row.date, hour: h, val, x: rect.left + rect.width / 2, y: rect.top });
                                }}
                                onMouseLeave={() => setHeatmapHover(null)}
                              >
                                {val > 0 && (
                                  <span className={`text-[8px] leading-none select-none ${textCls}`}>
                                    {val}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Fast tooltip */}
                {heatmapHover && (
                  <div
                    className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-800 border border-white/10 shadow-xl text-white text-[11px] font-bold whitespace-nowrap"
                    style={{ left: heatmapHover.x, top: heatmapHover.y - 36, transform: 'translateX(-50%)' }}
                  >
                    {heatmapHover.val} conv. · {heatmapHover.hour}:00 hs
                  </div>
                )}
              </div>
            );
          })()}

          {/* Rendimiento por Canal */}
          <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col">
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
                    <th className="pb-3 pl-2 text-right">Resp. Prom.</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-black/[0.03] dark:divide-white/[0.03] transition-opacity ${loadingBreakdowns ? 'opacity-65 pointer-events-none' : ''}`}>
                  {inboxBreakdowns.map((inbox) => (
                    <tr key={inbox.id} className="text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50/55 dark:hover:bg-white/[0.01]">
                      <td className="py-3 pr-2 font-bold text-zinc-900 dark:text-white">
                        <p>{inbox.name}</p>
                        <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-tighter">
                          {(() => {
                            const ct = inbox.channel_type || '';
                            if (ct.includes('Whatsapp') || ct.includes('WhatsApp')) return 'WhatsApp';
                            if (ct.includes('FacebookPage') || ct.includes('Facebook')) return 'Facebook';
                            if (ct.includes('Instagram')) return 'Instagram';
                            if (ct.includes('Email') || ct.includes('email')) return 'Email';
                            if (ct.includes('WebWidget') || ct.includes('Web')) return 'Sitio Web';
                            return ct.replace('Channel::', '') || 'Otro';
                          })()}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right font-black text-violet-600 dark:text-violet-400">
                        {inbox.conversations_count !== undefined ? inbox.conversations_count : '-'}
                      </td>
                      <td className="py-3 pl-2 text-right text-zinc-500 dark:text-zinc-400">
                        {inbox.avg_first_response_time ? formatDuration(inbox.avg_first_response_time) : '-'}
                      </td>
                    </tr>
                  ))}
                  {inboxBreakdowns.length === 0 && loadingBreakdowns ? (
                    [1, 2, 3].map((n) => (
                      <tr key={n}>
                        <td className="py-3 pr-2">
                          <div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse ml-auto" />
                        </td>
                        <td className="py-3 pl-2 text-right">
                          <div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : inboxBreakdowns.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-zinc-400">
                        No hay canales conectados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
            </>
          )}
          </div>
        </div>
      ) : null}
      </div>
      </div>
    </CenteredPageLoader>

  );
}
