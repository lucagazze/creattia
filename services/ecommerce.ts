const BASE = '/api/shopify';

export const ecommerce = {
  getShopifyOrders: async (domain: string, token: string, since: string, until: string) => {
    try {
      const sinceIso = new Date(`${since}T00:00:00Z`).toISOString();
      const untilIso = new Date(`${until}T23:59:59Z`).toISOString();
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

      return allOrders;
    } catch (e) {
      console.error('[Shopify] Fetch Exception:', e);
      throw e;
    }
  },

  // ShopifyQL not available on standard Shopify plans — always estimate from orders
  getShopifyAnalytics: async (_domain: string, _token: string, _since: string, _until: string): Promise<null> => {
    return null;
  },

  getDashboardData: async (platform: string, domain: string, token: string, since: string, until: string) => {
    if (platform !== 'shopify') return null;

    // Fetch orders and analytics in parallel
    const [orders, analyticsData] = await Promise.all([
      ecommerce.getShopifyOrders(domain, token, since, until),
      ecommerce.getShopifyAnalytics(domain, token, since, until),
    ]);

    if (!orders) return null;

    const validOrders = orders.filter((o: any) => !o.cancelled_at && o.financial_status !== 'voided');

    const totalRevenue = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price || 0), 0);
    const ordersCount = validOrders.length;
    const aov = ordersCount > 0 ? totalRevenue / ordersCount : 0;
    const totalDiscounts = validOrders.reduce((sum: number, o: any) => sum + parseFloat(o.total_discounts || 0), 0);

    const dailyData: Record<string, { revenue: number; orders: number }> = {};
    const productStats: Record<string, { title: string; quantity: number; revenue: number }> = {};
    let returningCustomers = 0;
    let newCustomers = 0;
    let fulfilledOrders = 0;
    let unfulfilledOrders = 0;

    const start = new Date(`${since}T00:00:00`);
    const end = new Date(`${until}T23:59:59`);
    for (let d = new Date(start), limit = 0; d <= end && limit++ < 400; d.setDate(d.getDate() + 1)) {
      dailyData[d.toISOString().split('T')[0]] = { revenue: 0, orders: 0 };
    }

    validOrders.forEach((o: any) => {
      const date = o.created_at?.split('T')[0];
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
        });
      }
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Use real analytics data if available, otherwise estimate
    const BASE_CONV_RATE = 2.56;
    const totalSessions = analyticsData?.totalSessions 
      ? analyticsData.totalSessions 
      : (ordersCount > 0 ? Math.round(ordersCount / (BASE_CONV_RATE / 100)) : 0);
    const conversionRate = analyticsData?.conversionRate 
      ? analyticsData.conversionRate
      : (totalSessions > 0 ? parseFloat(((ordersCount / totalSessions) * 100).toFixed(2)) : 0);

    // Build daily data — distribute real sessions proportionally by order volume if analytics available
    const dailySorted = Object.keys(dailyData).sort();
    const totalOrdersForDistribution = ordersCount || 1;

    const daily = dailySorted.map(date => {
      const dOrders = dailyData[date].orders;
      // Use real per-day sessions if available from ShopifyQL
      const dSessions = analyticsData?.dailySessions?.[date] != null
        ? analyticsData.dailySessions[date]
        : (dOrders > 0 ? Math.round(dOrders / (BASE_CONV_RATE / 100)) : 0);
      // Use real per-day conversion rate if available, else derive from sessions/orders
      const dConvRate = analyticsData?.dailyConvRate?.[date] != null
        ? analyticsData.dailyConvRate[date]
        : (dSessions > 0 ? parseFloat(((dOrders / dSessions) * 100).toFixed(2)) : 0);
      return {
        date,
        revenue: dailyData[date].revenue,
        orders: dOrders,
        sessions: dSessions,
        conversionRate: dConvRate,
        aov: dOrders > 0 ? dailyData[date].revenue / dOrders : 0
      };
    });

    return {
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
    };
  }
};
