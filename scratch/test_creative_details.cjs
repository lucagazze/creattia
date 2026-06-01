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
    const creativeId = '4476580079244490';
    const base = 'https://graph.facebook.com/v21.0';

    // 1. Let's query the creative and see if we can get child attachments' pictures
    const res = await fetch(`${base}/${creativeId}?fields=object_story_spec,thumbnail_url,image_url,account_id&access_token=${token}`).then(r => r.json());
    console.log("Creative Account ID:", res.account_id);
    console.log("Creative object_story_spec response keys:", Object.keys(res.object_story_spec || {}));
    const childs = res.object_story_spec?.link_data?.child_attachments || [];
    console.log("Child attachments:", JSON.stringify(childs, null, 2));

    // 2. Let's test if we can resolve image_hash to a URL using the adimages endpoint of the account.
    // The account ID is act_2136106490563351 or similar, but let's query act_2136106490563351/adimages with hashes.
    // Wait, let's find the account ID for this creative. We can check via its parent ad or search. Let's just try act_2136106490563351 since it's the main account.
    // Actually, Materia Prima USD account ID is likely act_xxxx. Let's get the list of accounts first to find the one matching "Materia Prima USD".
    const adAcctsRes = await fetch(`${base}/me/adaccounts?fields=id,name&access_token=${token}&limit=100`).then(r => r.json());
    const mpAccount = (adAcctsRes.data || []).find(a => a.name.includes("Materia Prima"));
    if (mpAccount) {
      console.log(`Found account: ${mpAccount.name} (${mpAccount.id})`);
      const hashes = childs.map(c => c.image_hash).filter(Boolean);
      if (hashes.length > 0) {
        const hashesStr = JSON.stringify(hashes);
        const imagesRes = await fetch(`${base}/${mpAccount.id}/adimages?hashes=${hashesStr}&fields=url,hash&access_token=${token}`).then(r => r.json());
        console.log("Resolved images by hashes:", JSON.stringify(imagesRes, null, 2));
      }
    }
  } catch (err) {
    console.error(err);
  }
}

main();
