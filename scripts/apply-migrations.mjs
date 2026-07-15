/**
 * Applies all SQL migrations directly to Supabase using the REST API
 * since we can't run `supabase db push` without Docker
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan variables de entorno');
  process.exit(1);
}

const migrationsDir = './supabase/migrations';
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

console.log(`Encontradas ${files.length} migraciones:\n`);
files.forEach(f => console.log(`  ${f}`));

// Execute SQL via Supabase SQL API
async function execSQL(sql, label) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Error en ${label}: ${text.slice(0, 200)}`);
    return false;
  }
  return true;
}

// Use the pg connection via Supabase's SQL endpoint
async function runSQL(sql, label) {
  const endpoint = `${SUPABASE_URL}/pg/query`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    console.log(`✅ ${label}`);
    return true;
  } else {
    const text = await res.text();
    // Try alternative endpoint
    return false;
  }
}

// The Supabase Management API approach
const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
console.log(`\nProyecto: ${projectRef}`);
console.log('\nPara aplicar las migraciones necesitamos usar la Supabase Management API.');
console.log('Ejecutando migraciones via psql directo...\n');

// Try using psql if available  
import { spawnSync } from 'child_process';

// Extract DB connection string from Supabase URL
// Format: postgresql://postgres.{ref}:{password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres
const dbUrl = `postgresql://postgres.${projectRef}:${SERVICE_KEY.slice(0, 20)}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

console.log('Intentando conectar via psql...');
const psqlCheck = spawnSync('psql', ['--version'], { encoding: 'utf-8' });
if (psqlCheck.status !== 0) {
  console.log('psql no disponible. Las migraciones deben aplicarse manualmente.');
  console.log('\n📋 INSTRUCCIONES PARA APLICAR MANUALMENTE:');
  console.log('1. Ve a https://supabase.com/dashboard/project/' + projectRef + '/editor');
  console.log('2. Pega y ejecuta el contenido de cada archivo SQL en orden:');
  files.forEach((f, i) => {
    console.log(`   ${i+1}. supabase/migrations/${f}`);
  });
  process.exit(0);
}

// Try running migrations via psql
let allOk = true;
for (const file of files) {
  const sqlPath = path.join(migrationsDir, file);
  const result = spawnSync('psql', [dbUrl, '-f', sqlPath, '--no-password'], {
    encoding: 'utf-8',
    timeout: 30000,
  });
  
  if (result.status === 0) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file}: ${(result.stderr || result.stdout || '').slice(0, 200)}`);
    allOk = false;
  }
}

if (allOk) {
  console.log('\n✅ Todas las migraciones aplicadas exitosamente!');
} else {
  console.log('\n⚠️  Algunas migraciones fallaron.');
}
