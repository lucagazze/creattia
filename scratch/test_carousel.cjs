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
    const adAcctsRes = await fetch(`${base}/me/adaccounts?fields=id,name&access_token=${token}&limit=100`).then(r => r.json());
    const accounts = adAcctsRes.data || [];

    for (const acct of accounts) {
      const adsRes = await fetch(`${base}/${acct.id}/ads?fields=id,name,status,creative{id,name,object_type}&access_token=${token}&limit=100`).then(r => r.json());
      const ads = adsRes.data || [];
      const activeAds = ads.filter(a => a.status === 'ACTIVE');
      
      for (const ad of activeAds) {
        const creativeId = ad.creative?.id;
        if (creativeId) {
          const creativeRes = await fetch(`${base}/${creativeId}?fields=video_id,object_story_spec,asset_feed_spec,object_type,image_url,thumbnail_url&access_token=${token}`).then(r => r.json());
          const hasChildAttachments = creativeRes.object_story_spec?.link_data?.child_attachments;
          const hasCarouselInAssetFeed = creativeRes.asset_feed_spec?.carousels;
          if (hasChildAttachments || hasCarouselInAssetFeed) {
            console.log(`\nFOUND CAROUSEL AD! Creative ID: ${creativeId} in Account: ${acct.name}`);
            console.log(JSON.stringify(creativeRes, null, 2));
            return; // Found one, exit!
          }
        }
      }
    }
    console.log("No carousel ads found in active ads of any account.");
  } catch (err) {
    console.error(err);
  }
}

main();
