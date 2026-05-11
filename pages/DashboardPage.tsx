import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, MetaMetric, ClientLink } from '../services/db';
import { metaAds, DatePreset, presetToRange, getPrevPeriod, today, daysAgo } from '../services/metaAds';
import { klaviyo } from '../services/klaviyo';
import { 
  BarChart2, ExternalLink, TrendingUp, Mail,
  AlertCircle, Calendar as CalendarIcon, Layers, Circle, ChevronDown, 
  Loader2, Check, ChevronLeft, ChevronRight, LayoutDashboard, Send, MousePointer2, ShoppingBag
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

// ── Components ─────────────────────────────────────────────────────────

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_ES   = ['Lu','Ma','Mi','Ju','Vi','Sá','Do'];

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function isoDate(y: number, m: number, d: number) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

const MiniCal = ({ year, month, since, until, hovering, onDay, onHover }: any) => {
  const days = getDaysInMonth(year, month);
  const offset = getFirstDayOfWeek(year, month);
  const cells = [...Array(offset).fill(null), ...Array.from({length:days},(_,i)=>i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="select-none min-w-[200px]">
      <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100 text-center mb-3">{MONTHS_ES[month]} {year}</p>
      <div className="grid grid-cols-7 mb-1 text-center">
        {DAYS_ES.map(d => <div key={d} className="text-[10px] font-bold text-zinc-400 pb-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const iso = isoDate(year, month, day);
          const isStart = iso === since;
          const isEnd = iso === until;
          const inRange = since && until && iso > since && iso < until;
          const inHover = hovering && since && !until && iso > since && iso <= hovering;
          const isToday = iso === today();
          const isFuture = iso > today();
          return (
            <button key={i} disabled={isFuture} onClick={() => onDay(iso)} onMouseEnter={() => onHover(iso)}
              className={`h-7 w-full text-[11px] font-medium relative transition-all ${
                isStart || isEnd ? 'bg-violet-600 text-white rounded-md z-10' :
                (inRange || inHover) ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200' :
                isToday ? 'border-2 border-violet-500 text-violet-600 font-bold rounded-md' :
                isFuture ? 'opacity-30 cursor-not-allowed' :
                'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md'
              }`}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ShopifyMetric = ({ label, value, change, trend, data, color = "#6366f1", loading }: any) => (
  <div className="flex flex-col flex-1 min-w-[140px] px-4 py-3 border-r border-zinc-100 dark:border-zinc-800 last:border-r-0 group relative">
    <div className="flex items-center gap-1.5 mb-0.5">
      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-tight">{label}</span>
    </div>
    <div className="flex items-end justify-between">
      <div className="flex flex-col">
        {loading ? (
          <div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-md mt-1" />
        ) : (
          <span className="text-[17px] font-bold text-zinc-900 dark:text-white truncate">{value}</span>
        )}
        {!loading && change !== undefined && (
          <div className={`flex items-center text-[10px] font-bold mt-0.5 ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trend === 'up' ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      {!loading && data && data.length > 0 && (
        <div className="h-10 w-24 sm:w-28 ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Area type="monotone" dataKey="val" stroke={color} fill={color} fillOpacity={0.1} strokeWidth={2} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  </div>
);

const DATE_OPTIONS: { label: string, value: DatePreset | 'custom' }[] = [
  { label: 'Hoy', value: 'today' },
  { label: 'Ayer', value: 'yesterday' },
  { label: 'Últimos 7 días', value: 'last_7d' },
  { label: 'Últimos 14 días', value: 'last_14d' },
  { label: 'Últimos 28 días', value: 'last_28d' },
  { label: 'Este mes', value: 'this_month' },
  { label: 'Mes pasado', value: 'last_month' },
  { label: 'Personalizado', value: 'custom' },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [metaMetrics, setMetaMetrics] = useState<MetaMetric[]>([]);
  
  // Date States
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('yesterday');
  const [activeSince, setActiveSince] = useState(daysAgo(1));
  const [activeUntil, setActiveUntil] = useState(daysAgo(1));
  const [pendingPreset, setPendingPreset] = useState<DatePreset | 'custom'>('yesterday');
  const [pendingSince, setPendingSince] = useState(daysAgo(1));
  const [pendingUntil, setPendingUntil] = useState(daysAgo(1));

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hovering, setHovering] = useState('');
  const nowD = new Date();
  const [calYear, setCalYear] = useState(nowD.getFullYear());
  const [calMonth, setCalMonth] = useState(nowD.getMonth());

  // Meta Data States
  const [currentMeta, setCurrentMeta] = useState<any>(null);
  const [prevMeta, setPrevMeta] = useState<any>(null);
  const [metaTrend, setMetaTrend] = useState<any[]>([]);
  const [fetchingMeta, setFetchingMeta] = useState(false);

  // Klaviyo Data States
  const [currentKlaviyo, setCurrentKlaviyo] = useState<any>(null);
  const [prevKlaviyo, setPrevKlaviyo] = useState<any>(null);
  const [fetchingKlaviyo, setFetchingKlaviyo] = useState(false);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const fetchLock = useRef(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) setShowDatePicker(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = async (p: DatePreset | 'custom', s: string, u: string) => {
    if (fetchLock.current) return;
    fetchLock.current = true;
    
    const range = p === 'custom' ? { since: s, until: u } : presetToRange(p);
    const prevRange = getPrevPeriod(range.since, range.until);

    // Meta Trend
    let metaTrendRange = { ...range };
    if (Math.ceil((new Date(range.until).getTime() - new Date(range.since).getTime()) / 864e5) < 6) {
      metaTrendRange = { since: daysAgo(7), until: range.until };
    }

    if (profile?.meta_account_id) {
      setFetchingMeta(true);
      try {
        const [curr, prev, trend] = await Promise.all([
          metaAds.getInsights(profile.meta_account_id, metaAds.INSIGHT_FIELDS, p === 'custom' ? undefined : p, p === 'custom' ? range : undefined),
          metaAds.getInsights(profile.meta_account_id, metaAds.INSIGHT_FIELDS, undefined, prevRange),
          metaAds.getInsights(profile.meta_account_id, metaAds.INSIGHT_FIELDS, undefined, metaTrendRange, 1)
        ]);
        setCurrentMeta(curr); setPrevMeta(prev); setMetaTrend(Array.isArray(trend) ? trend.filter(Boolean) : []);
      } catch (err) { console.error("Meta Fetch Error:", err); }
      finally { setFetchingMeta(false); }
    }

    if (profile?.klaviyo_api_key) {
      setFetchingKlaviyo(true);
      try {
        const [curr, prev] = await Promise.all([
          klaviyo.getDashboardData(profile.klaviyo_api_key, range.since, range.until),
          klaviyo.getDashboardData(profile.klaviyo_api_key, prevRange.since, prevRange.until)
        ]);
        setCurrentKlaviyo(curr); setPrevKlaviyo(prev);
      } catch (err) { console.error("Klaviyo Fetch Error:", err); }
      finally { setFetchingKlaviyo(false); }
    }
    fetchLock.current = false;
  };

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [meta, linksData] = await Promise.all([db.meta.getByClientId(profile.id), db.links.getByClientId(profile.id)]);
      setMetaMetrics(meta); setLinks(linksData.slice(0, 4)); setLoadingInitial(false);
    })();
  }, [profile]);

  useEffect(() => {
    if (profile) fetchData(activePreset, activeSince, activeUntil);
  }, [profile, activePreset, activeSince, activeUntil]);

  const applySelection = () => {
    if (pendingPreset === 'custom' && (!pendingSince || !pendingUntil)) return;
    setActivePreset(pendingPreset); setActiveSince(pendingSince); setActiveUntil(pendingUntil); setShowDatePicker(false);
  };

  const getMetaChange = (curr: any, prev: any, field: string) => {
    const cVal = parseFloat(curr?.[field] || 0);
    const pVal = parseFloat(prev?.[field] || 0);
    if (pVal === 0) return { change: undefined, trend: 'up' };
    const change = ((cVal - pVal) / pVal) * 100;
    return { change, trend: change >= 0 ? 'up' : 'down' };
  };

  const getConversions = (data: any) => parseFloat(data?.actions?.find((a: any) => a.action_type === 'purchase' || a.action_type === 'lead')?.value || 0);
  const getConvValue = (data: any) => parseFloat(data?.action_values?.find((a: any) => a.action_type === 'purchase')?.value || 0);

  const currConv = getConversions(currentMeta);
  const prevConv = getConversions(prevMeta);
  const currentRoas = parseFloat(currentMeta?.purchase_roas?.[0]?.value || 0);
  const prevRoas = parseFloat(prevMeta?.purchase_roas?.[0]?.value || 0);

  const getTrendMetric = (field: string, type: 'basic' | 'action' | 'value' | 'roas' = 'basic') => {
    return metaTrend.map(d => {
      if (type === 'action') return { val: getConversions(d) };
      if (type === 'value') return { val: getConvValue(d) };
      if (type === 'roas') return { val: parseFloat(d.purchase_roas?.[0]?.value || 0) };
      return { val: parseFloat(d[field] || 0) };
    });
  };

  const getKlaviyoChange = (curr: number, prev: number) => (!prev ? undefined : ((curr - prev) / prev) * 100);

  const activePrevRange = getPrevPeriod(activeSince, activeUntil);
  const fmtDate = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '...';

  if (loadingInitial) return <div className="space-y-6 p-4 animate-pulse"><div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-full" /></div>;

  return (
    <div className="space-y-5 pb-10 fade-in px-2 sm:px-0 max-w-[1600px] mx-auto">
      
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative" ref={datePickerRef}>
          <button onClick={() => { setPendingPreset(activePreset); setPendingSince(activeSince); setPendingUntil(activeUntil); setShowDatePicker(!showDatePicker); }}
            className={`h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center gap-2 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm transition-all ${showDatePicker ? 'ring-2 ring-violet-500/20 border-violet-500' : ''}`}>
            <CalendarIcon className="w-3.5 h-3.5 text-zinc-400" />
            <span>{activePreset === 'custom' ? `${fmtDate(activeSince)} - ${fmtDate(activeUntil)}` : DATE_OPTIONS.find(o => o.value === activePreset)?.label}</span>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </button>
          {showDatePicker && (
            <div className="absolute top-full left-0 mt-1.5 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 z-50 overflow-hidden flex flex-col md:flex-row" style={{ minWidth: 600 }}>
              <div className="w-48 border-r border-zinc-100 dark:border-zinc-800 py-2 flex-shrink-0">
                {DATE_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => { setPendingPreset(opt.value); if (opt.value !== 'custom') { const r = presetToRange(opt.value); setPendingSince(r.since); setPendingUntil(r.until); } }}
                    className={`w-full text-left px-4 py-2 text-[12.5px] transition-colors ${pendingPreset === opt.value ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 font-bold' : 'text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{opt.label}</button>
                ))}
              </div>
              <div className="flex-1 p-5">
                <div className="flex gap-8">
                  <MiniCal year={calYear} month={calMonth} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { setPendingUntil(iso); } }} onHover={setHovering} />
                  <MiniCal year={calMonth === 11 ? calYear + 1 : calYear} month={calMonth === 11 ? 0 : calMonth + 1} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { setPendingUntil(iso); } }} onHover={setHovering} />
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800">
                  <button onClick={() => setShowDatePicker(false)} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-zinc-500">Cancelar</button>
                  <button onClick={applySelection} className="px-5 py-1.5 rounded-lg text-[12px] font-bold bg-violet-600 text-white">Aplicar</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center gap-2 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 shadow-sm"><LayoutDashboard className="w-3.5 h-3.5 text-zinc-400" /><span>C.A.R Dashboard</span></div>
        {!fetchingMeta && !fetchingKlaviyo && <div className="h-8 px-2.5 rounded-lg bg-violet-50 dark:bg-violet-500/5 text-[10px] font-bold text-violet-600 dark:text-violet-400 flex items-center gap-1.5 border border-violet-100 dark:border-violet-500/10"><TrendingUp className="w-3 h-3" /> vs {fmtDate(activePrevRange.since)} - {fmtDate(activePrevRange.until)}</div>}
        {(fetchingMeta || fetchingKlaviyo) && <div className="flex items-center gap-2 text-[11px] text-zinc-400 ml-auto mr-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Actualizando...</div>}
      </div>

      {/* Captación (Meta Ads) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-blue-500" /><h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Captación (Meta Ads)</h2></div>
        <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden flex overflow-x-auto scrollbar-hide">
          <ShopifyMetric label="Inversión" value={`$ ${parseFloat(currentMeta?.spend || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} {...getMetaChange(currentMeta, prevMeta, 'spend')} data={getTrendMetric('spend')} loading={fetchingMeta} />
          <ShopifyMetric label="Alcance" value={parseInt(currentMeta?.reach || 0).toLocaleString('es-AR')} {...getMetaChange(currentMeta, prevMeta, 'reach')} data={getTrendMetric('reach')} loading={fetchingMeta} />
          <ShopifyMetric label="Conversiones" value={currConv} change={getKlaviyoChange(currConv, prevConv)} trend={currConv >= prevConv ? 'up' : 'down'} data={getTrendMetric('', 'action')} color="#10b981" loading={fetchingMeta} />
          <ShopifyMetric label="Retorno Publicidad" value={`$ ${getConvValue(currentMeta).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} change={getKlaviyoChange(getConvValue(currentMeta), getConvValue(prevMeta))} trend={getConvValue(currentMeta) >= getConvValue(prevMeta) ? 'up' : 'down'} data={getTrendMetric('', 'value')} color="#0ea5e9" loading={fetchingMeta} />
          <ShopifyMetric label="ROAS" value={`${currentRoas.toFixed(2)}x`} change={getKlaviyoChange(currentRoas, prevRoas)} trend={currentRoas >= prevRoas ? 'up' : 'down'} data={getTrendMetric('', 'roas')} color="#a855f7" loading={fetchingMeta} />
        </div>
      </div>

      {/* Retención (Klaviyo) */}
      {profile?.klaviyo_api_key && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /><h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Retención (Klaviyo)</h2></div>
          <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden flex overflow-x-auto scrollbar-hide">
            <ShopifyMetric label="Ingresos Klaviyo" value={currentKlaviyo ? `$ ${currentKlaviyo.revenue?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : 'Sin datos'} change={getKlaviyoChange(currentKlaviyo?.revenue, prevKlaviyo?.revenue)} trend={(currentKlaviyo?.revenue || 0) >= (prevKlaviyo?.revenue || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyRevenue?.map((v: any) => ({ val: v }))} color="#10b981" loading={fetchingKlaviyo} />
            <ShopifyMetric label="Mails Enviados" value={currentKlaviyo ? currentKlaviyo.sent?.toLocaleString('es-AR') : '0'} change={getKlaviyoChange(currentKlaviyo?.sent, prevKlaviyo?.sent)} trend={(currentKlaviyo?.sent || 0) >= (prevKlaviyo?.sent || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailySent?.map((v: any) => ({ val: v }))} color="#6366f1" loading={fetchingKlaviyo} />
            <ShopifyMetric label="Aperturas" value={currentKlaviyo ? currentKlaviyo.opens?.toLocaleString('es-AR') : '0'} change={getKlaviyoChange(currentKlaviyo?.opens, prevKlaviyo?.opens)} trend={(currentKlaviyo?.opens || 0) >= (prevKlaviyo?.opens || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyOpens?.map((v: any) => ({ val: v }))} color="#8b5cf6" loading={fetchingKlaviyo} />
            <ShopifyMetric label="Clics" value={currentKlaviyo ? currentKlaviyo.clicks?.toLocaleString('es-AR') : '0'} change={getKlaviyoChange(currentKlaviyo?.clicks, prevKlaviyo?.clicks)} trend={(currentKlaviyo?.clicks || 0) >= (prevKlaviyo?.clicks || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyClicks?.map((v: any) => ({ val: v }))} color="#0ea5e9" loading={fetchingKlaviyo} />
            <ShopifyMetric label="Conversiones" value={currentKlaviyo ? currentKlaviyo.conversions : '0'} change={getKlaviyoChange(currentKlaviyo?.conversions, prevKlaviyo?.conversions)} trend={(currentKlaviyo?.conversions || 0) >= (prevKlaviyo?.conversions || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyConversions?.map((v: any) => ({ val: v }))} color="#f59e0b" loading={fetchingKlaviyo} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        <div className="lg:col-span-2 card p-5">
          <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white mb-5">Rendimiento Histórico</h3>
          <div className="h-56">
            {metaMetrics.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...metaMetrics].reverse().slice(-6).map(m => ({ name: new Date(m.period_start).toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' }), inv: m.spend, conv: m.conversions }))}>
                  <Area type="monotone" dataKey="inv" stroke="#6366f1" fill="#6366f1" fillOpacity={0.05} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                  <Area type="monotone" dataKey="conv" stroke="#10b981" fill="#10b981" fillOpacity={0.05} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-sm"><BarChart2 className="w-8 h-8 opacity-20 mb-2" />Sin datos históricos</div>}
          </div>
        </div>
        <div className="card p-3 flex flex-col gap-1.5">
          <p className="px-3 py-2 text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Accesos Directos</p>
          {links.map(link => (
            <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 rounded-[10px] hover:bg-zinc-50 transition-all group">
              <div className="flex items-center gap-3"><span className="text-[16px]">{link.icon || '🔗'}</span><span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-200">{link.label}</span></div>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-300 group-hover:text-violet-500 transition-all" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
