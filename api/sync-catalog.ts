import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";
const META_BASE = 'https://graph.facebook.com/v21.0';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface CatalogProduct {
  id: string | number;
  title: string;
  handle: string;
  type: string;
  tags: string;
  price: string;
  variants: string[];
  source: 'meta' | 'shopify';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { clientId } = req.body as { clientId: string };
  if (!clientId) return res.status(400).json({ error: 'Missing clientId' });

  // Fetch client
  const { data: client, error } = await supabase
    .from('car_clients')
    .select('meta_account_id, shopify_domain, shopify_access_token, ecommerce_platform, website_url')
    .eq('id', clientId)
    .maybeSingle();

  if (error || !client) return res.status(404).json({ error: 'Client not found' });

  // Fetch Meta access token from AgencySettings
  const { data: tokenRow } = await supabase
    .from('AgencySettings')
    .select('value')
    .eq('key', 'meta_ads_token')
    .maybeSingle();
  const metaToken: string = tokenRow?.value || '';

  let catalog: CatalogProduct[] = [];
  let source = '';

  // ── 1. META CATALOG (priority) ──────────────────────────────────────
  if (client.meta_account_id && metaToken) {
    try {
      const accountId = client.meta_account_id.startsWith('act_')
        ? client.meta_account_id
        : `act_${client.meta_account_id}`;

      // Get all catalogs for this ad account
      const catalogsRes = await fetch(
        `${META_BASE}/${accountId}/product_catalogs?fields=id,name,product_count&access_token=${metaToken}`
      );
      const catalogsData = await catalogsRes.json();
      const catalogs: any[] = catalogsData.data || [];

      if (catalogs.length > 0) {
        // Use the catalog with the most products, or the first one
        const bestCatalog = catalogs.sort((a, b) => (b.product_count || 0) - (a.product_count || 0))[0];

        // Fetch all products from the catalog (paginated)
        let allMetaProducts: any[] = [];
        let nextUrl: string | null =
          `${META_BASE}/${bestCatalog.id}/products?fields=id,name,price,currency,url,product_type,availability,image_url,description,retailer_id&limit=200&access_token=${metaToken}`;

        while (nextUrl) {
          const pRes: Response = await fetch(nextUrl);
          const pData: any = await pRes.json();
          allMetaProducts = allMetaProducts.concat(pData.data || []);
          nextUrl = pData.paging?.next || null;
        }

        // Filter available products only
        const available = allMetaProducts.filter(p =>
          !p.availability || p.availability === 'in stock' || p.availability === 'available'
        );

        // Normalize Meta products to our catalog format
        const domain = client.shopify_domain?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '';
        const websiteUrl = client.website_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || domain;

        catalog = available.map(p => {
          // Extract price — Meta returns price as "1500 USD" or "1500.00 USD"
          const priceRaw = p.price || '';
          const priceNum = priceRaw.replace(/[^0-9.]/g, '');
          const currency = priceRaw.replace(/[0-9. ]/g, '').trim();
          const priceStr = priceNum ? `${currency || '$'}${parseFloat(priceNum).toFixed(2)}` : 'Consultar';

          // Build product handle from URL
          const productUrl = p.url || '';
          const urlHandle = productUrl.split('/products/')[1]?.split('?')[0] || '';

          return {
            id: p.id || p.retailer_id || '',
            title: p.name || '',
            handle: urlHandle,
            type: p.product_type || '',
            tags: '',
            price: priceStr,
            variants: [],
            source: 'meta' as const,
            url: productUrl,
          };
        });

        source = `Meta Catalog: ${bestCatalog.name} (${catalog.length} productos)`;
      }
    } catch (err) {
      console.error('[sync-catalog] Meta catalog fetch failed:', err);
    }
  }

  // ── 2. SHOPIFY FALLBACK ──────────────────────────────────────────────
  if (catalog.length === 0 && client.shopify_domain && client.shopify_access_token) {
    try {
      const domain = client.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const token = client.shopify_access_token;

      let allProducts: any[] = [];
      let pageUrl: string | null =
        `https://${domain}/admin/api/2024-01/products.json?limit=250&fields=id,title,handle,status,variants,product_type,tags`;

      while (pageUrl) {
        const shopifyRes: Response = await fetch(pageUrl, {
          headers: { 'X-Shopify-Access-Token': token, 'Accept': 'application/json' },
        });
        if (!shopifyRes.ok) throw new Error(`Shopify error: ${shopifyRes.status}`);
        const data: any = await shopifyRes.json();
        allProducts = allProducts.concat(data.products || []);
        const linkHeader: string = shopifyRes.headers.get('link') || '';
        const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        pageUrl = nextMatch ? nextMatch[1] : null;
      }

      const active = allProducts.filter(p => p.status === 'active');
      catalog = active.map(p => {
        const variants = p.variants || [];
        const prices = [...new Set(variants.map((v: any) => v.price).filter(Boolean))];
        const priceStr = prices.length === 1
          ? `$${prices[0]}`
          : prices.length > 1
            ? `$${Math.min(...prices.map(Number))} - $${Math.max(...prices.map(Number))}`
            : 'Consultar';
        return {
          id: p.id,
          title: p.title,
          handle: p.handle,
          type: p.product_type || '',
          tags: p.tags || '',
          price: priceStr,
          variants: variants.map((v: any) => v.title).filter((t: string) => t && t !== 'Default Title'),
          source: 'shopify' as const,
        };
      });

      source = `Shopify (${catalog.length} productos activos)`;
    } catch (err) {
      console.error('[sync-catalog] Shopify fetch failed:', err);
    }
  }

  if (catalog.length === 0) {
    return res.status(400).json({
      error: 'No se encontró catálogo. Configurá Meta Ads o Shopify para este cliente.',
    });
  }

  const syncedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('car_clients')
    .update({
      products_catalog: JSON.stringify(catalog),
      catalog_synced_at: syncedAt,
    })
    .eq('id', clientId);

  if (updateError) {
    return res.status(502).json({ error: updateError.message });
  }

  return res.status(200).json({
    success: true,
    source,
    count: catalog.length,
    synced_at: syncedAt,
    catalog,
  });
}
