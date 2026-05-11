
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { metaAds, INSIGHT_FIELDS, DatePreset, presetToRange, getPrevPeriod, today, daysAgo } from '../services/metaAds';
import { klaviyo } from '../services/klaviyo';
import { 
  LayoutDashboard, Users, MessageSquare, Mail, Link as LinkIcon, FileText, 
  Settings, LogOut, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Search, Bell,
  ArrowUpRight, ArrowDownRight, Eye, EyeOff, RefreshCw
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

// ── Components ─────────────────────────────────────────────────────────

interface ClientLink {
  id: string;
  title: string;
  url: string;
  icon: string;
}

interface MetaMetric {
  name: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down';
}

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfWeek(y: number, m: number) { 
  const d = new Date(y, m, 1).getDay();
  return d === 0 ? 6 : d - 1; 
}
function isoDate(y: number, m: number, d: number) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

const MiniCal = ({ year, month, since, until, hovering, onDay, onHover, onPrev, onNext }: any) => {
  const days = getDaysInMonth(year, month);
  const offset = getFirstDayOfWeek(year, month);
  const cells = [...Array(offset).fill(null), ...Array.from({length:days},(_,i)=>i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="select-none min-w-[200px]">
      <div className="flex items-center justify-between mb-3 px-1">
        {onPrev ? (
          <button onClick={onPrev} className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : <div className="w-6" />}
        
        <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-100">{MONTHS_ES[month]} {year}</p>

        {onNext ? (
          <button onClick={onNext} className="p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : <div className="w-6" />}
      </div>
      <div className="grid grid-cols-7 mb-1 text-center">
        {DAYS_ES.map(d => <div key={d} className="text-[10px] font-bold text-zinc-400 pb-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = isoDate(year, month, d);
          const isToday = iso === today();
          const isFuture = iso > today();
          const isSince = iso === since;
          const isUntil = iso === until;
          
          let isInRange = false;
          if (since && until) {
            isInRange = iso > since && iso < until;
          } else if (since && hovering) {
            const start = since < hovering ? since : hovering;
            const end = since < hovering ? hovering : since;
            isInRange = iso > start && iso < end;
          }

          return (
            <button
              key={i}
              disabled={isFuture}
              onMouseEnter={() => onHover(iso)}
              onClick={() => onDay(iso)}
              className={`
                h-8 w-8 text-[11px] font-medium rounded-full transition-all relative
                ${isFuture ? 'opacity-20 cursor-default' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}
                ${isToday ? 'border border-blue-500 text-blue-500 font-bold' : ''}
                ${isSince || isUntil ? 'bg-blue-600 text-white font-bold scale-110 z-10' : ''}
                ${isInRange ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-none' : ''}
              `}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ShopifyMetric = ({ label, value, change, trend, data, color, loading, active, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`flex-1 min-w-[200px] p-5 border-r last:border-r-0 border-black/[0.06] dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer relative group ${active ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''}`}
  >
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
        {active && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />}
      </div>
      <div className="flex items-baseline gap-2">
        {loading ? (
          <div className="h-6 w-20 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded" />
        ) : (
          <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">{value}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <div className={`flex items-center text-[11px] font-bold ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
          {trend === 'up' ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
          {change ? `${Math.abs(change).toFixed(1)}%` : '0%'}
        </div>
      </div>
    </div>
    <div className="absolute right-4 bottom-4 w-20 h-14 opacity-60 group-hover:opacity-100 transition-opacity" style={{ minHeight: '40px', display: 'block' }}>
      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <Area type="monotone" dataKey="val" stroke={color} fill={color} fillOpacity={0.1} strokeWidth={2} dot={{ r: 2, fill: color }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-full flex items-center justify-center opacity-20">
          <div className="w-8 h-[1px] bg-zinc-400" />
        </div>
      )}
    </div>
  </div>
);

const MetricDetailChart = ({ data, color, label }: any) => (
  <div className="mt-4 p-6 bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm animate-in slide-in-from-top-2 duration-300">
    <div className="flex items-center justify-between mb-6">
      <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Evolución de {label}</h3>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-[12px] font-medium text-zinc-600 dark:text-zinc-400">Datos diarios</span>
        </div>
      </div>
    </div>
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`gradient-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.1}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" />
          <XAxis 
            dataKey="date" 
            tickFormatter={(d) => {
              const parts = d.split('-');
              return parts.length > 2 ? `${parts[2]}/${parts[1]}` : d;
            }}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis 
            hide 
            domain={[0, 'auto']}
          />
          <Tooltip 
            content={({ active, payload }: any) => {
              if (active && payload && payload.length) {
                const val = payload[0].value;
                return (
                  <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2 rounded-lg shadow-xl">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">
                      {payload[0].payload.date}
                    </p>
                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {typeof val === 'number' && val > 100 ? `$ ${val.toLocaleString()}` : val}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area 
            type="monotone" 
            dataKey="val" 
            stroke={color} 
            strokeWidth={3}
            fillOpacity={1} 
            fill={`url(#gradient-${label})`}
            dot={(props: any) => {
              const { cx, cy, value } = props;
              if (value > 0) {
                return (
                  <circle key={cx} cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={2} />
                );
              }
              return null;
            }}
            activeDot={{ r: 6, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default function DashboardPage() {
  const { profile } = useAuth();
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [metaDaily, setMetaDaily] = useState<any[]>([]);
  
  // Date States
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('last_7d');
  const [activeSince, setActiveSince] = useState(daysAgo(7));
  const [activeUntil, setActiveUntil] = useState(today());

  // Date Picker Pending States
  const [pendingPreset, setPendingPreset] = useState<DatePreset | 'custom'>('last_7d');
  const [pendingSince, setPendingSince] = useState(daysAgo(7));
  const [pendingUntil, setPendingUntil] = useState(today());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hovering, setHovering] = useState('');
  const nowD = new Date();
  const [calYear, setCalYear] = useState(nowD.getFullYear());
  const [calMonth, setCalMonth] = useState(nowD.getMonth());

  // Meta Data States
  const [currentMeta, setCurrentMeta] = useState<any>(null);
  const [prevMeta, setPrevMeta] = useState<any>(null);
  const [fetchingMeta, setFetchingMeta] = useState(false);

  // Klaviyo Data States
  const [currentKlaviyo, setCurrentKlaviyo] = useState<any>(null);
  const [prevKlaviyo, setPrevKlaviyo] = useState<any>(null);
  const [fetchingKlaviyo, setFetchingKlaviyo] = useState(false);

  const [loadingInitial, setLoadingInitial] = useState(true);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const fetchLock = useRef(false);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

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

    if (profile?.meta_account_id) {
      setFetchingMeta(true);
      try {
        const [curr, prev, rawDaily] = await Promise.all([
          metaAds.getInsights(profile.meta_account_id, INSIGHT_FIELDS, p === 'custom' ? undefined : p, p === 'custom' ? range : undefined),
          metaAds.getInsights(profile.meta_account_id, INSIGHT_FIELDS, undefined, prevRange),
          metaAds.getInsightsDaily(profile.meta_account_id, INSIGHT_FIELDS, p === 'custom' ? undefined : p, p === 'custom' ? range : undefined)
        ]);

        // Padding logic for daily charts
        const padded = [];
        let d = new Date(range.since + 'T12:00:00');
        const end = new Date(range.until + 'T12:00:00');
        while (d <= end) {
          const iso = d.toISOString().split('T')[0];
          const match = rawDaily.find((rd: any) => rd.date === iso);
          padded.push(match || { date: iso, spend: 0, results: 0, purchase_value: 0, roas: 0, reach: 0 });
          d.setDate(d.getDate() + 1);
        }
        const daily = padded;

        console.log("Meta Daily Data (Padded):", daily);
        setCurrentMeta(curr); setPrevMeta(prev); setMetaDaily(daily);
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
    if (profile) {
      fetchData(activePreset, activeSince, activeUntil);
      
      const loadLinks = async () => {
        const { data } = await supabase.from('client_links').select('*').eq('client_id', profile.id).order('created_at');
        if (data) setLinks(data);
      };
      loadLinks();
      setLoadingInitial(false);
    }
  }, [profile, activePreset, activeSince, activeUntil]);

  const handleApply = () => {
    setActivePreset(pendingPreset); setActiveSince(pendingSince); setActiveUntil(pendingUntil); setShowDatePicker(false);
  };

  const getMetaChange = (curr: number, prev: number) => (!prev ? 0 : ((curr - prev) / prev) * 100);
  const getKlaviyoChange = (curr: number, prev: number) => (!prev ? 0 : ((curr - prev) / prev) * 100);

  const activePrevRange = getPrevPeriod(activeSince, activeUntil);
  const fmtDate = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '...';

  if (loadingInitial) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-[13px] font-medium text-zinc-500">Cargando dashboard...</span>
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-10">
      {/* Header & Date Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200 dark:shadow-none">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              {profile?.business_name || 'Portal C.A.R'}
            </h1>
            <p className="text-[13px] text-zinc-500 font-medium">Algoritmia · 2026</p>
          </div>
        </div>

        <div className="relative" ref={datePickerRef}>
          <div className="flex items-center gap-2 p-1 bg-white dark:bg-zinc-900 rounded-[14px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm">
            <button onClick={() => setShowDatePicker(!showDatePicker)} className="flex items-center gap-2.5 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-[10px] transition-all">
              <CalendarIcon className="w-4 h-4 text-zinc-400" />
              <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">
                {activePreset === 'custom' ? `${fmtDate(activeSince)} - ${fmtDate(activeUntil)}` : 
                 activePreset === 'today' ? 'Hoy' :
                 activePreset === 'yesterday' ? 'Ayer' :
                 activePreset === 'last_7d' ? 'Últimos 7 días' :
                 activePreset === 'last_28d' ? 'Últimos 28 días' :
                 activePreset === 'this_month' ? 'Este mes' : 'Mes pasado'}
              </span>
              <ChevronLeft className="w-3.5 h-3.5 text-zinc-300 rotate-[-90deg]" />
            </button>
            <div className="w-[1px] h-4 bg-zinc-100 dark:bg-zinc-800 mx-1" />
            <div className="flex items-center gap-2 px-4 py-2 text-[12px] font-bold text-blue-600 bg-blue-50/50 dark:bg-blue-900/20 rounded-[10px]">
              <TrendingUp className="w-3.5 h-3.5" />
              vs {fmtDate(activePrevRange.since)} - {fmtDate(activePrevRange.until)}
            </div>
          </div>

          {showDatePicker && (
            <div className="absolute right-0 top-full mt-3 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-[100] flex overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="w-[160px] border-r border-zinc-50 dark:border-zinc-800 p-3 flex flex-col gap-1">
                {[
                  { id: 'today', label: 'Hoy' },
                  { id: 'yesterday', label: 'Ayer' },
                  { id: 'last_7d', label: 'Últimos 7 días' },
                  { id: 'last_28d', label: 'Últimos 28 días' },
                  { id: 'this_month', label: 'Este mes' },
                  { id: 'last_month', label: 'Mes pasado' }
                ].map(p => (
                  <button key={p.id} onClick={() => { setPendingPreset(p.id as any); const r = presetToRange(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }}
                    className={`text-left px-4 py-2.5 rounded-[10px] text-[12px] font-bold transition-all ${pendingPreset === p.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 p-5">
                <div className="flex gap-8">
                  <MiniCal 
                    year={calYear} month={calMonth} 
                    since={pendingSince} until={pendingUntil} hovering={hovering} 
                    onDay={(iso: string) => { 
                      setPendingPreset('custom'); 
                      if (!pendingSince || (pendingSince && pendingUntil)) { 
                        setPendingSince(iso); setPendingUntil(''); 
                      } else { 
                        if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); }
                        else { setPendingUntil(iso); }
                      } 
                    }} 
                    onHover={setHovering} 
                    onPrev={() => { if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); } else { setCalMonth(calMonth - 1); } }}
                  />
                  <MiniCal 
                    year={calMonth === 11 ? calYear + 1 : calYear} month={calMonth === 11 ? 0 : calMonth + 1} 
                    since={pendingSince} until={pendingUntil} hovering={hovering} 
                    onDay={(iso: string) => { 
                      setPendingPreset('custom'); 
                      if (!pendingSince || (pendingSince && pendingUntil)) { 
                        setPendingSince(iso); setPendingUntil(''); 
                      } else { 
                        if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); }
                        else { setPendingUntil(iso); }
                      } 
                    }} 
                    onHover={setHovering}
                    onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }}
                  />
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800">
                  <button onClick={() => setShowDatePicker(false)} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-zinc-500">Cancelar</button>
                  <button onClick={handleApply} className="px-5 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] font-bold shadow-md shadow-blue-200 dark:shadow-none">Aplicar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10">
        {/* CAPTACIÓN (META ADS) */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-blue-500" /><h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Captación (Meta Ads)</h2></div>
          <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden flex overflow-x-auto scrollbar-hide">
            <ShopifyMetric 
              label="Inversión" 
              value={`$ ${currentMeta?.spend?.toLocaleString('es-AR', { maximumFractionDigits: 0 }) || 0}`} 
              change={getMetaChange(currentMeta?.spend, prevMeta?.spend)} 
              trend={(currentMeta?.spend || 0) >= (prevMeta?.spend || 0) ? 'up' : 'down'} 
              data={metaDaily?.map((d: any) => ({ val: d.spend, date: d.date }))} 
              color="#3b82f6" 
              loading={fetchingMeta}
              active={expandedMetric === 'meta-inversion'}
              onClick={() => setExpandedMetric(expandedMetric === 'meta-inversion' ? null : 'meta-inversion')}
            />
            <ShopifyMetric 
              label="Alcance" 
              value={currentMeta?.reach?.toLocaleString('es-AR') || 0} 
              change={getMetaChange(currentMeta?.reach, prevMeta?.reach)} 
              trend={(currentMeta?.reach || 0) >= (prevMeta?.reach || 0) ? 'up' : 'down'} 
              data={metaDaily?.map((d: any) => ({ val: d.reach, date: d.date }))} 
              color="#6366f1" 
              loading={fetchingMeta}
              active={expandedMetric === 'meta-alcance'}
              onClick={() => setExpandedMetric(expandedMetric === 'meta-alcance' ? null : 'meta-alcance')}
            />
            <ShopifyMetric 
              label="Conversiones" 
              value={currentMeta?.results || 0} 
              change={getMetaChange(currentMeta?.results, prevMeta?.results)} 
              trend={(currentMeta?.results || 0) >= (prevMeta?.results || 0) ? 'up' : 'down'} 
              data={metaDaily?.map((d: any) => ({ val: d.results, date: d.date }))} 
              color="#10b981" 
              loading={fetchingMeta}
              active={expandedMetric === 'meta-conv'}
              onClick={() => setExpandedMetric(expandedMetric === 'meta-conv' ? null : 'meta-conv')}
            />
            <ShopifyMetric 
              label="Retorno Publicidad" 
              value={`$ ${currentMeta?.purchase_value?.toLocaleString('es-AR', { maximumFractionDigits: 0 }) || 0}`} 
              change={getMetaChange(currentMeta?.purchase_value, prevMeta?.purchase_value)} 
              trend={(currentMeta?.purchase_value || 0) >= (prevMeta?.purchase_value || 0) ? 'up' : 'down'} 
              data={metaDaily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))} 
              color="#0ea5e9" 
              loading={fetchingMeta}
              active={expandedMetric === 'meta-roas-v'}
              onClick={() => setExpandedMetric(expandedMetric === 'meta-roas-v' ? null : 'meta-roas-v')}
            />
            <ShopifyMetric 
              label="ROAS" 
              value={`${currentMeta?.roas?.toFixed(2) || 0}x`} 
              change={getMetaChange(currentMeta?.roas, prevMeta?.roas)} 
              trend={(currentMeta?.roas || 0) >= (prevMeta?.roas || 0) ? 'up' : 'down'} 
              data={metaDaily?.map((d: any) => ({ val: d.roas, date: d.date }))} 
              color="#8b5cf6" 
              loading={fetchingMeta}
              active={expandedMetric === 'meta-roas'}
              onClick={() => setExpandedMetric(expandedMetric === 'meta-roas' ? null : 'meta-roas')}
            />
          </div>

          {expandedMetric?.startsWith('meta-') && (
            <MetricDetailChart 
              label={expandedMetric === 'meta-inversion' ? 'Inversión' : expandedMetric === 'meta-alcance' ? 'Alcance' : expandedMetric === 'meta-conv' ? 'Conversiones' : expandedMetric === 'meta-roas-v' ? 'Retorno' : 'ROAS'}
              color={expandedMetric === 'meta-inversion' ? '#3b82f6' : expandedMetric === 'meta-alcance' ? '#6366f1' : expandedMetric === 'meta-conv' ? '#10b981' : expandedMetric === 'meta-roas-v' ? '#0ea5e9' : '#8b5cf6'}
              data={
                expandedMetric === 'meta-inversion' ? metaDaily?.map((d: any) => ({ val: d.spend, date: d.date })) :
                expandedMetric === 'meta-alcance' ? metaDaily?.map((d: any) => ({ val: d.reach, date: d.date })) :
                expandedMetric === 'meta-conv' ? metaDaily?.map((d: any) => ({ val: d.results, date: d.date })) :
                expandedMetric === 'meta-roas-v' ? metaDaily?.map((d: any) => ({ val: d.purchase_value, date: d.date })) :
                metaDaily?.map((d: any) => ({ val: d.roas, date: d.date }))
              }
            />
          )}
        </div>

        {/* RETENCIÓN (KLAVIYO) */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /><h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Retención (Klaviyo)</h2></div>
          <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden flex overflow-x-auto scrollbar-hide">
            <ShopifyMetric 
              label="Ingresos Klaviyo" 
              value={currentKlaviyo ? `$ ${currentKlaviyo.revenue?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : 'Sin datos'} 
              change={getKlaviyoChange(currentKlaviyo?.revenue, prevKlaviyo?.revenue)} 
              trend={(currentKlaviyo?.revenue || 0) >= (prevKlaviyo?.revenue || 0) ? 'up' : 'down'} 
              data={currentKlaviyo?.dailyRevenue?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` }))} 
              color="#10b981" 
              loading={fetchingKlaviyo} 
              active={expandedMetric === 'k-revenue'}
              onClick={() => setExpandedMetric(expandedMetric === 'k-revenue' ? null : 'k-revenue')}
            />
            <ShopifyMetric 
              label="Mails Enviados" 
              value={currentKlaviyo ? currentKlaviyo.sent?.toLocaleString('es-AR') : '0'} 
              change={getKlaviyoChange(currentKlaviyo?.sent, prevKlaviyo?.sent)} 
              trend={(currentKlaviyo?.sent || 0) >= (prevKlaviyo?.sent || 0) ? 'up' : 'down'} 
              data={currentKlaviyo?.dailySent?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` }))} 
              color="#6366f1" 
              loading={fetchingKlaviyo} 
              active={expandedMetric === 'k-sent'}
              onClick={() => setExpandedMetric(expandedMetric === 'k-sent' ? null : 'k-sent')}
            />
            <ShopifyMetric 
              label="Aperturas" 
              value={currentKlaviyo ? currentKlaviyo.opens?.toLocaleString('es-AR') : '0'} 
              change={getKlaviyoChange(currentKlaviyo?.opens, prevKlaviyo?.opens)} 
              trend={(currentKlaviyo?.opens || 0) >= (prevKlaviyo?.opens || 0) ? 'up' : 'down'} 
              data={currentKlaviyo?.dailyOpens?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` }))} 
              color="#8b5cf6" 
              loading={fetchingKlaviyo} 
              active={expandedMetric === 'k-opens'}
              onClick={() => setExpandedMetric(expandedMetric === 'k-opens' ? null : 'k-opens')}
            />
            <ShopifyMetric 
              label="Clics" 
              value={currentKlaviyo ? currentKlaviyo.clicks?.toLocaleString('es-AR') : '0'} 
              change={getKlaviyoChange(currentKlaviyo?.clicks, prevKlaviyo?.clicks)} 
              trend={(currentKlaviyo?.clicks || 0) >= (prevKlaviyo?.clicks || 0) ? 'up' : 'down'} 
              data={currentKlaviyo?.dailyClicks?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` }))} 
              color="#0ea5e9" 
              loading={fetchingKlaviyo} 
              active={expandedMetric === 'k-clicks'}
              onClick={() => setExpandedMetric(expandedMetric === 'k-clicks' ? null : 'k-clicks')}
            />
            <ShopifyMetric 
              label="Conversiones" 
              value={currentKlaviyo ? currentKlaviyo.conversions : '0'} 
              change={getKlaviyoChange(currentKlaviyo?.conversions, prevKlaviyo?.conversions)} 
              trend={(currentKlaviyo?.conversions || 0) >= (prevKlaviyo?.conversions || 0) ? 'up' : 'down'} 
              data={currentKlaviyo?.dailyConversions?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` }))} 
              color="#f59e0b" 
              loading={fetchingKlaviyo} 
              active={expandedMetric === 'k-conv'}
              onClick={() => setExpandedMetric(expandedMetric === 'k-conv' ? null : 'k-conv')}
            />
          </div>

          {expandedMetric?.startsWith('k-') && (
            <MetricDetailChart 
              label={expandedMetric === 'k-revenue' ? 'Ingresos' : expandedMetric === 'k-sent' ? 'Enviados' : expandedMetric === 'k-opens' ? 'Aperturas' : expandedMetric === 'k-clicks' ? 'Clics' : 'Conversiones'}
              color={expandedMetric === 'k-revenue' ? '#10b981' : expandedMetric === 'k-sent' ? '#6366f1' : expandedMetric === 'k-opens' ? '#8b5cf6' : expandedMetric === 'k-clicks' ? '#0ea5e9' : '#f59e0b'}
              data={
                expandedMetric === 'k-revenue' ? currentKlaviyo?.dailyRevenue?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` })) :
                expandedMetric === 'k-sent' ? currentKlaviyo?.dailySent?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` })) :
                expandedMetric === 'k-opens' ? currentKlaviyo?.dailyOpens?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` })) :
                expandedMetric === 'k-clicks' ? currentKlaviyo?.dailyClicks?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` })) :
                currentKlaviyo?.dailyConversions?.map((v: any, i: number) => ({ val: v, date: `Día ${i+1}` }))
              }
            />
          )}
        </div>
      </div>

      {/* HISTÓRICO Y ACCESOS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.06] dark:border-white/[0.06] p-8 shadow-sm">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-50 mb-8 tracking-tight">Rendimiento Histórico</h2>
          <div className="h-[300px] flex flex-col items-center justify-center text-zinc-400 gap-4">
            <BarChart2 className="w-10 h-10 opacity-20" />
            <p className="text-[13px] font-medium opacity-60">Sin datos históricos</p>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.06] dark:border-white/[0.06] p-8 shadow-sm">
          <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-8">Accesos Directos</h2>
          <div className="space-y-3">
            {links.length > 0 ? links.map(link => (
              <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-transparent hover:border-blue-100 dark:hover:border-blue-900/30 hover:bg-white dark:hover:bg-zinc-800 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-blue-600 transition-colors">
                    {link.icon === 'chat' ? <MessageSquare className="w-5 h-5" /> : link.icon === 'mail' ? <Mail className="w-5 h-5" /> : <ExternalLink className="w-5 h-5" />}
                  </div>
                  <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">{link.title}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-blue-600 transition-colors" />
              </a>
            )) : (
              <div className="text-center py-10">
                <p className="text-[12px] text-zinc-400 font-medium">No hay accesos configurados</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────
const TrendingUp = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
);
const BarChart2 = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
);
const ExternalLink = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
);
