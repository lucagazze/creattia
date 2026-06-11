const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const wordpressUrl = "https://materiaprimatelas.com.ar";
const wooConsumerKey = "ck_a4e21a221f75d506d36d2c49fa5853b0f5ef8cd4";
const wooConsumerSecret = "cs_8f7bfa6d9dbf1f31f90df21d5a7114da7db01614";

async function main() {
  const base = wordpressUrl.replace(/\/$/, '');
  const creds = Buffer.from(`${wooConsumerKey}:${wooConsumerSecret}`).toString('base64');
  const headers = { Authorization: `Basic ${creds}` };

  console.log("Fetching orders from WooCommerce...");
  const res = await fetch(`${base}/wp-json/wc/v3/orders?per_page=1`, { headers });
  if (!res.ok) {
    console.error("Failed to fetch WooCommerce orders:", res.status, await res.text());
    return;
  }
  const orders = await res.json();
  if (orders.length > 0) {
    const o = orders[0];
    console.log("Line items of order 0:");
    console.log(JSON.stringify(o.line_items, null, 2));
  }
}

main().catch(console.error);
