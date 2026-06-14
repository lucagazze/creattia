import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = "https://czocbnyoenjbpxmcqobn.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const creativeId = "1694398261597014";
  const clientId = "21b51a58-98b0-4291-bf59-d4cceb59ff4c"; // lucagazze10
  
  const { data: clientData } = await supabase
    .from('car_clients')
    .select('facebook_access_token, fb_page_access_token')
    .eq('id', clientId)
    .maybeSingle();
    
  console.log("Database Client Data:");
  console.log(`- facebook_access_token exists: ${!!clientData?.facebook_access_token}`);
  console.log(`- fb_page_access_token exists: ${!!clientData?.fb_page_access_token}`);
  
  const token = clientData?.fb_page_access_token;
  if (!token) {
    console.error("No fb_page_access_token found in database for this client.");
    return;
  }
  
  const base = 'https://graph.facebook.com/v21.0';
  const storyId = "101165642053074_1390267866484472";
  
  console.log(`Fetching story details using fb_page_access_token for ${storyId}...`);
  const postRes = await fetch(
    `${base}/${storyId}?fields=attachments,message,full_picture&access_token=${token}`
  );
  
  if (postRes.ok) {
    const postData = await postRes.json();
    console.log("Post Data with fb_page_access_token:", JSON.stringify(postData, null, 2));
  } else {
    console.error("Failed to fetch story details with fb_page_access_token:", await postRes.text());
  }
}

run();
