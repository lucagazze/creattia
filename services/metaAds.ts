
// Meta Marketing API — READ ONLY. Never call POST/PATCH/DELETE endpoints.
import { supabase } from './supabase';

// Loads token from Supabase into localStorage cache (called once on app start)
export const initMetaToken = async (): Promise<void> => {
  try {
    const { data } = await supabase.from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
    if (data?.value) localStorage.setItem('meta_ads_token', data.value);
  } catch { /* silently ignore */ }
};

const getToken = () => (import.meta as any).env.VITE_META_ADS_TOKEN || localStorage.getItem('meta_ads_token') || '';
export const META_AD_ACCOUNT = 'act_2136106490563351';
const BASE = 'https://graph.facebook.com/v21.0';

// All Instagram Business accounts accessible via the token
export const INSTAGRAM_ACCOUNTS: Record<string, { igId: string; username: string }> = {
  'algoritmia':    { igId: '17841454001497804', username: 'algoritmia.ads' },
  'atermicos':     { igId: '17841460101454399', username: 'atermicos.pinamar' },
  'mayoristleo':   { igId: '17841438390504961', username: 'libreriamayoristaleo' },
  'selecta':       { igId: '17841463377689897', username: 'selecta' },
  'rociofuentes':  { igId: '17841446979077762', username: 'lic.rociofuentes' },
  'jackblindadas': { igId: '17841421861661046', username: 'puertasblindasasjack' },
};

export const CLIENT_META_MAP: Record<string, { igId?: string; username?: string; adAccountId?: string }> = {
  'df57e4cd-6433-4c2f-a42f-4ad7e59d30dc': { adAccountId: META_AD_ACCOUNT },
  '02504445-7e44-4599-8b62-6c44a1af4b24': { igId: '17841460101454399', username: 'atermicos.pinamar' },
  'e0141716-178d-483b-8c2c-a58d391b83a1': { igId: '17841438390504961', username: 'libreriamayoristaleo' },
  'b6d2f956-18c2-42d4-af3d-5a55442c234a': { igId: '17841446979077762', username: 'lic.rociofuentes' },
  '9cc15a64-897f-412f-a048-86791ed04185': { igId: '17841421861661046', username: 'puertasblindasasjack' },
  '51a050d9-5f32-4f95-8724-8eefff9666d6': { igId: '17841463377689897', username: 'selecta' },
};

export type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_28d' | 'last_30d' | 'last_90d' | 'last_6months' | 'this_month' | 'last_month' | 'this_year' | 'last_year';
export type TimeRange = { since: string; until: string };

export const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};
export const today = (): string => new Date().toISOString().split('T')[0];

// Get the previous equivalent period for trend comparison
export const getPrevPeriod = (since: string, until: string): TimeRange => {
  const s = new Date((since || today()) + 'T12:00:00Z');
  const u = new Date((until || since || today()) + 'T12:00:00Z');
  if (isNaN(s.getTime()) || isNaN(u.getTime())) return { since: daysAgo(28), until: daysAgo(15) };
  const ms = u.getTime() - s.getTime();
  const prevUntil = new Date(s.getTime() - 86_400_000);
  const prevSince = new Date(prevUntil.getTime() - ms);
  return {
    since: prevSince.toISOString().split('T')[0],
    until: prevUntil.toISOString().split('T')[0],
  };
};

// Convert preset to actual date range
export const presetToRange = (preset: DatePreset): TimeRange => {
  const t = today();
  if (preset === 'today')       return { since: t, until: t };
  if (preset === 'yesterday')   { const y = daysAgo(1); return { since: y, until: y }; }
  if (preset === 'last_7d')     return { since: daysAgo(7), until: daysAgo(1) };
  if (preset === 'last_14d')    return { since: daysAgo(14), until: daysAgo(1) };
  if (preset === 'last_28d')    return { since: daysAgo(28), until: daysAgo(1) };
  if (preset === 'last_30d')    return { since: daysAgo(30), until: daysAgo(1) };
  if (preset === 'last_90d')    return { since: daysAgo(90), until: daysAgo(1) };
  if (preset === 'last_6months') return { since: daysAgo(180), until: daysAgo(1) };
  if (preset === 'this_year') {
    const now = new Date();
    return { since: `${now.getFullYear()}-01-01`, until: daysAgo(1) };
  }
  if (preset === 'last_year') {
    const prevYear = new Date().getFullYear() - 1;
    return { since: `${prevYear}-01-01`, until: `${prevYear}-12-31` };
  }
  if (preset === 'this_month') {
    const now = new Date();
    return { since: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, until: daysAgo(1) };
  }
  if (preset === 'last_month') {
    const now = new Date();
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const m = now.getMonth() === 0 ? 12 : now.getMonth();
    const lastDay = new Date(y, m, 0).getDate();
    return { since: `${y}-${String(m).padStart(2, '0')}-01`, until: `${y}-${String(m).padStart(2, '0')}-${lastDay}` };
  }
  return { since: daysAgo(30), until: t };
};

// Full insight fields for campaign/adset/account level
export const INSIGHT_FIELDS = [
  'spend', 'impressions', 'reach', 'frequency',
  'cpm', 'cpc',
  'inline_link_clicks', 'inline_link_click_ctr',
  'actions', 'cost_per_action_type', 'action_values',
  'purchase_roas',
  'video_thruplay_watched_actions',
].join(',');

export const DAILY_FIELDS = [
  'spend', 'reach', 'actions', 'action_values',
  'purchase_roas',
].join(',');

// Lighter fields for ad-level (creative) insights — sin campos que no existen a nivel de anuncio
export const AD_INSIGHT_FIELDS = [
  'spend', 'impressions', 'reach', 'frequency',
  'inline_link_click_ctr', 'inline_link_clicks',
  'cpc', 'cpm',
  'actions', 'cost_per_action_type', 'action_values',
  'purchase_roas',
].join(',');

const apiGet = async (endpoint: string, params: Record<string, string> = {}): Promise<any> => {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('access_token', getToken());
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || `Meta API error ${res.status}`);
  }
  return json;
};

export const metaAds = {
  // ── ALL AD ACCOUNTS (paginado) ─────────────────────────────
  getAllAdAccounts: async () => {
    const all: any[] = [];
    let url: string | null = null;
    // Primera página
    const first = await apiGet('me/adaccounts', {
      fields: 'id,name,currency,account_status,amount_spent',
      limit: '50',
    });
    if (first?.data) all.push(...first.data);
    url = first?.paging?.next || null;
    // Páginas siguientes
    while (url) {
      try {
        const res = await fetch(url).then(r => r.json());
        if (res?.data) all.push(...res.data);
        url = res?.paging?.next || null;
      } catch { break; }
    }
    return { data: all };
  },

  // ── AD ACCOUNT ────────────────────────────────────────────
  getAccount: (accountId = META_AD_ACCOUNT) =>
    apiGet(accountId, {
      fields: 'name,currency,timezone_name,account_status,amount_spent,balance',
    }),

  // ── CAMPAIGNS ─────────────────────────────────────────────
  getCampaigns: (accountId = META_AD_ACCOUNT) =>
    apiGet(`${accountId}/campaigns`, {
      fields: 'id,name,status,objective,buying_type,daily_budget,lifetime_budget,start_time,stop_time,bid_strategy',
      limit: '100',
    }),

  // ── CHECK if account has spend in the last 15 days ────────
  hasRecentSpend: async (accountId: string): Promise<boolean> => {
    const since = new Date();
    since.setDate(since.getDate() - 15);
    const sinceStr = since.toISOString().split('T')[0];
    const untilStr = new Date().toISOString().split('T')[0];
    const res = await apiGet(`${accountId}/insights`, {
      fields: 'spend',
      time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
      limit: '1',
    });
    return parseFloat(res?.data?.[0]?.spend || 0) > 0;
  },

  // ── ADSETS ────────────────────────────────────────────────
  getAdsets: (campaignId?: string, accountId = META_AD_ACCOUNT) =>
    apiGet(campaignId ? `${campaignId}/adsets` : `${accountId}/adsets`, {
      fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget,optimization_goal',
      limit: '50',
    }),

  // ── ADS with creative thumbnails ──────────────────────────
  getAds: (adsetId: string) =>
    apiGet(`${adsetId}/ads`, {
      fields: 'id,name,status,creative{id,name,thumbnail_url,image_url,object_type,video_id}',
      limit: '50',
    }),

  // ── ALL ADS FOR ACCOUNT ──────────────────────────────────
  getAccountAds: (accountId = META_AD_ACCOUNT) =>
    apiGet(`${accountId}/ads`, {
      fields: 'id,name,status,campaign_id,creative{id,name,thumbnail_url,image_url,object_type,video_id}',
      limit: '150',
    }),

  // ── AD-LEVEL INSIGHTS for a specific adset ────────────────
  getAdInsightsForAdset: async (adsetId: string, fields: string, timeRange: TimeRange): Promise<any[]> => {
    const res = await apiGet(`${adsetId}/insights`, {
      fields,
      level: 'ad',
      time_range: JSON.stringify(timeRange),
      limit: '50',
    });
    return res?.data || [];
  },

  // ── AD-LEVEL INSIGHTS FOR ACCOUNT ────────────────────────
  getAdInsightsForAccount: async (accountId: string, fields: string, timeRange: TimeRange): Promise<any[]> => {
    const res = await apiGet(`${accountId}/insights`, {
      fields,
      level: 'ad',
      time_range: JSON.stringify(timeRange),
      limit: '150',
    });
    return res?.data || [];
  },

  // ── INSIGHTS ──────────────────────────────────────────────
  getInsights: async (accountId: string, fields: string[] | string, preset?: DatePreset, range?: { since: string, until: string }, timeIncrement?: number, signal?: AbortSignal) => {
    const fieldsStr = Array.isArray(fields) ? fields.join(',') : fields;
    let url = `${BASE}/${accountId}/insights?fields=${fieldsStr}&access_token=${getToken()}&limit=500`;
    if (range) url += `&time_range={"since":"${range.since}","until":"${range.until || range.since}"}`;
    else if (preset) url += `&date_preset=${preset}`;
    if (timeIncrement) url += `&time_increment=${timeIncrement}`;

    const res = await fetch(url, { signal });
    const data = await res.json();
    
    if (data.error) throw data.error;
    
    const extractResults = (actions: any[]) => {
      if (!actions || !Array.isArray(actions)) return 0;
      const purchase = actions.find(a => 
        a.action_type === 'purchase' || 
        a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
        a.action_type === 'omni_purchase'
      );
      if (purchase) return parseFloat(purchase.value || 0);

      const lead = actions.find(a => 
        a.action_type === 'lead' || 
        a.action_type === 'offsite_conversion.fb_pixel_lead' ||
        a.action_type === 'onsite_conversion.lead_grouped'
      );
      if (lead) return parseFloat(lead.value || 0);

      return 0;
    };

    const extractValue = (values: any[]) => {
      if (!values) return 0;
      const v = values.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
      return v ? parseFloat(v.value) : 0;
    };

    if (timeIncrement === 1) {
      return data.data.map((d: any) => ({
        ...d,
        spend: parseFloat(d.spend || 0),
        reach: parseInt(d.reach || 0),
        results: extractResults(d.actions),
        purchase_value: extractValue(d.action_values),
        roas: parseFloat(d.purchase_roas?.[0]?.value || 0),
        date: d.date_start
      })).sort((a: any, b: any) => a.date.localeCompare(b.date));
    }
    
    const insights = data.data[0] || {};
    return {
      ...insights,
      spend: parseFloat(insights.spend || 0),
      reach: parseInt(insights.reach || 0),
      results: extractResults(insights.actions),
      purchase_value: extractValue(insights.action_values),
      roas: parseFloat(insights.purchase_roas?.[0]?.value || 0)
    };
  },

  getInsightsDaily: async (accountId: string, fields: string[] | string, preset?: DatePreset, range?: { since: string, until: string }, signal?: AbortSignal) => {
    return metaAds.getInsights(accountId, fields, preset, range, 1, signal);
  },

  // ── INSIGHTS AT ADSET LEVEL (for segment classification) ──
  getInsightsAtAdsetLevel: async (
    accountId: string,
    fields: string,
    timeRange?: TimeRange,
    datePreset?: DatePreset
  ) => {
    const params: Record<string, string> = { fields, level: 'adset', limit: '200' };
    if (timeRange) {
      params.time_range = JSON.stringify(timeRange);
    } else {
      params.date_preset = datePreset || 'last_28d';
    }
    const res = await apiGet(`${accountId}/insights`, params);
    return res.data || [];
  },

  // ── INSIGHTS AT CAMPAIGN LEVEL ──
  getInsightsAtCampaignLevel: async (
    accountId: string,
    fields: string,
    timeRange?: TimeRange,
    datePreset?: DatePreset
  ) => {
    const params: Record<string, string> = { fields, level: 'campaign', limit: '200' };
    if (timeRange) {
      params.time_range = JSON.stringify(timeRange);
    } else {
      params.date_preset = datePreset || 'last_28d';
    }
    const res = await apiGet(`${accountId}/insights`, params);
    return res.data || [];
  },

  // ── ALL ADSETS FOR ACCOUNT (for optimization_goal lookup) ─
  getAccountAdsets: (accountId: string) =>
    apiGet(`${accountId}/adsets`, {
      fields: 'id,name,campaign_id,optimization_goal,targeting',
      limit: '200',
    }),

  // ── INSIGHTS WITH DEMOGRAPHIC BREAKDOWN ──────────────────
  getInsightsBreakdown: async (
    accountId: string,
    breakdown: 'age' | 'gender' | 'region' | 'country' | 'publisher_platform' | 'platform_position' | 'publisher_platform,platform_position' | 'audience_segment',
    timeRange?: TimeRange,
    datePreset?: DatePreset
  ) => {
    const fields = 'spend,impressions,reach,cpm,cpc,inline_link_clicks,inline_link_click_ctr,actions,action_values';
    const params: Record<string, string> = { fields, breakdowns: breakdown, limit: '100' };
    if (timeRange) {
      params.time_range = JSON.stringify(timeRange);
    } else {
      params.date_preset = datePreset || 'last_28d';
    }
    const res = await apiGet(`${accountId}/insights`, params);
    return res.data || [];
  },

  // ── INSTAGRAM ─────────────────────────────────────────────
  getInstagramProfile: (igId: string) =>
    apiGet(igId, {
      fields: 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website',
    }),

  getInstagramMedia: (igId: string, limit = 12) =>
    apiGet(`${igId}/media`, {
      fields: 'id,caption,media_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url',
      limit: String(limit),
    }),

  // Recent account activity — changes made in the last N days (pauses, budget edits, new ads)
  getAccountActivities: (accountId: string, days = 7) => {
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    return apiGet(`${accountId}/activities`, {
      fields: 'event_type,event_time,object_name,object_type,translated_payload,extra_data',
      since:  String(since),
      limit:  '60',
    });
  },
};
