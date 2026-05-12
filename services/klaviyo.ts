
const REVISION = '2024-10-15';
const BASE = '/api/klaviyo';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limit: Klaviyo metric-aggregates allows burst requests, but we hit 429 if too aggressive.
// We use an 800ms gap to balance speed and stability.
let lastRequestTime = 0;
// We execute a queue Promise to prevent race conditions on lastRequestTime
let queue = Promise.resolve();

const rateLimitedFetch = async (url: string, options: RequestInit, retryCount = 0): Promise<Response> => {
  return new Promise((resolve) => {
    queue = queue.then(async () => {
      const MIN_GAP_MS = 800;
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (elapsed < MIN_GAP_MS) {
        await wait(MIN_GAP_MS - elapsed);
      }
      lastRequestTime = Date.now();

      const res = await fetch(url, options);

      if (res.status === 429) {
        if (retryCount >= 6) {
          console.error('[Klaviyo] Max retries reached on 429');
          resolve(res);
          return;
        }
        const retryAfter = res.headers.get('Retry-After');
        const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : (retryCount * 2 + 2);
        console.warn(`[Klaviyo] 429 — waiting ${waitSeconds}s (retry ${retryCount + 1}/6)...`);
        await wait(waitSeconds * 1000);
        // Call it again and bypass queue for the retry
        const retryRes = await rateLimitedFetch(url, options, retryCount + 1);
        resolve(retryRes);
        return;
      }
      resolve(res);
    });
  });
};

const apiPost = async (apiKey: string, endpoint: string, body: any): Promise<any> => {
  try {
    const res = await rateLimitedFetch(`${BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'Revision': REVISION,
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error(`[Klaviyo] POST Error (${res.status}) on ${endpoint}:`, txt);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('[Klaviyo] POST Failure:', e);
    return null;
  }
};

const apiGet = async (apiKey: string, endpoint: string): Promise<any> => {
  try {
    const res = await rateLimitedFetch(`${BASE}/${endpoint}`, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'Revision': REVISION,
        'Accept': 'application/vnd.api+json',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
};

// Cache metric IDs per account to avoid refetching
const metricIdCache: Record<string, any> = {};

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
  ) => {
    return apiPost(apiKey, 'metric-aggregates', {
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: measurements,
          ...(by.length > 0 && { by }),
          filter: [
            `greater-or-equal(datetime,${since}T00:00:00Z)`,
            `less-than(datetime,${until}T23:59:59Z)`
          ],
          interval: 'day',
          timezone: 'UTC'
        }
      }
    });
  },

  getDashboardData: async (apiKey: string, since: string, until: string) => {
    try {
      const metricsRes = await klaviyo.getMetrics(apiKey);
      if (!metricsRes?.data) return null;

      const metrics = metricsRes.data;
      const findId = (names: string[]) => {
        // Try exact match first
        let found = metrics.find((m: any) =>
          names.some(n => m.attributes.name.toLowerCase() === n.toLowerCase())
        );
        // Fallback to includes
        if (!found) {
          found = metrics.find((m: any) =>
            names.some(n => m.attributes.name.toLowerCase().includes(n.toLowerCase()))
          );
        }
        return found?.id;
      };

      const mIds = {
        revenue: findId(['Placed Order', 'Pedido Realizado']),
        opens:   findId(['Opened Email', 'Email Abierto']),
        clicks:  findId(['Clicked Email', 'Email Clicado']),
        sent:    findId(['Received Email', 'Email Recibido']),
      };

      console.log('[Klaviyo] Metric IDs found:', mIds);

      // measurements is an OBJECT with named keys, e.g. { sum_value: [...daily values] }
      const sumMeasure = (res: any, key: 'sum_value' | 'count'): number => {
        const values = res?.data?.attributes?.data?.[0]?.measurements?.[key];
        if (!Array.isArray(values)) return 0;
        return values.reduce((a: number, b: number) => a + b, 0);
      };

      const dailyMeasure = (res: any, key: 'sum_value' | 'count'): { date: string, val: number }[] => {
        const values = res?.data?.attributes?.data?.[0]?.measurements?.[key] || [];
        const dates = res?.data?.attributes?.dates || [];
        return values.map((val: number, i: number) => ({
          val,
          date: dates[i] ? dates[i].split('T')[0] : `Día ${i+1}`
        }));
      };

      const sumAttributed = (res: any): number => {
        if (!res?.data?.attributes?.data) return 0;
        let total = 0;
        res.data.attributes.data.forEach((d: any) => {
          if (d.dimensions[0]) { // has an attributed message
             total += d.measurements.sum_value.reduce((a:number,b:number)=>a+b,0);
          }
        });
        return total;
      };

      const dailyAttributed = (res: any): { date: string, val: number }[] => {
        if (!res?.data?.attributes?.data) return [];
        const dates = res.data.attributes.dates || [];
        const dailyTotals = new Array(dates.length).fill(0);
        res.data.attributes.data.forEach((d: any) => {
          if (d.dimensions[0]) {
             d.measurements.sum_value.forEach((v:number, i:number) => {
                dailyTotals[i] += v;
             });
          }
        });
        return dailyTotals.map((val: number, i: number) => ({
          val,
          date: dates[i] ? dates[i].split('T')[0] : `Día ${i+1}`
        }));
      };

      // Fetch current period metrics sequentially
      const results: any = {};
      if (mIds.revenue) {
        results.revenue = await klaviyo.getMetricAggregate(apiKey, mIds.revenue, since, until, ['sum_value', 'count']);
        results.attributed = await klaviyo.getMetricAggregate(apiKey, mIds.revenue, since, until, ['sum_value'], ['$attributed_message']);
      }
      if (mIds.sent)    results.sent    = await klaviyo.getMetricAggregate(apiKey, mIds.sent,    since, until, ['count']);
      if (mIds.opens)   results.opens   = await klaviyo.getMetricAggregate(apiKey, mIds.opens,   since, until, ['count']);
      if (mIds.clicks)  results.clicks  = await klaviyo.getMetricAggregate(apiKey, mIds.clicks,  since, until, ['count']);

      const out = {
        revenue:          sumMeasure(results.revenue, 'sum_value'),
        attributed:       sumAttributed(results.attributed),
        opens:            sumMeasure(results.opens,   'count'),
        clicks:           sumMeasure(results.clicks,  'count'),
        sent:             sumMeasure(results.sent,    'count'),
        conversions:      sumMeasure(results.revenue, 'count'),
        dailyRevenue:     dailyMeasure(results.revenue, 'sum_value'),
        dailyAttributed:  dailyAttributed(results.attributed),
        dailyOpens:       dailyMeasure(results.opens,   'count'),
        dailyClicks:      dailyMeasure(results.clicks,  'count'),
        dailySent:        dailyMeasure(results.sent,    'count'),
        dailyConversions: dailyMeasure(results.revenue, 'count'),
      };

      console.log('[Klaviyo] Dashboard data:', out);
      return out;
    } catch (err) {
      console.error('[Klaviyo] getDashboardData error:', err);
      return null;
    }
  },
  getFlows: async (apiKey: string) => {
    try {
      const res = await rateLimitedFetch(`${BASE}/flows`, {
        method: 'GET',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'Revision': REVISION,
          'Accept': 'application/vnd.api+json'
        }
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    } catch (e) {
      console.error('[Klaviyo] getFlows Error:', e);
      return [];
    }
  },
  getCampaigns: async (apiKey: string) => {
    try {
      const res = await rateLimitedFetch(`${BASE}/campaigns?filter=equals(messages.channel,'email')`, {
        method: 'GET',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'Revision': REVISION,
          'Accept': 'application/vnd.api+json'
        }
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    } catch (e) {
      console.error('[Klaviyo] getCampaigns Error:', e);
      return [];
    }
  },
  getFlowMessages: async (apiKey: string, flowId: string) => {
    try {
      // First get actions for the flow
      const actRes = await rateLimitedFetch(`${BASE}/flows/${flowId}/flow-actions`, {
        method: 'GET',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'Revision': REVISION,
          'Accept': 'application/vnd.api+json'
        }
      });
      if (!actRes.ok) return [];
      const actions = await actRes.json();
      
      const allMessages: any[] = [];
      for (const action of (actions.data || [])) {
        if (action.type === 'flow-action') {
          const msgRes = await rateLimitedFetch(`${BASE}/flow-actions/${action.id}/flow-messages`, {
            method: 'GET',
            headers: {
              'Authorization': `Klaviyo-API-Key ${apiKey}`,
              'Revision': REVISION,
              'Accept': 'application/vnd.api+json'
            }
          });
          if (msgRes.ok) {
            const msgs = await msgRes.json();
            allMessages.push(...(msgs.data || []));
          }
        }
      }
      return allMessages;
    } catch (e) {
      console.error('[Klaviyo] getFlowMessages Error:', e);
      return [];
    }
  },
  getCampaignMessages: async (apiKey: string, campaignId: string) => {
    try {
      const res = await rateLimitedFetch(`${BASE}/campaigns/${campaignId}/campaign-messages`, {
        method: 'GET',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'Revision': REVISION,
          'Accept': 'application/vnd.api+json'
        }
      });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    } catch (e) {
      console.error('[Klaviyo] getCampaignMessages Error:', e);
      return [];
    }
  }
};
