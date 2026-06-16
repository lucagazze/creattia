import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useTheme } from '../contexts/ThemeContext';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';

import { ShoppingBag, DollarSign, Package, Calendar, ChevronDown, Receipt, Tag, TrendingUp, CheckCircle, Clock, BarChart2, Download, X, Search, AlertCircle, XCircle, Loader2, RefreshCw, Users, ChevronRight, MapPin, Building } from 'lucide-react';
import { ecommerce } from '../services/ecommerce';
import { getPrevPeriod, today, daysAgo, presetToRange } from '../services/metaAds';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import EmailLoader from '../components/ui/EmailLoader';

const PINK = '#ec4899';

const fmtCurr = (n: number) => {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
  for (let i = 1; i <= lastDay; i++) {
    const d = new Date(year, month, i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const todayStr = today();

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
  const { darkMode } = useTheme();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  
  const detectedPlatform = useMemo(() => {
    let platform = (profile as any)?.ecommerce_platform;
    if (profile && !platform) {
      if ((profile as any).shopify_domain && (profile as any).shopify_access_token) {
        platform = 'shopify';
      } else if ((profile as any).wordpress_url && (profile as any).woo_consumer_key && (profile as any).woo_consumer_secret) {
        platform = 'wordpress';
      } else if ((profile as any).tiendanube_store_id && (profile as any).tiendanube_access_token) {
        platform = 'tiendanube';
      }
    }
    return platform || null;
  }, [profile]);

  const [data, setData] = useState<any>(null);
  const [prevData, setPrevData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const isDateReloading = loading && !!data;
  const [expandedMetric, setExpandedMetric] = useState<string | null>('s-revenue');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const [prevProfileId, setPrevProfileId] = useState(profile?.id);
  if (profile?.id !== prevProfileId) {
    setPrevProfileId(profile?.id);
    setData(null);
    setPrevData(null);
    setLoading(true);
  }

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
      const hasStoreConfig = detectedPlatform && (
        (detectedPlatform === 'shopify' && p.shopify_domain && p.shopify_access_token) ||
        (detectedPlatform === 'wordpress' && p.wordpress_url && p.woo_consumer_key && p.woo_consumer_secret) ||
        (detectedPlatform === 'tiendanube' && p.tiendanube_store_id && p.tiendanube_access_token)
      );
      if (!hasStoreConfig) {
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) { setLoading(true); setFetchError(null); }
      const range = activePreset === 'custom' ? { since: activeSince, until: activeUntil } : presetToRange(activePreset);
      const prevRange = getPrevPeriod(range.since, range.until);
      try {
        const [res, prevRes] = await Promise.all([
          ecommerce.getDashboardData(detectedPlatform, p.shopify_domain, p.shopify_access_token, range.since, range.until, p.id),
          ecommerce.getDashboardData(detectedPlatform, p.shopify_domain, p.shopify_access_token, prevRange.since, prevRange.until, p.id)
        ]);
        if (cancelled) return;
        setData(res);
        setPrevData(prevRes);
      } catch (err: any) {
        console.error(err);
        if (!cancelled) setFetchError(err?.message || 'No se pudo cargar la información de tu tienda.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(fetchData, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [profile?.id, activePreset, activeSince, activeUntil, refreshKey]);

  useEffect(() => {
    setData(null);
    setPrevData(null);
  }, [profile?.id]);

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

  const p: any = profile;
  const hasStoreConfig = detectedPlatform && (
    (detectedPlatform === 'shopify' && p.shopify_domain && p.shopify_access_token) ||
    (detectedPlatform === 'wordpress' && p.wordpress_url && p.woo_consumer_key && p.woo_consumer_secret) ||
    (detectedPlatform === 'tiendanube' && p.tiendanube_store_id && p.tiendanube_access_token)
  );

  if (!hasStoreConfig) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in px-4">
        <div className="w-16 h-16 bg-pink-100 dark:bg-pink-500/10 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="w-8 h-8 text-pink-600 dark:text-pink-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Tienda no configurada</h2>
        <p className="text-[15px] text-zinc-500 max-w-md text-center leading-relaxed">
          Para ver las métricas de tu e-commerce, necesitas conectar tu tienda Shopify, WooCommerce o Tiendanube desde el panel de administración.
        </p>
      </div>
    );
  }

  return (
    <CenteredPageLoader isLoading={false}>

    <div className="w-full animate-fade-in pb-20 pt-4 md:pt-6">
      {/* Header */}
      <div className="page-header print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 flex items-center justify-center overflow-hidden shrink-0">
              {detectedPlatform === 'shopify' ? (
                <img src="/assets/shopify-bag.webp" alt="Shopify" className="w-8 h-8 object-contain" />
              ) : detectedPlatform === 'tiendanube' ? (
                <img src={darkMode ? "/assets/tiendanube.webp" : "/assets/tiendanubeoscuro.png"} alt="Tiendanube" className="w-8 h-8 object-contain" />
              ) : detectedPlatform === 'wordpress' ? (
                <img src="/assets/logowordpress.webp" alt="WooCommerce" className="w-8 h-8 object-contain" />
              ) : (
                <ShoppingBag className="w-6 h-6 text-zinc-550 dark:text-zinc-400" />
              )}
            </div>
            <h1 className="page-title">Rendimiento de Tienda</h1>
          </div>
          <p className="page-subtitle">Métricas principales de tu e-commerce ({detectedPlatform}).</p>
        </div>

        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1 py-0.5 md:py-1 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] h-9 md:h-10 relative" ref={datePickerRef}>
              <button 
                onClick={() => setShowDatePicker(!showDatePicker)} 
                className="flex items-center gap-1.5 px-3 h-7 md:h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group text-[11px] md:text-[12.5px]"
              >
                {loading && data ? (
                  <Loader2 className="w-4 h-4 text-pink-500 animate-spin" />
                ) : (
                  <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-pink-500 transition-colors" />
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
                      <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }} className={`flex-shrink-0 text-center md:text-left px-2.5 py-1 md:px-3 md:py-1.5 rounded-[10px] text-[12px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-pink-600 text-white shadow-md shadow-pink-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
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
        <p className="text-[13px] text-zinc-500 font-medium">Tienda Online — {detectedPlatform}</p>
        <p className="text-[15px] font-bold text-zinc-900">Período: {fmtDateRange(activeSince, true)} — {fmtDateRange(activeUntil, true)}</p>
      </div>


      <div>
      {(data || loading) ? (
          <div className="space-y-6">
            {/* Top Stats */}
            <EmailLoader loading={loading} color={PINK} labels={['Pedidos', 'Ingresos', 'Ticket Promedio']} duration={500}>
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
                info="Cantidad total de órdenes procesadas y confirmadas en tu tienda Shopify durante el período seleccionado."
              />
              <DashboardMetric 
                icon={DollarSign}
                label="Ingresos" 
                value={fmtCurr(data.revenue || 0)} 
                change={prevData?.revenue ? ((data.revenue - prevData.revenue) / prevData.revenue) * 100 : undefined}
                trend={(data.revenue || 0) >= (prevData?.revenue || 0) ? 'up' : 'down'} 
                data={data.daily?.map((d: any) => ({ val: d.revenue, date: d.date }))} 
                color={PINK} 
                loading={loading} 
                active={expandedMetric === 's-revenue'} 
                onClick={() => setExpandedMetric(expandedMetric === 's-revenue' ? null : 's-revenue')} 
                info="Suma total facturada por ventas brutas en tu tienda Shopify en el período seleccionado."
              />
              <DashboardMetric 
                icon={Receipt}
                label="Ticket Promedio" 
                value={fmtCurr(data.aov || 0)} 
                change={prevData?.aov ? ((data.aov - prevData.aov) / prevData.aov) * 100 : undefined}
                trend={(data.aov || 0) >= (prevData?.aov || 0) ? 'up' : 'down'} 
                data={data.daily?.map((d: any) => ({ val: d.aov, date: d.date }))} 
                color={PINK} 
                loading={loading} 
                active={expandedMetric === 's-aov'} 
                onClick={() => setExpandedMetric(expandedMetric === 's-aov' ? null : 's-aov')} 
                info="El valor promedio gastado en cada pedido. Se calcula dividiendo los ingresos totales por la cantidad de pedidos."
              />
            </div>
              ) : null}
            </EmailLoader>
            <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
            {data && (
              <>
                {/* Expanded Chart */}
                {expandedMetric && !loading && (
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

            {/* Customer Split Analysis */}
            {data.customerSplit && (
              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <h3 className="text-[13px] font-black text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-pink-500" />
                  Tipo de Clientes
                </h3>
                {(() => {
                  const totalSplit = (data.customerSplit.new || 0) + (data.customerSplit.returning || 0);
                  const newPct = totalSplit > 0 ? ((data.customerSplit.new || 0) / totalSplit) * 100 : 0;
                  const retPct = totalSplit > 0 ? ((data.customerSplit.returning || 0) / totalSplit) * 100 : 0;
                  return (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div>
                          <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Tasa de Recompra</p>
                          <p className="text-[28px] font-black text-zinc-900 dark:text-white mt-1 leading-none">
                            {data.customerSplit.returningRate?.toFixed(1)}%
                          </p>
                        </div>
                        <div className="flex gap-6">
                          <div>
                            <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Nuevos</p>
                            <p className="text-[16px] font-black text-zinc-700 dark:text-zinc-350 mt-1 leading-none">
                              {data.customerSplit.new}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Recurrentes</p>
                            <p className="text-[16px] font-black text-zinc-700 dark:text-zinc-350 mt-1 leading-none">
                              {data.customerSplit.returning}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Stacked progress bar */}
                      <div className="w-full h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex">
                        <div style={{ width: `${newPct}%` }} className="h-full bg-pink-500 transition-all duration-500" title={`Nuevos: ${newPct.toFixed(1)}%`} />
                        <div style={{ width: `${retPct}%` }} className="h-full bg-indigo-500 transition-all duration-500" title={`Recurrentes: ${retPct.toFixed(1)}%`} />
                      </div>

                      {/* Legend */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[11px] font-bold text-zinc-500 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-pink-500 shrink-0" />
                          <span>Clientes Nuevos: <strong className="text-zinc-800 dark:text-zinc-200">{newPct.toFixed(0)}%</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                          <span>Clientes Recurrentes: <strong className="text-zinc-800 dark:text-zinc-200">{retPct.toFixed(0)}%</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Geographic Breakdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Provinces Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <h3 className="text-[13px] font-black text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-pink-500" />
                  Provincias con más Ventas
                </h3>
                {data.topProvinces && data.topProvinces.length > 0 ? (
                  <div className="space-y-3">
                    {data.topProvinces.map((prov: any, idx: number) => {
                      const maxCount = data.topProvinces[0]?.count || 1;
                      const pct = (prov.count / maxCount) * 100;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-[11.5px] font-bold text-zinc-700 dark:text-zinc-300">
                            <span className="truncate pr-2">{prov.name}</span>
                            <span className="shrink-0 text-zinc-500">{prov.count} {prov.count === 1 ? 'pedido' : 'pedidos'}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800/60 overflow-hidden">
                            <div style={{ width: `${pct}%` }} className="h-full bg-pink-500/80 rounded-full" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-zinc-450 dark:text-zinc-500 italic py-4 text-center">No hay datos geográficos disponibles</p>
                )}
              </div>

              {/* Cities Card */}
              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <h3 className="text-[13px] font-black text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Building className="w-4 h-4 text-pink-500" />
                  Ciudades Destacadas
                </h3>
                {data.topCities && data.topCities.length > 0 ? (
                  <div className="space-y-3">
                    {data.topCities.map((city: any, idx: number) => {
                      const maxCount = data.topCities[0]?.count || 1;
                      const pct = (city.count / maxCount) * 100;
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-[11.5px] font-bold text-zinc-700 dark:text-zinc-300">
                            <span className="truncate pr-2">{city.name}</span>
                            <span className="shrink-0 text-zinc-500">{city.count} {city.count === 1 ? 'pedido' : 'pedidos'}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800/60 overflow-hidden">
                            <div style={{ width: `${pct}%` }} className="h-full bg-indigo-500/85 rounded-full" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-zinc-450 dark:text-zinc-500 italic py-4 text-center">No hay datos de ciudades disponibles</p>
                )}
              </div>
            </div>




              </>
            )}
            </div>
          </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center"><AlertCircle className="w-7 h-7 text-red-500" /></div>
          <p className="text-[15px] font-semibold text-red-600 dark:text-red-400">No se pudieron cargar los datos de la tienda</p>
          <p className="text-[13px] text-zinc-400 max-w-md">{fetchError}</p>
          <button onClick={() => setRefreshKey(k => k + 1)} className="mt-2 px-4 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-black shadow-sm hover:opacity-90 transition-all">Reintentar</button>
        </div>
      ) : null}


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
                      <p className="font-bold text-zinc-800 dark:text-zinc-200">
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
                <div className="flex-1 p-3 rounded-xl border border-zinc-150/60 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-900/10 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-zinc-450 dark:text-zinc-550">Estado de Envío</span>
                  {(() => {
                    const isLocalPickup = (selectedOrder.shipping_lines || []).some((sl: any) => {
                      const title = (sl.title || '').toLowerCase();
                      return title.includes('retiro') || title.includes('local') || title.includes('pick') || title.includes('sucursal') || title.includes('showroom') || title.includes('tienda');
                    });
                    const isFulfilled = selectedOrder.fulfillment_status === 'fulfilled';
                    const isPartial = selectedOrder.fulfillment_status === 'partial';
                    const badgeCls = isFulfilled
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/15"
                      : isPartial
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-500/15"
                        : isLocalPickup
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-500/15"
                          : "bg-zinc-100 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-450 border border-zinc-200/10";
                    const label = isFulfilled
                      ? 'Enviado'
                      : isPartial
                        ? 'Parcial'
                        : isLocalPickup
                          ? 'Listo para retiro'
                          : 'No enviado';
                    return (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeCls}`}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Line items list */}
              <div className="space-y-3">
                <span className="text-[10px] font-black text-pink-650 dark:text-pink-400 uppercase tracking-wider block">
                  Productos Solicitados
                </span>
                <div className="border border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
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
                <div className="flex items-center justify-between text-[15px] font-bold text-zinc-900 dark:text-white pt-2 border-t border-dashed border-zinc-100 dark:border-zinc-800">
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
      </div>
      <style>{`@media print { body { background: white !important; } .print\\:hidden { display: none !important; } @page { margin: 1cm; size: A4; } }`}</style>
    </div>
    </CenteredPageLoader>

  );
}


