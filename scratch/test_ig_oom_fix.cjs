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

  const fbPageId = '925570770649286'; // Algoritmia
  const meAccountsUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&limit=100`;
  const accountsRes = await fetch(meAccountsUrl).then(r => r.json());
  const page = (accountsRes?.data || []).find(p => String(p.id) === String(fbPageId));
  const pageToken = page?.access_token || token;

  const testCases = [
    { label: 'Limit 10, default fields', url: `https://graph.facebook.com/v21.0/${fbPageId}/conversations?platform=instagram&access_token=${pageToken}&fields=id,participants,unread_count,updated_time&limit=10` },
    { label: 'Limit 5, default fields', url: `https://graph.facebook.com/v21.0/${fbPageId}/conversations?platform=instagram&access_token=${pageToken}&fields=id,participants,unread_count,updated_time&limit=5` },
    { label: 'Limit 1, default fields', url: `https://graph.facebook.com/v21.0/${fbPageId}/conversations?platform=instagram&access_token=${pageToken}&fields=id,participants,unread_count,updated_time&limit=1` },
    { label: 'Limit 10, only ID', url: `https://graph.facebook.com/v21.0/${fbPageId}/conversations?platform=instagram&access_token=${pageToken}&fields=id&limit=10` },
    { label: 'Limit 5, ID and updated_time', url: `https://graph.facebook.com/v21.0/${fbPageId}/conversations?platform=instagram&access_token=${pageToken}&fields=id,updated_time&limit=5` },
    { label: 'Limit 5, no participants', url: `https://graph.facebook.com/v21.0/${fbPageId}/conversations?platform=instagram&access_token=${pageToken}&fields=id,unread_count,updated_time&limit=5` },
  ];

  for (const tc of testCases) {
    console.log(`\nTesting: ${tc.label}...`);
    const res = await fetch(tc.url).then(r => r.json());
    if (res.error) {
      console.log(`❌ Error: ${res.error.message} (code ${res.error.code}, subcode ${res.error.error_subcode})`);
    } else {
      console.log(`✅ Success! Count: ${res.data?.length || 0}`);
      if (res.data && res.data.length > 0) {
        console.log(`   First conv:`, JSON.stringify(res.data[0]));
      }
    }
  }
}

run().catch(console.error);
