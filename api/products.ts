import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { platform, shopify_domain, shopify_access_token, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token } = req.body || {};

  try {
    let products: any[] = [];

    if (platform === 'shopify') {
      const domain = (shopify_domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!domain || !shopify_access_token) return res.status(400).json({ error: 'Shopify no configurado' });
      const r = await fetch(`https://${domain}/admin/api/2024-01/products.json?limit=250&fields=id,title,body_html,handle,status,variants,images,product_type,tags`, {
        headers: { 'X-Shopify-Access-Token': shopify_access_token, 'Accept': 'application/json' },
      });
      if (!r.ok) return res.status(r.status).json({ error: `Shopify error ${r.status}` });
      const data = await r.json();
      products = (data.products || []).filter((p: any) => p.status === 'active').map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.body_html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || '',
        type: p.product_type || '',
        tags: p.tags || '',
        image: p.images?.[0]?.src || null,
        url: `https://${domain}/products/${p.handle}`,
        variants: (p.variants || []).map((v: any) => ({
          title: v.title !== 'Default Title' ? v.title : '',
          price: v.price,
          sku: v.sku,
          available: v.inventory_policy === 'continue' || (v.inventory_quantity ?? 1) > 0,
        })),
      }));

    } else if (platform === 'wordpress') {
      const base = (wordpress_url || '').replace(/\/$/, '');
      if (!base || !woo_consumer_key || !woo_consumer_secret) return res.status(400).json({ error: 'WooCommerce no configurado' });
      const creds = Buffer.from(`${woo_consumer_key}:${woo_consumer_secret}`).toString('base64');
      for (let page = 1; page <= 5; page++) {
        const r = await fetch(`${base}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`, {
          headers: { 'Authorization': `Basic ${creds}` },
        });
        if (!r.ok) break;
        const data: any[] = await r.json();
        if (!data.length) break;
        products = products.concat(data.map((p: any) => ({
          id: p.id,
          title: p.name,
          description: p.short_description?.replace(/<[^>]+>/g, ' ').trim().slice(0, 300) || p.description?.replace(/<[^>]+>/g, ' ').trim().slice(0, 300) || '',
          type: p.categories?.[0]?.name || '',
          tags: p.tags?.map((t: any) => t.name).join(', ') || '',
          image: p.images?.[0]?.src || null,
          url: p.permalink || '',
          variants: p.attributes?.length > 0
            ? [{ title: p.attributes.map((a: any) => a.options?.join('/')).join(' · '), price: p.price, sku: p.sku, available: p.stock_status === 'instock' }]
            : [{ title: '', price: p.price, sku: p.sku, available: p.stock_status === 'instock' }],
        })));
      }

    } else if (platform === 'tiendanube') {
      if (!tiendanube_store_id || !tiendanube_access_token) return res.status(400).json({ error: 'Tiendanube no configurado' });
      for (let page = 1; page <= 5; page++) {
        const r = await fetch(`https://api.tiendanube.com/v1/${tiendanube_store_id}/products?per_page=200&page=${page}`, {
          headers: { 'Authentication': `bearer ${tiendanube_access_token}`, 'User-Agent': 'AlgorBot/1.0' },
        });
        if (!r.ok) break;
        const data: any[] = await r.json();
        if (!data.length) break;
        products = products.concat(data.map((p: any) => ({
          id: p.id,
          title: p.name?.es || p.name?.en || Object.values(p.name || {})[0] || '',
          description: (p.description?.es || p.description?.en || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 300),
          type: p.categories?.[0]?.name?.es || '',
          tags: '',
          image: p.images?.[0]?.src || null,
          url: p.canonical_url || '',
          variants: (p.variants || []).map((v: any) => ({
            title: v.values?.map((val: any) => val.es || val.en).join(' / ') || '',
            price: v.price,
            sku: v.sku,
            available: v.stock === null || v.stock > 0,
          })),
        })));
      }
    } else {
      return res.status(400).json({ error: 'Plataforma no soportada' });
    }

    return res.status(200).json({ products });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}
