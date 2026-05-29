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
  Users, DollarSign, Target, BarChart2, Globe, Smartphone, User, Megaphone, MessageSquare, Layers, Film, X
} from 'lucide-react';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';
import EmailLoader from '../components/ui/EmailLoader';

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



// ── Creative Preview Modal ────────────────────────────────────────────────────
const CreativePreviewModal = ({ preview, onClose }: {
  preview: {
    url: string;
    isVideo: boolean;
    videoId?: string;
    adId?: string;
    creativeId?: string;
    name?: string;
    previewShareableLink?: string;
    effectiveObjectStoryId?: string;
  };
  onClose: () => void;
}) => {
  const [imgLoaded, setImgLoaded] = React.useState(false);
  const [videoSrc, setVideoSrc] = React.useState<string | null>(null);
  const [embedHtml, setEmbedHtml] = React.useState<string | null>(null);
  const [videoLoading, setVideoLoading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  // Fetch video preview — tries Ad Previews API first (most reliable)
  React.useEffect(() => {
    if (!preview.isVideo) return;
    if (!preview.adId && !preview.creativeId && !preview.videoId) return;
    setVideoLoading(true);
    setVideoSrc(null);
    setEmbedHtml(null);
    const params = new URLSearchParams();
    if (preview.adId) params.set('adId', preview.adId);
    if (preview.creativeId) params.set('creativeId', preview.creativeId);
    if (preview.videoId) params.set('videoId', preview.videoId);
    fetch(`/api/meta-video?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.source) setVideoSrc(d.source);
        if (d?.embed_html) setEmbedHtml(d.embed_html);
      })
      .catch(() => {})
      .finally(() => setVideoLoading(false));
  }, [preview.adId, preview.creativeId, preview.videoId, preview.isVideo]);

  // Progress bar for images
  React.useEffect(() => {
    if (preview.isVideo) return;
    setImgLoaded(false);
    setProgress(0);
    const start = Date.now();
    const tick = setInterval(() => {
      setProgress(Math.min(80, ((Date.now() - start) / 2000) * 80));
    }, 50);
    return () => clearInterval(tick);
  }, [preview.url, preview.isVideo]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Loading bar (images only) */}
      {!preview.isVideo && !imgLoaded && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5 z-20">
          <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-200 rounded-full" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Close */}
      <button onClick={onClose} className="absolute top-4 right-4 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-20 backdrop-blur-sm">
        <X className="w-5 h-5" />
      </button>

      {/* Name + badge */}
      {preview.name && (
        <div className="absolute top-4 left-4 right-16 z-20">
          <p className="text-white/80 text-[13px] font-bold truncate max-w-[70vw]">{preview.name}</p>
          {preview.isVideo && (
            <div className="inline-flex items-center gap-1 mt-1 bg-white/10 px-2 py-0.5 rounded-full">
              <Film className="w-3 h-3 text-white/60" />
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Video</span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div
        className="relative animate-in zoom-in-95 duration-200 flex items-center justify-center"
        style={{ maxWidth: '90vw', maxHeight: '88vh' }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {preview.isVideo ? (
          videoLoading ? (
            <div className="w-[min(90vw,560px)] h-[min(88vh,420px)] rounded-2xl bg-zinc-900 border border-white/10 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-zinc-700 border-t-violet-500 animate-spin" />
              <span className="text-[12px] font-bold text-zinc-500">Cargando video...</span>
            </div>
          ) : videoSrc ? (
            /* Direct MP4 player */
            <div className="flex flex-col items-center gap-4">
              <video
                src={videoSrc}
                controls
                autoPlay
                playsInline
                className="rounded-2xl shadow-2xl border border-white/10 bg-black"
                style={{ maxWidth: '90vw', maxHeight: '70vh', minWidth: 'min(90vw, 400px)' }}
              />
              <a
                href={videoSrc}
                download={`video-${preview.videoId || 'creative'}.mp4`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-[12.5px] font-bold rounded-full transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                onClick={e => e.stopPropagation()}
              >
                <Download className="w-4 h-4" />
                Descargar Video
              </a>
            </div>
          ) : embedHtml ? (
            /* Meta Ad Preview iframe — resized to fit screen */
            <div
              className="rounded-2xl overflow-hidden shadow-2xl bg-zinc-900 border border-white/10"
              style={{ width: 'min(90vw, 420px)', maxHeight: '90vh' }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              dangerouslySetInnerHTML={{
                __html: embedHtml
                  .replace(/width="\d+"/g, 'width="100%"')
                  .replace(/width:\s*\d+px/g, 'width:100%')
                  .replace(/<iframe/g, '<iframe style="width:100%;max-height:80vh;border:none;"')
              }}
            />
          ) : (
            /* Fallback: thumbnail + open externally */
            <div className="flex flex-col items-center gap-4" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <div className="relative rounded-2xl overflow-hidden" style={{ maxWidth: 'min(90vw, 500px)' }}>
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="w-full rounded-2xl shadow-2xl border border-white/10"
                  style={{ maxHeight: '70vh', objectFit: 'contain' }}
                />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/10 border border-white/30 flex items-center justify-center backdrop-blur-sm">
                    <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
              </div>
              <a
                href={preview.effectiveObjectStoryId ? (
                  preview.effectiveObjectStoryId.includes('_') ? (() => {
                    const [pageId, postId] = preview.effectiveObjectStoryId.split('_');
                    return `https://www.facebook.com/permalink.php?story_fbid=${postId}&id=${pageId}`;
                  })() : `https://facebook.com/${preview.effectiveObjectStoryId}`
                ) : `https://www.facebook.com/ads/library/?id=${preview.creativeId || preview.adId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] text-white text-[13px] font-bold rounded-full transition-all shadow-lg"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                Ver en Facebook
              </a>
            </div>
          )
        ) : (
          /* Image */
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 rounded-2xl bg-zinc-900 animate-pulse flex items-center justify-center" style={{ minWidth: 280, minHeight: 280 }}>
                <div className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-violet-500 animate-spin" />
              </div>
            )}
            <img
              src={preview.url}
              alt={preview.name || 'Creative'}
              onLoad={() => { setProgress(100); setTimeout(() => setImgLoaded(true), 150); }}
              className={`rounded-2xl shadow-2xl border border-white/10 transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              style={{ maxWidth: '90vw', maxHeight: '88vh', width: 'auto', height: 'auto', minWidth: 'min(90vw, 320px)', objectFit: 'contain' }}
            />
          </>
        )}
      </div>
    </div>
  );
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

  // Active Creatives state
  const [activeAds, setActiveAds] = useState<any[]>([]);
  const [campaignMap, setCampaignMap] = useState<Record<string, string>>({});
  const [adInsightsMap, setAdInsightsMap] = useState<Record<string, any>>({});
  const [loadingAds, setLoadingAds] = useState(false);
  const [activePreview, setActivePreview] = useState<{
    url: string;
    isVideo: boolean;
    videoId?: string;
    adId?: string;
    creativeId?: string;
    name?: string;
    previewShareableLink?: string;
    effectiveObjectStoryId?: string;
  } | null>(null);

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
    setLoadingAds(true);
    
    const accountId = profile.meta_account_id;
    const adFields = 'ad_id,spend,impressions,reach,inline_link_click_ctr,inline_link_clicks,actions,cost_per_action_type,action_values,purchase_roas';
    
    Promise.all([
      metaAds.getAccountAds(accountId),
      metaAds.getAdInsightsForAccount(accountId, adFields, range).catch(() => []),
      metaAds.getCampaigns(accountId).catch(() => ({ data: [] })),
    ]).then(([adsRes, insightsRes, campsRes]) => {
      const active = (adsRes.data || []).filter((ad: any) => ad.status === 'ACTIVE');
      setActiveAds(active);
      const byAdId: Record<string, any> = {};
      (insightsRes || []).forEach((i: any) => { if (i.ad_id) byAdId[i.ad_id] = i; });
      setAdInsightsMap(byAdId);
      const cMap: Record<string, string> = {};
      ((campsRes as any).data || []).forEach((c: any) => { if (c.id) cMap[c.id] = c.name; });
      setCampaignMap(cMap);
    }).catch(err => {
      console.error("Error loading active ads:", err);
      setActiveAds([]);
      setAdInsightsMap({});
    }).finally(() => {
      setLoadingAds(false);
    });
  }, [profile?.id, activePreset, activeSince, activeUntil]);

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

  // Obsolete accordion helper functions removed.

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
        <EmailLoader loading={loading} color={BLUE} labels={['Inversión', 'Alcance']} />
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


      {/* Creativos Activos */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm p-6 mt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Layers className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Creativos Activos</h3>
              <p className="text-[11px] text-zinc-400">Anuncios en circulación y su rendimiento</p>
            </div>
          </div>
        </div>

        {loadingAds && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50 flex flex-col animate-pulse">
                <div className="h-52 bg-zinc-200 dark:bg-zinc-700" />
                <div className="p-4 space-y-3">
                  <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
                  <div className="h-3 w-1/4 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {[...Array(4)].map((_, j) => <div key={j} className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loadingAds && activeAds.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-8">No hay creativos activos en este momento</p>
        )}

        {activeAds.length > 0 && (() => {
          const adsWithSpend = activeAds.filter(ad => parseFloat(adInsightsMap[ad.id]?.spend || 0) > 0);
          // Group by campaign
          const grouped: Record<string, { campaignName: string; ads: any[] }> = {};
          adsWithSpend.forEach(ad => {
            const cid = ad.campaign_id || 'other';
            const cname = campaignMap[cid] || 'Sin campaña';
            if (!grouped[cid]) grouped[cid] = { campaignName: cname, ads: [] };
            grouped[cid].ads.push(ad);
          });

          return (
            <div className="space-y-8">
              {Object.entries(grouped).map(([cid, group]) => (
                <div key={cid}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 rounded-full bg-blue-500 flex-shrink-0" />
                    <h4 className="text-[13px] font-black text-zinc-800 dark:text-zinc-100 tracking-tight truncate">{group.campaignName}</h4>
                    <span className="text-[10px] font-bold text-zinc-400 flex-shrink-0">{group.ads.length} creativos</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {group.ads.map(ad => {
              const insights = adInsightsMap[ad.id];
              const adSpend = parseFloat(insights?.spend || 0);
              const adActions = insights?.actions || [];
              const adResults = (() => {
                if (isEcom) return extractActions(adActions, 'purchases');
                if (isLead) return extractActions(adActions, 'leads');
                if (isWpp) return extractActions(adActions, 'messages');
                return extractActions(adActions, 'purchases');
              })();
              const adCpa = adResults > 0 ? adSpend / adResults : 0;
              const adImpr = parseInt(insights?.impressions || 0);
              const adReach = parseInt(insights?.reach || 0);
              const adCtr = parseFloat(insights?.inline_link_click_ctr || 0);
              const adRoas = parseFloat(insights?.purchase_roas?.[0]?.value || 0);
              const adValue = (() => {
                const av = insights?.action_values || [];
                const v = av.find((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
                return v ? parseFloat(v.value) : 0;
              })();

              const isVideo = ad.creative?.object_type === 'VIDEO' || !!ad.creative?.video_id;
              const previewUrl = ad.creative?.image_url || ad.creative?.thumbnail_url;
              const thumbUrl = ad.creative?.image_url || ad.creative?.thumbnail_url;

              return (
                <div key={ad.id} className="rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 flex flex-col">
                  {/* Thumbnail — full width, tall, prominent */}
                  <div
                    className="relative w-full h-52 bg-zinc-100 dark:bg-zinc-800 cursor-pointer group overflow-hidden flex-shrink-0"
                    onClick={() => previewUrl && setActivePreview({
                      url: previewUrl,
                      isVideo,
                      videoId: ad.creative?.video_id,
                      adId: ad.id,
                      creativeId: ad.creative?.id,
                      name: ad.name,
                      previewShareableLink: ad.preview_shareable_link,
                      effectiveObjectStoryId: ad.creative?.effective_object_story_id
                    })}
                  >
                    {thumbUrl ? (
                      <>
                        {/* Blurred background fill for any letterboxing */}
                        <img src={thumbUrl} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60" aria-hidden />
                        {/* Main thumbnail, centered with contain */}
                        <img src={thumbUrl} alt={ad.name} className="relative z-10 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
                        {/* Dark hover overlay */}
                        <div className="absolute inset-0 z-20 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
                          <div className={`flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all duration-200 ${isVideo ? 'bg-white/90 scale-90 group-hover:scale-100' : 'bg-black/50 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100'}`}>
                            {isVideo ? (
                              <svg className="w-6 h-6 text-zinc-900 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            ) : (
                              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-zinc-400">
                        <Film className="w-10 h-10 opacity-20" />
                        <span className="text-[11px] font-bold opacity-30">Sin vista previa</span>
                      </div>
                    )}
                    {/* Badges */}
                    <div className="absolute top-2.5 left-2.5 z-30 flex gap-1.5">
                      {isVideo && (
                        <div className="flex items-center gap-1 bg-black/70 backdrop-blur-sm text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider">
                          <Film className="w-3 h-3" /> Video
                        </div>
                      )}
                    </div>
                    <div className="absolute top-2.5 right-2.5 z-30">
                      <span className="text-[9px] font-black px-2 py-1 rounded-lg bg-emerald-500/90 backdrop-blur-sm text-white uppercase tracking-wider">Activo</span>
                    </div>
                  </div>

                  {/* Info + Metrics */}
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div>
                      <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 leading-snug" title={ad.name}>
                        {ad.name || ad.creative?.name || 'Sin nombre'}
                      </p>
                      {ad.creative?.object_type && (
                        <p className="text-[10px] text-zinc-400 mt-0.5 font-semibold uppercase tracking-wider">{ad.creative.object_type}</p>
                      )}
                    </div>

                    {insights && (
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: 'Gasto', val: `$${adSpend.toFixed(0)}`, highlight: false },
                          { label: resultsLabel, val: adResults > 0 ? String(adResults.toFixed(0)) : '—', highlight: adResults > 0 },
                          { label: cprLabel, val: adCpa > 0 ? `$${adCpa.toFixed(0)}` : '—', highlight: false },
                          ...(isEcom ? [
                            { label: 'ROAS', val: adRoas > 0 ? `${adRoas.toFixed(2)}x` : '—', highlight: adRoas > 1 },
                            { label: 'Valor', val: adValue > 0 ? `$${adValue.toFixed(0)}` : '—', highlight: false },
                          ] : []),
                          { label: 'Impr.', val: adImpr > 0 ? fmtVal(adImpr) : '—', highlight: false },
                          { label: 'Alcance', val: adReach > 0 ? fmtVal(adReach) : '—', highlight: false },
                          { label: 'CTR', val: adCtr > 0 ? `${adCtr.toFixed(2)}%` : '—', highlight: false },
                        ].map(({ label, val, highlight }) => (
                          <div key={label} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-2.5 border border-zinc-100 dark:border-white/[0.04]">
                            <p className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
                            <p className={`text-[12px] font-bold leading-none ${highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-800 dark:text-zinc-100'}`}>{val}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-auto">
                      {/* Ver creativo */}
                      <button
                        onClick={() => previewUrl && setActivePreview({
                          url: previewUrl,
                          isVideo,
                          videoId: ad.creative?.video_id,
                          adId: ad.id,
                          creativeId: ad.creative?.id,
                          name: ad.name,
                          previewShareableLink: ad.preview_shareable_link,
                          effectiveObjectStoryId: ad.creative?.effective_object_story_id
                        })}
                        className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg text-[10px] font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-white/[0.05] hover:text-zinc-900 dark:hover:text-white"
                        title="Ver creativo"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        Ver
                      </button>
                      {/* Ver en Facebook */}
                      <a
                        href={ad.creative?.effective_object_story_id ? (
                          ad.creative.effective_object_story_id.includes('_') ? (() => {
                            const [pageId, postId] = ad.creative.effective_object_story_id.split('_');
                            return `https://www.facebook.com/permalink.php?story_fbid=${postId}&id=${pageId}`;
                          })() : `https://facebook.com/${ad.creative.effective_object_story_id}`
                        ) : `https://www.facebook.com/ads/library/?id=${ad.creative?.id || ad.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg text-[10px] font-bold text-[#1877F2] bg-[#1877F2]/8 dark:bg-[#1877F2]/10 hover:bg-[#1877F2]/15 dark:hover:bg-[#1877F2]/20"
                        title="Ver anuncio en Facebook"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        FB
                      </a>
                      {/* Instagram */}
                      <a
                        href={ad.creative?.instagram_permalink_url || 'https://www.instagram.com/'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg text-[10px] font-bold text-pink-500 dark:text-pink-400 bg-pink-50 dark:bg-pink-500/10 hover:bg-pink-100 dark:hover:bg-pink-500/15"
                        title="Ver en Instagram"
                        onClick={e => { if (!ad.creative?.instagram_permalink_url) e.preventDefault(); }}
                        style={{ opacity: ad.creative?.instagram_permalink_url ? 1 : 0.35, pointerEvents: ad.creative?.instagram_permalink_url ? 'auto' : 'none' }}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                        IG
                      </a>
                    </div>
                  </div>
                </div>
              );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Lightbox / Modal for Creative Preview */}
      {activePreview && <CreativePreviewModal preview={activePreview} onClose={() => setActivePreview(null)} />}

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
