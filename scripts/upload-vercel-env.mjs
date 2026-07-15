import fs from 'fs';
import { spawnSync } from 'child_process';

async function main() {
  if (!fs.existsSync('.env.local')) {
    console.error('Error: .env.local file not found in current directory!');
    process.exit(1);
  }

  console.log('Reading .env.local...');
  const envFile = fs.readFileSync('.env.local', 'utf-8');
  const lines = envFile.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    
    const key = match[1].trim();
    let val = match[2].trim();
    
    // Strip quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    
    if (!key || !val) continue;
    
    console.log(`Adding ${key} to Vercel...`);
    const result = spawnSync('npx', ['vercel', 'env', 'add', key, 'production,preview,development'], {
      input: val,
      encoding: 'utf-8'
    });
    
    if (result.status !== 0) {
      console.error(`Error adding ${key}:`, result.stderr || result.stdout);
    } else {
      console.log(`Successfully added ${key}!`);
    }
  }
  console.log('Environment variables upload completed.');
}

main().catch(console.error);
