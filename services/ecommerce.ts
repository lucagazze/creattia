import { supabase } from './supabase';
// ─── sessionStorage result cache — survives page refreshes, cleared on tab close ───
const EC_PREFIX = 'ec:';
const DASHBOARD_CACHE_VERSION = 'v2';
const EC_TTL_MS = 5 * 60 * 1000; // 5 minutes

function ecGetCached(key: string): any | null {
  try {
    const raw = sessionStorage.getItem(EC_PREFIX + key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw) as { data: any; timestamp: number };
    if (Date.now() - timestamp > EC_TTL_MS) { sessionStorage.removeItem(EC_PREFIX + key); return null; }
    return data;
  } catch { return null; }
}

function ecSetCache(key: string, data: any) {
  try {
    sessionStorage.setItem(EC_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* silently skip if storage full */ }
}

const BASE = '/api/shopify';

// ─── Order attribution ────────────────────────────────────────────────────────

export type OrderAttribution = {
  source: 'meta_ads' | 'google_ads' | 'email' | 'organic' | 'direct' | 'other';
  label: string;
  detail?: string;
};

function classifyAttrib(src: string, med: string, campaign: string, referrer: string): OrderAttribution {
  const s = src.toLowerCase();
  const m = med.toLowerCase();
  if (['facebook', 'instagram', 'fb', 'meta', 'ig'].some(x => s.includes(x)) ||
      (['paid', 'paidsocial', 'paid_social', 'cpc'].includes(m) && !s.includes('google'))) {
    return { source: 'meta_ads', label: 'Meta Ads', detail: campaign || undefined };
  }
  if (s.includes('google') && ['cpc', 'paid', 'ppc', 'paidsearch', 'paid_search'].some(x => m.includes(x))) {
    return { source: 'google_ads', label: 'Google Ads', detail: campaign || undefined };
  }
  if (m === 'email' || s === 'email' ||
      ['klaviyo', 'mailchimp', 'brevo', 'sendgrid', 'omnisend'].some(x => s.includes(x))) {
    return { source: 'email', label: 'Email Marketing', detail: campaign || undefined };
  }
  if (m === 'organic' || (s.includes('google') && m && !['cpc', 'paid', 'ppc'].includes(m))) {
    return { source: 'organic', label: 'SEO Orgánico' };
  }
  if (s || m) {
    return { source: 'other', label: (s || m).slice(0, 20), detail: campaign || undefined };
  }
  if (referrer) {
    try {
      const host = new URL(referrer.startsWith('http') ? referrer : `https://${referrer}`)
        .hostname.replace(/^www\./, '');
      if (['facebook.com', 'instagram.com', 'fb.com', 'l.facebook.com'].some(h => host.endsWith(h)))
        return { source: 'meta_ads', label: 'Meta Ads' };
      if (host.startsWith('google.') || host.includes('.google.'))
        return { source: 'organic', label: 'Google' };
      if (host) return { source: 'other', label: host };
    } catch {}
  }
  return { source: 'direct', label: 'Sin publicidad' };
}

export function parseOrderAttribution(order: any): OrderAttribution | null {
  if ('_attribution' in order) return order._attribution as OrderAttribution | null;
  const landingSite: string = order.landing_site || '';
  const referringSite: string = order.referring_site || '';
  let utmSource = '', utmMedium = '', utmCampaign = '';
  if (landingSite) {
    try {
      const u = new URL(landingSite.startsWith('http') ? landingSite : `https://x.com${landingSite}`);
      utmSource = u.searchParams.get('utm_source') || '';
      utmMedium = u.searchParams.get('utm_medium') || '';
      utmCampaign = u.searchParams.get('utm_campaign') || '';
    } catch {}
  }
  if (!utmSource && !utmMedium && !referringSite) return null;
  return classifyAttrib(utmSource, utmMedium, utmCampaign, referringSite);
}

const getArgentinaDateStr = (date: Date): string => {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

type LifetimeData = { counts: Record<string, number>; spent: Record<string, number> };

// Load lifetime order counts + total spent per email for TiendaNube. Cached 1 hour.
async function loadTNLifetimeCounts(storeId: string, token: string): Promise<LifetimeData> {
  const lsKey = `tn_lifetime_v2:${storeId}`;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: LifetimeData; ts: number };
      if (Date.now() - ts < 60 * 60 * 1000) return data;
    }
  } catch {}
  const counts: Record<string, number> = {};
  const spent: Record<string, number> = {};
  for (let page = 1; page <= 10; page++) {
    try {
      const params = new URLSearchParams({ per_page: '200', page: String(page) });
      const res = await fetch(`/api/shopify/tn/orders?${params.toString()}`, {
        headers: { 'x-tn-store-id': storeId, 'x-tn-token': token }
      });
      if (!res.ok) break;
      const data: any[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      for (const o of data) {
        const email = (o.customer?.email || '').toLowerCase().trim();
        if (email) {
          counts[email] = (counts[email] || 0) + 1;
          spent[email] = (spent[email] || 0) + parseFloat(o.total || '0');
        }
      }
      if (data.length < 200) break;
    } catch { break; }
  }
  const result: LifetimeData = { counts, spent };
  try { localStorage.setItem(lsKey, JSON.stringify({ data: result, ts: Date.now() })); } catch {}
  return result;
}

// Load lifetime order counts + total spent per email for WooCommerce. Cached 1 hour.
async function loadWCLifetimeCounts(baseUrl: string, ck: string, cs: string): Promise<LifetimeData> {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const lsKey = `wc_lifetime_v2:${cleanBase}`;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: LifetimeData; ts: number };
      if (Date.now() - ts < 60 * 60 * 1000) return data;
    }
  } catch {}
  const counts: Record<string, number> = {};
  const spent: Record<string, number> = {};
  for (let page = 1; page <= 10; page++) {
    try {
      const params = new URLSearchParams({ per_page: '100', page: String(page) });
      const res = await fetch(`/api/shopify/wc/orders?${params.toString()}`, {
        headers: { 'x-wc-base-url': cleanBase, 'x-wc-consumer-key': ck, 'x-wc-consumer-secret': cs }
      });
      if (!res.ok) break;
      const data: any[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      for (const o of data) {
        const email = (o.billing?.email || '').toLowerCase().trim();
        if (email) {
          counts[email] = (counts[email] || 0) + 1;
          spent[email] = (spent[email] || 0) + parseFloat(o.total || '0');
        }
      }
      if (data.length < 100) break;
    } catch { break; }
  }
  const result: LifetimeData = { counts, spent };
  try { localStorage.setItem(lsKey, JSON.stringify({ data: result, ts: Date.now() })); } catch {}
  return result;
}

// Assign sequential nth-purchase numbers to orders using lifetime counts as anchor.
// Walk oldest→newest in the range; the oldest order starts at (lifetimeCount - rangeCount + 1).
function applySequentialWithLifetime(
  orders: any[],
  lifetimeCounts: Record<string, number>,
  getEmail: (o: any) => string,
  getTime: (o: any) => number
) {
  const rangeCount: Record<string, number> = {};
  for (const o of orders) {
    const email = getEmail(o);
    if (email) rangeCount[email] = (rangeCount[email] || 0) + 1;
  }
  const startSeq: Record<string, number> = {};
  const orderSeq = new Map<any, number>();
  for (const o of [...orders].sort((a, b) => getTime(a) - getTime(b))) {
    const email = getEmail(o);
    if (!email) continue;
    if (!(email in startSeq)) {
      const lifetime = Math.max(lifetimeCounts[email] || 0, rangeCount[email]);
      startSeq[email] = Math.max(1, lifetime - rangeCount[email] + 1);
    }
    orderSeq.set(o.id ?? o, startSeq[email]++);
  }
  return orderSeq;
}

export const ecommerce = {
  getShopifyOrders: async (domain: string, token: string, since: string, until: string) => {
    const cacheKey = `orders_v2:${domain}:${since}:${until}`;
    const cached = ecGetCached(cacheKey);
    if (cached) return cached;

    try {
      const sinceIso = new Date(`${since}T00:00:00-03:00`).toISOString();
      const untilIso = new Date(`${until}T23:59:59-03:00`).toISOString();
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

      let allOrders: any[] = [];
      let nextUrl: string | null = `${BASE}/orders.json?status=any&created_at_min=${sinceIso}&created_at_max=${untilIso}&limit=250`;

      while (nextUrl) {
        const res: Response = await fetch(nextUrl, {
          headers: {
            'X-Shopify-Access-Token': token,
            'X-Shop-Domain': cleanDomain,
          }
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error('[Shopify] Error fetching orders', res.status, errorText);
          throw new Error(`Shopify API Error: ${res.status}`);
        }

        const data = await res.json();
        allOrders = allOrders.concat(data.orders ?? []);

        const linkHeader: string | null = res.headers.get('Link');
        let nextLink: string | null = null;
        if (linkHeader) {
          const links: string[] = linkHeader.split(',');
          const nextPart: string | undefined = links.find((s: string) => s.includes('rel="next"'));
          if (nextPart) {
            const match: RegExpMatchArray | null = nextPart.match(/<([^>]+)>/);
            if (match) {
              const urlObj: URL = new URL(match[1]);
              const pageInfo: string | null = urlObj.searchParams.get('page_info');
              if (pageInfo) {
                nextLink = `${BASE}/orders.json?limit=250&page_info=${pageInfo}`;
              }
            }
          }
        }
        nextUrl = nextLink;
      }

      // Fetch customer details in bulk to get real orders_count and total_spent
      const customerIds = [...new Set(
        allOrders
          .map((o: any) => o.customer?.id)
          .filter(Boolean)
      )];
      const customersMap = new Map<number, any>();
      if (customerIds.length > 0) {
        const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        for (let i = 0; i < customerIds.length; i += 50) {
          const batch = customerIds.slice(i, i + 50);
          try {
            const cRes = await fetch(`${BASE}/customers.json?ids=${batch.join(',')}`, {
              headers: {
                'X-Shopify-Access-Token': token,
                'X-Shop-Domain': cleanDomain,
              }
            });
            if (cRes.ok) {
              const cData = await cRes.json();
              for (const cust of (cData.customers || [])) {
                customersMap.set(cust.id, cust);
              }
            }
          } catch (err) {
            console.error('[Shopify] Error fetching customers info:', err);
          }
        }
      }

      // Inject real customer stats
      for (const o of allOrders) {
        if (o.customer?.id) {
          const realCust = customersMap.get(o.customer.id);
          if (realCust) {
            o.customer = {
              ...o.customer,
              orders_count: realCust.orders_count,
              total_spent: realCust.total_spent,
            };
          }
        }
      }

      // Count appearances per email in the loaded batch (floor for orders_count).
      const batchCount: Record<string, number> = {};
      for (const o of allOrders) {
        const email = (o.customer?.email || '').toLowerCase().trim();
        if (email) batchCount[email] = (batchCount[email] || 0) + 1;
      }

      // Assign sequential "Nth purchase" numbers. Walk newest→oldest.
      // Anchor each customer's most-recent order at max(API lifetime count, batch appearances),
      // then decrement for older orders. The max() handles cases where the API returns 0/null.
      const sortedDesc = [...allOrders].sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const emailSeq: Record<string, number> = {};
      for (const o of sortedDesc) {
        const email = (o.customer?.email || '').toLowerCase().trim();
        if (!email || !o.customer) continue;
        if (!(email in emailSeq)) {
          const apiCount = o.customer.orders_count || 0;
          emailSeq[email] = Math.max(apiCount, batchCount[email] || 1);
        }
        o.customer = { ...o.customer, orders_count: emailSeq[email] };
        emailSeq[email] = Math.max(1, emailSeq[email] - 1);
      }

      ecSetCache(cacheKey, allOrders);
      return allOrders;
    } catch (e) {
      console.error('[Shopify] Fetch Exception:', e);
      throw e;
    }
  },

  getShopifyRecentOrders: async (domain: string, token: string, limit: number = 20) => {
    const cacheKey = `recent_orders:${domain}:${limit}`;
    const cached = ecGetCached(cacheKey);
    if (cached) return cached;

    try {
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const url = `${BASE}/orders.json?status=any&limit=${limit}`;

      const res = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': token,
          'X-Shop-Domain': cleanDomain,
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Shopify] Error fetching recent orders', res.status, errorText);
        throw new Error(`Shopify API Error: ${res.status}`);
      }

      const data = await res.json();
      const orders = data.orders ?? [];

      // Fetch customer details in bulk
      const customerIds = [...new Set(orders.map((o: any) => o.customer?.id).filter(Boolean))];
      const customersMap = new Map<number, any>();
      if (customerIds.length > 0) {
        for (let i = 0; i < customerIds.length; i += 50) {
          const batch = customerIds.slice(i, i + 50);
          try {
            const cRes = await fetch(`${BASE}/customers.json?ids=${batch.join(',')}`, {
              headers: {
                'X-Shopify-Access-Token': token,
                'X-Shop-Domain': cleanDomain,
              }
            });
            if (cRes.ok) {
              const cData = await cRes.json();
              for (const cust of (cData.customers || [])) {
                customersMap.set(cust.id, cust);
              }
            }
          } catch (err) {
            console.error('[Shopify] Error fetching customers info:', err);
          }
        }
      }

      for (const o of orders) {
        if (o.customer?.id) {
          const realCust = customersMap.get(o.customer.id);
          if (realCust) {
            o.customer = {
              ...o.customer,
              orders_count: realCust.orders_count,
              total_spent: realCust.total_spent,
            };
          }
        }
      }

      ecSetCache(cacheKey, orders);
      return orders;
    } catch (e) {
      console.error('[Shopify] Fetch Recent Orders Exception:', e);
      throw e;
    }
  },

  // ShopifyQL not available on standard Shopify plans — always estimate from orders
  getShopifyAnalytics: async (_domain: string, _token: string, _since: string, _until: string): Promise<null> => {
    return null;
  },

  analyzeProducts: async (domain: string, token: string, forceRefresh = false): Promise<any[]> => {
    const cacheKey = `pa:${domain}`;
    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const { data, ts } = JSON.parse(raw) as { data: any[]; ts: number };
          if (Date.now() - ts < 24 * 60 * 60 * 1000) return data; // 24h TTL
        }
      } catch { /* ignore */ }
    }

    // Fetch last 2 years of orders
    const since = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const until = new Date().toISOString().split('T')[0];
    const allOrders = await ecommerce.getShopifyOrders(domain, token, since, until);

    // Build customer email → sorted orders map
    const byCustomer = new Map<string, { email: string; date: Date; id: string; items: { name: string; price: number; qty: number }[] }[]>();
    for (const o of allOrders) {
      if (o.cancelled_at) continue;
      if (!['paid', 'partially_refunded'].includes(o.financial_status)) continue;
      if (!o.line_items?.length) continue;
      const email = (o.customer?.email || o.email || o.contact_email || '').toLowerCase().trim();
      if (!email) continue;
      const date = new Date(o.created_at);
      const items = (o.line_items || []).map((it: any) => ({ name: it.title, price: parseFloat(it.price || 0), qty: it.quantity }));
      if (!byCustomer.has(email)) byCustomer.set(email, []);
      byCustomer.get(email)!.push({ email, date, id: String(o.id), items });
    }
    for (const [, list] of byCustomer) list.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Flatten to all paid orders with email
    const paidWithEmail: { email: string; date: Date; id: string; items: { name: string; price: number; qty: number }[] }[] = [];
    for (const [, list] of byCustomer) paidWithEmail.push(...list);

    const productNames = new Set<string>();
    for (const o of paidWithEmail) for (const it of o.items) if (it.name) productNames.add(it.name);

    const results: any[] = [];
    for (const pName of productNames) {
      const ordersWithP = paidWithEmail.filter(o => o.items.some(it => it.name === pName));
      if (ordersWithP.length < 2) continue;

      const firstOrdersWithP = ordersWithP.filter(o => byCustomer.get(o.email)?.[0]?.id === o.id);
      const entryPointPct = Math.round((firstOrdersWithP.length / ordersWithP.length) * 100);

      const customersFirstP = [...new Set(firstOrdersWithP.map(o => o.email))];
      const customersReturned = customersFirstP.filter(e => (byCustomer.get(e)?.length ?? 0) >= 2);
      const secondPurchasePct = customersFirstP.length > 0 ? Math.round((customersReturned.length / customersFirstP.length) * 100) : 0;

      let repurchaseDays = 0;
      if (customersReturned.length > 0) {
        const gaps = customersReturned.map(e => {
          const list = byCustomer.get(e)!;
          return (list[1].date.getTime() - list[0].date.getTime()) / 86_400_000;
        }).filter(d => d >= 0);
        if (gaps.length > 0) repurchaseDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      }

      const crossSellCounts = new Map<string, number>();
      for (const email of customersFirstP) {
        const allOrds = byCustomer.get(email) || [];
        for (let i = 1; i < allOrds.length; i++)
          for (const it of allOrds[i].items)
            if (it.name !== pName) crossSellCounts.set(it.name, (crossSellCounts.get(it.name) || 0) + 1);
      }
      const crossSell = [...crossSellCounts.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([name, count]) => ({ name, count, pct: Math.round(count / Math.max(customersFirstP.length, 1) * 100) }));

      const allItemPrices = ordersWithP.flatMap(o => o.items.filter(it => it.name === pName).map(it => it.price));
      const avgPrice = allItemPrices.length > 0 ? allItemPrices.reduce((a, b) => a + b, 0) / allItemPrices.length : 0;
      const combinedAOV = ordersWithP.reduce((s, o) => s + o.items.reduce((ss, it) => ss + it.price * it.qty, 0), 0) / Math.max(ordersWithP.length, 1);

      results.push({ name: pName, totalOrders: ordersWithP.length, firstPurchases: firstOrdersWithP.length, entryPointPct, secondPurchasePct, repurchaseDays, avgPrice, combinedAOV, crossSell });
    }

    results.sort((a, b) => b.totalOrders - a.totalOrders);
    try { localStorage.setItem(cacheKey, JSON.stringify({ data: results, ts: Date.now() })); } catch { /* storage full */ }
    return results;
  },

  getDashboardData: async (platform: string, domain: string, token: string, since: string, until: string, clientId?: string) => {
    if (clientId || platform !== 'shopify') {
      const cacheKey = `dashboard:${DASHBOARD_CACHE_VERSION}:${clientId || domain}:${since}:${until}`;
      const cached = ecGetCached(cacheKey);
      if (cached) return cached;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const freshToken = session?.access_token || '';

        const res = await fetch('/api/scrape-all', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${freshToken}`
          },
          body: JSON.stringify({
            clientId,
            type: 'dashboard',
            platform,
            since,
            until,
            shopify_domain: domain,
            shopify_access_token: token
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        ecSetCache(cacheKey, data);
        return data;
      } catch (err) {
        console.error('[ecommerce.getDashboardData] Error:', err);
        throw err;
      }
    }

    const cacheKey = `dashboard:${DASHBOARD_CACHE_VERSION}:${domain}:${since}:${until}`;
    const cached = ecGetCached(cacheKey);
    if (cached) return cached;

    // Fetch orders (analytics endpoint is always null on standard plans — skip it)
    const orders = await ecommerce.getShopifyOrders(domain, token, since, until);

    if (!orders) return null;

    // Fetch the 40 most recent orders of all time (no date filter)
    const rawRecent = await ecommerce.getShopifyRecentOrders(domain, token, 40).catch(() => []);

    const validOrders = orders.filter((o: any) => !o.cancelled_at && o.financial_status !== 'voided');

    const totalRevenue = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price || 0), 0);
    const ordersCount = validOrders.length;
    const aov = ordersCount > 0 ? totalRevenue / ordersCount : 0;
    const totalDiscounts = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_discounts || 0), 0);

    const dailyData: Record<string, { revenue: number; orders: number }> = {};
    const productStats: Record<string, { title: string; quantity: number; revenue: number }> = {};
    const variantStats: Record<string, number> = {};
    let returningCustomers = 0;
    let newCustomers = 0;
    let fulfilledOrders = 0;
    let unfulfilledOrders = 0;

    const start = new Date(`${since}T00:00:00-03:00`);
    const end = new Date(`${until}T23:59:59-03:00`);
    const limit = 400;
    let currentMs = start.getTime();
    let iter = 0;
    while (currentMs <= end.getTime() && iter++ < limit) {
      const d = new Date(currentMs);
      dailyData[getArgentinaDateStr(d)] = { revenue: 0, orders: 0 };
      currentMs += 24 * 60 * 60 * 1000;
    }

    validOrders.forEach((o: any) => {
      const date = getArgentinaDateStr(new Date(o.created_at));
      if (!date) return;
      if (dailyData[date]) {
        dailyData[date].revenue += parseFloat(o.total_price || 0);
        dailyData[date].orders += 1;
      }

      if (o.customer) {
        if (o.customer.orders_count > 1) returningCustomers++;
        else newCustomers++;
      } else {
        newCustomers++;
      }

      if (o.fulfillment_status === 'fulfilled') fulfilledOrders++;
      else unfulfilledOrders++;

      if (o.line_items) {
        o.line_items.forEach((item: any) => {
          const id = item.product_id || item.variant_id || item.title;
          if (!productStats[id]) {
            productStats[id] = { title: item.title, quantity: 0, revenue: 0 };
          }
          productStats[id].quantity += item.quantity;
          productStats[id].revenue += parseFloat(item.price || 0) * item.quantity;

          if (item.variant_id) {
            const vId = String(item.variant_id);
            variantStats[vId] = (variantStats[vId] || 0) + item.quantity;
          }
        });
      }
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 7);

    // Estimate sessions from orders (ShopifyQL not available on standard plans)
    const BASE_CONV_RATE = 2.56;
    const totalSessions = ordersCount > 0 ? Math.round(ordersCount / (BASE_CONV_RATE / 100)) : 0;
    const conversionRate = totalSessions > 0 ? parseFloat(((ordersCount / totalSessions) * 100).toFixed(2)) : 0;

    // Build daily data — distribute real sessions proportionally by order volume if analytics available
    const dailySorted = Object.keys(dailyData).sort();
    const totalOrdersForDistribution = ordersCount || 1;

    const daily = dailySorted.map(date => {
      const dOrders = dailyData[date].orders;
      const dSessions = dOrders > 0 ? Math.round(dOrders / (BASE_CONV_RATE / 100)) : 0;
      const dConvRate = dSessions > 0 ? parseFloat(((dOrders / dSessions) * 100).toFixed(2)) : 0;
      return {
        date,
        revenue: dailyData[date].revenue,
        orders: dOrders,
        sessions: dSessions,
        conversionRate: dConvRate,
        aov: dOrders > 0 ? dailyData[date].revenue / dOrders : 0
      };
    });

    const validRecent = rawRecent.filter((o: any) => !o.cancelled_at && o.financial_status !== 'voided');
    const recentOrders = validRecent
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map((o: any) => ({
        id: o.id,
        order_number: o.order_number || o.name,
        created_at: o.created_at,
        total_price: parseFloat(o.total_price || 0),
        financial_status: o.financial_status,
        fulfillment_status: o.fulfillment_status || 'unfulfilled',
        customer_name: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : 'Sin Cliente',
        line_items_count: o.line_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0,
        line_items: o.line_items?.map((item: any) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          title: item.title,
          quantity: item.quantity,
          price: parseFloat(item.price || 0),
          variant_title: item.variant_title,
        })) || [],
        shipping_address: o.shipping_address || null,
        billing_address: o.billing_address || null,
        customer: o.customer ? {
          first_name: o.customer.first_name,
          last_name: o.customer.last_name,
          email: o.customer.email,
          phone: o.customer.phone,
          orders_count: o.customer.orders_count,
          total_spent: parseFloat(o.customer.total_spent || 0),
        } : null,
        email: o.email || o.contact_email || null,
        phone: o.phone || null,
        subtotal_price: parseFloat(o.subtotal_price || 0),
        total_tax: parseFloat(o.total_tax || 0),
        total_discounts: parseFloat(o.total_discounts || 0),
        discount_codes: o.discount_codes?.map((dc: any) => ({
          code: dc.code,
          amount: parseFloat(dc.amount || 0),
        })) || [],
        shipping_lines: o.shipping_lines?.map((sl: any) => ({
          title: sl.title,
          price: parseFloat(sl.price || 0),
        })) || [],
      }));

    const result = {
      revenue: totalRevenue,
      orders: ordersCount,
      aov,
      sessions: totalSessions,
      conversionRate,
      totalDiscounts,
      customerSplit: {
        returning: returningCustomers,
        new: newCustomers,
        returningRate: ordersCount > 0 ? (returningCustomers / ordersCount) * 100 : 0
      },
      fulfillmentSplit: {
        fulfilled: fulfilledOrders,
        unfulfilled: unfulfilledOrders
      },
      topProducts,
      daily,
      recentOrders,
      variantOrders: variantStats,
    };

    ecSetCache(cacheKey, result);
    return result;
  },

  getUnfulfilledCount: async (domain: string, token: string): Promise<number> => {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const res = await fetch(
        `${BASE}/orders.json?status=any&fulfillment_status=unfulfilled&limit=250&created_at_min=${since}`,
        { headers: { 'X-Shopify-Access-Token': token, 'X-Shop-Domain': cleanDomain } }
      );
      if (!res.ok) return 0;
      const data = await res.json();
      return (data.orders ?? []).filter((o: any) => !o.cancelled_at && o.financial_status !== 'voided').length;
    } catch {
      return 0;
    }
  },

  getWooUnfulfilledCount: async (baseUrl: string, ck: string, cs: string): Promise<number> => {
    const hdrs = { 'x-wc-base-url': baseUrl.replace(/\/$/, ''), 'x-wc-consumer-key': ck, 'x-wc-consumer-secret': cs };
    const getCount = async (status: string): Promise<number> => {
      const res = await fetch(`/api/shopify/wc/orders?status=${status}&per_page=100`, { headers: hdrs });
      if (!res.ok) return 0;
      const headerTotal = parseInt(res.headers.get('X-WP-Total') || '0', 10);
      if (headerTotal > 0) return headerTotal;
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data.length : 0;
    };
    try {
      const [processing, onHold] = await Promise.all([
        getCount('processing'),
        getCount('on-hold'),
      ]);
      return processing + onHold;
    } catch { return 0; }
  },

  getTiendaNubeUnfulfilledCount: async (storeId: string, token: string): Promise<number> => {
    try {
      const params = new URLSearchParams({ payment_status: 'paid', per_page: '200', page: '1' });
      const res = await fetch(`/api/shopify/tn/orders?${params}`, {
        headers: { 'x-tn-store-id': storeId, 'x-tn-token': token },
      });
      if (!res.ok) return 0;
      const data = await res.json();
      if (!Array.isArray(data)) return 0;
      return data.filter((o: any) => o.shipping_status !== 'shipped' && o.shipping_status !== 'delivered').length;
    } catch { return 0; }
  },

  getTiendaNubeOrders: async (storeId: string, token: string, since: string, until: string): Promise<any[]> => {
    const cacheKey = `tn_orders_v2:${storeId}:${since}:${until}`;
    const cached = ecGetCached(cacheKey);
    if (cached) return cached;

    const sinceIso = new Date(`${since}T00:00:00-03:00`).toISOString();
    const untilIso = new Date(`${until}T23:59:59-03:00`).toISOString();

    const tnStatusToFulfillment = (s: string): string | null => {
      if (s === 'shipped' || s === 'delivered') return 'fulfilled';
      return null;
    };

    // Start lifetime counts fetch in parallel with date-range pagination
    const lifetimeCountsPromise = loadTNLifetimeCounts(storeId, token);

    let allOrders: any[] = [];
    let page = 1;
    while (page <= 15) {
      const params = new URLSearchParams({ created_at_min: sinceIso, created_at_max: untilIso, per_page: '200', page: String(page) });
      const res = await fetch(`/api/shopify/tn/orders?${params.toString()}`, {
        headers: { 'x-tn-store-id': storeId, 'x-tn-token': token },
      });
      if (!res.ok) {
        if (res.status === 404) break;
        throw new Error(`Tiendanube API Error: ${res.status}`);
      }
      const data: any[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      allOrders = allOrders.concat(data);
      if (data.length < 200) break;
      page++;
    }

    const { counts: lifetimeCounts, spent: lifetimeSpent } = await lifetimeCountsPromise;
    const tnOrderSeq = applySequentialWithLifetime(
      allOrders,
      lifetimeCounts,
      (o: any) => (o.customer?.email || '').toLowerCase().trim(),
      (o: any) => new Date(o.created_at).getTime()
    );

    const normalized = allOrders.map((o: any) => {
      const isCancelled = o.status === 'cancelled';
      const payStatus = o.payment_status;
      const financial_status = payStatus === 'paid' ? 'paid' : payStatus === 'refunded' ? 'refunded' : payStatus === 'voided' ? 'voided' : 'pending';
      const email = (o.customer?.email || '').toLowerCase().trim();
      return {
        id: o.id,
        order_number: o.number,
        name: `#${o.number}`,
        created_at: o.created_at,
        cancelled_at: isCancelled ? (o.updated_at || new Date().toISOString()) : null,
        financial_status,
        fulfillment_status: tnStatusToFulfillment(o.shipping_status || ''),
        total_price: String(o.total || '0'),
        subtotal_price: String(o.subtotal || '0'),
        total_tax: String(o.tax || '0'),
        total_discounts: String(o.discount || '0'),
        shipping_lines: o.shipping_cost_owner ? [{ title: 'Envío', price: String(o.shipping_cost_owner) }] : [],
        discount_codes: o.promotional_discount?.code ? [{ code: o.promotional_discount.code }] : [],
        customer: o.customer ? {
          first_name: (o.customer.name || '').split(' ')[0] || '',
          last_name: (o.customer.name || '').split(' ').slice(1).join(' ') || '',
          email: o.customer.email || '',
          phone: o.customer.phone || '',
          orders_count: tnOrderSeq.get(o.id) || 1,
          total_spent: String((lifetimeSpent[email] || 0).toFixed(2)),
        } : null,
        shipping_address: o.shipping_address ? {
          address1: o.shipping_address.address,
          city: o.shipping_address.city,
          province: o.shipping_address.province,
          country: o.shipping_address.country,
        } : null,
        line_items: (o.products || []).map((it: any) => ({
          product_id: it.product_id,
          title: it.name,
          variant_title: it.variant_values ? it.variant_values.map((vv: any) => vv.es || vv.en || Object.values(vv || {})[0] || '').filter(Boolean).join(' / ') : null,
          quantity: it.quantity,
          price: String(it.price || 0),
          _wc_image: it.image?.src || null,
        })),
        _attribution: (() => {
          const src: string = o.utm_source || '';
          const med: string = o.utm_medium || '';
          const campaign: string = o.utm_campaign || '';
          if (!src && !med) return null;
          return classifyAttrib(src, med, campaign, '');
        })(),
      };
    });

    ecSetCache(cacheKey, normalized);
    return normalized;
  },

  getWooCommerceOrders: async (baseUrl: string, ck: string, cs: string, since: string, until: string): Promise<any[]> => {
    const cacheKey = `wc_orders_v2:${baseUrl}:${since}:${until}`;
    const cached = ecGetCached(cacheKey);
    if (cached) return cached;

    const after = new Date(`${since}T00:00:00-03:00`).toISOString();
    const before = new Date(`${until}T23:59:59-03:00`).toISOString();

    const wcStatusToFinancial = (status: string): string => {
      if (['processing', 'completed', 'on-hold'].includes(status)) return 'paid';
      if (status === 'pending') return 'pending';
      if (status === 'refunded') return 'refunded';
      return 'voided'; // cancelled, failed
    };
    const wcStatusToFulfillment = (status: string): string | null => {
      if (status === 'completed') return 'fulfilled';
      if (['refunded', 'cancelled'].includes(status)) return 'restocked';
      return null; // unfulfilled
    };

    // Start lifetime counts fetch in parallel with date-range pagination
    const wcLifetimePromise = loadWCLifetimeCounts(baseUrl, ck, cs);

    let allOrders: any[] = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const params = new URLSearchParams({ after, before, per_page: '100', page: String(page), orderby: 'date', order: 'desc' });
      const res = await fetch(`/api/shopify/wc/orders?${params.toString()}`, {
        headers: {
          'x-wc-base-url': baseUrl,
          'x-wc-consumer-key': ck,
          'x-wc-consumer-secret': cs,
        },
      });
      if (!res.ok) throw new Error(`WooCommerce API Error: ${res.status}`);
      if (page === 1) totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1', 10);
      const data: any[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      allOrders = allOrders.concat(data);
      page++;
    }

    const { counts: wcLifetimeCounts, spent: wcLifetimeSpent } = await wcLifetimePromise;
    const wcOrderSeq = applySequentialWithLifetime(
      allOrders,
      wcLifetimeCounts,
      (o: any) => (o.billing?.email || '').toLowerCase().trim(),
      (o: any) => o.date_created_gmt ? new Date(`${o.date_created_gmt}Z`).getTime() : new Date(o.date_created).getTime()
    );

    // Normalize to Shopify-like shape
    const normalized = allOrders.map((o: any) => {
      const email = (o.billing?.email || '').toLowerCase().trim();
      return {
      id: o.id,
      order_number: o.number,
      name: `#${o.number}`,
      created_at: o.date_created_gmt ? `${o.date_created_gmt}Z` : o.date_created,
      financial_status: wcStatusToFinancial(o.status),
      fulfillment_status: wcStatusToFulfillment(o.status),
      total_price: o.total,
      subtotal_price: o.subtotal || String(parseFloat(o.total || '0') - parseFloat(o.total_tax || '0') - parseFloat(o.shipping_total || '0')),
      total_tax: o.total_tax,
      total_discounts: o.discount_total,
      cancelled_at: o.status === 'cancelled' ? o.date_modified : null,
      shipping_lines: (o.shipping_lines || []).map((sl: any) => ({ title: sl.method_title || 'Envío', price: sl.total || '0' })),
      discount_codes: (o.coupon_lines || []).map((c: any) => ({ code: c.code })),
      customer: {
        first_name: o.billing?.first_name || '',
        last_name: o.billing?.last_name || '',
        email: o.billing?.email || '',
        phone: o.billing?.phone || '',
        orders_count: wcOrderSeq.get(o.id) || 1,
        total_spent: String((wcLifetimeSpent[email] || 0).toFixed(2)),
      },
      shipping_address: o.shipping?.address_1 ? {
        address1: o.shipping.address_1,
        city: o.shipping.city,
        province: o.shipping.state,
        country: o.shipping.country,
      } : null,
      line_items: (o.line_items || []).map((item: any) => ({
        product_id: item.product_id,
        title: item.name,
        variant_title: item.variation_id ? null : null,
        quantity: item.quantity,
        price: String(item.price || 0),
        _wc_image: item.image?.src || null,
      })),
      _attribution: (() => {
        const gm = (key: string): string => ((o.meta_data || []) as any[]).find((m: any) => m.key === key)?.value || '';
        const src = gm('_wc_order_attribution_utm_source') || gm('_wc_order_attribution_referring_domain');
        const med = gm('_wc_order_attribution_utm_medium');
        const campaign = gm('_wc_order_attribution_utm_campaign');
        const srcType = gm('_wc_order_attribution_source_type');
        if (!src && !med && !srcType) return null;
        if (srcType === 'typein') return { source: 'direct', label: 'Sin publicidad' } as OrderAttribution;
        return classifyAttrib(src, med, campaign, '');
      })(),
    }; });

    ecSetCache(cacheKey, normalized);
    return normalized;
  },

  getProducts: async (domain: string, token: string): Promise<any[]> => {
    const cacheKey = `products:${domain}`;
    const cached = ecGetCached(cacheKey);
    if (cached) return cached;

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    let allProducts: any[] = [];
    let nextUrl: string | null = `${BASE}/products.json?fields=id,title,image,variants&limit=250`;

    while (nextUrl) {
      const res: Response = await fetch(nextUrl, {
        headers: { 'X-Shopify-Access-Token': token, 'X-Shop-Domain': cleanDomain }
      });
      if (!res.ok) throw new Error(`Shopify API Error: ${res.status}`);
      const data = await res.json();
      allProducts = allProducts.concat(data.products ?? []);
      const link: string | null = res.headers.get('Link');
      nextUrl = null;
      if (link) {
        const nextPart: string | undefined = link.split(',').find((s: string) => s.includes('rel="next"'));
        if (nextPart) {
          const match: RegExpMatchArray | null = nextPart.match(/<([^>]+)>/);
          if (match) nextUrl = match[1];
        }
      }
    }

    ecSetCache(cacheKey, allProducts);
    return allProducts;
  },

  getWooCommerceProducts: async (baseUrl: string, ck: string, cs: string): Promise<any[]> => {
    const cacheKey = `wc_products:${baseUrl}`;
    const cached = ecGetCached(cacheKey);
    if (cached) return cached;

    let allProducts: any[] = [];
    let page = 1;
    let totalPages = 1;
    
    try {
      while (page <= totalPages && page <= 5) {
        const params = new URLSearchParams({ per_page: '100', page: String(page), status: 'publish' });
        const res = await fetch(`/api/shopify/wc/products?${params.toString()}`, {
          headers: {
            'x-wc-base-url': baseUrl,
            'x-wc-consumer-key': ck,
            'x-wc-consumer-secret': cs,
          },
        });
        if (!res.ok) throw new Error(`WooCommerce Products API Error: ${res.status}`);
        if (page === 1) {
          totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1', 10);
        }
        const data: any[] = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        allProducts = allProducts.concat(data);
        page++;
      }
    } catch (e) {
      console.error("Error fetching WooCommerce products:", e);
    }

    ecSetCache(cacheKey, allProducts);
    return allProducts;
  },

  getTiendaNubeProducts: async (storeId: string, token: string): Promise<any[]> => {
    const cacheKey = `tn_products:${storeId}`;
    const cached = ecGetCached(cacheKey);
    if (cached) return cached;

    let allProducts: any[] = [];
    try {
      for (let page = 1; page <= 5; page++) {
        const res = await fetch(`/api/shopify/tn/products?per_page=200&page=${page}`, {
          headers: {
            'x-tn-store-id': storeId,
            'x-tn-token': token,
          },
        });
        if (!res.ok) break;
        const data: any[] = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        allProducts = allProducts.concat(data);
      }
    } catch (e) {
      console.error("Error fetching Tiendanube products:", e);
    }

    ecSetCache(cacheKey, allProducts);
    return allProducts;
  }
};
