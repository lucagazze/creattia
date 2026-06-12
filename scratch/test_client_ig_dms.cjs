const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://czocbnyoenjbpxmcqobn.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function run() {
  const { data: client } = await supabase
    .from('car_clients')
    .select('id, business_name, fb_page_id, ig_business_id, facebook_access_token, fb_page_access_token')
    .eq('business_name', 'lucagazze3')
    .single();

  if (!client) {
    console.error('lucagazze3 client not found!');
    return;
  }

  const { fb_page_id: PAGE_ID, ig_business_id: IG_ID, facebook_access_token: userToken, fb_page_access_token: pageToken } = client;

  console.log(`PAGE_ID: ${PAGE_ID}, IG_ID: ${IG_ID}`);

  const tests = [
    { label: 'Page + platform=instagram (v21)', url: `https://graph.facebook.com/v21.0/${PAGE_ID}/conversations?platform=instagram&access_token=${pageToken}&fields=id,participants,unread_count,updated_time&limit=50` },
    { label: 'Page + platform=instagram (v19)', url: `https://graph.facebook.com/v19.0/${PAGE_ID}/conversations?platform=instagram&access_token=${pageToken}&fields=id,participants,unread_count,updated_time&limit=50` },
    { label: 'IG ID + conversations (v21)', url: `https://graph.facebook.com/v21.0/${IG_ID}/conversations?access_token=${pageToken}&fields=id,participants,unread_count,updated_time&limit=50` },
    { label: 'Page + folder=inbox + platform=instagram', url: `https://graph.facebook.com/v21.0/${PAGE_ID}/conversations?platform=instagram&folder=inbox&access_token=${pageToken}&fields=id,participants,unread_count&limit=50` },
    { label: 'IG inbox messages direct', url: `https://graph.facebook.com/v21.0/${IG_ID}/messages?access_token=${pageToken}&fields=id,message,from,to,created_time&limit=10` },
    { label: 'Page + folder=all + platform=instagram', url: `https://graph.facebook.com/v21.0/${PAGE_ID}/conversations?platform=instagram&folder=all&access_token=${pageToken}&fields=id,participants,unread_count&limit=50` },
  ];

  for (const test of tests) {
    const res = await fetch(test.url).then(r=>r.json());
    if (res.error) {
      console.log(`❌ ${test.label}: ${res.error.message} (code ${res.error.code})`);
    } else {
      const count = res?.data?.length ?? 'N/A';
      console.log(`${count > 0 ? '✅' : '⚠️ '} ${test.label}: ${count} result(s)`);
      if (count > 0) {
        console.log('   First item:', JSON.stringify(res.data[0]).slice(0, 300));
      }
    }
  }
}

run().catch(console.error);
