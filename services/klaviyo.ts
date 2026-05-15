
const REVISION = '2024-10-15';
const BASE = '/api/klaviyo';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─── In-memory result cache (survives re-renders, cleared on page refresh) ───
interface CacheEntry {
  data: any;
  timestamp: number;
}
const resultCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): any | null {
  const entry = resultCache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    delete resultCache[key];
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: any) {
  resultCache[key] = { data, timestamp: Date.now() };
}

// ─── Concurrency limiter — max 2 simultaneous metric-aggregate calls ───
const MAX_CONCURRENT = 2;
let _inFlight = 0;
const _waiters: (() => void)[] = [];

const acquire = (): Promise<void> => {
  if (_inFlight < MAX_CONCURRENT) { _inFlight++; return Promise.resolve(); }
  return new Promise(resolve => _waiters.push(() => { _inFlight++; resolve(); }));
};
const release = () => { _inFlight--; _waiters.shift()?.(); };

const enqueue = async <T>(fn: () => Promise<T>): Promise<T> => {
  await acquire();
  try { return await fn(); } finally { release(); }
};

const apiFetch = async (url: string, options: RequestInit, retryCount = 0): Promise<Response> => {
  const res = await fetch(url, options);
  if (res.status === 429) {
    if (retryCount >= 5) return res;
    const retryAfter = res.headers.get('Retry-After');
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, retryCount) * 1500;
    await wait(waitMs);
    return apiFetch(url, options, retryCount + 1);
  }
  return res;
};

const buildHeaders = (apiKey: string): HeadersInit => ({
  'Authorization': `Klaviyo-API-Key ${apiKey}`,
  'Revision': REVISION,
  'Accept': 'application/json',
  'Content-Type': 'application/json',
});

const apiPost = async (apiKey: string, endpoint: string, body: any): Promise<any> => {
  try {
    const res = await apiFetch(`${BASE}/${endpoint}`, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.error(`[Klaviyo] POST ${res.status} on ${endpoint}`); return null; }
    return await res.json();
  } catch (e) { console.error('[Klaviyo] POST Failure:', e); return null; }
};

const apiGet = async (apiKey: string, endpoint: string): Promise<any> => {
  try {
    const res = await apiFetch(`${BASE}/${endpoint}`, { headers: buildHeaders(apiKey) });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
};

// ─── Per-account metric ID cache (persists for entire session) ───
const metricIdCache: Record<string, any> = {};

// ─── Build metric-aggregate POST body ───
const buildAggBody = (
  metricId: string,
  since: string,
  until: string,
  measurements: string[],
  by: string[] = []
) => {
  const daysDiff = (new Date(until).getTime() - new Date(since).getTime()) / 86_400_000;
  const interval = daysDiff > 180 ? 'month' : daysDiff > 90 ? 'week' : 'day';
  return {
    data: {
      type: 'metric-aggregate',
      attributes: {
        metric_id: metricId,
        measurements,
        ...(by.length > 0 && { by }),
        filter: [
          `greater-or-equal(datetime,${since}T00:00:00Z)`,
          `less-than(datetime,${until}T23:59:59Z)`,
        ],
        interval,
        timezone: 'UTC',
      },
    },
  };
};

// ─── Parsers ───
const sumMeasure = (res: any, key: 'sum_value' | 'count'): number => {
  const values = res?.data?.attributes?.data?.[0]?.measurements?.[key];
  return Array.isArray(values) ? values.reduce((a: number, b: number) => a + b, 0) : 0;
};

const dailyMeasure = (res: any, key: 'sum_value' | 'count'): { date: string; val: number }[] => {
  const values = res?.data?.attributes?.data?.[0]?.measurements?.[key] || [];
  const dates = res?.data?.attributes?.dates || [];
  return values.map((val: number, i: number) => ({
    val,
    date: dates[i] ? dates[i].split('T')[0] : `Día ${i + 1}`,
  }));
};

const sumAttributed = (res: any): number => {
  if (!res?.data?.attributes?.data) return 0;
  return res.data.attributes.data.reduce((total: number, d: any) => {
    if (!d.dimensions[0]) return total;
    return total + d.measurements.sum_value.reduce((a: number, b: number) => a + b, 0);
  }, 0);
};

const dailyAttributed = (res: any): { date: string; val: number }[] => {
  if (!res?.data?.attributes?.data) return [];
  const dates = res.data.attributes.dates || [];
  const totals = new Array(dates.length).fill(0);
  res.data.attributes.data.forEach((d: any) => {
    if (d.dimensions[0]) d.measurements.sum_value.forEach((v: number, i: number) => { totals[i] += v; });
  });
  return totals.map((val, i) => ({ val, date: dates[i] ? dates[i].split('T')[0] : `Día ${i + 1}` }));
};

export const klaviyo = {
  getMetrics: async (apiKey: string) => {
    if (metricIdCache[apiKey]) return metricIdCache[apiKey];
    const res = await apiGet(apiKey, 'metrics');
    if (res) metricIdCache[apiKey] = res;
    return res;
  },

  getMetricAggregate: async (
    apiKey: string,
    metricId: string,
    since: string,
    until: string,
    measurements: string[] = ['sum_value'],
    by: string[] = []
  ) => enqueue(() => apiPost(apiKey, 'metric-aggregates', buildAggBody(metricId, since, until, measurements, by))),

  getDashboardData: async (apiKey: string, since: string, until: string) => {
    const cacheKey = `dashboard:${apiKey}:${since}:${until}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const metricsRes = await klaviyo.getMetrics(apiKey);
      if (!metricsRes?.data) return null;

      const metrics = metricsRes.data;
      const findId = (names: string[]) => {
        let found = metrics.find((m: any) =>
          names.some((n: string) => m.attributes.name.toLowerCase() === n.toLowerCase())
        );
        if (!found) {
          found = metrics.find((m: any) =>
            names.some((n: string) => m.attributes.name.toLowerCase().includes(n.toLowerCase()))
          );
        }
        return found?.id;
      };

      const mIds = {
        revenue: findId(['Placed Order', 'Pedido Realizado', 'Order Placed']),
        opens:   findId(['Opened Email', 'Email Abierto', 'Email Open']),
        clicks:  findId(['Clicked Email', 'Email Clicado', 'Email Click', 'Clicked Link in Email']),
        sent:    findId(['Received Email', 'Email Recibido', 'Email Delivered', 'Delivered Email', 'Sent Email']),
      };

      const post = (id: string | undefined, measurements: string[], by: string[] = []) =>
        id ? enqueue(() => apiPost(apiKey, 'metric-aggregates', buildAggBody(id, since, until, measurements, by))) : Promise.resolve(null);

      const [revenueRes, attributedRes, sentRes, opensRes, clicksRes] = await Promise.all([
        post(mIds.revenue, ['sum_value', 'count']),
        post(mIds.revenue, ['sum_value'], ['$attributed_message']),
        post(mIds.sent,    ['count']),
        post(mIds.opens,   ['count']),
        post(mIds.clicks,  ['count']),
      ]);

      const result = {
        revenue:          sumMeasure(revenueRes, 'sum_value'),
        attributed:       sumAttributed(attributedRes),
        opens:            sumMeasure(opensRes,   'count'),
        clicks:           sumMeasure(clicksRes,  'count'),
        sent:             sumMeasure(sentRes,    'count'),
        conversions:      sumMeasure(revenueRes, 'count'),
        dailyRevenue:     dailyMeasure(revenueRes, 'sum_value'),
        dailyAttributed:  dailyAttributed(attributedRes),
        dailyOpens:       dailyMeasure(opensRes,   'count'),
        dailyClicks:      dailyMeasure(clicksRes,  'count'),
        dailySent:        dailyMeasure(sentRes,    'count'),
        dailyConversions: dailyMeasure(revenueRes, 'count'),
      };

      const dataLooksCorrupt = result.sent === 0 && (result.opens > 0 || result.clicks > 0);
      if (dataLooksCorrupt) {
        delete metricIdCache[apiKey];
        return result;
      }

      setCache(cacheKey, result);
      return result;
    } catch (err) {
      console.error('[Klaviyo] getDashboardData error:', err);
      return null;
    }
  },

  // Returns sent/opens/clicks per campaign or flow message name for the date range
  getStatsByName: async (apiKey: string, since: string, until: string): Promise<Record<string, { sent: number; opens: number; clicks: number }>> => {
    const cacheKey = `stats-by-name:${apiKey}:${since}:${until}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    try {
      const metricsRes = await klaviyo.getMetrics(apiKey);
      if (!metricsRes?.data) return {};
      const metrics = metricsRes.data;
      const findId = (names: string[]) => {
        let found = metrics.find((m: any) => names.some((n: string) => m.attributes.name.toLowerCase() === n.toLowerCase()));
        if (!found) found = metrics.find((m: any) => names.some((n: string) => m.attributes.name.toLowerCase().includes(n.toLowerCase())));
        return found?.id;
      };
      const sentId  = findId(['Received Email', 'Email Recibido', 'Email Delivered', 'Delivered Email', 'Sent Email']);
      const opensId = findId(['Opened Email', 'Email Abierto', 'Email Open']);
      const clicksId = findId(['Clicked Email', 'Email Clicado', 'Email Click', 'Clicked Link in Email']);

      const makeBody = (metricId: string) => ({
        data: {
          type: 'metric-aggregate',
          attributes: {
            metric_id: metricId,
            measurements: ['count'],
            by: ['Campaign Name'],
            filter: [
              `greater-or-equal(datetime,${since}T00:00:00Z)`,
              `less-than(datetime,${until}T23:59:59Z)`,
            ],
            interval: 'day',
            timezone: 'UTC',
          },
        },
      });

      const postByName = (id: string | undefined) =>
        id ? enqueue(() => apiPost(apiKey, 'metric-aggregates', makeBody(id))) : Promise.resolve(null);

      const [sentRes, opensRes, clicksRes] = await Promise.all([
        postByName(sentId),
        postByName(opensId),
        postByName(clicksId),
      ]);

      const result: Record<string, { sent: number; opens: number; clicks: number }> = {};
      const sumByName = (res: any, field: 'sent' | 'opens' | 'clicks') => {
        (res?.data?.attributes?.data || []).forEach((item: any) => {
          const name = item.dimensions?.[0];
          if (!name) return;
          const total = (item.measurements?.count || []).reduce((a: number, b: number) => a + b, 0);
          if (!result[name]) result[name] = { sent: 0, opens: 0, clicks: 0 };
          result[name][field] = total;
        });
      };
      sumByName(sentRes, 'sent');
      sumByName(opensRes, 'opens');
      sumByName(clicksRes, 'clicks');

      setCache(cacheKey, result);
      return result;
    } catch (e) { return {}; }
  },

  getFlows: async (apiKey: string) => {
    const cacheKey = `flows:${apiKey}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    try {
      // Fetch all flows (including draft) so we can show everything
      const res = await apiFetch(`${BASE}/flows?page%5Bsize%5D=50`, { headers: buildHeaders(apiKey) });
      if (!res.ok) return [];
      const json = await res.json();
      const data = json.data || [];
      setCache(cacheKey, data);
      return data;
    } catch (e) { return []; }
  },

  getCampaigns: async (apiKey: string) => {
    const cacheKey = `campaigns:v4:${apiKey}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    try {
      const res = await apiFetch(
        `${BASE}/campaigns?filter=equals(messages.channel,'email')&include=campaign-messages&fields%5Bcampaign-message%5D=label,channel,content`,
        { headers: buildHeaders(apiKey) }
      );
      if (!res.ok) return [];
      const json = await res.json();
      const msgMap: Record<string, any> = Object.fromEntries(
        (json.included || []).map((m: any) => [m.id, m])
      );
      const data = (json.data || [])
        .sort((a: any, b: any) => new Date(b.attributes.updated_at).getTime() - new Date(a.attributes.updated_at).getTime())
        .map((camp: any) => {
          const msgIds = camp.relationships?.['campaign-messages']?.data?.map((r: any) => r.id) || [];
          const msgs = msgIds.map((id: string) => msgMap[id]).filter(Boolean);
          const messageId = msgs[0]?.id || '';
          const messageLabel = msgs[0]?.attributes?.label || '';
          const emailSubject = msgs[0]?.attributes?.content?.subject || '';
          return { ...camp, messageId, messageLabel, subject: emailSubject || messageLabel };
        });
      setCache(cacheKey, data);
      return data;
    } catch (e) { return []; }
  },

  getDetailedStats: async (apiKey: string, since: string, until: string): Promise<{
    campaigns:     Record<string, { sent: number; opens: number; clicks: number }>;
    msgRevenue:    Record<string, { revenue: number; orders: number }>;
    flowRevenue:   Record<string, { revenue: number; orders: number }>;
    msgEngagement: Record<string, { sent: number; opens: number; clicks: number }>;
  }> => {
    const cacheKey = `detailed5:${apiKey}:${since}:${until}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const empty = { campaigns: {}, msgRevenue: {}, flowRevenue: {}, msgEngagement: {} };
    const metricsRes = await klaviyo.getMetrics(apiKey);
    if (!metricsRes?.data) return empty;

    const metrics = metricsRes.data;
    const findId = (names: string[]) => {
      let f = metrics.find((m: any) => names.some(n => m.attributes.name.toLowerCase() === n.toLowerCase()));
      if (!f) f = metrics.find((m: any) => names.some(n => m.attributes.name.toLowerCase().includes(n.toLowerCase())));
      return f?.id as string | undefined;
    };
    const mIds = {
      revenue: findId(['Placed Order', 'Pedido Realizado', 'Order Placed']),
      opens:   findId(['Opened Email', 'Email Abierto', 'Email Open']),
      clicks:  findId(['Clicked Email', 'Email Clicado', 'Email Click', 'Clicked Link in Email']),
      sent:    findId(['Received Email', 'Email Recibido', 'Email Delivered', 'Delivered Email', 'Sent Email']),
    };

    const makeBody = (metricId: string, by: string, measurements: string[]) => ({
      data: { type: 'metric-aggregate', attributes: {
        metric_id: metricId, measurements, by: [by],
        filter: [`greater-or-equal(datetime,${since}T00:00:00Z)`, `less-than(datetime,${until}T23:59:59Z)`],
        interval: 'day', timezone: 'UTC',
      }},
    });

    const p = (id: string | undefined, by: string, m: string[]) =>
      id ? enqueue(() => apiPost(apiKey, 'metric-aggregates', makeBody(id, by, m))) : Promise.resolve(null);

    const [cSent, cOpens, cClicks, msgRev, flowRev, mSent, mOpens, mClicks] = await Promise.all([
      p(mIds.sent,    'Campaign Name',       ['count']),
      p(mIds.opens,   'Campaign Name',       ['count']),
      p(mIds.clicks,  'Campaign Name',       ['count']),
      p(mIds.revenue, '$attributed_message', ['sum_value', 'count']),
      p(mIds.revenue, '$attributed_flow',    ['sum_value', 'count']),
      // '$message' groups email events by message ID — works for flow emails
      p(mIds.sent,   '$message', ['count']),
      p(mIds.opens,  '$message', ['count']),
      p(mIds.clicks, '$message', ['count']),
    ]);

    const sumByDim = (res: any, key: 'sum_value' | 'count'): Record<string, number> => {
      const out: Record<string, number> = {};
      (res?.data?.attributes?.data || []).forEach((item: any) => {
        const name = item.dimensions?.[0]; if (!name) return;
        const total = (item.measurements?.[key] || []).reduce((a: number, b: number) => a + b, 0);
        out[name] = (out[name] || 0) + total;
      });
      return out;
    };

    const cSentMap  = sumByDim(cSent,  'count');
    const cOpensMap = sumByDim(cOpens, 'count');
    const cClickMap = sumByDim(cClicks,'count');
    const msgRevMap = sumByDim(msgRev, 'sum_value');
    const msgOrdMap = sumByDim(msgRev, 'count');
    const flRevMap  = sumByDim(flowRev,'sum_value');
    const flOrdMap  = sumByDim(flowRev,'count');
    const mSentMap  = sumByDim(mSent,  'count');
    const mOpensMap = sumByDim(mOpens, 'count');
    const mClickMap = sumByDim(mClicks,'count');

    const campaigns: Record<string, any> = {};
    Object.keys(cSentMap).forEach(name => {
      campaigns[name] = { sent: cSentMap[name] || 0, opens: cOpensMap[name] || 0, clicks: cClickMap[name] || 0 };
    });

    const msgRevenue: Record<string, any> = {};
    Object.keys(msgRevMap).forEach(name => {
      msgRevenue[name] = { revenue: msgRevMap[name] || 0, orders: msgOrdMap[name] || 0 };
    });

    const flowRevenue: Record<string, any> = {};
    Object.keys(flRevMap).forEach(name => {
      flowRevenue[name] = { revenue: flRevMap[name] || 0, orders: flOrdMap[name] || 0 };
    });

    const msgEngagement: Record<string, any> = {};
    const allMsgIds = new Set([...Object.keys(mSentMap), ...Object.keys(mOpensMap), ...Object.keys(mClickMap)]);
    allMsgIds.forEach(id => {
      msgEngagement[id] = { sent: mSentMap[id] || 0, opens: mOpensMap[id] || 0, clicks: mClickMap[id] || 0 };
    });

    const result = { campaigns, msgRevenue, flowRevenue, msgEngagement };
    setCache(cacheKey, result);
    return result;
  },

  getFlowMessages: async (apiKey: string, flowId: string) => {
    try {
      // Use filter endpoint instead of nested /flows/{id}/flow-actions
      // to avoid 404 in Vercel production (deep nested paths unreliable with catch-all routing)
      const actRes = await apiFetch(
        `${BASE}/flow-actions?filter=equals(flow.id,"${flowId}")&page[size]=50`,
        { headers: buildHeaders(apiKey) }
      );
      if (!actRes.ok) return [];
      const actions = await actRes.json();
      const emailActions = (actions.data || []).filter(
        (a: any) => a.attributes?.action_type === 'SEND_EMAIL'
      );
      const msgPromises = emailActions.map((action: any) =>
        apiFetch(`${BASE}/flow-actions/${action.id}/flow-messages`, {
          headers: buildHeaders(apiKey),
        }).then(r => r.ok ? r.json() : { data: [] })
      );
      const results = await Promise.all(msgPromises);
      return results.flatMap(r => r.data || []);
    } catch (e) { return []; }
  },

  getCampaignMessages: async (apiKey: string, campaignId: string) => {
    try {
      const res = await apiFetch(
        `${BASE}/campaigns/${campaignId}/campaign-messages?fields%5Bcampaign-message%5D=label,channel,content`,
        { headers: buildHeaders(apiKey) }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    } catch (e) { return []; }
  },
};
