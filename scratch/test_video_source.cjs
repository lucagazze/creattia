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
    const base = 'https://graph.facebook.com/v21.0';

    // Real creative and video IDs from Juan Tessari Ads (loaded from previous check):
    const creativeId = '1413113780703186';
    const topVideoId = '926155017124221';      // AdVideo ID
    const nestedVideoId = '3186048224890536';  // PageVideo ID

    console.log(`--- Testing Creative Spec (${creativeId}) ---`);
    const creativeRes = await fetch(`${base}/${creativeId}?fields=video_id,object_story_spec,asset_feed_spec,object_type,image_url&access_token=${token}`).then(r => r.json());
    console.log("Creative Spec:", JSON.stringify(creativeRes, null, 2));

    console.log(`\n--- Testing Top-level AdVideo ID (${topVideoId}) ---`);
    const adVideoRes = await fetch(`${base}/${topVideoId}?fields=source,picture,format&access_token=${token}`).then(r => r.json());
    console.log("AdVideo response:", JSON.stringify(adVideoRes, null, 2));

    console.log(`\n--- Testing Nested PageVideo ID (${nestedVideoId}) ---`);
    const pageVideoRes = await fetch(`${base}/${nestedVideoId}?fields=source,picture,format&access_token=${token}`).then(r => r.json());
    console.log("PageVideo response:", JSON.stringify(pageVideoRes, null, 2));

  } catch (err) {
    console.error(err);
  }
}

main();
