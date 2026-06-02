import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { ShoppingBag, DollarSign, Package, Calendar, ChevronDown, Receipt, Tag, TrendingUp, CheckCircle, Clock, BarChart2, Download, X, Search, AlertCircle, XCircle, Loader2, RefreshCw, Users, ChevronRight } from 'lucide-react';
import { ecommerce } from '../services/ecommerce';
import { getPrevPeriod, today, daysAgo, presetToRange } from '../services/metaAds';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import EmailLoader from '../components/ui/EmailLoader';

const PINK = '#ec4899';

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
  for (let i = 1; i <= lastDay; i++) {
    const d = new Date(year, month, i);
    days.push(d.toISOString().split('T')[0]);
  }
  const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="w-[240px]" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center mb-4 px-1">
        <div className="w-8 flex justify-start">
          {onPrev && (
            <button onClick={onPrev} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group">
              <ChevronDown className="w-4 h-4 rotate-90 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" />
            </button>
          )}
        </div>
        <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 text-center">
          {MONTHS_ES[month]} {year}
        </span>
        <div className="w-8 flex justify-end">
          {onNext && (
            <button onClick={onNext} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group">
              <ChevronDown className="w-4 h-4 -rotate-90 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200" />
            </button>
          )}
        </div>
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
                isSelected ? 'bg-pink-600 text-white rounded-full z-10 shadow-md shadow-pink-200 dark:shadow-none' : 
                (isInRange || isHovering) ? 'bg-pink-50 dark:bg-pink-500/10 text-pink-600' : 
                isFuture ? 'text-zinc-200 dark:text-zinc-800 cursor-default' : 
                'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full'
              } ${isToday && !isSelected ? 'text-pink-600 dark:text-pink-500 ring-1 ring-pink-100 dark:ring-pink-900/30' : ''}`}
            >
              {d.split('-')[2]}
            </button>
          );
        })}
      </div>
    </div>
  );
};

type Score = 'pass' | 'warn' | 'fail';

const ScoreBadge: React.FC<{ score: Score | string; label: string }> = ({ score, label }) => {
  const cls = score === 'pass' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : score === 'warn' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400';
  const Icon = score === 'pass' ? CheckCircle : score === 'warn' ? AlertCircle : XCircle;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}><Icon className="w-2.5 h-2.5" />{label}</span>;
};

const TotalBadge: React.FC<{ score: number }> = ({ score }) => {
  const map: Record<number, { label: string; cls: string }> = {
    3: { label: 'Héroe',     cls: 'bg-emerald-500 text-white' },
    2: { label: 'Candidato', cls: 'bg-blue-500 text-white' },
    1: { label: 'Potencial', cls: 'bg-amber-500 text-white' },
    0: { label: 'Débil',     cls: 'bg-zinc-400 dark:bg-zinc-600 text-white' },
  };
  const { label, cls } = map[score] ?? map[0];
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{score}/3 · {label}</span>;
};

export default function TiendaPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const [activeTab, setActiveTab] = useState<'metrics' | 'products'>('metrics');
  const [data, setData] = useState<any>(null);
  const [prevData, setPrevData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMetric, setExpandedMetric] = useState<string | null>('s-revenue');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  // Products analysis state
  const [productAnalysis, setProductAnalysis] = useState<any[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const loadProductAnalysis = async () => {
    const p = profile as any;
    if (!p?.shopify_domain || !p?.shopify_access_token) return;
    setProductLoading(true);
    setProductError(null);
    try {
      const results = await ecommerce.analyzeProducts(p.shopify_domain, p.shopify_access_token);
      setProductAnalysis(results);
    } catch (err: any) {
      setProductError(err.message || 'Error al analizar productos');
    } finally {
      setProductLoading(false);
    }
  };

  const scoreEP  = (v: number) => v >= 50 ? 'pass' : v >= 25 ? 'warn' : 'fail';
  const scoreSP  = (v: number) => v >= 40 ? 'pass' : v >= 20 ? 'warn' : 'fail';
  const scoreRD  = (v: number) => v === 0 ? 'fail' : v <= 15 ? 'pass' : v <= 45 ? 'warn' : 'fail';
  const totalScore = (p: any) => [scoreEP(p.entryPointPct), scoreSP(p.secondPurchasePct), scoreRD(p.repurchaseDays)].filter(s => s === 'pass').length;


  // Date Picker State
  const [activePreset, setActivePreset] = useState<any>('last_14d');
  const [activeSince, setActiveSince] = useState(daysAgo(14));
  const [activeUntil, setActiveUntil] = useState(today());
  const [refreshKey, setRefreshKey] = useState(0);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<any>('last_14d');
  const [pendingSince, setPendingSince] = useState(daysAgo(14));
  const [pendingUntil, setPendingUntil] = useState(today());
  const [hovering, setHovering] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      const p: any = profile;
      if (!p || !p.ecommerce_platform || !p.shopify_domain || !p.shopify_access_token) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setLoading(true);
      const range = activePreset === 'custom' ? { since: activeSince, until: activeUntil } : presetToRange(activePreset);
      const prevRange = getPrevPeriod(range.since, range.until);
      try {
        const [res, prevRes] = await Promise.all([
          ecommerce.getDashboardData(p.ecommerce_platform, p.shopify_domain, p.shopify_access_token, range.since, range.until),
          ecommerce.getDashboardData(p.ecommerce_platform, p.shopify_domain, p.shopify_access_token, prevRange.since, prevRange.until)
        ]);
        if (cancelled) return;
        setData(res);
        setPrevData(prevRes);
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(fetchData, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [profile?.id, activePreset, activeSince, activeUntil, refreshKey]);

  const handleApply = () => {
    setActivePreset(pendingPreset); setActiveSince(pendingSince); setActiveUntil(pendingUntil || pendingSince); setRefreshKey(prev => prev + 1); setShowDatePicker(false);
  };

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

  const fmtDateRange = (d: string, showYearForce?: boolean) => {
    if (!d) return '';
    const parts = d.split('-');
    const year = parts[0];
    const month = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(parts[1])-1];
    const day = parts[2];
    const currentYear = new Date().getFullYear().toString();
    if (year === currentYear && !showYearForce) return `${day} ${month}`;
    return `${day} ${month} ${year}`;
  };

  if (!profile || !(profile as any).ecommerce_platform) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in px-4">
        <div className="w-16 h-16 bg-pink-100 dark:bg-pink-500/10 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="w-8 h-8 text-pink-600 dark:text-pink-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Tienda no configurada</h2>
        <p className="text-[15px] text-zinc-500 max-w-md text-center leading-relaxed">
          Para ver las métricas de tu e-commerce, necesitas conectar tu tienda Shopify o Tiendanube desde el panel de administración.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-in pb-20 pt-4 md:pt-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-pink-500" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Rendimiento de Tienda</h1>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium">Métricas principales de tu e-commerce ({(profile as any).ecommerce_platform}).</p>
        </div>

        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1.5 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] h-11 relative" ref={datePickerRef}>
              <button 
                onClick={() => setShowDatePicker(!showDatePicker)} 
                className="flex items-center gap-2 px-4 h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group"
              >
                <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-pink-500 transition-colors" />
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
                      <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }} className={`flex-shrink-0 text-center md:text-left px-3 md:px-4 py-1.5 rounded-[10px] text-[11px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-pink-600 text-white shadow-md shadow-pink-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
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
                      <button onClick={handleApply} className="px-5 py-1.5 rounded-lg bg-pink-600 text-white text-[12px] font-bold shadow-md shadow-pink-200 dark:shadow-none hover:bg-pink-700 transition-colors">Aplicar</button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-8 border-b border-zinc-100 dark:border-zinc-800 print:hidden">
        {[{ id: 'metrics', label: 'Métricas', icon: BarChart2 }, { id: 'products', label: 'Productos', icon: Package }].map(t => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id as any);
              if (t.id === 'products' && productAnalysis.length === 0 && !productLoading) loadProductAnalysis();
            }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-bold border-b-2 -mb-px transition-all ${activeTab === t.id ? 'border-pink-500 text-pink-600 dark:text-pink-400' : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="hidden print:block mb-6 pb-4 border-b-2 border-zinc-200">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[22px] font-black text-zinc-900 tracking-tight">ALGORITMIA</span>
          <span className="text-[11px] text-zinc-400">{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
        <p className="text-[13px] text-zinc-500 font-medium">Tienda Online — {(profile as any)?.ecommerce_platform}</p>
        <p className="text-[15px] font-bold text-zinc-900">Período: {fmtDateRange(activeSince, true)} — {fmtDateRange(activeUntil, true)}</p>
      </div>

      {/* Products Tab */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {productLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
              <p className="text-[13px] text-zinc-500 font-medium">Analizando pedidos de la tienda...</p>
              <p className="text-[11px] text-zinc-400">Esto puede tardar unos segundos</p>
            </div>
          ) : productError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <XCircle className="w-8 h-8 text-red-400" />
              <p className="text-[13px] text-zinc-600 dark:text-zinc-400">{productError}</p>
              <button onClick={loadProductAnalysis} className="flex items-center gap-1.5 px-4 py-2 bg-pink-600 text-white rounded-lg text-[12px] font-bold"><RefreshCw className="w-3 h-3" />Reintentar</button>
            </div>
          ) : productAnalysis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Package className="w-10 h-10 text-zinc-300" />
              <p className="text-[14px] font-semibold text-zinc-600 dark:text-zinc-400">Análisis de productos</p>
              <p className="text-[12px] text-zinc-400 text-center max-w-xs">Calcula entry point, tasa de segunda compra, velocidad de recompra y cross-sell usando todos los pedidos de la tienda.</p>
              <button onClick={loadProductAnalysis} className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-[13px] font-bold shadow-md shadow-pink-200 dark:shadow-none transition-all"><Package className="w-4 h-4" />Analizar Productos</button>
            </div>
          ) : (
            <>
              {/* Header row */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className="text-center"><p className="text-[22px] font-black text-zinc-900 dark:text-white">{productAnalysis.length}</p><p className="text-[11px] text-zinc-400 font-medium">productos</p></div>
                  <div className="text-center"><p className="text-[22px] font-black text-zinc-900 dark:text-white">{productAnalysis.reduce((s, p) => s + p.totalOrders, 0).toLocaleString()}</p><p className="text-[11px] text-zinc-400 font-medium">pedidos analizados</p></div>
                  <div className="text-center"><p className="text-[22px] font-black text-emerald-600">{productAnalysis.filter(p => totalScore(p) === 3).length}</p><p className="text-[11px] text-zinc-400 font-medium">héroes</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative"><Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" /><input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Buscar producto..." className="pl-8 pr-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[12px] text-zinc-700 dark:text-zinc-300 outline-none focus:border-pink-400 w-48 transition-all" /></div>
                  <button onClick={loadProductAnalysis} title="Actualizar análisis" className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"><RefreshCw className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-[11px] text-zinc-400 font-medium">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />EP: % primeras compras</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />2ª: tasa de retorno</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Vel: días a recompra</span>
              </div>

              {/* Products list */}
              <div className="space-y-2">
                {productAnalysis
                  .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                  .map(p => {
                    const score = totalScore(p);
                    const isExpanded = expandedProduct === p.name;
                    return (
                      <div key={p.name} className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
                        <div
                          className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors"
                          onClick={() => setExpandedProduct(isExpanded ? null : p.name)}
                        >
                          {/* Score dot */}
                          <div className={`w-2 h-2 rounded-full shrink-0 ${score === 3 ? 'bg-emerald-500' : score === 2 ? 'bg-blue-500' : score === 1 ? 'bg-amber-500' : 'bg-zinc-300'}`} />

                          {/* Name + orders */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-bold text-zinc-900 dark:text-white truncate">{p.name}</span>
                              <span className="text-[10px] text-zinc-400 font-medium shrink-0">{p.totalOrders} pedidos</span>
                            </div>
                          </div>

                          {/* Metric badges */}
                          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                            <ScoreBadge score={scoreEP(p.entryPointPct)} label={`EP ${p.entryPointPct}%`} />
                            <ScoreBadge score={scoreSP(p.secondPurchasePct)} label={`2ª ${p.secondPurchasePct}%`} />
                            <ScoreBadge score={scoreRD(p.repurchaseDays)} label={p.repurchaseDays > 0 ? `${p.repurchaseDays}d` : 'Sin datos'} />
                          </div>

                          {/* Total badge */}
                          <TotalBadge score={score} />

                          <ChevronRight className={`w-3.5 h-3.5 text-zinc-300 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-zinc-50 dark:border-zinc-800 space-y-4">
                            {/* Metrics grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { label: 'Entry Point', value: `${p.entryPointPct}%`, sub: `${p.firstPurchases} primeras compras`, score: scoreEP(p.entryPointPct), help: '% de veces que este producto inicia la relación con un cliente nuevo' },
                                { label: '2ª Compra', value: `${p.secondPurchasePct}%`, sub: 'clientes que volvieron', score: scoreSP(p.secondPurchasePct), help: 'De los que compraron primero este producto, cuántos volvieron a comprar' },
                                { label: 'Velocidad', value: p.repurchaseDays > 0 ? `${p.repurchaseDays} días` : '—', sub: 'promedio hasta 2ª compra', score: scoreRD(p.repurchaseDays), help: 'Días promedio entre 1ª y 2ª compra del cliente' },
                                { label: 'AOV Combinado', value: p.combinedAOV > 0 ? `$${p.combinedAOV.toFixed(0)}` : '—', sub: `Precio: $${p.avgPrice.toFixed(0)}`, score: 'neutral', help: 'Gasto total promedio del pedido que incluye este producto' },
                              ].map(m => (
                                <div key={m.label} className="bg-zinc-50 dark:bg-zinc-800/40 rounded-lg p-3">
                                  <p className="text-[10px] text-zinc-400 font-medium mb-0.5">{m.label}</p>
                                  <p className="text-[16px] font-black text-zinc-900 dark:text-white">{m.value}</p>
                                  <p className="text-[10px] text-zinc-400 mt-0.5">{m.sub}</p>
                                </div>
                              ))}
                            </div>

                            {/* Cross-sell */}
                            {p.crossSell?.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Después compran</p>
                                <div className="flex flex-wrap gap-2">
                                  {p.crossSell.map((cs: any) => (
                                    <div key={cs.name} className="flex items-center gap-1.5 bg-pink-50 dark:bg-pink-950/20 border border-pink-100 dark:border-pink-900/30 rounded-lg px-2.5 py-1.5">
                                      <ChevronRight className="w-3 h-3 text-pink-400" />
                                      <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 max-w-[180px] truncate">{cs.name}</span>
                                      <span className="text-[10px] font-bold text-pink-600 dark:text-pink-400">{cs.pct}%</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'metrics' && (
        (data || loading) ? (
          <div className="space-y-6">
            {/* Top Stats */}
            <EmailLoader loading={loading} color={PINK} labels={['Pedidos', 'Ingresos', 'Ticket Promedio']}>
              {data ? (
                <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
              <DashboardMetric 
                icon={Package}
                label="Pedidos" 
                value={data.orders?.toLocaleString('es-AR') || '0'} 
                change={prevData?.orders ? ((data.orders - prevData.orders) / prevData.orders) * 100 : undefined}
                trend={(data.orders || 0) >= (prevData?.orders || 0) ? 'up' : 'down'} 
                data={data.daily?.map((d: any) => ({ val: d.orders, date: d.date }))} 
                color={PINK} 
                loading={loading} 
                active={expandedMetric === 's-orders'} 
                onClick={() => setExpandedMetric(expandedMetric === 's-orders' ? null : 's-orders')} 
              />
              <DashboardMetric 
                icon={DollarSign}
                label="Ingresos" 
                value={`$ ${data.revenue?.toLocaleString('es-AR', { maximumFractionDigits: 0 }) || '0'}`} 
                change={prevData?.revenue ? ((data.revenue - prevData.revenue) / prevData.revenue) * 100 : undefined}
                trend={(data.revenue || 0) >= (prevData?.revenue || 0) ? 'up' : 'down'} 
                data={data.daily?.map((d: any) => ({ val: d.revenue, date: d.date }))} 
                color={PINK} 
                loading={loading} 
                active={expandedMetric === 's-revenue'} 
                onClick={() => setExpandedMetric(expandedMetric === 's-revenue' ? null : 's-revenue')} 
              />
              <DashboardMetric 
                icon={Receipt}
                label="Ticket Promedio" 
                value={`$ ${data.aov?.toLocaleString('es-AR', { maximumFractionDigits: 0 }) || '0'}`} 
                change={prevData?.aov ? ((data.aov - prevData.aov) / prevData.aov) * 100 : undefined}
                trend={(data.aov || 0) >= (prevData?.aov || 0) ? 'up' : 'down'} 
                data={data.daily?.map((d: any) => ({ val: d.aov, date: d.date }))} 
                color={PINK} 
                loading={loading} 
                active={expandedMetric === 's-aov'} 
                onClick={() => setExpandedMetric(expandedMetric === 's-aov' ? null : 's-aov')} 
              />
            </div>
              ) : null}
            </EmailLoader>
            {data && (
              <>
                {/* Expanded Chart */}
                {expandedMetric && (
              <MetricDetailChart 
                label={
                  expandedMetric === 's-orders' ? 'Pedidos' :
                  expandedMetric === 's-revenue' ? 'Ingresos' :
                  'Ticket Promedio'
                } 
                color={PINK} 
                data={data.daily?.map((d: any) => ({ 
                  val: expandedMetric === 's-orders' ? d.orders : 
                       expandedMetric === 's-revenue' ? d.revenue : d.aov, 
                  date: d.date 
                }))} 
                prevData={prevData?.daily?.map((d: any) => ({ 
                  val: expandedMetric === 's-orders' ? d.orders : 
                       expandedMetric === 's-revenue' ? d.revenue : d.aov, 
                  date: d.date 
                }))} 
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Top Products */}
              <div className="lg:col-span-2 bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] flex flex-col">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-xl bg-pink-500/10 flex items-center justify-center">
                    <Package className="w-4 h-4 text-pink-500" />
                  </div>
                  <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">Productos Top</h3>
                </div>
                <div className="space-y-4 flex-1">
                  {(data.topProducts || []).slice(0, 5).map((p: any, i: number) => {
                    const maxQty = data.topProducts[0]?.quantity || 1;
                    const pct = Math.round((p.quantity / maxQty) * 100);
                    return (
                      <div key={i} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-black text-pink-500 w-4 shrink-0">#{i+1}</span>
                            <p className="text-[12px] font-bold text-zinc-900 dark:text-white truncate" title={p.title}>{p.title}</p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-[12px] font-black text-pink-600 dark:text-pink-400">${(p.revenue ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
                            <p className="text-[10px] text-zinc-400">{p.quantity} unid.</p>
                          </div>
                        </div>
                        <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-pink-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Revenue Bar Chart */}
              <div className="lg:col-span-3 bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-pink-500/10 flex items-center justify-center">
                      <BarChart2 className="w-4 h-4 text-pink-500" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">Ingresos Diarios</h3>
                      <p className="text-[11px] text-zinc-400">Evolución del período</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold">Total</p>
                    <p className="text-[16px] font-black text-pink-600 dark:text-pink-400">
                      ${data.revenue?.toLocaleString('es-AR', { maximumFractionDigits: 0 }) || '0'}
                    </p>
                  </div>
                </div>
                <div className="flex-1 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.daily || []} barSize={6} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => { const p = v.split('-'); return `${p[2]}/${p[1]}`; }}
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        axisLine={false} tickLine={false}
                        interval={Math.floor((data.daily?.length || 1) / 6)}
                      />
                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={35}
                        tickFormatter={(v) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`}
                      />
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0];
                          return (
                            <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl">
                              <p className="text-[10px] text-zinc-400 mb-1">{d.payload.date}</p>
                              <p className="text-[13px] font-black text-pink-400">${Number(d.value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
                              <p className="text-[10px] text-zinc-400">{d.payload.orders} pedidos</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
                        {(data.daily || []).map((_: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={PINK} fillOpacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Bottom row: Fulfillment + Orders trend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Fulfillment Status */}
              <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-xl bg-pink-500/10 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-pink-500" />
                  </div>
                  <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">Estado de Envíos</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Enviados</p>
                    </div>
                    <p className="text-[26px] font-black text-emerald-700 dark:text-emerald-300">{data.fulfillmentSplit?.fulfilled || 0}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Pendientes</p>
                    </div>
                    <p className="text-[26px] font-black text-amber-700 dark:text-amber-300">{data.fulfillmentSplit?.unfulfilled || 0}</p>
                  </div>
                </div>
                {(data.fulfillmentSplit?.fulfilled || data.fulfillmentSplit?.unfulfilled) ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1.5">
                      <span>Tasa de entrega</span>
                      <span className="font-bold text-emerald-500">
                        {Math.round((data.fulfillmentSplit.fulfilled / ((data.fulfillmentSplit.fulfilled + data.fulfillmentSplit.unfulfilled) || 1)) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.round((data.fulfillmentSplit.fulfilled / ((data.fulfillmentSplit.fulfilled + data.fulfillmentSplit.unfulfilled) || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Orders trend */}
              <div className="md:col-span-2 bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-pink-500/10 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-pink-500" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-bold text-zinc-900 dark:text-white">Pedidos Diarios</h3>
                      <p className="text-[11px] text-zinc-400">Volumen de órdenes</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold">Total</p>
                    <p className="text-[16px] font-black text-pink-600 dark:text-pink-400">
                      {data.orders?.toLocaleString('es-AR') || '0'} pedidos
                    </p>
                  </div>
                </div>
                <div className="h-[140px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.daily || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ordersGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={PINK} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={PINK} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => { const p = v.split('-'); return `${p[2]}/${p[1]}`; }}
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        axisLine={false} tickLine={false}
                        interval={Math.floor((data.daily?.length || 1) / 5)}
                      />
                      <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0];
                          return (
                            <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl">
                              <p className="text-[10px] text-zinc-400 mb-1">{d.payload.date}</p>
                              <p className="text-[13px] font-black text-pink-400">{d.value} pedidos</p>
                            </div>
                          );
                        }}
                      />
                      <Area type="monotone" dataKey="orders" stroke={PINK} strokeWidth={2.5} fill="url(#ordersGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Orders Section */}
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] p-6 sm:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] print:break-inside-avoid">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4 text-pink-500" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">Últimos 20 Pedidos</h3>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Detalle de las órdenes más recientes en el período</p>
                  </div>
                </div>
              </div>

              {!data.recentOrders || data.recentOrders.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-[13px] font-bold text-zinc-550 dark:text-zinc-400">No se encontraron pedidos en este período.</p>
                </div>
              ) : (
                <div className={`overflow-x-auto transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800/80 text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                        <th className="pb-3.5 pl-4 min-w-[200px]">Cliente y Fecha</th>
                        <th className="pb-3.5 px-4 min-w-[280px]">Detalle de Productos</th>
                        <th className="pb-3.5 px-4 min-w-[180px]">Estado</th>
                        <th className="pb-3.5 pr-4 text-right min-w-[120px]">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {data.recentOrders.map((order: any) => {
                        const date = new Date(order.created_at);
                        const fmtDateStr = date.toLocaleDateString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                        // Payment Badge Styling
                        let paymentBadge = "bg-zinc-100 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200/10";
                        let paymentText = order.financial_status || 'Pendiente';
                        if (order.financial_status === 'paid') {
                          paymentBadge = "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/15";
                          paymentText = "Pagado";
                        } else if (order.financial_status === 'pending') {
                          paymentBadge = "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/15";
                          paymentText = "Pendiente";
                        } else if (order.financial_status === 'authorized') {
                          paymentBadge = "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-500/15";
                          paymentText = "Autorizado";
                        } else if (order.financial_status === 'refunded') {
                          paymentBadge = "bg-zinc-150 text-zinc-600 dark:bg-zinc-850 dark:text-zinc-550 border border-zinc-600/15";
                          paymentText = "Reembolsado";
                        }

                        // Fulfillment Badge Styling
                        let fulfillmentBadge = "bg-zinc-100 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200/10";
                        let fulfillmentText = "No enviado";
                        if (order.fulfillment_status === 'fulfilled') {
                          fulfillmentBadge = "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/15";
                          fulfillmentText = "Enviado";
                        } else if (order.fulfillment_status === 'partial') {
                          fulfillmentBadge = "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-500/15";
                          fulfillmentText = "Parcial";
                        }

                        return (
                          <tr 
                            key={order.id} 
                            onClick={() => setSelectedOrder(order)}
                            className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors text-[12.5px] font-medium text-zinc-800 dark:text-zinc-200 group cursor-pointer animate-fade-in"
                          >
                            <td className="py-4 pl-4 text-zinc-950 dark:text-white flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-pink-500/5 dark:bg-pink-500/10 text-pink-500/70 group-hover:bg-pink-500/10 group-hover:text-pink-500 transition-colors flex items-center justify-center shrink-0">
                                <ShoppingBag className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-zinc-900 dark:text-white text-[13px] truncate">
                                    {order.customer_name}
                                  </span>
                                  <span className="text-[10px] text-zinc-450 dark:text-zinc-500 font-semibold shrink-0">
                                    {order.order_number}
                                  </span>
                                </div>
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal mt-0.5">{fmtDateStr} hs</p>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="space-y-0.5">
                                {order.line_items?.map((item: any, idx: number) => (
                                  <div key={idx} className="text-[12px] text-zinc-650 dark:text-zinc-450 font-medium truncate max-w-[280px]">
                                    {item.quantity}x {item.title}
                                    {item.variant_title && <span className="text-[10px] text-zinc-450 dark:text-zinc-550 ml-1">({item.variant_title})</span>}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${paymentBadge}`}>
                                  {paymentText}
                                </span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${fulfillmentBadge}`}>
                                  {fulfillmentText}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 pr-4 text-right font-bold text-pink-600 dark:text-pink-400 text-[13.5px]">
                              $ {order.total_price?.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
              </>
            )}
          </div>
        ) : null
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
          <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-3xl max-w-[650px] w-full flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-5 h-5 text-pink-500" />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-zinc-900 dark:text-white leading-tight">
                    Pedido {selectedOrder.order_number}
                  </h3>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                    {new Date(selectedOrder.created_at).toLocaleString('es-AR', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })} hs
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)} 
                className="p-1.5 text-zinc-450 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
              
              {/* Customer & Billing section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Customer profile */}
                <div className="bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-150/40 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                  <span className="text-[10px] font-black text-pink-650 dark:text-pink-400 uppercase tracking-wider block">
                    Datos del Cliente
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-zinc-900 dark:text-white">
                      {selectedOrder.customer_name}
                    </p>
                    {selectedOrder.email && (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 font-medium truncate mt-0.5">
                        {selectedOrder.email}
                      </p>
                    )}
                    {selectedOrder.phone && (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                        {selectedOrder.phone}
                      </p>
                    )}
                  </div>
                  {selectedOrder.customer && (
                    <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] font-medium text-zinc-450 dark:text-zinc-550">
                      <span>Historial: <strong className="text-zinc-750 dark:text-zinc-300">{selectedOrder.customer.orders_count} pedidos</strong></span>
                      <span>Total: <strong className="text-zinc-750 dark:text-zinc-300">${selectedOrder.customer.total_spent?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</strong></span>
                    </div>
                  )}
                </div>

                {/* Address */}
                <div className="bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-150/40 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                  <span className="text-[10px] font-black text-pink-650 dark:text-pink-400 uppercase tracking-wider block">
                    Dirección de Envío
                  </span>
                  {selectedOrder.shipping_address ? (
                    <div className="text-[12px] text-zinc-650 dark:text-zinc-400 leading-relaxed font-medium">
                      <p className="font-bold text-zinc-850 dark:text-zinc-200">
                        {selectedOrder.shipping_address.name || `${selectedOrder.shipping_address.first_name || ''} ${selectedOrder.shipping_address.last_name || ''}`}
                      </p>
                      <p>{selectedOrder.shipping_address.address1}</p>
                      {selectedOrder.shipping_address.address2 && <p>{selectedOrder.shipping_address.address2}</p>}
                      <p>
                        {selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.province_code || selectedOrder.shipping_address.province || ''}
                      </p>
                      <p>
                        {selectedOrder.shipping_address.zip} • {selectedOrder.shipping_address.country}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12.5px] text-zinc-400 font-medium italic">Envío no físico o retiro en tienda.</p>
                  )}
                </div>

              </div>

              {/* Status block */}
              <div className="flex gap-4">
                <div className="flex-1 p-3 rounded-xl border border-zinc-150/60 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-900/10 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-450 dark:text-zinc-550">Estado de Pago</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    selectedOrder.financial_status === 'paid'
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/15"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/15"
                  }`}>
                    {selectedOrder.financial_status === 'paid' ? 'Pagado' : 'Pendiente'}
                  </span>
                </div>
                <div className="flex-1 p-3 rounded-xl border border-zinc-150/60 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-900/10 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-zinc-450 dark:text-zinc-550">Estado de Envío</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    selectedOrder.fulfillment_status === 'fulfilled'
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/15"
                      : "bg-zinc-100 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-450 border border-zinc-200/10"
                  }`}>
                    {selectedOrder.fulfillment_status === 'fulfilled' ? 'Enviado' : 'No enviado'}
                  </span>
                </div>
              </div>

              {/* Line items list */}
              <div className="space-y-3">
                <span className="text-[10px] font-black text-pink-650 dark:text-pink-400 uppercase tracking-wider block">
                  Productos Solicitados
                </span>
                <div className="border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-850">
                  {selectedOrder.line_items?.map((item: any, idx: number) => (
                    <div key={idx} className="p-4 flex items-center justify-between text-[13px] font-medium text-zinc-700 dark:text-zinc-350">
                      <div className="min-w-0 pr-3">
                        <p className="font-bold text-zinc-900 dark:text-white truncate">
                          {item.title}
                        </p>
                        {item.variant_title && (
                          <p className="text-[10.5px] text-zinc-450 dark:text-zinc-500 mt-0.5">
                            Variante: {item.variant_title}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-zinc-900 dark:text-white">
                          ${(item.price * item.quantity).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[10.5px] text-zinc-400 mt-0.5">
                          {item.quantity} x ${item.price?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing Breakdown */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-[12px] font-medium text-zinc-500">
                  <span>Subtotal</span>
                  <span>${selectedOrder.subtotal_price?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                </div>
                {selectedOrder.total_discounts > 0 && (
                  <div className="flex items-center justify-between text-[12px] font-medium text-emerald-500">
                    <span className="flex items-center gap-1.5">
                      <span>Descuentos</span>
                      {selectedOrder.discount_codes && selectedOrder.discount_codes.length > 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                          Cupón: {selectedOrder.discount_codes.map((d: any) => d.code).join(', ')}
                        </span>
                      )}
                    </span>
                    <span>-${selectedOrder.total_discounts?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                  </div>
                )}
                {selectedOrder.shipping_lines?.map((sl: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-[12px] font-medium text-zinc-500">
                    <span>Envío ({sl.title})</span>
                    <span>${sl.price?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
                {selectedOrder.total_tax > 0 && (
                  <div className="flex items-center justify-between text-[12px] font-medium text-zinc-500">
                    <span>Impuestos</span>
                    <span>${selectedOrder.total_tax?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[15px] font-bold text-zinc-900 dark:text-white pt-2 border-t border-dashed border-zinc-100 dark:border-zinc-850">
                  <span>Total Facturado</span>
                  <span className="text-[18px] text-pink-600 dark:text-pink-400 font-black">
                    ${selectedOrder.total_price?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
      <style>{`@media print { body { background: white !important; } .print\\:hidden { display: none !important; } @page { margin: 1cm; size: A4; } }`}</style>
    </div>
  );
}


