/**
 * Soltar el "ingresando…" cuando la persona vuelve sin haber ingresado.
 *
 * El ingreso con Google se va de la página: el navegador nos manda al proveedor
 * y acá no vuelve a correr nada. Si no se completa —cancela, vuelve atrás,
 * cierra la ventana del proveedor— nadie avisa que terminó y el estado de
 * "ingresando" queda prendido. Con el caché de ida y vuelta es peor: al volver
 * atrás la pestaña se restaura tal cual estaba, con el mismo React vivo y el
 * mismo estado prendido, así que ni siquiera hay una carga nueva que lo limpie.
 * Se veía como el botón "Ingresar" en gris para siempre, y la única salida era
 * recargar a mano.
 *
 * Los tres eventos son la misma pregunta hecha de tres maneras, porque ninguna
 * sirve sola:
 *  - `pageshow`: la pestaña vuelve del caché de ida y vuelta (el botón "atrás").
 *    Es el caso que reportó la gente y el único que no dispara una carga nueva.
 *  - `visibilitychange`: se vuelve a la pestaña después de haberla dejado.
 *    Escuchado en `window` porque burbujea desde `document`, así que un solo
 *    lugar alcanza para los tres.
 *  - `focus`: se vuelve a la ventana sin que la pestaña se haya ocultado nunca,
 *    que es lo que pasa cuando el proveedor abre una ventana aparte encima.
 *
 * Ninguno puede dispararse solo por tocar el botón: al hacer clic la ventana ya
 * estaba visible y enfocada, y el `focus` de un campo no burbujea hasta acá.
 */

export type FuenteDeEventos = {
	addEventListener(tipo: string, escucha: () => void): void;
	removeEventListener(tipo: string, escucha: () => void): void;
};

export const EVENTOS_DE_VUELTA = ['pageshow', 'visibilitychange', 'focus'];

export function escucharVueltaALaPantalla(alVolver: () => void, ventana: FuenteDeEventos) {
	// Los tres eventos suelen llegar juntos —volver del caché de ida y vuelta
	// dispara los tres seguidos— y avisar tres veces lo mismo era pedirle a React
	// tres renders para dejar el botón como ya estaba.
	let yaSolto = false;
	const soltar = () => {
		if (yaSolto) return;
		yaSolto = true;
		alVolver();
	};
	for (const evento of EVENTOS_DE_VUELTA) ventana.addEventListener(evento, soltar);
	return () => {
		for (const evento of EVENTOS_DE_VUELTA) ventana.removeEventListener(evento, soltar);
	};
}
