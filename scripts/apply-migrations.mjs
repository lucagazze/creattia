/**
 * Aplica las migraciones pendientes en orden, con el paso manual del medio ya
 * resuelto.
 *
 * La versión anterior de este script no funcionaba: posteaba a `/rest/v1/rpc/`,
 * que solo llama funciones ya existentes y no puede ejecutar DDL. Esta usa la
 * Management API de Supabase, que sí corre SQL arbitrario.
 *
 * Necesita:
 *   SUPABASE_ACCESS_TOKEN   token personal (Account → Access Tokens, empieza con sbp_)
 *   SUPABASE_PROJECT_REF    ref del proyecto (o se toma de supabase/.temp/project-ref)
 *   SUPABASE_SERVICE_ROLE_KEY + PUBLIC_SUPABASE_URL  (para copiar la muestra de la landing)
 *
 *   node --env-file=.env.deploy scripts/apply-migrations.mjs
 *   node --env-file=.env.deploy scripts/apply-migrations.mjs --dry-run
 *
 * Es idempotente: registra lo aplicado en supabase_migrations.schema_migrations,
 * la misma tabla que usa el CLI oficial, así que convive con `supabase db push`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MIGRATIONS_DIR = 'supabase/migrations';
// Antes de cerrar el bucket de la biblioteca hay que copiar la muestra pública,
// si no la landing queda sin imágenes.
const COPY_SHOWCASE_BEFORE = '20260806002000_private_reference_bucket.sql';

const dryRun = process.argv.includes('--dry-run');
const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF
	|| fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim().replace(/\s+/g, '');

if (!token) {
	console.error(`
Falta SUPABASE_ACCESS_TOKEN.

  1. https://supabase.com/dashboard/account/tokens → "Generate new token"
  2. Guardalo en un archivo que NO se commitea, por ejemplo .env.deploy:

       SUPABASE_ACCESS_TOKEN=sbp_...
       SUPABASE_PROJECT_REF=${projectRef}
       PUBLIC_SUPABASE_URL=https://${projectRef}.supabase.co
       SUPABASE_SERVICE_ROLE_KEY=...

  3. node --env-file=.env.deploy scripts/apply-migrations.mjs
`);
	process.exit(1);
}

async function runSQL(sql) {
	const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ query: sql }),
	});
	const text = await response.text();
	if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 400)}`);
	try { return JSON.parse(text); } catch { return text; }
}

// ── Qué falta aplicar ────────────────────────────────────────────────────────
await runSQL(`
	create schema if not exists supabase_migrations;
	create table if not exists supabase_migrations.schema_migrations (version text primary key);
`);

const applied = new Set(
	(await runSQL('select version from supabase_migrations.schema_migrations'))
		.map((row) => String(row.version)),
);

const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
const pending = files.filter((name) => !applied.has(name.split('_')[0]));

console.log(`\nProyecto ${projectRef}`);
console.log(`${files.length} migraciones en el repo, ${applied.size} ya aplicadas, ${pending.length} pendientes.\n`);

if (!pending.length) {
	console.log('No hay nada que aplicar.\n');
	process.exit(0);
}
for (const name of pending) console.log(`  · ${name}`);
if (dryRun) {
	console.log('\n--dry-run: no se aplicó nada.\n');
	process.exit(0);
}

// ── Aplicar ──────────────────────────────────────────────────────────────────
for (const name of pending) {
	// El paso manual del medio, automatizado: copiar la muestra pública ANTES de
	// cerrar el bucket de la biblioteca.
	if (name === COPY_SHOWCASE_BEFORE) {
		console.log('\n→ Copiando la muestra pública de la landing antes de cerrar el bucket…');
		if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.PUBLIC_SUPABASE_URL) {
			console.error(
				'  Faltan PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para copiar los assets.\n'
				+ '  Se corta acá: aplicar esta migración ahora dejaría la landing sin imágenes.',
			);
			process.exit(1);
		}
		const result = spawnSync(process.execPath, ['scripts/publish-showcase-assets.mjs'], { stdio: 'inherit' });
		if (result.status !== 0) {
			console.error('  La copia falló. No se cierra el bucket.');
			process.exit(1);
		}
	}

	process.stdout.write(`\n→ ${name} … `);
	const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
	try {
		await runSQL(sql);
		await runSQL(
			`insert into supabase_migrations.schema_migrations (version) values ('${name.split('_')[0]}') on conflict do nothing`,
		);
		console.log('ok');
	} catch (error) {
		console.log('FALLÓ');
		console.error(`\n${error.message}\n`);
		console.error('Las anteriores quedaron aplicadas. Corregí y volvé a correr: es idempotente.\n');
		process.exit(1);
	}
}

console.log('\nListo. Verificá con: npm run diagnose\n');
