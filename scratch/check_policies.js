import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://czocbnyoenjbpxmcqobn.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6b2NibnlvZW5qYnB4bWNxb2JuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mjg0MjkxMywiZXhwIjoyMDY4NDE4OTEzfQ.jyLHl3PaY7wVTbcWZcr4JgoQi8yC459BbQ7UEDtaS6Y";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log("=== RLS POLICIES ON CAR_BUSINESS_ACCOUNTS ===");
  const { data: policies, error } = await supabase.rpc('get_policies_for_table', { table_name: 'car_business_accounts' });
  
  if (error) {
    // If RPC doesn't exist, we can query pg_policies using custom query or inspect
    console.log("RPC get_policies_for_table failed, running direct SQL inspection...");
    
    // Let's run a generic query using a supabase schema query if possible, or just print active tables.
    // Wait, let's try to query pg_policies using supabase.rpc if they have a generic sql executor,
    // otherwise we can read policies from pg_catalog via a query if allowed.
    const { data: directPg, error: pgErr } = await supabase
      .from('pg_policies')
      .select('*')
      .catch(() => ({ data: null, error: 'Cannot query pg_policies directly via postgrest' }));
    
    console.log("pg_policies direct query:", directPg, pgErr);
  } else {
    console.log(policies);
  }
  
  // Since pg_policies is a system view, we can't query it via Postgrest unless it's exposed in the API schema.
  // Let's check if we can run a query to get pg_policies by creating a temporary view or function, 
  // or let's execute a command that inspects policies.
  // Wait, let's write a database function to return pg_policies!
}

run();
