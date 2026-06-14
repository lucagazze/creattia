import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import { useToast } from '../components/Toast';
import { 
  ShoppingBag, DollarSign, Package, Calendar, ChevronDown, 
  Receipt, HelpCircle, BarChart2, Search, AlertCircle, 
  Loader2, MessageCircle, Send, CheckCircle2, ArrowRight 
} from 'lucide-react';
import { getPrevPeriod, today, daysAgo, presetToRange } from '../services/metaAds';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import EmailLoader from '../components/ui/EmailLoader';

const YELLOW = '#ffe600';
const ML_BLUE = '#3483fa';
const PINK = '#ec4899';

const fmtCurr = (n: number) => {
  if (typeof n !== 'number') return '—';
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
};

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
        <div className="w-8 flex justify-start">
          {onPrev && (
            <button onClick={onPrev} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group">
              <ChevronDown className="w-4 h-4 rotate-90 text-zinc-400 group-hover:text-zinc-650 dark:group-hover:text-zinc-200" />
            </button>
          )}
        </div>
        <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 text-center">
          {MONTHS_ES[month]} {year}
        </span>
        <div className="w-8 flex justify-end">
          {onNext && (
            <button onClick={onNext} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors group">
              <ChevronDown className="w-4 h-4 -rotate-90 text-zinc-400 group-hover:text-zinc-650 dark:group-hover:text-zinc-200" />
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
                isSelected ? 'bg-[#3483fa] text-white rounded-full z-10 shadow-md shadow-blue-200 dark:shadow-none' : 
                (isInRange || isHovering) ? 'bg-blue-50 dark:bg-blue-500/10 text-[#3483fa]' : 
                isFuture ? 'text-zinc-200 dark:text-zinc-800 cursor-default' : 
                'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full'
              } ${isToday && !isSelected ? 'text-[#3483fa] dark:text-[#3483fa] ring-1 ring-blue-100 dark:ring-blue-900/30' : ''}`}
            >
              {d.split('-')[2]}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default function MercadoLibrePage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [expandedMetric, setExpandedMetric] = useState<string | null>('ml-revenue');
  const [searchTerm, setSearchTerm] = useState('');

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

  const [questions, setQuestions] = useState<any[]>([]);
  const [publications, setPublications] = useState<any[]>([]);
  const [mlData, setMlData] = useState<any>({
    current: { revenue: 0, orders: 0, aov: 0, daily: [] },
    previous: { revenue: 0, orders: 0, aov: 0, daily: [] }
  });

  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingPublications, setLoadingPublications] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState<Record<string, boolean>>({});

  const filteredPubs = useMemo(() => {
    return publications.filter(p => p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.id.includes(searchTerm));
  }, [publications, searchTerm]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isConnected = (profile as any)?.connection_statuses?.mercadolibre === 'ok';

  // Load questions and publications
  useEffect(() => {
    if (!isConnected || !profile?.id) {
      setQuestions([
        {
          id: 'q1',
          buyer: 'MARIANO_G',
          date: 'Hace 10 min',
          text: 'Hola, ¿tenés stock en color negro para envío inmediato?',
          itemTitle: 'Smartphone Samsung Galaxy S23 Ultra 256GB',
          itemId: 'MLA139284210',
          itemImage: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=150&q=80',
          answerText: ''
        },
        {
          id: 'q2',
          buyer: 'VALE_RODRIGUEZ',
          date: 'Hace 45 min',
          text: '¿Es compatible con carga inalámbrica rápida?',
          itemTitle: 'Auriculares Inalámbricos Pro Noise Cancelling',
          itemId: 'MLA140291931',
          itemImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=150&q=80',
          answerText: ''
        },
        {
          id: 'q3',
          buyer: 'KOF_GAMING',
          date: 'Hace 2 horas',
          text: 'Buenas, si compro hoy, ¿me llega antes del sábado a Lanús?',
          itemTitle: 'Zapatillas Deportivas Running Speed Pro',
          itemId: 'MLA132948210',
          itemImage: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=150&q=80',
          answerText: ''
        }
      ]);
      setPublications([
        {
          id: 'MLA139284210',
          title: 'Smartphone Samsung Galaxy S23 Ultra 256GB',
          price: 1349000,
          stock: 15,
          sold: 148,
          visits: 3420,
          status: 'active',
          image: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=150&q=80'
        },
        {
          id: 'MLA140291931',
          title: 'Auriculares Inalámbricos Pro Noise Cancelling',
          price: 189000,
          stock: 45,
          sold: 320,
          visits: 5410,
          status: 'active',
          image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=150&q=80'
        },
        {
          id: 'MLA132948210',
          title: 'Zapatillas Deportivas Running Speed Pro',
          price: 125000,
          stock: 8,
          sold: 84,
          visits: 1240,
          status: 'active',
          image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=150&q=80'
        },
        {
          id: 'MLA148201948',
          title: 'Silla de Escritorio Ergonómica Regulable Premium',
          price: 345000,
          stock: 22,
          sold: 62,
          visits: 1840,
          status: 'active',
          image: 'https://images.unsplash.com/photo-1505797149-43b0069ec26b?auto=format&fit=crop&w=150&q=80'
        },
        {
          id: 'MLA141029482',
          title: 'Smartwatch Deportivo GPS Monitor Cardíaco Black',
          price: 260000,
          stock: 0,
          sold: 195,
          visits: 4230,
          status: 'paused',
          image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'
        }
      ]);
      return;
    }

    setLoadingQuestions(true);
    fetch(`/api/oauth?action=mercadolibre-questions&clientId=${encodeURIComponent(profile.id)}`)
      .then(res => res.json())
      .then(data => {
        if (data.questions) setQuestions(data.questions);
      })
      .catch(err => console.error('Error fetching ML questions:', err))
      .finally(() => setLoadingQuestions(false));

    setLoadingPublications(true);
    fetch(`/api/oauth?action=mercadolibre-publications&clientId=${encodeURIComponent(profile.id)}`)
      .then(res => res.json())
      .then(data => {
        if (data.publications) setPublications(data.publications);
      })
      .catch(err => console.error('Error fetching ML publications:', err))
      .finally(() => setLoadingPublications(false));
  }, [isConnected, profile?.id, refreshKey]);

  // Load metrics
  useEffect(() => {
    const range = activePreset === 'custom' ? { since: activeSince, until: activeUntil } : presetToRange(activePreset);
    const prevRange = getPrevPeriod(range.since, range.until);

    if (!isConnected || !profile?.id) {
      setLoading(true);
      const generateForRange = (since: string, until: string) => {
        const start = new Date(since);
        const end = new Date(until);
        const days = [];
        let current = new Date(start);
        let totalRevenue = 0;
        let totalOrders = 0;

        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];
          let hash = 0;
          for (let i = 0; i < dateStr.length; i++) {
            hash = dateStr.charCodeAt(i) + ((hash << 5) - hash);
          }
          const seed = Math.abs(hash) % 100;
          const orders = Math.floor(seed / 12) + 1;
          const revenue = orders * (18000 + (seed % 8) * 1500);
          
          days.push({
            date: dateStr,
            orders,
            revenue,
            aov: revenue / orders
          });

          totalRevenue += revenue;
          totalOrders += orders;
          current.setDate(current.getDate() + 1);
        }

        return {
          revenue: totalRevenue,
          orders: totalOrders,
          aov: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          daily: days
        };
      };

      const current = generateForRange(range.since, range.until);
      const previous = generateForRange(prevRange.since, prevRange.until);
      
      setMlData({ current, previous });
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      fetch(`/api/oauth?action=mercadolibre-orders&clientId=${encodeURIComponent(profile.id)}&since=${range.since}&until=${range.until}`).then(res => res.json()),
      fetch(`/api/oauth?action=mercadolibre-orders&clientId=${encodeURIComponent(profile.id)}&since=${prevRange.since}&until=${prevRange.until}`).then(res => res.json())
    ])
      .then(([curr, prev]) => {
        setMlData({
          current: curr.error ? { revenue: 0, orders: 0, aov: 0, daily: [] } : curr,
          previous: prev.error ? { revenue: 0, orders: 0, aov: 0, daily: [] } : prev
        });
      })
      .catch(err => console.error('Error fetching ML metrics:', err))
      .finally(() => setLoading(false));

  }, [isConnected, profile?.id, activePreset, activeSince, activeUntil, refreshKey]);

  const handleApply = () => {
    setActivePreset(pendingPreset); 
    setActiveSince(pendingSince); 
    setActiveUntil(pendingUntil || pendingSince); 
    setRefreshKey(prev => prev + 1); 
    setShowDatePicker(false);
  };

  const handleAnswerSubmit = async (qId: string) => {
    const question = questions.find(q => q.id === qId);
    if (!question?.answerText.trim()) {
      showToast('Por favor, ingresá una respuesta antes de enviar.', 'warning');
      return;
    }

    if (!isConnected || !profile?.id) {
      showToast('Respuesta enviada a Mercado Libre con éxito. ✓', 'success');
      setQuestions(prev => prev.filter(q => q.id !== qId));
      return;
    }

    setSubmittingAnswer(prev => ({ ...prev, [qId]: true }));
    try {
      const res = await fetch('/api/oauth?action=mercadolibre-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: profile.id,
          questionId: qId,
          text: question.answerText.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al enviar respuesta');
      }

      showToast('Respuesta enviada a Mercado Libre con éxito. ✓', 'success');
      setQuestions(prev => prev.filter(q => q.id !== qId));
    } catch (err: any) {
      showToast(err.message || 'Error al enviar respuesta', 'error');
    } finally {
      setSubmittingAnswer(prev => ({ ...prev, [qId]: false }));
    }
  };

  const handleAnswerTextChange = (qId: string, text: string) => {
    setQuestions(prev => prev.map(q => q.id === qId ? { ...q, answerText: text } : q));
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


  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in px-4">
        <div className="w-16 h-16 bg-[#ffe600]/10 border border-[#ffe600]/30 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <ShoppingBag className="w-8 h-8 text-[#2d3277]" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">Mercado Libre no conectado</h2>
        <p className="text-[15px] text-zinc-500 max-w-md text-center leading-relaxed">
          Para ver tus métricas de Mercado Libre, necesitas conectar tu cuenta desde la sección de Integraciones.
        </p>
      </div>
    );
  }

  const { current, previous } = mlData;

  return (
    <CenteredPageLoader isLoading={false}>
      <div className="w-full animate-fade-in pb-20 pt-4 md:pt-6">
        {/* Header */}
        <div className="page-header print:hidden">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 flex items-center justify-center overflow-hidden shrink-0 bg-[#ffe600] rounded-xl p-1 shadow-sm">
                <img src="/assets/logomercadolibre.png" alt="Mercado Libre" className="w-8 h-8 object-contain" />
              </div>
              <h1 className="page-title">Mercado Libre</h1>
            </div>
            <p className="page-subtitle">Monitoreá las ventas, stock y consultas de tu cuenta del marketplace.</p>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-3 print:hidden">
            <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1 py-0.5 md:py-1 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] h-9 md:h-10 relative" ref={datePickerRef}>
              <button 
                onClick={() => setShowDatePicker(!showDatePicker)} 
                className="flex items-center gap-1.5 px-3 h-7 md:h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group text-[11px] md:text-[12.5px]"
              >
                {loading && current ? (
                  <Loader2 className="w-4 h-4 text-[#3483fa] animate-spin" />
                ) : (
                  <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-[#3483fa] transition-colors" />
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
                      <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }} className={`flex-shrink-0 text-center md:text-left px-2.5 py-1 md:px-3 md:py-1.5 rounded-[10px] text-[12px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-[#3483fa] text-white shadow-md shadow-blue-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
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

        {/* Metrics Overview */}
        {(current || loading) ? (
          <div className="space-y-6">
            <EmailLoader loading={loading} color={ML_BLUE} labels={['Ventas', 'Ingresos', 'Ticket Promedio']} duration={400}>
              {current ? (
                <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                  <DashboardMetric 
                    icon={Package}
                    label="Ventas" 
                    value={current.orders?.toLocaleString('es-AR') || '0'} 
                    change={previous?.orders ? ((current.orders - previous.orders) / previous.orders) * 100 : undefined}
                    trend={(current.orders || 0) >= (previous?.orders || 0) ? 'up' : 'down'} 
                    data={current.daily?.map((d: any) => ({ val: d.orders, date: d.date }))} 
                    color={ML_BLUE} 
                    loading={loading} 
                    active={expandedMetric === 'ml-orders'} 
                    onClick={() => setExpandedMetric(expandedMetric === 'ml-orders' ? null : 'ml-orders')} 
                    info="Cantidad total de órdenes concretadas en tu cuenta de Mercado Libre durante el período seleccionado."
                  />
                  <DashboardMetric 
                    icon={DollarSign}
                    label="Ingresos" 
                    value={fmtCurr(current.revenue || 0)} 
                    change={previous?.revenue ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : undefined}
                    trend={(current.revenue || 0) >= (previous?.revenue || 0) ? 'up' : 'down'} 
                    data={current.daily?.map((d: any) => ({ val: d.revenue, date: d.date }))} 
                    color={ML_BLUE} 
                    loading={loading} 
                    active={expandedMetric === 'ml-revenue'} 
                    onClick={() => setExpandedMetric(expandedMetric === 'ml-revenue' ? null : 'ml-revenue')} 
                    info="Ingreso bruto total facturado por las publicaciones asociadas en Mercado Libre antes de comisiones del sitio."
                  />
                  <DashboardMetric 
                    icon={Receipt}
                    label="Ticket Promedio" 
                    value={fmtCurr(current.aov || 0)} 
                    change={previous?.aov ? ((current.aov - previous.aov) / previous.aov) * 100 : undefined}
                    trend={(current.aov || 0) >= (previous?.aov || 0) ? 'up' : 'down'} 
                    data={current.daily?.map((d: any) => ({ val: d.aov, date: d.date }))} 
                    color={ML_BLUE} 
                    loading={loading} 
                    active={expandedMetric === 'ml-aov'} 
                    onClick={() => setExpandedMetric(expandedMetric === 'ml-aov' ? null : 'ml-aov')} 
                    info="El ticket promedio gastado por tus compradores. Se obtiene dividiendo los ingresos totales por la cantidad de ventas."
                  />
                  <DashboardMetric 
                    icon={MessageCircle}
                    label="Preguntas Activas" 
                    value={questions.length.toString()} 
                    change={undefined}
                    trend="up" 
                    data={undefined} 
                    color="#f59e0b" 
                    loading={loading} 
                    active={expandedMetric === 'ml-questions'} 
                    onClick={() => setExpandedMetric(expandedMetric === 'ml-questions' ? null : 'ml-questions')} 
                    info="Cantidad de consultas de clientes pendientes de respuesta en Mercado Libre."
                  />
                </div>
              ) : null}
            </EmailLoader>

            {/* Recharts expanded chart */}
            <div className={`transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
              {current && expandedMetric && expandedMetric !== 'ml-questions' && !loading && (
                <MetricDetailChart 
                  label={
                    expandedMetric === 'ml-orders' ? 'Ventas' :
                    expandedMetric === 'ml-revenue' ? 'Ingresos' :
                    'Ticket Promedio'
                  } 
                  color={ML_BLUE} 
                  data={current.daily?.map((d: any) => ({ 
                    val: expandedMetric === 'ml-orders' ? d.orders : 
                         expandedMetric === 'ml-revenue' ? d.revenue : d.aov, 
                    date: d.date 
                  }))} 
                  prevData={previous?.daily?.map((d: any) => ({ 
                    val: expandedMetric === 'ml-orders' ? d.orders : 
                         expandedMetric === 'ml-revenue' ? d.revenue : d.aov, 
                    date: d.date 
                  }))} 
                />
              )}
            </div>

            {/* Bottom Panels (2 Column layout) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
              
              {/* Left Column: Publications */}
              <div className="bg-white dark:bg-zinc-900 rounded-[24px] border border-black/[0.06] dark:border-white/[0.06] p-6 shadow-sm flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
                      Publicaciones Destacadas
                    </h2>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">Control de tus artículos activos y su stock</p>
                  </div>
                  {/* Search input */}
                  <div className="relative max-w-xs w-full">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                    <input 
                      type="text" 
                      placeholder="Buscar por título o ID..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full h-9 pl-9 pr-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs focus:border-[#3483fa] focus:ring-1 focus:ring-[#3483fa]/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1 scrollbar-hide">
                  {loadingPublications ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-[#3483fa] animate-spin" />
                    </div>
                  ) : filteredPubs.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-[12px] text-zinc-450 dark:text-zinc-550 font-medium">
                        No se encontraron publicaciones
                      </p>
                    </div>
                  ) : (
                    filteredPubs.map(pub => (
                      <div 
                        key={pub.id}
                        className="flex items-center gap-3 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/30 transition-all"
                      >
                        <img 
                          src={pub.image} 
                          alt={pub.title} 
                          className="w-12 h-12 rounded-xl object-cover shrink-0 border border-zinc-200/50 dark:border-zinc-800"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[12px] font-bold text-zinc-900 dark:text-white truncate">
                            {pub.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] text-zinc-400 font-medium font-mono">{pub.id}</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                            <span className="text-[10px] font-black text-[#2d3277] dark:text-zinc-300">
                              {fmtCurr(pub.price)}
                            </span>
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                            <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full ${
                              pub.stock === 0 
                                ? 'bg-red-50 text-red-650 dark:bg-red-950/20 dark:text-red-400' 
                                : pub.stock <= 10 
                                  ? 'bg-amber-50 text-amber-650 dark:bg-amber-950/20 dark:text-amber-400'
                                  : 'bg-emerald-50 text-emerald-650 dark:bg-emerald-950/20 dark:text-emerald-400'
                            }`}>
                              Stock: {pub.stock === 0 ? 'Sin Stock' : pub.stock}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] font-black text-zinc-900 dark:text-white">{pub.sold} vendidas</p>
                          <p className="text-[9.5px] text-zinc-400 mt-0.5">{pub.visits} visitas</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Customer Questions */}
              <div className="bg-white dark:bg-zinc-900 rounded-[24px] border border-black/[0.06] dark:border-white/[0.06] p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
                      Preguntas sin Responder
                    </h2>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5">Respóndele a tus compradores en tiempo real</p>
                  </div>
                  <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/15 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    {questions.length} Pendientes
                  </span>
                </div>

                <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1 scrollbar-hide">
                  {loadingQuestions ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-[#3483fa] animate-spin" />
                    </div>
                  ) : questions.length === 0 ? (
                    <div className="text-center py-16 space-y-3">
                      <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/20 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                        <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                      </div>
                      <p className="text-[12px] text-zinc-450 dark:text-zinc-550 font-bold">
                        ¡Al día! No hay preguntas pendientes.
                      </p>
                    </div>
                  ) : (
                    questions.map(q => (
                      <div 
                        key={q.id}
                        className="p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/30 dark:bg-zinc-900/10 space-y-3 animate-in fade-in duration-200"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-600 dark:text-zinc-300 shrink-0">
                            {q.buyer.slice(0, 2)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11.5px] font-bold text-zinc-800 dark:text-zinc-200">@{q.buyer}</span>
                              <span className="text-[9.5px] text-zinc-450">{q.date}</span>
                            </div>
                            <p className="text-[12.5px] font-semibold text-zinc-900 dark:text-zinc-100 mt-1 leading-normal">
                              "{q.text}"
                            </p>
                          </div>
                        </div>

                        {/* Associated Listing */}
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-150/40 dark:border-zinc-800 rounded-xl">
                          <img src={q.itemImage} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                          <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 truncate flex-1">
                            {q.itemTitle}
                          </span>
                          <span className="text-[9px] font-bold text-zinc-450 font-mono shrink-0 bg-zinc-50 dark:bg-zinc-900 px-1.5 py-0.5 rounded">
                            {q.itemId}
                          </span>
                        </div>

                        {/* Textarea answer */}
                        <div className="relative">
                          <textarea
                            placeholder="Escribe tu respuesta aquí..."
                            value={q.answerText}
                            onChange={e => handleAnswerTextChange(q.id, e.target.value)}
                            className="w-full min-h-[64px] max-h-[120px] p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs focus:border-[#3483fa] focus:ring-1 focus:ring-[#3483fa]/20 outline-none transition-all font-medium pr-10 resize-y"
                          />
                          <button
                            onClick={() => handleAnswerSubmit(q.id)}
                            disabled={submittingAnswer[q.id]}
                            className="absolute right-2.5 bottom-3.5 p-1.5 rounded-lg bg-[#3483fa] hover:bg-[#296ecc] disabled:opacity-50 text-white shadow-sm transition-all hover:scale-[1.03] active:scale-[0.97]"
                            title="Enviar respuesta"
                          >
                            {submittingAnswer[q.id] ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : null}
      </div>
    </CenteredPageLoader>
  );
}
