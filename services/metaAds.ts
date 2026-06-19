
// Meta Marketing API — READ ONLY. Never call POST/PATCH/DELETE endpoints.
import { supabase } from './supabase';

// Loads token from Supabase into localStorage cache (called once on app start)
export const initMetaToken = async (): Promise<void> => {
  try {
    const { data } = await supabase.from('AgencySettings').select('value').eq('key', 'meta_ads_token').maybeSingle();
    if (data?.value) localStorage.setItem('meta_ads_token', data.value);
    // Note: fb_pat_{pageId} keys are intentionally kept in localStorage — they are
    // client Page Access Tokens stored during the connection flow and needed for messaging.
  } catch { /* silently ignore */ }
};

const getToken = () =>
  localStorage.getItem('current_facebook_access_token') ||
  (import.meta as any).env.VITE_META_ADS_TOKEN ||
  localStorage.getItem('meta_ads_token') ||
  '';

// ─── sessionStorage result cache — survives page refreshes, cleared on tab close ───
const META_PREFIX = 'meta:';
const META_TTL_MS = 5 * 60 * 1000; // 5 minutes

function metaGetCached(key: string): any | null {
  try {
    const raw = sessionStorage.getItem(META_PREFIX + key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw) as { data: any; timestamp: number };
    if (Date.now() - timestamp > META_TTL_MS) {
      sessionStorage.removeItem(META_PREFIX + key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function metaSetCache(key: string, data: any) {
  try {
    sessionStorage.setItem(META_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* silently skip if storage full */ }
}

let activeClientCache: { userId: string; viewAsClientId: string; clientId: string; expiresAt: number } | null = null;

async function getActiveClientId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return '';
  const viewAsClientId = (() => {
    try {
      return localStorage.getItem('view_as_client_id') || '';
    } catch {
      return '';
    }
  })();
  if (activeClientCache && activeClientCache.userId === userId && activeClientCache.viewAsClientId === viewAsClientId && activeClientCache.expiresAt > Date.now()) {
    return activeClientCache.clientId;
  }

  if (viewAsClientId) {
    activeClientCache = { userId, viewAsClientId, clientId: viewAsClientId, expiresAt: Date.now() + 30 * 1000 };
    return viewAsClientId;
  }

  const { data: direct } = await supabase
    .from('car_clients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  let clientId = direct?.id || '';

  if (!clientId) {
    const { data: link } = await supabase
      .from('car_business_accounts')
      .select('business_id')
      .eq('user_id', userId)
      .maybeSingle();
    clientId = link?.business_id || '';
  }

  activeClientCache = { userId, viewAsClientId, clientId, expiresAt: Date.now() + 5 * 60 * 1000 };
  return clientId;
}

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

// Instagram and Meta Ad Account IDs are now stored in the car_clients table
// (columns: ig_business_id, ig_username, meta_account_id)
// The old CLIENT_META_MAP has been migrated to the database.

export type DatePreset = 'today' | 'yesterday' | 'last_7d' | 'last_14d' | 'last_28d' | 'last_30d' | 'last_90d' | 'last_6months' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'max';
export type TimeRange = { since: string; until: string };

export const getArgentinaDateStr = (date: Date): string => {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

export const getArgentinaDateParts = (date: Date = new Date()): { year: number; month: number; day: number } => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')!.value, 10);
  const month = parseInt(parts.find(p => p.type === 'month')!.value, 10);
  const day = parseInt(parts.find(p => p.type === 'day')!.value, 10);
  return { year, month, day };
};

export const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getArgentinaDateStr(d);
};
export const today = (): string => getArgentinaDateStr(new Date());

// Get the previous equivalent period for trend comparison
export const getPrevPeriod = (since: string, until: string): TimeRange => {
  const s = new Date((since || today()) + 'T12:00:00Z');
  const u = new Date((until || since || today()) + 'T12:00:00Z');
  if (isNaN(s.getTime()) || isNaN(u.getTime())) return { since: daysAgo(28), until: daysAgo(15) };
  const ms = u.getTime() - s.getTime();
  const prevUntil = new Date(s.getTime() - 86_400_000);
  const prevSince = new Date(prevUntil.getTime() - ms);
  return {
    since: getArgentinaDateStr(prevSince),
    until: getArgentinaDateStr(prevUntil),
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
    const { year } = getArgentinaDateParts();
    return { since: `${year}-01-01`, until: daysAgo(1) };
  }
  if (preset === 'last_year') {
    const { year } = getArgentinaDateParts();
    const prevYear = year - 1;
    return { since: `${prevYear}-01-01`, until: `${prevYear}-12-31` };
  }
  if (preset === 'this_month') {
    const { year, month } = getArgentinaDateParts();
    return { since: `${year}-${String(month).padStart(2, '0')}-01`, until: daysAgo(1) };
  }
  if (preset === 'last_month') {
    const { year, month } = getArgentinaDateParts();
    const y = month === 1 ? year - 1 : year;
    const m = month === 1 ? 12 : month - 1;
    const lastDay = new Date(y, m, 0).getDate();
    return { since: `${y}-${String(m).padStart(2, '0')}-01`, until: `${y}-${String(m).padStart(2, '0')}-${lastDay}` };
  }
  if (preset === 'max') {
    return { since: '2020-01-01', until: t };
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

const pageTokensCache: Record<string, string> = {};

const getPageAccessToken = async (pageId: string): Promise<string> => {
  try {
    // 1. In-memory or localStorage cache (fastest)
    if (pageTokensCache[pageId]) return pageTokensCache[pageId];
    const localSaved = localStorage.getItem(`fb_pat_${pageId}`);
    if (localSaved) {
      pageTokensCache[pageId] = localSaved;
      return localSaved;
    }

    // 2. Fallback: try /me/accounts with the active user token
    const userToken = getToken();
    if (!userToken) return '';

    const cacheKey = `${pageId}_${userToken.slice(-10)}`;
    if (pageTokensCache[cacheKey]) return pageTokensCache[cacheKey];

    const url = new URL(`${BASE}/me/accounts`);
    url.searchParams.set('access_token', userToken);
    url.searchParams.set('limit', '100');
    const res = await fetch(url.toString()).then(r => r.json());

    const page = (res?.data || []).find((p: any) => p.id === pageId);
    if (page?.access_token) {
      pageTokensCache[cacheKey] = page.access_token;
      return page.access_token;
    }

    // 3. Fallback: derive the token directly from the Page node. /me/accounts only works for
    // personal user-login tokens — a System User token (Business Settings) doesn't have
    // "accounts" in that sense, but if the Page is assigned to it as an asset, asking the Page
    // node itself for `access_token` returns a usable Page token.
    const directUrl = new URL(`${BASE}/${pageId}`);
    directUrl.searchParams.set('fields', 'access_token');
    directUrl.searchParams.set('access_token', userToken);
    const directRes = await fetch(directUrl.toString()).then(r => r.json());
    if (directRes?.access_token) {
      pageTokensCache[cacheKey] = directRes.access_token;
      return directRes.access_token;
    }
  } catch (e) {
    console.error('Error getting page access token:', e);
  }
  return getToken();
};


const apiGet = async (endpoint: string, params: Record<string, string> = {}): Promise<any> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    const url = new URL('/api/meta-video', window.location.origin);
    url.searchParams.set('action', 'graph');
    url.searchParams.set('path', endpoint);
    const clientId = await getActiveClientId();
    if (clientId) url.searchParams.set('clientId', clientId);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json();
    if (json?.error) {
      throw new Error(json.error || `Meta API error ${res.status}`);
    }
    return json;
  }

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

const apiGetPage = async (pageId: string, endpoint: string, params: Record<string, string> = {}): Promise<any> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return apiGet(endpoint, params);

  const token = await getPageAccessToken(pageId);
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || `Meta API error ${res.status}`);
  }
  return json;
};

const apiPostPage = async (pageId: string, endpoint: string, params: Record<string, string> = {}, body?: any): Promise<any> => {
  const token = await getPageAccessToken(pageId);
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const fetchOptions: RequestInit = {
    method: 'POST',
  };
  if (body) {
    fetchOptions.headers = { 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), fetchOptions);
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || `Meta API error`);
  }
  return json;
};

const apiDeletePage = async (pageId: string, endpoint: string, params: Record<string, string> = {}): Promise<any> => {
  const token = await getPageAccessToken(pageId);
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method: 'DELETE',
  });
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || `Meta API error`);
  }
  return json;
};

const getActivePageId = (): string => {
  const active = localStorage.getItem('active_fb_page_id') || '';
  if (active) return active;
  // Fallback: search localStorage for fb_pat_{pageId}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('fb_pat_')) {
        const pageId = key.replace('fb_pat_', '');
        if (pageId) {
          try {
            localStorage.setItem('active_fb_page_id', pageId);
          } catch {}
          return pageId;
        }
      }
    }
  } catch {}
  return '';
};

const apiGetPageActive = async (endpoint: string, params: Record<string, string> = {}): Promise<any> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return apiGet(endpoint, params);

  const activePageId = getActivePageId();
  const token = activePageId ? await getPageAccessToken(activePageId) : getToken();
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || `Meta API error ${res.status}`);
  }
  return json;
};

const apiPostPageActive = async (endpoint: string, params: Record<string, string> = {}, body?: any): Promise<any> => {
  const activePageId = getActivePageId();
  const token = activePageId ? await getPageAccessToken(activePageId) : getToken();
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const fetchOptions: RequestInit = {
    method: 'POST',
  };
  if (body) {
    fetchOptions.headers = { 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), fetchOptions);
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || `Meta API error`);
  }
  return json;
};

const apiDeletePageActive = async (endpoint: string, params: Record<string, string> = {}): Promise<any> => {
  const activePageId = getActivePageId();
  const token = activePageId ? await getPageAccessToken(activePageId) : getToken();
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method: 'DELETE',
  });
  const json = await res.json();
  if (json?.error) {
    throw new Error(json.error.message || `Meta API error`);
  }
  return json;
};

const collectPaginatedData = async (firstPage: any): Promise<any[]> => {
  const all = [...(firstPage?.data || [])];
  let nextUrl: string | null = firstPage?.paging?.next || null;
  while (nextUrl) {
    try {
      const res = await fetch(nextUrl);
      const json = await res.json();
      if (json?.error) throw new Error(json.error.message || 'Meta API error');
      if (json?.data) all.push(...json.data);
      nextUrl = json?.paging?.next || null;
    } catch {
      break;
    }
  }
  return all;
};

const collectComments = async (
  fetchPage: (after?: string) => Promise<any>,
  maxPages = 50
): Promise<any[]> => {
  const all: any[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchPage(after);
    all.push(...(res?.data || []));
    const nextAfter = res?.paging?.cursors?.after;
    if (!res?.paging?.next || !nextAfter || nextAfter === after) break;
    after = nextAfter;
  }
  return all;
};

const replyFieldsFor = (platform: 'instagram' | 'facebook') =>
  platform === 'instagram'
    ? 'id,text,message,timestamp,created_time,from{id,name},username,like_count'
    : 'id,message,text,created_time,timestamp,from{id,name},username,like_count,attachment{media{image{src}},type,url}';

const getCommentRepliesPage = (
  commentId: string,
  platform: 'instagram' | 'facebook',
  pageId?: string,
  after?: string
) => {
  const params: Record<string, string> = {
    fields: replyFieldsFor(platform),
    limit: '100',
  };
  if (after) params.after = after;
  const endpoint = platform === 'instagram' ? `${commentId}/replies` : `${commentId}/comments`;
  if (pageId) return apiGetPage(pageId, endpoint, params);
  return apiGetPageActive(endpoint, params);
};

const hydrateCommentsWithAllReplies = async (
  comments: any[],
  platform: 'instagram' | 'facebook',
  pageId?: string
): Promise<any[]> => {
  const hydrated: any[] = [];
  const chunkSize = 8;
  for (let i = 0; i < comments.length; i += chunkSize) {
    const chunk = comments.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(async (comment) => {
      try {
        const fullReplies = await collectComments(
          (after?: string) => getCommentRepliesPage(comment.id, platform, pageId, after),
          50
        );
        const byId: Record<string, any> = {};
        (comment.replies?.data || []).forEach((reply: any) => { if (reply?.id) byId[reply.id] = reply; });
        fullReplies.forEach((reply: any) => { if (reply?.id) byId[reply.id] = reply; });
        return { ...comment, replies: { data: Object.values(byId) } };
      } catch {
        return { ...comment, replies: comment.replies || { data: [] } };
      }
    }));
    hydrated.push(...results);
  }
  return hydrated;
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
      fields: 'id,name,status,preview_shareable_link,creative{id,name,thumbnail_url,image_url,image_hash,object_type,video_id,effective_object_story_id,effective_instagram_story_id,instagram_story_id,instagram_permalink_url}',
      limit: '50',
    }),

  // ── ALL ADS FOR ACCOUNT ──────────────────────────────────
  getAccountAds: async (accountId = META_AD_ACCOUNT) => {
    const first = await apiGet(`${accountId}/ads`, {
      fields: 'id,name,status,effective_status,configured_status,campaign_id,preview_shareable_link,creative{id,name,body,title,thumbnail_url,image_url,image_hash,object_type,video_id,effective_object_story_id,effective_instagram_story_id,instagram_permalink_url}',
      limit: '150',
    });
    return { ...first, data: await collectPaginatedData(first) };
  },

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
    return collectPaginatedData(res);
  },

  // ── LIFETIME INSIGHTS FOR A SINGLE AD ───────────────────
  getAdLifetimeInsights: async (adId: string): Promise<any | null> => {
    const fields = 'spend,impressions,reach,inline_link_clicks,inline_link_click_ctr,actions,purchase_roas,video_30_sec_watched_actions,video_p100_watched_actions,cost_per_action_type,action_values';
    const res = await apiGet(`${adId}/insights`, {
      fields,
      date_preset: 'lifetime',
      limit: '1',
    });
    return res?.data?.[0] || null;
  },

  // ── INSIGHTS ──────────────────────────────────────────────
  getInsights: async (accountId: string, fields: string[] | string, preset?: DatePreset, range?: { since: string, until: string }, timeIncrement?: number, signal?: AbortSignal) => {
    const fieldsStr = Array.isArray(fields) ? fields.join(',') : fields;
    const rangeKey = range ? `${range.since}_${range.until}` : (preset || '');
    const cacheKey = `insights:${accountId}:${fieldsStr}:${rangeKey}:${timeIncrement || ''}`;
    const cached = metaGetCached(cacheKey);
    if (cached) return cached;

    const params: Record<string, string> = { fields: fieldsStr, limit: '500' };
    if (range) params.time_range = JSON.stringify({ since: range.since, until: range.until || range.since });
    else if (preset) params.date_preset = preset;
    if (timeIncrement) params.time_increment = String(timeIncrement);

    const data = await apiGet(`${accountId}/insights`, params);
    
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
      const resultList = data.data.map((d: any) => ({
        ...d,
        spend: parseFloat(d.spend || 0),
        reach: parseInt(d.reach || 0),
        results: extractResults(d.actions),
        purchase_value: extractValue(d.action_values),
        roas: parseFloat(d.purchase_roas?.[0]?.value || 0),
        date: d.date_start
      })).sort((a: any, b: any) => a.date.localeCompare(b.date));
      metaSetCache(cacheKey, resultList);
      return resultList;
    }
    
    const insights = data.data[0] || {};
    const resultObj = {
      ...insights,
      spend: parseFloat(insights.spend || 0),
      reach: parseInt(insights.reach || 0),
      results: extractResults(insights.actions),
      purchase_value: extractValue(insights.action_values),
      roas: parseFloat(insights.purchase_roas?.[0]?.value || 0)
    };
    metaSetCache(cacheKey, resultObj);
    return resultObj;
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
      fields: 'id,name,campaign_id,optimization_goal,targeting,status,daily_budget,lifetime_budget',
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

  getDiscoverableInstagramAccounts: async () => {
    const res = await apiGet('me/accounts', {
      fields: 'name,instagram_business_account{id,username,name,profile_picture_url}',
      limit: '100',
    });
    const accounts = (res?.data || [])
      .filter((page: any) => page.instagram_business_account)
      .map((page: any) => ({
        pageName: page.name,
        pageId: page.id,
        igId: page.instagram_business_account.id,
        username: page.instagram_business_account.username,
        name: page.instagram_business_account.name,
        profilePictureUrl: page.instagram_business_account.profile_picture_url,
      }));
    return { data: accounts };
  },

  getDiscoverableFacebookPages: async () => {
    const res = await apiGet('me/accounts', {
      fields: 'id,name,picture{url}',
      limit: '100',
    });
    const pages = (res?.data || []).map((page: any) => ({
      id: page.id,
      name: page.name,
      pictureUrl: page.picture?.data?.url
    }));
    return { data: pages };
  },

  getInstagramProfile: (igId: string, fbPageId?: string) =>
    fbPageId
      ? apiGetPage(fbPageId, igId, {
          fields: 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website',
        })
      : apiGetPageActive(igId, {
          fields: 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website',
        }),

  getInstagramMedia: (igId: string, limit = 8, after?: string, fbPageId?: string) => {
    const params: Record<string, string> = {
      fields: 'id,caption,media_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url,children{media_url,media_type,thumbnail_url,permalink},comments.limit(100){id,text,timestamp,username,like_count,replies.limit(100){id,text,timestamp,username,from}}',
      limit: String(limit),
    };
    if (after) params.after = after;
    return fbPageId
      ? apiGetPage(fbPageId, `${igId}/media`, params)
      : apiGetPageActive(`${igId}/media`, params);
  },

  getAllInstagramMedia: async (igId: string, fbPageId?: string) => {
    const first = await metaAds.getInstagramMedia(igId, 100, undefined, fbPageId);
    return { ...first, data: await collectPaginatedData(first) };
  },

  getInstagramMediaPermalink: (mediaId: string, fbPageId?: string) =>
    fbPageId
      ? apiGetPage(fbPageId, mediaId, { fields: 'permalink,shortcode' })
      : apiGetPageActive(mediaId, { fields: 'permalink,shortcode' }),

  getInstagramMediaComments: (mediaId: string, fbPageId?: string, after?: string) => {
    const params: Record<string, string> = {
      fields: 'id,text,timestamp,username,like_count,replies.limit(100){id,text,timestamp,username,from}',
      limit: '100',
    };
    if (after) params.after = after;
    return fbPageId
      ? apiGetPage(fbPageId, `${mediaId}/comments`, params)
      : apiGetPageActive(`${mediaId}/comments`, params);
  },

  getAllInstagramMediaComments: async (mediaId: string, fbPageId?: string) => {
    const comments = await collectComments((after?: string) => metaAds.getInstagramMediaComments(mediaId, fbPageId, after));
    return hydrateCommentsWithAllReplies(comments, 'instagram', fbPageId);
  },

  replyToInstagramComment: async (commentId: string, message: string, fbPageId?: string) => {
    return fbPageId
      ? apiPostPage(fbPageId, `${commentId}/replies`, { message })
      : apiPostPageActive(`${commentId}/replies`, { message });
  },

  createInstagramMediaComment: async (mediaId: string, message: string, fbPageId?: string) => {
    return fbPageId
      ? apiPostPage(fbPageId, `${mediaId}/comments`, { message })
      : apiPostPageActive(`${mediaId}/comments`, { message });
  },

  // Recent account activity — changes made in the last N days (pauses, budget edits, new ads)
  getAccountActivities: (accountId: string, days = 7) => {
    const since = Math.floor(Date.now() / 1000) - days * 86400;
    return apiGet(`${accountId}/activities`, {
      fields: 'event_type,event_time,object_name,object_type,translated_payload,extra_data',
      since:  String(since),
      limit:  '60',
    });
  },

  // ── FACEBOOK ORGANIC ──────────────────────────────────────
  getFacebookPageInfo: (pageId: string) =>
    apiGetPage(pageId, pageId, {
      fields: 'id,name,fan_count,followers_count,picture{url},about',
    }),

  getFacebookPageFeed: (pageId: string, limit = 8, after?: string) => {
    const params: Record<string, string> = {
      fields: 'id,message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true).limit(100){id,message,created_time,from{id,name},like_count,attachment{media{image{src}},type,url},replies.limit(100){id,message,from{id,name},created_time,attachment{media{image{src}},type,url}}},attachments{media,type,url,target,subattachments{media,type,url,target}}',
      limit: String(limit),
    };
    if (after) params.after = after;
    return apiGetPage(pageId, `${pageId}/feed`, params);
  },

  getAllFacebookPageFeed: async (pageId: string) => {
    const first = await metaAds.getFacebookPageFeed(pageId, 100);
    return { ...first, data: await collectPaginatedData(first) };
  },

  getFacebookPostComments: (postId: string, after?: string) => {
    // Extract page ID from FB post ID format "{pageId}_{uniqueId}" to ensure page token is used.
    // Page Access Token is required for from.name — user token silently drops names (privacy).
    const pageId = postId.includes('_') ? postId.split('_')[0] : '';
    const fields = 'id,message,created_time,from{id,name},like_count,attachment{media{image{src}},type,url},replies.limit(100){id,message,from{id,name},created_time,attachment{media{image{src}},type,url}}';
    const params: Record<string, string> = { fields, limit: '100' };
    if (after) params.after = after;
    if (pageId) {
      return apiGetPage(pageId, `${postId}/comments`, params);
    }
    return apiGetPageActive(`${postId}/comments`, params);
  },

  getAllFacebookPostComments: async (postId: string) => {
    const pageId = postId.includes('_') ? postId.split('_')[0] : undefined;
    const comments = await collectComments((after?: string) => metaAds.getFacebookPostComments(postId, after));
    return hydrateCommentsWithAllReplies(comments, 'facebook', pageId);
  },

  replyToFacebookComment: async (commentId: string, message: string) => {
    return apiPostPageActive(`${commentId}/comments`, { message });
  },

  getIgFollowerInsights: (igId: string, since: number, until: number) =>
    apiGetPageActive(`${igId}/insights`, {
      metric: 'follower_count',
      period: 'day',
      since: String(since),
      until: String(until),
    }).catch(() => null),

  getIgOrganicInsights: (igId: string, since: number, until: number) =>
    apiGetPageActive(`${igId}/insights`, {
      metric: 'reach,impressions,profile_views',
      period: 'day',
      since: String(since),
      until: String(until),
    }).catch(() => null),

  getFbPageInsights: (pageId: string, since: number, until: number) =>
    apiGetPage(pageId, `${pageId}/insights`, {
      metric: 'page_fans',
      period: 'day',
      since: String(since),
      until: String(until),
    }).catch(() => null),

  getFbOrganicInsights: (pageId: string, since: number, until: number) =>
    apiGetPage(pageId, `${pageId}/insights`, {
      metric: 'page_impressions,page_engaged_users',
      period: 'day',
      since: String(since),
      until: String(until),
    }).catch(() => null),


  // ── CONVERSATIONS (DMs) ──────────────────────────────────

  // Facebook Messenger conversations — full fields including last message preview.
  // cursor: paging.cursors.after from a previous response (for pagination)
  getPageConversations: async (pageId: string, platform: 'messenger' | 'instagram' = 'messenger', cursor?: string, limit = 10): Promise<any> => {
    const fetchWithLimit = async (currentLimit: number): Promise<any> => {
      const params: Record<string, string> = {
        fields: 'id,participants,unread_count,updated_time,messages.limit(1){id,message,from,created_time}',
        platform,
        limit: String(currentLimit),
      };
      if (cursor) params.after = cursor;
      try {
        return await apiGetPage(pageId, `${pageId}/conversations`, params);
      } catch (err: any) {
        const msg = String(err.message || '').toLowerCase();
        if (
          (msg.includes('reduce the amount of data') || msg.includes('timeout') || msg.includes('unexpected error') || msg.includes('500')) &&
          currentLimit > 1
        ) {
          const nextLimit = Math.max(1, Math.floor(currentLimit / 2));
          console.warn(`getPageConversations failed with limit ${currentLimit}. Retrying with limit ${nextLimit}...`);
          return await fetchWithLimit(nextLimit);
        }
        throw err;
      }
    };
    return fetchWithLimit(limit);
  },

  // Instagram Direct conversations — minimal fields only (IG rejects nested message fields).
  // cursor: paging.cursors.after from a previous response (for pagination)
  getInstagramConversations: async (fbPageId: string, igUserId: string, cursor?: string, limit = 10): Promise<any> => {
    const fetchWithLimit = async (currentLimit: number): Promise<any> => {
      const params: Record<string, string> = {
        fields: 'id,participants,unread_count,updated_time',
        platform: 'instagram',
        limit: String(currentLimit),
      };
      if (cursor) params.after = cursor;
      try {
        return await apiGetPage(fbPageId, `${fbPageId}/conversations`, params);
      } catch (err: any) {
        const msg = String(err.message || '').toLowerCase();
        if (
          (msg.includes('reduce the amount of data') || msg.includes('timeout') || msg.includes('unexpected error') || msg.includes('500')) &&
          currentLimit > 1
        ) {
          const nextLimit = Math.max(1, Math.floor(currentLimit / 2));
          console.warn(`getInstagramConversations failed with limit ${currentLimit}. Retrying with limit ${nextLimit}...`);
          return await fetchWithLimit(nextLimit);
        }
        throw err;
      }
    };
    return fetchWithLimit(limit);
  },

  // Fetch up to 15 messages for AI draft context (accepts optional pageId to avoid localStorage lookup)
  getConversationMessages: (convId: string, limit = 15, pageId?: string) => {
    const pId = pageId || localStorage.getItem('active_fb_page_id') || '';
    if (pId) {
      return apiGetPage(pId, `${convId}/messages`, {
        fields: 'id,message,from,created_time',
        limit: String(limit),
      });
    }
    return apiGetPageActive(`${convId}/messages`, {
      fields: 'id,message,from,created_time',
      limit: String(limit),
    });
  },

  replyToConversation: async (convId: string, text: string, pageId?: string) => {
    const pId = pageId || localStorage.getItem('active_fb_page_id') || '';
    if (pId) {
      const token = await getPageAccessToken(pId);
      const url = new URL(`${BASE}/${convId}/messages?access_token=${token}`);
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { text } })
      });
      const json = await res.json();
      if (json?.error) throw new Error(json.error.message || 'Meta API error');
      return json;
    }
    return apiPostPageActive(`${convId}/messages`, {}, { message: { text } });
  },

  // Helper to fetch comments of an Ad's creative
  getInstagramMediaFromFBPost: (fbPostId: string, pageId?: string) =>
    pageId
      ? apiGetPage(pageId, fbPostId, { fields: 'instagram_story{id}' })
      : apiGetPageActive(fbPostId, { fields: 'instagram_story{id}' }),

  getAdCreativeComments: (storyId: string, platform: 'instagram' | 'facebook' = 'instagram', pageId?: string, after?: string) => {
    const params: Record<string, string> = {
      fields: platform === 'instagram'
        ? 'id,text,message,timestamp,created_time,from{id,name},username,like_count,replies.limit(100){id,text,message,from{id,name},username,timestamp,created_time}'
        : 'id,message,created_time,from{id,name},like_count,replies.limit(100){id,message,from{id,name},created_time}',
      limit: '100',
    };
    if (after) params.after = after;
    return pageId
      ? apiGetPage(pageId, `${storyId}/comments`, params)
      : apiGetPageActive(`${storyId}/comments`, params);
  },

  getAllAdCreativeComments: async (storyId: string, platform: 'instagram' | 'facebook' = 'instagram', pageId?: string) => {
    const resolvedPageId = pageId || (platform === 'facebook' && storyId.includes('_') ? storyId.split('_')[0] : undefined);
    const comments = await collectComments((after?: string) => metaAds.getAdCreativeComments(storyId, platform, pageId, after));
    return hydrateCommentsWithAllReplies(comments, platform, resolvedPageId);
  },

  getFacebookUserName: (userId: string, pageId: string) =>
    apiGetPage(pageId, userId, { fields: 'name' }),

  likeComment: async (commentId: string, platform: 'instagram' | 'facebook', igUserId?: string, fbPageId?: string) => {
    if (platform === 'instagram' && igUserId) {
      return fbPageId
        ? apiPostPage(fbPageId, `${igUserId}/likes`, { comment_id: commentId })
        : apiPostPageActive(`${igUserId}/likes`, { comment_id: commentId });
    } else {
      return fbPageId
        ? apiPostPage(fbPageId, `${commentId}/likes`)
        : apiPostPageActive(`${commentId}/likes`);
    }
  },

  unlikeComment: async (commentId: string, platform: 'instagram' | 'facebook', igUserId?: string, fbPageId?: string) => {
    if (platform === 'instagram' && igUserId) {
      return fbPageId
        ? apiDeletePage(fbPageId, `${igUserId}/likes`, { comment_id: commentId })
        : apiDeletePageActive(`${igUserId}/likes`, { comment_id: commentId });
    } else {
      return fbPageId
        ? apiDeletePage(fbPageId, `${commentId}/likes`)
        : apiDeletePageActive(`${commentId}/likes`);
    }
  },

  setClientPageToken: (pageId: string, token: string) => {
    if (pageId && token) {
      pageTokensCache[pageId] = token;
      try {
        localStorage.setItem('active_fb_page_id', pageId);
      } catch (e) {
        console.warn("Storage full: could not save active_fb_page_id", e);
      }
    }
  },
};
