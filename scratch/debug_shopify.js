import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://czocbnyoenjbpxmcqobn.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Fetching client profile for The Skirting Factory...");
  const { data: client, error } = await supabase
    .from('car_clients')
    .select('*')
    .eq('business_name', 'The Skirting Factory')
    .single();

  if (error) {
    console.error("DB error:", error);
    return;
  }

  const { shopify_domain, shopify_access_token } = client;
  console.log("Domain:", shopify_domain);
  console.log("Token length:", shopify_access_token ? shopify_access_token.length : 0);

  if (!shopify_domain || !shopify_access_token) {
    console.error("Missing Shopify credentials in DB");
    return;
  }

  console.log("Testing connection to Shopify Admin API...");
  const url = `https://${shopify_domain}/admin/api/2026-01/shop.json`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': shopify_access_token,
        'Accept': 'application/json'
      }
    });
    
    const data = await res.json();
    console.log("Shopify API Response Status:", res.status);
    console.log("Shopify API Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

run();
