import React, { useEffect, useState, useMemo } from 'react';
import { 
  Instagram, Facebook, TrendingUp, Users, Image as ImageIcon, Video, Layers, MessageCircle, Heart, Calendar, 
  Loader2, RefreshCw, Play, Link2, Lock, AlertCircle, ArrowUpRight, BarChart2, DollarSign, Activity, Eye, X
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend 
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useViewAs } from '../contexts/ViewAsContext';
import { metaAds, CLIENT_META_MAP, type DatePreset, type TimeRange, presetToRange } from '../services/metaAds';
import EmailLoader from '../components/ui/EmailLoader';

// Formatting utilities
const fmtCurrency = (v: any) => {
  const n = parseFloat(v);
  return isNaN(n) ? '—' : `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtShortCurrency = (v: any) => {
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return '—';
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;
};

const fmtNumber = (v: any) => {
  const n = parseInt(v);
  if (isNaN(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('es-AR');
};

const fmtPercent = (v: any) => {
  const n = parseFloat(v);
  return isNaN(n) ? '—' : `${n.toFixed(2)}%`;
};

const getActionVal = (actions: any[], ...types: string[]): number => {
  if (!actions || !Array.isArray(actions)) return 0;
  for (const t of types) {
    const actObj = actions.find(a => a.action_type === t);
    if (actObj) return parseFloat(actObj.value || 0);
  }
  return 0;
};

// Colors for Recharts
const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#e1306c',
  facebook: '#1877f2',
  audience_network: '#42b72a',
  messenger: '#0084ff',
  otros: '#a78bfa'
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
  others: 'Otros'
};

export default function RedesSocialesPage() {
  const { isViewingAs, viewAsProfile } = useViewAs();
  const { profile: authProfile } = useAuth();
  const profile = isViewingAs ? viewAsProfile : authProfile;
  const clientId = profile?.id;

  const [datePreset, setDatePreset] = useState<DatePreset>('last_14d');
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Data States
  const [loading, setLoading] = useState(true);
  const [igProfile, setIgProfile] = useState<any>(null);
  const [igMedia, setIgMedia] = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // UI Tabs & Filters
  const [activeTab, setActiveTab] = useState<'resumen' | 'instagram' | 'meta_ads'>('resumen');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'>('all');
  const [expandedCaptions, setExpandedCaptions] = useState<Record<string, boolean>>({});

  // Comments modal/side-sheet state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostPermalink, setSelectedPostPermalink] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);

  const fetchComments = async (postId: string) => {
    setLoadingComments(true);
    setSubmitError(null);
    try {
      const res = await metaAds.getInstagramMediaComments(postId);
      setComments(res.data || []);
    } catch (err: any) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const openCommentsModal = (postId: string, permalink: string) => {
    setSelectedPostId(postId);
    setSelectedPostPermalink(permalink);
    setReplyingTo(null);
    setCommentInput('');
    setSubmitError(null);
    fetchComments(postId);
  };

  const closeCommentsModal = () => {
    setSelectedPostId(null);
    setSelectedPostPermalink(null);
    setComments([]);
    setReplyingTo(null);
    setCommentInput('');
    setSubmitError(null);
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim() || !selectedPostId) return;
    setSubmittingReply(true);
    setSubmitError(null);
    try {
      if (replyingTo) {
        await metaAds.replyToInstagramComment(replyingTo.id, commentInput.trim());
      } else {
        await metaAds.createInstagramMediaComment(selectedPostId, commentInput.trim());
      }
      setCommentInput('');
      setReplyingTo(null);
      await fetchComments(selectedPostId);
    } catch (err: any) {
      console.error('Failed to submit comment/reply:', err);
      setSubmitError('Tu token de Meta es de solo lectura o no tiene los permisos necesarios para comentar/responder directamente. Podés hacer click en el botón de abajo para responder en Instagram.');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Resolve IDs
  const igId = clientId ? CLIENT_META_MAP[clientId]?.igId : undefined;
  const igUsername = clientId ? CLIENT_META_MAP[clientId]?.username : undefined;
  const adAccountId = profile?.meta_account_id || (clientId ? CLIENT_META_MAP[clientId]?.adAccountId : undefined);

  const timeRange = useMemo(() => presetToRange(datePreset), [datePreset]);

  // Fetch all metrics
  useEffect(() => {
    if (!clientId) return;

    let active = true;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const promises: Promise<any>[] = [];
        
        // 1. Instagram profile and media (if igId is linked)
        if (igId) {
          promises.push(metaAds.getInstagramProfile(igId).catch(err => {
            console.error('Error fetching Instagram Profile:', err);
            return null;
          }));
          promises.push(metaAds.getInstagramMedia(igId, 24).catch(err => {
            console.error('Error fetching Instagram Media:', err);
            return [];
          }));
        } else {
          promises.push(Promise.resolve(null));
          promises.push(Promise.resolve([]));
        }

        // 2. Paid publisher platform breakdown (if adAccountId is linked)
        if (adAccountId) {
          const formattedId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
          promises.push(metaAds.getInsightsBreakdown(formattedId, 'publisher_platform', timeRange).catch(err => {
            console.error('Error fetching Paid publisher platform breakdown:', err);
            return [];
          }));
        } else {
          promises.push(Promise.resolve([]));
        }

        const [profileRes, mediaRes, breakdownRes] = await Promise.all(promises);

        if (!active) return;

        setIgProfile(profileRes);
        setIgMedia(mediaRes?.data || mediaRes || []);
        setBreakdown(breakdownRes || []);
      } catch (err: any) {
        console.error('Failed to load social media data:', err);
        setError(err.message || 'Error al obtener los datos de redes sociales.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => { active = false; };
  }, [clientId, igId, adAccountId, timeRange, refreshKey]);

  // Calculate parsed breakdown data for charts/tables
  const parsedBreakdown = useMemo(() => {
    return breakdown.map(item => {
      const spend = parseFloat(item.spend || 0);
      const impressions = parseInt(item.impressions || 0);
      const reach = parseInt(item.reach || 0);
      const clicks = parseInt(item.inline_link_clicks || 0);
      const ctr = parseFloat(item.inline_link_click_ctr || 0);
      const cpc = parseFloat(item.cpc || 0);
      const cpm = parseFloat(item.cpm || 0);
      
      const purchases = getActionVal(item.actions, 'purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase');
      const leads = getActionVal(item.actions, 'lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped');
      const revenue = getActionVal(item.action_values, 'purchase', 'offsite_conversion.fb_pixel_purchase');
      const roas = spend > 0 ? revenue / spend : 0;
      const platformKey = (item.publisher_platform || 'others').toLowerCase();

      return {
        platform: platformKey,
        label: PLATFORM_LABELS[platformKey] || platformKey.toUpperCase(),
        spend,
        impressions,
        reach,
        clicks,
        ctr,
        cpc,
        cpm,
        purchases,
        leads,
        revenue,
        roas,
        color: PLATFORM_COLORS[platformKey] || PLATFORM_COLORS.otros
      };
    }).filter(d => d.spend > 0 || d.impressions > 0);
  }, [breakdown]);

  // Total Paid metrics
  const paidTotals = useMemo(() => {
    return parsedBreakdown.reduce((acc, cur) => {
      acc.spend += cur.spend;
      acc.impressions += cur.impressions;
      acc.reach += cur.reach;
      acc.clicks += cur.clicks;
      acc.purchases += cur.purchases;
      acc.leads += cur.leads;
      acc.revenue += cur.revenue;
      return acc;
    }, { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, leads: 0, revenue: 0 });
  }, [parsedBreakdown]);

  // Calculated overall metrics
  const totalPaidROAS = paidTotals.spend > 0 ? paidTotals.revenue / paidTotals.spend : 0;
  const totalPaidCTR = paidTotals.impressions > 0 ? (paidTotals.clicks / paidTotals.impressions) * 100 : 0;
  const totalPaidCPC = paidTotals.clicks > 0 ? paidTotals.spend / paidTotals.clicks : 0;

  // Filtered Instagram media list
  const filteredMedia = useMemo(() => {
    if (mediaFilter === 'all') return igMedia;
    return igMedia.filter(post => post.media_type === mediaFilter);
  }, [igMedia, mediaFilter]);

  // Computed Instagram Organic Engagement Rate
  const igEngagementRate = useMemo(() => {
    if (!igProfile || !igProfile.followers_count || !igMedia.length) return 0;
    const totalInteractions = igMedia.reduce((sum, item) => sum + (item.like_count || 0) + (item.comments_count || 0), 0);
    const avgInteractionsPerPost = totalInteractions / igMedia.length;
    return (avgInteractionsPerPost / igProfile.followers_count) * 100;
  }, [igProfile, igMedia]);

  const toggleCaption = (id: string) => {
    setExpandedCaptions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6 md:space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div>
          <h1 className="text-[26px] md:text-[30px] font-black tracking-tight text-zinc-900 dark:text-white leading-none">
            Rendimiento Redes Sociales
          </h1>
          <p className="text-[12.5px] text-zinc-400 font-bold mt-1.5 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-violet-500" />
            Métricas de Meta Ads, Instagram Orgánico e Insights de Plataforma.
          </p>
        </div>

        {/* Date presets selector */}
        <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 p-1 rounded-full shadow-sm">
          {[
            { value: 'today', label: 'Hoy' },
            { value: 'yesterday', label: 'Ayer' },
            { value: 'last_7d', label: '7d' },
            { value: 'last_14d', label: '14d' },
            { value: 'last_28d', label: '28d' },
            { value: 'this_month', label: 'Este mes' },
            { value: 'last_month', label: 'Mes ant.' }
          ].map(p => (
            <button
              key={p.value}
              onClick={() => setDatePreset(p.value as DatePreset)}
              className={`px-3 py-1 rounded-full text-[11.5px] font-black tracking-tight transition-all ${
                datePreset === p.value 
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-50 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Recargar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        {[
          { id: 'resumen', label: 'Resumen General', icon: BarChart2 },
          { id: 'instagram', label: 'Instagram Orgánico', icon: Instagram, disabled: !igId },
          { id: 'meta_ads', label: 'Meta Ads (Paid)', icon: Facebook, disabled: !adAccountId }
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id as any)}
              disabled={tab.disabled}
              className={`flex items-center gap-2 px-5 py-3 text-[13px] font-bold border-b-2 transition-all -mb-px ${
                tab.disabled 
                  ? 'opacity-40 cursor-not-allowed text-zinc-400 dark:text-zinc-600 border-transparent'
                  : active 
                  ? 'border-violet-600 dark:border-violet-500 text-violet-600 dark:text-violet-400' 
                  : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-250 hover:border-zinc-300 dark:hover:border-zinc-750'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Loader */}
      {loading ? (
        <div className="space-y-6">
          <EmailLoader loading={loading} color="#8b5cf6" labels={['Gasto Meta Ads', 'Seguidores IG', 'Interacciones IG', 'Alcance Ads']} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-[320px] bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl animate-pulse" />
            <div className="h-[320px] bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl animate-pulse" />
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-5 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-800 dark:text-red-400 text-[14.5px]">Error al obtener métricas</h3>
            <p className="text-[13px] text-red-600 dark:text-red-500 mt-1">{error}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6 md:space-y-8">

          {/* TAB 1: RESUMEN GENERAL */}
          {activeTab === 'resumen' && (
            <>
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Stat 1: Gasto Meta */}
                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 shadow-sm hover:scale-[1.01] hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between mb-3.5">
                    <span className="text-[10px] md:text-[11px] font-black text-zinc-400 dark:text-zinc-500 tracking-wider uppercase">Gasto Meta Ads</span>
                    <div className="w-7 h-7 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                      <DollarSign className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                  <p className="text-[20px] md:text-[24px] font-black tracking-tight text-zinc-800 dark:text-white leading-none">
                    {adAccountId ? fmtCurrency(paidTotals.spend) : '—'}
                  </p>
                  <p className="text-[11.5px] text-zinc-400 font-bold mt-2 truncate">
                    {adAccountId ? `En el período seleccionado` : 'Sin cuenta Meta Ads configurada'}
                  </p>
                </div>

                {/* Stat 2: Seguidores IG */}
                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 shadow-sm hover:scale-[1.01] hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between mb-3.5">
                    <span className="text-[10px] md:text-[11px] font-black text-zinc-400 dark:text-zinc-500 tracking-wider uppercase">Seguidores IG</span>
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-pink-500/10 to-purple-500/10 flex items-center justify-center">
                      <Instagram className="w-3.5 h-3.5 text-pink-500 dark:text-pink-400" />
                    </div>
                  </div>
                  <p className="text-[20px] md:text-[24px] font-black tracking-tight text-zinc-800 dark:text-white leading-none">
                    {igProfile ? fmtNumber(igProfile.followers_count) : '—'}
                  </p>
                  <p className="text-[11.5px] text-zinc-400 font-bold mt-2 truncate">
                    {igProfile ? `@${igProfile.username}` : 'Instagram no configurado'}
                  </p>
                </div>

                {/* Stat 3: Engagement Orgánico */}
                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 shadow-sm hover:scale-[1.01] hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between mb-3.5">
                    <span className="text-[10px] md:text-[11px] font-black text-zinc-400 dark:text-zinc-500 tracking-wider uppercase">Engagement IG</span>
                    <div className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                      <TrendingUp className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                    </div>
                  </div>
                  <p className="text-[20px] md:text-[24px] font-black tracking-tight text-zinc-800 dark:text-white leading-none">
                    {igProfile ? fmtPercent(igEngagementRate) : '—'}
                  </p>
                  <p className="text-[11.5px] text-zinc-400 font-bold mt-2 truncate">
                    {igProfile ? `Promedio de últimos posts` : 'Requiere acceso a Instagram'}
                  </p>
                </div>

                {/* Stat 4: Conversiones Paid */}
                <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 shadow-sm hover:scale-[1.01] hover:shadow-md transition-all duration-300">
                  <div className="flex items-center justify-between mb-3.5">
                    <span className="text-[10px] md:text-[11px] font-black text-zinc-400 dark:text-zinc-500 tracking-wider uppercase">Conversiones Paid</span>
                    <div className="w-7 h-7 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                      <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                  <p className="text-[20px] md:text-[24px] font-black tracking-tight text-zinc-800 dark:text-white leading-none">
                    {adAccountId ? (
                      paidTotals.purchases > 0 ? `${fmtNumber(paidTotals.purchases)} Compras` 
                      : paidTotals.leads > 0 ? `${fmtNumber(paidTotals.leads)} Leads` 
                      : '0'
                    ) : '—'}
                  </p>
                  <p className="text-[11.5px] text-zinc-400 font-bold mt-2 truncate">
                    {adAccountId ? `ROAS prom: ${totalPaidROAS.toFixed(2)}x` : 'Sin cuenta Meta configurada'}
                  </p>
                </div>

              </div>

              {/* General Highlights Section */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Facebook vs Instagram Paid comparison */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-6 shadow-sm xl:col-span-2">
                  <h3 className="text-[15px] font-black text-zinc-800 dark:text-white tracking-tight mb-4 flex items-center gap-1.5">
                    <BarChart2 className="w-4 h-4 text-violet-500" />
                    Distribución de Gasto y Conversión por Plataforma
                  </h3>

                  {parsedBreakdown.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[260px] text-center p-5">
                      <Lock className="w-8 h-8 text-zinc-350 dark:text-zinc-650 mb-3" />
                      <p className="text-[13px] font-semibold text-zinc-500">No hay datos de distribución pagada en este período.</p>
                      <p className="text-[11.5px] text-zinc-400 mt-1">Asegurate de tener campañas activas de Meta Ads.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                      <div className="h-[240px] w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={parsedBreakdown}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={4}
                              dataKey="spend"
                            >
                              {parsedBreakdown.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: any) => fmtCurrency(value)}
                              contentStyle={{ background: '#18181b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                            />
                            <Legend 
                              verticalAlign="bottom" 
                              height={36} 
                              iconType="circle"
                              formatter={(value: any, entry: any) => (
                                <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400">{entry.payload.label}</span>
                              )}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="space-y-4">
                        <p className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Resumen de Inversión</p>
                        {parsedBreakdown.map(item => {
                          const percentage = ((item.spend / paidTotals.spend) * 100) || 0;
                          return (
                            <div key={item.platform} className="space-y-1.5">
                              <div className="flex items-center justify-between text-[12px] font-bold">
                                <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                  {item.label}
                                </span>
                                <span className="text-zinc-900 dark:text-white">
                                  {fmtCurrency(item.spend)} ({percentage.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${percentage}%`, backgroundColor: item.color }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Instagram Profile Card (Quick View) */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-[15px] font-black text-zinc-800 dark:text-white tracking-tight mb-4 flex items-center gap-1.5">
                      <Instagram className="w-4 h-4 text-pink-500" />
                      Instagram Orgánico
                    </h3>
                    
                    {igProfile ? (
                      <div className="space-y-5">
                        <div className="flex items-center gap-3.5">
                          {igProfile.profile_picture_url ? (
                            <img 
                              src={igProfile.profile_picture_url} 
                              alt={igUsername} 
                              className="w-14 h-14 rounded-full object-cover ring-2 ring-pink-500/20 dark:ring-pink-500/40 p-0.5" 
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white">
                              <Instagram className="w-6 h-6" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900 dark:text-white text-[15px] leading-tight truncate">@{igProfile.username}</p>
                            <p className="text-[11.5px] text-zinc-400 font-medium truncate mt-0.5">{igProfile.name}</p>
                            {igProfile.website && (
                              <a href={igProfile.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-violet-500 font-bold hover:underline mt-1">
                                <Link2 className="w-3 h-3" /> Sitio Web
                              </a>
                            )}
                          </div>
                        </div>

                        {igProfile.biography && (
                          <p className="text-[12.5px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-2xl leading-relaxed italic border border-zinc-100 dark:border-zinc-800">
                            "{igProfile.biography}"
                          </p>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/30 p-2.5 rounded-2xl text-center">
                            <p className="text-[16px] font-black text-zinc-900 dark:text-white leading-none">{fmtNumber(igProfile.followers_count)}</p>
                            <p className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-tight">Seguidores</p>
                          </div>
                          <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/30 p-2.5 rounded-2xl text-center">
                            <p className="text-[16px] font-black text-zinc-900 dark:text-white leading-none">{fmtNumber(igProfile.media_count)}</p>
                            <p className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-tight">Publicaciones</p>
                          </div>
                          <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/30 p-2.5 rounded-2xl text-center">
                            <p className="text-[16px] font-black text-zinc-900 dark:text-white leading-none">{fmtNumber(igProfile.follows_count)}</p>
                            <p className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-tight">Siguiendo</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[200px] text-center p-5 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                        <Lock className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2.5" />
                        <p className="text-[12.5px] font-bold text-zinc-500">Instagram no vinculado</p>
                        <p className="text-[11.5px] text-zinc-400 mt-1 leading-relaxed">No podemos cargar publicaciones orgánicas en este momento.</p>
                      </div>
                    )}
                  </div>
                  
                  {igProfile && (
                    <button 
                      onClick={() => setActiveTab('instagram')}
                      className="w-full mt-4 h-9 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200/50 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-[12px] font-black rounded-xl transition-all flex items-center justify-center gap-1.5"
                    >
                      <Instagram className="w-3.5 h-3.5 text-pink-500" />
                      Ver Feed Completo Orgánico
                      <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  )}
                </div>

              </div>
            </>
          )}

          {/* TAB 2: INSTAGRAM ORGÁNICO */}
          {activeTab === 'instagram' && (
            <div className="space-y-6">
              
              {/* Profile Bar */}
              {igProfile && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
                  <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                    {igProfile.profile_picture_url ? (
                      <img 
                        src={igProfile.profile_picture_url} 
                        alt={igUsername} 
                        className="w-16 h-16 rounded-full object-cover ring-2 ring-pink-500/30" 
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 flex items-center justify-center text-white">
                        <Instagram className="w-7 h-7" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 justify-center md:justify-start">
                        <h2 className="text-[18px] font-black text-zinc-900 dark:text-white">@{igProfile.username}</h2>
                        <span className="bg-pink-50 text-pink-600 dark:bg-pink-950/20 dark:text-pink-400 px-2 py-0.5 rounded-full text-[10px] font-bold">Orgánico</span>
                      </div>
                      <p className="text-[12.5px] text-zinc-400 font-bold mt-0.5">{igProfile.name}</p>
                    </div>
                  </div>

                  <div className="flex gap-4 flex-wrap justify-center">
                    <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center min-w-[90px]">
                      <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(igProfile.followers_count)}</p>
                      <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Seguidores</p>
                    </div>
                    <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center min-w-[90px]">
                      <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtNumber(igProfile.media_count)}</p>
                      <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Publicaciones</p>
                    </div>
                    <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl text-center min-w-[90px]">
                      <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtPercent(igEngagementRate)}</p>
                      <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Engagement</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Feed Filters */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700 p-0.5 rounded-xl">
                  {[
                    { id: 'all', label: 'Todo', icon: BarChart2 },
                    { id: 'IMAGE', label: 'Imágenes', icon: ImageIcon },
                    { id: 'VIDEO', label: 'Videos/Reels', icon: Video },
                    { id: 'CAROUSEL_ALBUM', label: 'Caruseles', icon: Layers }
                  ].map(f => {
                    const Icon = f.icon;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setMediaFilter(f.id as any)}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                          mediaFilter === f.id
                            ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-white shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {f.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[12.5px] text-zinc-400 font-bold">{filteredMedia.length} posts encontrados</p>
              </div>

              {/* Grid of posts */}
              {filteredMedia.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-12 text-center">
                  <ImageIcon className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                  <p className="text-[13.5px] font-bold text-zinc-500">No se encontraron publicaciones</p>
                  <p className="text-[12px] text-zinc-400 mt-1">Intentá cambiando el filtro o cargando más adelante.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredMedia.map((m: any) => {
                    const hasLongCaption = m.caption && m.caption.length > 80;
                    const isExpanded = !!expandedCaptions[m.id];
                    const dateStr = m.timestamp 
                      ? new Date(m.timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '';

                    return (
                      <div 
                        key={m.id} 
                        className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-300 flex flex-col justify-between"
                      >
                        {/* Thumbnail Container */}
                        <div 
                          onClick={() => openCommentsModal(m.id, m.permalink)}
                          className="aspect-square w-full bg-zinc-50 dark:bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-zinc-100 dark:border-zinc-800/60 cursor-pointer"
                          title="Ver comentarios"
                        >
                          {m.media_url || m.thumbnail_url ? (
                            <img 
                              src={m.media_url || m.thumbnail_url} 
                              alt="" 
                              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" 
                              loading="lazy"
                            />
                          ) : (
                            <ImageIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-700 animate-pulse" />
                          )}
                          
                          {/* Media Type Indicator Icon */}
                          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white p-1.5 rounded-lg text-xs flex items-center justify-center">
                            {m.media_type === 'VIDEO' && <Video className="w-3.5 h-3.5" />}
                            {m.media_type === 'CAROUSEL_ALBUM' && <Layers className="w-3.5 h-3.5" />}
                            {m.media_type === 'IMAGE' && <ImageIcon className="w-3.5 h-3.5" />}
                          </div>

                          {/* Hover statistics overlay */}
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-6 text-white font-bold select-none">
                            <div className="flex items-center gap-1.5 text-[14px]">
                              <Heart className="w-5 h-5 fill-white text-white" />
                              <span>{fmtNumber(m.like_count || 0)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[14px]">
                              <MessageCircle className="w-5 h-5 fill-white text-white" />
                              <span>{fmtNumber(m.comments_count || 0)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Description & metadata */}
                        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
                              <span>{dateStr}</span>
                              <span className="uppercase text-[9px] tracking-widest text-zinc-350 dark:text-zinc-550">{m.media_type}</span>
                            </div>

                            {m.caption && (
                              <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-snug break-words">
                                {isExpanded ? m.caption : `${m.caption.slice(0, 80)}${hasLongCaption ? '...' : ''}`}
                                {hasLongCaption && (
                                  <button 
                                    onClick={() => toggleCaption(m.id)}
                                    className="text-violet-500 font-bold hover:underline ml-1 cursor-pointer focus:outline-none"
                                  >
                                    {isExpanded ? 'Ver menos' : 'Ver más'}
                                  </button>
                                )}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800/60 mt-auto">
                            <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400 text-[12px] font-bold">
                              <span className="flex items-center gap-1 cursor-default"><Heart className="w-3.5 h-3.5 text-zinc-450" /> {m.like_count || 0}</span>
                              <button 
                                onClick={() => openCommentsModal(m.id, m.permalink)}
                                className="flex items-center gap-1 hover:text-pink-500 transition-colors cursor-pointer"
                                title="Ver y responder comentarios"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-zinc-450" /> {m.comments_count || 0}
                              </button>
                            </div>
                            
                            {m.permalink && (
                              <a 
                                href={m.permalink} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-[11px] font-black text-violet-600 dark:text-violet-400 hover:text-violet-850 dark:hover:text-violet-300 flex items-center gap-1 hover:underline"
                              >
                                Abrir post
                                <ArrowUpRight className="w-3 h-3" />
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
          )}

          {/* TAB 3: META ADS (PAID PERFORMANCE) */}
          {activeTab === 'meta_ads' && (
            <div className="space-y-6">
              
              {/* Paid KPI bar */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
                    <Facebook className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-black text-zinc-900 dark:text-white tracking-tight">Rendimiento Paid (Meta Ads)</h2>
                    <p className="text-[12px] text-zinc-400 font-bold mt-0.5">Analizando campañas activas distribuidas en Meta Ads Manager.</p>
                  </div>
                </div>

                <div className="flex gap-4 flex-wrap justify-center text-center">
                  <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl min-w-[100px]">
                    <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtCurrency(paidTotals.spend)}</p>
                    <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Inversión Total</p>
                  </div>
                  <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl min-w-[100px]">
                    <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{totalPaidCTR.toFixed(2)}%</p>
                    <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">CTR Promedio</p>
                  </div>
                  <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl min-w-[100px]">
                    <p className="text-[18px] font-black text-zinc-800 dark:text-white leading-none">{fmtShortCurrency(paidTotals.revenue)}</p>
                    <p className="text-[10px] text-zinc-400 font-bold mt-1.5 uppercase">Ingresos Ads</p>
                  </div>
                  <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl min-w-[100px]">
                    <p className="text-[18px] font-black text-emerald-600 dark:text-emerald-400 leading-none">{totalPaidROAS.toFixed(2)}x</p>
                    <p className="text-[10px] text-emerald-500 font-bold mt-1.5 uppercase">ROAS Combinado</p>
                  </div>
                </div>
              </div>

              {/* Breakdown charts */}
              {parsedBreakdown.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-12 text-center shadow-sm">
                  <AlertCircle className="w-10 h-10 text-zinc-350 dark:text-zinc-650 mx-auto mb-3" />
                  <p className="text-[14px] font-bold text-zinc-500">Sin datos de Meta Ads</p>
                  <p className="text-[12px] text-zinc-450 mt-1">No se detectó actividad de anuncios pagados en el período seleccionado.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Chart 1: Spend and Revenue split */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-6 shadow-sm">
                    <h3 className="text-[14px] font-black text-zinc-800 dark:text-white tracking-tight mb-4 uppercase tracking-wider">Inversión vs Ingresos por Plataforma</h3>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={parsedBreakdown} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" className="dark:stroke-zinc-850" />
                          <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} />
                          <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} tickFormatter={(v) => `$${v}`} />
                          <Tooltip 
                            formatter={(value: any) => fmtCurrency(value)}
                            contentStyle={{ background: '#18181b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11.5px', fontWeight: 'bold' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
                          <Bar name="Gasto ($)" dataKey="spend" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          <Bar name="Retorno ($)" dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Chart 2: Clicks and CTR split */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl p-6 shadow-sm">
                    <h3 className="text-[14px] font-black text-zinc-800 dark:text-white tracking-tight mb-4 uppercase tracking-wider">Clics y CTR por Plataforma</h3>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={parsedBreakdown} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" className="dark:stroke-zinc-850" />
                          <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} />
                          <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ background: '#18181b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '11.5px', fontWeight: 'bold' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '10px' }} />
                          <Bar name="Clics en el enlace" dataKey="clicks" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar name="CTR (%)" dataKey="ctr" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Comparison Grid Table */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden">
                    <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
                      <h3 className="text-[14px] font-black text-zinc-800 dark:text-white tracking-tight uppercase tracking-wider">Tabla Comparativa de Rendimiento</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-zinc-100 dark:divide-zinc-800 text-[12.5px]">
                        <thead className="bg-zinc-50 dark:bg-zinc-900/30 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">
                          <tr>
                            <th className="px-6 py-3.5 text-left">Plataforma</th>
                            <th className="px-6 py-3.5 text-right">Inversión</th>
                            <th className="px-6 py-3.5 text-right">Impresiones</th>
                            <th className="px-6 py-3.5 text-right">Alcance</th>
                            <th className="px-6 py-3.5 text-right">Clics</th>
                            <th className="px-6 py-3.5 text-right">CTR enlace</th>
                            <th className="px-6 py-3.5 text-right">CPC prom.</th>
                            <th className="px-6 py-3.5 text-right">Compras/Leads</th>
                            <th className="px-6 py-3.5 text-right">Retorno</th>
                            <th className="px-6 py-3.5 text-right">ROAS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                          {parsedBreakdown.map((row) => (
                            <tr key={row.platform} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/30 transition-colors">
                              <td className="px-6 py-4 font-bold text-zinc-800 dark:text-zinc-200">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                                  {row.label}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right text-zinc-900 dark:text-white font-semibold">{fmtCurrency(row.spend)}</td>
                              <td className="px-6 py-4 text-right text-zinc-500 dark:text-zinc-400">{fmtNumber(row.impressions)}</td>
                              <td className="px-6 py-4 text-right text-zinc-500 dark:text-zinc-400">{fmtNumber(row.reach)}</td>
                              <td className="px-6 py-4 text-right text-zinc-500 dark:text-zinc-400">{fmtNumber(row.clicks)}</td>
                              <td className="px-6 py-4 text-right text-zinc-900 dark:text-white font-bold">{fmtPercent(row.ctr)}</td>
                              <td className="px-6 py-4 text-right text-zinc-500 dark:text-zinc-400">{fmtCurrency(row.cpc)}</td>
                              <td className="px-6 py-4 text-right text-zinc-900 dark:text-white font-semibold">
                                {row.purchases > 0 ? `${fmtNumber(row.purchases)} comp.` 
                                 : row.leads > 0 ? `${fmtNumber(row.leads)} leads` 
                                 : '0'}
                              </td>
                              <td className="px-6 py-4 text-right text-zinc-900 dark:text-white font-semibold">{fmtCurrency(row.revenue)}</td>
                              <td className="px-6 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">{row.roas > 0 ? `${row.roas.toFixed(2)}x` : '—'}</td>
                            </tr>
                          ))}
                          
                          {/* Total Row */}
                          <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 font-black text-zinc-900 dark:text-white border-t-2 border-zinc-155 dark:border-zinc-800">
                            <td className="px-6 py-4">Total Paid</td>
                            <td className="px-6 py-4 text-right">{fmtCurrency(paidTotals.spend)}</td>
                            <td className="px-6 py-4 text-right">{fmtNumber(paidTotals.impressions)}</td>
                            <td className="px-6 py-4 text-right">{fmtNumber(paidTotals.reach)}</td>
                            <td className="px-6 py-4 text-right">{fmtNumber(paidTotals.clicks)}</td>
                            <td className="px-6 py-4 text-right">{fmtPercent(totalPaidCTR)}</td>
                            <td className="px-6 py-4 text-right">{fmtCurrency(totalPaidCPC)}</td>
                            <td className="px-6 py-4 text-right">
                              {paidTotals.purchases > 0 ? `${fmtNumber(paidTotals.purchases)} comp.`
                               : paidTotals.leads > 0 ? `${fmtNumber(paidTotals.leads)} leads`
                               : '—'}
                            </td>
                            <td className="px-6 py-4 text-right">{fmtCurrency(paidTotals.revenue)}</td>
                            <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400">{totalPaidROAS > 0 ? `${totalPaidROAS.toFixed(2)}x` : '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* Instagram Comments Slide-Over Panel */}
      {selectedPostId && (
        <div className="fixed inset-0 z-[350] flex justify-end animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            onClick={closeCommentsModal}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
          />
          
          {/* Slide-over panel container */}
          <div className="relative w-full max-w-md md:max-w-lg h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300 ease-out z-10">
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-black text-zinc-900 dark:text-white text-[15px] flex items-center gap-1.5 leading-none">
                  <Instagram className="w-4 h-4 text-pink-500" />
                  Comentarios del Post
                </h3>
                {selectedPostPermalink && (
                  <a 
                    href={selectedPostPermalink} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center gap-1 text-[11px] text-violet-500 font-bold hover:underline mt-1.5"
                  >
                    Ver post original en Instagram
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
              </div>
              <button 
                onClick={closeCommentsModal}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-zinc-50/20 dark:bg-zinc-950/20">
              {loadingComments ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                  <p className="text-[12px] text-zinc-450 font-bold">Cargando comentarios...</p>
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-5">
                  <MessageCircle className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mb-2.5" />
                  <p className="text-[13.5px] font-bold text-zinc-500">Sin comentarios</p>
                  <p className="text-[11.5px] text-zinc-455 mt-1">Nadie comentó en esta publicación aún.</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {comments.map((comment: any) => {
                    const dateStr = comment.timestamp
                      ? new Date(comment.timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : '';
                    return (
                      <div 
                        key={comment.id}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 p-4 rounded-2xl shadow-sm space-y-2.5 hover:border-zinc-350 dark:hover:border-zinc-700/60 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[13px] text-zinc-800 dark:text-zinc-200">@{comment.username}</span>
                          <span className="text-[10px] text-zinc-400">{dateStr}</span>
                        </div>
                        <p className="text-[12.5px] text-zinc-700 dark:text-zinc-300 leading-snug break-words">{comment.text}</p>
                        
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-50 dark:border-zinc-850/40">
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                            <Heart className="w-3 h-3" /> {comment.like_count || 0}
                          </span>
                          <button
                            onClick={() => setReplyingTo({ id: comment.id, username: comment.username })}
                            className="text-[11px] font-bold text-violet-500 hover:text-violet-700 dark:hover:text-violet-400 hover:underline cursor-pointer"
                          >
                            Responder
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Input Area */}
            <div className="p-4 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/40 space-y-3 flex-shrink-0">
              {/* Replying indicator */}
              {replyingTo && (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/30 text-[11.5px] text-violet-600 dark:text-violet-400 font-bold">
                  <span>Respondiendo a @{replyingTo.username}</span>
                  <button 
                    onClick={() => setReplyingTo(null)}
                    className="p-0.5 hover:bg-violet-150 dark:hover:bg-violet-900/30 rounded-lg text-violet-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Error messages / Fallback */}
              {submitError && (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed font-semibold">
                  <div className="flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5 animate-bounce" />
                    <span>{submitError}</span>
                  </div>
                  {selectedPostPermalink && (
                    <a
                      href={selectedPostPermalink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3.5 w-full h-9 bg-amber-600 hover:bg-amber-700 text-white text-[11.5px] font-black rounded-xl transition-all flex items-center justify-center gap-1 shadow-sm shadow-amber-600/10 hover:scale-[1.01]"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      Responder en Instagram
                    </a>
                  )}
                </div>
              )}

              {/* Input form */}
              <form onSubmit={handleSubmitComment} className="flex gap-2">
                <input 
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder={replyingTo ? `Escribí tu respuesta...` : `Escribí tu comentario...`}
                  disabled={submittingReply}
                  className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3.5 py-2 text-[13px] text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-violet-500 dark:focus:border-violet-500 transition-colors shadow-inner"
                />
                <button
                  type="submit"
                  disabled={submittingReply || !commentInput.trim()}
                  className="px-4.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[12.5px] font-black rounded-xl transition-all flex items-center justify-center gap-1 flex-shrink-0 cursor-pointer shadow-md shadow-violet-600/15"
                >
                  {submittingReply ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Enviar'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
