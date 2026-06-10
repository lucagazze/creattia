const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { data: clients, error } = await supabase
    .from('car_clients')
    .select('id, business_name, ecommerce_platform, shopify_domain, shopify_access_token, wordpress_url, woo_consumer_key, woo_consumer_secret, tiendanube_store_id, tiendanube_access_token, klaviyo_api_key, chatwoot_url, chatwoot_token');
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('ALL CLIENTS:');
    clients.forEach(c => {
      console.log(`- Business: ${c.business_name}`);
      console.log(`  ID: ${c.id}`);
      console.log(`  Platform: ${c.ecommerce_platform}`);
      console.log(`  Shopify Domain: ${c.shopify_domain}`);
      console.log(`  Shopify Token Exists: ${!!c.shopify_access_token}`);
      console.log(`  WordPress URL: ${c.wordpress_url}`);
      console.log(`  Woo Consumer Key Exists: ${!!c.woo_consumer_key}`);
      console.log(`  Woo Consumer Secret Exists: ${!!c.woo_consumer_secret}`);
      console.log(`  Tiendanube Store ID: ${c.tiendanube_store_id}`);
      console.log(`  Tiendanube Token Exists: ${!!c.tiendanube_access_token}`);
      console.log(`  Klaviyo API Key Exists: ${!!c.klaviyo_api_key}`);
      console.log(`  Chatwoot URL: ${c.chatwoot_url}`);
      console.log(`  Chatwoot Token Exists: ${!!c.chatwoot_token}`);
      console.log('--------------------------------------------------');
    });
  }
}

main();
