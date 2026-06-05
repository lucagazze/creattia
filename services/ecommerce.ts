// ─── sessionStorage result cache — survives page refreshes, cleared on tab close ───
const EC_PREFIX = 'ec:';
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

const getArgentinaDateStr = (date: Date): string => {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

export const ecommerce = {
  getShopifyOrders: async (domain: string, token: string, since: string, until: string) => {
    const cacheKey = `orders:${domain}:${since}:${until}`;
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
      const cacheKey = `dashboard:${clientId || domain}:${since}:${until}`;
      const cached = ecGetCached(cacheKey);
      if (cached) return cached;

      try {
        const res = await fetch('/api/scrape-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

    const cacheKey = `dashboard:${domain}:${since}:${until}`;
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
  }
};
