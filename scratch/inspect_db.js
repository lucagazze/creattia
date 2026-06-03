import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://czocbnyoenjbpxmcqobn.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("=== AUTH USERS ===");
  const { data: { users }, error: errUsers } = await supabase.auth.admin.listUsers();
  if (errUsers) console.error("Error listing users:", errUsers);
  else {
    users.forEach(u => {
      console.log(`- ID: ${u.id} | Email: ${u.email} | Created: ${u.created_at} | Provider: ${u.app_metadata?.provider} | Metadata:`, u.user_metadata);
    });
  }

  console.log("\n=== CAR CLIENTS ===");
  const { data: clients, error: errClients } = await supabase.from('car_clients').select('id, business_name, user_id, is_admin');
  if (errClients) console.error("Error fetching clients:", errClients);
  else {
    clients.forEach(c => {
      console.log(`- ID: ${c.id} | Name: ${c.business_name} | user_id: ${c.user_id} | is_admin: ${c.is_admin}`);
    });
  }

  console.log("\n=== CAR BUSINESS ACCOUNTS ===");
  const { data: accounts, error: errAccounts } = await supabase.from('car_business_accounts').select('*');
  if (errAccounts) console.error("Error fetching business accounts:", errAccounts);
  else {
    accounts.forEach(a => {
      console.log(`- ID: ${a.id} | biz_id: ${a.business_id} | user_id: ${a.user_id} | email: ${a.email} | created: ${a.created_at}`);
    });
  }
}

run();
