import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { metaAds, INSIGHT_FIELDS, DAILY_FIELDS, DatePreset, presetToRange, getPrevPeriod, today, daysAgo } from '../services/metaAds';
import { klaviyo } from '../services/klaviyo';
import { ecommerce } from '../services/ecommerce';
import { 
  BarChart2, Mail, ExternalLink, TrendingUp, DollarSign, Users, Link2,
  AlertCircle, Calendar, Layers, Circle, CreditCard, ChevronDown, 
  MoveUpRight, MoveDownRight, Package, RefreshCw, ChevronRight, MessageSquare, Zap
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const BLUE = '#3b82f6';
const GREEN = '#10b981';
const RED = '#ef4444';

const MAIN_COLOR = '#3b82f6'; // Back to Blue as requested // Back to Blue as requested

const ensureMetaToken = async (): Promise<void> => {
  if (localStorage.getItem('meta_ads_token')) return;
  try {
    const { data } = await supabase.from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
    if (data?.value) localStorage.setItem('meta_ads_token', data.value);
  } catch (err) { console.error("Error cargando token:", err); }
};

interface ClientLink {
  id: string;
  title: string;
  url: string;
  icon: string;
}

const ShopifyMetric = ({ label, value, change, trend, data, color, loading, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`flex flex-col flex-1 min-w-0 px-4 py-4 sm:px-6 sm:py-5
      border-b border-r border-zinc-100 dark:border-zinc-800
      [&:nth-child(odd)]:border-r [&:nth-child(even)]:border-r-0
      sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(even)]:border-r
      sm:[&:nth-child(3n)]:border-r-0
      xl:border-b-0 xl:border-r xl:last:border-r-0
      transition-all text-left group relative
      ${active ? 'bg-blue-50/30 dark:bg-blue-500/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
      {active && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
    </div>
    <div className="flex items-end justify-between gap-2">
      <div className="flex flex-col">
        <span className="text-[17px] sm:text-[20px] font-bold text-zinc-900 dark:text-white leading-none mb-2">{loading ? '...' : value}</span>
        {!loading && change !== undefined && (
          <div className={`flex items-center gap-1 text-[11px] sm:text-[12px] font-bold ${trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 rotate-180" />}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="h-8 w-16 sm:h-10 sm:w-24 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <Area type="monotone" dataKey="val" stroke={color} fill={color} fillOpacity={0.1} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  </button>
);

const MetricDetailChart = ({ label, data = [], prevData = [], color }: any) => {
  const [hoveredLine, setHoveredLine] = useState<'curr' | 'prev' | null>(null);

  const merged = (data || []).map((d: any, i: number) => ({
    ...d,
    prevVal: (prevData || [])[i]?.val ?? null
  }));

  const vals = (data || []).map((d: any) => d.val);
  const nonZero = vals.filter((v: number) => v > 0);
  const avg = nonZero.length > 0 ? nonZero.reduce((a: number, b: number) => a + b, 0) / nonZero.length : 0;
  
  const prevVals = (prevData || []).map((d: any) => d.val);
  const prevNonZero = prevVals.filter((v: number) => v > 0);
  const prevAvg = prevNonZero.length > 0 ? prevNonZero.reduce((a: number, b: number) => a + b, 0) / prevNonZero.length : 0;

  const maxVal = Math.max(...data.map((d: any) => d.val), 0);

  const trend = prevAvg > 0 ? ((avg - prevAvg) / prevAvg) * 100 : 0;
  const chartColor = trend > 5 ? GREEN : trend < -5 ? RED : BLUE;
  const gradientId = `grad-${label.replace(/\s+/g, '-')}`;

  const isPercentLabel = label.toLowerCase().includes('tasa');
  const isMoneyLabel = label.toLowerCase().includes('ingreso') || label.toLowerCase().includes('inversión') || label.toLowerCase().includes('retorno');
  const isRoasLabel = label.toLowerCase().includes('roas');

  const fmtVal = (v: number) => {
    if (v === null || v === undefined || isNaN(v)) return '0';
    if (isPercentLabel) return `${v.toFixed(2)}%`;
    if (isMoneyLabel) return `$${v >= 1000 ? (v/1000).toFixed(1) + 'k' : v.toFixed(0)}`;
    if (isRoasLabel) return `${v.toFixed(2)}x`;
    if (v >= 1000) return (v/1000).toFixed(1) + 'k';
    return v.toFixed(v < 10 ? 2 : 0);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-[20px] p-8 shadow-sm mt-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h3 className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">Evolución de {label}</h3>
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
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={chartColor} stopOpacity={0.15}/><stop offset="95%" stopColor={chartColor} stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" />
            <XAxis dataKey="date" tickFormatter={(d) => d.split('-').slice(1).reverse().join('/')} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis 
              domain={[0, maxVal > 0 ? maxVal * 1.2 : 'auto']} 
              ticks={maxVal > 0 ? Array.from(new Set([0, Math.round(avg), Math.round(prevAvg), Math.round(maxVal)])).filter(v => v >= 0).sort((a,b) => a-b) : undefined} 
              tickFormatter={(v) => v === 0 ? '' : fmtVal(v)} 
              tick={{ fontSize: 9, fill: '#9ca3af' }} 
              axisLine={false} 
              tickLine={false} 
              width={40} 
            />
              <Tooltip content={({ active, payload }: any) => {
              if (active && payload && payload.length) {
                const curr = payload.find((p: any) => p.dataKey === 'val');
                const isMoney = label.toLowerCase().includes('ingreso') || label.toLowerCase().includes('inversión') || label.toLowerCase().includes('retorno');
                const isPercentage = label.toLowerCase().includes('tasa');
                const isRoas = label.toLowerCase().includes('roas');
                const fmtTooltip = (v: number) => {
                  if (typeof v !== 'number') return String(v ?? '—');
                  if (isMoney) return `$ ${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
                  if (isPercentage) return `${v.toFixed(2)}%`;
                  if (isRoas) return `${v.toFixed(2)}x`;
                  return v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
                };
                return (
                  <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 rounded-xl shadow-xl min-w-[140px]">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">{curr?.payload?.date}</p>
                    {curr && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chartColor }} />
                          <span className="text-[11px] font-medium text-zinc-500">Valor</span>
                        </div>
                        <span className="text-[12px] font-bold text-zinc-900 dark:text-zinc-100">{fmtTooltip(curr.value)}</span>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            }} />
            
            {/* Average current - AMBER */}
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

            {/* Average previous - SLATE */}
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
              dot={(p: any) => p.value > 0 ? (
                <circle key={`dot-${p.index}-${p.cx}`} cx={p.cx} cy={p.cy} r={4} fill={chartColor} stroke="#fff" strokeWidth={2} fillOpacity={hoveredLine ? 0.1 : 1} strokeOpacity={hoveredLine ? 0.1 : 1} />
              ) : <path key={`empty-${p.index}-${p.cx}`} d="" />} 
              activeDot={{ r: 6, strokeWidth: 0 }} 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const { profile: authProfile } = useAuth();
  const { darkMode } = useTheme();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [metaDaily, setMetaDaily] = useState<any[]>([]);
  const [prevMetaDaily, setPrevMetaDaily] = useState<any[]>([]);
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('last_7d');
  const [activeSince, setActiveSince] = useState(presetToRange('last_7d').since);
  const [activeUntil, setActiveUntil] = useState(presetToRange('last_7d').until);
  const [pendingPreset, setPendingPreset] = useState<DatePreset | 'custom'>('last_7d');
  const [pendingSince, setPendingSince] = useState(presetToRange('last_7d').since);
  const [pendingUntil, setPendingUntil] = useState(presetToRange('last_7d').until);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCompare] = useState(true);
  const [hovering, setHovering] = useState('');
  const nowD = new Date();
  const [calYear, setCalYear] = useState(nowD.getFullYear());
  const [calMonth, setCalMonth] = useState(nowD.getMonth());
  const [currentMeta, setCurrentMeta] = useState<any>(null);
  const [prevMeta, setPrevMeta] = useState<any>(null);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [currentKlaviyo, setCurrentKlaviyo] = useState<any>(null);
  const [prevKlaviyo, setPrevKlaviyo] = useState<any>(null);
  const [fetchingKlaviyo, setFetchingKlaviyo] = useState(false);
  const [currentStore, setCurrentStore] = useState<any>(null);
  const [prevStore, setPrevStore] = useState<any>(null);
  const [fetchingStore, setFetchingStore] = useState(false);
  const [historical90d, setHistorical90d] = useState<any[]>([]);
  const [fetching90d, setFetching90d] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [allClients, setAllClients] = useState<any[]>([]);
  const { setViewAsProfile } = useViewAs();

  // Load all clients if admin
  useEffect(() => {
    if (authProfile?.is_admin) {
      supabase.from('car_clients').select('*').order('business_name').then(({ data }) => {
        if (data) setAllClients(data.filter(c => !c.is_admin));
      });
    }
  }, [authProfile?.is_admin]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) { if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) setShowDatePicker(false); }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchData = async (p: DatePreset | 'custom', s: string, u: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    try {
      await ensureMetaToken();
      const range = p === 'custom' ? { since: s, until: u } : presetToRange(p);
      const prevRange = getPrevPeriod(range.since, range.until);
      
      const prof: any = profile;
      const fetchShopify = async () => {
        if (!prof?.ecommerce_platform || !prof?.shopify_domain || !prof?.shopify_access_token) return;
        setFetchingStore(true);
        try {
          const [currStore, prevStoreData] = await Promise.all([
            ecommerce.getDashboardData(prof.ecommerce_platform, prof.shopify_domain, prof.shopify_access_token, range.since, range.until),
            ecommerce.getDashboardData(prof.ecommerce_platform, prof.shopify_domain, prof.shopify_access_token, prevRange.since, prevRange.until)
          ]);
          setCurrentStore(currStore); setPrevStore(prevStoreData);
        } catch (err) { console.error("Store Fetch Error:", err); } finally { setFetchingStore(false); }
      };

      const fetchMeta = async () => {
        if (!profile?.meta_account_id) return;
        setFetchingMeta(true);
        try {
          const [rawDaily, rawPrevDaily] = await Promise.all([
            metaAds.getInsightsDaily(profile.meta_account_id, DAILY_FIELDS, p === 'custom' ? undefined : p, p === 'custom' ? range : undefined, controller.signal),
            metaAds.getInsightsDaily(profile.meta_account_id, DAILY_FIELDS, undefined, prevRange, controller.signal),
          ]);
          
          const sumInsights = (data: any[]) => {
            return data.reduce((acc, d) => ({
              spend: acc.spend + (d.spend || 0),
              reach: acc.reach + (d.reach || 0),
              results: acc.results + (d.results || 0),
              purchase_value: acc.purchase_value + (d.purchase_value || 0),
              roas: acc.roas + (d.roas || 0),
            }), { spend: 0, reach: 0, results: 0, purchase_value: 0, roas: 0 });
          };

          const currSummary = sumInsights(rawDaily);
          if (rawDaily.length > 0) currSummary.roas = currSummary.purchase_value / (currSummary.spend || 1);
          const prevSummary = sumInsights(rawPrevDaily);
          if (rawPrevDaily.length > 0) prevSummary.roas = prevSummary.purchase_value / (prevSummary.spend || 1);

          const padded = []; let d = new Date(range.since + 'T12:00:00'); const end = new Date(range.until + 'T12:00:00');
          while (d <= end) { const iso = d.toISOString().split('T')[0]; const match = rawDaily.find((rd: any) => rd.date === iso); padded.push(match || { date: iso, spend: 0, results: 0, purchase_value: 0, roas: 0, reach: 0 }); d.setDate(d.getDate() + 1); }
          const paddedPrev = []; let dp = new Date(prevRange.since + 'T12:00:00'); const endP = new Date(prevRange.until + 'T12:00:00');
          while (dp <= endP) { const iso = dp.toISOString().split('T')[0]; const match = rawPrevDaily.find((rd: any) => rd.date === iso); paddedPrev.push(match || { date: iso, spend: 0, results: 0, purchase_value: 0, roas: 0, reach: 0 }); dp.setDate(dp.getDate() + 1); }

          setCurrentMeta(currSummary); setPrevMeta(prevSummary); setMetaDaily(padded); setPrevMetaDaily(paddedPrev);
        } catch (err: any) { 
          if (err.name !== 'AbortError') console.error("Meta Fetch Error:", err); 
        } finally { setFetchingMeta(false); }
      };

      const fetchKlaviyo = async () => {
        if (!profile?.klaviyo_api_key) return;
        setFetchingKlaviyo(true);
        try {
          const [curr, prev] = await Promise.all([
            klaviyo.getDashboardData(profile.klaviyo_api_key, range.since, range.until),
            klaviyo.getDashboardData(profile.klaviyo_api_key, prevRange.since, prevRange.until)
          ]);
          setCurrentKlaviyo(curr); setPrevKlaviyo(prev);
        } catch (err) { console.error("Klaviyo Fetch Error:", err); } finally { setFetchingKlaviyo(false); }
      };

      // Disparamos Shopify y Meta primero, en paralelo para máxima velocidad.
      await Promise.all([fetchShopify(), fetchMeta()]);
      
      // Una vez que Shopify y Meta terminaron de cargar, disparamos Klaviyo.
      await fetchKlaviyo();
    } catch (globalErr: any) {
      if (globalErr.name !== 'AbortError') console.error("Global Fetch Error:", globalErr);
    }
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
  }, [profile?.id, activePreset, activeSince, activeUntil, refreshKey]);

  useEffect(() => {
    let mounted = true;
    const fetch90d = async () => {
       const prof: any = profile;
       if (!prof?.ecommerce_platform || !prof?.shopify_domain || !prof?.shopify_access_token) return;
       setFetching90d(true);
       try {
         const range90 = presetToRange('last_90d');
         const store90 = await ecommerce.getDashboardData(prof.ecommerce_platform, prof.shopify_domain, prof.shopify_access_token, range90.since, range90.until);
         if (mounted && store90) {
            setHistorical90d(store90.daily || []);
         }
       } catch (err) { } finally {
         if (mounted) setFetching90d(false);
       }
    };
    if (profile?.id) fetch90d();
    return () => { mounted = false; };
  }, [profile?.id, refreshKey]);

  const handleApply = () => { 
    setActivePreset(pendingPreset); setActiveSince(pendingSince); setActiveUntil(pendingUntil); setRefreshKey(prev => prev + 1); setShowDatePicker(false); 
  };

  const getMetaChange = (curr: number, prev: number) => (!prev || isNaN(prev) ? 0 : ((curr - prev) / Math.abs(prev)) * 100);
  const getKlaviyoChange = (curr: number, prev: number) => (!prev || isNaN(prev) || !isFinite(prev) ? 0 : ((curr - prev) / Math.abs(prev)) * 100);

  const activeRange = activePreset === 'custom' ? { since: activeSince, until: activeUntil } : presetToRange(activePreset);
  const activePrevRange = getPrevPeriod(activeRange.since, activeRange.until);
  
  const fmtDateRange = (d: string, showYearForce?: boolean) => {
    const parts = d.split('-');
    const year = parts[0];
    const month = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(parts[1])-1];
    const day = parts[2];
    const currentYear = new Date().getFullYear().toString();
    
    if (year === currentYear && !showYearForce) {
      return `${day} ${month}`;
    }
    return `${day} ${month} ${year}`;
  };

  const MiniCal = ({ year, month, since, until, hovering, onDay, onHover, onPrev, onNext }: any) => {
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
      <div className="w-[240px]">
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
                className={`h-8 w-8 text-[11px] font-bold transition-all relative flex items-center justify-center
                  ${isSelected ? 'bg-blue-600 text-white rounded-full z-10 shadow-md shadow-blue-200 dark:shadow-none' : 
                    (isInRange || isHovering) ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600' : 
                    isFuture ? 'text-zinc-200 dark:text-zinc-800 cursor-default' :
                    'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full'}
                  ${isToday && !isSelected ? 'text-blue-600 dark:text-blue-500 ring-1 ring-blue-100 dark:ring-blue-900/30' : ''}
                `}
              >
                {d.split('-')[2]}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 sm:space-y-10">

      {/* Admin Client Picker */}
      {authProfile?.is_admin && allClients.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-[16px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-3">
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Seleccionar cliente</span>
            {isViewingAs && (
              <button
                onClick={() => setViewAsProfile(null)}
                className="ml-auto text-[10px] font-bold text-zinc-400 hover:text-red-500 transition-colors"
              >
                Volver a mi vista
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {allClients.map(c => {
              const isSelected = viewAsProfile?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    const cp: any = {
                      id: c.id, user_id: c.user_id, business_name: c.business_name,
                      industry: c.industry, plan: c.plan, active: c.active, is_admin: false,
                      meta_account_id: c.meta_account_id, klaviyo_api_key: c.klaviyo_api_key,
                      chatwoot_url: c.chatwoot_url, chatwoot_token: c.chatwoot_token,
                      ecommerce_platform: c.ecommerce_platform,
                      shopify_domain: c.shopify_domain, shopify_access_token: c.shopify_access_token,
                    };
                    setViewAsProfile(isSelected ? null : cp);
                  }}
                  className={`flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-[12px] transition-all ${
                    isSelected
                      ? 'bg-violet-600 shadow-lg shadow-violet-300/20 dark:shadow-violet-900/30'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-[13px] font-black ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}>
                    {c.business_name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className={`text-[10px] font-bold whitespace-nowrap max-w-[80px] truncate ${
                    isSelected ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'
                  }`}>{c.business_name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
        <div className="space-y">
          <div className="flex items-center gap-3 mb-2">
            <img 
              src={darkMode ? "/assets/logoSinFondo.png" : "/assets/logoAlgoritmia1.webp"} 
              alt="Algoritmia" 
              className="w-12 h-12 object-contain drop-shadow-sm"
            />
            <span className="text-[11px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em]">
              Algoritmia • Gestión
            </span>
          </div>
          <h1 className="text-[20px] sm:text-[24px] font-bold text-zinc-900 dark:text-white tracking-tight leading-tight flex items-center gap-3">
            Resumen General
            <span className="text-zinc-400 dark:text-zinc-500 font-medium text-[16px] sm:text-[18px]">•</span>
            <span className="text-zinc-500 dark:text-zinc-400 font-medium text-[16px] sm:text-[18px] truncate">{profile?.full_name || 'The Skirting Factory'}</span>
          </h1>
        </div>
        <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1.5 py-1 shadow-sm h-11 relative" ref={datePickerRef}>
          <div className="relative">
            <button 
              onClick={() => setShowDatePicker(!showDatePicker)} 
              className="flex items-center gap-2 px-4 h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group"
            >
              <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors" />
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
              <div className="fixed inset-x-0 bottom-0 top-0 sm:absolute sm:inset-auto sm:right-0 sm:top-full mt-0 sm:mt-3 bg-white dark:bg-zinc-900 rounded-t-[30px] sm:rounded-[20px] border-t sm:border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-[100] flex flex-col sm:flex-row overflow-hidden animate-in slide-in-from-bottom sm:slide-in-from-top-2 fade-in duration-300 sm:duration-200">
                <div className="w-full sm:w-[160px] border-b sm:border-b-0 sm:border-r border-zinc-50 dark:border-zinc-800 p-2 sm:p-3 flex flex-row sm:flex-col gap-1 overflow-x-auto sm:overflow-x-visible scrollbar-hide">
                  {[{ id: 'today', label: 'Hoy' }, { id: 'yesterday', label: 'Ayer' }, { id: 'last_7d', label: 'Últimos 7 días' }, { id: 'last_14d', label: 'Últimos 14 días' }, { id: 'last_28d', label: 'Últimos 28 días' }, { id: 'last_90d', label: 'Últimos 90 días' }, { id: 'this_month', label: 'Este mes' }, { id: 'last_month', label: 'Mes pasado' }, { id: 'this_year', label: 'Este año' }, { id: 'last_year', label: 'Año pasado' }].map(p => (
                    <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }} className={`text-center sm:text-left px-3 sm:px-4 py-1.5 rounded-[10px] text-[11px] sm:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
                  ))}
                </div>
                <div className="flex-1 p-3 sm:p-5 flex flex-col">
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 overflow-y-auto sm:overflow-y-visible max-h-[60vh] sm:max-h-none">
                    <MiniCal year={calYear} month={calMonth} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onPrev={() => { if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); } else { setCalMonth(calMonth - 1); } }} onNext={window.innerWidth < 640 ? (() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }) : undefined} />
                    <div className="hidden sm:block">
                      <MiniCal year={calMonth === 11 ? calYear + 1 : calYear} month={calMonth === 11 ? 0 : calMonth + 1} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-50 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <button onClick={() => setShowDatePicker(false)} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-zinc-500">Cancelar</button>
                    <button onClick={handleApply} className="px-5 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] font-bold shadow-md shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-colors">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

          <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50/80 dark:bg-blue-500/10 rounded-full transition-all">
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
              vs {fmtDateRange(activePrevRange.since)} - {fmtDateRange(activePrevRange.until)}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Shopify Section */}
        {(profile as any)?.ecommerce_platform && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-pink-500" /><h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Tienda Online ({(profile as any).ecommerce_platform})</h2></div>
            {fetchingStore && !currentStore ? (
              <div className="animate-pulse bg-zinc-100 dark:bg-zinc-800/50 rounded-[12px] h-[88px] w-full" />
            ) : currentStore ? (
              <>
                <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
                  <ShopifyMetric label="Ticket Promedio" value={`$ ${currentStore.aov?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} change={getKlaviyoChange(currentStore?.aov, prevStore?.aov)} trend={(currentStore?.aov || 0) >= (prevStore?.aov || 0) ? 'up' : 'down'} data={currentStore?.daily?.map((d: any) => ({ val: d.aov, date: d.date }))} color={MAIN_COLOR} loading={fetchingStore} active={expandedMetric === 's-aov'} onClick={() => setExpandedMetric(expandedMetric === 's-aov' ? null : 's-aov')} />
                  <ShopifyMetric label="Pedidos" value={currentStore.orders?.toLocaleString('es-AR')} change={getKlaviyoChange(currentStore?.orders, prevStore?.orders)} trend={(currentStore?.orders || 0) >= (prevStore?.orders || 0) ? 'up' : 'down'} data={currentStore?.daily?.map((d: any) => ({ val: d.orders, date: d.date }))} color={MAIN_COLOR} loading={fetchingStore} active={expandedMetric === 's-orders'} onClick={() => setExpandedMetric(expandedMetric === 's-orders' ? null : 's-orders')} />
                  <ShopifyMetric label="Ingresos" value={`$ ${currentStore.revenue?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`} change={getKlaviyoChange(currentStore?.revenue, prevStore?.revenue)} trend={(currentStore?.revenue || 0) >= (prevStore?.revenue || 0) ? 'up' : 'down'} data={currentStore?.daily?.map((d: any) => ({ val: d.revenue, date: d.date }))} color={MAIN_COLOR} loading={fetchingStore} active={expandedMetric === 's-revenue'} onClick={() => setExpandedMetric(expandedMetric === 's-revenue' ? null : 's-revenue')} />
                </div>
                {expandedMetric?.startsWith('s-') && (
                  <MetricDetailChart 
                    label={expandedMetric === 's-revenue' ? 'Ingresos' : expandedMetric === 's-orders' ? 'Pedidos' : expandedMetric === 's-aov' ? 'Ticket Promedio' : expandedMetric === 's-sessions' ? 'Sesiones' : 'Tasa de Conversión'} 
                    color={MAIN_COLOR} 
                    data={expandedMetric === 's-revenue' ? currentStore?.daily?.map((d: any) => ({ val: d.revenue, date: d.date })) : expandedMetric === 's-orders' ? currentStore?.daily?.map((d: any) => ({ val: d.orders, date: d.date })) : expandedMetric === 's-aov' ? currentStore?.daily?.map((d: any) => ({ val: d.aov, date: d.date })) : expandedMetric === 's-sessions' ? currentStore?.daily?.map((d: any) => ({ val: d.sessions, date: d.date })) : currentStore?.daily?.map((d: any) => ({ val: d.conversionRate, date: d.date })) || []} 
                    prevData={expandedMetric === 's-revenue' ? prevStore?.daily?.map((d: any) => ({ val: d.revenue, date: d.date })) : expandedMetric === 's-orders' ? prevStore?.daily?.map((d: any) => ({ val: d.orders, date: d.date })) : expandedMetric === 's-aov' ? prevStore?.daily?.map((d: any) => ({ val: d.aov, date: d.date })) : expandedMetric === 's-sessions' ? prevStore?.daily?.map((d: any) => ({ val: d.sessions, date: d.date })) : prevStore?.daily?.map((d: any) => ({ val: d.conversionRate, date: d.date })) || []}
                  />
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Meta Ads Section */}
        {profile?.meta_account_id && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-blue-500" /><h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Captación (Meta Ads)</h2></div>
            {fetchingMeta && !currentMeta ? (
              <div className="animate-pulse bg-zinc-100 dark:bg-zinc-800/50 rounded-[12px] h-[88px] w-full" />
            ) : currentMeta ? (
              <>
                <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden grid grid-cols-2 lg:flex overflow-x-auto scrollbar-hide">
                  <ShopifyMetric label="Inversión" value={`$ ${currentMeta.spend?.toLocaleString('es-AR', { maximumFractionDigits: 0 }) || 0}`} change={getMetaChange(currentMeta?.spend, prevMeta?.spend)} trend={(currentMeta?.spend || 0) >= (prevMeta?.spend || 0) ? 'up' : 'down'} data={metaDaily?.map((d: any) => ({ val: d.spend, date: d.date }))} color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === 'meta-inversion'} onClick={() => setExpandedMetric(expandedMetric === 'meta-inversion' ? null : 'meta-inversion')} />
                  <ShopifyMetric label="Alcance" value={currentMeta.reach?.toLocaleString('es-AR') || 0} change={getMetaChange(currentMeta?.reach, prevMeta?.reach)} trend={(currentMeta?.reach || 0) >= (prevMeta?.reach || 0) ? 'up' : 'down'} data={metaDaily?.map((d: any) => ({ val: d.reach, date: d.date }))} color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === 'meta-alcance'} onClick={() => setExpandedMetric(expandedMetric === 'meta-alcance' ? null : 'meta-alcance')} />
                  <ShopifyMetric label="Conv." value={currentMeta.results || 0} change={getMetaChange(currentMeta?.results, prevMeta?.results)} trend={(currentMeta?.results || 0) >= (prevMeta?.results || 0) ? 'up' : 'down'} data={metaDaily?.map((d: any) => ({ val: d.results, date: d.date }))} color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === 'meta-conv'} onClick={() => setExpandedMetric(expandedMetric === 'meta-conv' ? null : 'meta-conv')} />
                  <ShopifyMetric label="ROAS" value={`${currentMeta.roas?.toFixed(2) || 0}x`} change={getMetaChange(currentMeta?.roas, prevMeta?.roas)} trend={(currentMeta?.roas || 0) >= (prevMeta?.roas || 0) ? 'up' : 'down'} data={metaDaily?.map((d: any) => ({ val: d.roas, date: d.date }))} color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === 'meta-roas'} onClick={() => setExpandedMetric(expandedMetric === 'meta-roas' ? null : 'meta-roas')} />
                  <ShopifyMetric label="Retorno" value={`$ ${currentMeta.purchase_value?.toLocaleString('es-AR', { maximumFractionDigits: 0 }) || 0}`} change={getMetaChange(currentMeta?.purchase_value, prevMeta?.purchase_value)} trend={(currentMeta?.purchase_value || 0) >= (prevMeta?.purchase_value || 0) ? 'up' : 'down'} data={metaDaily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))} color={MAIN_COLOR} loading={fetchingMeta} active={expandedMetric === 'meta-roas-v'} onClick={() => setExpandedMetric(expandedMetric === 'meta-roas-v' ? null : 'meta-roas-v')} />
                </div>
                {expandedMetric?.startsWith('meta-') && (
                  <MetricDetailChart 
                    label={expandedMetric === 'meta-inversion' ? 'Inversión' : expandedMetric === 'meta-alcance' ? 'Alcance' : expandedMetric === 'meta-conv' ? 'Conversiones' : expandedMetric === 'meta-roas-v' ? 'Retorno' : 'ROAS'} 
                    color={MAIN_COLOR} 
                    data={expandedMetric === 'meta-inversion' ? metaDaily?.map((d: any) => ({ val: d.spend, date: d.date })) : expandedMetric === 'meta-alcance' ? metaDaily?.map((d: any) => ({ val: d.reach, date: d.date })) : expandedMetric === 'meta-conv' ? metaDaily?.map((d: any) => ({ val: d.results, date: d.date })) : expandedMetric === 'meta-roas-v' ? metaDaily?.map((d: any) => ({ val: d.purchase_value, date: d.date })) : metaDaily?.map((d: any) => ({ val: d.roas, date: d.date }))}
                    prevData={expandedMetric === 'meta-inversion' ? prevMetaDaily?.map((d: any) => ({ val: d.spend, date: d.date })) : expandedMetric === 'meta-alcance' ? prevMetaDaily?.map((d: any) => ({ val: d.reach, date: d.date })) : expandedMetric === 'meta-conv' ? prevMetaDaily?.map((d: any) => ({ val: d.results, date: d.date })) : expandedMetric === 'meta-roas-v' ? prevMetaDaily?.map((d: any) => ({ val: d.purchase_value, date: d.date })) : prevMetaDaily?.map((d: any) => ({ val: d.roas, date: d.date }))}
                  />
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Klaviyo Section */}
        {profile?.klaviyo_api_key && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Retención (Klaviyo)</h2>
            </div>
            {fetchingKlaviyo && !currentKlaviyo ? (
              <div className="animate-pulse bg-zinc-100 dark:bg-zinc-800/50 rounded-[12px] h-[88px] w-full" />
            ) : currentKlaviyo ? (
              <>
                <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden flex overflow-x-auto scrollbar-hide">
                  <ShopifyMetric label="Entregas" value={currentKlaviyo.sent?.toLocaleString('es-AR') || '0'} change={getKlaviyoChange(currentKlaviyo?.sent ?? 0, prevKlaviyo?.sent ?? 0)} trend={(currentKlaviyo?.sent || 0) >= (prevKlaviyo?.sent || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailySent || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-sent'} onClick={() => setExpandedMetric(expandedMetric === 'k-sent' ? null : 'k-sent')} />
                  <ShopifyMetric label="Tasa de Apertura" value={`${((currentKlaviyo.opens / (currentKlaviyo.sent || 1)) * 100).toFixed(1)}%`} change={getKlaviyoChange((currentKlaviyo?.opens ?? 0) / (currentKlaviyo?.sent || 1), (prevKlaviyo?.opens ?? 0) / (prevKlaviyo?.sent || 1))} trend={((currentKlaviyo?.opens ?? 0) / (currentKlaviyo?.sent || 1)) >= ((prevKlaviyo?.opens ?? 0) / (prevKlaviyo?.sent || 1)) ? 'up' : 'down'} data={currentKlaviyo?.dailyOpens?.map((d: any, i: number) => ({ val: ((d.val / (currentKlaviyo.dailySent[i]?.val || 1)) * 100), date: d.date })) || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-open-rate'} onClick={() => setExpandedMetric(expandedMetric === 'k-open-rate' ? null : 'k-open-rate')} />
                  <ShopifyMetric label="Tasa de Clics" value={`${((currentKlaviyo.clicks / (currentKlaviyo.sent || 1)) * 100).toFixed(1)}%`} change={getKlaviyoChange((currentKlaviyo?.clicks ?? 0) / (currentKlaviyo?.sent || 1), (prevKlaviyo?.clicks ?? 0) / (prevKlaviyo?.sent || 1))} trend={((currentKlaviyo?.clicks ?? 0) / (currentKlaviyo?.sent || 1)) >= ((prevKlaviyo?.clicks ?? 0) / (prevKlaviyo?.sent || 1)) ? 'up' : 'down'} data={currentKlaviyo?.dailyClicks?.map((d: any, i: number) => ({ val: ((d.val / (currentKlaviyo.dailySent[i]?.val || 1)) * 100), date: d.date })) || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-click-rate'} onClick={() => setExpandedMetric(expandedMetric === 'k-click-rate' ? null : 'k-click-rate')} />
                  <ShopifyMetric label="Ingresos Klaviyo" value={`$ ${currentKlaviyo.attributed?.toLocaleString('es-AR', { maximumFractionDigits: 0 }) || 0}`} change={getKlaviyoChange(currentKlaviyo?.attributed ?? 0, prevKlaviyo?.attributed ?? 0)} trend={(currentKlaviyo?.attributed || 0) >= (prevKlaviyo?.attributed || 0) ? 'up' : 'down'} data={currentKlaviyo?.dailyAttributed || []} color={MAIN_COLOR} loading={fetchingKlaviyo} active={expandedMetric === 'k-attr'} onClick={() => setExpandedMetric(expandedMetric === 'k-attr' ? null : 'k-attr')} />
                </div>
                {expandedMetric?.startsWith('k-') && (
                  <MetricDetailChart 
                    label={expandedMetric === 'k-revenue' ? 'Ingresos Tienda Online' : expandedMetric === 'k-attr' ? 'Ingresos Klaviyo' : expandedMetric === 'k-sent' ? 'Entregas' : expandedMetric === 'k-click-rate' ? 'Tasa de Clics' : 'Tasa de Apertura'} 
                    color={MAIN_COLOR} 
                    data={expandedMetric === 'k-revenue' ? (currentKlaviyo?.dailyRevenue || []) : expandedMetric === 'k-attr' ? (currentKlaviyo?.dailyAttributed || []) : expandedMetric === 'k-sent' ? (currentKlaviyo?.dailySent || []) : expandedMetric === 'k-click-rate' ? (currentKlaviyo?.dailyClicks?.map((d: any, i: number) => ({ val: ((d.val / (currentKlaviyo.dailySent[i]?.val || 1)) * 100), date: d.date })) || []) : (currentKlaviyo?.dailyOpens?.map((d: any, i: number) => ({ val: ((d.val / (currentKlaviyo.dailySent[i]?.val || 1)) * 100), date: d.date })) || [])}
                    prevData={expandedMetric === 'k-revenue' ? (prevKlaviyo?.dailyRevenue || []) : expandedMetric === 'k-attr' ? (prevKlaviyo?.dailyAttributed || []) : expandedMetric === 'k-sent' ? (prevKlaviyo?.dailySent || []) : expandedMetric === 'k-click-rate' ? (prevKlaviyo?.dailyClicks?.map((d: any, i: number) => ({ val: ((d.val / (prevKlaviyo?.dailySent[i]?.val || 1)) * 100), date: d.date })) || []) : (prevKlaviyo?.dailyOpens?.map((d: any, i: number) => ({ val: ((d.val / (prevKlaviyo?.dailySent[i]?.val || 1)) * 100), date: d.date })) || [])}
                  />
                )}
              </>
            ) : null}
          </div>
        )}

        {!profile?.meta_account_id && !profile?.klaviyo_api_key && !(profile as any)?.ecommerce_platform && (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <h3 className="text-zinc-500 font-medium mb-2">Aún no tienes módulos conectados</h3>
            <p className="text-[13px] text-zinc-400 max-w-md">Contacta con el administrador para que configure tus integraciones de Meta Ads, Klaviyo o tu Tienda y comiences a ver tus datos en tiempo real.</p>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.06] dark:border-white/[0.06] p-8 shadow-sm">
          <h2 className="text-[13px] font-bold text-zinc-900 dark:text-zinc-50 mb-8 tracking-tight">Evolución de Ingresos (Últimos 90 días)</h2>
          {fetching90d ? (
             <div className="h-[300px] flex items-center justify-center animate-pulse bg-zinc-50 dark:bg-zinc-800/50 rounded-xl" />
          ) : historical90d.length > 0 ? (
             <div className="h-[300px]">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={historical90d}>
                   <defs>
                     <linearGradient id="colorRev90" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor={MAIN_COLOR} stopOpacity={0.2} />
                       <stop offset="95%" stopColor={MAIN_COLOR} stopOpacity={0} />
                     </linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.1} />
                   <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a' }} minTickGap={30} tickFormatter={(val) => { const d = new Date(val); return `${d.getDate()}/${d.getMonth()+1}`; }} />
                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#71717a' }} tickFormatter={(val) => `$${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                   <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} itemStyle={{ color: '#fff', fontSize: '12px' }} labelStyle={{ color: '#a1a1aa', fontSize: '10px' }} formatter={(v: any) => [`$ ${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, 'Ingresos']} />
                   <Area type="monotone" dataKey="revenue" stroke={MAIN_COLOR} strokeWidth={2} fillOpacity={1} fill="url(#colorRev90)" />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
          ) : (
             <div className="h-[300px] flex flex-col items-center justify-center text-zinc-400 gap-4"><BarChart2 className="w-10 h-10 opacity-20" /><p className="text-[13px] font-medium opacity-60">Sin datos históricos</p></div>
          )}
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.06] dark:border-white/[0.06] p-8 shadow-sm">
          <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-8">Accesos Directos</h2>
          <div className="space-y-3">{links.length > 0 ? links.map(link => (<a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-transparent hover:border-blue-100 dark:hover:border-blue-900/30 hover:bg-white dark:hover:bg-zinc-800 transition-all group"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-blue-600 transition-colors">{link.icon === 'chat' ? <MessageSquare className="w-5 h-5" /> : link.icon === 'mail' ? <Mail className="w-5 h-5" /> : <ExternalLink className="w-5 h-5" />}</div><span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">{link.title}</span></div><ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-blue-600 transition-colors" /></a>)) : (<div className="text-center py-10"><p className="text-[12px] text-zinc-400 font-medium">No hay accesos configurados</p></div>)}</div>
        </div>
      </div>
    </div>
  );
}
