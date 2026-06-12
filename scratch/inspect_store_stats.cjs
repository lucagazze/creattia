const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { data: clients } = await supabase
    .from('car_clients')
    .select('id, business_name, ecommerce_platform, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token');

  for (const c of clients) {
    if (c.ecommerce_platform === 'shopify') {
      const domain = c.shopify_domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const token = c.shopify_access_token;
      try {
        const res = await fetch(`https://${domain}/admin/api/2026-01/orders/count.json`, {
          headers: { 'X-Shopify-Access-Token': token }
        });
        const data = await res.json();
        console.log(`Shopify: ${c.business_name} - Total Orders Count:`, data.count);

        const resCust = await fetch(`https://${domain}/admin/api/2026-01/customers/count.json`, {
          headers: { 'X-Shopify-Access-Token': token }
        });
        const dataCust = await resCust.json();
        console.log(`Shopify: ${c.business_name} - Total Customers Count:`, dataCust.count);
      } catch (err) {
        console.error(`Shopify ${c.business_name} failed:`, err.message);
      }
    } else if (c.ecommerce_platform === 'wordpress') {
      const base = c.wordpress_url.replace(/\/$/, '');
      const creds = Buffer.from(`${c.woo_consumer_key}:${c.woo_consumer_secret}`).toString('base64');
      const wcHeaders = { Authorization: `Basic ${creds}` };
      try {
        const res = await fetch(`${base}/wp-json/wc/v3/orders?per_page=1`, { headers: wcHeaders });
        const total = res.headers.get('X-WP-Total') || 'unknown';
        console.log(`WordPress: ${c.business_name} - Total Orders: ${total}`);
      } catch (err) {
        console.error(`WordPress ${c.business_name} failed:`, err.message);
      }
    } else if (c.ecommerce_platform === 'tiendanube') {
      const tnHeaders = { Authentication: `bearer ${c.tiendanube_access_token}`, 'User-Agent': 'AlgorBot/1.0' };
      const tnBase = `https://api.tiendanube.com/v1/${c.tiendanube_store_id}/orders`;
      try {
        const res = await fetch(`${tnBase}?per_page=1`, { headers: tnHeaders });
        const data = await res.json();
        console.log(`Tiendanube: ${c.business_name} - Response data:`, data);
      } catch (err) {
        console.error(`Tiendanube ${c.business_name} failed:`, err.message);
      }
    }
  }
}

main();
