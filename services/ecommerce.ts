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
        const res = await fetch(nextUrl, {
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

        const linkHeader = res.headers.get('Link');
        let nextLink = null;
        if (linkHeader) {
          const links = linkHeader.split(',');
          const nextPart = links.find(s => s.includes('rel="next"'));
          if (nextPart) {
            const match = nextPart.match(/<([^>]+)>/);
            if (match) {
              const urlObj = new URL(match[1]);
              const pageInfo = urlObj.searchParams.get('page_info');
              if (pageInfo) {
                nextLink = `${BASE}/orders.json?limit=250&page_info=${pageInfo}`;
              }
            }
          }
        }
        nextUrl = nextLink;
      }

      console.log(`[Shopify] Fetched total ${allOrders.length} orders from ${cleanDomain}`);
      return allOrders;
    } catch (e) {
      console.error('[Shopify] Fetch Exception:', e);
      throw e;
    }
  },

  // Fetches real sessions & conversion from Shopify ShopifyQL (GraphQL Analytics)
  getShopifyAnalytics: async (domain: string, token: string, since: string, until: string): Promise<{ totalSessions: number; conversionRate: number; dailySessions: Record<string, number>; dailyConvRate: Record<string, number> } | null> => {
    try {
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      
      // ShopifyQL query for sessions and conversion rate, grouped by day
      const shopifyqlQuery = `FROM sessions SHOW sessions, conversion_rate SINCE ${since} UNTIL ${until} ORDER BY day`;
      
      const gqlQuery = `{
        shopifyqlQuery(query: "${shopifyqlQuery}") {
          __typename
          ... on TableResponse {
            tableData {
              columns { name }
              unformattedData { rowData }
            }
          }
          ... on ParseError {
            parseErrors { message code }
          }
        }
      }`;

      const res = await fetch(`${BASE}/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'X-Shop-Domain': cleanDomain,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: gqlQuery }),
      });

      if (!res.ok) {
        console.warn('[Shopify ShopifyQL] HTTP error', res.status, '— falling back to estimation');
        return null;
      }

      const json = await res.json();
      const qlResult = json?.data?.shopifyqlQuery;

      if (!qlResult || qlResult.__typename !== 'TableResponse') {
        const parseErrors = qlResult?.parseErrors;
        if (parseErrors) console.warn('[Shopify ShopifyQL] ParseErrors:', parseErrors);
        else console.warn('[Shopify ShopifyQL] Unexpected response:', JSON.stringify(json).slice(0, 300));
        return null;
      }

      const { columns, unformattedData } = qlResult.tableData;
      const colNames: string[] = columns.map((c: any) => c.name);
      const dayIdx = colNames.findIndex(c => c === 'day');
      const sessIdx = colNames.findIndex(c => c === 'sessions');
      const convIdx = colNames.findIndex(c => c === 'conversion_rate');

      let totalSessions = 0;
      let totalConvWeighted = 0;
      const dailySessions: Record<string, number> = {};
      const dailyConvRate: Record<string, number> = {};

      for (const row of unformattedData.rowData) {
        const dayVal = dayIdx >= 0 ? row[dayIdx] : null;
        const sessVal = sessIdx >= 0 ? parseFloat(row[sessIdx]) || 0 : 0;
        const convVal = convIdx >= 0 ? parseFloat(row[convIdx]) || 0 : 0;
        
        totalSessions += sessVal;
        totalConvWeighted += convVal * sessVal; // weighted average

        if (dayVal) {
          const dateKey = String(dayVal).split('T')[0];
          dailySessions[dateKey] = (dailySessions[dateKey] || 0) + sessVal;
          dailyConvRate[dateKey] = convVal;
        }
      }

      const conversionRate = totalSessions > 0 ? parseFloat((totalConvWeighted / totalSessions).toFixed(2)) : 0;
      
      console.log(`[Shopify ShopifyQL] Sessions: ${totalSessions}, ConvRate: ${conversionRate}%`);
      return { totalSessions, conversionRate, dailySessions, dailyConvRate };
    } catch (e) {
      console.warn('[Shopify ShopifyQL] Exception, falling back to estimation:', e);
      return null;
    }
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
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dailyData[d.toISOString().split('T')[0]] = { revenue: 0, orders: 0 };
    }

    validOrders.forEach((o: any) => {
      const date = o.created_at.split('T')[0];
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
