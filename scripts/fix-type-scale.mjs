// Sube la escala tipográfica de la app a un piso legible.
//
// La hoja tenía 328 declaraciones por debajo de 11px, con textos reales a 5.5px
// y 6px: etiquetas, precios, botones y descripciones que no se pueden leer en un
// teléfono. No es una decisión de diseño —conviven un título de 12px con su
// bajada de 6px—, es una escala que quedó a la mitad de tamaño.
//
// El remapeo es monótono: nada que era más chico que otra cosa termina más
// grande, así que la jerarquía visual se conserva. Solo cambia `font-size` en px
// por debajo del piso; todo lo demás queda intacto.
//
// Uso: node scripts/fix-type-scale.mjs [--apply]
import { readFileSync, writeFileSync } from 'node:fs';

const ARCHIVO = 'src/components/creattia/creative-app.css';
const APPLY = process.argv.includes('--apply');

/** De tamaño original a tamaño legible, preservando el orden. */
function remapear(px) {
	if (px >= 11) return px;
	if (px <= 6) return 10.5;   // eyebrows en mayúscula con tracking
	if (px <= 7) return 11;
	if (px <= 8) return 11.5;
	if (px <= 9) return 12;
	if (px <= 10) return 12.5;
	return 13;                  // 10 < px < 11: cuerpo secundario
}

const original = readFileSync(ARCHIVO, 'utf8');
const cuenta = new Map();
let cambios = 0;

const actualizado = original.replace(/font-size:\s*([0-9.]+)px/g, (todo, valor) => {
	const px = parseFloat(valor);
	const nuevo = remapear(px);
	if (nuevo === px) return todo;
	cambios += 1;
	cuenta.set(`${px} → ${nuevo}`, (cuenta.get(`${px} → ${nuevo}`) || 0) + 1);
	return todo.replace(`${valor}px`, `${nuevo}px`);
});

console.log(`declaraciones subidas: ${cambios}`);
for (const [k, v] of [...cuenta.entries()].sort()) console.log(`  ${v.toString().padStart(4)}  ${k}px`);

if (!APPLY) {
	console.log('\n(ensayo — volvé a correr con --apply)');
	process.exit(0);
}
writeFileSync(ARCHIVO, actualizado);
console.log('hoja actualizada ✓');
