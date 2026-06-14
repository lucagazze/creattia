import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = "https://czocbnyoenjbpxmcqobn.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const clientId = "21b51a58-98b0-4291-bf59-d4cceb59ff4c"; // lucagazze10
  
  const { data: clientData } = await supabase
    .from('car_clients')
    .select('facebook_access_token, fb_page_id')
    .eq('id', clientId)
    .maybeSingle();
    
  const token = clientData?.facebook_access_token;
  if (!token) {
    console.error("No token found");
    return;
  }
  
  const url = `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}&limit=100`;
  const res = await fetch(url);
  const data = await res.json();
  
  console.log("Pages returned by /me/accounts:");
  if (data.data) {
    data.data.forEach(p => {
      console.log(`- Name: ${p.name}, ID: ${p.id}, Category: ${p.category}, Has Access Token: ${!!p.access_token}`);
    });
  } else {
    console.log("No pages returned or error:", data);
  }
}

run();
