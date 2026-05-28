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
  Users, DollarSign, Target, BarChart2, Globe, Smartphone, User, Megaphone, MessageSquare, Layers, Film
} from 'lucide-react';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import KlaviyoLoader from '../components/ui/KlaviyoLoader';

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
  const [loading, setLoading] = useState(false);
  const [daily, setDaily] = useState<any[]>([]);
  const [prevDaily, setPrevDaily] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [prevSummary, setPrevSummary] = useState<any>(null);
  const [genderData, setGenderData] = useState<any[]>([]);
  const [regionData, setRegionData] = useState<any[]>([]);
  const [platformData, setPlatformData] = useState<any[]>([]);
  const [ageData, setAgeData] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [expandedMetric, setExpandedMetric] = useState<string | null>('spend');

  // Campaign Explorer state
  const [activeCampaigns, setActiveCampaigns] = useState<any[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [adsetsByCampaign, setAdsetsByCampaign] = useState<Record<string, any[]>>({});
  const [loadingAdsets, setLoadingAdsets] = useState<Set<string>>(new Set());
  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set());
  const [adsByAdset, setAdsByAdset] = useState<Record<string, any[]>>({});
  const [loadingAds, setLoadingAds] = useState<Set<string>>(new Set());
  const [adInsightsByAdset, setAdInsightsByAdset] = useState<Record<string, Record<string, any>>>({});
  const [expandedAd, setExpandedAd] = useState<string | null>(null);

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
    if (!profile?.meta_account_id) return;
    setLoading(true);
    setSummary(null);
    setPrevSummary(null);
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
      ]);
      const ok = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
        r.status === 'fulfilled' ? r.value : fallback;
      if (fetchId !== fetchIdRef.current) return;
      const [rawDaily, rawPrevDaily, gender, regions, platform, age, campaignInsights, prevCampaignInsights] = [
        ok(settled[0], []), ok(settled[1], []), ok(settled[2], []), ok(settled[3], []),
        ok(settled[4], []), ok(settled[5], []), ok(settled[6], []), ok(settled[7], []),
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
        
        let category = 'Otras Campañas';
        const nameUpper = c.campaign_name?.toUpperCase() || '';
        const objUpper = c.objective?.toUpperCase() || '';

        if (objUpper.includes('SALES') || objUpper.includes('CONVERSIONS') || nameUpper.includes('VENTA') || nameUpper.includes('PURCHASE') || nameUpper.includes('COMPRA')) {
          category = 'Ventas';
        } else if (objUpper.includes('LEAD') || nameUpper.includes('LEAD') || nameUpper.includes('POTENCIAL')) {
          category = 'Leads';
        } else if (objUpper.includes('MESSAGES') || objUpper.includes('ENGAGEMENT') || nameUpper.includes('MENSAJE') || nameUpper.includes('WPP') || nameUpper.includes('WHATSAPP') || nameUpper.includes('CONV')) {
          category = 'Mensajes';
        } else if (objUpper.includes('TRAFFIC') || objUpper.includes('AWARENESS') || objUpper.includes('REACH') || nameUpper.includes('TRAFICO') || nameUpper.includes('COMUNIDAD') || nameUpper.includes('SEGUIDORES') || nameUpper.includes('INTERACCION')) {
          category = 'Tráfico/Comunidad';
        }

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
          category
        };
      }).sort((a: any, b: any) => b.spend - a.spend));

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

  useEffect(() => {
    if (!profile?.meta_account_id) return;
    setLoadingCampaigns(true);
    setActiveCampaigns([]);
    setExpandedCampaigns(new Set());
    setAdsetsByCampaign({});
    setExpandedAdsets(new Set());
    setAdsByAdset({});
    setAdInsightsByAdset({});
    setExpandedAd(null);
    metaAds.getCampaigns(profile.meta_account_id)
      .then((res: any) => setActiveCampaigns((res.data || []).filter((c: any) => c.status === 'ACTIVE')))
      .catch(() => setActiveCampaigns([]))
      .finally(() => setLoadingCampaigns(false));
  }, [profile?.id]);

  const handleApply = () => { setActivePreset(pendingPreset); setActiveSince(pendingSince); setActiveUntil(pendingUntil || pendingSince); setShowDatePicker(false); };
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

  const toggleCampaign = async (campaignId: string) => {
    if (expandedCampaigns.has(campaignId)) {
      setExpandedCampaigns(prev => { const n = new Set(prev); n.delete(campaignId); return n; });
      return;
    }
    setExpandedCampaigns(prev => new Set([...prev, campaignId]));
    if (adsetsByCampaign[campaignId]) return;
    setLoadingAdsets(prev => new Set([...prev, campaignId]));
    try {
      const res = await metaAds.getAdsets(campaignId);
      setAdsetsByCampaign(prev => ({ ...prev, [campaignId]: (res.data || []).filter((a: any) => a.status === 'ACTIVE') }));
    } catch {
      setAdsetsByCampaign(prev => ({ ...prev, [campaignId]: [] }));
    } finally {
      setLoadingAdsets(prev => { const n = new Set(prev); n.delete(campaignId); return n; });
    }
  };

  const toggleAdset = async (adsetId: string) => {
    if (expandedAdsets.has(adsetId)) {
      setExpandedAdsets(prev => { const n = new Set(prev); n.delete(adsetId); return n; });
      return;
    }
    setExpandedAdsets(prev => new Set([...prev, adsetId]));
    if (adsByAdset[adsetId]) return;
    setLoadingAds(prev => new Set([...prev, adsetId]));
    try {
      const adFields = 'ad_id,spend,impressions,reach,inline_link_click_ctr,inline_link_clicks,actions,cost_per_action_type,action_values,purchase_roas';
      const [adsRes, insights] = await Promise.all([
        metaAds.getAds(adsetId),
        metaAds.getAdInsightsForAdset(adsetId, adFields, range).catch(() => []),
      ]);
      setAdsByAdset(prev => ({ ...prev, [adsetId]: (adsRes.data || []).filter((a: any) => a.status === 'ACTIVE') }));
      const byAdId: Record<string, any> = {};
      (insights || []).forEach((i: any) => { if (i.ad_id) byAdId[i.ad_id] = i; });
      setAdInsightsByAdset(prev => ({ ...prev, [adsetId]: byAdId }));
    } catch {
      setAdsByAdset(prev => ({ ...prev, [adsetId]: [] }));
      setAdInsightsByAdset(prev => ({ ...prev, [adsetId]: {} }));
    } finally {
      setLoadingAds(prev => { const n = new Set(prev); n.delete(adsetId); return n; });
    }
  };

  const fmtDateRange = (d: string) => {
    if (!d) return '';
    const parts = d.split('-');
    if (parts.length < 3) return d;
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

  const getChange = (curr: number | undefined | null, prev: number | undefined | null) =>
    (curr == null || prev == null || prev === 0) ? undefined : ((curr - prev) / prev) * 100;

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-blue-500" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Captación (Meta Ads)</h1>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-[13px] font-medium">Análisis detallado por regiones, demografía y plataformas.</p>
        </div>
        
        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-black/[0.06] dark:border-white/[0.06] rounded-full px-1.5 py-1 shadow-sm h-11 relative z-20" ref={datePickerRef}>
            <button onClick={() => setShowDatePicker(!showDatePicker)} className="flex items-center gap-2 px-4 h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full transition-all group">
              <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-blue-500 transition-colors" />
              <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-200">
                {activePreset === 'custom' ? (activeSince === activeUntil ? fmtDateRange(activeSince) : `${fmtDateRange(activeSince)} - ${fmtDateRange(activeUntil)}`) : PRESETS.find(p => p.id === activePreset)?.label || activePreset}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>
            {showDatePicker && (
              <div className="absolute left-0 md:left-auto md:right-0 top-full mt-3 bg-white dark:bg-zinc-900 rounded-[20px] border border-black/[0.08] dark:border-white/[0.08] shadow-2xl z-30 flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 w-[290px] sm:w-[320px] md:w-auto origin-top-left md:origin-top-right">
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

      <div className="hidden print:block mb-6 pb-4 border-b-2 border-zinc-200">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[22px] font-black text-zinc-900 tracking-tight">ALGORITMIA</span>
          <span className="text-[11px] text-zinc-400">{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
        <p className="text-[13px] text-zinc-500 font-medium">Captación — Meta Ads</p>
        <p className="text-[15px] font-bold text-zinc-900">Período: {activeSince === activeUntil ? fmtDateRange(activeSince) : `${fmtDateRange(activeSince)} — ${fmtDateRange(activeUntil)}`}</p>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <KlaviyoLoader loading={loading} color={BLUE} labels={['Inversión', 'Alcance']} />
      ) : summary ? (
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
              return (
                <>
                  <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
                    <DashboardMetric icon={DollarSign} label="Inversión" value={fmt(summary?.spend || 0, true)} change={getChange(summary?.spend, prevSummary?.spend)} trend={getChange(summary?.spend, prevSummary?.spend) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.spend, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'spend'} onClick={() => setExpandedMetric(expandedMetric === 'spend' ? null : 'spend')} />
                    <DashboardMetric icon={Users} label="Alcance" value={fmt(summary?.reach || 0)} change={getChange(summary?.reach, prevSummary?.reach)} trend={getChange(summary?.reach, prevSummary?.reach) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.reach, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'reach'} onClick={() => setExpandedMetric(expandedMetric === 'reach' ? null : 'reach')} />
                    {isEcom && (
                      <>
                        <DashboardMetric icon={Target} label="Compras" value={fmt(summary?.purchases || 0)} change={getChange(summary?.purchases, prevSummary?.purchases)} trend={getChange(summary?.purchases, prevSummary?.purchases) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.purchases, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'purchases'} onClick={() => setExpandedMetric(expandedMetric === 'purchases' ? null : 'purchases')} />
                        <DashboardMetric icon={BarChart2} label="ROAS" value={`${(summary?.roas || 0).toFixed(2)}x`} change={getChange(summary?.roas, prevSummary?.roas)} trend={getChange(summary?.roas, prevSummary?.roas) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.roas, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'roas'} onClick={() => setExpandedMetric(expandedMetric === 'roas' ? null : 'roas')} />
                        <DashboardMetric icon={DollarSign} label="Retorno" value={fmt(summary?.purchase_value || 0, true)} change={getChange(summary?.purchase_value, prevSummary?.purchase_value)} trend={getChange(summary?.purchase_value, prevSummary?.purchase_value) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'revenue'} onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')} />
                      </>
                    )}
                    {isLead && (
                      <>
                        <DashboardMetric icon={Target} label="Leads" value={fmt(summary?.leads || 0)} change={getChange(summary?.leads, prevSummary?.leads)} trend={getChange(summary?.leads, prevSummary?.leads) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.leads, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'leads'} onClick={() => setExpandedMetric(expandedMetric === 'leads' ? null : 'leads')} />
                        <DashboardMetric icon={DollarSign} label="CPL" value={fmt(summary?.cpl || 0, true)} change={getChange(summary?.cpl, prevSummary?.cpl)} trend={getChange(summary?.cpl, prevSummary?.cpl) <= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpl'} onClick={() => setExpandedMetric(expandedMetric === 'cpl' ? null : 'cpl')} />
                      </>
                    )}
                    {isWpp && (
                      <>
                        <DashboardMetric icon={MessageSquare} label="Mensajes" value={fmt(summary?.messages || 0)} change={getChange(summary?.messages, prevSummary?.messages)} trend={getChange(summary?.messages, prevSummary?.messages) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.messages, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'messages'} onClick={() => setExpandedMetric(expandedMetric === 'messages' ? null : 'messages')} />
                        <DashboardMetric icon={DollarSign} label="Costo x Msj" value={fmt(summary?.cpm || 0, true)} change={getChange(summary?.cpm, prevSummary?.cpm)} trend={getChange(summary?.cpm, prevSummary?.cpm) <= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpm'} onClick={() => setExpandedMetric(expandedMetric === 'cpm' ? null : 'cpm')} />
                      </>
                    )}
                  </div>
                  {expandedMetric && <MetricDetailChart label={sLabel} color={BLUE} data={sChartData} prevData={sPrevData} />}
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
              expandedMetric && forGroup.includes(expandedMetric) ? (
                <MetricDetailChart label={chartLabel} color={BLUE} data={chartData} prevData={prevChartData} />
              ) : null
            );

            // Multiple rows for grouped layout when > 1 tag is active
            return (
              <>
                <div className="space-y-2">
                  <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><BarChart2 className="w-3.5 h-3.5" /> Métricas Generales</h3>
                  <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
                    <DashboardMetric icon={DollarSign} label="Inversión" value={fmt(summary?.spend || 0, true)} change={getChange(summary?.spend, prevSummary?.spend)} trend={getChange(summary?.spend, prevSummary?.spend) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.spend, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'spend'} onClick={() => setExpandedMetric(expandedMetric === 'spend' ? null : 'spend')} />
                    <DashboardMetric icon={Users} label="Alcance" value={fmt(summary?.reach || 0)} change={getChange(summary?.reach, prevSummary?.reach)} trend={getChange(summary?.reach, prevSummary?.reach) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.reach, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'reach'} onClick={() => setExpandedMetric(expandedMetric === 'reach' ? null : 'reach')} />
                  </div>
                  <InlineChart forGroup={generalMetrics} />
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
                          <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 overflow-x-auto scrollbar-hide">
                            <DashboardMetric icon={Target} label="Compras" value={fmt(summary?.purchases || 0)} change={getChange(summary?.purchases, prevSummary?.purchases)} trend={getChange(summary?.purchases, prevSummary?.purchases) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.purchases, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'purchases'} onClick={() => setExpandedMetric(expandedMetric === 'purchases' ? null : 'purchases')} />
                            <DashboardMetric icon={BarChart2} label="ROAS" value={`${(summary?.roas || 0).toFixed(2)}x`} change={getChange(summary?.roas, prevSummary?.roas)} trend={getChange(summary?.roas, prevSummary?.roas) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.roas, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'roas'} onClick={() => setExpandedMetric(expandedMetric === 'roas' ? null : 'roas')} />
                            <DashboardMetric icon={DollarSign} label="Retorno" value={fmt(summary?.purchase_value || 0, true)} change={getChange(summary?.purchase_value, prevSummary?.purchase_value)} trend={getChange(summary?.purchase_value, prevSummary?.purchase_value) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'revenue'} onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')} />
                          </div>
                        </div>
                      )}
                      {isLead && (
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Clientes Potenciales</h3>
                          <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 overflow-x-auto scrollbar-hide">
                            <DashboardMetric icon={Target} label="Leads" value={fmt(summary?.leads || 0)} change={getChange(summary?.leads, prevSummary?.leads)} trend={getChange(summary?.leads, prevSummary?.leads) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.leads, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'leads'} onClick={() => setExpandedMetric(expandedMetric === 'leads' ? null : 'leads')} />
                            <DashboardMetric icon={DollarSign} label="CPL" value={fmt(summary?.cpl || 0, true)} change={getChange(summary?.cpl, prevSummary?.cpl)} trend={getChange(summary?.cpl, prevSummary?.cpl) <= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpl'} onClick={() => setExpandedMetric(expandedMetric === 'cpl' ? null : 'cpl')} />
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Full-width chart spanning both columns */}
                    <InlineChart forGroup={[...ecomMetrics, ...leadMetrics]} />
                    {/* Row 2: Mensajes full width */}
                    {isWpp && (
                      <div className="space-y-2">
                        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" /> Mensajes (WhatsApp)</h3>
                        <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
                          <DashboardMetric icon={MessageSquare} label="Mensajes" value={fmt(summary?.messages || 0)} change={getChange(summary?.messages, prevSummary?.messages)} trend={getChange(summary?.messages, prevSummary?.messages) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.messages, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'messages'} onClick={() => setExpandedMetric(expandedMetric === 'messages' ? null : 'messages')} />
                          <DashboardMetric icon={DollarSign} label="Costo x Msj" value={fmt(summary?.cpm || 0, true)} change={getChange(summary?.cpm, prevSummary?.cpm)} trend={getChange(summary?.cpm, prevSummary?.cpm) <= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpm'} onClick={() => setExpandedMetric(expandedMetric === 'cpm' ? null : 'cpm')} />
                        </div>
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
                          <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-3 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
                            <DashboardMetric icon={Target} label="Compras" value={fmt(summary?.purchases || 0)} change={getChange(summary?.purchases, prevSummary?.purchases)} trend={getChange(summary?.purchases, prevSummary?.purchases) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.purchases, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'purchases'} onClick={() => setExpandedMetric(expandedMetric === 'purchases' ? null : 'purchases')} />
                            <DashboardMetric icon={BarChart2} label="ROAS" value={`${(summary?.roas || 0).toFixed(2)}x`} change={getChange(summary?.roas, prevSummary?.roas)} trend={getChange(summary?.roas, prevSummary?.roas) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.roas, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'roas'} onClick={() => setExpandedMetric(expandedMetric === 'roas' ? null : 'roas')} />
                            <DashboardMetric icon={DollarSign} label="Retorno" value={fmt(summary?.purchase_value || 0, true)} change={getChange(summary?.purchase_value, prevSummary?.purchase_value)} trend={getChange(summary?.purchase_value, prevSummary?.purchase_value) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.purchase_value, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'revenue'} onClick={() => setExpandedMetric(expandedMetric === 'revenue' ? null : 'revenue')} />
                          </div>
                        </div>
                      )}
                      {isLead && (
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><User className="w-3.5 h-3.5" /> Clientes Potenciales</h3>
                          <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
                            <DashboardMetric icon={Target} label="Leads" value={fmt(summary?.leads || 0)} change={getChange(summary?.leads, prevSummary?.leads)} trend={getChange(summary?.leads, prevSummary?.leads) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.leads, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'leads'} onClick={() => setExpandedMetric(expandedMetric === 'leads' ? null : 'leads')} />
                            <DashboardMetric icon={DollarSign} label="CPL" value={fmt(summary?.cpl || 0, true)} change={getChange(summary?.cpl, prevSummary?.cpl)} trend={getChange(summary?.cpl, prevSummary?.cpl) <= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.leads ? d.spend / d.leads : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpl'} onClick={() => setExpandedMetric(expandedMetric === 'cpl' ? null : 'cpl')} />
                          </div>
                        </div>
                      )}
                      {isWpp && (
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest pl-1 flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" /> Mensajes (WhatsApp)</h3>
                          <div className="bg-white dark:bg-zinc-900 rounded-[12px] border border-black/[0.06] dark:border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden grid grid-cols-2 lg:flex lg:flex-nowrap overflow-x-auto scrollbar-hide">
                            <DashboardMetric icon={MessageSquare} label="Mensajes" value={fmt(summary?.messages || 0)} change={getChange(summary?.messages, prevSummary?.messages)} trend={getChange(summary?.messages, prevSummary?.messages) >= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.messages, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'messages'} onClick={() => setExpandedMetric(expandedMetric === 'messages' ? null : 'messages')} />
                            <DashboardMetric icon={DollarSign} label="Costo x Msj" value={fmt(summary?.cpm || 0, true)} change={getChange(summary?.cpm, prevSummary?.cpm)} trend={getChange(summary?.cpm, prevSummary?.cpm) <= 0 ? 'up' : 'down'} data={daily?.map((d: any) => ({ val: d.messages ? d.spend / d.messages : 0, date: d.date }))} color={BLUE} loading={loading} active={expandedMetric === 'cpm'} onClick={() => setExpandedMetric(expandedMetric === 'cpm' ? null : 'cpm')} />
                          </div>
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


      {/* Campañas Activas */}
      {campaigns && campaigns.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-6 mt-8 mb-8">
          <SectionTitle icon={Megaphone} title="Rendimiento de Campañas" subtitle="Métricas detalladas por campaña activa" />
          
          {['Ventas', 'Leads', 'Mensajes', 'Tráfico/Comunidad', 'Otras Campañas'].map(category => {
            const categoryCampaigns = campaigns.filter((c: any) => c.category === category);
            if (categoryCampaigns.length === 0) return null;

            return (
              <div key={category} className="mt-6 mb-6 last:mb-0">
                <h4 className="text-[12px] font-bold text-zinc-500 uppercase tracking-widest mb-3 pl-1 border-l-2 border-violet-500">Campañas de {category}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800">
                        <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50 rounded-l-lg">Campaña</th>
                        <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">Inversión</th>
                        <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">Alcance</th>
                        
                        {category === 'Ventas' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">Compras</th>}
                        {category === 'Ventas' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">ROAS</th>}
                        {category === 'Ventas' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50 rounded-r-lg">CPA</th>}
                        
                        {category === 'Leads' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">Leads</th>}
                        {category === 'Leads' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50 rounded-r-lg">CPL</th>}
                        
                        {category === 'Mensajes' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">Mensajes</th>}
                        {category === 'Mensajes' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50 rounded-r-lg">Costo/Msj</th>}

                        {category === 'Tráfico/Comunidad' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">Costo/Mil (CPM)</th>}
                        {category === 'Tráfico/Comunidad' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">Seguidores IG</th>}
                        {category === 'Tráfico/Comunidad' && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50 rounded-r-lg">Me Gusta FB</th>}
                        
                        {category === 'Otras Campañas' && isEcom && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">Compras</th>}
                        {category === 'Otras Campañas' && isLead && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50">Leads</th>}
                        {category === 'Otras Campañas' && isWpp && <th className="py-3 px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50 dark:bg-zinc-800/50 rounded-r-lg">Mensajes</th>}
                      </tr>
                    </thead>
                    <tbody className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                      {categoryCampaigns.map((c: any) => (
                        <tr key={c.id} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="py-4 px-4 font-bold max-w-[250px] truncate" title={c.name}>{c.name}</td>
                          <td className="py-4 px-4">{fmt(c.spend, true)}</td>
                          <td className="py-4 px-4">{fmt(c.reach)}</td>
                          
                          {category === 'Ventas' && <td className="py-4 px-4 text-emerald-600 dark:text-emerald-500 font-bold">{fmt(c.purchases)}</td>}
                          {category === 'Ventas' && <td className="py-4 px-4">{(c.roas || 0).toFixed(2)}x</td>}
                          {category === 'Ventas' && <td className="py-4 px-4">{fmt(c.cpa, true)}</td>}
                          
                          {category === 'Leads' && <td className="py-4 px-4 text-emerald-600 dark:text-emerald-500 font-bold">{fmt(c.leads)}</td>}
                          {category === 'Leads' && <td className="py-4 px-4">{fmt(c.cpl, true)}</td>}
                          
                          {category === 'Mensajes' && <td className="py-4 px-4 text-emerald-600 dark:text-emerald-500 font-bold">{fmt(c.messages)}</td>}
                          {category === 'Mensajes' && <td className="py-4 px-4">{fmt(c.cpm, true)}</td>}
                          
                          {category === 'Tráfico/Comunidad' && <td className="py-4 px-4">{fmt((c.spend / (c.reach || 1)) * 1000, true)}</td>}
                          {category === 'Tráfico/Comunidad' && <td className="py-4 px-4 text-violet-600 dark:text-violet-400 font-bold">{c.ig_followers > 0 ? fmt(c.ig_followers) : '—'}</td>}
                          {category === 'Tráfico/Comunidad' && <td className="py-4 px-4 text-blue-600 dark:text-blue-400 font-bold">{c.fb_likes > 0 ? fmt(c.fb_likes) : '—'}</td>}
                          
                          {category === 'Otras Campañas' && isEcom && <td className="py-4 px-4 text-emerald-600 dark:text-emerald-500 font-bold">{fmt(c.purchases)}</td>}
                          {category === 'Otras Campañas' && isLead && <td className="py-4 px-4 text-emerald-600 dark:text-emerald-500 font-bold">{fmt(c.leads)}</td>}
                          {category === 'Otras Campañas' && isWpp && <td className="py-4 px-4 text-emerald-600 dark:text-emerald-500 font-bold">{fmt(c.messages)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Explorador de Campañas Activas */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Layers className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Estructura de Campañas</h3>
              <p className="text-[11px] text-zinc-400">Campañas activas · Conjuntos · Creativos activos</p>
            </div>
          </div>
          {loadingCampaigns && <div className="w-4 h-4 border-2 border-zinc-200 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />}
        </div>

        {!loadingCampaigns && activeCampaigns.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-8">No hay campañas activas</p>
        )}

        <div className="space-y-0.5">
          {activeCampaigns.map(campaign => {
            const isCampaignExpanded = expandedCampaigns.has(campaign.id);
            const isCampaignLoading = loadingAdsets.has(campaign.id);
            const adsets = adsetsByCampaign[campaign.id] || [];

            return (
              <div key={campaign.id}>
                <button
                  onClick={() => toggleCampaign(campaign.id)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <ChevronRight className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform duration-150 ${isCampaignExpanded ? 'rotate-90' : ''}`} />
                  <span className="flex-1 text-[13px] font-bold text-zinc-900 dark:text-white truncate min-w-0">{campaign.name}</span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">ACTIVA</span>
                    <span className="hidden sm:block text-[11px] text-zinc-400">{objectiveLabel(campaign.objective)}</span>
                    <span className="hidden sm:block text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">{fmtBudget(campaign.daily_budget, campaign.lifetime_budget)}</span>
                  </div>
                </button>

                {isCampaignExpanded && (
                  <div className="ml-7 border-l-2 border-zinc-100 dark:border-zinc-800 pl-4 pb-2">
                    {isCampaignLoading ? (
                      <div className="py-4 flex justify-center">
                        <div className="w-4 h-4 border-2 border-zinc-200 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    ) : adsets.length === 0 ? (
                      <p className="text-[11px] text-zinc-400 py-3 pl-2">Sin conjuntos activos</p>
                    ) : adsets.map(adset => {
                      const isAdsetExpanded = expandedAdsets.has(adset.id);
                      const isAdsLoading = loadingAds.has(adset.id);
                      const ads = adsByAdset[adset.id] || [];
                      return (
                        <div key={adset.id}>
                          <button
                            onClick={() => toggleAdset(adset.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                          >
                            <ChevronRight className={`w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 flex-shrink-0 transition-transform duration-150 ${isAdsetExpanded ? 'rotate-90' : ''}`} />
                            <span className="flex-1 text-[12px] font-semibold text-zinc-700 dark:text-zinc-200 truncate min-w-0">{adset.name}</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="hidden sm:block text-[10px] text-zinc-400">{goalLabel(adset.optimization_goal)}</span>
                              <span className="hidden sm:block text-[11px] text-zinc-500 dark:text-zinc-400">{fmtBudget(adset.daily_budget, adset.lifetime_budget)}</span>
                            </div>
                          </button>

                          {isAdsetExpanded && (
                            <div className="ml-6 border-l-2 border-zinc-50 dark:border-zinc-800/50 pl-4 pb-2">
                              {isAdsLoading ? (
                                <div className="py-4 flex justify-center">
                                  <div className="w-4 h-4 border-2 border-zinc-200 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin" />
                                </div>
                              ) : ads.length === 0 ? (
                                <p className="text-[11px] text-zinc-400 py-3 pl-2">Sin anuncios activos</p>
                              ) : (
                                <div className="flex flex-col gap-1.5 py-2">
                                  {ads.map(ad => {
                                    const adInsights = adInsightsByAdset[adset.id]?.[ad.id];
                                    const adSpend = parseFloat(adInsights?.spend || 0);
                                    const adActions = adInsights?.actions || [];
                                    const adResults = (() => {
                                      if (isEcom) return extractActions(adActions, 'purchases');
                                      if (isLead) return extractActions(adActions, 'leads');
                                      if (isWpp) return extractActions(adActions, 'messages');
                                      return extractActions(adActions, 'purchases');
                                    })();
                                    const adCpa = adResults > 0 ? adSpend / adResults : 0;
                                    const adImpr = parseInt(adInsights?.impressions || 0);
                                    const adReach = parseInt(adInsights?.reach || 0);
                                    const adCtr = parseFloat(adInsights?.inline_link_click_ctr || 0);
                                    const adRoas = parseFloat(adInsights?.purchase_roas?.[0]?.value || 0);
                                    const adValue = (() => {
                                      const av = adInsights?.action_values || [];
                                      const v = av.find((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
                                      return v ? parseFloat(v.value) : 0;
                                    })();
                                    const isAdExpanded = expandedAd === ad.id;
                                    return (
                                      <div key={ad.id} className="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50">
                                        <button
                                          onClick={() => setExpandedAd(isAdExpanded ? null : ad.id)}
                                          className="w-full flex items-center gap-3 p-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                                        >
                                          {ad.creative?.thumbnail_url ? (
                                            <img src={ad.creative.thumbnail_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-zinc-100 dark:bg-zinc-800" />
                                          ) : (
                                            <div className="w-14 h-14 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                              <Film className="w-5 h-5 text-zinc-300 dark:text-zinc-600" />
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate leading-tight" title={ad.name}>{ad.name || ad.creative?.name || 'Sin nombre'}</p>
                                            <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 mt-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">ACTIVO</span>
                                          </div>
                                          <div className="flex items-center gap-4 flex-shrink-0 mr-1">
                                            {adInsights ? (
                                              <>
                                                <div className="text-right hidden sm:block">
                                                  <p className="text-[10px] text-zinc-400">Gasto</p>
                                                  <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">${adSpend.toFixed(0)}</p>
                                                </div>
                                                <div className="text-right hidden sm:block">
                                                  <p className="text-[10px] text-zinc-400">{resultsLabel}</p>
                                                  <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">{adResults > 0 ? adResults.toFixed(0) : '—'}</p>
                                                </div>
                                                <div className="text-right hidden md:block">
                                                  <p className="text-[10px] text-zinc-400">{cprLabel}</p>
                                                  <p className="text-[12px] font-bold text-zinc-800 dark:text-zinc-200">{adCpa > 0 ? `$${adCpa.toFixed(2)}` : '—'}</p>
                                                </div>
                                              </>
                                            ) : (
                                              <p className="text-[10px] text-zinc-300 dark:text-zinc-600 hidden sm:block">Sin datos</p>
                                            )}
                                            <ChevronDown className={`w-4 h-4 text-zinc-300 dark:text-zinc-600 transition-transform duration-150 ${isAdExpanded ? 'rotate-180' : ''}`} />
                                          </div>
                                        </button>
                                        {isAdExpanded && (
                                          <div className="border-t border-zinc-100 dark:border-zinc-800 p-3 flex gap-4">
                                            {ad.creative?.thumbnail_url && (
                                              <img src={ad.creative.thumbnail_url} alt="" className="w-32 h-32 rounded-xl object-cover flex-shrink-0 bg-zinc-100 dark:bg-zinc-800" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                              <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 mb-3 truncate">{ad.name || ad.creative?.name || 'Sin nombre'}</p>
                                              {adInsights ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                  {[
                                                    { label: 'Gasto', val: `$${adSpend.toFixed(2)}` },
                                                    { label: resultsLabel, val: adResults > 0 ? adResults.toFixed(0) : '—' },
                                                    { label: cprLabel, val: adCpa > 0 ? `$${adCpa.toFixed(2)}` : '—' },
                                                    ...(isEcom ? [{ label: 'ROAS', val: adRoas > 0 ? `${adRoas.toFixed(2)}x` : '—' }, { label: 'Valor', val: adValue > 0 ? `$${adValue.toFixed(0)}` : '—' }] : []),
                                                    { label: 'Impresiones', val: adImpr > 0 ? (adImpr >= 1000 ? `${(adImpr/1000).toFixed(1)}k` : String(adImpr)) : '—' },
                                                    { label: 'Alcance', val: adReach > 0 ? (adReach >= 1000 ? `${(adReach/1000).toFixed(1)}k` : String(adReach)) : '—' },
                                                    { label: 'CTR', val: adCtr > 0 ? `${adCtr.toFixed(2)}%` : '—' },
                                                  ].map(({ label, val }) => (
                                                    <div key={label} className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg px-2.5 py-2">
                                                      <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">{label}</p>
                                                      <p className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{val}</p>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                <p className="text-[11px] text-zinc-400">Sin datos de rendimiento para el período seleccionado</p>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
