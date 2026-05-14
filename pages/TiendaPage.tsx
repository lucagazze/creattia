import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { ShoppingBag, DollarSign, Package, Calendar, ChevronDown, Receipt, Tag, TrendingUp, CheckCircle, Clock, BarChart2 } from 'lucide-react';
import { ecommerce } from '../services/ecommerce';
import { getPrevPeriod, today, daysAgo, presetToRange } from '../services/metaAds';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import KlaviyoLoader from '../components/ui/KlaviyoLoader';

const PINK = '#ec4899';

export default function TiendaPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const [data, setData] = useState<any>(null);
  const [prevData, setPrevData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMetric, setExpandedMetric] = useState<string | null>('s-revenue');

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
    const fetchData = async () => {
      const p: any = profile;
      if (!p || !p.ecommerce_platform || !p.shopify_domain || !p.shopify_access_token) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      const range = activePreset === 'custom' ? { since: activeSince, until: activeUntil } : presetToRange(activePreset);
      const prevRange = getPrevPeriod(range.since, range.until);
      try {
        const [res, prevRes] = await Promise.all([
          ecommerce.getDashboardData(p.ecommerce_platform, p.shopify_domain, p.shopify_access_token, range.since, range.until),
          ecommerce.getDashboardData(p.ecommerce_platform, p.shopify_domain, p.shopify_access_token, prevRange.since, prevRange.until)
        ]);
        setData(res);
        setPrevData(prevRes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [profile, activePreset, activeSince, activeUntil, refreshKey]);

  const handleApply = () => { 
    setActivePreset(pendingPreset); setActiveSince(pendingSince); setActiveUntil(pendingUntil); setRefreshKey(prev => prev + 1); setShowDatePicker(false); 
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
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => <div key={d} className="text-[10px] font-bold text-zinc-300 text-center pb-2 uppercase tracking-tighter">{d}</div>)}
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
    <div className="max-w-[1600px] mx-auto animate-fade-in pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
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
                    ? `${fmtDateRange(activeSince)} - ${fmtDateRange(activeUntil)}` 
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

      {loading ? (
        <KlaviyoLoader loading={loading} color={PINK} labels={['Pedidos', 'Ingresos', 'Ticket Promedio']} />
      ) : data ? (
          <div className="space-y-6">
            {/* Top Stats */}
            <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
              <DashboardMetric 
                icon={Package}
                label="Pedidos" 
                value={data.orders?.toLocaleString('es-AR') || '0'} 
                change={prevData?.orders ? ((data.orders - prevData.orders) / prevData.orders) * 100 : 0} 
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
                change={prevData?.revenue ? ((data.revenue - prevData.revenue) / prevData.revenue) * 100 : 0} 
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
                change={prevData?.aov ? ((data.aov - prevData.aov) / prevData.aov) * 100 : 0} 
                trend={(data.aov || 0) >= (prevData?.aov || 0) ? 'up' : 'down'} 
                data={data.daily?.map((d: any) => ({ val: d.aov, date: d.date }))} 
                color={PINK} 
                loading={loading} 
                active={expandedMetric === 's-aov'} 
                onClick={() => setExpandedMetric(expandedMetric === 's-aov' ? null : 's-aov')} 
              />
            </div>
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
                            <p className="text-[12px] font-black text-pink-600 dark:text-pink-400">${p.revenue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
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
          </div>
        </div>
        ) : null}
    </div>
  );
}


