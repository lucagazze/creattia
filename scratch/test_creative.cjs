const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  try {
    const { data: tokenData } = await supabase
      .from('AgencySettings')
      .select('value')
      .eq('key', 'meta_ads_token')
      .maybeSingle();

    const token = tokenData?.value;
    if (!token) {
      console.error('No token found');
      return;
    }

    const base = 'https://graph.facebook.com/v21.0';
    
    // Let's search for ads in Leo's account: act_614275463776269 or similar. Let's just find one ad account or use a default one.
    // Let's get all ad accounts first to find one with active ads.
    const adAcctsRes = await fetch(`${base}/me/adaccounts?fields=id,name&access_token=${token}&limit=100`).then(r => r.json());
    const accounts = adAcctsRes.data || [];
    console.log(`Found ${accounts.length} ad accounts`);

    for (const acct of accounts) {
      console.log(`Checking account: ${acct.name} (${acct.id})`);
      const adsRes = await fetch(`${base}/${acct.id}/ads?fields=id,name,status,creative{id,name,object_type}&access_token=${token}&limit=20`).then(r => r.json());
      const ads = adsRes.data || [];
      const activeAds = ads.filter(a => a.status === 'ACTIVE');
      if (activeAds.length > 0) {
        console.log(`Found ${activeAds.length} active ads in account ${acct.name}`);
        for (const ad of activeAds) {
          const creativeId = ad.creative?.id;
          if (creativeId) {
            console.log(`\nCreative ID: ${creativeId} for Ad: ${ad.name}`);
            const creativeRes = await fetch(`${base}/${creativeId}?fields=video_id,object_story_spec,asset_feed_spec,object_type,image_url,thumbnail_url&access_token=${token}`).then(r => r.json());
            console.log(JSON.stringify(creativeRes, null, 2));
          }
        }
        break; // check just one account with active ads
      }
    }
  } catch (err) {
    console.error(err);
  }
}

main();
