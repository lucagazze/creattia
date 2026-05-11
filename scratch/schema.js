import fs from 'fs';
const content = fs.readFileSync('c:/Users/lucag/Desktop/CLAUDE/APPS/APPS/Gestion C.A.R/services/supabase.ts', 'utf8');
const keyMatch = content.match(/const SUPABASE_ANON_KEY = ['"]([^'"]+)['"]/);
if (keyMatch) {
  fetch('https://czocbnyoenjbpxmcqobn.supabase.co/rest/v1/', { headers: { apikey: keyMatch[1] } })
    .then(r => r.json())
    .then(d => {
      if (d.definitions && d.definitions.car_clients) {
        console.log('Columns:', Object.keys(d.definitions.car_clients.properties));
      } else { console.log('car_clients not found'); }
    });
}
