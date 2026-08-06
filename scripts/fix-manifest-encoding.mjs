// Repara nombres del manifiesto que perdieron los acentos en algún paso de
// importación: "Producto / presentaci?n 01" se mostraba tal cual en las tarjetas.
// Solo toca el campo `name`, y solo donde la palabra es reconocible; el resto del
// manifiesto (incluido el copy de los anuncios, donde los "?" son legítimos)
// queda intacto. Uso: node --env-file=.env.deploy scripts/fix-manifest-encoding.mjs [--apply]
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'creative-references';
const PATH = 'manifests/starter-static-50.json';
const APPLY = process.argv.includes('--apply');

// Palabras del vocabulario propio de la app, donde el acento se perdió.
const REEMPLAZOS = [
	[/presentaci\?n/g, 'presentación'],
	[/comparaci\?n/g, 'comparación'],
	[/demostraci\?n/g, 'demostración'],
	[/rese\?as?/g, (m) => (m.endsWith('s') ? 'reseñas' : 'reseña')],
	[/promoci\?n/g, 'promoción'],
	[/educaci\?n/g, 'educación'],
	[/a\?o/g, 'año'],
];

const client = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});

const { data, error } = await client.storage.from(BUCKET).download(PATH);
if (error || !data) throw new Error('no se pudo bajar el manifiesto: ' + error?.message);
const manifest = JSON.parse(await data.text());

let cambios = 0;
const muestras = [];
for (const item of manifest.items || []) {
	if (typeof item.name !== 'string' || !item.name.includes('?')) continue;
	let siguiente = item.name;
	for (const [patron, reemplazo] of REEMPLAZOS) siguiente = siguiente.replace(patron, reemplazo);
	if (siguiente !== item.name) {
		if (muestras.length < 10) muestras.push(`${item.name}  →  ${siguiente}`);
		item.name = siguiente;
		cambios += 1;
	}
}

console.log(`nombres reparados: ${cambios}`);
muestras.forEach((m) => console.log('  ' + m));

if (!cambios) process.exit(0);
if (!APPLY) {
	console.log('\n(ensayo — volvé a correr con --apply para escribirlo)');
	process.exit(0);
}

const { error: upErr } = await client.storage.from(BUCKET).upload(PATH, new Blob([JSON.stringify(manifest)], { type: 'application/json' }), {
	upsert: true,
	contentType: 'application/json',
});
if (upErr) throw new Error('no se pudo subir: ' + upErr.message);
console.log('manifiesto actualizado ✓');
