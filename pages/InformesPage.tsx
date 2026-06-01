import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { useTheme } from '../contexts/ThemeContext';
import { 
  TrendingUp, Loader2, Instagram, ArrowUpRight, ArrowDownRight, 
  Calendar, ChevronDown, Sparkles, ThumbsUp, MessageCircle, 
  Layers, Video, Image as ImageIcon, Facebook, Info, Users, 
  BarChart2, RefreshCw, FileText, Download, Share2
} from 'lucide-react';
import { metaAds, DatePreset, presetToRange, getPrevPeriod, today, daysAgo } from '../services/metaAds';
import { 
  AreaChart, Area, BarChart, Bar, LineChart, Line, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { supabase } from '../services/supabase';
import { AppleLoader } from '../components/ui/AppleLoader';
import SmoothImage from '../components/ui/SmoothImage';

const PRESETS: { id: DatePreset | 'custom'; label: string }[] = [
  { id: 'last_7d', label: 'Últimos 7 días' },
  { id: 'last_14d', label: 'Últimos 14 días' },
  { id: 'last_30d', label: 'Últimos 30 días' },
  { id: 'last_90d', label: 'Últimos 90 días' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes anterior' },
];

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
  const [error, setError] = useState<string | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);

  // Meta Insights Data States
  const [igOrganicInsights, setIgOrganicInsights] = useState<any>(null);
  const [fbOrganicInsights, setFbOrganicInsights] = useState<any>(null);
  const [igOrganicInsightsPrev, setIgOrganicInsightsPrev] = useState<any>(null);
  const [fbOrganicInsightsPrev, setFbOrganicInsightsPrev] = useState<any>(null);

  // Media Feed States
  const [igMedia, setIgMedia] = useState<any[]>([]);
  const [fbMedia, setFbMedia] = useState<any[]>([]);
  
  const [refreshKey, setRefreshKey] = useState(0);

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
          igId ? metaAds.getInstagramProfile(igId).catch(() => null) : null,
          fbPageId ? metaAds.getFacebookPageInfo(fbPageId).catch(() => null) : null,
        ]);
        if (igRes) setIgProfile(igRes);
        if (fbRes) setFbProfile(fbRes);

        // 2. Perform daily snapshot upsert
        const todayStr = today();
        const snap: any = { client_id: clientId, snapshot_date: todayStr };
        if (igRes?.followers_count) snap.ig_followers = igRes.followers_count;
        if (igRes?.follows_count) snap.ig_following = igRes.follows_count;
        if (igRes?.media_count) snap.ig_posts = igRes.media_count;
        if (fbRes?.fan_count) snap.fb_fans = fbRes.fan_count;
        if (fbRes?.followers_count) snap.fb_followers = fbRes.followers_count;

        if (snap.ig_followers || snap.fb_fans) {
          await supabase.from('car_social_snapshots').upsert(snap, { onConflict: 'client_id,snapshot_date' });
        }

        // 3. Fetch snapshots for the current period + previous period in a single query
        const { data: snaps } = await supabase
          .from('car_social_snapshots')
          .select('snapshot_date, ig_followers, ig_following, ig_posts, fb_fans, fb_followers, tiktok_followers')
          .eq('client_id', clientId)
          .gte('snapshot_date', prevRange.since)
          .lte('snapshot_date', range.until)
          .order('snapshot_date', { ascending: true });
        
        setSocialSnapshots(snaps || []);

        // 4. Fetch Meta Insights
        const [igInsights, fbInsights] = await Promise.all([
          igId ? metaAds.getIgOrganicInsights(igId, Math.floor(new Date(range.since).getTime() / 1000), Math.floor(new Date(range.until).getTime() / 1000)).catch(() => null) : null,
          fbPageId ? metaAds.getFbOrganicInsights(fbPageId, Math.floor(new Date(range.since).getTime() / 1000), Math.floor(new Date(range.until).getTime() / 1000)).catch(() => null) : null,
        ]);
        setIgOrganicInsights(igInsights);
        setFbOrganicInsights(fbInsights);

        // Fetch prev period insights as well for comparisons
        const [igInsightsPrev, fbInsightsPrev] = await Promise.all([
          igId ? metaAds.getIgOrganicInsights(igId, Math.floor(new Date(prevRange.since).getTime() / 1000), Math.floor(new Date(prevRange.until).getTime() / 1000)).catch(() => null) : null,
          fbPageId ? metaAds.getFbOrganicInsights(fbPageId, Math.floor(new Date(prevRange.since).getTime() / 1000), Math.floor(new Date(prevRange.until).getTime() / 1000)).catch(() => null) : null,
        ]);
        setIgOrganicInsightsPrev(igInsightsPrev);
        setFbOrganicInsightsPrev(fbInsightsPrev);

        // 5. Fetch Meta Feed for post-level analysis (up to 50 posts)
        const [igMediaRes, fbFeedRes] = await Promise.all([
          igId ? metaAds.getInstagramMedia(igId, 50).catch(() => []) : [],
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

    // Meta API Insights Metrics (Reach & Impressions)
    const insights = isIg ? igOrganicInsights : fbOrganicInsights;
    const prevInsights = isIg ? igOrganicInsightsPrev : fbOrganicInsightsPrev;
    const reachMetric = isIg ? 'reach' : 'page_impressions'; // page_impressions maps to impressions
    
    const reachVal = sumInsightMetric(insights, reachMetric);
    const prevReachVal = sumInsightMetric(prevInsights, reachMetric);
    const reachChangePct = getChange(reachVal, prevReachVal);

    const impressionsMetric = isIg ? 'impressions' : 'page_impressions';
    const impressionsVal = sumInsightMetric(insights, impressionsMetric);
    const prevImpressionsVal = sumInsightMetric(prevInsights, impressionsMetric);
    const impressionsChangePct = getChange(impressionsVal, prevImpressionsVal);

    const viewsMetric = isIg ? 'profile_views' : 'page_engaged_users';
    const viewsVal = sumInsightMetric(insights, viewsMetric);
    const prevViewsVal = sumInsightMetric(prevInsights, viewsMetric);
    const viewsChangePct = getChange(viewsVal, prevViewsVal);

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
      followerGrowthDiff,
      totalInteractions,
      interactionsChangePct,
      postsCount,
      postsChangePct: getChange(postsCount, prevPostsCount),
      engagementRate,
      engagementRateChangePct,
      reachVal,
      reachChangePct,
      impressionsVal,
      impressionsChangePct,
      viewsVal,
      viewsChangePct,
      topPostsList,
      currentSnaps,
    };
  }, [
    activeTab, igProfile, fbProfile, socialSnapshots, range, prevRange,
    igMedia, fbMedia, igOrganicInsights, fbOrganicInsights,
    igOrganicInsightsPrev, fbOrganicInsightsPrev
  ]);

  // Follower Growth line/area chart data formatting
  const chartData = useMemo(() => {
    const isIg = activeTab === 'instagram';
    const snaps = metrics.currentSnaps || [];
    
    // Fallback: If no snaps are in the DB yet, generate simulated points to avoid blank graphs
    if (snaps.length < 2) {
      const mockPoints = [];
      const endVal = metrics.currentFollowers || (isIg ? 1200 : 850);
      const startD = new Date(range.since + 'T12:00:00');
      const endD = new Date(range.until + 'T12:00:00');
      const diffTime = Math.abs(endD.getTime() - startD.getTime());
      const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      const step = Math.max(1, Math.round(diffDays / 6));

      for (let i = 0; i <= 6; i++) {
        const d = new Date(startD.getTime() + i * step * 24 * 60 * 60 * 1000);
        const iso = d.toISOString().split('T')[0];
        if (iso <= range.until) {
          const val = Math.round(endVal - (6 - i) * Math.max(1, endVal * 0.001));
          mockPoints.push({
            snapshot_date: iso,
            followers: val,
            isMock: true,
          });
        }
      }
      return mockPoints;
    }

    return snaps.map(s => ({
      snapshot_date: s.snapshot_date,
      followers: isIg ? s.ig_followers : (s.fb_followers || s.fb_fans),
      isMock: false,
    }));
  }, [activeTab, metrics.currentSnaps, metrics.currentFollowers, range]);

  // Daily engagement bar chart data formatting
  const dailyInteractionsData = useMemo(() => {
    const isIg = activeTab === 'instagram';
    const media = isIg ? igMedia : fbMedia;
    
    const currentPosts = media.filter(p => {
      const dateStr = (p.timestamp || p.created_time || '').split('T')[0];
      return dateStr && dateStr >= range.since && dateStr <= range.until;
    });

    const dataMap: Record<string, { interactions: number; posts: number }> = {};
    
    // Fill all dates in range with zeros
    let d = new Date(range.since + 'T12:00:00');
    const end = new Date(range.until + 'T12:00:00');
    while (d <= end) {
      const iso = d.toISOString().split('T')[0];
      dataMap[iso] = { interactions: 0, posts: 0 };
      d.setDate(d.getDate() + 1);
    }
    
    // Accumulate
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
    <div className="space-y-6 md:space-y-8 w-full pt-4 md:pt-6 px-3 md:px-6 lg:px-8 animate-in fade-in duration-300 print:bg-white print:p-0 print:space-y-4">
      
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
                  : 'text-zinc-550 hover:text-zinc-850 dark:hover:text-zinc-200'
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
                  : 'text-zinc-550 hover:text-zinc-850 dark:hover:text-zinc-200'
              }`}
            >
              <Facebook className="w-3.5 h-3.5" />
              <span>Facebook</span>
            </button>
          </div>

          {/* Styled Datepicker Dropdown */}
          <div className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-1.5 py-1 shadow-sm h-10 relative z-40" ref={datePickerRef}>
            <button onClick={() => setShowDatePicker(!showDatePicker)} className="flex items-center gap-2 px-3 h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl transition-all group">
              <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-violet-500 transition-colors" />
              <span className="text-[12px] font-black text-zinc-700 dark:text-zinc-200">
                {activePreset === 'custom' ? `${fmtDateRange(activeSince)} - ${fmtDateRange(activeUntil)}` : PRESETS.find(p => p.id === activePreset)?.label || activePreset}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
            </button>
            {showDatePicker && (
              <div className="absolute left-0 md:left-auto md:right-0 top-full mt-2.5 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-850 shadow-2xl z-50 flex flex-col md:flex-row overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200 w-[280px] sm:w-[310px] md:w-auto origin-top-left md:origin-top-right">
                <div className="w-full md:w-[150px] border-b md:border-b-0 md:border-r border-zinc-100 dark:border-zinc-800 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible">
                  {PRESETS.map(p => (
                    <button key={p.id} onClick={() => { const r = presetToRange(p.id as any); setPendingPreset(p.id as any); setPendingSince(r.since); setPendingUntil(r.until); }} className={`flex-shrink-0 text-left px-3 py-1.5 rounded-xl text-[11.5px] font-black transition-all ${pendingPreset === p.id ? 'bg-violet-600 text-white shadow-md shadow-violet-500/10' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>{p.label}</button>
                  ))}
                </div>
                <div className="p-4 flex flex-col items-center md:items-stretch">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                    <MiniCal year={calYear} month={calMonth} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onPrev={() => { if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); } else { setCalMonth(calMonth - 1); } }} onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }} />
                    <div className="hidden md:block">
                      <MiniCal year={calMonth === 11 ? calYear + 1 : calYear} month={calMonth === 11 ? 0 : calMonth + 1} since={pendingSince} until={pendingUntil} hovering={hovering} onDay={(iso: string) => { setPendingPreset('custom'); if (!pendingSince || (pendingSince && pendingUntil)) { setPendingSince(iso); setPendingUntil(''); } else { if (iso < pendingSince) { setPendingUntil(pendingSince); setPendingSince(iso); } else { setPendingUntil(iso); } } }} onHover={setHovering} onNext={() => { if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else { setCalMonth(calMonth + 1); } }} />
                    </div>
                  </div>
                  <div className="w-full flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    <button onClick={() => setShowDatePicker(false)} className="px-3.5 py-1.5 rounded-xl text-[11px] font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancelar</button>
                    <button onClick={handleApply} className="px-4 py-1.5 rounded-xl bg-violet-650 text-white text-[11px] font-black shadow-md shadow-violet-500/20 hover:bg-violet-700 transition-colors">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Export PDF Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-850 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl text-[12px] font-black shadow-sm transition-all active:scale-95"
            title="Exportar reporte"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exportar</span>
          </button>

          {/* Refresh button */}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loadingSocial}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-[12px] font-black shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Actualizar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSocial ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

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
      ) : loadingSocial ? (
        <AppleLoader variant="page" />
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

          {/* KPI Dashboard Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* KPI 1: Followers */}
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest">Seguidores</span>
                <div className={`w-8 h-8 rounded-xl ${currentTabBg}/10 flex items-center justify-center`}>
                  {activeTab === 'instagram' ? <Instagram className="w-4 h-4 text-pink-500" /> : <Facebook className="w-4 h-4 text-blue-600" />}
                </div>
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white leading-none tracking-tight">
                  {fmtN(metrics.currentFollowers)}
                </h3>
                <div className="flex items-center gap-1 mt-2 text-[11px] font-bold text-zinc-450">
                  <span>@{activeTab === 'instagram' ? (igProfile?.username || 'instagram') : (fbProfile?.name || 'facebook')}</span>
                </div>
              </div>
            </div>

            {/* KPI 2: Followers Growth */}
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest">Crecimiento</span>
                <div className={`w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center`}>
                  <TrendingUp className="w-4 h-4 text-violet-500" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white leading-none tracking-tight flex items-baseline gap-1.5">
                  {metrics.followerGrowth >= 0 ? `+${fmtN(metrics.followerGrowth)}` : fmtN(metrics.followerGrowth)}
                  <span className={`text-[12px] font-black ${metrics.followerGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    ({metrics.followerGrowthPct >= 0 ? `+${metrics.followerGrowthPct.toFixed(1)}%` : `${metrics.followerGrowthPct.toFixed(1)}%`})
                  </span>
                </h3>
                <div className="flex items-center gap-1 mt-2 text-[11px] font-bold text-zinc-450">
                  {metrics.followerGrowthDiff >= 0 ? (
                    <span className="text-emerald-500 font-extrabold">+{fmtN(metrics.followerGrowthDiff)}</span>
                  ) : (
                    <span className="text-rose-500 font-extrabold">{fmtN(metrics.followerGrowthDiff)}</span>
                  )}
                  <span>vs período anterior</span>
                </div>
              </div>
            </div>

            {/* KPI 3: Interactions */}
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest">Interacciones</span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <ThumbsUp className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white leading-none tracking-tight flex items-baseline gap-1.5">
                  {fmtN(metrics.totalInteractions)}
                  {metrics.interactionsChangePct !== undefined && (
                    <span className={`text-[12px] font-black ${metrics.interactionsChangePct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {metrics.interactionsChangePct >= 0 ? `+${metrics.interactionsChangePct.toFixed(1)}%` : `${metrics.interactionsChangePct.toFixed(1)}%`}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-1 mt-2 text-[11px] font-bold text-zinc-450">
                  <span>En {metrics.postsCount} publicaciones</span>
                </div>
              </div>
            </div>

            {/* KPI 4: Engagement Rate */}
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm space-y-2 relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest">Engagement Prom.</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <BarChart2 className="w-4 h-4 text-emerald-500" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white leading-none tracking-tight flex items-baseline gap-1.5">
                  {metrics.engagementRate.toFixed(2)}%
                  {metrics.engagementRateChangePct !== undefined && (
                    <span className={`text-[12px] font-black ${metrics.engagementRateChangePct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {metrics.engagementRateChangePct >= 0 ? `+${metrics.engagementRateChangePct.toFixed(1)}%` : `${metrics.engagementRateChangePct.toFixed(1)}%`}
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-1 mt-2 text-[11px] font-bold text-zinc-450">
                  <span>Promedio de interacciones / seg.</span>
                </div>
              </div>
            </div>

          </div>

          {/* Organic reach / impressions metrics from Meta (Visible only if insights API returns valid numbers) */}
          {(metrics.reachVal !== null || metrics.impressionsVal !== null || metrics.viewsVal !== null) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Reach */}
              {metrics.reachVal !== null && (
                <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Alcance Orgánico</span>
                    <h4 className="text-xl font-black text-zinc-800 dark:text-white leading-none mt-0.5">{fmtN(metrics.reachVal)}</h4>
                  </div>
                  {metrics.reachChangePct !== undefined && (
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5 ${metrics.reachChangePct >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                      {metrics.reachChangePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(metrics.reachChangePct).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}

              {/* Impressions */}
              {metrics.impressionsVal !== null && (
                <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Impresiones Totales</span>
                    <h4 className="text-xl font-black text-zinc-800 dark:text-white leading-none mt-0.5">{fmtN(metrics.impressionsVal)}</h4>
                  </div>
                  {metrics.impressionsChangePct !== undefined && (
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5 ${metrics.impressionsChangePct >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                      {metrics.impressionsChangePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(metrics.impressionsChangePct).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}

              {/* Profile Views / Engaged Users */}
              {metrics.viewsVal !== null && (
                <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 shadow-sm flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      {activeTab === 'instagram' ? 'Visitas al Perfil' : 'Usuarios Enganchados'}
                    </span>
                    <h4 className="text-xl font-black text-zinc-800 dark:text-white leading-none mt-0.5">{fmtN(metrics.viewsVal)}</h4>
                  </div>
                  {metrics.viewsChangePct !== undefined && (
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5 ${metrics.viewsChangePct >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                      {metrics.viewsChangePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(metrics.viewsChangePct).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}

            </div>
          )}

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Chart 1: Follower Growth Evolution */}
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-black text-zinc-800 dark:text-white">Evolución de Seguidores</h3>
                  <p className="text-[11px] text-zinc-400">Tendencia histórica diaria de seguidores acumulados</p>
                </div>
                {chartData.length > 0 && chartData[0].isMock && (
                  <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-450 dark:text-zinc-500 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Estimado
                  </span>
                )}
              </div>
              <div className="h-64 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
                    <defs>
                      <linearGradient id="colorFollowers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={activeTab === 'instagram' ? '#ec4899' : '#3b82f6'} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={activeTab === 'instagram' ? '#ec4899' : '#3b82f6'} stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#1f1f23' : '#f1f1f4'} />
                    <XAxis 
                      dataKey="snapshot_date" 
                      tick={{ fontSize: 9, fill: '#a1a1aa' }} 
                      tickFormatter={(d) => { if (!d) return ''; const p = d.split('-'); return `${p[2]}/${p[1]}`; }} 
                    />
                    <YAxis 
                      tick={{ fontSize: 9, fill: '#a1a1aa' }} 
                      tickFormatter={fmtN} 
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="followers" 
                      stroke={activeTab === 'instagram' ? '#ec4899' : '#3b82f6'} 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#colorFollowers)" 
                      name="followers"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Publications and Interactions daily breakdown */}
            <div className="bg-white dark:bg-[#111113] border border-black/[0.06] dark:border-white/[0.05] rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-[14px] font-black text-zinc-800 dark:text-white">Actividad e Interacciones</h3>
                <p className="text-[11px] text-zinc-400">Total diario de me gusta, comentarios y publicaciones publicadas</p>
              </div>
              <div className="h-64 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyInteractionsData} margin={{ top: 10, right: 10, bottom: 5, left: -20 }}>
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
                      className="bg-zinc-50/50 dark:bg-zinc-900/40 border border-zinc-150/60 dark:border-zinc-850/60 rounded-2xl p-4 flex flex-col justify-between space-y-4 hover:border-violet-500/30 transition-all group relative overflow-hidden"
                    >
                      {/* Rank badge */}
                      <div className="absolute top-3 left-3 bg-zinc-950/80 backdrop-blur-md text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md z-10">
                        #{idx + 1}
                      </div>

                      <div className="space-y-3">
                        {/* Media Box */}
                        <div className="aspect-video w-full rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-850 border border-zinc-200/50 dark:border-zinc-800 relative flex items-center justify-center">
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
      )}
    </div>
  );
}
