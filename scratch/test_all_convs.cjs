const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  const { data: tokenData } = await supabase
    .from('AgencySettings')
    .select('value')
    .eq('key', 'meta_ads_token')
    .maybeSingle();

  const token = tokenData?.value;
  if (!token) {
    console.error('No agency token found!');
    return;
  }

  // Get all accounts linked to this token
  const res = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&limit=100&fields=id,name,access_token,instagram_business_account{id,username,name}`).then(r => r.json());
  
  if (res.error) {
    console.error('Error fetching accounts:', res.error);
    return;
  }

  console.log(`Found ${res.data?.length || 0} pages/accounts:\n`);
  for (const page of (res.data || [])) {
    console.log(`Page: ${page.name} (ID: ${page.id})`);
    const pageToken = page.access_token;
    if (page.instagram_business_account) {
      console.log(`  IG Business Account: @${page.instagram_business_account.username} (ID: ${page.instagram_business_account.id})`);
      
      // Query IG conversations
      const igUrl = `https://graph.facebook.com/v21.0/${page.id}/conversations?platform=instagram&access_token=${pageToken}&fields=id,participants,unread_count,updated_time`;
      const igRes = await fetch(igUrl).then(r => r.json());
      if (igRes.error) {
        console.log(`  ❌ IG Conversations Error: ${igRes.error.message}`);
      } else {
        console.log(`  ✅ IG Conversations found: ${igRes.data?.length || 0}`);
        if (igRes.data && igRes.data.length > 0) {
          console.log(`     Sample IG Conv:`, JSON.stringify(igRes.data[0]));
        }
      }
    } else {
      console.log(`  No IG linked`);
    }

    // Query Messenger conversations
    const msgUrl = `https://graph.facebook.com/v21.0/${page.id}/conversations?platform=messenger&access_token=${pageToken}&fields=id,participants,unread_count,updated_time`;
    const msgRes = await fetch(msgUrl).then(r => r.json());
    if (msgRes.error) {
      console.log(`  ❌ Messenger Conversations Error: ${msgRes.error.message}`);
    } else {
      console.log(`  ✅ Messenger Conversations found: ${msgRes.data?.length || 0}`);
    }
    console.log('------------------------------------------------');
  }
}

run().catch(console.error);
