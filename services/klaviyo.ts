
const REVISION = '2024-10-15';
const BASE = '/api/klaviyo';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const apiPost = async (apiKey: string, endpoint: string, body: any, retryCount = 0): Promise<any> => {
  try {
    // REMOVED trailing slash from endpoint
    const res = await fetch(`${BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'Revision': REVISION,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (res.status === 429) {
      if (retryCount > 2) return null;
      const waitTime = 3000 * (retryCount + 1);
      await wait(waitTime);
      return apiPost(apiKey, endpoint, body, retryCount + 1);
    }

    if (!res.ok) {
      const txt = await res.text();
      console.error(`Klaviyo POST Error (${res.status}) on ${endpoint}:`, txt);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("Klaviyo POST Failure:", e);
    return null;
  }
};

const apiGet = async (apiKey: string, endpoint: string): Promise<any> => {
  try {
    // REMOVED trailing slash from endpoint
    const res = await fetch(`${BASE}/${endpoint}`, {
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'Revision': REVISION,
        'Accept': 'application/json',
      },
    });
    if (res.status === 429) { await wait(3000); return apiGet(apiKey, endpoint); }
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
};

let metricIdCache: Record<string, any> = {};

export const klaviyo = {
  getMetrics: async (apiKey: string) => {
    if (metricIdCache[apiKey]) return metricIdCache[apiKey];
    const res = await apiGet(apiKey, 'metrics');
    if (res) metricIdCache[apiKey] = res;
    return res;
  },

  getMetricAggregate: async (apiKey: string, metricId: string, since: string, until: string, measurement: 'sum_value' | 'count' | 'unique' = 'sum_value') => {
    return apiPost(apiKey, 'metric-aggregates', {
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: [measurement],
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
        const found = metrics.find((m: any) => names.some(n => m.attributes.name.toLowerCase().includes(n.toLowerCase())));
        return found?.id;
      };
      
      const mIds = {
        revenue: findId(['Placed Order', 'Ordered Product', 'Order Placed', 'Pedido Realizado']),
        opens:   findId(['Opened Email', 'Open Email', 'Email Abierto', 'Apertura']),
        clicks:  findId(['Clicked Email', 'Click Email', 'Email Clicado', 'Clic']),
        sent:    findId(['Received Email', 'Sent Email', 'Receive Email', 'Email Recibido', 'Envío']),
        conversions: findId(['Placed Order', 'Checkout Completed', 'Pedido Realizado'])
      };

      const results: any = {};
      const SLOW_DELAY = 1200; 
      
      if (mIds.revenue) { results.revenue = await klaviyo.getMetricAggregate(apiKey, mIds.revenue, since, until, 'sum_value'); await wait(SLOW_DELAY); }
      if (mIds.sent)    { results.sent    = await klaviyo.getMetricAggregate(apiKey, mIds.sent,    since, until, 'count'); await wait(SLOW_DELAY); }
      if (mIds.opens)   { results.opens   = await klaviyo.getMetricAggregate(apiKey, mIds.opens,   since, until, 'count'); await wait(SLOW_DELAY); }
      if (mIds.clicks)  { results.clicks  = await klaviyo.getMetricAggregate(apiKey, mIds.clicks,  since, until, 'count'); await wait(SLOW_DELAY); }
      if (mIds.conversions) { results.convs = await klaviyo.getMetricAggregate(apiKey, mIds.conversions, since, until, 'count'); }

      const sum = (res: any) => res?.data?.attributes?.data?.[0]?.measurements?.[0]?.reduce((a: number, b: number) => a + b, 0) || 0;
      const daily = (res: any) => res?.data?.attributes?.data?.[0]?.measurements?.[0] || [];

      return {
        revenue: sum(results.revenue),
        opens:   sum(results.opens),
        clicks:  sum(results.clicks),
        sent:    sum(results.sent),
        conversions: sum(results.convs),
        dailyRevenue: daily(results.revenue),
        dailyOpens:   daily(results.opens),
        dailyClicks:  daily(results.clicks),
        dailySent:    daily(results.sent),
        dailyConversions: daily(results.convs)
      };
    } catch (err) {
      return null;
    }
  }
};
