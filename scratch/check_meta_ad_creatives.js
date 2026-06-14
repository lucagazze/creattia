import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = "https://czocbnyoenjbpxmcqobn.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Querying car_clients for Meta/Facebook connections...");
  const { data: clients, error: err } = await supabase
    .from('car_clients')
    .select('id, business_name, meta_account_id, fb_page_id, ig_business_id, facebook_access_token');

  if (err) {
    console.error("Error querying clients:", err);
    return;
  }

  console.log(`Found ${clients.length} clients:`);
  for (const client of clients) {
    console.log(`- ${client.business_name} (ID: ${client.id})`);
    console.log(`  Meta Account ID: ${client.meta_account_id}`);
    console.log(`  FB Page ID: ${client.fb_page_id}`);
    console.log(`  IG Business ID: ${client.ig_business_id}`);
    console.log(`  Has Token: ${!!client.facebook_access_token}`);
    
    if (client.facebook_access_token && client.meta_account_id) {
      // Let's test checking the account ads
      const accountId = client.meta_account_id;
      const token = client.facebook_access_token;
      
      console.log(`  Testing getAccountAds for ${accountId}...`);
      const url = `https://graph.facebook.com/v21.0/${accountId}/ads?fields=id,name,status,creative{id,name,thumbnail_url,image_url,object_type,video_id,effective_object_story_id,effective_instagram_story_id}&access_token=${token}&limit=5`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
          console.error(`  Error fetching ads:`, data.error);
        } else {
          console.log(`  Successfully fetched ${data.data?.length || 0} ads.`);
          if (data.data?.length > 0) {
            console.log(`  Sample Ad Creative:`, JSON.stringify(data.data[0].creative, null, 2));
            const creativeId = data.data[0].creative?.id;
            
            // Let's test the meta-video proxy logic locally for this creative
            console.log(`  Testing creative details resolution for creative ${creativeId}...`);
            const creativeUrl = `https://graph.facebook.com/v21.0/${creativeId}?fields=video_id,object_story_spec,asset_feed_spec,object_type,image_url,thumbnail_url,account_id,effective_object_story_id,effective_instagram_story_id,object_story_id&access_token=${token}`;
            const cRes = await fetch(creativeUrl);
            const cData = await cRes.json();
            if (cData.error) {
              console.error(`  Creative fetch failed:`, cData.error);
            } else {
              console.log(`  Creative Spec:`, JSON.stringify(cData, null, 2));
            }
          }
        }
      } catch (e) {
        console.error(`  Fetch exception:`, e);
      }
    }
  }
}

run();
