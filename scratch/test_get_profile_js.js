import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://czocbnyoenjbpxmcqobn.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4NDI5MTMsImV4cCI6MjA2ODQxODkxM30.pNgJnwAY8uxb6yCQilJfD92VNwsCkntr4Ie_os2lI44";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(supabaseUrl, anonKey);
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const userId = '8bc98369-50fb-4420-9470-fd33f17d8bbd';
  const email = 'algoritmiadesarrollos@gmail.com';

  console.log("1. Direct query in car_clients for user_id = ", userId);
  const { data: directClient, error: directErr } = await supabase
    .from('car_clients')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  console.log("Direct client response:", directClient, "Error:", directErr);

  console.log("\n2. Query in car_business_accounts with adminClient (user_id):");
  const { data: link, error: linkErr } = await supabaseAdmin
    .from('car_business_accounts')
    .select('id, business_id')
    .eq('user_id', userId)
    .maybeSingle();
  console.log("Link response:", link, "Error:", linkErr);

  if (link) {
    console.log("\n3. Query in car_clients for business_id = ", link.business_id);
    const { data: business, error: bizErr } = await supabaseAdmin
      .from('car_clients')
      .select('*')
      .eq('id', link.business_id)
      .maybeSingle();
    console.log("Business response:", business, "Error:", bizErr);
  }
}

run();
