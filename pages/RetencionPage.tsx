import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { DatePreset, presetToRange, getPrevPeriod, today, daysAgo } from '../services/metaAds';
import { klaviyo } from '../services/klaviyo';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  Calendar, ChevronDown, TrendingUp, Mail, Zap, Package, MousePointerClick, DollarSign, MailOpen
} from 'lucide-react';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import KlaviyoLoader from '../components/ui/KlaviyoLoader';

const MAIN_COLOR = '#10b981'; // Green (Emerald) for Retention

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

const getKlaviyoChange = (curr?: number, prev?: number) => {
  if (curr === undefined || prev === undefined) return 0;
  if (!prev) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
};



export default function RetencionPage() {
  const { darkMode } = useTheme();
  const { profile } = useAuth();
  
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('last_14d');
  const [activeSince, setActiveSince] = useState(daysAgo(14));
  const [activeUntil, setActiveUntil] = useState(today());
  const activePrevRange = getPrevPeriod(activeSince, activeUntil);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const [pendingPreset, setPendingPreset] = useState<DatePreset | 'custom'>(activePreset);
  const [pendingSince, setPendingSince] = useState(activeSince);
  const [pendingUntil, setPendingUntil] = useState(activeUntil);

  const d1 = new Date(pendingSince || today());
  const [calYear, setCalYear] = useState(d1.getFullYear());
  const [calMonth, setCalMonth] = useState(d1.getMonth());
  const [hovering, setHovering] = useState<string | null>(null);

  const [fetchingKlaviyo, setFetchingKlaviyo] = useState(false);
  const [currentKlaviyo, setCurrentKlaviyo] = useState<any>(null);
  const [prevKlaviyo, setPrevKlaviyo] = useState<any>(null);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const [flows, setFlows] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [fetchingConfig, setFetchingConfig] = useState(false);

  const fetchData = async (preset: string, since: string, until: string) => {
    if (!since || !until) return;
    const range = { since, until };
    const prevRange = getPrevPeriod(since, until);
    
    if (profile?.klaviyo_api_key) {
      setFetchingKlaviyo(true);
      try {
        const [curr, prev] = await Promise.all([
          klaviyo.getDashboardData(profile.klaviyo_api_key, range.since, range.until),
          klaviyo.getDashboardData(profile.klaviyo_api_key, prevRange.since, prevRange.until)
        ]);
        setCurrentKlaviyo(curr); setPrevKlaviyo(prev);
      } catch (err) { console.error("Klaviyo Fetch Error:", err); } finally { setFetchingKlaviyo(false); }
    }
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
    if (profile) { 
      fetchData(activePreset, activeSince, activeUntil); 
      fetchConfig();
    } 
  }, [profile, activePreset, activeSince, activeUntil]);

  useEffect(() => {
    const click = (e: MouseEvent) => { if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false); };
    document.addEventListener('mousedown', click); return () => document.removeEventListener('mousedown', click);
  }, []);

  const handleApply = () => { setActivePreset(pendingPreset); setActiveSince(pendingSince); setActiveUntil(pendingUntil); setShowDatePicker(false); };

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
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => <div key={d} className="text-[10px] font-bold text-zinc-300 text-center pb-2 uppercase">{d}</div>)}
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

  return (
    <div className="max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Mail className="w-5 h-5 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Retención (Klaviyo)</h1>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium">Análisis de campañas, flujos de automatización y fidelización de clientes.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1.5 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] h-11 relative" ref={datePickerRef}>
            <button onClick={() => setShowDatePicker(!showDatePicker)} className="flex items-center gap-2 px-4 h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group">
              <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
              <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">
                {activePreset === 'custom' ? `${fmtDateRange(activeSince)} - ${fmtDateRange(activeUntil)}` : PRESETS.find(p => p.id === activePreset)?.label || activePreset}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>
            
            {showDatePicker && (
              <div className="absolute left-0 md:left-auto md:right-0 top-full mt-3 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-30 flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 w-[290px] sm:w-[320px] md:w-auto origin-top-left md:origin-top-right">
                <div className="w-full md:w-[160px] border-b md:border-b-0 md:border-r border-zinc-50 dark:border-zinc-800 p-2 md:p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-hide">
                  {PRESETS.map(p => (
                      <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }} className={`flex-shrink-0 text-center md:text-left px-3 md:px-4 py-1.5 rounded-[10px] text-[11px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
                  ))}
                </div>
                <div className="p-4 md:p-5 flex flex-col items-center md:items-stretch">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                    <MiniCal year={calYear} month={calMonth} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onPrev={() => { if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); } else { setCalMonth(calMonth - 1); } }} onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }} />
                    <div className="hidden md:block">
                      <MiniCal year={calMonth === 11 ? calYear + 1 : calYear} month={calMonth === 11 ? 0 : calMonth + 1} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }} />
                    </div>
                  </div>
                  <div className="w-full flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <button onClick={() => setShowDatePicker(false)} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-zinc-500">Cancelar</button>
                    <button onClick={handleApply} className="px-5 py-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-bold shadow-md shadow-emerald-200 dark:shadow-none hover:bg-emerald-700 transition-colors">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Metrics */}
      {profile?.klaviyo_api_key && (
        <div className="space-y-4">
          {fetchingKlaviyo ? (
            <KlaviyoLoader loading={fetchingKlaviyo} color={MAIN_COLOR} />
          ) : currentKlaviyo ? (
            <div className="space-y-4">
              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
                <DashboardMetric icon={Package} label="Entregas" value={currentKlaviyo ? currentKlaviyo.sent?.toLocaleString('es-AR') : '...'} change={getKlaviyoChange(currentKlaviyo?.sent, prevKlaviyo?.sent)} trend={(currentKlaviyo?.sent || 0) >= (prevKlaviyo?.sent || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailySent || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-sent'} onClick={() => setExpandedMetric(expandedMetric === 'k-sent' ? null : 'k-sent')} />
                <DashboardMetric icon={MailOpen} label="Tasa de Apertura" value={currentKlaviyo ? `${((currentKlaviyo.opens / (currentKlaviyo.sent || 1)) * 100).toFixed(1)}%` : '...'} change={getKlaviyoChange((currentKlaviyo?.opens / (currentKlaviyo?.sent || 1)), (prevKlaviyo?.opens / (prevKlaviyo?.sent || 1)))} trend={((currentKlaviyo?.opens / (currentKlaviyo?.sent || 1)) || 0) >= ((prevKlaviyo?.opens / (prevKlaviyo?.sent || 1)) || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyOpens?.map((d: any, i: number) => ({ val: ((d.val / (currentKlaviyo.dailySent[i]?.val || 1)) * 100), date: d.date })) || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-open-rate'} onClick={() => setExpandedMetric(expandedMetric === 'k-open-rate' ? null : 'k-open-rate')} />
                <DashboardMetric icon={MousePointerClick} label="Tasa de Clics" value={currentKlaviyo ? `${((currentKlaviyo.clicks / (currentKlaviyo.sent || 1)) * 100).toFixed(1)}%` : '...'} change={getKlaviyoChange((currentKlaviyo?.clicks / (currentKlaviyo?.sent || 1)), (prevKlaviyo?.clicks / (prevKlaviyo?.sent || 1)))} trend={((currentKlaviyo?.clicks / (currentKlaviyo?.sent || 1)) || 0) >= ((prevKlaviyo?.clicks / (prevKlaviyo?.sent || 1)) || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyClicks?.map((d: any, i: number) => ({ val: ((d.val / (currentKlaviyo.dailySent[i]?.val || 1)) * 100), date: d.date })) || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-click-rate'} onClick={() => setExpandedMetric(expandedMetric === 'k-click-rate' ? null : 'k-click-rate')} />
                <DashboardMetric icon={DollarSign} label="Ingresos Klaviyo" value={currentKlaviyo ? `$ ${currentKlaviyo.attributed?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '...'} change={getKlaviyoChange(currentKlaviyo?.attributed, prevKlaviyo?.attributed)} trend={(currentKlaviyo?.attributed || 0) >= (prevKlaviyo?.attributed || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyAttributed || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-attr'} onClick={() => setExpandedMetric(expandedMetric === 'k-attr' ? null : 'k-attr')} />
              </div>
              {expandedMetric?.startsWith('k-') && (<MetricDetailChart label={expandedMetric === 'k-revenue' ? 'Ingresos Tienda Online' : expandedMetric === 'k-attr' ? 'Ingresos Klaviyo' : expandedMetric === 'k-sent' ? 'Entregas' : expandedMetric === 'k-click-rate' ? 'Tasa de Clics' : 'Tasa de Apertura'} color={MAIN_COLOR} data={expandedMetric === 'k-revenue' ? (currentKlaviyo?.dailyRevenue || []) : expandedMetric === 'k-attr' ? (currentKlaviyo?.dailyAttributed || []) : expandedMetric === 'k-sent' ? (currentKlaviyo?.dailySent || []) : expandedMetric === 'k-click-rate' ? (currentKlaviyo?.dailyClicks?.map((d: any, i: number) => ({ val: ((d.val / (currentKlaviyo.dailySent[i]?.val || 1)) * 100), date: d.date })) || []) : (currentKlaviyo?.dailyOpens?.map((d: any, i: number) => ({ val: ((d.val / (currentKlaviyo.dailySent[i]?.val || 1)) * 100), date: d.date })) || [])} />)}
            </div>
          ) : null}
        </div>
      )}

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
        {/* Flujos Activos */}
        <div className="bg-white dark:bg-zinc-900 rounded-[16px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Zap className="w-4 h-4 text-emerald-500" />
              </div>
              <h2 className="text-[15px] font-bold text-zinc-900 dark:text-white">Flujos de Trabajo</h2>
            </div>
            <span className="text-[12px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">{flows.filter(f => f.attributes.status === 'live').length} activos</span>
          </div>
          <div className="space-y-3">
            {fetchingConfig ? (
              <div className="animate-pulse flex flex-col gap-3">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-[12px]"></div>)}
              </div>
            ) : flows.filter(f => f.attributes.status === 'live').length > 0 ? (
              flows.filter(f => f.attributes.status === 'live').map((flow) => (
                <div key={flow.id} className="space-y-2">
                  <button 
                    onClick={async () => {
                      if (expandedMetric === `flow-${flow.id}`) {
                        setExpandedMetric(null);
                      } else {
                        setExpandedMetric(`flow-${flow.id}`);
                        if (!flow.messages) {
                          const msgs = await klaviyo.getFlowMessages(profile?.klaviyo_api_key!, flow.id);
                          setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, messages: msgs } : f));
                        }
                      }
                    }}
                    className="w-full flex items-center justify-between p-4 rounded-[12px] border border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div>
                      <h3 className="text-[13px] font-bold text-zinc-900 dark:text-white mb-1">{flow.attributes.name}</h3>
                      <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-500">
                        <span>{new Date(flow.attributes.updated).toLocaleDateString()}</span>
                        <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600"></span>
                        <span>{flow.attributes.status}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${flow.attributes.status === 'live' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                        {flow.attributes.status === 'live' ? 'Activo' : flow.attributes.status}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${expandedMetric === `flow-${flow.id}` ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  
                  {expandedMetric === `flow-${flow.id}` && (
                    <div className="pl-4 border-l-2 border-emerald-500/20 ml-2 space-y-2 animate-in slide-in-from-top-1 fade-in duration-200">
                      {!flow.messages ? (
                        <div className="flex items-center gap-2 p-2 text-[11px] text-zinc-400 italic">
                          <div className="w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                          Cargando mensajes...
                        </div>
                      ) : flow.messages.length > 0 ? (
                        flow.messages.map((m: any) => (
                          <div key={m.id} className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg flex items-center justify-between">
                            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">{m.attributes.name}</span>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">{m.attributes.channel}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11px] text-zinc-400 italic p-2">No se encontraron mensajes en este flujo.</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-[13px] text-zinc-500 font-medium text-center py-8">No hay flujos configurados.</p>
            )}
          </div>
        </div>

        {/* Campañas */}
        <div className="bg-white dark:bg-zinc-900 rounded-[16px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Mail className="w-4 h-4 text-emerald-500" />
              </div>
              <h2 className="text-[15px] font-bold text-zinc-900 dark:text-white">Campañas Recientes</h2>
            </div>
            <span className="text-[12px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">{campaigns.filter(c => c.attributes.status !== 'draft' && c.attributes.status !== 'Draft').length} enviadas</span>
          </div>
          <div className="space-y-3">
            {fetchingConfig ? (
              <div className="animate-pulse flex flex-col gap-3">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-[12px]"></div>)}
              </div>
            ) : campaigns.filter(c => c.attributes.status !== 'draft' && c.attributes.status !== 'Draft').length > 0 ? (
              campaigns.filter(c => c.attributes.status !== 'draft' && c.attributes.status !== 'Draft').map((camp) => (
                <div key={camp.id} className="space-y-2">
                  <button 
                    onClick={async () => {
                      if (expandedMetric === `camp-${camp.id}`) {
                        setExpandedMetric(null);
                      } else {
                        setExpandedMetric(`camp-${camp.id}`);
                        if (!camp.messages) {
                          const msgs = await klaviyo.getCampaignMessages(profile?.klaviyo_api_key!, camp.id);
                          setCampaigns(prev => prev.map(c => c.id === camp.id ? { ...c, messages: msgs } : c));
                        }
                      }
                    }}
                    className="w-full flex items-center justify-between p-4 rounded-[12px] border border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    <div>
                      <h3 className="text-[13px] font-bold text-zinc-900 dark:text-white mb-1">{camp.attributes.name}</h3>
                      <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-500">
                        <span>{new Date(camp.attributes.updated_at).toLocaleDateString()}</span>
                        <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600"></span>
                        <span>{camp.attributes.status}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${camp.attributes.status === 'sent' || camp.attributes.status === 'Sent' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'}`}>
                        {camp.attributes.status === 'sent' || camp.attributes.status === 'Sent' ? 'Enviada' : camp.attributes.status}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${expandedMetric === `camp-${camp.id}` ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {expandedMetric === `camp-${camp.id}` && (
                    <div className="pl-4 border-l-2 border-emerald-500/20 ml-2 space-y-2 animate-in slide-in-from-top-1 fade-in duration-200">
                      {!camp.messages ? (
                        <div className="flex items-center gap-2 p-2 text-[11px] text-zinc-400 italic">
                          <div className="w-3 h-3 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                          Cargando mensajes...
                        </div>
                      ) : camp.messages.length > 0 ? (
                        camp.messages.map((m: any) => (
                          <div key={m.id} className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg flex items-center justify-between">
                            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">{m.attributes.label || m.attributes.name || 'Sin nombre'}</span>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase">{m.attributes.channel}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11px] text-zinc-400 italic p-2">No se encontraron mensajes.</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-[13px] text-zinc-500 font-medium text-center py-8">No hay campañas registradas.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
