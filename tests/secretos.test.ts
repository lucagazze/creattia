import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'vitest';

/**
 * Que no se vuelva a subir una credencial al repositorio.
 *
 * El repositorio es público, y en su historial quedó un `.env` con la clave
 * `service_role` de Supabase —la que se saltea todas las políticas de acceso y
 * puede leer y escribir la base entera—. Borrar el archivo en el commit
 * siguiente no la saca del historial: cualquiera que clone el repositorio la
 * puede recuperar. La clave hay que rotarla desde el panel de Supabase; esto es
 * para que no vuelva a pasar.
 *
 * Corre sobre el árbol actual, que es lo que se puede arreglar desde acá: si
 * alguien agrega un archivo con secretos, el test falla antes del despliegue.
 */

const raiz = new URL('..', import.meta.url).pathname;

function archivosVersionados(): string[] {
	try {
		return execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' }).split('\n').filter(Boolean);
	} catch {
		return [];
	}
}

describe('ningún secreto versionado', () => {
	const versionados = archivosVersionados();

	test('no hay archivos de entorno en el repositorio', () => {
		// `.env.example` sí: son los nombres de las variables, sin valores.
		const entorno = versionados.filter((ruta) => /(^|\/)\.env(\.|$)/.test(ruta) && !ruta.endsWith('.env.example'));
		assert.deepEqual(entorno, [], `estos archivos de entorno están versionados: ${entorno.join(', ')}`);
	});

	test('el .gitignore cubre las variantes de .env y las credenciales de despliegue', async () => {
		const ignorados = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
		for (const patron of ['.env', '.env.deploy']) {
			assert.ok(ignorados.includes(patron), `falta ignorar ${patron}`);
		}
	});

	test('el ejemplo de configuración no trae valores reales', async () => {
		const ejemplo = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
		// Una clave de servicio de Supabase es un JWT: tres bloques separados por
		// puntos que empiezan por `eyJ`. Si aparece uno acá, es un valor de verdad.
		assert.equal(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(ejemplo), false, 'hay un JWT real en .env.example');
		assert.equal(/sk-[A-Za-z0-9]{20,}/.test(ejemplo), false, 'hay una clave de OpenAI real en .env.example');
		assert.equal(/APP_USR-[0-9]{6,}/.test(ejemplo), false, 'hay un token de Mercado Pago real en .env.example');
	});

	test('ningún archivo del código trae una credencial embebida', async () => {
		const sospechosos = versionados.filter((ruta) => /^(src|scripts|supabase)\//.test(ruta) && /\.(ts|tsx|mjs|js|astro|sql)$/.test(ruta));
		const hallazgos: string[] = [];
		for (const ruta of sospechosos) {
			// `git ls-files` lista lo versionado, que puede incluir algo ya borrado
			// del disco y todavía no confirmado. Eso no es un hallazgo.
			const contenido = await readFile(new URL(`../${ruta}`, import.meta.url), 'utf8').catch(() => '');
			// El identificador del píxel y las claves anónimas son públicos por
			// diseño; lo que no puede estar es un JWT de servicio o un token secreto.
			if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{40,}\./.test(contenido)) hallazgos.push(`${ruta}: JWT embebido`);
			if (/sk-[A-Za-z0-9]{32,}/.test(contenido)) hallazgos.push(`${ruta}: clave de OpenAI`);
			if (/APP_USR-\d{6,}-\d{6}/.test(contenido)) hallazgos.push(`${ruta}: token de Mercado Pago`);
		}
		assert.deepEqual(hallazgos, [], `credenciales embebidas en el código:\n${hallazgos.join('\n')}`);
	});
});
