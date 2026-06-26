import type { ClientProfile } from '../services/db';

export const DEMO_EMAIL = 'demo@car.app';
export const DEMO_SHOP_DOMAIN = 'demo-car-store.myshopify.com';
export const DEMO_SHOP_TOKEN = 'demo-shop-token';
export const DEMO_META_ACCOUNT_ID = 'act_demo_car';
export const DEMO_KLAVIYO_KEY = 'demo-klaviyo-key';
export const DEMO_FB_PAGE_ID = 'demo_fb_page';
export const DEMO_IG_ID = 'demo_ig_business';

export const isDemoEmail = (email?: string | null) => String(email || '').trim().toLowerCase() === DEMO_EMAIL;
export const isDemoShop = (domain?: string | null, token?: string | null) =>
  String(domain || '').includes(DEMO_SHOP_DOMAIN) || String(token || '') === DEMO_SHOP_TOKEN;
export const isDemoMetaAccount = (accountId?: string | null) =>
  String(accountId || '') === DEMO_META_ACCOUNT_ID || String(accountId || '').startsWith('act_demo');
export const isDemoKlaviyoKey = (apiKey?: string | null) => String(apiKey || '') === DEMO_KLAVIYO_KEY;
export const isDemoProfile = (profile?: Partial<ClientProfile> | null) =>
  Boolean(profile && (isDemoShop(profile.shopify_domain, profile.shopify_access_token) || isDemoMetaAccount(profile.meta_account_id)));

export const withDemoProfileDefaults = (profile: ClientProfile | null, email?: string, userId?: string): ClientProfile | null => {
  if (!isDemoEmail(email) && !isDemoProfile(profile)) return profile;
  const now = new Date().toISOString();
  return {
    id: profile?.id || 'demo-car-client',
    user_id: profile?.user_id || userId || 'demo-user',
    business_name: 'Demo CAR Store',
    industry: 'Ecommerce',
    plan: 'demo',
    active: true,
    ecommerce_platform: 'shopify',
    shopify_domain: DEMO_SHOP_DOMAIN,
    shopify_access_token: DEMO_SHOP_TOKEN,
    meta_account_id: DEMO_META_ACCOUNT_ID,
    klaviyo_api_key: DEMO_KLAVIYO_KEY,
    fb_page_id: DEMO_FB_PAGE_ID,
    fb_page_name: 'Demo CAR Store',
    fb_page_access_token: 'demo-page-token',
    ig_business_id: DEMO_IG_ID,
    ig_username: 'demo.car.store',
    website_url: 'https://demo.algoritmiadesarrollos.com.ar',
    business_description: 'Cuenta de demostracion con datos simulados para presentar todas las metricas de C.A.R.',
    client_tags: ['tienda_online', 'meta_ads', 'email_marketing', 'demo'],
    connection_statuses: {
      ecommerce: 'connected',
      meta: 'connected',
      facebook: 'connected',
      instagram: 'connected',
      klaviyo: 'connected',
    },
    created_at: profile?.created_at || now,
    ...profile,
  };
};

const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

export const formatDemoDate = (date: Date): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const parseRange = (since: string, until: string) => {
  const start = new Date(`${since}T12:00:00-03:00`);
  const end = new Date(`${until || since}T12:00:00-03:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  return { start, days };
};

export const demoProducts = [
  {
    id: 9101,
    title: 'Kit Rutina Glow',
    image: { src: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=600&q=80' },
    variants: [
      { id: 19101, title: 'Completo', price: '84900', inventory_quantity: 42, sku: 'DEMO-GLOW-KIT' },
      { id: 19102, title: 'Mini', price: '54900', inventory_quantity: 18, sku: 'DEMO-GLOW-MINI' },
    ],
  },
  {
    id: 9102,
    title: 'Serum Vitamina C',
    image: { src: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=600&q=80' },
    variants: [
      { id: 19103, title: '30 ml', price: '32900', inventory_quantity: 67, sku: 'DEMO-SERUM-C' },
      { id: 19104, title: '50 ml', price: '44900', inventory_quantity: 9, sku: 'DEMO-SERUM-C50' },
    ],
  },
  {
    id: 9103,
    title: 'Protector Solar SPF50',
    image: { src: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=600&q=80' },
    variants: [
      { id: 19105, title: 'Tono claro', price: '38900', inventory_quantity: 31, sku: 'DEMO-SPF-CLARO' },
      { id: 19106, title: 'Sin color', price: '36900', inventory_quantity: 0, sku: 'DEMO-SPF-SIN' },
    ],
  },
  {
    id: 9104,
    title: 'Limpiador Gel Balance',
    image: { src: 'https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?auto=format&fit=crop&w=600&q=80' },
    variants: [{ id: 19107, title: '200 ml', price: '24900', inventory_quantity: 55, sku: 'DEMO-GEL' }],
  },
  {
    id: 9105,
    title: 'Crema Reparadora Noche',
    image: { src: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=600&q=80' },
    variants: [{ id: 19108, title: '50 g', price: '42900', inventory_quantity: 14, sku: 'DEMO-NIGHT' }],
  },
  {
    id: 9106,
    title: 'Toner Hidratante',
    image: { src: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=600&q=80' },
    variants: [{ id: 19109, title: '150 ml', price: '28900', inventory_quantity: 4, sku: 'DEMO-TONER' }],
  },
];

const customers = [
  ['Sofia', 'Martinez', 'sofia.demo@example.com'],
  ['Camila', 'Rios', 'camila.demo@example.com'],
  ['Valentina', 'Lopez', 'valen.demo@example.com'],
  ['Martina', 'Silva', 'martina.demo@example.com'],
  ['Lucia', 'Costa', 'lucia.demo@example.com'],
  ['Paula', 'Fernandez', 'paula.demo@example.com'],
  ['Florencia', 'Paz', 'flor.demo@example.com'],
  ['Agustina', 'Mora', 'agus.demo@example.com'],
];

export const getDemoOrders = (since: string, until: string) => {
  const { start, days } = parseRange(since, until);
  const orders: any[] = [];
  let id = 70000;
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const orderCount = 2 + ((i * 7) % 5);
    for (let j = 0; j < orderCount; j++) {
      const product = demoProducts[(i + j) % demoProducts.length];
      const variant = product.variants[(i + j) % product.variants.length];
      const [first, last, email] = customers[(i + j) % customers.length];
      const quantity = 1 + ((i + j) % 2);
      const price = Number(variant.price);
      const discount = (i + j) % 6 === 0 ? Math.round(price * 0.08) : 0;
      const shipping = (i + j) % 3 === 0 ? 0 : 1900;
      const total = price * quantity - discount + shipping;
      const created = new Date(day);
      created.setHours(10 + (j * 2) % 9, 15 + j, 0, 0);
      id++;
      orders.push({
        id,
        name: `#D${id}`,
        order_number: `D${id}`,
        created_at: created.toISOString(),
        financial_status: j % 13 === 0 ? 'pending' : 'paid',
        fulfillment_status: j % 4 === 0 ? null : 'fulfilled',
        total_price: String(total),
        subtotal_price: String(price * quantity),
        total_tax: '0',
        total_discounts: String(discount),
        discount_codes: discount ? [{ code: 'DEMO10', amount: String(discount) }] : [],
        shipping_lines: [{ title: shipping ? 'Envio demo' : 'Envio gratis', price: String(shipping) }],
        customer: { first_name: first, last_name: last, email, phone: '+54 11 5555 0000', orders_count: 1 + ((i + j) % 5), total_spent: String(total * (1 + ((i + j) % 5))) },
        email,
        line_items: [{
          product_id: product.id,
          variant_id: variant.id,
          title: product.title,
          variant_title: variant.title,
          quantity,
          price: String(price),
        }],
        _attribution: (i + j) % 4 === 0 ? { source: 'email', label: 'Email Marketing' } : (i + j) % 3 === 0 ? { source: 'organic', label: 'SEO Organico' } : { source: 'meta_ads', label: 'Meta Ads', detail: 'Demo Prospecting' },
      });
    }
  }
  return orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const getDemoStoreDashboard = (since: string, until: string) => {
  const { start, days } = parseRange(since, until);
  const orders = getDemoOrders(since, until);
  const validOrders = orders.filter(o => o.financial_status === 'paid');
  const revenue = validOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
  const daily = Array.from({ length: days }, (_, i) => {
    const date = formatDemoDate(addDays(start, i));
    const dayOrders = validOrders.filter(o => formatDemoDate(new Date(o.created_at)) === date);
    const dayRevenue = dayOrders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
    const sessions = Math.round(dayOrders.length / 0.026) + ((i * 19) % 45);
    return { date, revenue: dayRevenue, orders: dayOrders.length, sessions, conversionRate: sessions ? Number(((dayOrders.length / sessions) * 100).toFixed(2)) : 0, aov: dayOrders.length ? dayRevenue / dayOrders.length : 0 };
  });
  const productStats: Record<string, { title: string; quantity: number; revenue: number }> = {};
  const variantOrders: Record<string, number> = {};
  validOrders.forEach(o => (o.line_items || []).forEach((it: any) => {
    const key = String(it.product_id || it.title);
    productStats[key] ||= { title: it.title, quantity: 0, revenue: 0 };
    productStats[key].quantity += Number(it.quantity || 0);
    productStats[key].revenue += Number(it.price || 0) * Number(it.quantity || 0);
    variantOrders[String(it.variant_id)] = (variantOrders[String(it.variant_id)] || 0) + Number(it.quantity || 0);
  }));
  const recentOrders = validOrders.slice(0, 20).map(o => ({
    ...o,
    total_price: Number(o.total_price || 0),
    subtotal_price: Number(o.subtotal_price || 0),
    total_tax: Number(o.total_tax || 0),
    total_discounts: Number(o.total_discounts || 0),
    customer_name: `${o.customer?.first_name || ''} ${o.customer?.last_name || ''}`.trim(),
    line_items_count: (o.line_items || []).reduce((sum: number, it: any) => sum + Number(it.quantity || 0), 0),
  }));
  return {
    revenue,
    orders: validOrders.length,
    aov: validOrders.length ? revenue / validOrders.length : 0,
    sessions: daily.reduce((sum, d) => sum + d.sessions, 0),
    conversionRate: 2.6,
    totalDiscounts: validOrders.reduce((sum, o) => sum + Number(o.total_discounts || 0), 0),
    customerSplit: { returning: Math.round(validOrders.length * 0.42), new: Math.round(validOrders.length * 0.58), returningRate: 42 },
    fulfillmentSplit: { fulfilled: Math.round(validOrders.length * 0.78), unfulfilled: Math.round(validOrders.length * 0.22) },
    topProducts: Object.values(productStats).sort((a, b) => b.quantity - a.quantity).slice(0, 7),
    daily,
    recentOrders,
    variantOrders,
  };
};

const actionValues = (purchaseValue: number) => [{ action_type: 'purchase', value: String(Math.round(purchaseValue)) }, { action_type: 'offsite_conversion.fb_pixel_purchase', value: String(Math.round(purchaseValue)) }];
const actionCounts = (purchases: number, leads: number) => [{ action_type: 'purchase', value: String(purchases) }, { action_type: 'lead', value: String(leads) }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: String(Math.round(leads * 0.65)) }];

export const getDemoMetaDaily = (range?: { since: string; until: string }) => {
  const fallbackUntil = formatDemoDate(addDays(new Date(), -1));
  const fallbackSince = formatDemoDate(addDays(new Date(), -14));
  const { start, days } = parseRange(range?.since || fallbackSince, range?.until || fallbackUntil);
  return Array.from({ length: days }, (_, i) => {
    const spend = 55 + ((i * 13) % 42);
    const purchaseValue = spend * (5.8 + ((i % 5) * 0.7));
    const purchases = Math.max(2, Math.round(purchaseValue / 9200));
    return {
      date: formatDemoDate(addDays(start, i)),
      date_start: formatDemoDate(addDays(start, i)),
      date_stop: formatDemoDate(addDays(start, i)),
      spend,
      reach: 1900 + ((i * 379) % 2600),
      impressions: 3400 + ((i * 611) % 5200),
      results: purchases,
      purchase_value: purchaseValue,
      roas: Number((purchaseValue / spend).toFixed(2)),
      actions: actionCounts(purchases, 10 + (i % 7)),
      action_values: actionValues(purchaseValue),
      purchase_roas: [{ value: String((purchaseValue / spend).toFixed(2)) }],
    };
  });
};

export const getDemoMetaCampaignInsights = () => [
  { campaign_id: 'demo_cmp_1', campaign_name: 'Demo Prospecting Advantage+', objective: 'OUTCOME_SALES', spend: '820', reach: '48200', impressions: '112000', actions: actionCounts(46, 130), action_values: actionValues(6960), purchase_roas: [{ value: '8.49' }] },
  { campaign_id: 'demo_cmp_2', campaign_name: 'Demo Remarketing Warm', objective: 'OUTCOME_SALES', spend: '310', reach: '11800', impressions: '35400', actions: actionCounts(29, 42), action_values: actionValues(3610), purchase_roas: [{ value: '11.65' }] },
  { campaign_id: 'demo_cmp_3', campaign_name: 'Demo Leads WhatsApp', objective: 'OUTCOME_LEADS', spend: '190', reach: '9200', impressions: '18400', actions: actionCounts(6, 88), action_values: actionValues(640), purchase_roas: [{ value: '3.37' }] },
];

export const getDemoMetaBreakdown = (breakdown: string) => {
  const labels: Record<string, string[]> = {
    gender: ['female', 'male', 'unknown'],
    age: ['18-24', '25-34', '35-44', '45-54'],
    region: ['Buenos Aires', 'Cordoba', 'Santa Fe', 'Mendoza'],
    publisher_platform: ['instagram', 'facebook', 'audience_network'],
  };
  return (labels[breakdown] || ['Demo']).map((label, i) => ({
    [breakdown]: label,
    spend: String(120 + i * 72),
    impressions: String(14000 - i * 1800),
    reach: String(7200 - i * 900),
    inline_link_clicks: String(210 - i * 24),
    inline_link_click_ctr: String(1.6 + i * 0.2),
    actions: actionCounts(14 - i, 28 + i * 4),
    action_values: actionValues(1300 + i * 420),
  }));
};

export const getDemoKlaviyoDashboard = (since: string, until: string) => {
  const { start, days } = parseRange(since, until);
  const dailyRevenue = Array.from({ length: days }, (_, i) => ({ date: formatDemoDate(addDays(start, i)), val: 4200 + ((i * 977) % 7200) }));
  const dailySent = Array.from({ length: days }, (_, i) => ({ date: formatDemoDate(addDays(start, i)), val: 280 + ((i * 41) % 220) }));
  const dailyOpens = dailySent.map((d, i) => ({ date: d.date, val: Math.round(d.val * (0.48 + (i % 5) * 0.025)) }));
  const dailyClicks = dailySent.map((d, i) => ({ date: d.date, val: Math.round(d.val * (0.065 + (i % 4) * 0.008)) }));
  const dailyConversions = dailyRevenue.map((d, i) => ({ date: d.date, val: 1 + (i % 4) }));
  return {
    revenue: dailyRevenue.reduce((s, d) => s + d.val, 0),
    attributed: Math.round(dailyRevenue.reduce((s, d) => s + d.val, 0) * 0.54),
    opens: dailyOpens.reduce((s, d) => s + d.val, 0),
    clicks: dailyClicks.reduce((s, d) => s + d.val, 0),
    sent: dailySent.reduce((s, d) => s + d.val, 0),
    conversions: dailyConversions.reduce((s, d) => s + d.val, 0),
    dailyRevenue,
    dailyAttributed: dailyRevenue.map(d => ({ ...d, val: Math.round(d.val * 0.54) })),
    dailyOpens,
    dailyClicks,
    dailySent,
    dailyConversions,
  };
};

export const getDemoCostsPayload = () => {
  const now = new Date().toISOString();
  return {
    variantCosts: demoProducts.flatMap(p => p.variants.map(v => ({
      variant_id: String(v.id),
      cost: Math.round(Number(v.price) * 0.34),
      packaging_cost: 850,
      updated_at: now,
    }))),
    additionalCosts: [
      { id: 'demo-cost-1', category: 'equipo', name: 'Equipo comercial demo', start_date: formatDemoDate(addDays(new Date(), -30)), end_date: formatDemoDate(new Date()), cost: 620000, daily_cost: 20666.67, currency: 'ARS', ad_spend: false, platform: 'operacion', updated_at: now },
      { id: 'demo-cost-2', category: 'otros', name: 'Herramientas y apps', start_date: formatDemoDate(addDays(new Date(), -30)), end_date: formatDemoDate(new Date()), cost: 95000, daily_cost: 3166.67, currency: 'ARS', ad_spend: false, platform: 'software', updated_at: now },
      { id: 'demo-cost-3', category: 'campanas', name: 'Produccion de contenidos', start_date: formatDemoDate(addDays(new Date(), -30)), end_date: formatDemoDate(new Date()), cost: 180000, daily_cost: 6000, currency: 'ARS', ad_spend: false, platform: 'marketing', updated_at: now },
    ],
    costSettings: {
      platformCommissions: { shopify: 2, tiendanube: 1.5, mercadolibre: 10, custom: 0 },
      paymentFees: { tiendanubeCPT: 0, shopifyFees: 1.5, iibb: 3 },
      gateways: { pagonube: 'configured', mercadopago: 'configured', gocuotas: 'pending', ualabis: 'pending', modo: 'pending' },
      shipping: { type: 'custom', customShippingCost: 1900, configured: true },
      updatedSections: { platform: now, payment: now, shipping: now, additional: now },
      currency: { baseCurrency: 'ARS', storeCurrency: 'ARS', metaCurrency: 'USD', emailCurrency: 'ARS', costCurrency: 'ARS', rates: { USD_ARS: 1477.29, ARS_USD: 0.000677 }, updatedAt: now },
    },
    costSettingsUpdatedAt: now,
  };
};

export const demoSocial = {
  instagramProfile: { id: DEMO_IG_ID, username: 'demo.car.store', name: 'Demo CAR Store', biography: 'Demo ecommerce conectado a Algoritmia Gestion.', followers_count: 24890, follows_count: 410, media_count: 126, profile_picture_url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=200&q=80', website: 'https://demo.algoritmiadesarrollos.com.ar' },
  facebookPage: { id: DEMO_FB_PAGE_ID, name: 'Demo CAR Store', fan_count: 18420, followers_count: 19300, picture: { data: { url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=200&q=80' } }, about: 'Cuenta demo para mostrar publicaciones, comentarios y metricas.' },
};
