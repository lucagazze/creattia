import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useAuth } from '../contexts/AuthContext';
import { metaAds, DatePreset, presetToRange, daysAgo, today, getPrevPeriod } from '../services/metaAds';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend, ReferenceLine
} from 'recharts';
import {
  TrendingUp, Download, RefreshCw, Calendar, ChevronDown,
  Users, DollarSign, Target, BarChart2, Globe, Smartphone, User
} from 'lucide-react';

const BLUE = '#3b82f6';
const GREEN = '#10b981';
const RED = '#ef4444';
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

const fmt = (n: number, isCurrency = false) =>
  isCurrency ? `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : n.toLocaleString('es-AR', { maximumFractionDigits: 0 });

const pct = (n: number) => `${Math.abs(n).toFixed(1)}%`;

const fmtVal = (v: number) => {
  if (!v) return '0';
  if (v >= 1000) return (v/1000).toFixed(1) + 'k';
  return v.toFixed(v < 10 ? 2 : 0);
};

const KpiCard = ({ label, value, sub, trend, icon: Icon, color = BLUE, active, onClick, loading }: any) => (
  <button 
    onClick={onClick}
    className={`bg-white dark:bg-zinc-900 rounded-2xl border transition-all text-left p-5 flex flex-col gap-3 group relative ${active ? 'ring-2 ring-blue-500 border-transparent shadow-lg' : 'border-black/[0.06] dark:border-white/[0.06] shadow-sm hover:shadow-md'}`}
  >
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${active ? 'bg-blue-500 text-white' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 group-hover:text-blue-500'}`}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
    <div>
      <div className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">{loading ? '...' : value}</div>
      {sub !== undefined && !loading && (
        <div className={`flex items-center gap-1 text-xs font-bold mt-1 ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-zinc-400'}`}>
          {trend === 'up' && <TrendingUp className="w-3 h-3" />}
          {trend === 'down' && <TrendingUp className="w-3 h-3 rotate-180" />}
          <span>{sub}</span>
        </div>
      )}
    </div>
    {active && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rotate-45 rounded-sm" />}
  </button>
);

const SectionTitle = ({ icon: Icon, title, subtitle }: any) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
      <Icon className="w-4 h-4 text-emerald-500" />
    </div>
    <div>
      <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{title}</h3>
      {subtitle && <p className="text-[11px] text-zinc-400">{subtitle}</p>}
    </div>
  </div>
);

const GENDER_COLORS: Record<string, string> = { male: '#3b82f6', female: '#ec4899', unknown: '#94a3b8' };
const PLATFORM_COLORS: Record<string, string> = { facebook: '#1877f2', instagram: '#e1306c', audience_network: '#f59e0b', messenger: '#00b2ff', threads: '#000000' };

export default function CaptacionPage() {
  const { profile: authProfile } = useAuth();
  const { darkMode } = useTheme();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Date State
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('last_7d');
  const [activeSince, setActiveSince] = useState(presetToRange('last_7d').since);
  const [activeUntil, setActiveUntil] = useState(presetToRange('last_7d').until);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<DatePreset | 'custom'>(activePreset);
  const [pendingSince, setPendingSince] = useState(activeSince);
  const [pendingUntil, setPendingUntil] = useState(activeUntil);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [hovering, setHovering] = useState('');
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);

  // Data State
  const [loading, setLoading] = useState(false);
  const [daily, setDaily] = useState<any[]>([]);
  const [prevDaily, setPrevDaily] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [prevSummary, setPrevSummary] = useState<any>(null);
  const [genderData, setGenderData] = useState<any[]>([]);
  const [regionData, setRegionData] = useState<any[]>([]);
  const [platformData, setPlatformData] = useState<any[]>([]);
  const [ageData, setAgeData] = useState<any[]>([]);
  const [expandedMetric, setExpandedMetric] = useState<string | null>('spend');

  const range = activePreset === 'custom' ? { since: activeSince, until: activeUntil } : presetToRange(activePreset);
  const prevRange = getPrevPeriod(range.since, range.until);

  const extractResults = (actions: any[]) => {
    if (!actions || !Array.isArray(actions)) return 0;
    
    // STRICT MATCHING: Only count actual Purchases or Leads.
    const purchase = actions.find(a => 
      a.action_type === 'purchase' || 
      a.action_type === 'offsite_conversion.fb_pixel_purchase' || 
      a.action_type === 'omni_purchase'
    );
    if (purchase) return parseFloat(purchase.value || 0);

    const lead = actions.find(a => 
      a.action_type === 'lead' || 
      a.action_type === 'offsite_conversion.fb_pixel_lead' || 
      a.action_type === 'onsite_conversion.lead_grouped'
    );
    if (lead) return parseFloat(lead.value || 0);

    return 0;
  };

  const fetchAll = async () => {
    if (!profile?.meta_account_id) return;
    setLoading(true);
    try {
      const accountId = profile.meta_account_id;
      const [rawDaily, rawPrevDaily, gender, regions, platform, age] = await Promise.all([
        metaAds.getInsightsDaily(accountId, 'spend,reach,actions,action_values,purchase_roas,impressions', undefined, range),
        metaAds.getInsightsDaily(accountId, 'spend,reach,actions,action_values,purchase_roas,impressions', undefined, prevRange),
        metaAds.getInsightsBreakdown(accountId, 'gender', range),
        metaAds.getInsightsBreakdown(accountId, 'region', range),
        metaAds.getInsightsBreakdown(accountId, 'publisher_platform', range),
        metaAds.getInsightsBreakdown(accountId, 'age', range),
      ]);

      const processDaily = (raw: any[], r: any) => {
        const padded: any[] = [];
        let d = new Date(r.since + 'T12:00:00');
        const end = new Date(r.until + 'T12:00:00');
        while (d <= end) {
          const iso = d.toISOString().split('T')[0];
          const match = raw.find((row: any) => row.date === iso);
          padded.push(match || { date: iso, spend: 0, reach: 0, results: 0, purchase_value: 0, roas: 0 });
          d.setDate(d.getDate() + 1);
        }
        return padded;
      };

      setDaily(processDaily(rawDaily, range));
      setPrevDaily(processDaily(rawPrevDaily, prevRange));

      const calcSummary = (raw: any[]) => {
        const tot = raw.reduce((a: any, row: any) => ({
          spend: a.spend + (row.spend || 0),
          reach: a.reach + (row.reach || 0),
          results: a.results + (row.results || 0),
          purchase_value: a.purchase_value + (row.purchase_value || 0),
          impressions: a.impressions + (row.impressions || 0),
        }), { spend: 0, reach: 0, results: 0, purchase_value: 0, impressions: 0 });
        tot.roas = tot.purchase_value / (tot.spend || 1);
        return tot;
      };

      setSummary(calcSummary(rawDaily));
      setPrevSummary(calcSummary(rawPrevDaily));

      setGenderData(gender.map((r: any) => ({
        name: r.gender === 'male' ? 'Hombre' : r.gender === 'female' ? 'Mujer' : 'Desconocido',
        key: r.gender, spend: parseFloat(r.spend || 0), reach: parseInt(r.reach || 0), results: extractResults(r.actions)
      })).sort((a: any, b: any) => b.spend - a.spend));

      setRegionData(regions.map((r: any) => ({
        name: r.region, spend: parseFloat(r.spend || 0), reach: parseInt(r.reach || 0), results: extractResults(r.actions)
      })).sort((a: any, b: any) => b.spend - a.spend).slice(0, 10));

      setPlatformData(platform.map((r: any) => ({
        name: r.publisher_platform,
        label: r.publisher_platform === 'facebook' ? 'Facebook' : r.publisher_platform === 'instagram' ? 'Instagram' : r.publisher_platform === 'audience_network' ? 'Audience Net.' : r.publisher_platform,
        spend: parseFloat(r.spend || 0), reach: parseInt(r.reach || 0), results: extractResults(r.actions)
      })).sort((a: any, b: any) => b.spend - a.spend));

      setAgeData(age.map((r: any) => ({
        name: r.age, spend: parseFloat(r.spend || 0), reach: parseInt(r.reach || 0), results: extractResults(r.actions)
      })).sort((a: any, b: any) => a.name.localeCompare(b.name)));

    } catch (e) { console.error('CaptacionPage fetch error:', e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [profile?.id, activeSince, activeUntil, activePreset]);

  // Click outside date picker
  useEffect(() => {
    const click = (e: MouseEvent) => { if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false); };
    document.addEventListener('mousedown', click); return () => document.removeEventListener('mousedown', click);
  }, []);

  const handleApply = () => { setActivePreset(pendingPreset); setActiveSince(pendingSince); setActiveUntil(pendingUntil); setShowDatePicker(false); };
  const handleExportPDF = () => { window.print(); };

  const fmtDateRange = (d: string) => {
    const parts = d.split('-');
    const month = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(parts[1])-1];
    return `${parts[2]} ${month}`;
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
          <div className="w-8 flex justify-start">{onPrev && <button onClick={onPrev} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group"><ChevronDown className="w-4 h-4 rotate-90 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" /></button>}</div>
          <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 text-center">{MONTHS_ES[month]} {year}</span>
          <div className="w-8 flex justify-end">{onNext && <button onClick={onNext} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group"><ChevronDown className="w-4 h-4 -rotate-90 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" /></button>}</div>
        </div>
        <div key={`${year}-${month}`} className={`grid grid-cols-7 gap-y-1 ${animClass}`}>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => <div key={d} className="text-[10px] font-bold text-zinc-300 text-center pb-2 uppercase tracking-tighter">{d}</div>)}
          {days.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} />;
            const isToday = d === todayStr; const isFuture = d > todayStr; const isSelected = d === since || d === until;
            const isInRange = since && until && d > since && d < until;
            const isHovering = since && !until && hovering && ((d > since && d <= hovering) || (d < since && d >= hovering));
            return (
              <button key={d} onMouseEnter={() => !isFuture && onHover(d)} onClick={() => !isFuture && onDay(d)} disabled={isFuture} className={`h-8 w-8 text-[11px] font-bold transition-all relative flex items-center justify-center ${isSelected ? 'bg-blue-600 text-white rounded-full z-10 shadow-md shadow-blue-200 dark:shadow-none' : (isInRange || isHovering) ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' : isFuture ? 'text-zinc-200 dark:text-zinc-800 cursor-default' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full'} ${isToday && !isSelected ? 'text-blue-600 dark:text-blue-500 ring-1 ring-blue-100 dark:ring-blue-900/30' : ''}`}>{d.split('-')[2]}</button>
            );
          })}
        </div>
      </div>
    );
  };

  const getChange = (curr: number, prev: number) => !prev ? 0 : ((curr - prev) / prev) * 100;

  const currentValData = daily.map((d, i) => ({ 
    date: d.date, 
    val: expandedMetric === 'spend' ? d.spend : expandedMetric === 'reach' ? d.reach : expandedMetric === 'results' ? d.results : expandedMetric === 'revenue' ? d.purchase_value : d.roas,
    prevVal: prevDaily[i] ? (expandedMetric === 'spend' ? prevDaily[i].spend : expandedMetric === 'reach' ? prevDaily[i].reach : expandedMetric === 'results' ? prevDaily[i].results : expandedMetric === 'revenue' ? prevDaily[i].purchase_value : prevDaily[i].roas) : null
  }));

  const maxVal = Math.max(...currentValData.map(d => d.val), 0);
  const nonZero = currentValData.map(d => d.val).filter(v => v > 0);
  const avg = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  
  const prevVals = currentValData.filter(d => d.prevVal !== null).map(d => d.prevVal as number);
  const prevNonZero = prevVals.filter(v => v > 0);
  const prevAvg = prevNonZero.length > 0 ? prevNonZero.reduce((a, b) => a + b, 0) / prevNonZero.length : 0;

  const trendValue = getChange(avg, prevAvg);
  const chartColor = trendValue > 5 ? GREEN : trendValue < -5 ? RED : BLUE;
  const gradientId = `grad-${expandedMetric}`;

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 print:space-y-6 print:p-0 print:max-w-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <img 
              src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} 
              alt="Algoritmia" 
              className="w-10 h-10 object-contain drop-shadow-sm"
            />
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Captación (Meta Ads)</h1>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium">Análisis detallado por regiones, demografía y plataformas.</p>
        </div>
        
        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1.5 py-1 shadow-sm h-11 relative" ref={datePickerRef}>
            <button onClick={() => setShowDatePicker(!showDatePicker)} className="flex items-center gap-2 px-4 h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group">
              <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors" />
              <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">
                {activePreset === 'custom' ? `${fmtDateRange(activeSince)} - ${fmtDateRange(activeUntil)}` : PRESETS.find(p => p.id === activePreset)?.label || activePreset}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>
            {showDatePicker && (
              <div className="absolute left-0 md:left-auto md:right-0 top-full mt-3 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-[100] flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 w-[290px] sm:w-[320px] md:w-auto origin-top-left md:origin-top-right">
                  <div className="w-full md:w-[160px] border-b md:border-b-0 md:border-r border-zinc-50 dark:border-zinc-800 p-2 md:p-3 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible scrollbar-hide">
                    {PRESETS.map(p => (
                      <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }} className={`flex-shrink-0 text-center md:text-left px-3 md:px-4 py-1.5 rounded-[10px] text-[11px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
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
                      <button onClick={handleApply} className="px-5 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] font-bold shadow-md shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-colors">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button onClick={handleExportPDF} className="flex items-center gap-2 px-5 h-11 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full text-[13px] font-bold shadow-lg hover:opacity-90 transition-all"><Download className="w-4 h-4" />Exportar</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Inversión" value={fmt(summary?.spend || 0, true)} icon={DollarSign} color="#3b82f6" loading={loading} active={expandedMetric === 'spend'} onClick={() => setExpandedMetric('spend')} sub={pct(getChange(summary?.spend, prevSummary?.spend))} trend={getChange(summary?.spend, prevSummary?.spend) >= 0 ? 'up' : 'down'} />
        <KpiCard label="Alcance" value={fmt(summary?.reach || 0)} icon={Users} color="#8b5cf6" loading={loading} active={expandedMetric === 'reach'} onClick={() => setExpandedMetric('reach')} sub={pct(getChange(summary?.reach, prevSummary?.reach))} trend={getChange(summary?.reach, prevSummary?.reach) >= 0 ? 'up' : 'down'} />
        <KpiCard label="Conversiones" value={fmt(summary?.results || 0)} icon={Target} color="#10b981" loading={loading} active={expandedMetric === 'results'} onClick={() => setExpandedMetric('results')} sub={pct(getChange(summary?.results, prevSummary?.results))} trend={getChange(summary?.results, prevSummary?.results) >= 0 ? 'up' : 'down'} />
        <KpiCard label="Retorno" value={fmt(summary?.purchase_value || 0, true)} icon={TrendingUp} color="#f59e0b" loading={loading} active={expandedMetric === 'revenue'} onClick={() => setExpandedMetric('revenue')} sub={pct(getChange(summary?.purchase_value, prevSummary?.purchase_value))} trend={getChange(summary?.purchase_value, prevSummary?.purchase_value) >= 0 ? 'up' : 'down'} />
        <KpiCard label="ROAS" value={`${(summary?.roas || 0).toFixed(2)}x`} icon={BarChart2} color="#ef4444" loading={loading} active={expandedMetric === 'roas'} onClick={() => setExpandedMetric('roas')} sub={pct(getChange(summary?.roas, prevSummary?.roas))} trend={getChange(summary?.roas, prevSummary?.roas) >= 0 ? 'up' : 'down'} />
      </div>

      {/* Expanded Chart - CLONED FROM DASHBOARD */}
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] border border-black/[0.06] dark:border-white/[0.06] p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <SectionTitle 
            icon={BarChart2} 
            title={`Evolución de ${expandedMetric === 'spend' ? 'Inversión' : expandedMetric === 'reach' ? 'Alcance' : expandedMetric === 'results' ? 'Conversiones' : expandedMetric === 'revenue' ? 'Retorno' : 'ROAS'}`} 
            subtitle="Análisis detallado del periodo" 
          />
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: chartColor }} /><span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Actual</span></div>
            
            {avg > 0 && (
              <div 
                className={`flex items-center gap-2 cursor-pointer transition-all ${hoveredLine === 'curr' ? 'scale-110' : hoveredLine === 'prev' ? 'opacity-30' : ''}`}
                onMouseEnter={() => setHoveredLine('curr')}
                onMouseLeave={() => setHoveredLine(null)}
              >
                <div className="w-3 h-0.5 bg-amber-500" />
                <span className="text-[13px] font-bold text-amber-600 dark:text-amber-500">Media Act: {fmtVal(avg)}</span>
              </div>
            )}
            {prevAvg > 0 && (
              <div 
                className={`flex items-center gap-2 cursor-pointer transition-all ${hoveredLine === 'prev' ? 'scale-110' : hoveredLine === 'curr' ? 'opacity-30' : ''}`}
                onMouseEnter={() => setHoveredLine('prev')}
                onMouseLeave={() => setHoveredLine(null)}
              >
                <div className="w-3 h-0.5 bg-slate-400" />
                <span className="text-[13px] font-bold text-slate-500">Media Ant: {fmtVal(prevAvg)}</span>
              </div>
            )}
            {maxVal > 0 && <div className="flex items-center gap-2 pl-2 border-l border-zinc-100 dark:border-zinc-800"><span className="text-[13px] font-semibold text-zinc-400">Máx:</span><span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">{fmtVal(maxVal)}</span></div>}
          </div>
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={currentValData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={chartColor} stopOpacity={0.15}/><stop offset="95%" stopColor={chartColor} stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-zinc-100 dark:text-zinc-800/50" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={d => d.split('-').slice(1).reverse().join('/')} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis 
                domain={[0, maxVal > 0 ? maxVal * 1.2 : 'auto']} 
                ticks={maxVal > 0 ? [0, Math.round(avg), Math.round(prevAvg), Math.round(maxVal)].filter(v => v >= 0).sort((a,b) => a-b) : undefined} 
                tick={{ fontSize: 10, fill: '#9ca3af' }} 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={v => v === 0 ? '' : fmtVal(v)} 
              />
              <Tooltip content={({ active, payload }: any) => {
                if (active && payload && payload.length) {
                  const curr = payload.find((p: any) => p.dataKey === 'val');
                  return (
                    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 rounded-xl shadow-xl min-w-[140px]">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">{curr?.payload?.date}</p>
                      {curr && (
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chartColor }} />
                            <span className="text-[11px] font-medium text-zinc-500">Valor</span>
                          </div>
                          <span className="text-[12px] font-bold text-zinc-900 dark:text-zinc-100">{fmtVal(curr.value)}</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              }} />

              {/* Averages */}
              {avg > 0 && (
                <ReferenceLine 
                  y={avg} 
                  stroke="#f59e0b" 
                  strokeDasharray="4 4" 
                  strokeOpacity={hoveredLine === 'curr' ? 1 : hoveredLine === 'prev' ? 0.1 : 0.8} 
                  strokeWidth={hoveredLine === 'curr' ? 4 : 2} 
                  className="transition-all duration-300"
                />
              )}
              {prevAvg > 0 && (
                <ReferenceLine 
                  y={prevAvg} 
                  stroke="#94a3b8" 
                  strokeDasharray="4 4" 
                  strokeOpacity={hoveredLine === 'prev' ? 1 : hoveredLine === 'curr' ? 0.1 : 0.6} 
                  strokeWidth={hoveredLine === 'prev' ? 4 : 2} 
                  className="transition-all duration-300"
                />
              )}
              {maxVal > 0 && (
                <ReferenceLine 
                  y={maxVal} 
                  stroke="#6366f1" 
                  strokeOpacity={hoveredLine ? 0.2 : 0.5} 
                  strokeWidth={2} 
                  strokeDasharray="4 4"
                  label={{ value: `MÁX: ${fmtVal(maxVal)}`, position: 'insideTopRight', fontSize: 10, fontWeight: '900', fill: '#6366f1', opacity: hoveredLine ? 0.2 : 1 }} 
                />
              )}

              <Area 
                type="monotone" 
                dataKey="val" 
                stroke={chartColor} 
                strokeWidth={hoveredLine ? 1 : 3} 
                strokeOpacity={hoveredLine ? 0.1 : 1}
                fillOpacity={hoveredLine ? 0.02 : 1} 
                fill={`url(#${gradientId})`} 
                dot={{ r: 4, fill: chartColor, strokeWidth: 2, stroke: '#fff' }} 
                activeDot={{ r: 6, strokeWidth: 0 }} 
                isAnimationActive={true}
                animationDuration={1500}
                animationEasing="ease-in-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Breakdowns grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Region */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-6">
          <SectionTitle icon={Globe} title="Rendimiento por Región" subtitle="Inversión por estado o provincia" />
          {regionData.length === 0 ? <p className="text-xs text-zinc-400 text-center py-8">Sin datos</p> : (
            <div className="space-y-3">
              {regionData.map((r, i) => {
                const total = regionData.reduce((a, b) => a + b.spend, 0); const pctVal = total > 0 ? (r.spend / total) * 100 : 0;
                const isRegionRestricted = (summary?.results || 0) > 0 && regionData.every(x => x.results === 0);
                return (
                  <div key={r.name}>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-zinc-700 dark:text-zinc-300">{r.name || 'Otros'}</span>
                      <span className="text-zinc-500">{fmt(r.spend, true)} ({pctVal.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-1">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pctVal}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Alcance: {fmt(r.reach)}</span>
                      {!isRegionRestricted && <span className="font-bold text-emerald-600 dark:text-emerald-500">Conversiones: {r.results}</span>}
                    </div>
                  </div>
                );
              })}
              
              {(summary?.results || 0) > 0 && regionData.every(x => x.results === 0) && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-200 dark:border-amber-500/20">
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug font-medium">
                    <span className="font-bold">Aviso de Privacidad:</span> Meta no reporta la ubicación regional para conversiones web (Píxel) debido a políticas de privacidad (iOS 14+).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Platform */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-6">
          <SectionTitle icon={Smartphone} title="Por plataforma" subtitle="Distribución del gasto por canal" />
          {platformData.length === 0 ? <p className="text-xs text-zinc-400 text-center py-8">Sin datos</p> : (
            <div className="space-y-4">
              {platformData.map((p) => {
                const total = platformData.reduce((a, b) => a + b.spend, 0); const pctVal = total > 0 ? (p.spend / total) * 100 : 0;
                return (
                  <div key={p.name}>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-zinc-700 dark:text-zinc-300">{p.label}</span>
                      <span className="text-zinc-500">{fmt(p.spend, true)}</span>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-1">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, backgroundColor: PLATFORM_COLORS[p.name] || BLUE }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>{pctVal.toFixed(1)}% del gasto • Alcance: {fmt(p.reach)}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-500">Conversiones: {p.results}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Gender */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-6">
          <SectionTitle icon={User} title="Por género" subtitle="Inversión por audiencia" />
          {genderData.length === 0 ? <p className="text-xs text-zinc-400 text-center py-8">Sin datos</p> : (
            <div className="space-y-4">
              {genderData.map((g) => {
                const total = genderData.reduce((a, b) => a + b.spend, 0); const pctVal = total > 0 ? (g.spend / total) * 100 : 0;
                return (
                  <div key={g.key}>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-zinc-700 dark:text-zinc-300">{g.name}</span>
                      <span className="text-zinc-500">{fmt(g.spend, true)}</span>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-1">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, backgroundColor: GENDER_COLORS[g.key] || BLUE }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Alcance: {fmt(g.reach)}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-500">Conversiones: {g.results}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Age */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-6">
          <SectionTitle icon={Users} title="Por rango de edad" subtitle="Distribución etaria" />
          {ageData.length === 0 ? <p className="text-xs text-zinc-400 text-center py-8">Sin datos</p> : (
            <div className="space-y-3">
              {ageData.map((a) => {
                const total = ageData.reduce((acc, b) => acc + b.spend, 0);
                const pctVal = total > 0 ? (a.spend / total) * 100 : 0;
                return (
                  <div key={a.name}>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-zinc-700 dark:text-zinc-300">{a.name} años</span>
                      <span className="text-zinc-500">{fmt(a.spend, true)}</span>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-1">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pctVal}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Alcance: {fmt(a.reach)}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-500">Conversiones: {a.results}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`@media print { body { background: white !important; } .print\\:hidden { display: none !important; } @page { margin: 1cm; size: A4; } }`}</style>
    </div>
  );
}
