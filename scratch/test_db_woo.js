import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { data: clients, error } = await supabase
    .from('car_clients')
    .select('id, business_name, ecommerce_platform, wordpress_url, woo_consumer_key, woo_consumer_secret')
    .eq('ecommerce_platform', 'wordpress');

  if (error) {
    console.error("Error fetching clients:", error);
    return;
  }

  console.log("WooCommerce Clients found:", clients.length);
  for (const client of clients) {
    console.log(`- ID: ${client.id}, Name: ${client.business_name}, URL: ${client.wordpress_url}`);
    if (client.woo_consumer_key && client.woo_consumer_secret) {
      console.log(`  Key: ${client.woo_consumer_key.slice(0, 10)}..., Secret: ${client.woo_consumer_secret.slice(0, 10)}...`);
      // Let's try to fetch orders for this client
      const base = client.wordpress_url.replace(/\/$/, '');
      const creds = Buffer.from(`${client.woo_consumer_key}:${client.woo_consumer_secret}`).toString('base64');
      const headers = { Authorization: `Basic ${creds}` };
      try {
        const res = await fetch(`${base}/wp-json/wc/v3/orders?per_page=1`, { headers });
        if (res.ok) {
          const orders = await res.json();
          console.log(`  Success! Fetched ${orders.length} order(s).`);
          if (orders.length > 0) {
            console.log("  Line Items keys:", Object.keys(orders[0].line_items[0]));
            console.log("  Line Items image details:", orders[0].line_items[0].image);
            console.log("  Sample Line Item:");
            console.log(JSON.stringify(orders[0].line_items[0], null, 2));
            break; // Stop after first success
          }
        } else {
          console.log(`  Failed to fetch: ${res.status} ${res.statusText}`);
        }
      } catch (e) {
        console.log(`  Error fetching: ${e.message}`);
      }
    }
  }
}

main().catch(console.error);
