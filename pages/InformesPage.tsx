import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  TrendingUp, Instagram, ArrowUpRight,
  Calendar, ChevronDown, ThumbsUp, MessageCircle,
  Image as ImageIcon, Facebook, Info,
  BarChart2, RefreshCw, FileText, Download, Users, Loader2
} from 'lucide-react';
import { metaAds, DatePreset, presetToRange, getPrevPeriod, today } from '../services/metaAds';
import { 
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from 'recharts';
import { supabase } from '../services/supabase';
import { AppleLoader } from '../components/ui/AppleLoader';
import { CenteredPageLoader } from '../components/ui/CenteredPageLoader';
import EmailLoader from '../components/ui/EmailLoader';

import SmoothImage from '../components/ui/SmoothImage';
import { DashboardMetric, MetricDetailChart } from '../components/ui/DashboardMetrics';

const isArrayOfObjectsEqual = (a: any[] | undefined | null, b: any[] | undefined | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const itemA = a[i];
    const itemB = b[i];
    if (itemA === itemB) continue;
    if (!itemA || !itemB) return false;
    const keysA = Object.keys(itemA);
    for (let j = 0; j < keysA.length; j++) {
      const key = keysA[j];
      if (itemA[key] !== itemB[key]) return false;
    }
  }
  return true;
};

interface InteractionsChartProps {
  data: any[];
  activeTab: string;
  darkMode: boolean;
}

const InteractionsChartComponent = ({ data, activeTab, darkMode }: InteractionsChartProps) => {
  const fmtN = (n: any) => {
    if (n === null || n === undefined) return '';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-premium dark:bg-zinc-950/80 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-black/[0.06] dark:border-white/[0.06] text-zinc-900 dark:text-white text-[12px] font-semibold space-y-1.5 animate-in fade-in duration-200">
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            {label ? label.split('-').reverse().join('/') : ''}
          </p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-zinc-550 dark:text-zinc-350">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-black text-zinc-900 dark:text-white">
                {entry.value.toLocaleString('es-AR')}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-60 md:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#1f1f23' : '#f1f1f4'} />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 9, fill: '#a1a1aa' }} 
            tickFormatter={(d) => { if (!d) return ''; const p = d.split('-'); return `${p[2]}/${p[1]}`; }} 
          />
          <YAxis 
            yAxisId="left"
            tick={{ fontSize: 9, fill: '#a1a1aa' }} 
            tickFormatter={fmtN}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 9, fill: '#a1a1aa' }} 
            tickFormatter={fmtN}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar 
            yAxisId="left"
            dataKey="Interacciones" 
            fill={activeTab === 'instagram' ? '#f472b6' : '#60a5fa'} 
            radius={[4, 4, 0, 0]}
          />
          <Bar 
            yAxisId="right"
            dataKey="Publicaciones" 
            fill="#a78bfa" 
            radius={[4, 4, 0, 0]}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const InteractionsChart = React.memo(InteractionsChartComponent, (prev, next) => {
  return (
    prev.activeTab === next.activeTab &&
    prev.darkMode === next.darkMode &&
    isArrayOfObjectsEqual(prev.data, next.data)
  );
});

interface PostTypesChartProps {
  data: any[];
}

const PostTypesChartComponent = ({ data }: PostTypesChartProps) => {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-40">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={70}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry: any, idx: number) => (
                <Cell key={`cell-${idx}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }: any) =>
                active && payload?.[0] ? (
                  <div className="glass-premium dark:bg-zinc-950/80 backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-lg border border-black/[0.06] dark:border-white/[0.06] text-[11px] font-semibold animate-in fade-in duration-200">
                    <span style={{ color: payload[0].payload.color }} className="font-bold">{payload[0].name}: </span>
                    <span className="text-zinc-800 dark:text-white font-black">{payload[0].value} posts</span>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="w-full space-y-2">
        {data.map((entry: any) => (
          <div key={entry.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">{entry.name}</span>
            </div>
            <span className="text-[11px] font-black text-zinc-800 dark:text-white">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const PostTypesChart = React.memo(PostTypesChartComponent, (prev, next) => {
  return isArrayOfObjectsEqual(prev.data, next.data);
});

const PRESETS: { id: DatePreset | 'custom'; label: string }[] = [
  { id: 'last_7d', label: 'Últimos 7 días' },
  { id: 'last_14d', label: 'Últimos 14 días' },
  { id: 'last_30d', label: 'Últimos 30 días' },
  { id: 'last_90d', label: 'Últimos 90 días' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes anterior' },
];

const IG_METRICS_CONFIG = [
  { key: 'followers',    label: 'Seguidores',      icon: Users,      color: '#ec4899', info: 'Cantidad de usuarios únicos que siguen tu cuenta comercial de Instagram.' },
  { key: 'posts',        label: 'Publicaciones',   icon: ImageIcon,  color: '#8b5cf6', info: 'Número total de fotos, videos y carruseles publicados en tu cuenta en el período.' },
  { key: 'interactions', label: 'Interacciones',   icon: ThumbsUp,   color: '#f59e0b', info: 'Suma de likes y comentarios recibidos en todas tus publicaciones en el período.' },
  { key: 'engagement',   label: 'Engagement',      icon: BarChart2,  color: '#10b981', info: 'Tasa de interacción promedio por publicación en relación al tamaño de tu audiencia.' },
] as const;

const FB_METRICS_CONFIG = [
  { key: 'followers',    label: 'Seguidores',      icon: Users,      color: '#3b82f6', info: 'Cantidad total de personas que siguen o le dieron "Me Gusta" a tu página de Facebook.' },
  { key: 'posts',        label: 'Publicaciones',   icon: ImageIcon,  color: '#8b5cf6', info: 'Número total de estados, fotos y videos publicados en el muro de tu página en el período.' },
  { key: 'interactions', label: 'Interacciones',   icon: ThumbsUp,   color: '#f59e0b', info: 'Suma total de reacciones, likes, comentarios y veces compartido en tu feed en el período.' },
  { key: 'engagement',   label: 'Engagement',      icon: BarChart2,  color: '#10b981', info: 'Tasa de interacción promedio en tu página de Facebook en relación al total de seguidores.' },
] as const;

type SocialMetricKey = 'followers' | 'posts' | 'interactions' | 'engagement';

const MiniCal = ({ year, month, since, until, hovering, onDay, onHover, onPrev, onNext }: any) => {
  const touchStart = useRef<number>(0);
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

  const prevDate = useRef(new Date(year, month, 1).getTime());
  const current = new Date(year, month, 1).getTime();
  let animClass = 'animate-in fade-in zoom-in-95 duration-200';
  if (current > prevDate.current) animClass = 'animate-in fade-in slide-in-from-right-16 duration-300';
  else if (current < prevDate.current) animClass = 'animate-in fade-in slide-in-from-left-16 duration-300';
  useEffect(() => { prevDate.current = current; }, [current]);

  return (
    <div className="w-[240px] overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex items-center mb-4 px-1">
        <div className="w-8 flex justify-start">{onPrev && <button onClick={onPrev} className="p-1 hover:bg-zinc-105 dark:hover:bg-zinc-800 rounded-md transition-colors group"><ChevronDown className="w-4 h-4 rotate-90 text-zinc-400 group-hover:text-zinc-650 dark:group-hover:text-zinc-205" /></button>}</div>
        <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 text-center">{MONTHS_ES[month]} {year}</span>
        <div className="w-8 flex justify-end">{onNext && <button onClick={onNext} className="p-1 hover:bg-zinc-105 dark:hover:bg-zinc-800 rounded-md transition-colors group"><ChevronDown className="w-4 h-4 -rotate-90 text-zinc-400 group-hover:text-zinc-650 dark:group-hover:text-zinc-205" /></button>}</div>
      </div>
      <div key={`${year}-${month}`} className={`grid grid-cols-7 gap-y-1 ${animClass}`}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="text-[10px] font-bold text-zinc-350 text-center pb-2 uppercase tracking-tighter">{d}</div>)}
        {days.map((d, i) => {
          if (!d) return <div key={`empty-${i}`} />;
          const isToday = d === todayStr; const isFuture = d > todayStr; const isSelected = d === since || d === until;
          const isInRange = since && until && d > since && d < until;
          const isHovering = since && !until && hovering && ((d > since && d <= hovering) || (d < since && d >= hovering));
          return (
            <button key={d} onMouseEnter={() => !isFuture && onHover(d)} onClick={() => !isFuture && onDay(d)} disabled={isFuture} className={`h-8 w-8 text-[11px] font-bold transition-all relative flex items-center justify-center ${isSelected ? 'bg-violet-600 text-white rounded-full z-10 shadow-md shadow-violet-200 dark:shadow-none' : (isInRange || isHovering) ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-600' : isFuture ? 'text-zinc-200 dark:text-zinc-800 cursor-default' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-105 dark:hover:bg-zinc-800 rounded-full'} ${isToday && !isSelected ? 'text-violet-650 dark:text-violet-500 ring-1 ring-violet-100 dark:ring-violet-900/30' : ''}`}>{d.split('-')[2]}</button>
          );
        })}
      </div>
    </div>
  );
};

export default function InformesPage() {
  const { profile: authProfile } = useAuth();
  const { viewAsProfile, isViewingAs } = useViewAs();
  const { darkMode } = useTheme();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'instagram' | 'facebook'>('instagram');

  // Date States
  const [activePreset, setActivePreset] = useState<DatePreset | 'custom'>('last_30d');
  const [activeSince, setActiveSince] = useState(presetToRange('last_30d').since);
  const [activeUntil, setActiveUntil] = useState(presetToRange('last_30d').until);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<DatePreset | 'custom'>(activePreset);
  const [pendingSince, setPendingSince] = useState(activeSince);
  const [pendingUntil, setPendingUntil] = useState(activeUntil);
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [hovering, setHovering] = useState('');

  // Data States
  const [igProfile, setIgProfile] = useState<any>(null);
  const [fbProfile, setFbProfile] = useState<any>(null);
  const [socialSnapshots, setSocialSnapshots] = useState<any[]>([]);
  const [loadingSocial, setLoadingSocial] = useState(true);
  const isDateReloading = loadingSocial && (!!igProfile || !!fbProfile);
  const [error, setError] = useState<string | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);


  // Media Feed States
  const [igMedia, setIgMedia] = useState<any[]>([]);
  const [fbMedia, setFbMedia] = useState<any[]>([]);

  // Expanded metric for detail chart
  const [expandedMetric, setExpandedMetric] = useState<SocialMetricKey>('followers');

  const [refreshKey, setRefreshKey] = useState(0);

  const [prevClientId, setPrevClientId] = useState(clientId);
  if (clientId !== prevClientId) {
    setPrevClientId(clientId);
    setIgProfile(null);
    setFbProfile(null);
    setSocialSnapshots([]);
    setIgMedia([]);
    setFbMedia([]);
    setLoadingSocial(true);
  }

  // Calculate current range and previous comparison range
  const range = useMemo(() => activePreset === 'custom' ? { since: activeSince, until: activeUntil } : presetToRange(activePreset), [activePreset, activeSince, activeUntil]);
  const prevRange = useMemo(() => getPrevPeriod(range.since, range.until), [range]);

  // Click outside to close datepicker dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset expanded metric if not supported on the active platform
  useEffect(() => {
    const config = activeTab === 'instagram' ? IG_METRICS_CONFIG : FB_METRICS_CONFIG;
    const isSupported = config.some(m => m.key === expandedMetric);
    if (!isSupported) {
      setExpandedMetric('followers');
    }
  }, [activeTab, expandedMetric]);

  // Fetching Logic
  useEffect(() => {
    const igId = (profile as any)?.ig_business_id;
    const fbPageId = (profile as any)?.fb_page_id;
    if (!clientId || (!igId && !fbPageId)) {
      setLoadingSocial(false);
      return;
    }

    const run = async () => {
      setLoadingSocial(true);
      setError(null);
      setFbError(null);
      try {
        // 1. Fetch current profile data
        const [igRes, fbRes] = await Promise.all([
          igId ? metaAds.getInstagramProfile(igId, fbPageId || undefined).catch(() => null) : null,
          fbPageId ? metaAds.getFacebookPageInfo(fbPageId).catch(() => null) : null,
        ]);
        if (igRes) setIgProfile(igRes);
        if (fbRes) setFbProfile(fbRes);

        // 2. Persist daily snapshot (silently — table may not exist yet)
        try {
          const todayStr = today();
          const snap: any = { client_id: clientId, snapshot_date: todayStr };
          if (igRes?.followers_count) snap.ig_followers = igRes.followers_count;
          if (igRes?.follows_count)   snap.ig_following = igRes.follows_count;
          if (igRes?.media_count)     snap.ig_posts     = igRes.media_count;
          if (fbRes?.fan_count)       snap.fb_fans      = fbRes.fan_count;
          if (fbRes?.followers_count) snap.fb_followers = fbRes.followers_count;

          if (snap.ig_followers || snap.fb_fans) {
            await supabase.from('car_social_snapshots').upsert(snap, { onConflict: 'client_id,snapshot_date' });
          }

          const { data: snaps } = await supabase
            .from('car_social_snapshots')
            .select('snapshot_date, ig_followers, ig_following, ig_posts, fb_fans, fb_followers')
            .eq('client_id', clientId)
            .gte('snapshot_date', prevRange.since)
            .lte('snapshot_date', range.until)
            .order('snapshot_date', { ascending: true });
          setSocialSnapshots(snaps || []);
        } catch {
          // snapshot table unavailable — metrics still work from live API data
        }

        // 3. Fetch Meta Feed for post-level analysis (up to 50 posts)
        const [igMediaRes, fbFeedRes] = await Promise.all([
          igId ? metaAds.getInstagramMedia(igId, 50, undefined, fbPageId || undefined).catch(() => []) : [],
          fbPageId ? metaAds.getFacebookPageFeed(fbPageId, 50).catch((err: any) => { setFbError(err.message || String(err)); return []; }) : [],
        ]);

        const igPosts = (igMediaRes as any)?.data || igMediaRes || [];
        setIgMedia(igPosts);

        const fbPosts = ((fbFeedRes as any)?.data || fbFeedRes || []).map((p: any) => ({
          ...p,
          source: p.source || p.attachments?.data?.[0]?.media?.source || null,
        }));
        setFbMedia(fbPosts);

      } catch (err: any) {
        console.error('Error fetching social report data:', err);
        setError(err.message || 'Error al obtener los datos de redes sociales.');
      } finally {
        setLoadingSocial(false);
      }
    };
    run();
  }, [clientId, activeSince, activeUntil, refreshKey, profile]);

  const handleApply = () => {
    setActivePreset(pendingPreset);
    setActiveSince(pendingSince);
    setActiveUntil(pendingUntil || pendingSince);
    setShowDatePicker(false);
  };

  const fmtDateRange = (d: string) => {
    if (!d) return '';
    const parts = d.split('-');
    if (parts.length < 3) return d;
    const month = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(parts[1])-1];
    return `${parts[2]} ${month}`;
  };

  const fmtN = (n: any) => {
    const v = parseInt(n);
    if (isNaN(v)) return '—';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return v.toLocaleString('es-AR');
  };

  const getChange = (curr: number | undefined | null, prev: number | undefined | null) => {
    if (curr == null || prev == null || prev === 0) return undefined;
    return ((curr - prev) / prev) * 100;
  };

  // Helper to retrieve Meta insights total sum
  const sumInsightMetric = (insightsRes: any, metricName: string) => {
    if (!insightsRes || !insightsRes.data) return null;
    const metric = insightsRes.data.find((m: any) => m.name === metricName);
    if (!metric || !metric.values) return null;
    return metric.values.reduce((sum: number, v: any) => sum + (v.value || 0), 0);
  };

  // Metric Computations based on current platform tab
  const metrics = useMemo(() => {
    const isIg = activeTab === 'instagram';
    const profileData = isIg ? igProfile : fbProfile;

    // Filter snapshots into current and previous comparison periods
    const snaps = socialSnapshots || [];
    const currentSnaps = snaps.filter(s => s.snapshot_date >= range.since && s.snapshot_date <= range.until);
    const prevSnaps = snaps.filter(s => s.snapshot_date >= prevRange.since && s.snapshot_date <= prevRange.until);

    // Follower calculations
    const startFollowers = isIg
      ? (currentSnaps[0]?.ig_followers || profileData?.followers_count || 0)
      : (currentSnaps[0]?.fb_followers || currentSnaps[0]?.fb_fans || profileData?.followers_count || profileData?.fan_count || 0);

    const endFollowers = isIg
      ? (profileData?.followers_count || currentSnaps[currentSnaps.length - 1]?.ig_followers || 0)
      : (profileData?.followers_count || profileData?.fan_count || currentSnaps[currentSnaps.length - 1]?.fb_followers || currentSnaps[currentSnaps.length - 1]?.fb_fans || 0);

    const followerGrowth = endFollowers - startFollowers;
    const followerGrowthPct = startFollowers > 0 ? (followerGrowth / startFollowers) * 100 : 0;

    const prevStart = isIg
      ? (prevSnaps[0]?.ig_followers || 0)
      : (prevSnaps[0]?.fb_followers || prevSnaps[0]?.fb_fans || 0);

    const prevEnd = isIg
      ? (prevSnaps[prevSnaps.length - 1]?.ig_followers || 0)
      : (prevSnaps[prevSnaps.length - 1]?.fb_followers || prevSnaps[prevSnaps.length - 1]?.fb_fans || 0);

    const prevFollowerGrowth = prevEnd - prevStart;
    const followerGrowthDiff = followerGrowth - prevFollowerGrowth;

    // Post-level metrics (Interactions & Engagement)
    const media = isIg ? igMedia : fbMedia;
    const currentPosts = media.filter(p => {
      const dateStr = (p.timestamp || p.created_time || '').split('T')[0];
      return dateStr && dateStr >= range.since && dateStr <= range.until;
    });

    const prevPosts = media.filter(p => {
      const dateStr = (p.timestamp || p.created_time || '').split('T')[0];
      return dateStr && dateStr >= prevRange.since && dateStr <= prevRange.until;
    });

    const postsCount = currentPosts.length;
    const prevPostsCount = prevPosts.length;

    const getPostInteractions = (p: any) => {
      if (isIg) {
        return (p.like_count || 0) + (p.comments_count || 0);
      } else {
        return (p.likes?.summary?.total_count || 0) + (p.comments?.summary?.total_count || 0);
      }
    };

    const totalInteractions = currentPosts.reduce((sum, p) => sum + getPostInteractions(p), 0);
    const prevInteractions = prevPosts.reduce((sum, p) => sum + getPostInteractions(p), 0);
    const interactionsChangePct = getChange(totalInteractions, prevInteractions);

    const avgEngagementPerPost = postsCount > 0 ? totalInteractions / postsCount : 0;
    const prevAvgEngagementPerPost = prevPostsCount > 0 ? prevInteractions / prevPostsCount : 0;

    const currentFollowersReference = endFollowers || 1;
    const prevFollowersReference = prevEnd || currentFollowersReference;

    const engagementRate = postsCount > 0 ? (avgEngagementPerPost / currentFollowersReference) * 100 : 0;
    const prevEngagementRate = prevPostsCount > 0 ? (prevAvgEngagementPerPost / prevFollowersReference) * 100 : 0;
    const engagementRateChangePct = getChange(engagementRate, prevEngagementRate);

    // Top Performing Posts ranking
    const topPostsList = currentPosts
      .map(p => {
        let likes = 0;
        let comments = 0;
        if (isIg) {
          likes = p.like_count || 0;
          comments = p.comments_count || 0;
        } else {
          likes = p.likes?.summary?.total_count || 0;
          comments = p.comments?.summary?.total_count || 0;
        }
        return {
          id: p.id,
          caption: p.caption || p.message || '',
          thumbnail: isIg ? (p.thumbnail_url || p.media_url) : p.full_picture,
          timestamp: p.timestamp || p.created_time,
          likes,
          comments,
          total: likes + comments,
          permalink: p.permalink || p.permalink_url,
          media_type: p.media_type || (p.full_picture ? 'PHOTO' : 'TEXT'),
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    return {
      currentFollowers: endFollowers,
      followerGrowth,
      followerGrowthPct,
      totalInteractions,
      interactionsChangePct,
      postsCount,
      postsChangePct: getChange(postsCount, prevPostsCount),
      engagementRate,
      engagementRateChangePct,
      topPostsList,
      currentSnaps,
    };
  }, [
    activeTab, igProfile, fbProfile, socialSnapshots, range, prevRange,
    igMedia, fbMedia
  ]);

  // ─── Per-metric time-series data for MetricDetailChart ───────────────────
  const buildDailyRange = (since: string, until: string): string[] => {
    const dates: string[] = [];
    let d = new Date(since + 'T12:00:00');
    const end = new Date(until + 'T12:00:00');
    while (d <= end) { dates.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
    return dates;
  };

  // Build MetricDetailChart-compatible series: [{ date, val }]
  const metricSeriesData = useMemo(() => {
    const isIg = activeTab === 'instagram';
    const snaps = (socialSnapshots || []).filter(s => s.snapshot_date >= range.since && s.snapshot_date <= range.until);
    const snapMap: Record<string, any> = {};
    snaps.forEach(s => { snapMap[s.snapshot_date] = s; });

    const media = isIg ? igMedia : fbMedia;
    const currentPosts = media.filter(p => {
      const d = (p.timestamp || p.created_time || '').split('T')[0];
      return d && d >= range.since && d <= range.until;
    });

    const days = buildDailyRange(range.since, range.until);
    const endFollowers = metrics.currentFollowers || 0;

    // Follower series — real snapshots when available, flat line at current count otherwise
    const followers = snaps.length >= 2
      ? snaps.map(s => ({ date: s.snapshot_date, val: isIg ? (s.ig_followers || 0) : (s.fb_followers || s.fb_fans || 0) }))
      : endFollowers > 0
        ? days.map(d => ({ date: d, val: endFollowers }))
        : [];

    // Interaction & engagement per-day aggregated from posts
    const dayInteractions: Record<string, number> = {};
    const dayPosts: Record<string, number> = {};
    days.forEach(d => { dayInteractions[d] = 0; dayPosts[d] = 0; });
    currentPosts.forEach(p => {
      const d = (p.timestamp || p.created_time || '').split('T')[0];
      if (dayInteractions[d] !== undefined) {
        const interactions = isIg ? (p.like_count || 0) + (p.comments_count || 0) : (p.likes?.summary?.total_count || 0) + (p.comments?.summary?.total_count || 0);
        dayInteractions[d] += interactions;
        dayPosts[d] += 1;
      }
    });

    const interactions = days.map(d => ({ date: d, val: dayInteractions[d] || 0 }));
    const postsPerDay  = days.map(d => ({ date: d, val: dayPosts[d]        || 0 }));

    // Engagement: cumulative running average (interactions/post / followers × 100)
    // Gives a smooth converging line instead of sparse daily spikes
    const fRef = endFollowers || 1;
    let cumInt = 0; let cumPosts = 0;
    const engagement = days.map(d => {
      cumInt   += dayInteractions[d] || 0;
      cumPosts += dayPosts[d]        || 0;
      return {
        date: d,
        val: cumPosts > 0 ? Number(((cumInt / cumPosts) / fRef * 100).toFixed(4)) : 0,
      };
    });

    return { followers, interactions, engagement, posts: postsPerDay };
  }, [activeTab, socialSnapshots, range, igMedia, fbMedia, metrics.currentFollowers]);

  const prevMetricSeriesData = useMemo(() => {
    const isIg = activeTab === 'instagram';
    const snaps = (socialSnapshots || []).filter(s => s.snapshot_date >= prevRange.since && s.snapshot_date <= prevRange.until);
    const media = isIg ? igMedia : fbMedia;
    const prevPosts = media.filter(p => {
      const d = (p.timestamp || p.created_time || '').split('T')[0];
      return d && d >= prevRange.since && d <= prevRange.until;
    });
    const days = buildDailyRange(prevRange.since, prevRange.until);
    const endFollowers = isIg ? (snaps[snaps.length-1]?.ig_followers || 0) : (snaps[snaps.length-1]?.fb_followers || snaps[snaps.length-1]?.fb_fans || 0);

    const followerData = snaps.length >= 2 ? snaps.map(s => ({ date: s.snapshot_date, val: isIg ? (s.ig_followers || 0) : (s.fb_followers || s.fb_fans || 0) })) : [];
    const dayInt: Record<string, number> = {}; const dayP: Record<string, number> = {};
    days.forEach(d => { dayInt[d] = 0; dayP[d] = 0; });
    prevPosts.forEach(p => { const d = (p.timestamp || p.created_time || '').split('T')[0]; if (dayInt[d] !== undefined) { dayInt[d] += isIg ? (p.like_count || 0) + (p.comments_count || 0) : (p.likes?.summary?.total_count || 0) + (p.comments?.summary?.total_count || 0); dayP[d] += 1; } });
    // Fallback to current followers so engagement % stays sane when no prev snapshots
    const fRef = endFollowers || metrics.currentFollowers || 1;
    let cI = 0; let cP = 0;
    return {
      followers: followerData,
      posts: days.map(d => ({ date: d, val: dayP[d] || 0 })),
      interactions: days.map(d => ({ date: d, val: dayInt[d] || 0 })),
      engagement: days.map(d => { cI += dayInt[d] || 0; cP += dayP[d] || 0; return { date: d, val: cP > 0 ? Number(((cI / cP) / fRef * 100).toFixed(4)) : 0 }; }),
    };
  }, [activeTab, socialSnapshots, prevRange, igMedia, fbMedia, metrics.currentFollowers]);

  // Daily engagement bar chart data
  const dailyInteractionsData = useMemo(() => {
    const isIg = activeTab === 'instagram';
    const media = isIg ? igMedia : fbMedia;
    const currentPosts = media.filter(p => {
      const dateStr = (p.timestamp || p.created_time || '').split('T')[0];
      return dateStr && dateStr >= range.since && dateStr <= range.until;
    });
    const dataMap: Record<string, { interactions: number; posts: number }> = {};
    let d = new Date(range.since + 'T12:00:00');
    const end = new Date(range.until + 'T12:00:00');
    while (d <= end) {
      const iso = d.toISOString().split('T')[0];
      dataMap[iso] = { interactions: 0, posts: 0 };
      d.setDate(d.getDate() + 1);
    }
    currentPosts.forEach(p => {
      const dateStr = (p.timestamp || p.created_time || '').split('T')[0];
      if (dataMap[dateStr]) {
        const likes = isIg ? (p.like_count || 0) : (p.likes?.summary?.total_count || 0);
        const comments = isIg ? (p.comments_count || 0) : (p.comments?.summary?.total_count || 0);
        dataMap[dateStr].interactions += (likes + comments);
        dataMap[dateStr].posts += 1;
      }
    });
    return Object.entries(dataMap).map(([date, val]) => ({
      date,
      Interacciones: val.interactions,
      Publicaciones: val.posts,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [activeTab, igMedia, fbMedia, range]);

  // Pie chart: post-type distribution
  const postTypeData = useMemo(() => {
    const isIg = activeTab === 'instagram';
    const media = isIg ? igMedia : fbMedia;
    const currentPosts = media.filter(p => {
      const d = (p.timestamp || p.created_time || '').split('T')[0];
      return d && d >= range.since && d <= range.until;
    });
    if (currentPosts.length === 0) return [];
    const counts: Record<string, number> = {};
    currentPosts.forEach(p => {
      const t = (p.media_type || (p.full_picture ? 'PHOTO' : 'TEXT')).toUpperCase();
      const label = t === 'CAROUSEL_ALBUM' ? 'Carrusel' : t === 'VIDEO' ? 'Video' : t === 'TEXT' ? 'Texto' : 'Imagen';
      counts[label] = (counts[label] || 0) + 1;
    });
    const PIE_COLORS: Record<string, string> = { 'Imagen': '#ec4899', 'Video': '#8b5cf6', 'Carrusel': '#f59e0b', 'Texto': '#6b7280' };
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: PIE_COLORS[name] || '#94a3b8' }));
  }, [activeTab, igMedia, fbMedia, range]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-955/90 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 backdrop-blur-md p-3.5 rounded-2xl shadow-xl text-zinc-900 dark:text-white text-[12px] font-semibold space-y-1.5 animate-in fade-in duration-200">
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
            {label ? label.split('-').reverse().join('/') : ''}
          </p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-zinc-550 dark:text-zinc-350">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}:</span>
              </span>
              <span className="font-black text-zinc-900 dark:text-white">
                {entry.value.toLocaleString('es-AR')}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const handlePrint = () => {
    window.print();
  };

  const igId = (profile as any)?.ig_business_id;
  const fbPageId = (profile as any)?.fb_page_id;

  const currentTabColor = activeTab === 'instagram' ? 'text-pink-500' : 'text-blue-600';
  const currentTabBg = activeTab === 'instagram' ? 'bg-pink-500' : 'bg-blue-600';
  const currentTabGlow = activeTab === 'instagram' ? 'shadow-pink-500/20' : 'shadow-blue-600/20';

  return (
    <CenteredPageLoader isLoading={false}>

    <div className="space-y-6 md:space-y-8 w-full pt-3 md:pt-6 animate-in fade-in duration-300 print:bg-white print:p-0 print:space-y-4">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5 print:border-b-2 print:pb-2">
        <div>
          <h1 className="text-[26px] md:text-[30px] font-black tracking-tight text-zinc-900 dark:text-white leading-none flex items-center gap-2">
            Métricas de Redes Sociales
          </h1>
          <p className="text-[12.5px] text-zinc-400 font-bold mt-1.5 flex items-center gap-1.5 print:hidden">
            Análisis de crecimiento orgánico, engagement de publicaciones y rendimiento por períodos.
          </p>
          <p className="hidden print:block text-[13px] text-zinc-500 mt-1 font-bold">
            Período: {fmtDateRange(range.since)} — {fmtDateRange(range.until)}
          </p>
        </div>

        {/* Date picker + reload */}
        <div className="flex items-center gap-2 flex-wrap justify-start md:justify-end print:hidden">
          
          {/* Platform Tab Selector */}
          <div className="flex items-center gap-1 bg-zinc-150/80 dark:bg-zinc-800/60 p-1 rounded-2xl border border-zinc-250/20 dark:border-zinc-700/60">
            <button
              onClick={() => setActiveTab('instagram')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-black transition-all ${
                activeTab === 'instagram'
                  ? 'bg-pink-500 text-white shadow-md shadow-pink-500/20'
                  : 'text-zinc-550 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Instagram className="w-3.5 h-3.5" />
              <span>Instagram</span>
            </button>
            <button
              onClick={() => setActiveTab('facebook')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-black transition-all ${
                activeTab === 'facebook'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-zinc-550 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Facebook className="w-3.5 h-3.5" />
              <span>Facebook</span>
            </button>
          </div>

          {/* Styled Datepicker Dropdown */}
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-1.5 py-1 shadow-sm h-10 relative z-40" ref={datePickerRef}>
            <button onClick={() => setShowDatePicker(!showDatePicker)} className="flex items-center gap-2 px-3 h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl transition-all group">
              {loadingSocial && (igProfile || fbProfile) ? (
                <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
              ) : (
                <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-violet-500 transition-colors" />
              )}
              <span className="text-[12px] font-black text-zinc-700 dark:text-zinc-200">
                {activePreset === 'custom' ? `${fmtDateRange(activeSince)} - ${fmtDateRange(activeUntil)}` : PRESETS.find(p => p.id === activePreset)?.label || activePreset}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>
            {showDatePicker && (
              <div className="absolute left-0 md:left-auto md:right-0 top-full mt-2.5 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 w-[280px] sm:w-[310px] md:w-auto origin-top-left md:origin-top-right">
                <div className="w-full md:w-[170px] border-b md:border-b-0 md:border-r border-zinc-100 dark:border-zinc-800 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible">
                  {PRESETS.map(p => (
                    <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); setActivePreset(p.id as any); setActiveSince(r.since); setActiveUntil(r.until); setShowDatePicker(false); }} className={`flex-shrink-0 text-left px-2.5 py-1 md:px-3 md:py-1.5 rounded-xl text-[12px] md:text-[12px] font-black transition-all ${pendingPreset === p.id ? 'bg-violet-600 text-white shadow-md shadow-violet-500/10' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
                  ))}
                </div>
                <div className="px-1.5 py-4 md:p-5 flex flex-col items-center md:items-stretch">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                    <MiniCal year={calYear} month={calMonth} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onPrev={() => { if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); } else { setCalMonth(calMonth - 1); } }} onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }} />
                    <div className="hidden md:block">
                      <MiniCal year={calMonth === 11 ? calYear + 1 : calYear} month={calMonth === 11 ? 0 : calMonth + 1} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }} />
                    </div>
                  </div>
                  <div className="w-full flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <button onClick={() => setShowDatePicker(false)} className="px-4 h-9 rounded-xl text-[11px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5">Cancelar</button>
                    <button onClick={handleApply} className="px-4 h-9 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] hover:opacity-90 flex items-center justify-center gap-1.5">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      <div>
      {/* Main content body */}
      {error ? (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-5 rounded-3xl flex items-start gap-3">
          <Info className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-800 dark:text-red-400 text-[14.5px]">Error al cargar datos</h3>
            <p className="text-[13px] text-red-600 dark:text-red-500 mt-1">{error}</p>
          </div>
        </div>
      ) : !igId && !fbPageId ? (
        <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-10 rounded-[32px] text-center max-w-lg mx-auto space-y-4 shadow-sm">
          <Instagram className="w-12 h-12 text-zinc-400 mx-auto" />
          <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Redes sociales no configuradas</h3>
          <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
            Configurá tu cuenta de Instagram o página de Facebook en la Gestión de Clientes para habilitar las métricas de crecimiento.
          </p>
        </div>
      ) : (activeTab === 'instagram' && !igId) ? (
        <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-10 rounded-[32px] text-center max-w-lg mx-auto space-y-4 shadow-sm">
          <Instagram className="w-12 h-12 text-pink-500 mx-auto" />
          <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Instagram no conectado</h3>
          <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
            Este cliente no tiene una cuenta de Instagram Business vinculada en la base de datos.
          </p>
        </div>
      ) : (activeTab === 'facebook' && !fbPageId) ? (
        <div className="bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 p-10 rounded-[32px] text-center max-w-lg mx-auto space-y-4 shadow-sm">
          <Facebook className="w-12 h-12 text-blue-600 mx-auto" />
          <h3 className="font-black text-zinc-800 dark:text-zinc-200 text-[18px]">Facebook no conectado</h3>
          <p className="text-[13.5px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-semibold">
            Este cliente no tiene una página de Facebook vinculada en la base de datos.
          </p>
        </div>
      ) : (
        <div className="space-y-6 md:space-y-8">
          
          {/* Facebook Feed Error Notice */}
          {activeTab === 'facebook' && fbError && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-250 dark:border-amber-900/30 p-4 rounded-2xl flex items-start gap-2.5">
              <Info className="w-4.5 h-4.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-[12px] text-amber-800 dark:text-amber-400 font-semibold leading-relaxed">
                <span className="font-bold">Nota de permisos:</span> No pudimos obtener datos dinámicos de publicaciones de Facebook. Las estadísticas se calcularán usando los datos locales de la base de datos.
              </div>
            </div>
          )}

          {/* ── Clickable KPI Cards (DashboardMetric) ────────────────────────── */}
          {(() => {
            const isIg = activeTab === 'instagram';
            const config = isIg ? IG_METRICS_CONFIG : FB_METRICS_CONFIG;

            // Map metric key → display value & change pct
            const getValue = (key: string): { val: string; changePct: number | undefined; trend: 'up' | 'down' } => {
              switch (key) {
                case 'followers': return {
                  val: fmtN(metrics.currentFollowers),
                  changePct: metrics.followerGrowthPct,
                  trend: metrics.followerGrowthPct >= 0 ? 'up' : 'down',
                };
                case 'posts': return {
                  val: fmtN(metrics.postsCount),
                  changePct: metrics.postsChangePct,
                  trend: (metrics.postsChangePct ?? 0) >= 0 ? 'up' : 'down',
                };
                case 'interactions': return {
                  val: fmtN(metrics.totalInteractions),
                  changePct: metrics.interactionsChangePct,
                  trend: (metrics.interactionsChangePct ?? 0) >= 0 ? 'up' : 'down',
                };
                case 'engagement': return {
                  val: `${metrics.engagementRate.toFixed(2)}%`,
                  changePct: metrics.engagementRateChangePct,
                  trend: (metrics.engagementRateChangePct ?? 0) >= 0 ? 'up' : 'down',
                };
                default: return { val: '—', changePct: undefined, trend: 'up' };
              }
            };

            return (
              <EmailLoader loading={loadingSocial} color="#8b5cf6" labels={config.map(m => m.label)}>
                <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-black/[0.06] dark:border-white/[0.06] shadow-sm overflow-hidden grid grid-cols-2 md:grid-cols-3 xl:flex xl:flex-nowrap">
                  {config.map(m => {
                    const { val, changePct, trend } = getValue(m.key);
                    const series = (metricSeriesData as any)[m.key] || [];
                    return (
                      <DashboardMetric
                        key={m.key}
                        icon={m.icon}
                        label={m.label}
                        value={val}
                        change={changePct}
                        trend={trend}
                        data={series}
                        color={m.color}
                        loading={loadingSocial}
                        active={expandedMetric === m.key}
                        onClick={() => setExpandedMetric(m.key as SocialMetricKey)}
                        info={m.info}
                      />
                    );
                  })}
                </div>
              </EmailLoader>
            );
          })()}

          <div className={`space-y-6 md:space-y-8 transition-opacity duration-200 ${loadingSocial ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          {/* ── Metric Evolution Detail Chart ─────────────────────────────────── */}
          {!loadingSocial && (() => {
            const isIg = activeTab === 'instagram';
            const config = (isIg ? IG_METRICS_CONFIG : FB_METRICS_CONFIG).find(m => m.key === expandedMetric);
            if (!config) return null;
            const series = (metricSeriesData as any)[expandedMetric] || [];
            const prevSeries = (prevMetricSeriesData as any)[expandedMetric] || [];
            const emptyMessages: Record<string, string> = {
              followers: 'Sin historial suficiente — la evolución se acumula con el uso diario',
              posts: 'Sin publicaciones en este período',
              interactions: 'Sin interacciones registradas en este período',
              engagement: 'Sin publicaciones para calcular el engagement',
            };
            return (
              <MetricDetailChart
                label={config.label}
                color={config.color}
                data={series}
                prevData={prevSeries}
                emptyMessage={emptyMessages[expandedMetric]}
              />
            );
          })()}

          {/* ── Charts Row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Interactions BarChart (2/3 width) */}
            <div className="lg:col-span-2 bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-[14px] font-black text-zinc-800 dark:text-white">Actividad e Interacciones</h3>
                <p className="text-[11px] text-zinc-400">Total diario de likes, comentarios y publicaciones publicadas</p>
              </div>
              <InteractionsChart data={dailyInteractionsData} activeTab={activeTab} darkMode={darkMode} />
            </div>

            {/* Post-type Donut PieChart (1/3 width) */}
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-[14px] font-black text-zinc-800 dark:text-white">Tipos de Publicaciones</h3>
                <p className="text-[11px] text-zinc-400">Distribución por formato en el período</p>
              </div>
              {postTypeData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 gap-3">
                  <ImageIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                  <p className="text-[12px] font-bold text-zinc-400">Sin publicaciones en este período</p>
                </div>
              ) : (
                <PostTypesChart data={postTypeData} />
              )}
            </div>

          </div>

          {/* Top Performing Posts section */}
          <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 md:p-6 shadow-sm space-y-4 print:break-inside-avoid">
            <div>
              <h3 className="text-[14px] font-black text-zinc-800 dark:text-white">Publicaciones Destacadas</h3>
              <p className="text-[11px] text-zinc-400">Las 3 publicaciones con mayor número de interacciones durante el período seleccionado</p>
            </div>

            {metrics.topPostsList.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-zinc-250 dark:border-zinc-800 rounded-2xl">
                <ImageIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                <p className="text-[12.5px] font-bold text-zinc-450">No hay publicaciones en este período</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {metrics.topPostsList.map((p, idx) => {
                  const postDate = p.timestamp 
                    ? new Date(p.timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                    : '';
                  
                  return (
                    <div 
                      key={p.id}
                      className="bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-150/60 dark:border-zinc-800/60 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-violet-500/30 transition-all group relative overflow-hidden"
                    >
                      {/* Rank badge */}
                      <div className="absolute top-3 left-3 bg-zinc-950/80 backdrop-blur-md text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md z-10">
                        #{idx + 1}
                      </div>

                      <div className="space-y-3">
                        {/* Media Box */}
                        <div className="aspect-video w-full rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-800 relative flex items-center justify-center">
                          {p.thumbnail ? (
                            <SmoothImage src={p.thumbnail} alt="" containerClassName="w-full h-full" className="object-cover group-hover:scale-[1.02] transition-transform duration-500" />
                          ) : (
                            <div className="text-[11px] text-zinc-450 font-bold flex flex-col items-center gap-1">
                              <FileText className="w-5 h-5 opacity-40" />
                              <span>Texto</span>
                            </div>
                          )}
                          <span className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                            {p.media_type}
                          </span>
                        </div>

                        {/* Caption Preview */}
                        <p className="text-[12px] text-zinc-650 dark:text-zinc-300 leading-snug line-clamp-3 font-medium">
                          {p.caption || <span className="italic text-zinc-400">Sin descripción.</span>}
                        </p>
                      </div>

                      {/* Performance details */}
                      <div className="pt-3 border-t border-zinc-150/60 dark:border-zinc-800 flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-3 text-[11.5px] font-extrabold text-zinc-500">
                          <span className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5 text-zinc-450" /> {fmtN(p.likes)}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5 text-zinc-450" /> {fmtN(p.comments)}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 font-bold">{postDate}</span>
                          {p.permalink && (
                            <a
                              href={p.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className={`p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:${currentTabBg}/15 hover:${currentTabColor} text-zinc-400 transition-colors cursor-pointer`}
                              title="Ver post original"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>

        </div>
      )}
      </div>
    </div>
    </CenteredPageLoader>

  );
}
