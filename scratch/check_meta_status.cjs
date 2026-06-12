const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://czocbnyoenjbpxmcqobn.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Querying client profiles to check Meta/Facebook fields...");
  const { data, error } = await supabase
    .from('car_clients')
    .select('id, business_name, facebook_access_token, fb_page_id, fb_page_name, fb_page_access_token, ig_business_id, ig_username, meta_account_id, connection_statuses');

  if (error) {
    console.error("Error fetching clients:", error);
    return;
  }

  for (const c of data) {
    console.log(`\nClient: ${c.business_name} (ID: ${c.id})`);
    console.log(`- Connection Statuses:`, JSON.stringify(c.connection_statuses));
    console.log(`- Meta Account ID (Ads):`, c.meta_account_id);
    console.log(`- FB Page ID:`, c.fb_page_id);
    console.log(`- FB Page Name:`, c.fb_page_name);
    console.log(`- IG Business ID:`, c.ig_business_id);
    console.log(`- IG Username:`, c.ig_username);
    console.log(`- User FB Token Exists:`, !!c.facebook_access_token);
    if (c.facebook_access_token) {
      console.log(`  (len: ${c.facebook_access_token.length}, prefix: ${c.facebook_access_token.slice(0, 15)}...)`);
    }
    console.log(`- Page FB Token Exists:`, !!c.fb_page_access_token);
    if (c.fb_page_access_token) {
      console.log(`  (len: ${c.fb_page_access_token.length}, prefix: ${c.fb_page_access_token.slice(0, 15)}...)`);
    }
  }
}

run();
