/**
 * Cliente de Supabase falso, en memoria, para poder ejecutar los endpoints de
 * verdad en los tests.
 *
 * Soporta el subconjunto que usa la app: `from().select().eq().in().maybeSingle()`,
 * `insert().select()`, `update().eq().in().select()`, `delete()`, `rpc()` y
 * `storage.from().download()/upload()/createSignedUrl()/remove()`.
 *
 * La cadena es "thenable": se puede await en cualquier punto, igual que la real.
 */

type Row = Record<string, any>;
type Filter = { op: 'eq' | 'in' | 'lt' | 'lte' | 'gt' | 'gte' | 'neq'; column: string; value: any } | { op: 'or'; conditions: string };

export type RpcHandler = (args: Record<string, any>) => { data?: any; error?: any } | Promise<{ data?: any; error?: any }>;

export type FakeSupabaseOptions = {
	tables?: Record<string, Row[]>;
	/** Objetos de storage: `${bucket}/${path}` → bytes. */
	storage?: Record<string, Uint8Array>;
	rpc?: Record<string, RpcHandler>;
};

/** `claimed_at.is.null,claimed_at.lt.2026-01-01` → pasa si CUALQUIERA se cumple. */
function matchesOr(row: Row, conditions: string) {
	return conditions.split(',').some((condition) => {
		const [column, op, ...rest] = condition.split('.');
		const value = row[column];
		const operand = rest.join('.');
		if (op === 'is') return operand === 'null' ? value === null || value === undefined : String(value) === operand;
		if (op === 'lt') return value != null && String(value) < operand;
		if (op === 'lte') return value != null && String(value) <= operand;
		if (op === 'gt') return value != null && String(value) > operand;
		if (op === 'gte') return value != null && String(value) >= operand;
		if (op === 'eq') return String(value) === operand;
		return false;
	});
}

function matches(row: Row, filters: Filter[]) {
	return filters.every((filter) => {
		if (filter.op === 'or') return matchesOr(row, filter.conditions);
		const value = row[filter.column];
		if (filter.op === 'eq') return value === filter.value;
		if (filter.op === 'neq') return value !== filter.value;
		if (filter.op === 'in') return (filter.value as any[]).includes(value);
		if (filter.op === 'lt') return value < filter.value;
		if (filter.op === 'lte') return value <= filter.value;
		if (filter.op === 'gt') return value > filter.value;
		if (filter.op === 'gte') return value >= filter.value;
		return true;
	});
}

export function createFakeSupabase(options: FakeSupabaseOptions = {}) {
	const tables: Record<string, Row[]> = {};
	for (const [name, rows] of Object.entries(options.tables || {})) {
		tables[name] = rows.map((row) => ({ ...row }));
	}
	const storage: Record<string, Uint8Array> = { ...(options.storage || {}) };
	const rpcHandlers = { ...(options.rpc || {}) };

	/** Todo lo que pasó, para poder afirmar sobre efectos y no solo sobre la respuesta. */
	const calls = {
		rpc: [] as Array<{ name: string; args: Record<string, any> }>,
		uploads: [] as Array<{ bucket: string; path: string; size: number }>,
		removed: [] as Array<{ bucket: string; paths: string[] }>,
	};

	function table(name: string) {
		if (!tables[name]) tables[name] = [];
		return tables[name];
	}

	function builder(tableName: string) {
		const filters: Filter[] = [];
		let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
		let payload: Row[] = [];
		let wantsSingle: 'maybe' | 'single' | null = null;
		let returning = false;

		const run = () => {
			const rows = table(tableName);
			if (mode === 'insert') {
				// La tabla real tiene `created_at timestamptz default now()`. Sin
				// esto, cualquier consulta que filtre por fecha no encontraba nada
				// acá aunque en producción sí encuentre.
				// El índice dentro del lote es imprescindible: `rows.length` todavía
				// no cambió —el push viene después—, así que insertar tres filas de
				// una les daba el MISMO id a las tres. Después un
				// `update().eq('id', …)` sobre una sola tocaba las tres, y un lote
				// con una imagen fallida se veía como un lote entero completado.
				// La tabla real tiene clave primaria: esto emula esa garantía.
				const inserted = payload.map((row, index) => ({
					id: row.id ?? `row-${rows.length + index + 1}`,
					created_at: new Date().toISOString(),
					...row,
				}));
				rows.push(...inserted);
				return { data: returning ? inserted : null, error: null };
			}
			if (mode === 'update') {
				const affected: Row[] = [];
				for (const row of rows) {
					if (!matches(row, filters)) continue;
					Object.assign(row, payload[0]);
					affected.push(row);
				}
				const data = wantsSingle ? affected[0] ?? null : affected;
				return { data: returning || wantsSingle ? data : null, error: null };
			}
			if (mode === 'delete') {
				const kept = rows.filter((row) => !matches(row, filters));
				// `delete().select()` devuelve las filas borradas, igual que el cliente
				// real. Sin esto no se puede comprobar QUÉ se borró, que es justamente
				// lo que hace falta cuando el borrado puede alcanzar cero filas.
				const borradas = rows.filter((row) => matches(row, filters));
				tables[tableName] = kept;
				const data = wantsSingle ? borradas[0] ?? null : borradas;
				return { data: returning || wantsSingle ? data : null, error: null, count: borradas.length };
			}
			const found = rows.filter((row) => matches(row, filters));
			if (wantsSingle === 'maybe') return { data: found[0] ?? null, error: null };
			if (wantsSingle === 'single') {
				return found.length === 1
					? { data: found[0], error: null }
					: { data: null, error: { message: 'no single row', code: 'PGRST116' } };
			}
			return { data: found, error: null, count: found.length };
		};

		const chain: any = {
			select(_columns?: string, opts?: { head?: boolean; count?: string }) {
				if (mode === 'select') mode = 'select';
				else returning = true;
				if (opts?.head) wantsSingle = null;
				return chain;
			},
			insert(rows: Row | Row[]) { mode = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return chain; },
			upsert(rows: Row | Row[]) { mode = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return chain; },
			update(row: Row) { mode = 'update'; payload = [row]; return chain; },
			delete() { mode = 'delete'; return chain; },
			eq(column: string, value: any) { filters.push({ op: 'eq', column, value }); return chain; },
			neq(column: string, value: any) { filters.push({ op: 'neq', column, value }); return chain; },
			in(column: string, value: any[]) { filters.push({ op: 'in', column, value }); return chain; },
			or(conditions: string) { filters.push({ op: 'or', conditions }); return chain; },
			lt(column: string, value: any) { filters.push({ op: 'lt', column, value }); return chain; },
			lte(column: string, value: any) { filters.push({ op: 'lte', column, value }); return chain; },
			gt(column: string, value: any) { filters.push({ op: 'gt', column, value }); return chain; },
			gte(column: string, value: any) { filters.push({ op: 'gte', column, value }); return chain; },
			order() { return chain; },
			limit() { return chain; },
			maybeSingle() { wantsSingle = 'maybe'; return chain; },
			single() { wantsSingle = 'single'; return chain; },
			then(resolve: (value: any) => any, reject?: (reason: any) => any) {
				try { return Promise.resolve(run()).then(resolve, reject); }
				catch (error) { return Promise.reject(error).catch(reject); }
			},
		};
		return chain;
	}

	const client = {
		from: (name: string) => builder(name),
		rpc: async (name: string, args: Record<string, any>) => {
			calls.rpc.push({ name, args });
			const handler = rpcHandlers[name];
			if (!handler) {
				// Igual que Postgres cuando la función no existe.
				return { data: null, error: { code: '42883', message: `function ${name} does not exist` } };
			}
			return { data: null, error: null, ...(await handler(args)) };
		},
		storage: {
			from: (bucket: string) => ({
				async download(path: string) {
					const bytes = storage[`${bucket}/${path}`];
					if (!bytes) return { data: null, error: { message: 'Object not found' } };
					return {
						data: {
							type: 'image/png',
							arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
							text: async () => Buffer.from(bytes).toString('utf8'),
						},
						error: null,
					};
				},
				async upload(path: string, body: Uint8Array | Buffer) {
					const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
					storage[`${bucket}/${path}`] = bytes;
					calls.uploads.push({ bucket, path, size: bytes.byteLength });
					return { data: { path }, error: null };
				},
				async createSignedUrl(path: string) {
					return { data: { signedUrl: `https://signed.test/${bucket}/${path}` }, error: null };
				},
				async createSignedUrls(paths: string[]) {
					return { data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${bucket}/${path}` })), error: null };
				},
				async remove(paths: string[]) {
					calls.removed.push({ bucket, paths });
					for (const path of paths) delete storage[`${bucket}/${path}`];
					return { data: null, error: null };
				},
			}),
		},
	};

	return { client, tables, storage, calls };
}

/**
 * Le pone clave primaria a las tablas que el código usa como candado.
 *
 * Toda la protección contra acreditar dos veces —la compra suelta, la factura de
 * la suscripción, el mes del plan anual— está apoyada en el mismo truco: se
 * inserta primero y se acredita solo si el insert entró, porque un choque contra
 * la clave primaria (23505) ES la señal de "esto ya se acreditó".
 *
 * Este cliente falso no tiene índices, así que sin esto las pruebas de reintentos
 * estarían midiendo el comportamiento del doble y no el de producción: pasarían
 * igual aunque la protección no existiera.
 *
 * `claves` mapea tabla → columna que hace de clave primaria.
 */
export function aplicarClavesPrimarias(
	fake: { client: any; tables: Record<string, Row[]> },
	claves: Record<string, string>,
) {
	const fromOriginal = fake.client.from.bind(fake.client);
	fake.client.from = ((tabla: string) => {
		const chain = fromOriginal(tabla);
		const columna = claves[tabla];
		if (!columna) return chain;
		const insertOriginal = chain.insert.bind(chain);
		chain.insert = (rows: Row | Row[]) => {
			const nuevas = Array.isArray(rows) ? rows : [rows];
			const repetida = nuevas.some((fila) => (fake.tables[tabla] || [])
				.some((existente: Row) => existente[columna] === fila[columna]));
			if (repetida) {
				const fallo = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
				return { ...chain, select: () => fallo, then: (resolver: (valor: any) => any) => resolver(fallo) };
			}
			return insertOriginal(rows);
		};
		return chain;
	});
}

/** PNG mínimo válido: alcanza para que el código detecte el tipo por sus bytes. */
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
