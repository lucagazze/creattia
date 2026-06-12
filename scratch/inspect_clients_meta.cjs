const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { data: clients, error } = await supabase
    .from('car_clients')
    .select('id, business_name, fb_page_id, fb_page_name, ig_business_id, ig_username, fb_page_access_token, facebook_access_token, connection_statuses');
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('ALL CLIENTS META SETTINGS:');
    clients.forEach(c => {
      console.log(`- Business: ${c.business_name}`);
      console.log(`  ID: ${c.id}`);
      console.log(`  fb_page_id: ${c.fb_page_id}`);
      console.log(`  fb_page_name: ${c.fb_page_name}`);
      console.log(`  ig_business_id: ${c.ig_business_id}`);
      console.log(`  ig_username: ${c.ig_username}`);
      console.log(`  fb_page_access_token length: ${c.fb_page_access_token ? c.fb_page_access_token.length : 0}`);
      console.log(`  facebook_access_token length: ${c.facebook_access_token ? c.facebook_access_token.length : 0}`);
      console.log(`  connection_statuses:`, JSON.stringify(c.connection_statuses));
      console.log('--------------------------------------------------');
    });
  }
}

main();
