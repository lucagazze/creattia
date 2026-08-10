import assert from 'node:assert/strict';
import { describe, test, beforeEach } from 'vitest';
import { capturarOrigen, leerOrigen, origenEnUnaLinea, origenParaEvento } from '../src/lib/creattia/utm';

/**
 * De dónde vino cada persona.
 *
 * Las campañas ya llevaban UTMs en los enlaces y nadie las leía: llegaban en la
 * URL y se perdían en la primera navegación. Un dato de origen que no se captura
 * en el momento no se recupera nunca, así que lo que se prueba acá es sobre todo
 * cuándo NO hay que pisarlo.
 */
function montarNavegador(busqueda: string, guardado?: string) {
	const datos = new Map<string, string>();
	if (guardado) datos.set('creattia:origen', guardado);
	(globalThis as any).window = {
		location: { search: busqueda, pathname: '/' },
		localStorage: {
			getItem: (k: string) => (datos.has(k) ? datos.get(k)! : null),
			setItem: (k: string, v: string) => { datos.set(k, v); },
			removeItem: (k: string) => { datos.delete(k); },
		},
	};
	return datos;
}

describe('capturar de dónde vino', () => {
	beforeEach(() => { montarNavegador(''); });

	test('lee las UTMs de la URL y las guarda', () => {
		montarNavegador('?utm_source=facebook&utm_medium=cpc&utm_campaign=retargeting');
		const origen = capturarOrigen();
		assert.equal(origen?.utm_source, 'facebook');
		assert.equal(origen?.utm_campaign, 'retargeting');
		assert.equal(leerOrigen()?.utm_medium, 'cpc');
	});

	/**
	 * El PRIMER toque, no el último. Quien llega por un anuncio, se va y vuelve
	 * tipeando la dirección vino igual por ese anuncio: pisarlo con la visita
	 * directa es como una campaña que funciona termina figurando sin altas.
	 */
	test('una visita directa posterior no pisa el origen', () => {
		montarNavegador('', JSON.stringify({ utm_source: 'facebook', utm_campaign: 'lanzamiento', guardadoEn: 1 }));
		assert.equal(capturarOrigen()?.utm_campaign, 'lanzamiento');
	});

	test('una segunda campaña tampoco lo pisa', () => {
		montarNavegador('?utm_source=google&utm_campaign=marca', JSON.stringify({ utm_source: 'facebook', utm_campaign: 'lanzamiento', guardadoEn: 1 }));
		assert.equal(capturarOrigen()?.utm_source, 'facebook');
	});

	/** Sin UTMs y sin nada guardado no se inventa un origen vacío. */
	test('sin nada, no hay origen', () => {
		const datos = montarNavegador('');
		assert.equal(capturarOrigen(), null);
		assert.equal(datos.has('creattia:origen'), false);
	});

	/** Facebook agrega fbclid solo: vino de Meta aunque falten las UTMs. */
	test('el fbclid solo también cuenta como origen', () => {
		montarNavegador('?fbclid=IwAR123');
		assert.equal(capturarOrigen()?.fbclid, 'IwAR123');
	});

	/** Un parámetro larguísimo no puede engordar cada evento que se escriba. */
	test('los valores se acotan', () => {
		montarNavegador(`?utm_campaign=${'x'.repeat(400)}`);
		assert.equal(capturarOrigen()?.utm_campaign?.length, 120);
	});
});

describe('cómo se lee un origen', () => {
	test('en una línea, en el orden en que se piensa', () => {
		assert.equal(
			origenEnUnaLinea({ utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'retargeting' }),
			'facebook · cpc · retargeting',
		);
	});

	test('con fbclid solo, dice que vino de Meta sin etiquetar', () => {
		assert.equal(origenEnUnaLinea({ fbclid: 'abc' }), 'Meta (sin UTM)');
	});

	test('sin origen no deja un texto suelto', () => {
		assert.equal(origenEnUnaLinea(null), '');
	});

	/** Al evento solo van los campos de origen, nunca la fecha ni la landing. */
	test('para el evento viajan solo las UTMs', () => {
		const props = origenParaEvento({ utm_source: 'facebook', guardadoEn: 123, landing: '/' } as any);
		assert.deepEqual(props, { utm_source: 'facebook' });
	});
});
