import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://czocbnyoenjbpxmcqobn.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("Checking car_clients for Mercado Libre connections...");
  const { data: clients, error: err } = await supabase
    .from('car_clients')
    .select('id, business_name, mercadolibre_user_id, mercadolibre_expiration, connection_statuses')
    .not('mercadolibre_user_id', 'is', null);

  if (err) {
    console.error("Error querying connected clients:", err);
  } else {
    console.log("Connected clients details:", JSON.stringify(clients, null, 2));
  }
}

run();
