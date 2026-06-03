const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { data: clients, error } = await supabase
    .from('car_clients')
    .select('id, business_name, fb_page_id, fb_page_name, fb_page_access_token, ig_business_id, ig_username, meta_account_id, shopify_domain, shopify_access_token, klaviyo_api_key, chatwoot_url, chatwoot_token');
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('ALL CLIENTS:');
    clients.forEach(c => {
      console.log(`- Business: ${c.business_name}`);
      console.log(`  FB Page ID: ${c.fb_page_id}`);
      console.log(`  FB Page Name: ${c.fb_page_name}`);
      console.log(`  FB Token Exists: ${!!c.fb_page_access_token}`);
      console.log(`  IG Business ID: ${c.ig_business_id}`);
      console.log(`  IG Username: ${c.ig_username}`);
      console.log(`  Meta Account ID: ${c.meta_account_id}`);
      console.log(`  Shopify Domain: ${c.shopify_domain}`);
      console.log(`  Shopify Token Exists: ${!!c.shopify_access_token}`);
      console.log(`  Klaviyo API Key Exists: ${!!c.klaviyo_api_key}`);
      console.log(`  Chatwoot URL: ${c.chatwoot_url}`);
      console.log(`  Chatwoot Token Exists: ${!!c.chatwoot_token}`);
      console.log('--------------------------------------------------');
    });
  }
}

main();
