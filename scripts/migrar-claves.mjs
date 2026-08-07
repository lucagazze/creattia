/**
 * Migra las apps de las claves legacy de Supabase a las nuevas.
 *
 * La `service_role` legacy quedó expuesta. No se puede simplemente apagar: las
 * claves legacy (`anon` y `service_role`) se apagan juntas, y de este proyecto
 * dependen tres apps en producción. La salida es que las dos generaciones
 * conviven — se mueve app por app a las claves nuevas, se verifica cada una, y
 * recién cuando no queda nada usando las viejas se apagan.
 *
 * NADA DE ESTO TOCA DATOS. Solo cambia credenciales: qué clave presenta cada app
 * para entrar. Las tablas, el storage y los usuarios quedan igual.
 *
 * La clave nunca se imprime ni pasa por ningún lado más que de Supabase a
 * Vercel. Para volver atrás no hace falta respaldar nada: lo que había son las
 * claves legacy, y siguen estando en Supabase mientras no se apaguen.
 *
 *   node --env-file=.env.deploy scripts/migrar-claves.mjs
 *       Mira y verifica. No cambia nada.
 *
 *   node --env-file=.env.deploy scripts/migrar-claves.mjs --aplicar creattia
 *       Cambia las variables de esa app y deja el despliegue pendiente.
 *
 *   node --env-file=.env.deploy scripts/migrar-claves.mjs --revertir creattia
 *       Vuelve a las claves anteriores.
 */
import fs from 'node:fs';
import os from 'node:os';
import { createClient } from '@supabase/supabase-js';

const argumentos = process.argv.slice(2);
const aplicar = argumentos.includes('--aplicar') ? argumentos[argumentos.indexOf('--aplicar') + 1] : null;
const revertir = argumentos.includes('--revertir') ? argumentos[argumentos.indexOf('--revertir') + 1] : null;

/**
 * Qué variable de cada app recibe cada clave.
 *
 * Los nombres no coinciden entre apps —una usa `PUBLIC_SUPABASE_*`, otra
 * `VITE_SUPABASE_*`— y por eso el mapeo va explícito: adivinarlo por patrón es
 * como se rompe una app sin darse cuenta.
 */
const APPS = {
	creattia: {
		secreta: ['SUPABASE_SERVICE_ROLE_KEY'],
		publica: ['PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
	},
	'car-saas': {
		secreta: ['SUPABASE_SERVICE_ROLE_KEY'],
		publica: ['SUPABASE_ANON_KEY'],
	},
	'car-clientes': {
		secreta: ['SUPABASE_SERVICE_ROLE_KEY'],
		publica: ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'],
	},
};

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const url = process.env.PUBLIC_SUPABASE_URL;
if (!accessToken || !ref || !url) {
	console.error('Faltan SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF o PUBLIC_SUPABASE_URL en .env.deploy');
	process.exit(1);
}

const vercelToken = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, 'utf8')).token;
const vercel = async (ruta, opciones = {}) => {
	const respuesta = await fetch(`https://api.vercel.com${ruta}`, {
		...opciones,
		headers: { authorization: `Bearer ${vercelToken}`, 'content-type': 'application/json', ...(opciones.headers || {}) },
	});
	const cuerpo = await respuesta.json().catch(() => ({}));
	if (!respuesta.ok) throw new Error(`Vercel ${respuesta.status}: ${JSON.stringify(cuerpo.error || cuerpo).slice(0, 200)}`);
	return cuerpo;
};

// ── 1. Las claves nuevas, directo de Supabase ──────────────────────────────
const respuestaClaves = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
	headers: { authorization: `Bearer ${accessToken}` },
});
if (!respuestaClaves.ok) {
	console.error(`No se pudieron leer las claves del proyecto (${respuestaClaves.status}). Revisá que SUPABASE_ACCESS_TOKEN siga vigente.`);
	process.exit(1);
}
const claves = await respuestaClaves.json();
const buscar = (tipo) => claves.find((clave) => clave.type === tipo)?.api_key;
const secretaNueva = buscar('secret');
const publicaNueva = buscar('publishable');
const legacyPresentes = claves.filter((clave) => clave.type === 'legacy').map((clave) => clave.name);

console.log(`\nProyecto ${ref}`);
console.log(`  clave secreta nueva     ${secretaNueva ? 'disponible' : 'NO EXISTE — creála en el panel'}`);
console.log(`  clave pública nueva     ${publicaNueva ? 'disponible' : 'NO EXISTE — creála en el panel'}`);
console.log(`  claves legacy activas   ${legacyPresentes.join(', ') || 'ninguna'}`);
if (!secretaNueva || !publicaNueva) process.exit(1);

// ── 2. Probar que las nuevas realmente sirven, antes de tocar nada ─────────
// Cambiar la variable y descubrir después que la clave no anda es la forma
// segura de dejar una app caída sin saber por qué.
console.log('\nVerificando las claves nuevas contra el proyecto…');
const conSecreta = createClient(url, secretaNueva, { auth: { persistSession: false } });
const { error: errorSecreta } = await conSecreta.from('creative_profiles').select('user_id', { count: 'exact', head: true });
console.log(`  secreta: ${errorSecreta ? `FALLA — ${errorSecreta.message}` : 'lee la base con permisos completos'}`);
const { data: buckets, error: errorStorage } = await conSecreta.storage.listBuckets();
console.log(`  secreta: ${errorStorage ? `storage FALLA — ${errorStorage.message}` : `ve los ${buckets.length} buckets`}`);
const conPublica = createClient(url, publicaNueva, { auth: { persistSession: false } });
const { error: errorPublica } = await conPublica.auth.getSession();
console.log(`  pública: ${errorPublica ? `FALLA — ${errorPublica.message}` : 'responde el endpoint de sesión'}`);
if (errorSecreta || errorStorage) {
	console.error('\nLa clave secreta nueva no tiene el acceso esperado. No se cambia nada.');
	process.exit(1);
}

// ── 3. Estado actual de cada app en Vercel ────────────────────────────────
const { teams } = await vercel('/v2/teams');
const equipo = teams?.[0]?.id;
const sufijo = equipo ? `?teamId=${equipo}` : '';
const { projects } = await vercel(`/v9/projects${equipo ? `?teamId=${equipo}&limit=100` : '?limit=100'}`);

const tipoDe = (valor) => (valor?.startsWith('sb_secret_') ? 'nueva secreta'
	: valor?.startsWith('sb_publishable_') ? 'nueva pública'
	: valor?.startsWith('eyJ') ? 'LEGACY' : 'cifrada por Vercel, no legible');

/**
 * Para volver atrás no hace falta guardar nada.
 *
 * Vercel devuelve cifrado el valor de una variable marcada como sensible, así
 * que no se puede respaldar lo que había. No importa: lo que había son las
 * claves legacy, y esas siguen estando en Supabase mientras no se apaguen. El
 * revertir las vuelve a pedir ahí. Un secreto menos escrito en disco.
 */
const legacyDe = (nombre) => claves.find((clave) => clave.type === 'legacy' && clave.name === nombre)?.api_key;

for (const [nombreApp, mapeo] of Object.entries(APPS)) {
	const proyecto = projects.find((item) => item.name === nombreApp);
	if (!proyecto) { console.log(`\n${nombreApp}: no está en esta cuenta de Vercel`); continue; }
	const { envs } = await vercel(`/v10/projects/${proyecto.id}/env${equipo ? `?teamId=${equipo}&decrypt=true` : '?decrypt=true'}`);
	console.log(`\n${nombreApp}`);

	const objetivo = revertir === nombreApp ? 'revertir' : aplicar === nombreApp ? 'aplicar' : 'mirar';
	for (const [rol, nombres] of [['secreta', mapeo.secreta], ['publica', mapeo.publica]]) {
		for (const nombreVar of nombres) {
			const variable = envs.find((item) => item.key === nombreVar && item.target?.includes('production'));
			if (!variable) { console.log(`  ${nombreVar.padEnd(34)} no existe en producción`); continue; }
			const actual = variable.value || '';
			console.log(`  ${nombreVar.padEnd(34)} ${tipoDe(actual)}`);

			if (objetivo === 'mirar') continue;
			const nueva = objetivo === 'revertir'
				? legacyDe(rol === 'secreta' ? 'service_role' : 'anon')
				: (rol === 'secreta' ? secretaNueva : publicaNueva);
			if (!nueva) {
				console.log(`     sin valor para ${objetivo === 'revertir' ? 'revertir — ¿ya apagaste las legacy?' : 'aplicar'}`);
				continue;
			}
			await vercel(`/v9/projects/${proyecto.id}/env/${variable.id}${sufijo}`, {
				method: 'PATCH',
				body: JSON.stringify({ value: nueva }),
			});
			console.log(`     → ${objetivo === 'revertir' ? 'restaurada la anterior' : `cambiada a ${tipoDe(nueva)}`}`);
		}
	}
}

if (aplicar || revertir) {
	console.log(`\nLas variables quedaron cambiadas, pero Vercel usa el valor del último build:`);
	console.log(`  hay que volver a desplegar ${aplicar || revertir} para que tome efecto.`);
	console.log(`\nPara volver atrás:  node --env-file=.env.deploy scripts/migrar-claves.mjs --revertir ${aplicar || revertir}`);
} else {
	console.log(`\nEsto fue solo lectura. Para cambiar una app:`);
	console.log(`  node --env-file=.env.deploy scripts/migrar-claves.mjs --aplicar creattia`);
}
console.log(`\nLas claves legacy siguen activas: nada dejó de funcionar todavía.\n`);
