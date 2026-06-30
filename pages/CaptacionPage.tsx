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
  TrendingUp, Download, RefreshCw, Calendar, ChevronDown, ChevronRight,
  Users, DollarSign, Target, BarChart2, Globe, Smartphone, User, Megaphone, MessageSquare, Loader2,
  ImageIcon, ExternalLink, X
} from 'lucide-react';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import EmailLoader from '../components/ui/EmailLoader';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';


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

const fmt = (n: number, isCurrency = false) => {
  if (typeof n !== 'number') return '—';
  const showDecimals = isCurrency && (n < 10 || n % 1 !== 0);
  const options = showDecimals
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 };
  return isCurrency
    ? `$ ${n.toLocaleString('es-AR', options)}`
    : n.toLocaleString('es-AR', options);
};

const pct = (n: number) => `${Math.abs(n).toFixed(1)}%`;

const fmtVal = (v: number) => {
  if (!v) return '0';
  if (v >= 1000) return (v/1000).toFixed(1) + 'k';
  return v.toFixed(v < 10 ? 2 : 0);
};



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
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="text-[10px] font-bold text-zinc-300 text-center pb-2 uppercase tracking-tighter">{d}</div>)}
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

export default function CaptacionPage() {
  const { profile: authProfile } = useAuth();
  const { darkMode } = useTheme();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Date State
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('last_14d');
  const [activeSince, setActiveSince] = useState(presetToRange('last_14d').since);
  const [activeUntil, setActiveUntil] = useState(presetToRange('last_14d').until);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<DatePreset | 'custom'>(activePreset);
  const [pendingSince, setPendingSince] = useState(activeSince);
  const [pendingUntil, setPendingUntil] = useState(activeUntil);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [hovering, setHovering] = useState('');
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);

  // Data State
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<any[]>([]);
  const [prevDaily, setPrevDaily] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [prevSummary, setPrevSummary] = useState<any>(null);
  const isDateReloading = loading && !!summary;
  const [genderData, setGenderData] = useState<any[]>([]);
  const [regionData, setRegionData] = useState<any[]>([]);
  const [platformData, setPlatformData] = useState<any[]>([]);
  const [ageData, setAgeData] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<any[]>([]);
  const [expandedMetric, setExpandedMetric] = useState<string | null>('spend');
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});
  const [expandedAdsets, setExpandedAdsets] = useState<Record<string, boolean>>({});
  const [selectedCreative, setSelectedCreative] = useState<any | null>(null);

  const [prevProfileId, setPrevProfileId] = useState(profile?.id);
  if (profile?.id !== prevProfileId) {
    setPrevProfileId(profile?.id);
    setSummary(null);
    setPrevSummary(null);
    setDaily([]);
    setPrevDaily([]);
    setGenderData([]);
    setRegionData([]);
    setPlatformData([]);
    setAgeData([]);
    setCampaigns([]);
    setActiveCampaigns([]);
    setExpandedCampaigns({});
    setExpandedAdsets({});
    setSelectedCreative(null);
    setLoading(true);
  }


  const range = activePreset === 'custom' ? { since: activeSince, until: activeUntil } : presetToRange(activePreset);
  const prevRange = getPrevPeriod(range.since, range.until);

  const isEcom = profile?.client_tags?.includes('tienda_online') || !profile?.client_tags || profile.client_tags.length === 0;
  const isLead = profile?.client_tags?.includes('lead_gen');
  const isWpp = profile?.client_tags?.includes('whatsapp');
  
  const resultsLabel = isWpp ? 'Mensajes' : isLead ? 'Leads' : 'Compras';
  const cprLabel = isWpp ? 'Costo x Msj' : isLead ? 'CPL' : 'CPA';

  const extractActions = (actions: any[], type: 'purchases' | 'leads' | 'messages' | 'ig_followers' | 'fb_likes') => {
    if (!actions || !Array.isArray(actions)) return 0;
    if (type === 'messages') {
      const msg = actions.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d' || a.action_type === 'onsite_conversion.messaging_first_reply');
      if (msg) return parseFloat(msg.value || 0);
    }
    if (type === 'leads') {
      const lead = actions.find((a: any) => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead' || a.action_type === 'onsite_conversion.lead_grouped');
      if (lead) return parseFloat(lead.value || 0);
    }
    if (type === 'purchases') {
      const purchase = actions.find((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase' || a.action_type === 'omni_purchase');
      if (purchase) return parseFloat(purchase.value || 0);
    }
    if (type === 'ig_followers') {
      // Try every known Meta action_type for Instagram follows
      const follow = actions.find((a: any) => {
        const t: string = a.action_type || '';
        return (
          t === 'onsite_conversion.instagram_profile_follow' ||
          t === 'instagram_profile.follow' ||
          t === 'follow' ||
          t === 'ig_profile.follow' ||
          t === 'page_like_or_follow' ||
          (t.includes('instagram') && t.includes('follow')) ||
          t.includes('profile_follow') ||
          t.includes('follower')
        );
      });
      if (follow) return parseFloat(follow.value || 0);
    }
    if (type === 'fb_likes') {
      const like = actions.find((a: any) =>
        a.action_type === 'like' ||
        a.action_type === 'page_engagement'
      );
      if (like) return parseFloat(like.value || 0);
    }
    return 0;
  };

  const fetchIdRef = useRef(0);

  const fetchAll = async (fetchId: number) => {
    if (!profile?.meta_account_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const accountId = profile.meta_account_id;
      const settled = await Promise.allSettled([
        metaAds.getInsightsDaily(accountId, 'spend,reach,actions,action_values,purchase_roas,impressions', undefined, range),
        metaAds.getInsightsDaily(accountId, 'spend,reach,actions,action_values,purchase_roas,impressions', undefined, prevRange),
        metaAds.getInsightsBreakdown(accountId, 'gender', range),
        metaAds.getInsightsBreakdown(accountId, 'region', range),
        metaAds.getInsightsBreakdown(accountId, 'publisher_platform', range),
        metaAds.getInsightsBreakdown(accountId, 'age', range),
        metaAds.getInsightsAtCampaignLevel(accountId, 'campaign_name,spend,reach,actions,action_values,purchase_roas,objective', range),
        metaAds.getInsightsAtCampaignLevel(accountId, 'campaign_name,spend,reach,actions,action_values,purchase_roas,objective', prevRange),
        metaAds.getCampaigns(accountId),
        metaAds.getAccountAdsets(accountId),
        metaAds.getInsightsAtAdsetLevel(accountId, 'campaign_id,campaign_name,adset_id,adset_name,spend,reach,actions,action_values,purchase_roas,impressions,inline_link_clicks,inline_link_click_ctr', range),
        metaAds.getAdInsightsForAccount(accountId, 'ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend,reach,actions,action_values,purchase_roas,impressions,inline_link_clicks,inline_link_click_ctr', range),
        metaAds.getAccountAds(accountId),
      ]);
      const ok = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
        r.status === 'fulfilled' ? r.value : fallback;
      if (fetchId !== fetchIdRef.current) return;
      const [rawDaily, rawPrevDaily, gender, regions, platform, age, campaignInsights, prevCampaignInsights, rawCampaigns, rawAdsets, adsetInsights, adInsights, rawAds] = [
        ok(settled[0], []), ok(settled[1], []), ok(settled[2], []), ok(settled[3], []),
        ok(settled[4], []), ok(settled[5], []), ok(settled[6], []), ok(settled[7], []),
        ok(settled[8], { data: [] }), ok(settled[9], { data: [] }), ok(settled[10], []),
        ok(settled[11], []), ok(settled[12], { data: [] }),
      ];

      const processDaily = (raw: any[], r: any) => {
        const padded: any[] = [];
        let d = new Date(r.since + 'T12:00:00');
        const end = new Date(r.until + 'T12:00:00');
        let safetyLimit = 0;
        while (d <= end && safetyLimit++ < 400) {
          const iso = d.toISOString().split('T')[0];
          const match = raw.find((row: any) => row.date === iso);
          const purchases = extractActions(match?.actions, 'purchases');
          const leads = extractActions(match?.actions, 'leads');
          const messages = extractActions(match?.actions, 'messages');
          padded.push(match ? { ...match, purchases, leads, messages, date: iso } : { date: iso, spend: 0, reach: 0, purchases: 0, leads: 0, messages: 0, purchase_value: 0, roas: 0 });
          d.setDate(d.getDate() + 1);
        }
        return padded;
      };

      setDaily(processDaily(rawDaily, range));
      setPrevDaily(processDaily(rawPrevDaily, prevRange));

      // Reach must be taken from period-level campaign data (NOT summed daily)
      // because summing daily reach counts the same person multiple times.
      const calcSummaryFromCampaigns = (campaigns: any[], dailyRaw: any[]) => {
        // Use campaign-level data for reach (unique users for the whole period)
        const periodReach = campaigns.reduce((sum: number, c: any) => sum + parseInt(c.reach || 0), 0);
        // Use daily data for spend, conversions (they accumulate correctly daily)
        const tot = dailyRaw.reduce((a: any, row: any) => ({
          spend: a.spend + parseFloat(row.spend || 0),
          purchases: a.purchases + extractActions(row.actions, 'purchases'),
          leads: a.leads + extractActions(row.actions, 'leads'),
          messages: a.messages + extractActions(row.actions, 'messages'),
          purchase_value: a.purchase_value + parseFloat(row.purchase_value || 0),
          impressions: a.impressions + parseInt(row.impressions || 0),
        }), { spend: 0, purchases: 0, leads: 0, messages: 0, purchase_value: 0, impressions: 0 });
        tot.reach = periodReach;
        tot.roas = tot.spend ? tot.purchase_value / tot.spend : 0;
        tot.cpa = tot.purchases ? tot.spend / tot.purchases : 0;
        tot.cpl = tot.leads ? tot.spend / tot.leads : 0;
        tot.cpm = tot.messages ? tot.spend / tot.messages : 0;
        return tot;
      };

      setSummary(calcSummaryFromCampaigns(campaignInsights, rawDaily));
      setPrevSummary(calcSummaryFromCampaigns(prevCampaignInsights, rawPrevDaily));

      const getPrimaryResult = (actions: any[]) => {
        if (isEcom) return extractActions(actions, 'purchases');
        if (isLead) return extractActions(actions, 'leads');
        if (isWpp) return extractActions(actions, 'messages');
        return extractActions(actions, 'purchases');
      };

      setGenderData(gender.map((r: any) => ({
        name: r.gender === 'male' ? 'Hombre' : r.gender === 'female' ? 'Mujer' : 'Desconocido',
        key: r.gender, spend: parseFloat(r.spend || 0), reach: parseInt(r.reach || 0), results: getPrimaryResult(r.actions)
      })).sort((a: any, b: any) => b.spend - a.spend));

      setRegionData(regions.map((r: any) => ({
        name: r.region, spend: parseFloat(r.spend || 0), reach: parseInt(r.reach || 0), results: getPrimaryResult(r.actions)
      })).sort((a: any, b: any) => b.spend - a.spend).slice(0, 10));

      setPlatformData(platform.map((r: any) => ({
        name: r.publisher_platform,
        label: r.publisher_platform === 'facebook' ? 'Facebook' : r.publisher_platform === 'instagram' ? 'Instagram' : r.publisher_platform === 'audience_network' ? 'Audience Net.' : r.publisher_platform,
        spend: parseFloat(r.spend || 0), reach: parseInt(r.reach || 0), results: getPrimaryResult(r.actions)
      })).sort((a: any, b: any) => b.spend - a.spend));

      setAgeData(age.map((r: any) => ({
        name: r.age, spend: parseFloat(r.spend || 0), reach: parseInt(r.reach || 0), results: getPrimaryResult(r.actions)
      })).sort((a: any, b: any) => a.name.localeCompare(b.name)));

      setCampaigns(campaignInsights.map((c: any) => {
        const purchases = extractActions(c.actions, 'purchases');
        const leads = extractActions(c.actions, 'leads');
        const messages = extractActions(c.actions, 'messages');
        const ig_followers = extractActions(c.actions, 'ig_followers');
        const fb_likes = extractActions(c.actions, 'fb_likes');
        const spend = parseFloat(c.spend || 0);
        
        const nameUpper = c.campaign_name?.toUpperCase() || '';
        const objUpper = c.objective?.toUpperCase() || '';

        // Name signals take priority over objective (WAP/WHATSAPP before SALES)
        const nameIsWpp = nameUpper.includes('WAP') || nameUpper.includes('WPP') || nameUpper.includes('WHATSAPP') || nameUpper.includes('MENSAJ');
        const nameIsLead = nameUpper.includes('LEAD') || nameUpper.includes('POTENCIAL') || nameUpper.includes('FORMULARIO');
        const nameIsTraffic = nameUpper.includes('TRAFICO') || nameUpper.includes('COMUNIDAD') || nameUpper.includes('SEGUIDORES') || nameUpper.includes('INTERACCION');
        const nameIsSales = nameUpper.includes('VENTA') || nameUpper.includes('COMPRA') || nameUpper.includes('PURCHASE');

        let category = 'Otras Campañas';
        if (nameIsWpp) {
          category = 'Mensajes';
        } else if (nameIsLead) {
          category = 'Leads';
        } else if (nameIsTraffic) {
          category = 'Tráfico/Comunidad';
        } else if (nameIsSales) {
          category = 'Ventas';
        } else if (objUpper.includes('MESSAGES') || objUpper.includes('ENGAGEMENT')) {
          category = 'Mensajes';
        } else if (objUpper.includes('LEAD')) {
          category = 'Leads';
        } else if (objUpper.includes('SALES') || objUpper.includes('CONVERSIONS')) {
          category = 'Ventas';
        } else if (objUpper.includes('TRAFFIC') || objUpper.includes('AWARENESS') || objUpper.includes('REACH')) {
          category = 'Tráfico/Comunidad';
        } else {
          // Last resort: infer from actual results
          const maxResult = Math.max(purchases, leads, messages);
          if (maxResult > 0) {
            if (messages === maxResult) category = 'Mensajes';
            else if (leads === maxResult) category = 'Leads';
            else category = 'Ventas';
          }
        }

        const primaryMetric: 'purchases' | 'leads' | 'messages' | 'other' =
          category === 'Mensajes' ? 'messages'
          : category === 'Leads' ? 'leads'
          : category === 'Ventas' ? 'purchases'
          : 'other';

        return {
          id: c.campaign_id || c.campaign_name,
          name: c.campaign_name,
          spend,
          reach: parseInt(c.reach || 0),
          purchases,
          leads,
          messages,
          ig_followers,
          fb_likes,
          cpa: purchases ? spend / purchases : 0,
          cpl: leads ? spend / leads : 0,
          cpm: messages ? spend / messages : 0,
          purchase_value: parseFloat(c.action_values?.find((v: any) => v.action_type === 'purchase' || v.action_type === 'offsite_conversion.fb_pixel_purchase')?.value || 0),
          roas: parseFloat(c.purchase_roas?.[0]?.value || 0),
          category,
          primaryMetric,
        };
      }).sort((a: any, b: any) => b.spend - a.spend));

      // Process active campaigns (prendidas) and daily budget (CBO / ABO)
      const campaignsList = (rawCampaigns?.data || []) as any[];
      const adsetsList = (rawAdsets?.data || []) as any[];
      const adsList = (rawAds?.data || []) as any[];

      const getPurchaseValue = (values: any[] = []) => parseFloat(values?.find((v: any) =>
        v.action_type === 'purchase' ||
        v.action_type === 'offsite_conversion.fb_pixel_purchase' ||
        v.action_type === 'omni_purchase'
      )?.value || 0);

      const getMetrics = (source: any = {}) => {
        const spend = parseFloat(source.spend || 0);
        const purchases = extractActions(source.actions, 'purchases');
        const leads = extractActions(source.actions, 'leads');
        const messages = extractActions(source.actions, 'messages');
        const reach = parseInt(source.reach || 0);
        const purchaseValue = getPurchaseValue(source.action_values);
        const roas = parseFloat(source.purchase_roas?.[0]?.value || 0);
        return {
          spend,
          reach,
          purchases,
          leads,
          messages,
          results: purchases || leads || messages,
          resultLabel: purchases > 0 ? 'Ventas' : leads > 0 ? 'Leads' : messages > 0 ? 'Mensajes' : 'Resultados',
          purchaseValue,
          roas,
          cpa: purchases > 0 ? spend / purchases : 0,
          cpl: leads > 0 ? spend / leads : 0,
          cpm: messages > 0 ? spend / messages : 0,
          clicks: parseInt(source.inline_link_clicks || 0),
          ctr: parseFloat(source.inline_link_click_ctr || 0),
        };
      };

      const makeBudget = (daily?: string, lifetime?: string) => {
        const value = daily || lifetime;
        if (!value) return '—';
        return `$ ${(parseFloat(value) / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}${daily ? '/día' : ' total'}`;
      };

      const insightByAdId = new Map((adInsights || []).map((row: any) => [row.ad_id || row.ad_name, row]));

      const activeCamps = campaignsList
        .filter(c => c.status === 'ACTIVE')
        .map(c => {
          // Gasto en el período seleccionado (desde campaignInsights)
          const matchedInsight = campaignInsights.find((ci: any) => ci.campaign_id === c.id || ci.campaign_name === c.name);
          const spendInPeriod = matchedInsight ? parseFloat(matchedInsight.spend || 0) : 0;
          const reachInPeriod = matchedInsight ? parseInt(matchedInsight.reach || 0) : 0;
          
          // Determinar presupuesto diario
          let budgetStr = '';
          if (c.daily_budget) {
            budgetStr = `$ ${(parseFloat(c.daily_budget) / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}/día`;
          } else if (c.lifetime_budget) {
            budgetStr = `$ ${(parseFloat(c.lifetime_budget) / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })} total`;
          } else {
            // ABO - Sum budgets of active adsets
            const activeAdsetsForCamp = adsetsList.filter(a => a.campaign_id === c.id && a.status === 'ACTIVE');
            const totalDaily = activeAdsetsForCamp.reduce((sum, a) => sum + parseFloat(a.daily_budget || 0), 0);
            const totalLifetime = activeAdsetsForCamp.reduce((sum, a) => sum + parseFloat(a.lifetime_budget || 0), 0);
            
            if (totalDaily > 0) {
              budgetStr = `$ ${(totalDaily / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })}/día`;
            } else if (totalLifetime > 0) {
              budgetStr = `$ ${(totalLifetime / 100).toLocaleString('es-AR', { maximumFractionDigits: 0 })} total`;
            } else {
              budgetStr = '—';
            }
          }

          const metrics = getMetrics(matchedInsight || {});
          const visibleAdsets = [
            ...adsetsList.filter(a => a.campaign_id === c.id),
            ...(adsetInsights || [])
              .filter((row: any) => row.campaign_id === c.id && !adsetsList.some(a => a.id === row.adset_id))
              .map((row: any) => ({ id: row.adset_id || row.adset_name, name: row.adset_name || 'Conjunto sin nombre', campaign_id: c.id, status: 'ACTIVE' })),
          ];

          const adsets = visibleAdsets.map((adset: any) => {
            const matchedAdsetInsight = (adsetInsights || []).find((row: any) =>
              row.adset_id === adset.id || row.adset_name === adset.name
            );
            const adsetMetrics = getMetrics(matchedAdsetInsight || {});
            const ads = adsList
              .filter((ad: any) => ad.adset_id === adset.id || (!ad.adset_id && ad.campaign_id === c.id))
              .map((ad: any) => {
                const insight = insightByAdId.get(ad.id) || insightByAdId.get(ad.name) || {};
                const adMetrics = getMetrics(insight);
                const creative = ad.creative || {};
                return {
                  ...ad,
                  ...adMetrics,
                  thumbnail: creative.thumbnail_url || creative.image_url || '',
                  previewUrl: ad.preview_shareable_link || creative.instagram_permalink_url || '',
                  creativeName: creative.name || ad.name,
                };
              })
              .sort((a: any, b: any) => b.spend - a.spend);

            return {
              id: adset.id,
              name: adset.name,
              status: adset.status || adset.effective_status || 'ACTIVE',
              budgetStr: makeBudget(adset.daily_budget, adset.lifetime_budget),
              optimizationGoal: adset.optimization_goal,
              ...adsetMetrics,
              ads,
            };
          }).sort((a: any, b: any) => b.spend - a.spend);

          return {
            id: c.id,
            name: c.name,
            status: c.status,
            budgetStr,
            spendInPeriod,
            reachInPeriod,
            results: metrics.results,
            resultLabel: metrics.resultLabel,
            purchases: metrics.purchases,
            leads: metrics.leads,
            messages: metrics.messages,
            cpa: metrics.cpa,
            cpl: metrics.cpl,
            cpm: metrics.cpm,
            roas: metrics.roas,
            purchaseValue: metrics.purchaseValue,
            adsets,
          };
        })
        .sort((a, b) => b.spendInPeriod - a.spendInPeriod);

      setActiveCampaigns(activeCamps);

    } catch (e) { console.error('CaptacionPage fetch error:', e); } finally { setLoading(false); }
  };

  useEffect(() => {
    const id = ++fetchIdRef.current;
    const timer = setTimeout(() => { fetchAll(id); }, 150);
    return () => clearTimeout(timer);
  }, [profile?.id, activeSince, activeUntil, activePreset]);

  // Click outside date picker
  useEffect(() => {
    const click = (e: MouseEvent) => { if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) setShowDatePicker(false); };
    document.addEventListener('mousedown', click); return () => document.removeEventListener('mousedown', click);
  }, []);


  const handleApply = () => {
    setActivePreset(pendingPreset);
    setActiveSince(pendingSince);
    setActiveUntil(pendingUntil || pendingSince);
    setShowDatePicker(false);
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

  const objectiveLabel = (obj: string) => ({ OUTCOME_SALES: 'Ventas', OUTCOME_LEADS: 'Leads', OUTCOME_AWARENESS: 'Reconocimiento', OUTCOME_TRAFFIC: 'Tráfico', OUTCOME_ENGAGEMENT: 'Interacción', OUTCOME_APP_PROMOTION: 'App', MESSAGES: 'Mensajes', CONVERSIONS: 'Conversiones', LINK_CLICKS: 'Clics', BRAND_AWARENESS: 'Awareness', REACH: 'Alcance', VIDEO_VIEWS: 'Vistas' }[obj] || obj);
  const goalLabel = (goal: string) => ({ OFFSITE_CONVERSIONS: 'Conversiones', LINK_CLICKS: 'Clics', REACH: 'Alcance', IMPRESSIONS: 'Impresiones', LEAD_GENERATION: 'Leads', REPLIES: 'Respuestas', THRUPLAY: 'Video', CONVERSATIONS: 'Mensajes', PAGE_LIKES: 'Me gustas', ENGAGED_USERS: 'Engagement', VALUE: 'Valor' }[goal] || goal);
  const fmtBudget = (daily?: string, lifetime?: string) => { const v = daily || lifetime; if (!v) return '—'; return `$ ${parseFloat(v).toLocaleString('es-AR', { maximumFractionDigits: 0 })}${daily ? '/día' : ' total'}`; };

  // Obsolete accordion helper functions removed.

  const fmtDateRange = (d: string) => {
    if (!d) return '';
    const parts = d.split('-');
    if (parts.length < 3) return d;
    const month = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(parts[1])-1];
    return `${parts[2]} ${month}`;
  };

  const getChange = (curr: number | undefined | null, prev: number | undefined | null) =>
    (curr == null || prev == null || prev === 0) ? undefined : ((curr - prev) / prev) * 100;

  const getTrend = (curr: number | undefined | null, prev: number | undefined | null, isCost = false): 'up' | 'down' => {
    const change = getChange(curr, prev);
    if (change === undefined) return 'up';
    if (isCost) return change <= 0 ? 'up' : 'down';
    return change >= 0 ? 'up' : 'down';
  };

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
  const chartColor = (trendValue !== undefined && trendValue > 5) ? GREEN : (trendValue !== undefined && trendValue < -5) ? RED : BLUE;
  const gradientId = `grad-${expandedMetric}`;

  const toggleCampaign = (id: string) => setExpandedCampaigns(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleAdset = (id: string) => setExpandedAdsets(prev => ({ ...prev, [id]: !prev[id] }));

  const ResultMetric = ({ label, value, sub, tone = 'default' }: any) => (
    <div className="rounded-xl border border-black/[0.05] dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-3 py-2">
      <span className="block text-[8px] font-black uppercase tracking-wider text-zinc-400">{label}</span>
      <span className={`block text-[12px] font-black tabular-nums ${tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-500' : 'text-zinc-850 dark:text-zinc-100'}`}>{value}</span>
      {sub && <span className="block text-[9px] font-semibold text-zinc-400 tabular-nums">{sub}</span>}
    </div>
  );

  const PerformanceCell = ({ value, unitCost, tone = 'default' }: any) => (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`text-[12px] font-black tabular-nums ${tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-500' : value && value !== '—' ? 'text-zinc-800 dark:text-zinc-100' : 'text-zinc-400'}`}>
        {value || '—'}
      </span>
      {unitCost > 0 && (
        <span className="text-[9px] text-zinc-450 dark:text-zinc-500 font-medium tabular-nums">{fmt(unitCost, true)} c/u</span>
      )}
    </div>
  );

  const renderAdsetTree = (camp: any) => {
    const adsets = camp.adsets || [];
    if (!adsets.length) {
      return <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-5 text-center text-[12px] font-semibold text-zinc-400">Meta no devolvió conjuntos de anuncios para esta campaña.</div>;
    }

    return (
      <div className="space-y-3">
        {adsets.map((adset: any) => {
          const adsetOpen = !!expandedAdsets[adset.id];
          return (
            <div key={adset.id} className="rounded-2xl border border-zinc-100 dark:border-zinc-800/70 bg-white dark:bg-zinc-950/40 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left border-collapse">
                  <tbody>
                    <tr className="bg-zinc-50/80 dark:bg-white/[0.025] hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors">
                      <td className="py-3 pr-4 pl-3 w-[320px]">
                        <button onClick={() => toggleAdset(adset.id)} className="flex items-center gap-2 text-left min-w-0">
                          <ChevronRight className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${adsetOpen ? 'rotate-90' : ''}`} />
                          <span className="text-[9px] font-extrabold px-1.5 py-[2px] rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/10 uppercase tracking-wider shrink-0">Set</span>
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 leading-snug truncate">{adset.name}</p>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">{adset.ads?.length || 0} anuncios</p>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right"><span className="text-[12px] font-black text-zinc-800 dark:text-zinc-100 tabular-nums">{fmt(adset.spend, true)}</span></td>
                      <td className="py-3 px-4 text-right"><PerformanceCell value={adset.purchases > 0 ? adset.purchases : '—'} unitCost={adset.cpa} tone={adset.purchases ? 'good' : 'default'} /></td>
                      <td className="py-3 px-4 text-right"><PerformanceCell value={adset.leads > 0 ? adset.leads : '—'} unitCost={adset.cpl} tone={adset.leads ? 'good' : 'default'} /></td>
                      <td className="py-3 px-4 text-right"><PerformanceCell value={adset.messages > 0 ? adset.messages : '—'} unitCost={adset.cpm} tone={adset.messages ? 'good' : 'default'} /></td>
                      <td className="py-3 px-4 text-right">
                        <span className={`text-[12px] font-black tabular-nums ${adset.roas > 0 ? (adset.roas >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500') : 'text-zinc-400'}`}>{adset.roas > 0 ? adset.roas.toFixed(1) : '—'}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`text-[12px] font-black tabular-nums ${adset.purchaseValue > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>{adset.purchaseValue > 0 ? fmt(adset.purchaseValue, true) : '—'}</span>
                      </td>
                      <td className="py-3 pl-4 pr-3 text-right"><span className="text-[12px] font-black text-zinc-800 dark:text-zinc-100 tabular-nums">{adset.budgetStr}</span></td>
                    </tr>

                    {adsetOpen && (
                      adset.ads?.length ? adset.ads.map((ad: any) => (
                        <tr key={ad.id} className="border-t border-zinc-100 dark:border-zinc-800/70 hover:bg-zinc-50/60 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 pr-4 pl-9">
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                onClick={() => setSelectedCreative({ ad, adset, camp })}
                                className="w-9 h-9 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group shrink-0"
                                title="Ver creativo"
                              >
                                {ad.thumbnail ? <img src={ad.thumbnail} alt={ad.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <ImageIcon className="w-4 h-4 text-zinc-400" />}
                              </button>
                              <div className="min-w-0">
                                <p className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 leading-snug truncate">{ad.name}</p>
                                <button onClick={() => setSelectedCreative({ ad, adset, camp })} className="text-[9px] font-black text-blue-500 uppercase tracking-wider hover:text-blue-600 inline-flex items-center gap-1">
                                  Ver creativo <ExternalLink className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right"><span className="text-[12px] font-black text-zinc-800 dark:text-zinc-100 tabular-nums">{fmt(ad.spend, true)}</span></td>
                          <td className="py-2.5 px-4 text-right"><PerformanceCell value={ad.purchases > 0 ? ad.purchases : '—'} unitCost={ad.cpa} tone={ad.purchases ? 'good' : 'default'} /></td>
                          <td className="py-2.5 px-4 text-right"><PerformanceCell value={ad.leads > 0 ? ad.leads : '—'} unitCost={ad.cpl} tone={ad.leads ? 'good' : 'default'} /></td>
                          <td className="py-2.5 px-4 text-right"><PerformanceCell value={ad.messages > 0 ? ad.messages : '—'} unitCost={ad.cpm} tone={ad.messages ? 'good' : 'default'} /></td>
                          <td className="py-2.5 px-4 text-right">
                            <span className={`text-[12px] font-black tabular-nums ${ad.roas > 0 ? (ad.roas >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500') : 'text-zinc-400'}`}>{ad.roas > 0 ? ad.roas.toFixed(1) : '—'}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span className={`text-[12px] font-black tabular-nums ${ad.purchaseValue > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>{ad.purchaseValue > 0 ? fmt(ad.purchaseValue, true) : '—'}</span>
                          </td>
                          <td className="py-2.5 pl-4 pr-3 text-right"><span className="text-[12px] font-black text-zinc-400 tabular-nums">—</span></td>
                        </tr>
                      )) : (
                        <tr className="border-t border-zinc-100 dark:border-zinc-800/70">
                          <td colSpan={8} className="py-5 text-center text-[12px] font-semibold text-zinc-400">No hay anuncios visibles para este conjunto.</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <CenteredPageLoader isLoading={false}>

    <div className="w-full space-y-8 print:space-y-6 print:p-0 pt-4 md:pt-6 print:max-w-none">
      {/* Header */}
      <div className="page-header print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 flex items-center justify-center overflow-hidden shrink-0">
              <img src="/assets/meta (1).webp" alt="Meta Ads" className="w-8 h-8 object-contain" />
            </div>
            <h1 className="page-title">Meta Ads</h1>
          </div>
          <p className="page-subtitle">Análisis detallado por regiones, demografía y plataformas.</p>
        </div>
        
        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1 py-0.5 md:py-1 shadow-sm h-9 md:h-10 relative z-20" ref={datePickerRef}>
            <button onClick={() => setShowDatePicker(!showDatePicker)} className="flex items-center gap-1.5 px-3 h-7 md:h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group text-[11px] md:text-[12.5px]">
              {loading && summary ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              ) : (
                <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors" />
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
                      <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }} className={`flex-shrink-0 text-center md:text-left px-2.5 py-1 md:px-3 md:py-1.5 rounded-[10px] text-[12px] md:text-[12px] font-bold transition-all whitespace-nowrap ${pendingPreset === p.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
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
        <p className="text-[13px] text-zinc-500 font-medium">Captación — Meta Ads</p>
        <p className="text-[15px] font-bold text-zinc-900">Período: {activeSince === activeUntil ? fmtDateRange(activeSince) : `${fmtDateRange(activeSince)} — ${fmtDateRange(activeUntil)}`}</p>
      </div>

      <div>
        {/* KPI Cards */}
        {summary || loading ? (

        <div className="space-y-6">
          {(() => {
            const activeTagsCount = [isEcom, isLead, isWpp].filter(Boolean).length;
            
            // Single row if only 1 tag is active (or none, defaulting to Ecom)
            if (activeTagsCount <= 1) {
              const getVal = (d: any) =>
                expandedMetric === 'spend' ? d.spend :
                expandedMetric === 'reach' ? d.reach :
                expandedMetric === 'purchases' ? d.purchases :
                expandedMetric === 'revenue' ? d.purchase_value :
                expandedMetric === 'roas' ? d.roas :
                expandedMetric === 'leads' ? d.leads :
                expandedMetric === 'cpl' ? (d.leads ? d.spend / d.leads : 0) :
                expandedMetric === 'messages' ? d.messages :
                expandedMetric === 'cpm' ? (d.messages ? d.spend / d.messages : 0) : 0;
              const sChartData = daily?.map((d: any) => ({ val: getVal(d), date: d.date }));
              const sPrevData = prevDaily?.map((d: any) => ({ val: getVal(d), date: d.date }));
              const sLabel = expandedMetric === 'spend' ? 'Inversión' : expandedMetric === 'reach' ? 'Alcance' : expandedMetric === 'purchases' ? 'Compras' : expandedMetric === 'revenue' ? 'Retorno' : expandedMetric === 'roas' ? 'ROAS' : expandedMetric === 'leads' ? 'Leads' : expandedMetric === 'cpl' ? 'CPL' : expandedMetric === 'messages' ? 'Mensajes' : 'Costo x Msj';
              const singleLabels = isEcom 
                ? ['Inversión', 'Alcance', 'Compras', 'ROAS', 'Retorno']
                : isLead
                ? ['Inversión', 'Alcance', 'Leads', 'CPL']
                : ['Inversión', 'Alcance', 'Mensajes', 'Costo x Msj'];
              return (
                <>
                  <EmailLoader loading={loading} color={BLUE} labels={singleLabels} duration={700}>
                    {summary ? (
                      <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                        <DashboardMetric icon={DollarSign} label="Inversión" value={fmt(summary?.spend || 0, true)} change={getChange(summary?.spend, prevSummary?.spend)} trend={getTrend(summary?.spend, prevSummary?.spend)} data={daily?.map((d: any) => ({ val: d.spend, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'spend'} onClick={() => setExpandedMetric(expandedMetric === 'spend' ? null : 'spend')} info="Inversión total acumulada en Meta Ads para la cuenta seleccionada durante el período." />
                        <DashboardMetric icon={Users} label="Alcance" value={fmt(summary?.reach || 0)} change={getChange(summary?.reach, prevSummary?.reach)} trend={getTrend(summary?.reach, prevSummary?.reach)} data={daily?.map((d: any) => ({ val: d.reach, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'reach'} onClick={() => setExpandedMetric(expandedMetric === 'reach' ? null : 'reach')} info="Número de personas únicas que vieron tus anuncios al menos una vez en el período." />
                        {isEcom && (
                          <>
                            <DashboardMetric icon={Target} label="Compras" value={fmt(summary?.purchases || 0)} change={getChange(summary?.purchases, prevSummary?.purchases)} trend={getTrend(summary?.purchases, prevSummary?.purchases)} data={daily?.map((d: any) => ({ val: d.purchases, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'purchases'} onClick={() => setExpandedMetric(expandedMetric === 'purchases' ? null : 'purchases')} info="Cantidad total de eventos de compra en el sitio atribuidos a tus campañas en Facebook/Instagram." />
                            <DashboardMetric icon={BarChart2} label="ROAS" value={`${(summary?.roas || 0).toFixed(1)}`} change={getChange(summary?.roas, prevSummary?.roas)} trend={getTrend(summary?.roas, prevSummary?.roas)} data={daily?.map((d: any) => ({ val: d.roas, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'roas'} onClick={() => setExpandedMetric(expandedMetric === 'roas' ? null : 'roas')} info="Retorno de la Inversión Publicitaria (Return on Ad Spend). Se calcula dividiendo el valor de conversión de compras entre el total invertido." />
                            <DashboardMetric icon={DollarSign} label="Retorno" value={fmt(summary?.purchase_value || 0, true)} change={getChange(summary?.purchase_value, prevSummary?.purchase_value)} trend={getTrend(summary?.purchase_value, prevSummary?.purchase_value)} data={daily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'revenue'} onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')} info="Valor total estimado de ingresos generados a partir de las compras atribuidas a tus anuncios." />
                          </>
                        )}
                        {isLead && (
                          <>
                            <DashboardMetric icon={Target} label="Leads" value={fmt(summary?.leads || 0)} change={getChange(summary?.leads, prevSummary?.leads)} trend={getTrend(summary?.leads, prevSummary?.leads)} data={daily?.map((d: any) => ({ val: d.leads, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'leads'} onClick={() => setExpandedMetric(expandedMetric === 'leads' ? null : 'leads')} info="Cantidad de contactos o clientes potenciales (leads) captados a través de formularios de tus anuncios." />
                            <DashboardMetric icon={DollarSign} label="CPL" value={fmt(summary?.cpl || 0, true)} change={getChange(summary?.cpl, prevSummary?.cpl)} trend={getTrend(summary?.cpl, prevSummary?.cpl, true)} data={daily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpl'} onClick={() => setExpandedMetric(expandedMetric === 'cpl' ? null : 'cpl')} info="Costo por Lead. Promedio invertido para obtener cada cliente potencial (inversión total / leads)." />
                          </>
                        )}
                        {isWpp && (
                          <>
                            <DashboardMetric icon={MessageSquare} label="Mensajes" value={fmt(summary?.messages || 0)} change={getChange(summary?.messages, prevSummary?.messages)} trend={getTrend(summary?.messages, prevSummary?.messages)} data={daily?.map((d: any) => ({ val: d.messages, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'messages'} onClick={() => setExpandedMetric(expandedMetric === 'messages' ? null : 'messages')} info="Conversaciones de mensajes de texto de clientes nuevas o iniciadas a partir de clics en tus anuncios." />
                            <DashboardMetric icon={DollarSign} label="Costo x Msj" value={fmt(summary?.cpm || 0, true)} change={getChange(summary?.cpm, prevSummary?.cpm)} trend={getTrend(summary?.cpm, prevSummary?.cpm, true)} data={daily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpm'} onClick={() => setExpandedMetric(expandedMetric === 'cpm' ? null : 'cpm')} info="Costo promedio pagado por cada conversación de mensajería iniciada desde un anuncio." />
                          </>
                        )}
                      </div>
                    ) : null}
                  </EmailLoader>
                  {summary && expandedMetric && !loading && <MetricDetailChart label={sLabel} color={BLUE} data={sChartData} prevData={sPrevData} />}
                </>
              );
            }

            // Helper: returns the MetricDetailChart if the expanded metric belongs to a given group
            const generalMetrics = ['spend', 'reach'];
            const ecomMetrics = ['purchases', 'roas', 'revenue'];
            const leadMetrics = ['leads', 'cpl'];
            const wppMetrics = ['messages', 'cpm'];

            const chartData = expandedMetric ? (
              expandedMetric === 'spend' ? daily?.map((d: any) => ({ val: d.spend, date: d.date })) :
              expandedMetric === 'reach' ? daily?.map((d: any) => ({ val: d.reach, date: d.date })) :
              expandedMetric === 'purchases' ? daily?.map((d: any) => ({ val: d.purchases, date: d.date })) :
              expandedMetric === 'revenue' ? daily?.map((d: any) => ({ val: d.purchase_value, date: d.date })) :
              expandedMetric === 'roas' ? daily?.map((d: any) => ({ val: d.roas, date: d.date })) :
              expandedMetric === 'leads' ? daily?.map((d: any) => ({ val: d.leads, date: d.date })) :
              expandedMetric === 'cpl' ? daily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date })) :
              expandedMetric === 'messages' ? daily?.map((d: any) => ({ val: d.messages, date: d.date })) :
              expandedMetric === 'cpm' ? daily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date })) : []
            ) : [];
            const prevChartData = expandedMetric ? (
              expandedMetric === 'spend' ? prevDaily?.map((d: any) => ({ val: d.spend, date: d.date })) :
              expandedMetric === 'reach' ? prevDaily?.map((d: any) => ({ val: d.reach, date: d.date })) :
              expandedMetric === 'purchases' ? prevDaily?.map((d: any) => ({ val: d.purchases, date: d.date })) :
              expandedMetric === 'revenue' ? prevDaily?.map((d: any) => ({ val: d.purchase_value, date: d.date })) :
              expandedMetric === 'roas' ? prevDaily?.map((d: any) => ({ val: d.roas, date: d.date })) :
              expandedMetric === 'leads' ? prevDaily?.map((d: any) => ({ val: d.leads, date: d.date })) :
              expandedMetric === 'cpl' ? prevDaily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date })) :
              expandedMetric === 'messages' ? prevDaily?.map((d: any) => ({ val: d.messages, date: d.date })) :
              expandedMetric === 'cpm' ? prevDaily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date })) : []
            ) : [];
            const chartLabel = expandedMetric === 'spend' ? 'Inversión' : expandedMetric === 'reach' ? 'Alcance' : expandedMetric === 'purchases' ? 'Compras' : expandedMetric === 'revenue' ? 'Retorno' : expandedMetric === 'roas' ? 'ROAS' : expandedMetric === 'leads' ? 'Leads' : expandedMetric === 'cpl' ? 'CPL' : expandedMetric === 'messages' ? 'Mensajes' : 'Costo x Msj';

            const InlineChart = ({ forGroup }: { forGroup: string[] }) => (
              expandedMetric && !loading && forGroup.includes(expandedMetric) ? (
                <MetricDetailChart label={chartLabel} color={BLUE} data={chartData} prevData={prevChartData} />
              ) : null
            );

            // Multiple rows for grouped layout when > 1 tag is active
            return (
              <>
                <div className="space-y-2">
                  <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><BarChart2 className="w-3.5 h-3.5" /> Métricas Generales</h3>
                  <EmailLoader loading={loading} color={BLUE} labels={['Inversión', 'Alcance']} duration={700}>
                    {summary ? (
                      <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                        <DashboardMetric icon={DollarSign} label="Inversión" value={fmt(summary?.spend || 0, true)} change={getChange(summary?.spend, prevSummary?.spend)} trend={getTrend(summary?.spend, prevSummary?.spend)} data={daily?.map((d: any) => ({ val: d.spend, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'spend'} onClick={() => setExpandedMetric(expandedMetric === 'spend' ? null : 'spend')} info="Inversión total acumulada en Meta Ads para la cuenta seleccionada durante el período." />
                        <DashboardMetric icon={Users} label="Alcance" value={fmt(summary?.reach || 0)} change={getChange(summary?.reach, prevSummary?.reach)} trend={getTrend(summary?.reach, prevSummary?.reach)} data={daily?.map((d: any) => ({ val: d.reach, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'reach'} onClick={() => setExpandedMetric(expandedMetric === 'reach' ? null : 'reach')} info="Número de personas únicas que vieron tus anuncios al menos una vez en el período." />
                      </div>
                    ) : null}
                  </EmailLoader>
                  {summary && <InlineChart forGroup={generalMetrics} />}
                </div>

                {/* When 3 tags: Ecom + Leads side by side, Mensajes full width below
                    When 2 tags: both side by side
                    Grid is always controlled per combination */}
                {activeTagsCount === 3 ? (
                  <div className="space-y-6">
                    {/* Row 1: Ecom (left, 2-col) + Leads (right, 2-col) */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {isEcom && (
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> Tienda Online</h3>
                          <EmailLoader loading={loading} color={BLUE} labels={['Compras', 'ROAS', 'Retorno']} duration={700}>
                            {summary ? (
                              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 md:grid-cols-3 overflow-hidden scrollbar-hide">
                                <DashboardMetric icon={Target} label="Compras" value={fmt(summary?.purchases || 0)} change={getChange(summary?.purchases, prevSummary?.purchases)} trend={getTrend(summary?.purchases, prevSummary?.purchases)} data={daily?.map((d: any) => ({ val: d.purchases, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'purchases'} onClick={() => setExpandedMetric(expandedMetric === 'purchases' ? null : 'purchases')} info="Cantidad total de eventos de compra en el sitio atribuidos a tus campañas en Facebook/Instagram." />
                                <DashboardMetric icon={BarChart2} label="ROAS" value={`${(summary?.roas || 0).toFixed(1)}`} change={getChange(summary?.roas, prevSummary?.roas)} trend={getTrend(summary?.roas, prevSummary?.roas)} data={daily?.map((d: any) => ({ val: d.roas, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'roas'} onClick={() => setExpandedMetric(expandedMetric === 'roas' ? null : 'roas')} info="Retorno de la Inversión Publicitaria (Return on Ad Spend). Se calcula dividiendo el valor de conversión de compras entre el total invertido." />
                                <DashboardMetric icon={DollarSign} label="Retorno" value={fmt(summary?.purchase_value || 0, true)} change={getChange(summary?.purchase_value, prevSummary?.purchase_value)} trend={getTrend(summary?.purchase_value, prevSummary?.purchase_value)} data={daily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'revenue'} onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')} info="Valor total estimado de ingresos generados a partir de las compras atribuidas a tus anuncios." />
                              </div>
                            ) : null}
                          </EmailLoader>
                        </div>
                      )}
                      {isLead && (
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Clientes Potenciales</h3>
                          <EmailLoader loading={loading} color={BLUE} labels={['Leads', 'CPL']} duration={700}>
                            {summary ? (
                              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 overflow-hidden scrollbar-hide">
                                <DashboardMetric icon={Target} label="Leads" value={fmt(summary?.leads || 0)} change={getChange(summary?.leads, prevSummary?.leads)} trend={getTrend(summary?.leads, prevSummary?.leads)} data={daily?.map((d: any) => ({ val: d.leads, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'leads'} onClick={() => setExpandedMetric(expandedMetric === 'leads' ? null : 'leads')} info="Cantidad de contactos o clientes potenciales (leads) captados a través de formularios de tus anuncios." />
                                <DashboardMetric icon={DollarSign} label="CPL" value={fmt(summary?.cpl || 0, true)} change={getChange(summary?.cpl, prevSummary?.cpl)} trend={getTrend(summary?.cpl, prevSummary?.cpl, true)} data={daily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpl'} onClick={() => setExpandedMetric(expandedMetric === 'cpl' ? null : 'cpl')} info="Costo por Lead. Promedio invertido para obtener cada cliente potencial (inversión total / leads)." />
                              </div>
                            ) : null}
                          </EmailLoader>
                        </div>
                      )}
                    </div>
                    {/* Full-width chart spanning both columns */}
                    <InlineChart forGroup={[...ecomMetrics, ...leadMetrics]} />
                    {/* Row 2: Mensajes full width */}
                    {isWpp && (
                      <div className="space-y-2">
                        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" /> Mensajes (WhatsApp)</h3>
                        <EmailLoader loading={loading} color={BLUE} labels={['Mensajes', 'Costo x Msj']} duration={700}>
                          {summary ? (
                            <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                              <DashboardMetric icon={MessageSquare} label="Mensajes" value={fmt(summary?.messages || 0)} change={getChange(summary?.messages, prevSummary?.messages)} trend={getTrend(summary?.messages, prevSummary?.messages)} data={daily?.map((d: any) => ({ val: d.messages, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'messages'} onClick={() => setExpandedMetric(expandedMetric === 'messages' ? null : 'messages')} info="Conversaciones de mensajes de texto de clientes nuevas o iniciadas a partir de clics en tus anuncios." />
                              <DashboardMetric icon={DollarSign} label="Costo x Msj" value={fmt(summary?.cpm || 0, true)} change={getChange(summary?.cpm, prevSummary?.cpm)} trend={getTrend(summary?.cpm, prevSummary?.cpm, true)} data={daily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpm'} onClick={() => setExpandedMetric(expandedMetric === 'cpm' ? null : 'cpm')} info="Costo promedio pagado por cada conversación de mensajería iniciada desde un anuncio." />
                            </div>
                          ) : null}
                        </EmailLoader>
                        <InlineChart forGroup={wppMetrics} />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {isEcom && (
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> Tienda Online</h3>
                          <EmailLoader loading={loading} color={BLUE} labels={['Compras', 'ROAS', 'Retorno']} duration={700}>
                            {summary ? (
                              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                                <DashboardMetric icon={Target} label="Compras" value={fmt(summary?.purchases || 0)} change={getChange(summary?.purchases, prevSummary?.purchases)} trend={getTrend(summary?.purchases, prevSummary?.purchases)} data={daily?.map((d: any) => ({ val: d.purchases, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'purchases'} onClick={() => setExpandedMetric(expandedMetric === 'purchases' ? null : 'purchases')} info="Cantidad total de eventos de compra en el sitio atribuidos a tus campañas en Facebook/Instagram." />
                                <DashboardMetric icon={BarChart2} label="ROAS" value={`${(summary?.roas || 0).toFixed(1)}`} change={getChange(summary?.roas, prevSummary?.roas)} trend={getTrend(summary?.roas, prevSummary?.roas)} data={daily?.map((d: any) => ({ val: d.roas, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'roas'} onClick={() => setExpandedMetric(expandedMetric === 'roas' ? null : 'roas')} info="Retorno de la Inversión Publicitaria (Return on Ad Spend). Se calcula dividiendo el valor de conversión de compras entre el total invertido." />
                                <DashboardMetric icon={DollarSign} label="Retorno" value={fmt(summary?.purchase_value || 0, true)} change={getChange(summary?.purchase_value, prevSummary?.purchase_value)} trend={getTrend(summary?.purchase_value, prevSummary?.purchase_value)} data={daily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'revenue'} onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')} info="Valor total estimado de ingresos generados a partir de las compras atribuidas a tus anuncios." />
                              </div>
                            ) : null}
                          </EmailLoader>
                        </div>
                      )}
                      {isLead && (
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Clientes Potenciales</h3>
                          <EmailLoader loading={loading} color={BLUE} labels={['Leads', 'CPL']} duration={700}>
                            {summary ? (
                              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                                <DashboardMetric icon={Target} label="Leads" value={fmt(summary?.leads || 0)} change={getChange(summary?.leads, prevSummary?.leads)} trend={getTrend(summary?.leads, prevSummary?.leads)} data={daily?.map((d: any) => ({ val: d.leads, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'leads'} onClick={() => setExpandedMetric(expandedMetric === 'leads' ? null : 'leads')} info="Cantidad de contactos o clientes potenciales (leads) captados a través de formularios de tus anuncios." />
                                <DashboardMetric icon={DollarSign} label="CPL" value={fmt(summary?.cpl || 0, true)} change={getChange(summary?.cpl, prevSummary?.cpl)} trend={getTrend(summary?.cpl, prevSummary?.cpl, true)} data={daily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpl'} onClick={() => setExpandedMetric(expandedMetric === 'cpl' ? null : 'cpl')} info="Costo por Lead. Promedio invertido para obtener cada cliente potencial (inversión total / leads)." />
                              </div>
                            ) : null}
                          </EmailLoader>
                        </div>
                      )}
                      {isWpp && (
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" /> Mensajes (WhatsApp)</h3>
                          <EmailLoader loading={loading} color={BLUE} labels={['Mensajes', 'Costo x Msj']} duration={700}>
                            {summary ? (
                              <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap lg:overflow-x-auto scrollbar-hide">
                                <DashboardMetric icon={MessageSquare} label="Mensajes" value={fmt(summary?.messages || 0)} change={getChange(summary?.messages, prevSummary?.messages)} trend={getTrend(summary?.messages, prevSummary?.messages)} data={daily?.map((d: any) => ({ val: d.messages, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'messages'} onClick={() => setExpandedMetric(expandedMetric === 'messages' ? null : 'messages')} info="Conversaciones de mensajes de texto de clientes nuevas o iniciadas a partir de clics en tus anuncios." />
                                <DashboardMetric icon={DollarSign} label="Costo x Msj" value={fmt(summary?.cpm || 0, true)} change={getChange(summary?.cpm, prevSummary?.cpm)} trend={getTrend(summary?.cpm, prevSummary?.cpm, true)} data={daily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpm'} onClick={() => setExpandedMetric(expandedMetric === 'cpm' ? null : 'cpm')} info="Costo promedio pagado por cada conversación de mensajería iniciada desde un anuncio." />
                              </div>
                            ) : null}
                          </EmailLoader>
                        </div>
                      )}
                    </div>
                    {/* Full-width chart spanning all columns */}
                    <InlineChart forGroup={[...ecomMetrics, ...leadMetrics, ...wppMetrics]} />
                  </>
                )}
              </>
            );
          })()}
        </div>
      ) : null}

      <div className={`mt-6 space-y-6 transition-opacity duration-200 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      {/* Campañas Activas Section */}
      {activeCampaigns.length > 0 && (
        <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-[16px] p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">Campañas Activas</h3>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Campañas en circulación y su presupuesto diario configurado</p>
              </div>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto -mx-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800/60">
                  <th className="pb-2 pr-4 text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider whitespace-nowrap">Campaña</th>
                  <th className="pb-2 px-4 text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider whitespace-nowrap text-right">Gasto</th>
                  <th className="pb-2 px-4 text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider whitespace-nowrap text-right">Compras</th>
                  <th className="pb-2 px-4 text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider whitespace-nowrap text-right">Leads</th>
                  <th className="pb-2 px-4 text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider whitespace-nowrap text-right">Mensajes</th>
                  <th className="pb-2 px-4 text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider whitespace-nowrap text-right">ROAS</th>
                  <th className="pb-2 px-4 text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider whitespace-nowrap text-right">Valor gen.</th>
                  <th className="pb-2 pl-4 text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider whitespace-nowrap text-right">Presupuesto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/40">
                {activeCampaigns.map((camp) => (
                  <React.Fragment key={camp.id}>
                  <tr className="group hover:bg-zinc-50/60 dark:hover:bg-white/[0.02] transition-colors duration-150">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleCampaign(camp.id)} className="w-7 h-7 rounded-full bg-zinc-50 dark:bg-zinc-800/80 hover:bg-blue-50 dark:hover:bg-blue-500/10 flex items-center justify-center shrink-0 transition-colors" title="Ver conjuntos de anuncios">
                          <ChevronRight className={`w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-transform ${expandedCampaigns[camp.id] ? 'rotate-90' : ''}`} />
                        </button>
                        <span className="text-[9px] font-extrabold px-1.5 py-[2px] rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 uppercase tracking-wider shrink-0">●</span>
                        <p className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 leading-snug max-w-[260px]">{camp.name}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-[12px] font-black text-zinc-800 dark:text-zinc-100 tabular-nums">{fmt(camp.spendInPeriod, true)}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-[12px] font-black tabular-nums ${camp.purchases > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                          {camp.purchases > 0 ? camp.purchases : '—'}
                        </span>
                        {camp.purchases > 0 && camp.cpa > 0 && (
                          <span className="text-[9px] text-zinc-450 dark:text-zinc-500 font-medium tabular-nums">{fmt(camp.cpa, true)} c/u</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-[12px] font-black tabular-nums ${camp.leads > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                          {camp.leads > 0 ? camp.leads : '—'}
                        </span>
                        {camp.leads > 0 && camp.cpl > 0 && (
                          <span className="text-[9px] text-zinc-450 dark:text-zinc-500 font-medium tabular-nums">{fmt(camp.cpl, true)} c/u</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-[12px] font-black tabular-nums ${camp.messages > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                          {camp.messages > 0 ? camp.messages : '—'}
                        </span>
                        {camp.messages > 0 && camp.cpm > 0 && (
                          <span className="text-[9px] text-zinc-450 dark:text-zinc-500 font-medium tabular-nums">{fmt(camp.cpm, true)} c/u</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`text-[12px] font-black tabular-nums ${camp.roas > 0 ? (camp.roas >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500') : 'text-zinc-400'}`}>
                        {camp.roas > 0 ? `${camp.roas.toFixed(1)}` : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`text-[12px] font-black tabular-nums ${camp.purchaseValue > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>
                        {camp.purchaseValue > 0 ? fmt(camp.purchaseValue, true) : '—'}
                      </span>
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <span className="text-[12px] font-black text-zinc-800 dark:text-zinc-100 tabular-nums">{camp.budgetStr}</span>
                    </td>
                  </tr>
                  {expandedCampaigns[camp.id] && (
                    <tr>
                      <td colSpan={8} className="pb-5 pt-1">
                        <div className="ml-9 rounded-3xl border border-zinc-100 dark:border-zinc-800/70 bg-zinc-50/70 dark:bg-zinc-950/40 p-3">
                          {renderAdsetTree(camp)}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {activeCampaigns.map((camp) => (
              <div key={camp.id} className="p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => toggleCampaign(camp.id)} className="flex items-start gap-2 text-left min-w-0">
                    <ChevronRight className={`w-4 h-4 mt-0.5 text-zinc-400 shrink-0 transition-transform ${expandedCampaigns[camp.id] ? 'rotate-90' : ''}`} />
                    <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200 leading-snug">{camp.name}</p>
                  </button>
                  <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 uppercase tracking-wider shrink-0">Activa</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-800/60">
                  <div className="bg-white dark:bg-white/[0.03] p-2 rounded-xl border border-zinc-100 dark:border-white/[0.04]">
                    <span className="block text-[8px] font-bold text-zinc-400 uppercase tracking-wide mb-0.5">Gasto</span>
                    <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-100">{fmt(camp.spendInPeriod, true)}</span>
                  </div>
                  <div className="bg-white dark:bg-white/[0.03] p-2 rounded-xl border border-zinc-100 dark:border-white/[0.04]">
                    <span className="block text-[8px] font-bold text-zinc-400 uppercase tracking-wide mb-0.5">Presup.</span>
                    <span className="text-[11px] font-black text-zinc-800 dark:text-zinc-100">{camp.budgetStr}</span>
                  </div>
                  <div className="bg-white dark:bg-white/[0.03] p-2 rounded-xl border border-zinc-100 dark:border-white/[0.04]">
                    <span className="block text-[8px] font-bold text-zinc-400 uppercase tracking-wide mb-0.5">ROAS</span>
                    <span className={`text-[11px] font-black ${camp.roas > 0 ? (camp.roas >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500') : 'text-zinc-400'}`}>{camp.roas > 0 ? `${camp.roas.toFixed(1)}` : '—'}</span>
                  </div>
                  <div className="bg-white dark:bg-white/[0.03] p-2 rounded-xl border border-zinc-100 dark:border-white/[0.04]">
                    <span className="block text-[8px] font-bold text-zinc-400 uppercase tracking-wide mb-0.5">Valor gen.</span>
                    <span className={`text-[11px] font-black ${camp.purchaseValue > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>{camp.purchaseValue > 0 ? fmt(camp.purchaseValue, true) : '—'}</span>
                  </div>
                  {camp.purchases > 0 && (
                    <div className="bg-white dark:bg-white/[0.03] p-2 rounded-xl border border-zinc-100 dark:border-white/[0.04]">
                      <span className="block text-[8px] font-bold text-zinc-400 uppercase tracking-wide mb-0.5">Compras</span>
                      <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                        {camp.purchases} <span className="text-[8px] text-zinc-405 dark:text-zinc-500 font-normal">({camp.cpa > 0 ? fmt(camp.cpa, true) : '—'})</span>
                      </span>
                    </div>
                  )}
                  {camp.leads > 0 && (
                    <div className="bg-white dark:bg-white/[0.03] p-2 rounded-xl border border-zinc-100 dark:border-white/[0.04]">
                      <span className="block text-[8px] font-bold text-zinc-400 uppercase tracking-wide mb-0.5">Leads</span>
                      <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                        {camp.leads} <span className="text-[8px] text-zinc-405 dark:text-zinc-500 font-normal">({camp.cpl > 0 ? fmt(camp.cpl, true) : '—'})</span>
                      </span>
                    </div>
                  )}
                  {camp.messages > 0 && (
                    <div className="bg-white dark:bg-white/[0.03] p-2 rounded-xl border border-zinc-100 dark:border-white/[0.04]">
                      <span className="block text-[8px] font-bold text-zinc-400 uppercase tracking-wide mb-0.5">Mensajes</span>
                      <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                        {camp.messages} <span className="text-[8px] text-zinc-405 dark:text-zinc-500 font-normal">({camp.cpm > 0 ? fmt(camp.cpm, true) : '—'})</span>
                      </span>
                    </div>
                  )}
                  {camp.purchases === 0 && camp.leads === 0 && camp.messages === 0 && (
                    <div className="bg-white dark:bg-white/[0.03] p-2 rounded-xl border border-zinc-100 dark:border-white/[0.04]">
                      <span className="block text-[8px] font-bold text-zinc-400 uppercase tracking-wide mb-0.5">Resultados</span>
                      <span className="text-[11px] font-black text-zinc-400">—</span>
                    </div>
                  )}
                </div>
                {expandedCampaigns[camp.id] && (
                  <div className="pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-800/60">
                    {renderAdsetTree(camp)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Breakdowns grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Region */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-6">
          <SectionTitle icon={Globe} title="Rendimiento por Región" subtitle="Inversión por estado o provincia" />
          {loading ? (
            <div className="space-y-4 py-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="animate-pulse">
                  <div className="flex justify-between mb-1">
                    <div className="h-3.5 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
                    <div className="h-3.5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
                  </div>
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
                  <div className="h-3 w-28 bg-zinc-50 dark:bg-zinc-800 rounded mt-1" />
                </div>
              ))}
            </div>
          ) : regionData.length === 0 ? <p className="text-xs text-zinc-400 text-center py-8">Sin datos</p> : (
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
          {loading ? (
            <div className="space-y-4 py-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="animate-pulse">
                  <div className="flex justify-between mb-1">
                    <div className="h-3.5 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
                    <div className="h-3.5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
                  </div>
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
                  <div className="h-3 w-28 bg-zinc-50 dark:bg-zinc-800 rounded mt-1" />
                </div>
              ))}
            </div>
          ) : platformData.length === 0 ? <p className="text-xs text-zinc-400 text-center py-8">Sin datos</p> : (
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
          {loading ? (
            <div className="space-y-4 py-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="animate-pulse">
                  <div className="flex justify-between mb-1">
                    <div className="h-3.5 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
                    <div className="h-3.5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
                  </div>
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
                  <div className="h-3 w-28 bg-zinc-50 dark:bg-zinc-800 rounded mt-1" />
                </div>
              ))}
            </div>
          ) : genderData.length === 0 ? <p className="text-xs text-zinc-400 text-center py-8">Sin datos</p> : (
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
                      <span className="font-bold text-emerald-650 dark:text-emerald-500">Conversiones: {g.results}</span>
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
          {loading ? (
            <div className="space-y-4 py-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="animate-pulse">
                  <div className="flex justify-between mb-1">
                    <div className="h-3.5 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
                    <div className="h-3.5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
                  </div>
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
                  <div className="h-3 w-28 bg-zinc-50 dark:bg-zinc-800 rounded mt-1" />
                </div>
              ))}
            </div>
          ) : ageData.length === 0 ? <p className="text-xs text-zinc-400 text-center py-8">Sin datos</p> : (
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
                      <span className="font-bold text-emerald-650 dark:text-emerald-500">Conversiones: {a.results}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>

      </div>

      {selectedCreative && (
        <div className="fixed inset-0 z-[9999] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 print:hidden" onClick={() => setSelectedCreative(null)}>
          <div className="w-full max-w-[520px] rounded-[28px] bg-white dark:bg-zinc-950 border border-white/20 dark:border-white/[0.08] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 p-5 border-b border-zinc-100 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-500">Creativo del anuncio</p>
                <h3 className="text-lg font-black text-zinc-900 dark:text-white leading-tight truncate">{selectedCreative.ad?.name}</h3>
                <p className="text-[12px] font-semibold text-zinc-400 truncate">{selectedCreative.camp?.name} · {selectedCreative.adset?.name}</p>
              </div>
              <button onClick={() => setSelectedCreative(null)} className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 flex items-center justify-center text-zinc-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 min-h-[260px] flex items-center justify-center overflow-hidden">
                {selectedCreative.ad?.thumbnail ? (
                  <img src={selectedCreative.ad.thumbnail} alt={selectedCreative.ad.name} className="w-full max-h-[420px] object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-zinc-400">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-[12px] font-bold">Meta no devolvió miniatura para este anuncio</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <ResultMetric label="Gasto" value={fmt(selectedCreative.ad?.spend || 0, true)} />
                <ResultMetric label="Resultados" value={selectedCreative.ad?.results || '—'} tone={selectedCreative.ad?.results ? 'good' : 'default'} />
                <ResultMetric label="ROAS" value={selectedCreative.ad?.roas > 0 ? selectedCreative.ad.roas.toFixed(1) : '—'} tone={selectedCreative.ad?.roas >= 1 ? 'good' : 'default'} />
                <ResultMetric label="CTR" value={selectedCreative.ad?.ctr > 0 ? `${selectedCreative.ad.ctr.toFixed(2)}%` : '—'} />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setSelectedCreative(null)} className="h-10 px-4 rounded-xl text-[12px] font-black text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">Cerrar</button>
                {selectedCreative.ad?.previewUrl && (
                  <a href={selectedCreative.ad.previewUrl} target="_blank" rel="noreferrer" className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-black flex items-center gap-2 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                    Abrir en Meta
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@media print { body { background: white !important; } .print\\:hidden { display: none !important; } @page { margin: 1cm; size: A4; } }`}</style>
    </div>
    </CenteredPageLoader>

  );
}
