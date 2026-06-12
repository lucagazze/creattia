import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { DatePreset, presetToRange, getPrevPeriod, today, daysAgo } from '../services/metaAds';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';

import { klaviyo } from '../services/klaviyo';
import {
  Calendar, ChevronDown, TrendingUp, Mail, Zap, Package, MousePointerClick, DollarSign, MailOpen, Download, Loader2
} from 'lucide-react';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import EmailLoader from '../components/ui/EmailLoader';
import { AppleLoader } from '../components/ui/AppleLoader';

const MAIN_COLOR = '#10b981'; // Green (Emerald) for Retention

const KlaviyoLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M5.04 3h3.6v18h-3.6zM10.8 11.28h3.6V21h-3.6zM16.56 3h3.6v8.28h-3.6zM10.8 3h3.6v6.12h-3.6z" />
  </svg>
);

const fmtCurrency = (n: number) => {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const PRESETS: { id: DatePreset | 'custom'; label: string }[] = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'last_7d', label: 'Últimos 7 días' },
  { id: 'last_14d', label: 'Últimos 14 días' },
  { id: 'last_28d', label: 'Últimos 28 días' },
  { id: 'last_30d', label: 'Últimos 30 días' },
  { id: 'last_90d', label: 'Últimos 90 días' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes pasado' },
  { id: 'this_year', label: 'Este año' },
  { id: 'last_year', label: 'Año pasado' },
];

const fmtDateRange = (d: string) => {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length < 3) return d;
  const month = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(parts[1])-1];
  return `${parts[2]} ${month}`;
};

const getKlaviyoChange = (curr?: number, prev?: number): number | undefined => {
  if (curr == null || prev == null || prev === 0) return undefined;
  return ((curr - prev) / prev) * 100;
};



const MiniCal = ({ year, month, since, until, hovering, onDay, onHover, onPrev, onNext }: any) => {
  const touchStart = React.useRef<number>(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (diff > 40 && onNext) onNext();
    if (diff < -40 && onPrev) onPrev();
  };

  const days: any[] = [];
  const first = new Date(year, month, 1).getDay();
  const startOffset = first === 0 ? 6 : first - 1;
  for (let i = 0; i < startOffset; i++) days.push(null);
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= lastDay; i++) days.push(new Date(year, month, i).toISOString().split('T')[0]);
  const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const todayStr = today();

  const prevDate = React.useRef(new Date(year, month, 1).getTime());
  const current = new Date(year, month, 1).getTime();
  let animClass = 'animate-in fade-in zoom-in-95 duration-200';
  if (current > prevDate.current) animClass = 'animate-in fade-in slide-in-from-right-16 duration-300';
  else if (current < prevDate.current) animClass = 'animate-in fade-in slide-in-from-left-16 duration-300';
  React.useEffect(() => { prevDate.current = current; }, [current]);

  return (
    <div className="w-[240px] overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center mb-4 px-1">
        <div className="w-8 flex justify-start">{onPrev && <button onClick={onPrev} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><ChevronDown className="w-4 h-4 rotate-90 text-zinc-400" /></button>}</div>
        <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 text-center">{MONTHS_ES[month]} {year}</span>
        <div className="w-8 flex justify-end">{onNext && <button onClick={onNext} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><ChevronDown className="w-4 h-4 -rotate-90 text-zinc-400" /></button>}</div>
      </div>
      <div key={`${year}-${month}`} className={`grid grid-cols-7 gap-y-1 ${animClass}`}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="text-[10px] font-bold text-zinc-300 text-center pb-2 uppercase">{d}</div>)}
        {days.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />;
          const isToday = d === todayStr; const isFuture = d > todayStr; const isSelected = d === since || d === until;
          const isInRange = since && until && d > since && d < until;
          const isHovering = since && !until && hovering && ((d > since && d <= hovering) || (d < since && d >= hovering));
          return (
            <button key={d} onMouseEnter={() => !isFuture && onHover(d)} onClick={() => !isFuture && onDay(d)} disabled={isFuture} className={`h-8 w-8 text-[11px] font-bold transition-all relative flex items-center justify-center ${isSelected ? 'bg-emerald-600 text-white rounded-full z-10 shadow-md shadow-emerald-200 dark:shadow-none' : (isInRange || isHovering) ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600' : isFuture ? 'text-zinc-200 dark:text-zinc-800' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full'} ${isToday && !isSelected ? 'text-emerald-600 ring-1 ring-emerald-100' : ''}`}>{d.split('-')[2]}</button>
          );
        })}
      </div>
    </div>
  );
};

export default function RetencionPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('last_14d');
  const [activeSince, setActiveSince] = useState(daysAgo(14));
  const [activeUntil, setActiveUntil] = useState(today());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const [pendingPreset, setPendingPreset] = useState<DatePreset | 'custom'>(activePreset);
  const [pendingSince, setPendingSince] = useState(activeSince);
  const [pendingUntil, setPendingUntil] = useState(activeUntil);

  const d1 = new Date(pendingSince || today());
  const [calYear, setCalYear] = useState(d1.getFullYear());
  const [calMonth, setCalMonth] = useState(d1.getMonth());
  const [hovering, setHovering] = useState<string | null>(null);

  const [fetchingKlaviyo, setFetchingKlaviyo] = useState(true);
  const [fetchingDetailed, setFetchingDetailed] = useState(false);
  const [currentKlaviyo, setCurrentKlaviyo] = useState<any>(null);
  const isDateReloading = fetchingKlaviyo && !!currentKlaviyo;
  const [prevKlaviyo, setPrevKlaviyo] = useState<any>(null);
  const [expandedMetric, setExpandedMetric] = useState<string | null>('k-sent');
  const [detailedStats, setDetailedStats] = useState<any>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) => setExpandedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const [flows, setFlows] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [fetchingConfig, setFetchingConfig] = useState(false);

  const [prevProfileId, setPrevProfileId] = useState(profile?.id);
  if (profile?.id !== prevProfileId) {
    setPrevProfileId(profile?.id);
    setCurrentKlaviyo(null);
    setPrevKlaviyo(null);
    setDetailedStats(null);
    setFlows([]);
    setCampaigns([]);
    setFetchingKlaviyo(true);
  }

  const fetchIdRef = useRef(0);

  const fetchData = async (_preset: string, since: string, until: string, fetchId: number) => {
    if (!since || !until || !profile?.klaviyo_api_key) {
      setFetchingKlaviyo(false);
      setFetchingDetailed(false);
      return;
    }
    const key = profile.klaviyo_api_key;
    const prevRange = getPrevPeriod(since, until);

    setFetchingKlaviyo(true);
    setFetchingDetailed(true);

    // Stage 1: current period metrics — shows main KPIs as soon as possible
    try {
      const current = await klaviyo.getDashboardData(key, since, until);
      if (fetchId !== fetchIdRef.current) return;
      setCurrentKlaviyo(current);
    } catch (err) { console.error("Klaviyo Fetch Error:", err); }
    if (fetchId !== fetchIdRef.current) return;
    setFetchingKlaviyo(false);

    // Stage 2: prev period + detailed stats — after stage 1, so they don't compete for rate limit
    const [prevRes, detailedRes] = await Promise.allSettled([
      klaviyo.getDashboardData(key, prevRange.since, prevRange.until),
      klaviyo.getDetailedStats(key, since, until),
    ]);
    if (fetchId !== fetchIdRef.current) return;
    if (prevRes.status === 'fulfilled') setPrevKlaviyo(prevRes.value);
    if (detailedRes.status === 'fulfilled') setDetailedStats(detailedRes.value);
    setFetchingDetailed(false);
  };

  const fetchConfig = async () => {
    if (profile?.klaviyo_api_key) {
      setFetchingConfig(true);
      try {
        const [f, c] = await Promise.all([
          klaviyo.getFlows(profile.klaviyo_api_key),
          klaviyo.getCampaigns(profile.klaviyo_api_key)
        ]);
        setFlows(f);
        setCampaigns(c);
      } catch (err) { console.error("Klaviyo config fetch error:", err); } finally { setFetchingConfig(false); }
    }
  };

  useEffect(() => {
    if (!profile) return;
    const id = ++fetchIdRef.current;
    const timer = setTimeout(() => {
      fetchData(activePreset, activeSince, activeUntil, id);
      fetchConfig();
    }, 150);
    return () => clearTimeout(timer);
  }, [profile?.id, activePreset, activeSince, activeUntil]);

  useEffect(() => {
    const click = (e: MouseEvent) => { if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false); };
    document.addEventListener('mousedown', click); return () => document.removeEventListener('mousedown', click);
  }, []);

  const handleApply = () => { setActivePreset(pendingPreset); setActiveSince(pendingSince); setActiveUntil(pendingUntil || pendingSince); setShowDatePicker(false); };

  const handleExportPDF = () => {
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');
    if (wasDark) html.classList.remove('dark');
    html.classList.add('is-printing');
    setTimeout(() => {
      window.print();
      html.classList.remove('is-printing');
      if (wasDark) html.classList.add('dark');
    }, 350);
  };

  return (
    <CenteredPageLoader isLoading={false}>

    <div className="w-full space-y-8 pt-4 md:pt-6">
      {/* Header */}
      <div className="page-header print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 flex items-center justify-center overflow-hidden shrink-0">
              <img src="/assets/Klaviyo-Logo-Photoroom.webp" alt="Klaviyo" className="w-8 h-8 object-contain shrink-0" />
            </div>
            <h1 className="page-title">Email Marketing</h1>
          </div>
          <p className="page-subtitle">Análisis de campañas, flujos de automatización y fidelización de clientes.</p>
        </div>
        
        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1 py-0.5 md:py-1 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] h-9 md:h-10 relative" ref={datePickerRef}>
            <button onClick={() => setShowDatePicker(!showDatePicker)} className="flex items-center gap-1.5 px-3 h-7 md:h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group text-[11px] md:text-[12.5px]">
              {fetchingKlaviyo && currentKlaviyo ? (
                <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
              ) : (
                <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
              )}
              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                {activePreset === 'custom' ? (activeSince === activeUntil ? fmtDateRange(activeSince) : `${fmtDateRange(activeSince)} - ${fmtDateRange(activeUntil)}`) : PRESETS.find(p => p.id === activePreset)?.label || activePreset}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>
            
            {showDatePicker && (
              <div className="absolute left-0 md:left-auto md:right-0 top-full mt-3 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-30 flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 w-[290px] sm:w-[320px] md:w-auto origin-top-left md:origin-top-right">
                <div className="w-full md:w-[180px] border-b md:border-b-0 md:border-r border-zinc-50 dark:border-zinc-800 p-2 md:p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-hide">
                  {PRESETS.map(p => (
                      <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }} className={`flex-shrink-0 text-center md:text-left px-2.5 py-1 md:px-3 md:py-1.5 rounded-[10px] text-[12px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
                  ))}
                </div>
                <div className="px-1.5 py-4 md:p-5 flex flex-col items-center md:items-stretch">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                    <MiniCal year={calYear} month={calMonth} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onPrev={() => { if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); } else { setCalMonth(calMonth - 1); } }} onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }} />
                    <div className="hidden md:block">
                      <MiniCal year={calMonth === 11 ? calYear + 1 : calYear} month={calMonth === 11 ? 0 : calMonth + 1} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }} />
                    </div>
                  </div>
                  <div className="w-full flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <button onClick={() => setShowDatePicker(false)} className="px-4 h-9 rounded-xl text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5">Cancelar</button>
                    <button onClick={handleApply} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90 flex items-center justify-center gap-1.5">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="hidden print:block mb-6 pb-4 border-b-2 border-zinc-200">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[22px] font-black text-zinc-900 tracking-tight">ALGORITMIA</span>
          <span className="text-[11px] text-zinc-400">{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
        <p className="text-[13px] text-zinc-500 font-medium">Retención — Email Marketing</p>
        <p className="text-[15px] font-bold text-zinc-900">Período: {activeSince === activeUntil ? fmtDateRange(activeSince) : `${fmtDateRange(activeSince)} — ${fmtDateRange(activeUntil)}`}</p>
      </div>

      <div>
      {/* Main Metrics */}
      {profile?.klaviyo_api_key && (
        <div className="space-y-4">
          <div className="relative bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
            <EmailLoader loading={fetchingKlaviyo} color={MAIN_COLOR} labels={['Entregas', 'Tasa de Apertura', 'Tasa de Clics', 'Ingresos Email']} duration={1100}>
              {currentKlaviyo ? (
                <div className="overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                  <DashboardMetric icon={Package} label="Entregas" value={currentKlaviyo ? currentKlaviyo.sent?.toLocaleString('es-AR') : '...'} change={getKlaviyoChange(currentKlaviyo?.sent, prevKlaviyo?.sent)} trend={(currentKlaviyo?.sent || 0) >= (prevKlaviyo?.sent || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailySent || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-sent'} onClick={() => setExpandedMetric(expandedMetric === 'k-sent' ? null : 'k-sent')} info="Total de correos electrónicos enviados con éxito y recibidos por los destinatarios." />
                  <DashboardMetric icon={MailOpen} label="Tasa de Apertura" value={currentKlaviyo ? `${((currentKlaviyo.opens / (currentKlaviyo.sent || 1)) * 100).toFixed(1)}%` : '...'} change={getKlaviyoChange((currentKlaviyo?.opens / (currentKlaviyo?.sent || 1)), (prevKlaviyo?.opens / (prevKlaviyo?.sent || 1)))} trend={((currentKlaviyo?.opens / (currentKlaviyo?.sent || 1)) || 0) >= ((prevKlaviyo?.opens / (prevKlaviyo?.sent || 1)) || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyOpens?.map((d: any, i: number) => ({ val: ((d.val / ((currentKlaviyo?.dailySent || [])[i]?.val || 1)) * 100), date: d.date })) || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-open-rate'} onClick={() => setExpandedMetric(expandedMetric === 'k-open-rate' ? null : 'k-open-rate')} info="Porcentaje de destinatarios que abrieron el correo enviado (aperturas / entregados)." />
                  <DashboardMetric icon={MousePointerClick} label="Tasa de Clics" value={currentKlaviyo ? `${((currentKlaviyo.clicks / (currentKlaviyo.sent || 1)) * 100).toFixed(1)}%` : '...'} change={getKlaviyoChange((currentKlaviyo?.clicks / (currentKlaviyo?.sent || 1)), (prevKlaviyo?.clicks / (prevKlaviyo?.sent || 1)))} trend={((currentKlaviyo?.clicks / (currentKlaviyo?.sent || 1)) || 0) >= ((prevKlaviyo?.clicks / (prevKlaviyo?.sent || 1)) || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyClicks?.map((d: any, i: number) => ({ val: ((d.val / ((currentKlaviyo?.dailySent || [])[i]?.val || 1)) * 100), date: d.date })) || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-click-rate'} onClick={() => setExpandedMetric(expandedMetric === 'k-click-rate' ? null : 'k-click-rate')} info="Porcentaje de destinatarios que hicieron clic en al menos un enlace dentro del correo (clics / entregados)." />
                  <DashboardMetric icon={DollarSign} label="Ingresos Email" value={currentKlaviyo ? fmtCurrency(currentKlaviyo.attributed || 0) : '...'} change={getKlaviyoChange(currentKlaviyo?.attributed, prevKlaviyo?.attributed)} trend={(currentKlaviyo?.attributed || 0) >= (prevKlaviyo?.attributed || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyAttributed || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-attr'} onClick={() => setExpandedMetric(expandedMetric === 'k-attr' ? null : 'k-attr')} info="Ingresos totales de ventas atribuidos a campañas o flujos de correo electrónico en Klaviyo." />
                </div>
              ) : null}
            </EmailLoader>
          </div>
          {expandedMetric?.startsWith('k-') && currentKlaviyo && !fetchingKlaviyo && (<MetricDetailChart label={expandedMetric === 'k-revenue' ? 'Ingresos Tienda Online' : expandedMetric === 'k-attr' ? 'Ingresos Email' : expandedMetric === 'k-sent' ? 'Entregas' : expandedMetric === 'k-click-rate' ? 'Tasa de Clics' : 'Tasa de Apertura'} color={MAIN_COLOR} data={expandedMetric === 'k-revenue' ? (currentKlaviyo?.dailyRevenue || []) : expandedMetric === 'k-attr' ? (currentKlaviyo?.dailyAttributed || []) : expandedMetric === 'k-sent' ? (currentKlaviyo?.dailySent || []) : expandedMetric === 'k-click-rate' ? (currentKlaviyo?.dailyClicks?.map((d: any, i: number) => ({ val: ((d.val / ((currentKlaviyo?.dailySent || [])[i]?.val || 1)) * 100), date: d.date })) || []) : (currentKlaviyo?.dailyOpens?.map((d: any, i: number) => ({ val: ((d.val / ((currentKlaviyo?.dailySent || [])[i]?.val || 1)) * 100), date: d.date })) || [])} />)}
        </div>
      )}

      <div className={`space-y-6 transition-opacity duration-200 ${fetchingKlaviyo ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      {/* Tables */}
      {profile?.klaviyo_api_key && (() => {
        const fmtN = (n: number) => n > 0 ? n.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '—';
        const fmtCurr = (n: number) => n > 0 ? fmtCurrency(n) : '—';
        const fmtRate = (num: number, den: number) => den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—';

        const StatPill = ({ label, value, green }: { label: string; value: string; green?: boolean }) => (
          <div className="flex flex-col items-center gap-0.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg min-w-[68px]">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
            <span className={`text-[12px] font-bold ${green ? 'text-emerald-500' : 'text-zinc-800 dark:text-zinc-100'}`}>{value}</span>
          </div>
        );

        const StatsRow = ({ s, loading }: { s: any; loading: boolean }) => (
          <div className="flex flex-wrap gap-1.5">
            {loading
              ? [1,2,3,4,5].map(i => <div key={i} className="h-[44px] w-[68px] bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />)
              : <>
                  <StatPill label="Enviados" value={fmtN(s?.sent)} />
                  <StatPill label="Apertura" value={fmtRate(s?.opens, s?.sent)} />
                  <StatPill label="Clics"    value={fmtRate(s?.clicks, s?.sent)} />
                  <StatPill label="Ingresos" value={fmtCurr(s?.revenue)} green={s?.revenue > 0} />
                  <StatPill label="Pedidos"  value={fmtN(s?.orders)}    green={s?.orders > 0} />
                </>
            }
          </div>
        );


        const liveFlows = flows.filter(f => f.attributes.status === 'live');
        const sentCamps = campaigns.filter(c => {
          const s = (c.attributes.status || '').toLowerCase();
          return s === 'sent' || s === 'sending';
        });

        return (
          <div className="space-y-6 pt-2">
            {/* Flows */}
            <div className="relative bg-white dark:bg-zinc-900 rounded-[16px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center"><Zap className="w-3.5 h-3.5 text-emerald-500" /></div>
                  <h2 className="text-[14px] font-bold text-zinc-900 dark:text-white">Plantillas Email</h2>
                </div>
                {fetchingConfig
                  ? <span className="text-[11px] font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full animate-pulse">Cargando…</span>
                  : <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{liveFlows.length} activos</span>
                }
              </div>
              {fetchingConfig ? (
                <div className="px-4 pb-4">
                  <AppleLoader variant="table" count={4} />
                </div>
              ) : liveFlows.length === 0 ? (
                <p className="text-[12px] text-zinc-400 text-center py-8">No hay flujos activos.</p>
              ) : (
                <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                  {liveFlows.map((flow: any) => {
                    const flowRev = detailedStats?.flowRevenue?.[flow.id] || detailedStats?.flowRevenue?.[flow.attributes.name];
                    const flowEng = detailedStats?.flowEngagement?.[flow.id] || detailedStats?.flowEngagement?.[flow.attributes.name];
                    const s = {
                      sent:    flowEng?.sent    || 0,
                      opens:   flowEng?.opens   || 0,
                      clicks:  flowEng?.clicks  || 0,
                      revenue: flowRev?.revenue || 0,
                      orders:  flowRev?.orders  || 0,
                    };
                    const flowOpen = expandedRows.has(flow.id);
                    return (
                      <div key={flow.id}>
                        <div onClick={() => toggleRow(flow.id)} className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors duration-100 rounded-xl mx-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 truncate">{flow.attributes.name}</span>
                            <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">Activo</span>
                          </div>
                          {/* Desktop: all metrics always visible */}
                          {fetchingDetailed
                            ? <div className="hidden sm:flex gap-2 shrink-0">{[1,2,3,4,5].map(i => <div key={i} className="h-2.5 w-8 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse"/>)}</div>
                            : <div className="hidden sm:flex items-center gap-3 text-[11px] shrink-0 ml-3">
                                <span className="text-zinc-400">Env: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtN(s.sent)}</span></span>
                                <span className="text-zinc-400">Ap: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtRate(s.opens, s.sent)}</span></span>
                                <span className="text-zinc-400">Cl: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtRate(s.clicks, s.sent)}</span></span>
                                <span className="text-zinc-400">Ingresos: <span className={`font-bold ${s.revenue > 0 ? 'text-emerald-500' : 'text-zinc-500'}`}>{fmtCurr(s.revenue)}</span></span>
                                <span className="text-zinc-400">Pedidos: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtN(s.orders)}</span></span>
                              </div>
                          }
                          {/* Mobile: ingresos + chevron */}
                          <div className="flex items-center gap-2 shrink-0 sm:hidden ml-2">
                            {!fetchingDetailed && s.revenue > 0 && <span className="text-[11px] font-bold text-emerald-500">{fmtCurr(s.revenue)}</span>}
                            <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${flowOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                        {/* Mobile: expanded stats */}
                        {flowOpen && (
                          <div className="sm:hidden px-4 pb-2 pt-0.5">
                            {fetchingDetailed
                              ? <div className="flex gap-2">{[1,2,3,4,5].map(i => <div key={i} className="h-2.5 w-8 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse"/>)}</div>
                              : <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                                  <span className="text-zinc-400">Env: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtN(s.sent)}</span></span>
                                  <span className="text-zinc-400">Ap: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtRate(s.opens, s.sent)}</span></span>
                                  <span className="text-zinc-400">Cl: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtRate(s.clicks, s.sent)}</span></span>
                                  <span className="text-zinc-400">Ingresos: <span className={`font-bold ${s.revenue > 0 ? 'text-emerald-500' : 'text-zinc-500'}`}>{fmtCurr(s.revenue)}</span></span>
                                  <span className="text-zinc-400">Pedidos: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtN(s.orders)}</span></span>
                                </div>
                            }
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Campaigns */}
            <div className="relative bg-white dark:bg-zinc-900 rounded-[16px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center"><Mail className="w-3.5 h-3.5 text-emerald-500" /></div>
                  <h2 className="text-[14px] font-bold text-zinc-900 dark:text-white">Plantillas Email</h2>
                </div>
                {fetchingConfig
                  ? <span className="text-[11px] font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full animate-pulse">Cargando…</span>
                  : <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{sentCamps.length} enviadas</span>
                }
              </div>
              {fetchingConfig ? (
                <div className="px-4 pb-4">
                  <AppleLoader variant="table" count={5} />
                </div>
              ) : sentCamps.length === 0 ? (
                <p className="text-[12px] text-zinc-400 text-center py-8">No hay campañas enviadas en este período.</p>
              ) : (
                <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                  {sentCamps.map((camp: any) => {
                    const campEng = detailedStats?.campaigns?.[camp.attributes.name];
                    const campRev = detailedStats?.msgRevenue?.[camp.messageId] || detailedStats?.msgRevenue?.[camp.id] || detailedStats?.msgRevenue?.[camp.messageLabel] || detailedStats?.msgRevenue?.[camp.attributes.name];
                    const s = { ...campEng, ...campRev };
                    const isSent = (camp.attributes.status || '').toLowerCase() === 'sent';
                    return (
                      <div key={camp.id}>
                        <div onClick={() => toggleRow(camp.id)} className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors duration-100 rounded-xl mx-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 truncate">{camp.attributes.name}</span>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${isSent ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'}`}>
                              {isSent ? 'Enviada' : 'Enviando'}
                            </span>
                          </div>
                          {/* Desktop: stats always visible */}
                          {fetchingDetailed
                            ? <div className="hidden sm:flex gap-2 shrink-0">{[1,2,3,4,5].map(i => <div key={i} className="h-2.5 w-8 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse"/>)}</div>
                            : <div className="hidden sm:flex items-center gap-3 text-[11px] shrink-0 ml-3">
                                <span className="text-zinc-400">Env: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtN(s?.sent)}</span></span>
                                <span className="text-zinc-400">Ap: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtRate(s?.opens, s?.sent)}</span></span>
                                <span className="text-zinc-400">Cl: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtRate(s?.clicks, s?.sent)}</span></span>
                                <span className="text-zinc-400">Ingresos: <span className={`font-bold ${s?.revenue > 0 ? 'text-emerald-500' : 'text-zinc-500'}`}>{fmtCurr(s?.revenue || 0)}</span></span>
                                <span className="text-zinc-400">Pedidos: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtN(s?.orders || 0)}</span></span>
                              </div>
                          }
                          {/* Mobile: ingresos preview + chevron */}
                          <div className="flex items-center gap-2 shrink-0 sm:hidden ml-2">
                            {!fetchingDetailed && s?.revenue > 0 && <span className="text-[11px] font-bold text-emerald-500">{fmtCurr(s.revenue)}</span>}
                            <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${expandedRows.has(camp.id) ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                        {/* Mobile: stats expandable */}
                        {expandedRows.has(camp.id) && (
                          <div className="sm:hidden px-4 pb-2 pt-0.5">
                            {fetchingDetailed
                              ? <div className="flex gap-2">{[1,2,3,4,5].map(i => <div key={i} className="h-2.5 w-8 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse"/>)}</div>
                              : <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                                  <span className="text-zinc-400">Env: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtN(s?.sent)}</span></span>
                                  <span className="text-zinc-400">Ap: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtRate(s?.opens, s?.sent)}</span></span>
                                  <span className="text-zinc-400">Cl: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtRate(s?.clicks, s?.sent)}</span></span>
                                  <span className="text-zinc-400">Pedidos: <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmtN(s?.orders || 0)}</span></span>
                                </div>
                            }
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
      </div>
      </div>
      <style>{`@media print { body { background: white !important; } .print\\:hidden { display: none !important; } @page { margin: 1cm; size: A4; } }`}</style>
    </div>
    </CenteredPageLoader>

  );
}
