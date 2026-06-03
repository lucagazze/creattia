import { db } from '../services/db.js';

// We need to set up supabase / supabaseAdmin first, or just run the function.
// Let's import the file directly.
async function run() {
  const userId = '8bc98369-50fb-4420-9470-fd33f17d8bbd';
  const email = 'algoritmiadesarrollos@gmail.com';
  
  console.log("Calling db.profile.getByUserId...");
  try {
    const profile = await db.profile.getByUserId(userId, email);
    console.log("Profile returned:", profile);
  } catch (err) {
    console.error("Error in getByUserId:", err);
  }
}

run();
