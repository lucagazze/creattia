import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DependencyList } from 'react';

/**
 * El escalonado del masonry, sin perder el orden por filas.
 *
 * Con columnas CSS (`column-count`) el navegador llena una columna entera antes
 * de pasar a la siguiente: la segunda tarjeta caía DEBAJO de la primera y no al
 * lado, así que el recorrido bajaba en vertical —1 4 7 / 2 5 8 / 3 6 9— que es
 * exactamente al revés de como se mira una grilla y de cómo tienen que aparecer
 * las novedades.
 *
 * Y arrastraba un segundo problema, menos evidente: la prioridad de carga se
 * decide por la posición en la lista, así que las primeras tarjetas —las únicas
 * que se piden con `eager`— terminaban todas apiladas en la columna izquierda,
 * casi siempre debajo del pliegue, mientras las que sí se veían arriba quedaban
 * en `lazy`. Se veía como que "sigue cargando la primera columna". Al volver el
 * orden del DOM a coincidir con el orden visual eso se arregla solo.
 *
 * Acá es una grilla de verdad: las filas se completan de izquierda a derecha y
 * recién ahí se baja. El efecto escalonado se conserva dando a cada tarjeta un
 * `grid-row-end: span N` calculado con su alto real, sobre filas de 1px. Por eso
 * el `row-gap` de la hoja de estilos es 0: la separación vertical ya está
 * incluida en el span de cada tarjeta.
 *
 * En `dependencias` va lo que cambia el CONJUNTO de tarjetas (cuántas hay, si la
 * grilla está montada). Los cambios de ALTO de una tarjeta ya los cubre el
 * ResizeObserver, no hace falta listarlos.
 */
export function useMasonry(dependencias: DependencyList) {
	const grillaRef = useRef<HTMLDivElement | null>(null);
	const [columnas, setColumnas] = useState(4);

	useEffect(() => {
		const grilla = grillaRef.current;
		if (!grilla) return;
		const recalcular = () => {
			const ancho = grilla.clientWidth;
			// Al abrir un creador la grilla sale del DOM. ResizeObserver puede
			// informar ancho 0 durante ese desmontaje: no convertirlo en 2 columnas.
			if (!grilla.isConnected || ancho <= 0) return;
			// Mínimo 2 columnas siempre, también en celular.
			setColumnas(Math.max(2, Math.min(6, Math.floor(ancho / 300))));
		};
		recalcular();
		const observador = new ResizeObserver(recalcular);
		observador.observe(grilla);
		return () => observador.disconnect();
	}, dependencias);

	// Se mide en `useLayoutEffect` para que el span quede puesto antes de que el
	// navegador pinte: hacerlo en un `useEffect` normal muestra un cuadro con
	// todas las tarjetas de una fila y después salta al alto correcto.
	useLayoutEffect(() => {
		const grilla = grillaRef.current;
		if (!grilla) return;
		let frame = 0;
		const medir = () => {
			frame = 0;
			if (!grilla.isConnected) return;
			const separacion = parseFloat(getComputedStyle(grilla).getPropertyValue('--masonry-gap')) || 16;
			for (const tarjeta of Array.from(grilla.children) as HTMLElement[]) {
				const alto = tarjeta.getBoundingClientRect().height;
				// Alto 0 es una tarjeta que todavía no se dibujó: dejarla sin span
				// hasta la próxima medición es mejor que fijarle una fila de 1px.
				if (alto <= 0) continue;
				tarjeta.style.gridRowEnd = `span ${Math.max(1, Math.ceil(alto + separacion))}`;
			}
		};
		// Las imágenes terminan de decodificar en cualquier momento y cambian el
		// alto de su tarjeta: agrupar las mediciones en un frame evita recalcular
		// la grilla entera una vez por imagen.
		const programar = () => { if (!frame) frame = requestAnimationFrame(medir); };
		programar();
		const observador = new ResizeObserver(programar);
		observador.observe(grilla);
		for (const tarjeta of Array.from(grilla.children)) observador.observe(tarjeta);
		return () => {
			observador.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	}, [...dependencias, columnas]);

	return {
		grillaRef,
		columnas,
		// La cantidad de columnas viaja como estilo inline porque se calcula con el
		// ancho real de la grilla, no con el de la ventana: dentro de la hoja de
		// estilos habría que aproximarla con media queries y volvería a pelearse
		// con los `!important` que ya viven ahí.
		estiloDeGrilla: { gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` } as CSSProperties,
	};
}
